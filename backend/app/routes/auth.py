from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from .. import models, schemas
from ..auth import (
    create_access_token,
    get_current_user,
    hash_password,
    require_admin,
    verify_password,
)
from ..database import get_db

router = APIRouter(prefix="/api/auth", tags=["auth"])
users_router = APIRouter(prefix="/api/users", tags=["users"])


@router.post("/login", response_model=schemas.Token)
def login(payload: schemas.LoginRequest, db: Session = Depends(get_db)):
    user = (
        db.query(models.User)
        .filter(models.User.username == payload.username)
        .first()
    )
    if not user or not verify_password(payload.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Usuario o contraseña incorrectos",
        )
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Usuario inactivo"
        )
    token = create_access_token({"sub": user.username, "role": user.role})
    return schemas.Token(access_token=token)


@router.get("/me", response_model=schemas.UserOut)
def me(current: models.User = Depends(get_current_user)):
    return current


@router.post("/register", response_model=schemas.UserOut, status_code=201)
def register(
    payload: schemas.UserCreate,
    db: Session = Depends(get_db),
    _: models.User = Depends(require_admin),
):
    exists = (
        db.query(models.User)
        .filter(models.User.username == payload.username)
        .first()
    )
    if exists:
        raise HTTPException(status_code=400, detail="El usuario ya existe")
    role = payload.role if payload.role in {"admin", "viewer"} else "viewer"
    user = models.User(
        username=payload.username,
        full_name=payload.full_name,
        hashed_password=hash_password(payload.password),
        role=role,
        needs_password_change=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@router.post("/change-password")
def change_password(
    payload: dict,
    db: Session = Depends(get_db),
    current: models.User = Depends(get_current_user),
):
    current_password = (payload or {}).get("current_password", "")
    new_password = (payload or {}).get("new_password", "")
    
    if current_password:
        if not verify_password(current_password, current.hashed_password):
            raise HTTPException(
                status_code=400, detail="La contraseña actual es incorrecta"
            )
            
    if len(new_password) < 4:
        raise HTTPException(
            status_code=400, detail="La contraseña debe tener al menos 4 caracteres"
        )
    current.hashed_password = hash_password(new_password)
    current.needs_password_change = False
    db.commit()
    return {"status": "ok", "message": "Contraseña actualizada"}


# ---------------------------------------------------------------------------
# Gestión de usuarios (solo admin)
# ---------------------------------------------------------------------------
@users_router.get("", response_model=list[schemas.UserOut])
def list_users(
    db: Session = Depends(get_db), _: models.User = Depends(require_admin)
):
    return db.query(models.User).order_by(models.User.username.asc()).all()


@users_router.put("/{user_id}", response_model=schemas.UserOut)
def update_user(
    user_id: int,
    payload: schemas.UserUpdate,
    db: Session = Depends(get_db),
    _: models.User = Depends(require_admin),
):
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    if payload.full_name is not None:
        user.full_name = payload.full_name
    if payload.role in {"admin", "viewer"}:
        user.role = payload.role
    if payload.is_active is not None:
        user.is_active = payload.is_active
    if payload.password:
        user.hashed_password = hash_password(payload.password)
        user.needs_password_change = True
    db.commit()
    db.refresh(user)
    return user


@users_router.delete("/{user_id}")
def delete_user(
    user_id: int,
    db: Session = Depends(get_db),
    current: models.User = Depends(require_admin),
):
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    if user.id == current.id:
        raise HTTPException(status_code=400, detail="No puedes eliminar tu propio usuario")
    admin_count = db.query(models.User).filter(models.User.role == "admin").count()
    if user.role == "admin" and admin_count <= 1:
        raise HTTPException(status_code=400, detail="Debe existir al menos un administrador")
    db.delete(user)
    db.commit()
    return {"status": "deleted"}
