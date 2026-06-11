import io
import json
from collections import Counter
from datetime import timedelta

import qrcode
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response
from sqlalchemy.orm import Session

from .. import models, schemas
from ..auth import get_current_user, require_admin, verify_api_key
from ..database import get_db
from ..models import to_naive, utcnow
from ..services.alert_service import evaluate_alerts
from ..services.ingest_service import ingest_payload
from ..services.task_service import REMOTE_ACTIONS, create_action_task, get_pending_tasks
from ..services.ws_manager import manager

router = APIRouter(prefix="/api", tags=["devices"])


def _device_payload(device: models.Device) -> dict:
    return {
        "id": device.id,
        "hostname": device.hostname,
        "ip_address": device.ip_address,
        "current_user": device.current_user,
        "cpu_percent": device.cpu_percent,
        "last_seen": device.last_seen.isoformat() if device.last_seen else None,
    }


@router.get("/devices", response_model=list[schemas.DeviceOut])
def list_devices(
    db: Session = Depends(get_db), _: models.User = Depends(get_current_user)
):
    return db.query(models.Device).order_by(models.Device.hostname.asc()).all()


@router.get("/devices/{device_id}", response_model=schemas.DeviceDetail)
def get_device(
    device_id: int,
    db: Session = Depends(get_db),
    _: models.User = Depends(get_current_user),
):
    device = db.query(models.Device).filter(models.Device.id == device_id).first()
    if not device:
        raise HTTPException(status_code=404, detail="Equipo no encontrado")

    latest_diag = (
        db.query(models.Diagnostic)
        .filter(models.Diagnostic.device_id == device.id)
        .order_by(models.Diagnostic.created_at.desc())
        .first()
    )
    alerts = (
        db.query(models.Alert)
        .filter(models.Alert.device_id == device.id, models.Alert.is_active.is_(True))
        .order_by(models.Alert.created_at.desc())
        .all()
    )
    history = (
        db.query(models.Diagnostic)
        .filter(models.Diagnostic.device_id == device.id)
        .order_by(models.Diagnostic.created_at.desc())
        .limit(15)
        .all()
    )
    disks = (
        db.query(models.DiskInfo)
        .filter(models.DiskInfo.device_id == device.id)
        .order_by(models.DiskInfo.mount_point.asc())
        .all()
    )

    payload = json.loads(latest_diag.result_json) if latest_diag else {}
    return schemas.DeviceDetail(
        device=device,
        latest_payload=payload,
        active_alerts=[
            {
                "id": a.id,
                "code": a.code,
                "message": a.message,
                "severity": a.severity,
                "created_at": a.created_at,
            }
            for a in alerts
        ],
        diagnostics_history=[
            {
                "id": d.id,
                "summary": d.summary,
                "alerts_detected": d.alerts_detected,
                "created_at": d.created_at,
            }
            for d in history
        ],
        disks=[
            {
                "mount_point": d.mount_point,
                "total_gb": d.total_gb,
                "free_gb": d.free_gb,
                "percent_used": d.percent_used,
            }
            for d in disks
        ],
    )


@router.post("/devices/register", response_model=schemas.DeviceOut)
def register_device(
    payload: schemas.DeviceRegister,
    db: Session = Depends(get_db),
    _: None = Depends(verify_api_key),
):
    device = db.query(models.Device).filter(models.Device.hostname == payload.hostname).first()
    is_new = device is None
    if not device:
        device = models.Device(hostname=payload.hostname)
        db.add(device)
        db.flush()

    data = payload.model_dump()
    ingest_payload(db, device, data, snapshot=False)
    db.commit()
    db.refresh(device)

    settings = db.query(models.Setting).first()
    if settings:
        evaluate_alerts(db, device, settings)

    if is_new:
        manager.broadcast({"type": "device_registered", "device": _device_payload(device)})
    manager.broadcast({"type": "device_update", "device": _device_payload(device)})
    return device


@router.post("/devices/{device_id}/heartbeat")
def heartbeat(
    device_id: int,
    payload: schemas.DeviceRegister,
    db: Session = Depends(get_db),
    _: None = Depends(verify_api_key),
):
    device = db.query(models.Device).filter(models.Device.id == device_id).first()
    if not device:
        raise HTTPException(status_code=404, detail="Equipo no encontrado")

    ingest_payload(db, device, payload.model_dump(), snapshot=False)
    db.commit()
    db.refresh(device)

    settings = db.query(models.Setting).first()
    active_alerts = evaluate_alerts(db, device, settings) if settings else []
    tasks = get_pending_tasks(db, device_id)
    manager.broadcast({"type": "device_update", "device": _device_payload(device)})
    return {
        "status": "ok",
        "alerts": active_alerts,
        "pending_tasks": [schemas.TaskOut.model_validate(t).model_dump() for t in tasks],
    }


@router.post("/devices/{device_id}/actions", response_model=schemas.TaskOut)
def queue_remote_action(
    device_id: int,
    payload: schemas.ActionRequest,
    db: Session = Depends(get_db),
    user: models.User = Depends(require_admin),
):
    """Encola una acción remota para el agente (reiniciar, apagar, etc.)."""
    device = db.query(models.Device).filter(models.Device.id == device_id).first()
    if not device:
        raise HTTPException(status_code=404, detail="Equipo no encontrado")
    if payload.action not in REMOTE_ACTIONS:
        raise HTTPException(status_code=400, detail=f"Acción no soportada: {payload.action}")
    if payload.action == "message" and not (payload.message or "").strip():
        raise HTTPException(status_code=400, detail="El mensaje no puede estar vacío")
    delay = max(0, min(payload.delay_seconds, 3600))
    task = create_action_task(
        db,
        device_id,
        payload.action,
        message=payload.message,
        delay_seconds=delay,
        requested_by=user.username,
    )
    return task


@router.get("/devices/{device_id}/actions", response_model=list[schemas.TaskOut])
def list_device_actions(
    device_id: int,
    db: Session = Depends(get_db),
    _: models.User = Depends(get_current_user),
):
    """Últimas tareas/acciones del equipo (para ver si se ejecutaron)."""
    return (
        db.query(models.Task)
        .filter(models.Task.device_id == device_id)
        .order_by(models.Task.created_at.desc())
        .limit(20)
        .all()
    )


@router.get("/devices/{device_id}/tasks")
def poll_device_tasks(
    device_id: int,
    db: Session = Depends(get_db),
    _: None = Depends(verify_api_key),
):
    """Polling ligero del agente: tareas pendientes sin reenviar métricas."""
    tasks = get_pending_tasks(db, device_id)
    return {
        "pending_tasks": [schemas.TaskOut.model_validate(t).model_dump(mode="json") for t in tasks]
    }


@router.get("/devices/{device_id}/changes", response_model=list[schemas.ChangeEventOut])
def list_device_changes(
    device_id: int,
    db: Session = Depends(get_db),
    _: models.User = Depends(get_current_user),
):
    """Cambios de hardware/software detectados en un equipo."""
    return (
        db.query(models.ChangeEvent)
        .filter(models.ChangeEvent.device_id == device_id)
        .order_by(models.ChangeEvent.created_at.desc())
        .limit(200)
        .all()
    )


@router.get("/changes", response_model=list[schemas.ChangeEventOut])
def list_recent_changes(
    db: Session = Depends(get_db),
    _: models.User = Depends(get_current_user),
):
    """Cambios recientes en toda la oficina (widget del dashboard)."""
    return (
        db.query(models.ChangeEvent)
        .order_by(models.ChangeEvent.created_at.desc())
        .limit(50)
        .all()
    )


@router.put("/devices/{device_id}/thresholds", response_model=schemas.DeviceOut)
def update_thresholds(
    device_id: int,
    payload: schemas.DeviceThresholdUpdate,
    db: Session = Depends(get_db),
    _: models.User = Depends(require_admin),
):
    """Configura umbrales de alerta individuales por equipo (Fase 8)."""
    device = db.query(models.Device).filter(models.Device.id == device_id).first()
    if not device:
        raise HTTPException(status_code=404, detail="Equipo no encontrado")
    device.alert_disk_min_free_gb = payload.alert_disk_min_free_gb
    device.alert_ram_min_free_gb = payload.alert_ram_min_free_gb
    db.commit()
    db.refresh(device)
    settings = db.query(models.Setting).first()
    if settings:
        evaluate_alerts(db, device, settings)
    return device


@router.get("/dashboard")
def dashboard_metrics(
    db: Session = Depends(get_db), _: models.User = Depends(get_current_user)
):
    settings = db.query(models.Setting).first()
    offline_minutes = settings.offline_after_minutes if settings else 5
    threshold = to_naive(utcnow()) - timedelta(minutes=offline_minutes)

    devices = db.query(models.Device).all()
    total = len(devices)
    online_ids = {
        d.id for d in devices if d.last_seen and to_naive(d.last_seen) >= threshold
    }
    online = len(online_ids)
    offline = total - online

    active_alerts = (
        db.query(models.Alert).filter(models.Alert.is_active.is_(True)).all()
    )
    devices_with_alerts = len({a.device_id for a in active_alerts})
    crit_devices = {a.device_id for a in active_alerts if a.severity == "critical"}
    warn_devices = {a.device_id for a in active_alerts if a.severity != "critical"}

    # Mapa de calor: estado por equipo.
    grid = []
    for d in devices:
        if d.id not in online_ids:
            state = "offline"
        elif d.id in crit_devices:
            state = "critical"
        elif d.id in warn_devices:
            state = "warning"
        else:
            state = "ok"
        grid.append(
            {
                "id": d.id,
                "hostname": d.hostname,
                "state": state,
                "cpu_percent": d.cpu_percent,
            }
        )

    # Distribución de SO.
    os_dist = Counter((d.os_version or "Desconocido") for d in devices)

    # Top consumo RAM / CPU (solo equipos online).
    def ram_used_pct(d: models.Device) -> float:
        if d.ram_total_gb and d.ram_free_gb is not None and d.ram_total_gb > 0:
            return round((d.ram_total_gb - d.ram_free_gb) / d.ram_total_gb * 100, 1)
        return 0.0

    online_devices = [d for d in devices if d.id in online_ids]
    top_ram = sorted(online_devices, key=ram_used_pct, reverse=True)[:5]
    top_cpu = sorted(
        online_devices, key=lambda d: d.cpu_percent or 0, reverse=True
    )[:5]

    # Resumen de disco de toda la oficina.
    disk_total = sum(d.disk_total_gb or 0 for d in devices)
    disk_free = sum(
        (d.disk_total_gb or 0) * (1 - (d.disk_used_percent or 0) / 100) for d in devices
    )

    recent_diag = (
        db.query(models.Diagnostic)
        .order_by(models.Diagnostic.created_at.desc())
        .limit(8)
        .all()
    )
    recent_alerts = (
        db.query(models.Alert)
        .filter(models.Alert.is_active.is_(True))
        .order_by(models.Alert.created_at.desc())
        .limit(8)
        .all()
    )
    no_internet = sum(1 for d in online_devices if not d.internet_ok)

    return {
        "total_devices": total,
        "online_devices": online,
        "offline_devices": offline,
        "devices_with_alerts": devices_with_alerts,
        "network_health": "OK" if offline == 0 and devices_with_alerts == 0 else "Atencion requerida",
        "devices_without_internet": no_internet,
        "grid": grid,
        "os_distribution": [{"name": k, "value": v} for k, v in os_dist.most_common()],
        "top_ram": [
            {"id": d.id, "hostname": d.hostname, "value": ram_used_pct(d)}
            for d in top_ram
        ],
        "top_cpu": [
            {"id": d.id, "hostname": d.hostname, "value": d.cpu_percent or 0}
            for d in top_cpu
        ],
        "disk_summary": {
            "total_gb": round(disk_total, 1),
            "free_gb": round(disk_free, 1),
            "used_gb": round(disk_total - disk_free, 1),
        },
        "latest_diagnostics": [
            {"id": d.id, "device_id": d.device_id, "summary": d.summary, "created_at": d.created_at}
            for d in recent_diag
        ],
        "recent_alerts": [
            {
                "id": a.id,
                "device_id": a.device_id,
                "code": a.code,
                "message": a.message,
                "severity": a.severity,
                "created_at": a.created_at,
            }
            for a in recent_alerts
        ],
    }


@router.get("/devices/{device_id}/qr")
def device_qr(
    device_id: int,
    base: str = Query(default="", max_length=200),
    db: Session = Depends(get_db),
    _: models.User = Depends(get_current_user),
):
    """PNG con el QR de la ficha del equipo (para etiquetas imprimibles)."""
    device = db.query(models.Device).filter(models.Device.id == device_id).first()
    if not device:
        raise HTTPException(status_code=404, detail="Equipo no encontrado")

    url = f"{base.rstrip('/')}/devices/{device_id}" if base else f"/devices/{device_id}"
    qr = qrcode.QRCode(border=1, box_size=8)
    qr.add_data(url)
    qr.make(fit=True)
    img = qr.make_image(fill_color="black", back_color="white")
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return Response(content=buf.getvalue(), media_type="image/png")
