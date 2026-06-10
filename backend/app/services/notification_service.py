"""Notificaciones externas: email (SMTP) y webhook (Teams/Slack) — Fase 8.

Los envíos son best-effort y se ejecutan en un hilo daemon para no bloquear
el reporte del agente. Los errores se registran pero no se propagan.
"""
import json
import logging
import smtplib
import threading
import urllib.request
from dataclasses import dataclass
from email.message import EmailMessage

from .. import models

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class NotifyConfig:
    """Snapshot plano de la configuración de notificaciones.

    Se copia ANTES de lanzar el hilo para no tocar el objeto SQLAlchemy
    fuera de la sesión (evita DetachedInstanceError).
    """

    smtp_host: str | None
    smtp_port: int | None
    smtp_user: str | None
    smtp_password: str | None
    smtp_use_tls: bool
    smtp_from: str | None
    alert_email_to: str | None
    webhook_url: str | None


def _send_email_sync(cfg: NotifyConfig, subject: str, body: str) -> None:
    if not cfg.smtp_host or not cfg.alert_email_to:
        return
    recipients = [r.strip() for r in (cfg.alert_email_to or "").split(",") if r.strip()]
    if not recipients:
        return

    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = cfg.smtp_from or (cfg.smtp_user or "ti-panel@local")
    msg["To"] = ", ".join(recipients)
    msg.set_content(body)

    port = cfg.smtp_port or (587 if cfg.smtp_use_tls else 25)
    try:
        with smtplib.SMTP(cfg.smtp_host, port, timeout=15) as server:
            if cfg.smtp_use_tls:
                server.starttls()
            if cfg.smtp_user and cfg.smtp_password:
                server.login(cfg.smtp_user, cfg.smtp_password)
            server.send_message(msg)
        logger.info("Email de alerta enviado a %s", recipients)
    except Exception as exc:  # noqa: BLE001 - best-effort
        logger.warning("No se pudo enviar email de alerta: %s", exc)


def _send_webhook_sync(url: str, payload: dict) -> None:
    try:
        data = json.dumps(payload).encode("utf-8")
        req = urllib.request.Request(
            url, data=data, headers={"Content-Type": "application/json"}
        )
        urllib.request.urlopen(req, timeout=15).read()
        logger.info("Webhook de alerta disparado")
    except Exception as exc:  # noqa: BLE001 - best-effort
        logger.warning("No se pudo disparar el webhook de alerta: %s", exc)


def notify_alert(
    settings: models.Setting | None, device_hostname: str, code: str, message: str
) -> None:
    """Dispara email y webhook para una alerta crítica, en segundo plano."""
    if not settings or not settings.notifications_enabled:
        return

    # Copia los valores AHORA, dentro de la sesión activa.
    cfg = NotifyConfig(
        smtp_host=settings.smtp_host,
        smtp_port=settings.smtp_port,
        smtp_user=settings.smtp_user,
        smtp_password=settings.smtp_password,
        smtp_use_tls=bool(settings.smtp_use_tls),
        smtp_from=settings.smtp_from,
        alert_email_to=settings.alert_email_to,
        webhook_url=settings.webhook_url,
    )

    subject = f"[TI Panel] Alerta {code} en {device_hostname}"
    body = (
        f"Se detectó una alerta en el equipo {device_hostname}.\n\n"
        f"Código: {code}\nDetalle: {message}\n"
    )

    def _worker() -> None:
        _send_email_sync(cfg, subject, body)
        if cfg.webhook_url:
            # Formato compatible con Slack/Teams (campo "text").
            _send_webhook_sync(cfg.webhook_url, {"text": f"⚠️ {subject}\n{message}"})

    threading.Thread(target=_worker, daemon=True).start()
