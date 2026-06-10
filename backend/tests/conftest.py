"""Configuración de pytest: DB de pruebas aislada y fixtures de autenticación."""
import os

# IMPORTANTE: configurar el entorno ANTES de importar la app.
os.environ["DATABASE_URL"] = "sqlite:///./test_ti_diagnostic.db"
os.environ["ALLOW_SEED_DATA"] = "true"
os.environ["API_KEY"] = ""  # auth de agentes desactivada en pruebas
os.environ["JWT_SECRET"] = "test-secret"

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app.database import Base, engine  # noqa: E402
from app.main import app  # noqa: E402


@pytest.fixture(scope="session", autouse=True)
def _setup_database():
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    yield
    Base.metadata.drop_all(bind=engine)
    try:
        os.remove("test_ti_diagnostic.db")
    except OSError:
        pass


@pytest.fixture()
def client():
    # El context manager dispara el lifespan → seed de admin/settings/categorías.
    with TestClient(app) as c:
        yield c


@pytest.fixture()
def admin_token(client):
    resp = client.post(
        "/api/auth/login", json={"username": "admin", "password": "admin123"}
    )
    assert resp.status_code == 200, resp.text
    return resp.json()["access_token"]


@pytest.fixture()
def auth_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}
