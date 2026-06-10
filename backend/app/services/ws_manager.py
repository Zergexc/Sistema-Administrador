"""Gestor de conexiones WebSocket con broadcast en memoria (Fase 4).

Para ~10 PCs un broadcast en memoria es suficiente; se puede migrar a Redis
cuando escale. Los handlers de rutas síncronas usan ``broadcast`` (thread-safe),
que agenda el envío en el event loop capturado al iniciar la app.
"""
import asyncio
import logging

from fastapi import WebSocket

logger = logging.getLogger(__name__)


class ConnectionManager:
    def __init__(self) -> None:
        self.active: set[WebSocket] = set()
        self._loop: asyncio.AbstractEventLoop | None = None

    def set_loop(self, loop: asyncio.AbstractEventLoop) -> None:
        """Captura el event loop principal (llamado en el lifespan startup)."""
        self._loop = loop

    async def connect(self, websocket: WebSocket) -> None:
        await websocket.accept()
        self.active.add(websocket)
        logger.debug("WS conectado. Total: %d", len(self.active))

    def disconnect(self, websocket: WebSocket) -> None:
        self.active.discard(websocket)
        logger.debug("WS desconectado. Total: %d", len(self.active))

    async def _broadcast_async(self, message: dict) -> None:
        if not self.active:
            return
        dead: list[WebSocket] = []
        for ws in list(self.active):
            try:
                await ws.send_json(message)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.active.discard(ws)

    def broadcast(self, message: dict) -> None:
        """Envía un mensaje a todos los clientes desde código síncrono o async.

        Seguro para llamar desde handlers síncronos (corren en un threadpool):
        agenda la corrutina en el event loop principal.
        """
        if self._loop is None or not self.active:
            return
        try:
            asyncio.run_coroutine_threadsafe(
                self._broadcast_async(message), self._loop
            )
        except RuntimeError:
            logger.warning("No se pudo agendar el broadcast WS (loop no disponible)")


manager = ConnectionManager()
