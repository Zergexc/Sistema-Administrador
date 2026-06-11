import base64
import requests
from sqlalchemy.orm import Session
from .. import models
from .inventory_service import log_history

def _get_api_url(glpi_url: str) -> str:
    url = glpi_url.strip().rstrip('/')
    if not url.endswith('/apirest.php'):
        url = f"{url}/apirest.php"
    return url

def init_session(settings: models.Setting) -> str:
    base_url = _get_api_url(settings.glpi_url)
    headers = {}
    if settings.glpi_app_token:
        headers["App-Token"] = settings.glpi_app_token

    if settings.glpi_user_token:
        headers["Authorization"] = f"user_token {settings.glpi_user_token}"
    elif settings.glpi_username and settings.glpi_password:
        userpass = f"{settings.glpi_username}:{settings.glpi_password}"
        encoded = base64.b64encode(userpass.encode('utf-8')).decode('utf-8')
        headers["Authorization"] = f"Basic {encoded}"
    else:
        raise ValueError("Se requiere User Token o Usuario/Contraseña para autenticar con GLPI.")

    url = f"{base_url}/initSession"
    resp = requests.get(url, headers=headers, timeout=15)
    if not resp.ok:
        raise Exception(f"Error al iniciar sesión en GLPI ({resp.status_code}): {resp.text}")
    
    data = resp.json()
    if "session_token" not in data:
        raise Exception("Respuesta inválida de GLPI, falta 'session_token'")
    
    return data["session_token"]

def kill_session(glpi_url: str, app_token: str | None, session_token: str) -> None:
    base_url = _get_api_url(glpi_url)
    headers = {"Session-Token": session_token}
    if app_token:
        headers["App-Token"] = app_token
    
    url = f"{base_url}/killSession"
    try:
        requests.get(url, headers=headers, timeout=10)
    except Exception:
        pass

def fetch_computers(settings: models.Setting, session_token: str) -> list[dict]:
    base_url = _get_api_url(settings.glpi_url)
    headers = {
        "Session-Token": session_token,
    }
    if settings.glpi_app_token:
        headers["App-Token"] = settings.glpi_app_token

    computers = []
    range_start = 0
    range_size = 50
    while True:
        url = f"{base_url}/Computer"
        params = {
            "expand_dropdowns": "true",
            "range": f"{range_start}-{range_start + range_size - 1}"
        }
        resp = requests.get(url, headers=headers, params=params, timeout=15)
        if resp.status_code == 400: # Rango fuera de límites
            break
        resp.raise_for_status()
        data = resp.json()
        if not data:
            break
        if isinstance(data, list):
            computers.extend(data)
            if len(data) < range_size:
                break
            range_start += range_size
        else:
            break
            
    return computers

def test_glpi_connection(settings: models.Setting) -> dict:
    try:
        session_token = init_session(settings)
        kill_session(settings.glpi_url, settings.glpi_app_token, session_token)
        return {"status": "success", "message": "Conexión exitosa con GLPI."}
    except Exception as e:
        return {"status": "error", "message": f"Error de conexión: {str(e)}"}

def sync_from_glpi(db: Session, changed_by: str | None = None) -> dict:
    settings = db.query(models.Setting).first()
    if not settings or not settings.glpi_url:
        raise ValueError("La URL de GLPI no está configurada.")

    session_token = init_session(settings)
    try:
        computers = fetch_computers(settings, session_token)
        
        # Obtener id de la categoría Computadoras
        cat = db.query(models.InventoryCategory).filter(models.InventoryCategory.name == "Computadoras").first()
        if not cat:
            cat = db.query(models.InventoryCategory).first()
        category_id = cat.id if cat else 1
        
        created = 0
        updated = 0
        
        for comp in computers:
            name = comp.get("name")
            if not name:
                continue
            name = str(name).strip()
            serial = comp.get("serial")
            if serial:
                serial = str(serial).strip()
                if serial.lower() in ("n/a", "none", "", "null", "unknown", "desconocido"):
                    serial = None
            
            existing = None
            if serial:
                existing = db.query(models.InventoryItem).filter(models.InventoryItem.serial_number == serial).first()
            if not existing:
                existing = db.query(models.InventoryItem).filter(models.InventoryItem.name == name).first()
                
            brand = comp.get("manufacturers_id")
            model = comp.get("computermodels_id")
            location = comp.get("locations_id")
            assigned_to = comp.get("contact") or comp.get("users_id")
            
            if isinstance(brand, dict):
                brand = brand.get("name")
            if isinstance(model, dict):
                model = model.get("name")
            if isinstance(location, dict):
                location = location.get("name")
            if isinstance(assigned_to, dict):
                assigned_to = assigned_to.get("name")
                
            brand_str = str(brand).strip() if brand else None
            model_str = str(model).strip() if model else None
            location_str = str(location).strip() if location else None
            assigned_to_str = str(assigned_to).strip() if assigned_to else None
            
            notes = comp.get("comment") or ""
            notes_str = f"Sincronizado desde GLPI (ID: {comp.get('id')}).\n{notes}".strip()
            
            fields = {
                "name": name,
                "serial_number": serial,
                "brand": brand_str,
                "model": model_str,
                "location": location_str,
                "assigned_to": assigned_to_str,
                "notes": notes_str,
                "status": "active"
            }
            
            if existing:
                for k, v in fields.items():
                    if v is not None:
                        setattr(existing, k, v)
                updated += 1
            else:
                item = models.InventoryItem(category_id=category_id, **fields)
                db.add(item)
                db.flush()
                log_history(db, item.id, "created", f"Sincronizado desde GLPI (ID: {comp.get('id')})", changed_by)
                created += 1
                
        db.commit()
        return {"created": created, "updated": updated}
        
    finally:
        kill_session(settings.glpi_url, settings.glpi_app_token, session_token)
