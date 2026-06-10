import json

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from .. import models, schemas
from ..auth import get_current_user, require_admin
from ..database import get_db
from ..services import inventory_service as inv

router = APIRouter(prefix="/api/inventory", tags=["inventory"])


# ---------------------------------------------------------------------------
# Categorías
# ---------------------------------------------------------------------------
@router.get("/categories", response_model=list[schemas.CategoryOut])
def list_categories(
    db: Session = Depends(get_db), _: models.User = Depends(get_current_user)
):
    cats = db.query(models.InventoryCategory).order_by(models.InventoryCategory.name).all()
    return [inv.category_to_out(c) for c in cats]


@router.post("/categories", response_model=schemas.CategoryOut, status_code=201)
def create_category(
    payload: schemas.CategoryCreate,
    db: Session = Depends(get_db),
    _: models.User = Depends(require_admin),
):
    if db.query(models.InventoryCategory).filter(models.InventoryCategory.name == payload.name).first():
        raise HTTPException(status_code=400, detail="La categoría ya existe")
    category = models.InventoryCategory(
        name=payload.name,
        description=payload.description,
        icon=payload.icon,
        fields_schema=json.dumps(payload.fields_schema),
    )
    db.add(category)
    db.commit()
    db.refresh(category)
    return inv.category_to_out(category)


@router.put("/categories/{category_id}", response_model=schemas.CategoryOut)
def update_category(
    category_id: int,
    payload: schemas.CategoryUpdate,
    db: Session = Depends(get_db),
    _: models.User = Depends(require_admin),
):
    category = db.query(models.InventoryCategory).filter(models.InventoryCategory.id == category_id).first()
    if not category:
        raise HTTPException(status_code=404, detail="Categoría no encontrada")
    if payload.name is not None:
        category.name = payload.name
    if payload.description is not None:
        category.description = payload.description
    if payload.icon is not None:
        category.icon = payload.icon
    if payload.fields_schema is not None:
        category.fields_schema = json.dumps(payload.fields_schema)
    db.commit()
    db.refresh(category)
    return inv.category_to_out(category)


@router.delete("/categories/{category_id}")
def delete_category(
    category_id: int,
    db: Session = Depends(get_db),
    _: models.User = Depends(require_admin),
):
    category = db.query(models.InventoryCategory).filter(models.InventoryCategory.id == category_id).first()
    if not category:
        raise HTTPException(status_code=404, detail="Categoría no encontrada")
    db.delete(category)
    db.commit()
    return {"status": "deleted"}


# ---------------------------------------------------------------------------
# Items
# ---------------------------------------------------------------------------
@router.get("/items", response_model=list[schemas.ItemOut])
def list_items(
    category: int | None = Query(default=None),
    status: str | None = Query(default=None),
    search: str | None = Query(default=None),
    db: Session = Depends(get_db),
    _: models.User = Depends(get_current_user),
):
    query = db.query(models.InventoryItem)
    if category is not None:
        query = query.filter(models.InventoryItem.category_id == category)
    if status:
        query = query.filter(models.InventoryItem.status == status)
    if search:
        like = f"%{search}%"
        query = query.filter(
            models.InventoryItem.name.ilike(like)
            | models.InventoryItem.serial_number.ilike(like)
            | models.InventoryItem.brand.ilike(like)
            | models.InventoryItem.assigned_to.ilike(like)
        )
    items = query.order_by(models.InventoryItem.created_at.desc()).all()
    return [inv.item_to_out(i) for i in items]


# Export va antes de /{item_id} para evitar colisión de ruta.
@router.get("/export")
def export_items(
    category: int | None = Query(default=None),
    db: Session = Depends(get_db),
    _: models.User = Depends(get_current_user),
):
    query = db.query(models.InventoryItem)
    if category is not None:
        query = query.filter(models.InventoryItem.category_id == category)
    items = query.order_by(models.InventoryItem.name).all()
    content = inv.build_workbook(items)
    return StreamingResponse(
        iter([content]),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": "attachment; filename=inventario.xlsx"},
    )


@router.post("/import")
def import_items(
    category_id: int = Form(...),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current: models.User = Depends(require_admin),
):
    category = db.query(models.InventoryCategory).filter(models.InventoryCategory.id == category_id).first()
    if not category:
        raise HTTPException(status_code=404, detail="Categoría destino no encontrada")
    content = file.file.read()
    try:
        result = inv.import_workbook(db, content, category_id, current.username)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=400, detail=f"Error al leer el Excel: {exc}")
    return {"status": "ok", **result}


@router.get("/items/{item_id}", response_model=schemas.ItemOut)
def get_item(
    item_id: int,
    db: Session = Depends(get_db),
    _: models.User = Depends(get_current_user),
):
    item = db.query(models.InventoryItem).filter(models.InventoryItem.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Item no encontrado")
    return inv.item_to_out(item)


@router.post("/items", response_model=schemas.ItemOut, status_code=201)
def create_item(
    payload: schemas.ItemCreate,
    db: Session = Depends(get_db),
    current: models.User = Depends(require_admin),
):
    if not db.query(models.InventoryCategory).filter(models.InventoryCategory.id == payload.category_id).first():
        raise HTTPException(status_code=400, detail="Categoría no encontrada")
    item = models.InventoryItem(
        category_id=payload.category_id,
        name=payload.name,
        description=payload.description,
        serial_number=payload.serial_number,
        brand=payload.brand,
        model=payload.model,
        status=payload.status,
        location=payload.location,
        assigned_to=payload.assigned_to,
        device_id=payload.device_id,
        purchase_date=payload.purchase_date,
        warranty_until=payload.warranty_until,
        notes=payload.notes,
        custom_fields=json.dumps(payload.custom_fields),
        photo_url=payload.photo_url,
    )
    db.add(item)
    db.flush()
    inv.log_history(db, item.id, "created", f"Item creado: {item.name}", current.username)
    db.commit()
    db.refresh(item)
    return inv.item_to_out(item)


@router.put("/items/{item_id}", response_model=schemas.ItemOut)
def update_item(
    item_id: int,
    payload: schemas.ItemUpdate,
    db: Session = Depends(get_db),
    current: models.User = Depends(require_admin),
):
    item = db.query(models.InventoryItem).filter(models.InventoryItem.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Item no encontrado")

    changes: list[str] = []
    data = payload.model_dump(exclude_unset=True)

    # Detecta cambios relevantes para el historial.
    if "status" in data and data["status"] != item.status:
        changes.append(f"Estado: {item.status} → {data['status']}")
        inv.log_history(db, item.id, "status_change", changes[-1], current.username)
    if "assigned_to" in data and data["assigned_to"] != item.assigned_to:
        if data["assigned_to"]:
            action, detail = "assigned", f"Asignado a {data['assigned_to']}"
        else:
            action, detail = "unassigned", f"Desasignado de {item.assigned_to}"
        inv.log_history(db, item.id, action, detail, current.username)

    for key, value in data.items():
        if key == "custom_fields":
            item.custom_fields = json.dumps(value or {})
        else:
            setattr(item, key, value)

    inv.log_history(db, item.id, "updated", "Item actualizado", current.username)
    db.commit()
    db.refresh(item)
    return inv.item_to_out(item)


@router.delete("/items/{item_id}")
def delete_item(
    item_id: int,
    db: Session = Depends(get_db),
    _: models.User = Depends(require_admin),
):
    item = db.query(models.InventoryItem).filter(models.InventoryItem.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Item no encontrado")
    db.delete(item)
    db.commit()
    return {"status": "deleted"}


@router.get("/items/{item_id}/history", response_model=list[schemas.HistoryOut])
def item_history(
    item_id: int,
    db: Session = Depends(get_db),
    _: models.User = Depends(get_current_user),
):
    return (
        db.query(models.InventoryHistory)
        .filter(models.InventoryHistory.item_id == item_id)
        .order_by(models.InventoryHistory.created_at.desc())
        .all()
    )
