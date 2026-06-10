from fastapi import APIRouter, Query, WebSocket, WebSocketDisconnect

from ..auth import decode_access_token
from ..services.ws_manager import manager

router = APIRouter(tags=["ws"])


@router.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket, token: str | None = Query(default=None)):
    """Canal de actualizaciones en tiempo real (Fase 4).

    El token JWT se pasa como query param (?token=...). En modo local sin
    secreto configurado igual se acepta; con token presente se valida.
    """
    if token:
        payload = decode_access_token(token)
        if not payload:
            await websocket.close(code=1008)
            return

    await manager.connect(websocket)
    try:
        await websocket.send_json({"type": "connected"})
        while True:
            # Mantiene viva la conexión; el cliente puede enviar pings.
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket)
    except Exception:
        manager.disconnect(websocket)
