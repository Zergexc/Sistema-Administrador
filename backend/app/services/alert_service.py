from datetime import timedelta

from sqlalchemy.orm import Session

from .. import models
from ..models import utcnow
from .notification_service import notify_alert
from .ws_manager import manager


def _alert_payload(alert: models.Alert) -> dict:
    return {
        "id": alert.id,
        "device_id": alert.device_id,
        "code": alert.code,
        "message": alert.message,
        "severity": alert.severity,
        "is_active": alert.is_active,
    }


def _detect(device: models.Device, settings: models.Setting) -> list[tuple[str, str, str]]:
    """Devuelve [(code, message, severity)] según el estado del equipo."""
    messages: list[tuple[str, str, str]] = []

    # Umbral de disco: individual del equipo o global.
    disk_min = device.alert_disk_min_free_gb or settings.disk_min_free_gb
    if device.disk_c_free_gb is not None and device.disk_c_free_gb < disk_min:
        severity = "critical" if device.disk_c_free_gb < disk_min / 2 else "warning"
        messages.append(
            ("LOW_DISK", f"Disco C bajo: {device.disk_c_free_gb:.1f} GB libres", severity)
        )

    # Umbral de RAM: individual del equipo o default (1.5 GB).
    ram_min = device.alert_ram_min_free_gb or 1.5
    if device.ram_free_gb is not None and device.ram_free_gb < ram_min:
        messages.append(
            ("LOW_RAM", f"RAM libre baja: {device.ram_free_gb:.1f} GB", "warning")
        )

    if not device.internet_ok:
        messages.append(("NO_INTERNET", "Sin conectividad a internet", "critical"))

    if (device.glpi_status or "").lower() not in {"running", "ok"}:
        messages.append(("GLPI_ISSUE", "GLPI Agent detenido o no encontrado", "warning"))

    return messages


def evaluate_alerts(db: Session, device: models.Device, settings: models.Setting) -> list[str]:
    detected = _detect(device, settings)
    active_codes = {code for code, _, _ in detected}

    for code, message, severity in detected:
        exists = (
            db.query(models.Alert)
            .filter(
                models.Alert.device_id == device.id,
                models.Alert.code == code,
                models.Alert.is_active.is_(True),
            )
            .first()
        )
        if not exists:
            alert = models.Alert(
                device_id=device.id, code=code, message=message, severity=severity
            )
            db.add(alert)
            db.flush()  # asigna id
            manager.broadcast({"type": "alert_created", "alert": _alert_payload(alert)})
            if severity == "critical":
                notify_alert(settings, device.hostname, code, message)

    # Resuelve automáticamente las alertas que ya no aplican.
    stale_alerts = (
        db.query(models.Alert)
        .filter(models.Alert.device_id == device.id, models.Alert.is_active.is_(True))
        .all()
    )
    for alert in stale_alerts:
        if alert.code not in active_codes:
            alert.is_active = False
            alert.resolved_at = utcnow()
            alert.resolved_by = "auto"
            manager.broadcast(
                {"type": "alert_resolved", "alert": _alert_payload(alert)}
            )

    db.commit()
    return [message for _, message, _ in detected]


def resolve_alert(
    db: Session, alert_id: int, resolved_by: str, note: str | None = None
) -> models.Alert | None:
    """Marca una alerta como resuelta manualmente (Fase 8)."""
    alert = db.query(models.Alert).filter(models.Alert.id == alert_id).first()
    if not alert:
        return None
    alert.is_active = False
    alert.resolved_at = utcnow()
    alert.resolved_by = resolved_by
    alert.resolution_note = note
    db.commit()
    db.refresh(alert)
    manager.broadcast({"type": "alert_resolved", "alert": _alert_payload(alert)})
    return alert


def flag_offline_devices(db: Session, settings: models.Setting) -> int:
    limit = utcnow() - timedelta(minutes=settings.offline_after_minutes)
    devices = db.query(models.Device).filter(models.Device.last_seen < limit).all()
    created = 0
    for device in devices:
        exists = (
            db.query(models.Alert)
            .filter(
                models.Alert.device_id == device.id,
                models.Alert.code == "OFFLINE",
                models.Alert.is_active.is_(True),
            )
            .first()
        )
        if not exists:
            alert = models.Alert(
                device_id=device.id,
                code="OFFLINE",
                message=f"Equipo sin reporte reciente: {device.hostname}",
                severity="critical",
            )
            db.add(alert)
            db.flush()
            manager.broadcast({"type": "alert_created", "alert": _alert_payload(alert)})
            notify_alert(settings, device.hostname, "OFFLINE", alert.message)
            created += 1
    db.commit()
    return created
