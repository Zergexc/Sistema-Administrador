# Backend - TI Diagnostic Panel

## Ejecutar

```bash
pip install -r requirements.txt
copy .env.example .env
uvicorn app.main:app --reload
```

## Endpoints de verificacion

- `GET /` estado general
- `GET /healthz` healthcheck

## Notas local-first

- `API_KEY=` vacio en `.env` desactiva auth para pruebas en laptop.
- Si defines `API_KEY`, debes enviar `X-API-Key` o `Authorization: Bearer <key>`.
