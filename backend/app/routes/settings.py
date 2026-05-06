from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from .. import models, schemas
from ..auth import verify_api_key
from ..database import get_db
from ..services.alert_service import flag_offline_devices

router = APIRouter(prefix="/api", tags=["settings"])


def get_or_create_settings(db: Session) -> models.Setting:
    settings = db.query(models.Setting).first()
    if not settings:
        settings = models.Setting()
        db.add(settings)
        db.commit()
        db.refresh(settings)
    return settings


@router.get("/settings", response_model=schemas.SettingsOut)
def read_settings(db: Session = Depends(get_db)):
    settings = get_or_create_settings(db)
    flag_offline_devices(db, settings)
    return settings


@router.put("/settings", response_model=schemas.SettingsOut)
def update_settings(
    payload: schemas.SettingsUpdate,
    db: Session = Depends(get_db),
    _: None = Depends(verify_api_key),
):
    settings = get_or_create_settings(db)
    settings.report_interval_seconds = payload.report_interval_seconds
    settings.disk_min_free_gb = payload.disk_min_free_gb
    settings.offline_after_minutes = payload.offline_after_minutes
    settings.ui_theme = payload.ui_theme
    db.commit()
    db.refresh(settings)
    return settings
