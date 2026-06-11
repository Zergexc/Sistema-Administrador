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


# ---------------------------------------------------------------------------
# Acciones remotas
# ---------------------------------------------------------------------------
def test_remote_action_flow(client, auth_headers):
    _register_device(client, "PC-ACTION")
    devices = client.get("/api/devices", headers=auth_headers).json()
    dev_id = next(d["id"] for d in devices if d["hostname"] == "PC-ACTION")

    # Encolar un reinicio
    resp = client.post(
        f"/api/devices/{dev_id}/actions",
        json={"action": "restart", "delay_seconds": 60},
        headers=auth_headers,
    )
    assert resp.status_code == 200
    task = resp.json()
    assert task["task_type"] == "restart" and task["status"] == "pending"

    # El agente lo ve en su polling (sin JWT, con API key vacía permitida en tests)
    poll = client.get(f"/api/devices/{dev_id}/tasks")
    assert poll.status_code == 200
    pending = poll.json()["pending_tasks"]
    assert any(t["id"] == task["id"] for t in pending)

    # El agente lo completa
    done = client.post(f"/api/tasks/{task['id']}/complete", json={"status": "ok"})
    assert done.status_code == 200
    assert client.get(f"/api/devices/{dev_id}/tasks").json()["pending_tasks"] == []

    # Historial de acciones visible en el panel
    actions = client.get(f"/api/devices/{dev_id}/actions", headers=auth_headers).json()
    assert any(a["id"] == task["id"] and a["status"] == "done" for a in actions)


def test_remote_action_validations(client, auth_headers):
    _register_device(client, "PC-ACTION2")
    devices = client.get("/api/devices", headers=auth_headers).json()
    dev_id = next(d["id"] for d in devices if d["hostname"] == "PC-ACTION2")

    # Acción desconocida
    bad = client.post(
        f"/api/devices/{dev_id}/actions",
        json={"action": "format_c"},
        headers=auth_headers,
    )
    assert bad.status_code == 400

    # Mensaje vacío
    bad2 = client.post(
        f"/api/devices/{dev_id}/actions",
        json={"action": "message", "message": "  "},
        headers=auth_headers,
    )
    assert bad2.status_code == 400


def test_viewer_cannot_queue_actions(client, auth_headers):
    _register_device(client, "PC-ACTION3")
    devices = client.get("/api/devices", headers=auth_headers).json()
    dev_id = next(d["id"] for d in devices if d["hostname"] == "PC-ACTION3")

    client.post(
        "/api/auth/register",
        json={"username": "viewer2", "password": "view123", "role": "viewer"},
        headers=auth_headers,
    )
    token = client.post(
        "/api/auth/login", json={"username": "viewer2", "password": "view123"}
    ).json()["access_token"]
    resp = client.post(
        f"/api/devices/{dev_id}/actions",
        json={"action": "restart"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 403


# ---------------------------------------------------------------------------
# Detección de cambios hardware/software
# ---------------------------------------------------------------------------
def test_change_detection(client, auth_headers):
    _register_device(client, "PC-CHANGES")

    # Segundo reporte: menos RAM, un programa nuevo y Chrome desinstalado.
    payload = {
        "hostname": "PC-CHANGES",
        "ram_total_gb": 8.0,  # antes 16 → baja de RAM (alerta crítica)
        "ram_free_gb": 4.0,
        "installed_programs": [
            {"name": "VLC Media Player", "version": "3.0", "publisher": "VideoLAN"},
        ],
        "internet_ok": True,
        "glpi_status": "running",
    }
    assert client.post("/api/devices/register", json=payload).status_code == 200

    devices = client.get("/api/devices", headers=auth_headers).json()
    dev_id = next(d["id"] for d in devices if d["hostname"] == "PC-CHANGES")

    changes = client.get(f"/api/devices/{dev_id}/changes", headers=auth_headers).json()
    types = {c["change_type"] for c in changes}
    assert "ram_changed" in types
    assert "program_installed" in types
    assert "program_removed" in types

    # La baja de RAM genera alerta crítica persistente
    alerts = client.get(
        f"/api/alerts?active=true&device_id={dev_id}", headers=auth_headers
    ).json()
    hw = [a for a in alerts if a["code"] == "HARDWARE_CHANGE"]
    assert hw and hw[0]["severity"] == "critical"

    # Un reporte posterior sin cambios NO resuelve la alerta (es persistente)
    client.post("/api/devices/register", json=payload)
    alerts2 = client.get(
        f"/api/alerts?active=true&device_id={dev_id}", headers=auth_headers
    ).json()
    assert any(a["code"] == "HARDWARE_CHANGE" for a in alerts2)

    # Feed global de cambios
    feed = client.get("/api/changes", headers=auth_headers).json()
    assert any(c["device_id"] == dev_id for c in feed)


# ---------------------------------------------------------------------------
# QR de inventario
# ---------------------------------------------------------------------------
def test_inventory_qr(client, auth_headers):
    cats = client.get("/api/inventory/categories", headers=auth_headers).json()
    created = client.post(
        "/api/inventory/items",
        json={"category_id": cats[0]["id"], "name": "Mouse Logitech"},
        headers=auth_headers,
    )
    item_id = created.json()["id"]

    qr = client.get(
        f"/api/inventory/items/{item_id}/qr?base=http://192.168.10.101:5173",
        headers=auth_headers,
    )
    assert qr.status_code == 200
    assert qr.headers["content-type"] == "image/png"
    assert qr.content[:8] == b"\x89PNG\r\n\x1a\n"  # firma PNG

    assert (
        client.get("/api/inventory/items/99999/qr", headers=auth_headers).status_code
        == 404
    )


# ---------------------------------------------------------------------------
# Importación Excel Multi-hoja
# ---------------------------------------------------------------------------
def test_import_excel_multi_sheet(client, auth_headers):
    from openpyxl import Workbook
    import io

    cats = client.get("/api/inventory/categories", headers=auth_headers).json()
    cat_id = cats[0]["id"]

    wb = Workbook()
    
    # Primera pestaña: Microsoft 365 Business Basic
    ws1 = wb.active
    ws1.title = "Microsoft 365 Business Basic"
    ws1.append(["Nombre", "Correo", "Estado"])
    ws1.append(["Juan Perez", "juan.perez@example.com", "Activo"])
    ws1.append(["Maria Lopez", "maria.lopez@example.com", "Reparación"])

    # Segunda pestaña: Microsoft 365 F1
    ws2 = wb.create_sheet(title="Microsoft 365 F1")
    ws2.append(["Nombre", "Correo", "Estado"])
    ws2.append(["Pedro Gomez", "pedro.gomez@example.com", "Retirado"])

    buf = io.BytesIO()
    wb.save(buf)
    excel_bytes = buf.getvalue()

    resp = client.post(
        "/api/inventory/import",
        data={"category_id": cat_id},
        files={"file": ("test.xlsx", excel_bytes, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")},
        headers=auth_headers,
    )
    assert resp.status_code == 200
    res_data = resp.json()
    assert res_data["status"] == "ok"
    assert res_data["created"] == 3

    # Verificar items en la base de datos
    items = client.get(f"/api/inventory/items?category={cat_id}", headers=auth_headers).json()
    
    # Comprobar el mapeo de los items creados
    juan = next(it for it in items if it["name"] == "juan.perez@example.com")
    assert juan["assigned_to"] == "Juan Perez"
    assert juan["model"] == "Microsoft 365 Business Basic"
    assert juan["status"] == "active"

    maria = next(it for it in items if it["name"] == "maria.lopez@example.com")
    assert maria["assigned_to"] == "Maria Lopez"
    assert maria["model"] == "Microsoft 365 Business Basic"
    assert maria["status"] == "in_repair"

    pedro = next(it for it in items if it["name"] == "pedro.gomez@example.com")
    assert pedro["assigned_to"] == "Pedro Gomez"
    assert pedro["model"] == "Microsoft 365 F1"
    assert pedro["status"] == "retired"

