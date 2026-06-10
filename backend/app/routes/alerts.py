from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from .. import models, schemas
from ..auth import get_current_user, require_admin
from ..database import get_db
from ..services.alert_service import resolve_alert

router = APIRouter(prefix="/api", tags=["alerts"])


@router.get("/alerts", response_model=list[schemas.AlertOut])
def list_alerts(
    active: bool | None = Query(default=None),
    device_id: int | None = Query(default=None),
    db: Session = Depends(get_db),
    _: models.User = Depends(get_current_user),
):
    query = db.query(models.Alert)
    if active is not None:
        query = query.filter(models.Alert.is_active.is_(active))
    if device_id is not None:
        query = query.filter(models.Alert.device_id == device_id)
    return query.order_by(models.Alert.created_at.desc()).limit(300).all()


@router.post("/alerts/{alert_id}/resolve", response_model=schemas.AlertOut)
def resolve(
    alert_id: int,
    payload: schemas.AlertResolve | None = None,
    db: Session = Depends(get_db),
    current: models.User = Depends(require_admin),
):
    note = payload.note if payload else None
    alert = resolve_alert(db, alert_id, resolved_by=current.username, note=note)
    if not alert:
        raise HTTPException(status_code=404, detail="Alerta no encontrada")
    return alert
