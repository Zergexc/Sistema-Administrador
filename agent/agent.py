import json
import os
import platform
import subprocess
import time
import uuid
from datetime import datetime

import psutil
import requests

CONFIG_FILE = "config.json"
DEFAULT_CONFIG = {
    "server_url": "http://127.0.0.1:8000",
    "report_interval_seconds": 120,
    "hostname_override": "",
    "token": "",
}


def load_config():
    if not os.path.exists(CONFIG_FILE):
        with open(CONFIG_FILE, "w", encoding="utf-8") as f:
            json.dump(DEFAULT_CONFIG, f, indent=2)
        return DEFAULT_CONFIG
    with open(CONFIG_FILE, "r", encoding="utf-8") as f:
        return json.load(f)


def get_ip():
    for _, addrs in psutil.net_if_addrs().items():
        for addr in addrs:
            if addr.family.name == "AF_INET" and not addr.address.startswith("127."):
                return addr.address
    return ""


def ping_internet():
    try:
        subprocess.check_output("ping -n 1 8.8.8.8", shell=True)
        return True
    except Exception:
        return False


def glpi_status():
    try:
        output = subprocess.check_output(
            "sc query \"glpi-agent\"", shell=True, text=True, encoding="utf-8", errors="ignore"
        )
        return "running" if "RUNNING" in output else "stopped"
    except Exception:
        return "not_found"


def get_top_processes():
    processes = []
    for proc in psutil.process_iter(["name", "memory_info"]):
        try:
            ram_mb = proc.info["memory_info"].rss / (1024 * 1024)
            processes.append({"name": proc.info["name"] or "unknown", "ram_mb": round(ram_mb, 2)})
        except Exception:
            continue
    processes.sort(key=lambda x: x["ram_mb"], reverse=True)
    return processes[:5]


def get_mac():
    mac = ":".join([f"{(uuid.getnode() >> e) & 0xFF:02x}" for e in range(40, -1, -8)])
    return mac


def get_cpu_name():
    try:
        import winreg
        key = winreg.OpenKey(
            winreg.HKEY_LOCAL_MACHINE,
            r"HARDWARE\DESCRIPTION\System\CentralProcessor\0"
        )
        name, _ = winreg.QueryValueEx(key, "ProcessorNameString")
        winreg.CloseKey(key)
        return name.strip()
    except Exception:
        return platform.processor() or "N/A"


def collect_payload(config):
    vm = psutil.virtual_memory()
    disk = psutil.disk_usage("C:\\")
    return {
        "hostname": config["hostname_override"] or platform.node(),
        "current_user": os.environ.get("USERNAME", "unknown"),
        "ip_address": get_ip(),
        "os_version": f"{platform.system()} {platform.release()}",
        "ram_total_gb": round(vm.total / (1024**3), 2),
        "ram_free_gb": round(vm.available / (1024**3), 2),
        "cpu_model": get_cpu_name(),
        "disk_c_free_gb": round(disk.free / (1024**3), 2),
        "uptime_seconds": int(time.time() - psutil.boot_time()),
        "internet_ok": ping_internet(),
        "glpi_status": glpi_status(),
        "agent_version": "0.1.0",
        "gateway": "",
        "dns_servers": [],
        "top_processes": get_top_processes(),
        "important_services": [{"name": "GLPI Agent", "status": glpi_status()}],
        "mac_address": get_mac(),
    }


def post(config, endpoint, payload):
    headers = {}
    if config.get("token"):
        headers["Authorization"] = f"Bearer {config['token']}"
        headers["X-API-Key"] = config["token"]
    response = requests.post(
        f"{config['server_url'].rstrip('/')}{endpoint}",
        json=payload,
        headers=headers,
        timeout=20,
    )
    response.raise_for_status()
    return response.json()


def run_once(config):
    payload = collect_payload(config)
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
    print(f"Reporte enviado: device={device['id']} diagnostic={diagnostic['diagnostic_id']}")


def main():
    config = load_config()
    interval = int(config.get("report_interval_seconds", 120))
    while True:
        try:
            run_once(config)
        except Exception as exc:
            print(f"Error agente: {exc}")
        time.sleep(interval)


if __name__ == "__main__":
    main()
