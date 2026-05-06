# Agente Windows

```bash
pip install psutil requests
copy config.example.json config.json
python agent.py
```

El agente reporta periodicamente al backend por HTTP.

Si activas `API_KEY` en backend, usa la misma clave en `config.json` dentro de `token`.
