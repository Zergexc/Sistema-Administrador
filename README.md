# TI Diagnostic Panel (MVP)

Sistema web interno de diagnostico y soporte TI para equipos Windows.

## Ejecucion local (laptop)

### 1) Backend
```bash
cd backend
pip install -r requirements.txt
copy .env.example .env
uvicorn app.main:app --reload
```

### 2) Frontend
```bash
cd frontend
npm install
copy .env.example .env
npm run dev
```

### 3) Agente
```bash
cd agent
pip install psutil requests
copy config.example.json config.json
python agent.py
```

## Variables de entorno

- Backend: `backend/.env` (base en `backend/.env.example`)
  - `DATABASE_URL`: por defecto SQLite local.
  - `API_KEY`: vacio desactiva autenticacion (util para pruebas locales).
  - `CORS_ORIGINS`: origenes permitidos para frontend local.
- Frontend: `frontend/.env` (base en `frontend/.env.example`)
  - `VITE_API_URL`: URL de backend.
  - `VITE_API_KEY`: misma clave de `API_KEY` del backend si activas auth.

## Docker Compose (opcional para pruebas locales)

```bash
copy backend\.env.example backend\.env
copy frontend\.env.example frontend\.env
docker compose up --build
```

Frontend: `http://127.0.0.1:5173`  
Backend: `http://127.0.0.1:8000`  
Healthcheck: `http://127.0.0.1:8000/healthz`

## Incluye
- Dashboard central.
- Equipos y detalle.
- Alertas basicas.
- Historial de diagnosticos.
- Solicitud manual de diagnostico.
- Wake-on-LAN base preparada.
