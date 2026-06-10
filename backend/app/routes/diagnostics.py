import json
from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from .. import models, schemas
from ..auth import get_current_user, require_admin, verify_api_key
from ..database import get_db
from ..models import utcnow
from ..services.alert_service import evaluate_alerts
from ..services.ingest_service import ingest_payload
from ..services.task_service import complete_task, create_diagnostic_task
from ..services.ws_manager import manager

router = APIRouter(prefix="/api", tags=["diagnostics"])

_RANGE_MAP = {"24h": timedelta(hours=24), "7d": timedelta(days=7), "30d": timedelta(days=30)}


@router.get("/diagnostics", response_model=list[schemas.DiagnosticOut])
def list_diagnostics(
    db: Session = Depends(get_db), _: models.User = Depends(get_current_user)
):
    return db.query(models.Diagnostic).order_by(models.Diagnostic.created_at.desc()).limit(200).all()


@router.get("/devices/{device_id}/diagnostics", response_model=list[schemas.DiagnosticOut])
def list_device_diagnostics(
    device_id: int,
    db: Session = Depends(get_db),
    _: models.User = Depends(get_current_user),
):
    return (
        db.query(models.Diagnostic)
        .filter(models.Diagnostic.device_id == device_id)
        .order_by(models.Diagnostic.created_at.desc())
        .all()
    )


@router.get("/devices/{device_id}/snapshots", response_model=list[schemas.SnapshotOut])
def list_snapshots(
    device_id: int,
    range: str = Query(default="24h"),
    db: Session = Depends(get_db),
    _: models.User = Depends(get_current_user),
):
    """Historial de métricas para gráficas (Fase 5)."""
    window = _RANGE_MAP.get(range, _RANGE_MAP["24h"])
    since = utcnow() - window
    return (
        db.query(models.DeviceSnapshot)
        .filter(
            models.DeviceSnapshot.device_id == device_id,
            models.DeviceSnapshot.timestamp >= since,
        )
        .order_by(models.DeviceSnapshot.timestamp.asc())
        .all()
    )


@router.get("/devices/{device_id}/programs", response_model=list[schemas.ProgramOut])
def list_programs(
    device_id: int,
    db: Session = Depends(get_db),
    _: models.User = Depends(get_current_user),
):
    """Software instalado en un equipo (Fase 5)."""
    return (
        db.query(models.InstalledProgram)
        .filter(models.InstalledProgram.device_id == device_id)
        .order_by(models.InstalledProgram.name.asc())
        .all()
    )


@router.get("/devices/{device_id}/power-events", response_model=list[schemas.PowerEventOut])
def list_power_events(
    device_id: int,
    db: Session = Depends(get_db),
    _: models.User = Depends(get_current_user),
):
    """Historial de encendido/apagado/suspensión (Fase 5)."""
    return (
        db.query(models.PowerEvent)
        .filter(models.PowerEvent.device_id == device_id)
        .order_by(models.PowerEvent.timestamp.desc())
        .limit(200)
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
    # Procesa todas las métricas extendidas + crea snapshot temporal.
    ingest_payload(db, device, payload, snapshot=True)

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
    manager.broadcast(
        {
            "type": "diagnostic_new",
            "diagnostic": {
                "id": diagnostic.id,
                "device_id": device.id,
                "summary": diagnostic.summary,
            },
        }
    )
    manager.broadcast(
        {
            "type": "device_update",
            "device": {"id": device.id, "hostname": device.hostname},
        }
    )
    return {"status": "stored", "diagnostic_id": diagnostic.id, "alerts": alerts}


@router.post("/devices/{device_id}/request-diagnostic")
def request_diagnostic(
    device_id: int,
    db: Session = Depends(get_db),
    _: models.User = Depends(require_admin),
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
