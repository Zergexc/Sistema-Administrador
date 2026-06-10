# TI Diagnostic Panel

Sistema web interno de administración, monitoreo y soporte TI para equipos Windows.

## Características

- **Autenticación** con usuarios y roles (admin / viewer), JWT.
- **Monitoreo en tiempo real** vía WebSockets (CPU, RAM, discos, procesos, red, energía).
- **Dashboard** con mapa de calor de equipos, top de consumo, distribución de SO y resumen de almacenamiento.
- **Detalle de equipo** con pestañas: Rendimiento (gráficas), Procesos, Software, Energía, Discos, Red e Historial.
- **Sistema de alertas** con umbrales globales o por equipo, resolución manual y notificaciones (email/webhook).
- **Inventario** de activos con categorías, historial e import/export a Excel.
- **Agente** que recolecta métricas extendidas de cada PC.
- **Migraciones** gestionadas con Alembic.

## Ejecución local rápida

En Windows, desde la raíz del proyecto:

```powershell
./run-local.ps1            # backend + frontend
./run-local.ps1 -WithAgent # además levanta el agente local
```

El script crea el venv, instala dependencias, aplica migraciones y arranca todo
en ventanas separadas.

### Acceso por defecto

- Usuario: `admin`  ·  Contraseña: `admin123`  (cámbiala en la sección **Usuarios**).

## Ejecución manual

### 1) Backend
```bash
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
copy .env.example .env
alembic upgrade head          # crea/actualiza el esquema
uvicorn app.main:app --reload
```

### 2) Frontend
```bash
cd frontend
npm install
copy .env.example .env
npm run dev
```

### 3) Agente (en cada PC a monitorear)
```bash
cd agent
pip install psutil requests
copy config.example.json config.json
# Editar config.json con la URL del servidor
python agent.py
```

## Migraciones (Alembic)

```bash
cd backend
alembic upgrade head                         # aplica las migraciones
alembic revision --autogenerate -m "cambio"  # genera una nueva tras editar modelos
```

Ver [backend/README.md](backend/README.md) para detalles.

## Variables de entorno

- **Backend** (`backend/.env`, base en `backend/.env.example`):
  - `DATABASE_URL`: SQLite local por defecto.
  - `API_KEY`: auth máquina-a-máquina de los **agentes** (vacío = desactivada en local).
  - `JWT_SECRET`: clave de firma de tokens del panel — **cámbiala en producción**.
  - `SEED_ADMIN_USER` / `SEED_ADMIN_PASSWORD`: credenciales del admin inicial.
  - `CORS_ORIGINS`, `SNAPSHOT_RETENTION_DAYS`, `LOG_LEVEL`.
- **Frontend** (`frontend/.env`):
  - `VITE_API_URL`: URL del backend (con sufijo `/api`).

## Docker Compose

```bash
copy backend\.env.example backend\.env
copy frontend\.env.example frontend\.env
docker compose up --build
```

El contenedor del backend ejecuta `alembic upgrade head` automáticamente al arrancar.

- Frontend: `http://127.0.0.1:5173`
- Backend: `http://127.0.0.1:8000`  ·  Docs API: `http://127.0.0.1:8000/docs`
- Healthcheck: `http://127.0.0.1:8000/healthz`
