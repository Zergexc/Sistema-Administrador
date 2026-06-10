import asyncio
import logging
from contextlib import asynccontextmanager

from apscheduler.schedulers.background import BackgroundScheduler
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import settings as app_settings
from .database import SessionLocal
from .routes import alerts, auth, devices, diagnostics, inventory
from .routes import settings as settings_routes
from .routes import wol, ws
from .services import maintenance
from .services.ws_manager import manager

logging.basicConfig(level=app_settings.log_level)
logger = logging.getLogger(__name__)

scheduler: BackgroundScheduler | None = None


def _seed() -> None:
    db = SessionLocal()
    try:
        maintenance.seed_settings(db)
        maintenance.seed_admin(db)
        maintenance.seed_inventory_categories(db)
    finally:
        db.close()


def _run_snapshot_cleanup() -> None:
    db = SessionLocal()
    try:
        maintenance.cleanup_old_snapshots(db, app_settings.snapshot_retention_days)
    finally:
        db.close()


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Captura el event loop para que el broadcast WS funcione desde rutas síncronas.
    manager.set_loop(asyncio.get_running_loop())

    if app_settings.allow_seed_data:
        try:
            _seed()
        except Exception as exc:  # noqa: BLE001
            logger.warning(
                "No se pudo hacer seed (¿ejecutaste 'alembic upgrade head'?): %s", exc
            )

    global scheduler
    scheduler = BackgroundScheduler(daemon=True)
    scheduler.add_job(_run_snapshot_cleanup, "interval", hours=24, id="snapshot_cleanup")
    scheduler.start()
    logger.info("API iniciada con DB=%s", app_settings.database_url)

    yield

    if scheduler:
        scheduler.shutdown(wait=False)


app = FastAPI(title="TI Diagnostic Panel API", version="0.2.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=app_settings.cors_origins_list,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(auth.users_router)
app.include_router(devices.router)
app.include_router(diagnostics.router)
app.include_router(alerts.router)
app.include_router(wol.router)
app.include_router(settings_routes.router)
app.include_router(inventory.router)
app.include_router(ws.router)


@app.get("/")
def root():
    return {"message": "TI Diagnostic Panel API online"}


@app.get("/healthz")
def healthz():
    return {"status": "ok"}
