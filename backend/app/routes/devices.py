import json
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from .. import models, schemas
from ..auth import verify_api_key
from ..database import get_db
from ..services.alert_service import evaluate_alerts
from ..services.task_service import get_pending_tasks

router = APIRouter(prefix="/api", tags=["devices"])


@router.get("/devices", response_model=list[schemas.DeviceOut])
def list_devices(db: Session = Depends(get_db)):
    return db.query(models.Device).order_by(models.Device.hostname.asc()).all()


@router.get("/devices/{device_id}", response_model=schemas.DeviceDetail)
def get_device(device_id: int, db: Session = Depends(get_db)):
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

    payload = json.loads(latest_diag.result_json) if latest_diag else {}
    return schemas.DeviceDetail(
        device=device,
        latest_payload=payload,
        active_alerts=[
            {"code": a.code, "message": a.message, "severity": a.severity, "created_at": a.created_at}
            for a in alerts
        ],
        diagnostics_history=[
            {"id": d.id, "summary": d.summary, "alerts_detected": d.alerts_detected, "created_at": d.created_at}
            for d in history
        ],
    )


@router.post("/devices/register", response_model=schemas.DeviceOut)
def register_device(
    payload: schemas.DeviceRegister,
    db: Session = Depends(get_db),
    _: None = Depends(verify_api_key),
):
    device = db.query(models.Device).filter(models.Device.hostname == payload.hostname).first()
    if not device:
        device = models.Device(hostname=payload.hostname)
        db.add(device)

    for field, value in payload.model_dump().items():
        if hasattr(device, field) and field not in {"hostname"}:
            setattr(device, field, value)
    device.last_seen = datetime.utcnow()
    db.commit()
    db.refresh(device)

    settings = db.query(models.Setting).first()
    if settings:
        evaluate_alerts(db, device, settings)
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

    for field, value in payload.model_dump().items():
        if hasattr(device, field) and field not in {"hostname"}:
            setattr(device, field, value)
    device.last_seen = datetime.utcnow()
    db.commit()
    db.refresh(device)

    settings = db.query(models.Setting).first()
    active_alerts = evaluate_alerts(db, device, settings) if settings else []
    tasks = get_pending_tasks(db, device_id)
    return {
        "status": "ok",
        "alerts": active_alerts,
        "pending_tasks": [schemas.TaskOut.model_validate(t).model_dump() for t in tasks],
    }


@router.get("/dashboard")
def dashboard_metrics(db: Session = Depends(get_db)):
    settings = db.query(models.Setting).first()
    offline_minutes = settings.offline_after_minutes if settings else 5
    threshold = datetime.utcnow() - timedelta(minutes=offline_minutes)

    total = db.query(models.Device).count()
    online = db.query(models.Device).filter(models.Device.last_seen >= threshold).count()
    offline = total - online
    alerts = db.query(models.Alert).filter(models.Alert.is_active.is_(True)).count()
    recent = (
        db.query(models.Diagnostic)
        .order_by(models.Diagnostic.created_at.desc())
        .limit(8)
        .all()
    )

    return {
        "total_devices": total,
        "online_devices": online,
        "offline_devices": offline,
        "devices_with_alerts": alerts,
        "network_health": "Estable" if offline == 0 and alerts == 0 else "Atencion requerida",
        "latest_diagnostics": [
            {"id": d.id, "device_id": d.device_id, "summary": d.summary, "created_at": d.created_at}
            for d in recent
        ],
    }
