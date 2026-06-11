"""Tareas de mantenimiento y seed inicial."""
import json
import logging
from datetime import timedelta

from sqlalchemy.orm import Session

from .. import models
from ..auth import hash_password
from ..config import settings as app_settings
from ..models import utcnow

logger = logging.getLogger(__name__)

DEFAULT_CATEGORIES = [
    {"name": "Computadoras", "icon": "desktop", "description": "Equipos de cómputo"},
    {"name": "Monitores", "icon": "monitor", "description": "Pantallas y monitores"},
    {"name": "Periféricos", "icon": "keyboard", "description": "Teclados, mouse, etc."},
    {"name": "Mobiliario", "icon": "chair", "description": "Sillas, escritorios"},
    {"name": "Redes", "icon": "network", "description": "Switches, routers, APs"},
    {"name": "Correos", "icon": "envelope", "description": "Cuentas de correo electrónico"},
    {"name": "Licencias", "icon": "key", "description": "Licencias de software y claves"},
    {"name": "Software", "icon": "box", "description": "Programas y aplicaciones"},
]


def seed_settings(db: Session) -> None:
    if not db.query(models.Setting).first():
        db.add(models.Setting())
        db.commit()
        logger.info("Configuración inicial creada")


def seed_admin(db: Session) -> None:
    """Crea el usuario admin por defecto si no existe ningún usuario."""
    if db.query(models.User).count() == 0:
        admin = models.User(
            username=app_settings.seed_admin_user,
            full_name="Administrador",
            hashed_password=hash_password(app_settings.seed_admin_password),
            role="admin",
        )
        db.add(admin)
        db.commit()
        logger.info(
            "Usuario admin por defecto creado (usuario=%s). ¡Cambia la contraseña!",
            app_settings.seed_admin_user,
        )


def seed_inventory_categories(db: Session) -> None:
    # Si está vacío, agrega todas
    if db.query(models.InventoryCategory).count() == 0:
        for cat in DEFAULT_CATEGORIES:
            db.add(
                models.InventoryCategory(
                    name=cat["name"],
                    description=cat["description"],
                    icon=cat["icon"],
                    fields_schema=json.dumps([]),
                )
            )
        db.commit()
        logger.info("Categorías de inventario por defecto creadas")
    else:
        # Si ya existen, agregamos las que falten
        existing = {c.name for c in db.query(models.InventoryCategory).all()}
        added = False
        for cat in DEFAULT_CATEGORIES:
            if cat["name"] not in existing:
                db.add(
                    models.InventoryCategory(
                        name=cat["name"],
                        description=cat["description"],
                        icon=cat["icon"],
                        fields_schema=json.dumps([]),
                    )
                )
                added = True
        if added:
            db.commit()
            logger.info("Nuevas categorías de inventario agregadas")


def cleanup_old_snapshots(db: Session, days: int) -> int:
    """Elimina snapshots más viejos que `days` días (Fase 5)."""
    cutoff = utcnow() - timedelta(days=days)
    deleted = (
        db.query(models.DeviceSnapshot)
        .filter(models.DeviceSnapshot.timestamp < cutoff)
        .delete(synchronize_session=False)
    )
    db.commit()
    if deleted:
        logger.info("Snapshots antiguos eliminados: %d", deleted)
    return deleted
