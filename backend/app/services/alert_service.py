from datetime import datetime, timedelta

from sqlalchemy.orm import Session

from .. import models


def evaluate_alerts(db: Session, device: models.Device, settings: models.Setting) -> list[str]:
    messages: list[tuple[str, str]] = []

    if device.disk_c_free_gb is not None and device.disk_c_free_gb < settings.disk_min_free_gb:
        messages.append(("LOW_DISK", f"Disco C bajo: {device.disk_c_free_gb:.1f} GB libres"))
    if device.ram_free_gb is not None and device.ram_free_gb < 1.5:
        messages.append(("LOW_RAM", f"RAM libre baja: {device.ram_free_gb:.1f} GB"))
    if not device.internet_ok:
        messages.append(("NO_INTERNET", "Sin conectividad a internet"))
    if (device.glpi_status or "").lower() not in {"running", "ok"}:
        messages.append(("GLPI_ISSUE", "GLPI Agent detenido o no encontrado"))

    for code, message in messages:
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
            db.add(models.Alert(device_id=device.id, code=code, message=message, severity="warning"))

    active_codes = {code for code, _ in messages}
    stale_alerts = (
        db.query(models.Alert)
        .filter(models.Alert.device_id == device.id, models.Alert.is_active.is_(True))
        .all()
    )
    for alert in stale_alerts:
        if alert.code not in active_codes:
            alert.is_active = False

    db.commit()
    return [message for _, message in messages]


def flag_offline_devices(db: Session, settings: models.Setting) -> int:
    limit = datetime.utcnow() - timedelta(minutes=settings.offline_after_minutes)
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
            db.add(
                models.Alert(
                    device_id=device.id,
                    code="OFFLINE",
                    message=f"Equipo sin reporte reciente: {device.hostname}",
                    severity="critical",
                )
            )
            created += 1
    db.commit()
    return created
