# Agente Windows

El agente recolecta métricas del equipo y las reporta al backend por HTTP
(`/api/devices/register` y `/api/diagnostics/report`).

## Opción A — Ejecutable (.exe), recomendado para desplegar

No requiere Python en el equipo destino. Solo se copian 2 archivos.

### Compilar el exe (una sola vez, en la PC de desarrollo)

```powershell
cd agent
python -m venv .venv-build
.venv-build\Scripts\python.exe -m pip install psutil requests pyinstaller
.venv-build\Scripts\pyinstaller.exe --onefile --name ti-agent --clean --noconfirm agent.py
# Resultado: dist\ti-agent.exe
```

### Instalar en cada equipo

Copia `dist\ti-agent.exe` + `install-agent.ps1` al equipo (USB o carpeta
compartida) y en PowerShell **como Administrador**:

```powershell
.\install-agent.ps1 -ServerUrl "http://192.168.1.50:8000"
```

El script instala en `C:\TIAgent`, genera el `config.json` y registra la tarea
programada **"TI Diagnostic Agent"** (arranca con Windows, corre como SYSTEM,
se reinicia si falla). El equipo aparece solo en el panel tras el primer reporte.

Instalación manual alternativa: copia `ti-agent.exe` a una carpeta, créale al
lado un `config.json` (ver abajo) y ejecútalo. El config se genera solo con
defaults si no existe.

Desinstalar:

```powershell
Unregister-ScheduledTask -TaskName "TI Diagnostic Agent"
Remove-Item -Recurse C:\TIAgent
```

## Opción B — Script Python (desarrollo)

```bash
pip install psutil requests
copy config.example.json config.json
python agent.py
```

## Configuración (`config.json`)

Vive siempre junto al `.exe`/`.py`, sin importar desde dónde se lance.

| Campo | Descripción |
|---|---|
| `server_url` | URL del backend (ej. `http://192.168.1.10:8000`). |
| `report_interval_seconds` | Intervalo entre reportes (default 120). |
| `hostname_override` | Forzar un hostname (vacío = nombre real del equipo). |
| `token` | Si activas `API_KEY` en el backend, usa la misma clave aquí. |
| `full_scan_every` | Cada cuántos ciclos recolectar métricas pesadas (default 15). |

## Métricas recolectadas

**En cada ciclo (rápido):** CPU (%, núcleos, frecuencia), RAM, todos los discos,
uptime, internet, estado GLPI, top 10 procesos (RAM + CPU), red (interfaces,
gateway, DNS), temperaturas, usuarios con sesión, MAC.

**En el escaneo completo** (cada `full_scan_every` ciclos): programas instalados,
eventos de energía (encendido/apagado/suspensión del Event Log), Windows Update,
antivirus (Defender), impresoras y errores recientes del sistema.

> Todos los recolectores son *best-effort*: si una fuente no está disponible
> (permisos, no-Windows, etc.) el campo se omite sin detener el reporte.
