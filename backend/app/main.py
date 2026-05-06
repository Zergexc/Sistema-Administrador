import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session

from . import models
from .config import settings as app_settings
from .database import Base, SessionLocal, engine
from .routes import devices, diagnostics, settings as settings_routes, wol

app = FastAPI(title="TI Diagnostic Panel API", version="0.1.0")
logging.basicConfig(level=app_settings.log_level)
logger = logging.getLogger(__name__)

app.add_middleware(
    CORSMiddleware,
    allow_origins=app_settings.cors_origins_list,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


def seed_data():
    db: Session = SessionLocal()
    try:
        if not db.query(models.Setting).first():
            db.add(models.Setting())
        if not db.query(models.Device).first():
            db.add(
                models.Device(
                    hostname="LAPTOP-DEMO",
                    current_user="demo.user",
                    ip_address="192.168.1.50",
                    os_version="Windows 11 Pro",
                    ram_total_gb=16,
                    ram_free_gb=8,
                    cpu_model="Intel Core i7",
                    disk_c_free_gb=120,
                    mac_address="00:11:22:33:44:55",
                    internet_ok=True,
                    glpi_status="not_found",
                    agent_version="0.1.0",
                )
            )
        db.commit()
    finally:
        db.close()


@app.on_event("startup")
def on_startup():
    Base.metadata.create_all(bind=engine)
    if app_settings.allow_seed_data:
        seed_data()
    logger.info("API iniciada con DB=%s", app_settings.database_url)


app.include_router(devices.router)
app.include_router(diagnostics.router)
app.include_router(wol.router)
app.include_router(settings_routes.router)


@app.get("/")
def root():
    return {"message": "TI Diagnostic Panel API online"}


@app.get("/healthz")
def healthz():
    return {"status": "ok"}
