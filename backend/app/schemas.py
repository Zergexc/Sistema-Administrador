from datetime import date, datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field


# ---------------------------------------------------------------------------
# Estructuras anidadas del payload del agente
# ---------------------------------------------------------------------------
class TopProcess(BaseModel):
    name: str
    ram_mb: float
    pid: int | None = None
    cpu_percent: float | None = None


class ServiceStatus(BaseModel):
    name: str
    status: str


class DiskEntry(BaseModel):
    mount: str
    total_gb: float | None = None
    free_gb: float | None = None
    percent: float | None = None


class ProgramEntry(BaseModel):
    name: str
    version: str | None = None
    publisher: str | None = None


class PowerEventEntry(BaseModel):
    event: str
    timestamp: str | None = None


# ---------------------------------------------------------------------------
# Registro / heartbeat de equipos (agente). extra="allow" → backward compatible.
# ---------------------------------------------------------------------------
class DeviceRegister(BaseModel):
    model_config = ConfigDict(extra="allow")

    hostname: str
    current_user: str | None = None
    ip_address: str | None = None
    os_version: str | None = None
    ram_total_gb: float | None = None
    ram_free_gb: float | None = None
    cpu_model: str | None = None
    disk_c_free_gb: float | None = None
    mac_address: str | None = None
    uptime_seconds: int | None = None
    internet_ok: bool = True
    glpi_status: str | None = None
    agent_version: str | None = None

    # Métricas extendidas (Fase 5)
    cpu_percent: float | None = None
    cpu_cores: int | None = None
    cpu_freq_mhz: float | None = None
    disk_total_gb: float | None = None
    disk_used_percent: float | None = None

    gateway: str | None = None
    dns_servers: list[str] = Field(default_factory=list)
    top_processes: list[TopProcess] = Field(default_factory=list)
    important_services: list[ServiceStatus] = Field(default_factory=list)
    disks: list[DiskEntry] = Field(default_factory=list)
    installed_programs: list[ProgramEntry] = Field(default_factory=list)
    power_events: list[PowerEventEntry] = Field(default_factory=list)


class DeviceOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    hostname: str
    current_user: str | None
    ip_address: str | None
    os_version: str | None
    ram_total_gb: float | None
    ram_free_gb: float | None
    cpu_model: str | None
    disk_c_free_gb: float | None
    mac_address: str | None
    uptime_seconds: int | None
    internet_ok: bool
    glpi_status: str | None
    agent_version: str | None
    cpu_percent: float | None = None
    cpu_cores: int | None = None
    cpu_freq_mhz: float | None = None
    disk_total_gb: float | None = None
    disk_used_percent: float | None = None
    alert_disk_min_free_gb: float | None = None
    alert_ram_min_free_gb: float | None = None
    last_seen: datetime


class DeviceDetail(BaseModel):
    device: DeviceOut
    latest_payload: dict[str, Any] = Field(default_factory=dict)
    active_alerts: list[dict[str, Any]] = Field(default_factory=list)
    diagnostics_history: list[dict[str, Any]] = Field(default_factory=list)
    disks: list[dict[str, Any]] = Field(default_factory=list)


class DeviceThresholdUpdate(BaseModel):
    alert_disk_min_free_gb: float | None = Field(default=None, ge=1, le=2000)
    alert_ram_min_free_gb: float | None = Field(default=None, ge=0.1, le=128)


class DiagnosticReport(BaseModel):
    hostname: str
    summary: str | None = None
    payload: dict[str, Any]
    alerts_detected: list[str] = Field(default_factory=list)


class DiagnosticOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    device_id: int
    summary: str | None
    alerts_detected: str | None
    result_json: str
    created_at: datetime


class AlertOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    device_id: int
    code: str
    message: str
    severity: str
    is_active: bool
    created_at: datetime
    resolved_at: datetime | None = None
    resolved_by: str | None = None
    resolution_note: str | None = None


class AlertResolve(BaseModel):
    note: str | None = None


# ---------------------------------------------------------------------------
# Métricas extendidas (Fase 5)
# ---------------------------------------------------------------------------
class SnapshotOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    cpu_percent: float | None
    ram_used_percent: float | None
    disk_used_percent: float | None
    timestamp: datetime


class ProgramOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    version: str | None
    publisher: str | None
    last_seen: datetime


class PowerEventOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    event_type: str
    timestamp: datetime


class DiskInfoOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    mount_point: str
    total_gb: float | None
    free_gb: float | None
    percent_used: float | None
    last_updated: datetime


# ---------------------------------------------------------------------------
# Configuración (Fase 2 + Fase 8)
# ---------------------------------------------------------------------------
class SettingsOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    report_interval_seconds: int
    disk_min_free_gb: float
    offline_after_minutes: int
    ui_theme: str
    notifications_enabled: bool = False
    smtp_host: str | None = None
    smtp_port: int | None = None
    smtp_user: str | None = None
    smtp_use_tls: bool = True
    smtp_from: str | None = None
    alert_email_to: str | None = None
    webhook_url: str | None = None
    glpi_enabled: bool = False
    glpi_url: str | None = None
    glpi_app_token: str | None = None
    glpi_user_token: str | None = None
    glpi_username: str | None = None
    glpi_password: str | None = None


class SettingsUpdate(BaseModel):
    report_interval_seconds: int = Field(ge=30, le=3600)
    disk_min_free_gb: float = Field(ge=1, le=500)
    offline_after_minutes: int = Field(ge=1, le=120)
    ui_theme: str = Field(default="default")
    notifications_enabled: bool = False
    smtp_host: str | None = None
    smtp_port: int | None = Field(default=None, ge=1, le=65535)
    smtp_user: str | None = None
    smtp_password: str | None = None  # solo se escribe si viene no-vacío
    smtp_use_tls: bool = True
    smtp_from: str | None = None
    alert_email_to: str | None = None
    webhook_url: str | None = None
    glpi_enabled: bool = False
    glpi_url: str | None = None
    glpi_app_token: str | None = None
    glpi_user_token: str | None = None
    glpi_username: str | None = None
    glpi_password: str | None = None


class TaskOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    device_id: int
    task_type: str
    status: str
    payload: str | None
    result: str | None
    created_at: datetime
    updated_at: datetime


class ActionRequest(BaseModel):
    """Acción remota encolada desde el panel hacia un agente."""

    action: str  # restart | shutdown | logoff | message
    message: str | None = None
    delay_seconds: int = 30


class ChangeEventOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    device_id: int
    change_type: str
    old_value: str | None
    new_value: str | None
    details: str
    created_at: datetime


# ---------------------------------------------------------------------------
# Autenticación (Fase 3)
# ---------------------------------------------------------------------------
class LoginRequest(BaseModel):
    username: str
    password: str


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"


class UserCreate(BaseModel):
    username: str = Field(min_length=3, max_length=64)
    password: str = Field(min_length=4, max_length=128)
    full_name: str | None = None
    role: str = Field(default="viewer")  # admin | viewer


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    username: str
    full_name: str | None
    role: str
    is_active: bool
    created_at: datetime


class UserUpdate(BaseModel):
    full_name: str | None = None
    role: str | None = None
    is_active: bool | None = None
    password: str | None = Field(default=None, min_length=4, max_length=128)


# ---------------------------------------------------------------------------
# Inventario (Fase 7)
# ---------------------------------------------------------------------------
class CategoryCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    description: str | None = None
    icon: str | None = None
    fields_schema: list[dict[str, Any]] = Field(default_factory=list)


class CategoryUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    description: str | None = None
    icon: str | None = None
    fields_schema: list[dict[str, Any]] | None = None


class CategoryOut(BaseModel):
    id: int
    name: str
    description: str | None
    icon: str | None
    fields_schema: list[dict[str, Any]] = Field(default_factory=list)
    created_at: datetime
    item_count: int = 0


class ItemCreate(BaseModel):
    category_id: int
    name: str = Field(min_length=1, max_length=255)
    description: str | None = None
    serial_number: str | None = None
    brand: str | None = None
    model: str | None = None
    status: str = Field(default="active")
    location: str | None = None
    assigned_to: str | None = None
    device_id: int | None = None
    purchase_date: date | None = None
    warranty_until: date | None = None
    notes: str | None = None
    custom_fields: dict[str, Any] = Field(default_factory=dict)
    photo_url: str | None = None


class ItemUpdate(BaseModel):
    category_id: int | None = None
    name: str | None = Field(default=None, min_length=1, max_length=255)
    description: str | None = None
    serial_number: str | None = None
    brand: str | None = None
    model: str | None = None
    status: str | None = None
    location: str | None = None
    assigned_to: str | None = None
    device_id: int | None = None
    purchase_date: date | None = None
    warranty_until: date | None = None
    notes: str | None = None
    custom_fields: dict[str, Any] | None = None
    photo_url: str | None = None


class ItemOut(BaseModel):
    id: int
    category_id: int
    category_name: str | None = None
    name: str
    description: str | None
    serial_number: str | None
    brand: str | None
    model: str | None
    status: str
    location: str | None
    assigned_to: str | None
    device_id: int | None
    purchase_date: date | None
    warranty_until: date | None
    notes: str | None
    custom_fields: dict[str, Any] = Field(default_factory=dict)
    photo_url: str | None
    created_at: datetime
    updated_at: datetime


class HistoryOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    item_id: int
    action: str
    details: str | None
    changed_by: str | None
    created_at: datetime
