"""Tests de los endpoints principales (Fases 3-8)."""


def _register_device(client, hostname="PC-TEST"):
    payload = {
        "hostname": hostname,
        "current_user": "tester",
        "ip_address": "192.168.1.50",
        "os_version": "Windows 11",
        "ram_total_gb": 16.0,
        "ram_free_gb": 8.0,
        "cpu_model": "Intel i7",
        "cpu_percent": 25.0,
        "disk_c_free_gb": 120.0,
        "mac_address": "AA:BB:CC:DD:EE:FF",
        "internet_ok": True,
        "glpi_status": "running",
        "disks": [
            {"mount": "C:\\", "total_gb": 240.0, "free_gb": 120.0, "percent": 50.0},
            {"mount": "D:\\", "total_gb": 500.0, "free_gb": 100.0, "percent": 80.0},
        ],
        "installed_programs": [
            {"name": "Google Chrome", "version": "126.0", "publisher": "Google"},
        ],
    }
    return client.post("/api/devices/register", json=payload)


# ---------------------------------------------------------------------------
# Salud / Auth
# ---------------------------------------------------------------------------
def test_healthz(client):
    assert client.get("/healthz").json()["status"] == "ok"


def test_login_and_me(client, auth_headers):
    resp = client.get("/api/auth/me", headers=auth_headers)
    assert resp.status_code == 200
    body = resp.json()
    assert body["username"] == "admin"
    assert body["role"] == "admin"


def test_login_bad_credentials(client):
    resp = client.post("/api/auth/login", json={"username": "admin", "password": "x"})
    assert resp.status_code == 401


def test_protected_endpoint_requires_auth(client):
    assert client.get("/api/devices").status_code == 401
    assert client.get("/api/dashboard").status_code == 401


# ---------------------------------------------------------------------------
# Equipos / métricas extendidas
# ---------------------------------------------------------------------------
def test_register_and_list_devices(client, auth_headers):
    assert _register_device(client).status_code == 200
    resp = client.get("/api/devices", headers=auth_headers)
    assert resp.status_code == 200
    hostnames = [d["hostname"] for d in resp.json()]
    assert "PC-TEST" in hostnames


def test_device_detail_has_disks(client, auth_headers):
    _register_device(client, "PC-DISK")
    devices = client.get("/api/devices", headers=auth_headers).json()
    dev = next(d for d in devices if d["hostname"] == "PC-DISK")
    detail = client.get(f"/api/devices/{dev['id']}", headers=auth_headers).json()
    assert len(detail["disks"]) == 2


def test_diagnostic_report_stores_metrics(client, auth_headers):
    _register_device(client, "PC-DIAG")
    report = {
        "hostname": "PC-DIAG",
        "summary": "Reporte de prueba",
        "payload": {
            "cpu_percent": 40.0,
            "ram_total_gb": 16.0,
            "ram_free_gb": 4.0,
            "disk_used_percent": 70.0,
            "installed_programs": [{"name": "VLC", "version": "3.0"}],
            "power_events": [{"event": "startup", "timestamp": "2025-01-15T08:00:00"}],
        },
        "alerts_detected": [],
    }
    assert client.post("/api/diagnostics/report", json=report).status_code == 200
    devices = client.get("/api/devices", headers=auth_headers).json()
    dev = next(d for d in devices if d["hostname"] == "PC-DIAG")

    snaps = client.get(f"/api/devices/{dev['id']}/snapshots?range=24h", headers=auth_headers)
    assert snaps.status_code == 200 and len(snaps.json()) >= 1
    progs = client.get(f"/api/devices/{dev['id']}/programs", headers=auth_headers).json()
    assert any(p["name"] == "VLC" for p in progs)
    events = client.get(f"/api/devices/{dev['id']}/power-events", headers=auth_headers).json()
    assert any(e["event_type"] == "startup" for e in events)


def test_dashboard(client, auth_headers):
    _register_device(client, "PC-DASH")
    resp = client.get("/api/dashboard", headers=auth_headers)
    assert resp.status_code == 200
    body = resp.json()
    for key in ("grid", "os_distribution", "top_ram", "top_cpu", "disk_summary"):
        assert key in body


# ---------------------------------------------------------------------------
# Settings y permisos por rol
# ---------------------------------------------------------------------------
def test_settings_update_admin(client, auth_headers):
    payload = {
        "report_interval_seconds": 90,
        "disk_min_free_gb": 20,
        "offline_after_minutes": 10,
        "ui_theme": "default",
        "notifications_enabled": False,
    }
    resp = client.put("/api/settings", json=payload, headers=auth_headers)
    assert resp.status_code == 200
    assert resp.json()["report_interval_seconds"] == 90


def test_viewer_cannot_update_settings(client, auth_headers):
    # Crea un viewer
    client.post(
        "/api/auth/register",
        json={"username": "viewer1", "password": "view123", "role": "viewer"},
        headers=auth_headers,
    )
    token = client.post(
        "/api/auth/login", json={"username": "viewer1", "password": "view123"}
    ).json()["access_token"]
    vheaders = {"Authorization": f"Bearer {token}"}
    # El viewer puede leer
    assert client.get("/api/settings", headers=vheaders).status_code == 200
    # pero no modificar
    resp = client.put(
        "/api/settings",
        json={
            "report_interval_seconds": 60,
            "disk_min_free_gb": 15,
            "offline_after_minutes": 5,
            "ui_theme": "default",
            "notifications_enabled": False,
        },
        headers=vheaders,
    )
    assert resp.status_code == 403


# ---------------------------------------------------------------------------
# Alertas
# ---------------------------------------------------------------------------
def test_alert_lifecycle(client, auth_headers):
    # Disco crítico → genera alerta
    payload = {
        "hostname": "PC-ALERT",
        "ram_total_gb": 8,
        "ram_free_gb": 4,
        "disk_c_free_gb": 2.0,  # < umbral
        "internet_ok": True,
        "glpi_status": "running",
    }
    client.post("/api/devices/register", json=payload)
    alerts = client.get("/api/alerts?active=true", headers=auth_headers).json()
    low_disk = [a for a in alerts if a["code"] == "LOW_DISK"]
    assert low_disk, "Debe existir una alerta LOW_DISK"

    resolved = client.post(
        f"/api/alerts/{low_disk[0]['id']}/resolve",
        json={"note": "Liberado espacio"},
        headers=auth_headers,
    )
    assert resolved.status_code == 200
    assert resolved.json()["is_active"] is False


# ---------------------------------------------------------------------------
# Inventario
# ---------------------------------------------------------------------------
def test_inventory_flow(client, auth_headers):
    cats = client.get("/api/inventory/categories", headers=auth_headers).json()
    assert len(cats) >= 1  # seed de categorías por defecto
    cat_id = cats[0]["id"]

    created = client.post(
        "/api/inventory/items",
        json={
            "category_id": cat_id,
            "name": "Laptop Dell",
            "serial_number": "SN-123",
            "status": "active",
        },
        headers=auth_headers,
    )
    assert created.status_code == 201
    item_id = created.json()["id"]

    # Cambia estado y asignación → historial
    upd = client.put(
        f"/api/inventory/items/{item_id}",
        json={"status": "in_repair", "assigned_to": "Juan"},
        headers=auth_headers,
    )
    assert upd.status_code == 200
    assert upd.json()["status"] == "in_repair"

    history = client.get(
        f"/api/inventory/items/{item_id}/history", headers=auth_headers
    ).json()
    actions = {h["action"] for h in history}
    assert "created" in actions and "status_change" in actions and "assigned" in actions

    # Filtro por búsqueda
    found = client.get(
        "/api/inventory/items?search=Dell", headers=auth_headers
    ).json()
    assert any(i["id"] == item_id for i in found)

    # Export Excel
    export = client.get("/api/inventory/export", headers=auth_headers)
    assert export.status_code == 200
    assert "spreadsheet" in export.headers["content-type"]
