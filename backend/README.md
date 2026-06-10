# Backend — TI Diagnostic Panel

API REST con FastAPI + SQLAlchemy 2 + SQLite, migraciones con Alembic.

## Ejecutar

```bash
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
copy .env.example .env
alembic upgrade head
uvicorn app.main:app --reload
```

## Migraciones (Alembic)

La URL de la base se inyecta automáticamente desde `app.config` (variable
`DATABASE_URL` del `.env`); no es necesario editar `alembic.ini`.

```bash
alembic upgrade head                          # aplica migraciones pendientes
alembic revision --autogenerate -m "mensaje"  # genera migración tras editar modelos
alembic downgrade -1                          # revierte la última
alembic current                               # revisión actual
```

> Tras cambiar `app/models.py`, genera siempre una nueva migración. Alembic usa
> `render_as_batch=True` para soportar `ALTER TABLE` en SQLite.

## Autenticación

- **Panel web**: JWT. `POST /api/auth/login` devuelve `access_token`; envíalo como
  `Authorization: Bearer <token>`. Roles: `admin` (gestiona todo) y `viewer` (solo lectura).
  Las rutas GET requieren usuario autenticado; las acciones (WOL, settings, inventario,
  usuarios, resolver alertas) requieren `admin`.
- **Agentes** (machine-to-machine): `X-API-Key` / `Authorization: Bearer`. Si `API_KEY`
  está vacío en `.env`, la auth de agentes queda desactivada (cómodo en local).

Al iniciar, si no hay usuarios se crea `admin/admin123` (configurable con
`SEED_ADMIN_USER` / `SEED_ADMIN_PASSWORD`).

## Tiempo real (WebSocket)

- `GET /ws?token=<jwt>` — el backend emite `device_update`, `device_registered`,
  `alert_created`, `alert_resolved` y `diagnostic_new` a todos los clientes.

## Endpoints principales

```
# Auth / usuarios
POST   /api/auth/login            GET /api/auth/me   POST /api/auth/register (admin)
POST   /api/auth/change-password  GET/PUT/DELETE /api/users (admin)

# Equipos / métricas
GET    /api/dashboard             GET /api/devices   GET /api/devices/{id}
POST   /api/devices/register      POST /api/devices/{id}/heartbeat   (agente)
PUT    /api/devices/{id}/thresholds (admin)
GET    /api/devices/{id}/snapshots?range=24h|7d|30d
GET    /api/devices/{id}/programs       GET /api/devices/{id}/power-events
POST   /api/devices/{id}/wol (admin)    POST /api/devices/{id}/request-diagnostic (admin)

# Diagnósticos / alertas
POST   /api/diagnostics/report (agente)  GET /api/diagnostics
GET    /api/alerts[?active=true&device_id=]   POST /api/alerts/{id}/resolve (admin)

# Settings
GET    /api/settings              PUT /api/settings (admin)

# Inventario
GET/POST/PUT/DELETE /api/inventory/categories[/{id}]
GET/POST/PUT/DELETE /api/inventory/items[/{id}]   GET /api/inventory/items/{id}/history
GET    /api/inventory/export      POST /api/inventory/import (admin)
```

## Tests

```bash
pytest -q
```

Los tests usan una base SQLite aislada (`test_ti_diagnostic.db`) y fixtures de
autenticación (ver `tests/conftest.py`).
