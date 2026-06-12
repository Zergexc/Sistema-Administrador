from datetime import date, datetime, timezone

from sqlalchemy import Boolean, Date, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .database import Base


def utcnow() -> datetime:
    """Devuelve la hora actual en UTC (timezone-aware)."""
    return datetime.now(timezone.utc)


def to_naive(dt: datetime | None) -> datetime | None:
    """Normaliza a naive-UTC para comparar con valores leídos de SQLite.

    SQLite guarda los DateTime sin zona horaria; al comparar en Python hay que
    igualar la "awareness" de ambos lados para evitar TypeError.
    """
    if dt is not None and dt.tzinfo is not None:
        return dt.astimezone(timezone.utc).replace(tzinfo=None)
    return dt


class Device(Base):
    __tablename__ = "devices"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    hostname: Mapped[str] = mapped_column(String(120), unique=True, index=True)
    current_user: Mapped[str | None] = mapped_column(String(120), nullable=True)
    ip_address: Mapped[str | None] = mapped_column(String(64), nullable=True)
    os_version: Mapped[str | None] = mapped_column(String(255), nullable=True)
    ram_total_gb: Mapped[float | None] = mapped_column(Float, nullable=True)
    ram_free_gb: Mapped[float | None] = mapped_column(Float, nullable=True)
    cpu_model: Mapped[str | None] = mapped_column(String(255), nullable=True)
    disk_c_free_gb: Mapped[float | None] = mapped_column(Float, nullable=True)
    mac_address: Mapped[str | None] = mapped_column(String(32), nullable=True)
    uptime_seconds: Mapped[int | None] = mapped_column(Integer, nullable=True)
    internet_ok: Mapped[bool] = mapped_column(Boolean, default=True)
    glpi_status: Mapped[str | None] = mapped_column(String(64), nullable=True)
    agent_version: Mapped[str | None] = mapped_column(String(32), nullable=True)

    # Métricas extendidas (Fase 5)
    cpu_percent: Mapped[float | None] = mapped_column(Float, nullable=True)
    cpu_cores: Mapped[int | None] = mapped_column(Integer, nullable=True)
    cpu_freq_mhz: Mapped[float | None] = mapped_column(Float, nullable=True)
    disk_total_gb: Mapped[float | None] = mapped_column(Float, nullable=True)
    disk_used_percent: Mapped[float | None] = mapped_column(Float, nullable=True)

    # Umbrales individuales que sobreescriben los globales (Fase 8). Null = usar global.
    alert_disk_min_free_gb: Mapped[float | None] = mapped_column(Float, nullable=True)
    alert_ram_min_free_gb: Mapped[float | None] = mapped_column(Float, nullable=True)

    last_seen: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=utcnow, onupdate=utcnow
    )

    diagnostics: Mapped[list["Diagnostic"]] = relationship(
        "Diagnostic", back_populates="device", cascade="all, delete-orphan"
    )
    alerts: Mapped[list["Alert"]] = relationship(
        "Alert", back_populates="device", cascade="all, delete-orphan"
    )
    tasks: Mapped[list["Task"]] = relationship(
        "Task", back_populates="device", cascade="all, delete-orphan"
    )
    snapshots: Mapped[list["DeviceSnapshot"]] = relationship(
        "DeviceSnapshot", back_populates="device", cascade="all, delete-orphan"
    )
    programs: Mapped[list["InstalledProgram"]] = relationship(
        "InstalledProgram", back_populates="device", cascade="all, delete-orphan"
    )
    power_events: Mapped[list["PowerEvent"]] = relationship(
        "PowerEvent", back_populates="device", cascade="all, delete-orphan"
    )
    disks: Mapped[list["DiskInfo"]] = relationship(
        "DiskInfo", back_populates="device", cascade="all, delete-orphan"
    )
    changes: Mapped[list["ChangeEvent"]] = relationship(
        "ChangeEvent", back_populates="device", cascade="all, delete-orphan"
    )


class Diagnostic(Base):
    __tablename__ = "diagnostics"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    device_id: Mapped[int] = mapped_column(ForeignKey("devices.id"), index=True)
    summary: Mapped[str | None] = mapped_column(String(255), nullable=True)
    alerts_detected: Mapped[str | None] = mapped_column(Text, nullable=True)
    result_json: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)

    device: Mapped["Device"] = relationship("Device", back_populates="diagnostics")


class Alert(Base):
    __tablename__ = "alerts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    device_id: Mapped[int] = mapped_column(ForeignKey("devices.id"), index=True)
    code: Mapped[str] = mapped_column(String(64), index=True)
    message: Mapped[str] = mapped_column(String(255))
    severity: Mapped[str] = mapped_column(String(16), default="warning")
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)

    # Resolución manual / automática (Fase 8)
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    resolved_by: Mapped[str | None] = mapped_column(String(120), nullable=True)
    resolution_note: Mapped[str | None] = mapped_column(String(255), nullable=True)

    device: Mapped["Device"] = relationship("Device", back_populates="alerts")


class Setting(Base):
    __tablename__ = "settings"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, default=1)
    report_interval_seconds: Mapped[int] = mapped_column(Integer, default=120)
    disk_min_free_gb: Mapped[float] = mapped_column(Float, default=15.0)
    offline_after_minutes: Mapped[int] = mapped_column(Integer, default=5)
    ui_theme: Mapped[str] = mapped_column(String(32), default="default")

    # Notificaciones externas (Fase 8)
    notifications_enabled: Mapped[bool] = mapped_column(Boolean, default=False)
    smtp_host: Mapped[str | None] = mapped_column(String(255), nullable=True)
    smtp_port: Mapped[int | None] = mapped_column(Integer, nullable=True)
    smtp_user: Mapped[str | None] = mapped_column(String(255), nullable=True)
    smtp_password: Mapped[str | None] = mapped_column(String(255), nullable=True)
    smtp_use_tls: Mapped[bool] = mapped_column(Boolean, default=True)
    smtp_from: Mapped[str | None] = mapped_column(String(255), nullable=True)
    alert_email_to: Mapped[str | None] = mapped_column(String(512), nullable=True)
    webhook_url: Mapped[str | None] = mapped_column(String(512), nullable=True)

    # Integración GLPI
    glpi_enabled: Mapped[bool] = mapped_column(Boolean, default=False)
    glpi_url: Mapped[str | None] = mapped_column(String(255), nullable=True)
    glpi_app_token: Mapped[str | None] = mapped_column(String(255), nullable=True)
    glpi_user_token: Mapped[str | None] = mapped_column(String(255), nullable=True)
    glpi_username: Mapped[str | None] = mapped_column(String(255), nullable=True)
    glpi_password: Mapped[str | None] = mapped_column(String(255), nullable=True)

    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=utcnow, onupdate=utcnow
    )


class Task(Base):
    __tablename__ = "tasks"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    device_id: Mapped[int] = mapped_column(ForeignKey("devices.id"), index=True)
    task_type: Mapped[str] = mapped_column(String(64), default="diagnostic")
    status: Mapped[str] = mapped_column(String(32), default="pending")
    payload: Mapped[str | None] = mapped_column(Text, nullable=True)
    result: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=utcnow, onupdate=utcnow
    )

    device: Mapped["Device"] = relationship("Device", back_populates="tasks")


class User(Base):
    """Usuario del panel (Fase 3)."""

    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    username: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    full_name: Mapped[str | None] = mapped_column(String(120), nullable=True)
    hashed_password: Mapped[str] = mapped_column(String(255))
    role: Mapped[str] = mapped_column(String(16), default="viewer")  # admin | viewer
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    needs_password_change: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class DeviceSnapshot(Base):
    """Historial temporal de métricas para gráficas (Fase 5)."""

    __tablename__ = "device_snapshots"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    device_id: Mapped[int] = mapped_column(ForeignKey("devices.id"), index=True)
    cpu_percent: Mapped[float | None] = mapped_column(Float, nullable=True)
    ram_used_percent: Mapped[float | None] = mapped_column(Float, nullable=True)
    disk_used_percent: Mapped[float | None] = mapped_column(Float, nullable=True)
    timestamp: Mapped[datetime] = mapped_column(DateTime, default=utcnow, index=True)

    device: Mapped["Device"] = relationship("Device", back_populates="snapshots")


class InstalledProgram(Base):
    """Programas instalados en cada equipo (Fase 5)."""

    __tablename__ = "installed_programs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    device_id: Mapped[int] = mapped_column(ForeignKey("devices.id"), index=True)
    name: Mapped[str] = mapped_column(String(255))
    version: Mapped[str | None] = mapped_column(String(64), nullable=True)
    publisher: Mapped[str | None] = mapped_column(String(255), nullable=True)
    last_seen: Mapped[datetime] = mapped_column(DateTime, default=utcnow)

    device: Mapped["Device"] = relationship("Device", back_populates="programs")


class PowerEvent(Base):
    """Eventos de encendido/apagado/suspensión (Fase 5)."""

    __tablename__ = "power_events"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    device_id: Mapped[int] = mapped_column(ForeignKey("devices.id"), index=True)
    # startup, shutdown, sleep, wake, unexpected_shutdown
    event_type: Mapped[str] = mapped_column(String(32), index=True)
    timestamp: Mapped[datetime] = mapped_column(DateTime, default=utcnow, index=True)

    device: Mapped["Device"] = relationship("Device", back_populates="power_events")


class DiskInfo(Base):
    """Info de cada disco/partición (Fase 5)."""

    __tablename__ = "disk_info"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    device_id: Mapped[int] = mapped_column(ForeignKey("devices.id"), index=True)
    mount_point: Mapped[str] = mapped_column(String(16))  # "C:\\", "D:\\"
    total_gb: Mapped[float | None] = mapped_column(Float, nullable=True)
    free_gb: Mapped[float | None] = mapped_column(Float, nullable=True)
    percent_used: Mapped[float | None] = mapped_column(Float, nullable=True)
    last_updated: Mapped[datetime] = mapped_column(DateTime, default=utcnow)

    device: Mapped["Device"] = relationship("Device", back_populates="disks")


class ChangeEvent(Base):
    """Cambios de hardware/software detectados entre reportes del agente."""

    __tablename__ = "change_events"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    device_id: Mapped[int] = mapped_column(ForeignKey("devices.id"), index=True)
    # program_installed, program_removed, program_updated,
    # ram_changed, cpu_changed, storage_changed
    change_type: Mapped[str] = mapped_column(String(32), index=True)
    old_value: Mapped[str | None] = mapped_column(String(255), nullable=True)
    new_value: Mapped[str | None] = mapped_column(String(255), nullable=True)
    details: Mapped[str] = mapped_column(String(512))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, index=True)

    device: Mapped["Device"] = relationship("Device", back_populates="changes")


class InventoryCategory(Base):
    """Categorías de inventario (Fase 7)."""

    __tablename__ = "inventory_categories"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(120), unique=True, index=True)
    description: Mapped[str | None] = mapped_column(String(255), nullable=True)
    icon: Mapped[str | None] = mapped_column(String(64), nullable=True)
    # JSON: [{"key": "serial", "label": "Nro Serie", "type": "text"}]
    fields_schema: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)

    items: Mapped[list["InventoryItem"]] = relationship(
        "InventoryItem", back_populates="category", cascade="all, delete-orphan"
    )


class InventoryItem(Base):
    """Items de inventario (Fase 7)."""

    __tablename__ = "inventory_items"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    category_id: Mapped[int] = mapped_column(
        ForeignKey("inventory_categories.id"), index=True
    )
    name: Mapped[str] = mapped_column(String(255))
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    serial_number: Mapped[str | None] = mapped_column(String(120), nullable=True)
    brand: Mapped[str | None] = mapped_column(String(120), nullable=True)
    model: Mapped[str | None] = mapped_column(String(120), nullable=True)
    # active, in_repair, retired, lost
    status: Mapped[str] = mapped_column(String(32), default="active")
    location: Mapped[str | None] = mapped_column(String(120), nullable=True)
    assigned_to: Mapped[str | None] = mapped_column(String(120), nullable=True)
    device_id: Mapped[int | None] = mapped_column(
        ForeignKey("devices.id"), nullable=True
    )
    purchase_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    warranty_until: Mapped[date | None] = mapped_column(Date, nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    custom_fields: Mapped[str | None] = mapped_column(Text, nullable=True)  # JSON
    photo_url: Mapped[str | None] = mapped_column(String(512), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=utcnow, onupdate=utcnow
    )

    category: Mapped["InventoryCategory"] = relationship(
        "InventoryCategory", back_populates="items"
    )
    history: Mapped[list["InventoryHistory"]] = relationship(
        "InventoryHistory", back_populates="item", cascade="all, delete-orphan"
    )


class InventoryHistory(Base):
    """Historial de cambios en items de inventario (Fase 7)."""

    __tablename__ = "inventory_history"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    item_id: Mapped[int] = mapped_column(ForeignKey("inventory_items.id"), index=True)
    # created, updated, assigned, unassigned, status_change
    action: Mapped[str] = mapped_column(String(32))
    details: Mapped[str | None] = mapped_column(Text, nullable=True)
    changed_by: Mapped[str | None] = mapped_column(String(120), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)

    item: Mapped["InventoryItem"] = relationship(
        "InventoryItem", back_populates="history"
    )
