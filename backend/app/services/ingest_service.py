"""Aplica el payload del agente al equipo y almacena métricas extendidas (Fase 5)."""
from datetime import datetime

from sqlalchemy.orm import Session

from .. import models
from ..models import utcnow

# Campos escalares que el agente puede reportar y se guardan en Device.
SCALAR_FIELDS = (
    "current_user",
    "ip_address",
    "os_version",
    "ram_total_gb",
    "ram_free_gb",
    "cpu_model",
    "disk_c_free_gb",
    "mac_address",
    "uptime_seconds",
    "internet_ok",
    "glpi_status",
    "agent_version",
    "cpu_percent",
    "cpu_cores",
    "cpu_freq_mhz",
    "disk_total_gb",
    "disk_used_percent",
)


def _parse_timestamp(value) -> datetime | None:
    if not value:
        return None
    if isinstance(value, datetime):
        return value
    try:
        # Soporta ISO 8601 ("2025-01-15T08:30:00" o con zona).
        return datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except ValueError:
        return None


def apply_scalar_fields(device: models.Device, payload: dict) -> None:
    """Copia los campos escalares del payload al equipo (ignora hostname)."""
    for field in SCALAR_FIELDS:
        if field in payload and payload[field] is not None:
            setattr(device, field, payload[field])
    device.last_seen = utcnow()


def _add_change(
    db: Session,
    device: models.Device,
    change_type: str,
    details: str,
    old_value: str | None = None,
    new_value: str | None = None,
) -> None:
    db.add(
        models.ChangeEvent(
            device_id=device.id,
            change_type=change_type,
            old_value=old_value[:255] if old_value else None,
            new_value=new_value[:255] if new_value else None,
            details=details[:512],
        )
    )


def detect_hardware_changes(db: Session, device: models.Device, payload: dict) -> None:
    """Compara hardware reportado vs. el guardado y registra cambios.

    Debe llamarse ANTES de apply_scalar_fields (necesita los valores previos).
    Una baja de RAM genera además una alerta crítica (posible retiro de módulos).
    """
    # RAM total (tolerancia 0.5 GB por redondeos del agente).
    new_ram = payload.get("ram_total_gb")
    old_ram = device.ram_total_gb
    if new_ram is not None and old_ram is not None and abs(new_ram - old_ram) > 0.5:
        _add_change(
            db,
            device,
            "ram_changed",
            f"RAM total cambió de {old_ram:.1f} GB a {new_ram:.1f} GB",
            old_value=f"{old_ram:.1f} GB",
            new_value=f"{new_ram:.1f} GB",
        )
        if new_ram < old_ram:
            db.add(
                models.Alert(
                    device_id=device.id,
                    code="HARDWARE_CHANGE",
                    message=(
                        f"RAM reducida en {device.hostname}: "
                        f"{old_ram:.1f} GB → {new_ram:.1f} GB"
                    ),
                    severity="critical",
                )
            )

    # Modelo de CPU.
    new_cpu = payload.get("cpu_model")
    old_cpu = device.cpu_model
    if new_cpu and old_cpu and new_cpu.strip() != old_cpu.strip():
        _add_change(
            db,
            device,
            "cpu_changed",
            f"CPU cambió de '{old_cpu}' a '{new_cpu}'",
            old_value=old_cpu,
            new_value=new_cpu,
        )

    # Almacenamiento total (tolerancia 8 GB; un USB conectado/desconectado cuenta).
    new_disk = payload.get("disk_total_gb")
    old_disk = device.disk_total_gb
    if new_disk is not None and old_disk is not None and abs(new_disk - old_disk) > 8:
        verb = "aumentó" if new_disk > old_disk else "se redujo"
        _add_change(
            db,
            device,
            "storage_changed",
            f"Almacenamiento total {verb}: {old_disk:.0f} GB → {new_disk:.0f} GB "
            "(disco agregado/retirado o unidad USB)",
            old_value=f"{old_disk:.0f} GB",
            new_value=f"{new_disk:.0f} GB",
        )


def store_disks(db: Session, device: models.Device, payload: dict) -> None:
    disks = payload.get("disks") or []
    if not disks:
        return
    # Reemplaza el set actual de discos del equipo (simple y suficiente para ~10 PCs).
    db.query(models.DiskInfo).filter(models.DiskInfo.device_id == device.id).delete()
    total_sum = 0.0
    used_pct_values: list[float] = []
    for d in disks:
        mount = d.get("mount") or d.get("mount_point") or "?"
        total = d.get("total_gb")
        free = d.get("free_gb")
        percent = d.get("percent")
        if percent is None and total and free is not None and total > 0:
            percent = round((total - free) / total * 100, 1)
        db.add(
            models.DiskInfo(
                device_id=device.id,
                mount_point=str(mount)[:16],
                total_gb=total,
                free_gb=free,
                percent_used=percent,
                last_updated=utcnow(),
            )
        )
        if total:
            total_sum += total
        if percent is not None:
            used_pct_values.append(percent)

    # Deriva totales agregados si el agente no los envió.
    if device.disk_total_gb is None and total_sum:
        device.disk_total_gb = round(total_sum, 1)
    if device.disk_used_percent is None and used_pct_values:
        device.disk_used_percent = round(sum(used_pct_values) / len(used_pct_values), 1)


def store_programs(db: Session, device: models.Device, payload: dict) -> None:
    programs = payload.get("installed_programs") or []
    if not programs:
        return

    # Estado previo para detectar altas/bajas/actualizaciones de software.
    previous = {
        p.name: (p.version or "")
        for p in db.query(models.InstalledProgram)
        .filter(models.InstalledProgram.device_id == device.id)
        .all()
    }

    db.query(models.InstalledProgram).filter(
        models.InstalledProgram.device_id == device.id
    ).delete()
    seen: set[str] = set()
    current: dict[str, str] = {}
    for p in programs:
        name = (p.get("name") or "").strip()
        if not name:
            continue
        key = f"{name}|{p.get('version') or ''}"
        if key in seen:
            continue
        seen.add(key)
        current[name[:255]] = str(p.get("version") or "")
        db.add(
            models.InstalledProgram(
                device_id=device.id,
                name=name[:255],
                version=(p.get("version") or None),
                publisher=(p.get("publisher") or None),
                last_seen=utcnow(),
            )
        )

    # Solo comparar si había un inventario previo (evita 200 eventos en el
    # primer reporte de un equipo nuevo).
    if not previous:
        return
    for name, version in current.items():
        if name not in previous:
            _add_change(
                db,
                device,
                "program_installed",
                f"Programa instalado: {name}" + (f" {version}" if version else ""),
                new_value=name,
            )
        elif previous[name] != version and version:
            _add_change(
                db,
                device,
                "program_updated",
                f"Programa actualizado: {name} {previous[name] or '?'} → {version}",
                old_value=f"{name} {previous[name]}".strip(),
                new_value=f"{name} {version}",
            )
    for name in previous:
        if name not in current:
            _add_change(
                db,
                device,
                "program_removed",
                f"Programa desinstalado: {name}",
                old_value=name,
            )


def store_power_events(db: Session, device: models.Device, payload: dict) -> None:
    events = payload.get("power_events") or []
    if not events:
        return
    for e in events:
        event_type = (e.get("event") or e.get("event_type") or "").strip()
        ts = _parse_timestamp(e.get("timestamp"))
        if not event_type or ts is None:
            continue
        # Evita duplicados por (tipo, timestamp).
        exists = (
            db.query(models.PowerEvent)
            .filter(
                models.PowerEvent.device_id == device.id,
                models.PowerEvent.event_type == event_type,
                models.PowerEvent.timestamp == ts,
            )
            .first()
        )
        if not exists:
            db.add(
                models.PowerEvent(
                    device_id=device.id, event_type=event_type[:32], timestamp=ts
                )
            )


def store_snapshot(db: Session, device: models.Device) -> None:
    """Guarda un punto temporal de métricas para gráficas."""
    ram_used_pct = None
    if device.ram_total_gb and device.ram_free_gb is not None and device.ram_total_gb > 0:
        ram_used_pct = round(
            (device.ram_total_gb - device.ram_free_gb) / device.ram_total_gb * 100, 1
        )
    db.add(
        models.DeviceSnapshot(
            device_id=device.id,
            cpu_percent=device.cpu_percent,
            ram_used_percent=ram_used_pct,
            disk_used_percent=device.disk_used_percent,
            timestamp=utcnow(),
        )
    )


def ingest_payload(
    db: Session, device: models.Device, payload: dict, snapshot: bool = True
) -> None:
    """Procesa por completo el payload del agente sobre un equipo ya persistido."""
    # Detectar cambios de hardware ANTES de sobrescribir los valores previos.
    detect_hardware_changes(db, device, payload)
    apply_scalar_fields(device, payload)
    store_disks(db, device, payload)
    store_programs(db, device, payload)
    store_power_events(db, device, payload)
    if snapshot:
        store_snapshot(db, device)
