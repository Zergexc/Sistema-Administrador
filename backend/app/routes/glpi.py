from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from .. import models
from ..auth import require_admin
from ..database import get_db
from ..services.glpi_service import sync_from_glpi, test_glpi_connection

router = APIRouter(prefix="/api", tags=["glpi"])

class GLPITestPayload(BaseModel):
    glpi_url: str
    glpi_app_token: str | None = None
    glpi_user_token: str | None = None
    glpi_username: str | None = None
    glpi_password: str | None = None

@router.get("/glpi/status")
def get_glpi_status(db: Session = Depends(get_db), _: models.User = Depends(require_admin)):
    settings = db.query(models.Setting).first()
    if not settings or not settings.glpi_url:
        return {"status": "error", "message": "GLPI no está configurado."}
    return test_glpi_connection(settings)

@router.post("/glpi/test")
def test_glpi_connection_endpoint(
    payload: GLPITestPayload,
    _: models.User = Depends(require_admin)
):
    temp_settings = models.Setting(
        glpi_url=payload.glpi_url,
        glpi_app_token=payload.glpi_app_token,
        glpi_user_token=payload.glpi_user_token,
        glpi_username=payload.glpi_username,
        glpi_password=payload.glpi_password
    )
    return test_glpi_connection(temp_settings)

@router.post("/glpi/sync")
def sync_glpi_endpoint(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_admin)
):
    try:
        result = sync_from_glpi(db, changed_by=current_user.username)
        return {"status": "success", "result": result}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
