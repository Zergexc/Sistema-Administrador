"""Lógica de inventario: serialización JSON, historial y Excel (Fase 7)."""
import io
import json
from datetime import date, datetime

from openpyxl import Workbook, load_workbook
from sqlalchemy.orm import Session

from .. import models


def _load_json(value: str | None, default):
    if not value:
        return default
    try:
        return json.loads(value)
    except (ValueError, TypeError):
        return default


def category_to_out(category: models.InventoryCategory) -> dict:
    return {
        "id": category.id,
        "name": category.name,
        "description": category.description,
        "icon": category.icon,
        "fields_schema": _load_json(category.fields_schema, []),
        "created_at": category.created_at,
        "item_count": len(category.items),
    }


def item_to_out(item: models.InventoryItem) -> dict:
    return {
        "id": item.id,
        "category_id": item.category_id,
        "category_name": item.category.name if item.category else None,
        "name": item.name,
        "description": item.description,
        "serial_number": item.serial_number,
        "brand": item.brand,
        "model": item.model,
        "status": item.status,
        "location": item.location,
        "assigned_to": item.assigned_to,
        "device_id": item.device_id,
        "purchase_date": item.purchase_date,
        "warranty_until": item.warranty_until,
        "notes": item.notes,
        "custom_fields": _load_json(item.custom_fields, {}),
        "photo_url": item.photo_url,
        "created_at": item.created_at,
        "updated_at": item.updated_at,
    }


def log_history(
    db: Session,
    item_id: int,
    action: str,
    details: str | None,
    changed_by: str | None,
) -> None:
    db.add(
        models.InventoryHistory(
            item_id=item_id, action=action, details=details, changed_by=changed_by
        )
    )


# ---------------------------------------------------------------------------
# Exportar / importar Excel
# ---------------------------------------------------------------------------
EXPORT_COLUMNS = [
    ("id", "ID"),
    ("category_name", "Categoría"),
    ("name", "Nombre"),
    ("serial_number", "Nro Serie"),
    ("brand", "Marca"),
    ("model", "Modelo"),
    ("status", "Estado"),
    ("location", "Ubicación"),
    ("assigned_to", "Asignado a"),
    ("purchase_date", "Fecha compra"),
    ("warranty_until", "Garantía hasta"),
    ("notes", "Notas"),
]


def build_workbook(items: list[models.InventoryItem]) -> bytes:
    wb = Workbook()
    ws = wb.active
    ws.title = "Inventario"
    ws.append([label for _, label in EXPORT_COLUMNS])
    for item in items:
        row = item_to_out(item)
        values = []
        for key, _ in EXPORT_COLUMNS:
            val = row.get(key)
            if isinstance(val, (date, datetime)):
                val = val.isoformat()
            values.append(val)
        ws.append(values)
    buffer = io.BytesIO()
    wb.save(buffer)
    buffer.seek(0)
    return buffer.read()


def _parse_date(value):
    if not value:
        return None
    if isinstance(value, (date, datetime)):
        return value.date() if isinstance(value, datetime) else value
    try:
        return date.fromisoformat(str(value)[:10])
    except ValueError:
        return None


def import_workbook(
    db: Session, content: bytes, default_category_id: int, changed_by: str | None
) -> dict:
    """Importa items desde un Excel. Hace upsert por nro de serie o nombre."""
    wb = load_workbook(io.BytesIO(content), data_only=True)
    ws = wb.active
    rows = list(ws.iter_rows(values_only=True))
    if not rows:
        return {"created": 0, "updated": 0}

    header = [str(h).strip().lower() if h else "" for h in rows[0]]

    def col(row, *names):
        for n in names:
            if n in header:
                return row[header.index(n)]
        return None

    created = updated = 0
    for row in rows[1:]:
        if not row or all(c is None for c in row):
            continue
        name = col(row, "nombre", "name")
        if not name:
            continue
        serial = col(row, "nro serie", "serial_number", "serial")

        existing = None
        if serial:
            existing = (
                db.query(models.InventoryItem)
                .filter(models.InventoryItem.serial_number == str(serial))
                .first()
            )
        if not existing:
            existing = (
                db.query(models.InventoryItem)
                .filter(models.InventoryItem.name == str(name))
                .first()
            )

        fields = dict(
            name=str(name),
            serial_number=str(serial) if serial else None,
            brand=col(row, "marca", "brand"),
            model=col(row, "modelo", "model"),
            status=(col(row, "estado", "status") or "active"),
            location=col(row, "ubicación", "ubicacion", "location"),
            assigned_to=col(row, "asignado a", "assigned_to"),
            purchase_date=_parse_date(col(row, "fecha compra", "purchase_date")),
            warranty_until=_parse_date(col(row, "garantía hasta", "garantia hasta", "warranty_until")),
            notes=col(row, "notas", "notes"),
        )
        # Normaliza campos de texto.
        for k in ("brand", "model", "status", "location", "assigned_to", "notes"):
            if fields[k] is not None:
                fields[k] = str(fields[k])

        if existing:
            for k, v in fields.items():
                setattr(existing, k, v)
            updated += 1
        else:
            item = models.InventoryItem(category_id=default_category_id, **fields)
            db.add(item)
            db.flush()
            log_history(db, item.id, "created", "Importado desde Excel", changed_by)
            created += 1

    db.commit()
    return {"created": created, "updated": updated}
