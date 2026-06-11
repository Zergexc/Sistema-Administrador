import json
import os
import platform
import subprocess
import sys
import time
import uuid
from datetime import datetime, timezone

import psutil
import requests


def _base_dir():
    """Carpeta del ejecutable (PyInstaller) o del script."""
    if getattr(sys, "frozen", False):
        return os.path.dirname(sys.executable)
    return os.path.dirname(os.path.abspath(__file__))


# El config vive siempre junto al .exe/.py, sin importar desde dónde se lance.
CONFIG_FILE = os.path.join(_base_dir(), "config.json")
AGENT_VERSION = "0.3.0"
DEFAULT_CONFIG = {
    "server_url": "http://127.0.0.1:8000",
    "report_interval_seconds": 120,
    "hostname_override": "",
    "token": "",
    # Cada cuántos ciclos recolectar métricas pesadas (programas, eventos, etc.).
    "full_scan_every": 15,
    # Cada cuántos segundos consultar tareas remotas (reinicio, mensaje, etc.).
    "poll_tasks_seconds": 15,
}

IS_WINDOWS = platform.system() == "Windows"
# Evita ventanas de consola al lanzar subprocesos en Windows.
_NO_WINDOW = 0x08000000 if IS_WINDOWS else 0


def load_config():
    if not os.path.exists(CONFIG_FILE):
        with open(CONFIG_FILE, "w", encoding="utf-8") as f:
            json.dump(DEFAULT_CONFIG, f, indent=2)
        return dict(DEFAULT_CONFIG)
    with open(CONFIG_FILE, "r", encoding="utf-8") as f:
        cfg = json.load(f)
    # Mezcla con defaults para configs antiguas.
    merged = dict(DEFAULT_CONFIG)
    merged.update(cfg or {})
    return merged


def _run_powershell(command: str, timeout: int = 20):
    """Ejecuta un comando PowerShell y devuelve stdout (o '' ante error)."""
    if not IS_WINDOWS:
        return ""
    try:
        out = subprocess.check_output(
            ["powershell", "-NoProfile", "-NonInteractive", "-Command", command],
            text=True,
            encoding="utf-8",
            errors="ignore",
            timeout=timeout,
            creationflags=_NO_WINDOW,
            stderr=subprocess.DEVNULL,
        )
        return out.strip()
    except Exception:
        return ""


def _ps_json(command: str, timeout: int = 20):
    """Ejecuta PowerShell pidiendo salida JSON y la parsea."""
    raw = _run_powershell(command, timeout=timeout)
    if not raw:
        return None
    try:
        return json.loads(raw)
    except (ValueError, TypeError):
        return None


# ---------------------------------------------------------------------------
# Recolectores básicos
# ---------------------------------------------------------------------------
def get_ip():
    for _, addrs in psutil.net_if_addrs().items():
        for addr in addrs:
            if addr.family.name == "AF_INET" and not addr.address.startswith("127."):
                return addr.address
    return ""


def ping_internet():
    try:
        flag = "-n" if IS_WINDOWS else "-c"
        subprocess.check_output(
            f"ping {flag} 1 8.8.8.8", shell=True, creationflags=_NO_WINDOW
        )
        return True
    except Exception:
        return False


def glpi_status():
    if not IS_WINDOWS:
        return "not_found"
    try:
        output = subprocess.check_output(
            'sc query "glpi-agent"',
            shell=True,
            text=True,
            encoding="utf-8",
            errors="ignore",
            creationflags=_NO_WINDOW,
        )
        return "running" if "RUNNING" in output else "stopped"
    except Exception:
        return "not_found"


def get_mac():
    return ":".join(f"{(uuid.getnode() >> e) & 0xFF:02x}" for e in range(40, -1, -8))


def get_cpu_name():
    if IS_WINDOWS:
        try:
            import winreg

            key = winreg.OpenKey(
                winreg.HKEY_LOCAL_MACHINE,
                r"HARDWARE\DESCRIPTION\System\CentralProcessor\0",
            )
            name, _ = winreg.QueryValueEx(key, "ProcessorNameString")
            winreg.CloseKey(key)
            return name.strip()
        except Exception:
            pass
    return platform.processor() or "N/A"


def get_top_processes(limit=10):
    """Top procesos por RAM, incluyendo % CPU best-effort."""
    procs = []
    for proc in psutil.process_iter(["name", "memory_info"]):
        try:
            proc.cpu_percent(None)  # prime para la próxima lectura
        except Exception:
            continue
    time.sleep(0.3)
    for proc in psutil.process_iter(["pid", "name", "memory_info"]):
        try:
            mem = proc.info["memory_info"]
            ram_mb = (mem.rss / (1024 * 1024)) if mem else 0
            cpu = proc.cpu_percent(None)
            procs.append(
                {
                    "name": proc.info["name"] or "unknown",
                    "pid": proc.info["pid"],
                    "ram_mb": round(ram_mb, 2),
                    "cpu_percent": round(cpu, 1),
                }
            )
        except Exception:
            continue
    procs.sort(key=lambda x: x["ram_mb"], reverse=True)
    return procs[:limit]


def get_disks():
    disks = []
    for part in psutil.disk_partitions(all=False):
        try:
            usage = psutil.disk_usage(part.mountpoint)
            disks.append(
                {
                    "mount": part.mountpoint,
                    "total_gb": round(usage.total / (1024**3), 2),
                    "free_gb": round(usage.free / (1024**3), 2),
                    "percent": round(usage.percent, 1),
                }
            )
        except Exception:
            continue
    return disks


def get_cpu_freq():
    try:
        freq = psutil.cpu_freq()
        return round(freq.current, 1) if freq else None
    except Exception:
        return None


def get_temperatures():
    try:
        temps = psutil.sensors_temperatures()
    except (AttributeError, Exception):
        return {}
    result = {}
    for name, entries in (temps or {}).items():
        for e in entries:
            if e.current:
                result[name] = round(e.current, 1)
                break
    return result


def get_logged_users():
    try:
        return sorted({u.name for u in psutil.users()})
    except Exception:
        return []


def get_network():
    """Interfaces (psutil) + gateway/DNS (PowerShell best-effort)."""
    interfaces = []
    stats = {}
    try:
        stats = psutil.net_if_stats()
    except Exception:
        stats = {}
    try:
        for name, addrs in psutil.net_if_addrs().items():
            ip = mac = None
            for addr in addrs:
                if addr.family.name == "AF_INET":
                    ip = addr.address
                elif addr.family.name in ("AF_LINK", "AF_PACKET"):
                    mac = addr.address
            st = stats.get(name)
            if ip and not ip.startswith("127."):
                interfaces.append(
                    {
                        "name": name,
                        "ip": ip,
                        "mac": mac,
                        "speed_mbps": st.speed if st else None,
                    }
                )
    except Exception:
        pass

    gateway = ""
    dns_servers = []
    if IS_WINDOWS:
        gw = _ps_json(
            "(Get-NetRoute -DestinationPrefix '0.0.0.0/0' -ErrorAction SilentlyContinue "
            "| Sort-Object RouteMetric | Select-Object -First 1).NextHop | ConvertTo-Json"
        )
        if isinstance(gw, str):
            gateway = gw
        dns = _ps_json(
            "Get-DnsClientServerAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue "
            "| Select-Object -ExpandProperty ServerAddresses -Unique | ConvertTo-Json"
        )
        if isinstance(dns, list):
            dns_servers = [d for d in dns if d]
        elif isinstance(dns, str) and dns:
            dns_servers = [dns]
    return {"gateway": gateway, "dns_servers": dns_servers, "interfaces": interfaces}


# ---------------------------------------------------------------------------
# Recolectores pesados (full scan)
# ---------------------------------------------------------------------------
def get_installed_programs():
    """Lee programas instalados del registro de Windows."""
    if not IS_WINDOWS:
        return []
    import winreg

    programs = []
    seen = set()
    roots = [
        (winreg.HKEY_LOCAL_MACHINE, r"SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall"),
        (winreg.HKEY_LOCAL_MACHINE, r"SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall"),
        (winreg.HKEY_CURRENT_USER, r"SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall"),
    ]
    for hive, path in roots:
        try:
            key = winreg.OpenKey(hive, path)
        except OSError:
            continue
        for i in range(winreg.QueryInfoKey(key)[0]):
            try:
                sub = winreg.OpenKey(key, winreg.EnumKey(key, i))
                name = winreg.QueryValueEx(sub, "DisplayName")[0]
                if not name or name in seen:
                    continue
                seen.add(name)

                def _try(val):
                    try:
                        return winreg.QueryValueEx(sub, val)[0]
                    except OSError:
                        return None

                programs.append(
                    {
                        "name": str(name),
                        "version": _try("DisplayVersion"),
                        "publisher": _try("Publisher"),
                    }
                )
            except OSError:
                continue
        winreg.CloseKey(key)
    programs.sort(key=lambda p: p["name"].lower())
    return programs


def get_power_events(days=7):
    """Eventos de encendido/apagado/suspensión del Event Log."""
    if not IS_WINDOWS:
        return []
    # 6005=arranque, 6006=apagado, 6008=apagado inesperado; 1/42=suspensión; 1=wake(Power-Troubleshooter)
    cmd = (
        f"$ids=6005,6006,6008,42,1; "
        f"Get-WinEvent -FilterHashtable @{{LogName='System'; Id=$ids; "
        f"StartTime=(Get-Date).AddDays(-{days})}} -ErrorAction SilentlyContinue "
        f"| Select-Object Id, ProviderName, TimeCreated "
        f"| ConvertTo-Json -Depth 2"
    )
    data = _ps_json(cmd, timeout=30)
    if not data:
        return []
    if isinstance(data, dict):
        data = [data]

    id_map = {
        6005: "startup",
        6006: "shutdown",
        6008: "unexpected_shutdown",
        42: "sleep",
    }
    events = []
    for ev in data:
        eid = ev.get("Id")
        provider = (ev.get("ProviderName") or "")
        if eid == 1 and "Power-Troubleshooter" not in provider:
            continue  # solo el Id=1 de Power-Troubleshooter es "wake"
        event_type = id_map.get(eid, "wake" if eid == 1 else None)
        if not event_type:
            continue
        ts = ev.get("TimeCreated")
        # PowerShell serializa fechas como "/Date(ms)/".
        if isinstance(ts, str) and ts.startswith("/Date("):
            try:
                ms = int(ts[6:].split(")")[0].split("+")[0].split("-")[0])
                ts = datetime.fromtimestamp(ms / 1000, tz=timezone.utc).replace(tzinfo=None).isoformat()
            except Exception:
                ts = None
        events.append({"event": event_type, "timestamp": ts})
    return events


def get_windows_update():
    if not IS_WINDOWS:
        return {}
    last = _ps_json(
        "(Get-HotFix -ErrorAction SilentlyContinue | Sort-Object InstalledOn "
        "| Select-Object -Last 1).InstalledOn | ConvertTo-Json"
    )
    last_str = None
    if isinstance(last, str) and last.startswith("/Date("):
        try:
            ms = int(last[6:].split(")")[0].split("+")[0].split("-")[0])
            last_str = datetime.fromtimestamp(ms / 1000, tz=timezone.utc).date().isoformat()
        except Exception:
            last_str = None
    return {"last_installed": last_str}


def get_antivirus():
    if not IS_WINDOWS:
        return {}
    data = _ps_json(
        "Get-MpComputerStatus -ErrorAction SilentlyContinue "
        "| Select-Object AMRunningMode, RealTimeProtectionEnabled, "
        "AntivirusSignatureAge | ConvertTo-Json"
    )
    if not isinstance(data, dict):
        return {}
    return {
        "name": "Windows Defender",
        "status": "enabled" if data.get("RealTimeProtectionEnabled") else "disabled",
        "definitions_up_to_date": (data.get("AntivirusSignatureAge") or 99) <= 7,
    }


def get_printers():
    if not IS_WINDOWS:
        return []
    data = _ps_json(
        "Get-Printer -ErrorAction SilentlyContinue "
        "| Select-Object Name, PrinterStatus | ConvertTo-Json"
    )
    if not data:
        return []
    if isinstance(data, dict):
        data = [data]
    return [
        {"name": p.get("Name"), "status": str(p.get("PrinterStatus"))}
        for p in data
        if p.get("Name")
    ]


def get_system_errors(hours=24):
    if not IS_WINDOWS:
        return []
    cmd = (
        f"Get-WinEvent -FilterHashtable @{{LogName='System'; Level=2; "
        f"StartTime=(Get-Date).AddHours(-{hours})}} -MaxEvents 20 "
        f"-ErrorAction SilentlyContinue "
        f"| Select-Object ProviderName, Id, @{{N='Message';E={{$_.Message}}}} "
        f"| ConvertTo-Json -Depth 2"
    )
    data = _ps_json(cmd, timeout=30)
    if not data:
        return []
    if isinstance(data, dict):
        data = [data]
    errors = []
    for e in data:
        msg = (e.get("Message") or "").split("\n")[0][:200]
        errors.append({"source": e.get("ProviderName"), "message": msg})
    return errors


# ---------------------------------------------------------------------------
# Payload
# ---------------------------------------------------------------------------
def collect_payload(config, full_scan=False):
    vm = psutil.virtual_memory()
    disks = get_disks()
    c_disk = next((d for d in disks if str(d["mount"]).upper().startswith("C")), None)
    disk_total = round(sum(d.get("total_gb") or 0 for d in disks), 2)
    disk_used_pct = (
        round(sum(d.get("percent") or 0 for d in disks) / len(disks), 1)
        if disks
        else None
    )

    payload = {
        "hostname": config["hostname_override"] or platform.node(),
        "current_user": os.environ.get("USERNAME") or os.environ.get("USER", "unknown"),
        "ip_address": get_ip(),
        "os_version": f"{platform.system()} {platform.release()}",
        "ram_total_gb": round(vm.total / (1024**3), 2),
        "ram_free_gb": round(vm.available / (1024**3), 2),
        "cpu_model": get_cpu_name(),
        "cpu_percent": psutil.cpu_percent(interval=1),
        "cpu_cores": psutil.cpu_count(logical=True),
        "cpu_freq_mhz": get_cpu_freq(),
        "disk_c_free_gb": c_disk["free_gb"] if c_disk else None,
        "disk_total_gb": disk_total or None,
        "disk_used_percent": disk_used_pct,
        "disks": disks,
        "uptime_seconds": int(time.time() - psutil.boot_time()),
        "boot_time": datetime.fromtimestamp(psutil.boot_time(), tz=timezone.utc).replace(tzinfo=None).isoformat(),
        "internet_ok": ping_internet(),
        "glpi_status": glpi_status(),
        "agent_version": AGENT_VERSION,
        "top_processes": get_top_processes(),
        "important_services": [{"name": "GLPI Agent", "status": glpi_status()}],
        "mac_address": get_mac(),
        "network": get_network(),
        "temperatures": get_temperatures(),
        "logged_users": get_logged_users(),
    }

    if full_scan:
        payload["installed_programs"] = get_installed_programs()
        payload["power_events"] = get_power_events()
        payload["windows_update"] = get_windows_update()
        payload["antivirus"] = get_antivirus()
        payload["printers"] = get_printers()
        payload["system_errors"] = get_system_errors()

    # Compatibilidad con la red plana usada por el backend antiguo.
    payload["gateway"] = payload["network"].get("gateway", "")
    payload["dns_servers"] = payload["network"].get("dns_servers", [])
    return payload


def _auth_headers(config):
    headers = {}
    if config.get("token"):
        headers["Authorization"] = f"Bearer {config['token']}"
        headers["X-API-Key"] = config["token"]
    return headers


def post(config, endpoint, payload):
    response = requests.post(
        f"{config['server_url'].rstrip('/')}{endpoint}",
        json=payload,
        headers=_auth_headers(config),
        timeout=30,
    )
    response.raise_for_status()
    return response.json()


def get(config, endpoint):
    response = requests.get(
        f"{config['server_url'].rstrip('/')}{endpoint}",
        headers=_auth_headers(config),
        timeout=15,
    )
    response.raise_for_status()
    return response.json()


# ---------------------------------------------------------------------------
# Acciones remotas (encoladas desde el panel)
# ---------------------------------------------------------------------------
def _show_message(text: str) -> bool:
    """Muestra un aviso emergente al usuario usando WTSSendMessageW de Windows API.

    Esto permite que un proceso corriendo como SYSTEM (Sesión 0) muestre
    un mensaje interactivo en la sesión activa del usuario.
    """
    try:
        import ctypes
        from ctypes import wintypes

        wtsapi32 = ctypes.windll.wtsapi32
        kernel32 = ctypes.windll.kernel32

        # Firma de WTSSendMessageW:
        wtsapi32.WTSSendMessageW.argtypes = [
            wintypes.HANDLE,   # hServer
            wintypes.DWORD,    # SessionId
            wintypes.LPWSTR,   # pTitle
            wintypes.DWORD,    # TitleLength
            wintypes.LPWSTR,   # pMessage
            wintypes.DWORD,    # MessageLength
            wintypes.DWORD,    # Style
            wintypes.DWORD,    # Timeout
            ctypes.POINTER(wintypes.DWORD), # pResponse
            wintypes.BOOL      # bWait
        ]
        wtsapi32.WTSSendMessageW.restype = wintypes.BOOL

        # Obtener la sesión activa de la consola.
        active_session = kernel32.WTSGetActiveConsoleSessionId()
        if active_session in (0, 0xFFFFFFFF):
            active_session = 1

        title = "Aviso del Departamento de TI"
        server_handle = None 
        style = 0x00000040  # MB_OK | MB_ICONINFORMATION
        timeout = 0
        response = wintypes.DWORD()
        
        title_w = ctypes.c_wchar_p(title)
        msg_w = ctypes.c_wchar_p(text)
        
        title_len = len(title) * 2
        msg_len = len(text) * 2
        
        # Llamar a la API de forma asíncrona (bWait = False) para no bloquear al agente
        success = wtsapi32.WTSSendMessageW(
            server_handle,
            active_session,
            title_w,
            title_len,
            msg_w,
            msg_len,
            style,
            timeout,
            ctypes.byref(response),
            False
        )
        if success:
            return True
    except Exception as exc:
        print(f"Error WTSSendMessageW: {exc}", flush=True)

    # Fallback 1: PowerShell con Windows Forms MessageBox
    escaped = text.replace("'", "''")
    ps_cmd = (
        "Add-Type -AssemblyName System.Windows.Forms; "
        "[System.Windows.Forms.MessageBox]::Show("
        f"'{escaped}', 'Aviso del Departamento de TI', "
        "'OK', 'Information')"
    )
    try:
        proc = subprocess.run(
            ["powershell", "-NoProfile", "-NonInteractive", "-Command", ps_cmd],
            capture_output=True,
            timeout=30,
            creationflags=_NO_WINDOW,
        )
        if proc.returncode == 0:
            return True
    except Exception:
        pass

    # Fallback 2: msg.exe clásico
    try:
        proc = subprocess.run(
            ["msg", "*", "/time:120", text],
            capture_output=True,
            timeout=15,
            creationflags=_NO_WINDOW,
        )
        return proc.returncode == 0
    except Exception:
        return False


def _logoff_all_sessions() -> str:
    """Cierra la sesión de todos los usuarios interactivos."""
    try:
        # Obtener los session IDs de explorer.exe usando PowerShell
        # Esto evita parsear quser en diferentes idiomas.
        ps_cmd = "(Get-Process -Name explorer -ErrorAction SilentlyContinue).SessionId | Select-Object -Unique"
        proc = subprocess.run(
            ["powershell", "-NoProfile", "-NonInteractive", "-Command", ps_cmd],
            capture_output=True,
            text=True,
            timeout=15,
            creationflags=_NO_WINDOW,
        )
        session_ids = [line.strip() for line in proc.stdout.splitlines() if line.strip().isdigit()]
        if not session_ids:
            return "sin sesiones activas"
        
        closed = []
        for sid in session_ids:
            if sid == "0":
                continue
            subprocess.run(
                ["logoff", sid],
                timeout=15,
                creationflags=_NO_WINDOW,
            )
            closed.append(sid)
        return f"sesiones cerradas: {closed}" if closed else "sin sesiones activas"
    except Exception as exc:
        return f"error: {exc}"


def execute_task(config, task):
    """Ejecuta una tarea remota del panel y reporta el resultado."""
    ttype = task.get("task_type")
    try:
        payload = json.loads(task.get("payload") or "{}")
    except json.JSONDecodeError:
        payload = {}
    delay = max(0, int(payload.get("delay_seconds", 30)))
    text = (payload.get("message") or "").strip()

    def complete(result: dict):
        try:
            post(config, f"/api/tasks/{task['id']}/complete", result)
        except Exception as exc:
            print(f"No se pudo completar la tarea {task['id']}: {exc}", flush=True)

    if ttype == "diagnostic":
        complete({"status": "ok", "detail": "diagnóstico completo ejecutado"})
        run_once(config, full_scan=True)
    elif ttype in ("restart", "shutdown"):
        accion = "Reinicio" if ttype == "restart" else "Apagado"
        comment = text or f"{accion} programado por TI en {delay} segundos. Guarda tu trabajo."
        # Muestra aviso emergente al usuario ANTES del shutdown.
        if delay > 0:
            _show_message(comment)
        # Se completa ANTES de ejecutar: el equipo va a apagarse.
        complete({"status": "ok", "detail": f"{ttype} en {delay}s"})
        flag = "/r" if ttype == "restart" else "/s"
        try:
            proc = subprocess.run(
                ["shutdown", flag, "/f", "/t", str(delay), "/c", comment[:500]],
                capture_output=True,
                timeout=15,
            )
            if proc.returncode != 0:
                # Fallback: PowerShell con -Force.
                ps_flag = "Restart-Computer" if ttype == "restart" else "Stop-Computer"
                subprocess.run(
                    ["powershell", "-NoProfile", "-Command", f"{ps_flag} -Force"],
                    timeout=15,
                    creationflags=_NO_WINDOW,
                )
        except Exception as exc:
            print(f"Error en {ttype}: {exc}", flush=True)
    elif ttype == "logoff":
        complete({"status": "ok", "detail": _logoff_all_sessions()})
    elif ttype == "message":
        shown = _show_message(text or "Aviso del departamento de TI")
        complete(
            {
                "status": "ok" if shown else "error",
                "detail": "mensaje mostrado" if shown else "msg.exe no disponible",
            }
        )
    else:
        complete({"status": "ignored", "detail": f"tipo no soportado: {ttype}"})


def poll_and_run_tasks(config, device_id):
    data = get(config, f"/api/devices/{device_id}/tasks")
    for task in data.get("pending_tasks", []):
        print(f"Ejecutando tarea {task['id']} ({task['task_type']})", flush=True)
        execute_task(config, task)


def run_once(config, full_scan=False):
    payload = collect_payload(config, full_scan=full_scan)
    device = post(config, "/api/devices/register", payload)
    diagnostic = post(
        config,
        "/api/diagnostics/report",
        {
            "hostname": payload["hostname"],
            "summary": f"Reporte agente {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}",
            "payload": payload,
            "alerts_detected": [],
        },
    )
    scan = "completo" if full_scan else "rápido"
    # flush=True: que el log salga al instante aunque stdout esté redirigido
    # (tarea programada, archivo de log, etc.).
    print(
        f"Reporte {scan} enviado: device={device['id']} "
        f"diagnostic={diagnostic['diagnostic_id']}",
        flush=True,
    )
    return device["id"]


def main():
    config = load_config()
    interval = int(config.get("report_interval_seconds", 120))
    full_every = max(1, int(config.get("full_scan_every", 15)))
    poll_every = max(5, int(config.get("poll_tasks_seconds", 15)))
    cycle = 0
    device_id = None
    while True:
        try:
            device_id = run_once(config, full_scan=(cycle % full_every == 0))
        except Exception as exc:
            print(f"Error agente: {exc}", flush=True)
        cycle += 1
        # Entre reportes, consulta tareas remotas con frecuencia para que un
        # reinicio o mensaje desde el panel no espere al siguiente ciclo.
        waited = 0
        while waited < interval:
            step = min(poll_every, interval - waited)
            time.sleep(step)
            waited += step
            if device_id is not None:
                try:
                    poll_and_run_tasks(config, device_id)
                except Exception as exc:
                    print(f"Error consultando tareas: {exc}", flush=True)


if __name__ == "__main__":
    main()
