import json
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from .. import models, schemas
from ..auth import verify_api_key
from ..database import get_db
from ..services.alert_service import evaluate_alerts
from ..services.task_service import complete_task, create_diagnostic_task

router = APIRouter(prefix="/api", tags=["diagnostics"])


@router.get("/diagnostics", response_model=list[schemas.DiagnosticOut])
def list_diagnostics(db: Session = Depends(get_db)):
    return db.query(models.Diagnostic).order_by(models.Diagnostic.created_at.desc()).limit(200).all()


@router.get("/devices/{device_id}/diagnostics", response_model=list[schemas.DiagnosticOut])
def list_device_diagnostics(device_id: int, db: Session = Depends(get_db)):
    return (
        db.query(models.Diagnostic)
        .filter(models.Diagnostic.device_id == device_id)
        .order_by(models.Diagnostic.created_at.desc())
        .all()
    )


@router.post("/diagnostics/report")
def receive_diagnostic(
    report: schemas.DiagnosticReport,
    db: Session = Depends(get_db),
    _: None = Depends(verify_api_key),
):
    device = db.query(models.Device).filter(models.Device.hostname == report.hostname).first()
    if not device:
        raise HTTPException(status_code=404, detail="Equipo no registrado")

    payload = report.payload
    device.current_user = payload.get("current_user")
    device.ip_address = payload.get("ip_address")
    device.os_version = payload.get("os_version")
    device.ram_total_gb = payload.get("ram_total_gb")
    device.ram_free_gb = payload.get("ram_free_gb")
    device.cpu_model = payload.get("cpu_model")
    device.disk_c_free_gb = payload.get("disk_c_free_gb")
    device.uptime_seconds = payload.get("uptime_seconds")
    device.internet_ok = payload.get("internet_ok", True)
    device.glpi_status = payload.get("glpi_status")
    device.mac_address = payload.get("mac_address")
    device.last_seen = datetime.utcnow()

    diagnostic = models.Diagnostic(
        device_id=device.id,
        summary=report.summary,
        alerts_detected=", ".join(report.alerts_detected) if report.alerts_detected else "",
        result_json=json.dumps(payload),
    )
    db.add(diagnostic)
    db.commit()
    db.refresh(diagnostic)
    db.refresh(device)

    settings = db.query(models.Setting).first()
    alerts = evaluate_alerts(db, device, settings) if settings else []
    return {
        "status": "stored",
        "diagnostic_id": diagnostic.id,
        "alerts": alerts,
    }


@router.post("/devices/{device_id}/request-diagnostic")
def request_diagnostic(
    device_id: int,
    db: Session = Depends(get_db),
    _: None = Depends(verify_api_key),
):
    device = db.query(models.Device).filter(models.Device.id == device_id).first()
    if not device:
        raise HTTPException(status_code=404, detail="Equipo no encontrado")
    task = create_diagnostic_task(db, device_id)
    return {"message": "Solicitud creada", "task_id": task.id, "status": task.status}


@router.post("/tasks/{task_id}/complete")
def mark_task_done(
    task_id: int,
    result: dict,
    db: Session = Depends(get_db),
    _: None = Depends(verify_api_key),
):
    task = complete_task(db, task_id, json.dumps(result))
    if not task:
        raise HTTPException(status_code=404, detail="Tarea no encontrada")
    return {"status": "done", "task_id": task.id}
