from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from .. import models
from ..auth import verify_api_key
from ..database import get_db
from ..services.wol_service import send_magic_packet

router = APIRouter(prefix="/api", tags=["wol"])


@router.post("/devices/{device_id}/wol")
def trigger_wol(
    device_id: int,
    db: Session = Depends(get_db),
    _: None = Depends(verify_api_key),
):
    device = db.query(models.Device).filter(models.Device.id == device_id).first()
    if not device:
        raise HTTPException(status_code=404, detail="Equipo no encontrado")
    if not device.mac_address:
        raise HTTPException(status_code=400, detail="MAC Address no configurada")

    try:
        sent = send_magic_packet(device.mac_address)
    except Exception as exc:
        return {"status": "error", "sent": False, "message": f"Error WOL: {exc}"}

    if not sent:
        return {"status": "invalid_mac", "sent": False, "message": "Formato MAC invalido"}
    return {"status": "sent", "sent": True, "message": "Solicitud WOL enviada"}
