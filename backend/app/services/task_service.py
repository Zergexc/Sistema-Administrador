import json

from sqlalchemy.orm import Session

from .. import models


def create_diagnostic_task(db: Session, device_id: int) -> models.Task:
    task = models.Task(
        device_id=device_id,
        task_type="diagnostic",
        status="pending",
        payload=json.dumps({"requested_by": "panel"}),
    )
    db.add(task)
    db.commit()
    db.refresh(task)
    return task


# Acciones remotas que el panel puede encolar para el agente.
REMOTE_ACTIONS = {"restart", "shutdown", "logoff", "message"}


def create_action_task(
    db: Session,
    device_id: int,
    action: str,
    message: str | None = None,
    delay_seconds: int = 30,
    requested_by: str = "panel",
) -> models.Task:
    """Encola una acción remota (reiniciar, apagar, cerrar sesión, mensaje)."""
    task = models.Task(
        device_id=device_id,
        task_type=action,
        status="pending",
        payload=json.dumps(
            {
                "message": message or "",
                "delay_seconds": delay_seconds,
                "requested_by": requested_by,
            }
        ),
    )
    db.add(task)
    db.commit()
    db.refresh(task)
    return task


def get_pending_tasks(db: Session, device_id: int) -> list[models.Task]:
    return (
        db.query(models.Task)
        .filter(
            models.Task.device_id == device_id,
            models.Task.status == "pending",
        )
        .order_by(models.Task.created_at.asc())
        .all()
    )


def complete_task(db: Session, task_id: int, result: str) -> models.Task | None:
    task = db.query(models.Task).filter(models.Task.id == task_id).first()
    if not task:
        return None
    task.status = "done"
    task.result = result
    db.commit()
    db.refresh(task)
    return task
