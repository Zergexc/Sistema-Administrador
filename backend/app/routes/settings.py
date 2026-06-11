from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from .. import models, schemas
from ..auth import get_current_user, require_admin
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
def read_settings(
    db: Session = Depends(get_db), _: models.User = Depends(get_current_user)
):
    settings = get_or_create_settings(db)
    flag_offline_devices(db, settings)
    return settings


@router.put("/settings", response_model=schemas.SettingsOut)
def update_settings(
    payload: schemas.SettingsUpdate,
    db: Session = Depends(get_db),
    _: models.User = Depends(require_admin),
):
    settings = get_or_create_settings(db)
    settings.report_interval_seconds = payload.report_interval_seconds
    settings.disk_min_free_gb = payload.disk_min_free_gb
    settings.offline_after_minutes = payload.offline_after_minutes
    settings.ui_theme = payload.ui_theme

    # Notificaciones (Fase 8)
    settings.notifications_enabled = payload.notifications_enabled
    settings.smtp_host = payload.smtp_host
    settings.smtp_port = payload.smtp_port
    settings.smtp_user = payload.smtp_user
    settings.smtp_use_tls = payload.smtp_use_tls
    settings.smtp_from = payload.smtp_from
    settings.alert_email_to = payload.alert_email_to
    settings.webhook_url = payload.webhook_url
    # Solo actualiza la contraseña SMTP si se envía un valor no vacío.
    if payload.smtp_password:
        settings.smtp_password = payload.smtp_password

    # Integración GLPI
    settings.glpi_enabled = payload.glpi_enabled
    settings.glpi_url = payload.glpi_url
    settings.glpi_app_token = payload.glpi_app_token
    settings.glpi_user_token = payload.glpi_user_token
    settings.glpi_username = payload.glpi_username
    if payload.glpi_password:
        settings.glpi_password = payload.glpi_password

    db.commit()
    db.refresh(settings)
    return settings
