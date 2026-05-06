from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class TopProcess(BaseModel):
    name: str
    ram_mb: float


class ServiceStatus(BaseModel):
    name: str
    status: str


class DeviceRegister(BaseModel):
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
    gateway: str | None = None
    dns_servers: list[str] = Field(default_factory=list)
    top_processes: list[TopProcess] = Field(default_factory=list)
    important_services: list[ServiceStatus] = Field(default_factory=list)


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
    last_seen: datetime


class DeviceDetail(BaseModel):
    device: DeviceOut
    latest_payload: dict[str, Any] = Field(default_factory=dict)
    active_alerts: list[dict[str, Any]] = Field(default_factory=list)
    diagnostics_history: list[dict[str, Any]] = Field(default_factory=list)


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


class SettingsOut(BaseModel):
    report_interval_seconds: int
    disk_min_free_gb: float
    offline_after_minutes: int
    ui_theme: str


class SettingsUpdate(BaseModel):
    report_interval_seconds: int = Field(ge=30, le=3600)
    disk_min_free_gb: float = Field(ge=1, le=500)
    offline_after_minutes: int = Field(ge=1, le=120)
    ui_theme: str = Field(default="default")


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
