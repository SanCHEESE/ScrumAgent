"""Trace store read/write helpers (ScrumAgent-a27). Models in app/models/trace.py."""
from __future__ import annotations

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.trace import TraceRun, TraceStep
from app.models.types import RunStatus, StepKind


def start_run(db: Session, *, entry_agent: str) -> TraceRun:
    run = TraceRun(entry_agent=entry_agent, status=RunStatus.running)
    db.add(run)
    db.flush()
    return run


def record_step(
    db: Session,
    *,
    run_id: str,
    agent: str,
    kind: StepKind,
    input: dict | None = None,
    output: dict | None = None,
) -> TraceStep:
    step = TraceStep(run_id=run_id, agent=agent, kind=kind, input=input, output=output)
    db.add(step)
    db.flush()
    return step


def finish_run(db: Session, *, run_id: str, status: RunStatus) -> None:
    run = db.get(TraceRun, run_id)
    if run is not None:
        run.status = status
        run.finished_at = func.now()
        db.flush()
        db.refresh(run)


def get_run(db: Session, run_id: str) -> TraceRun | None:
    return db.get(TraceRun, run_id)


def list_steps(db: Session, run_id: str) -> list[TraceStep]:
    stmt = select(TraceStep).where(TraceStep.run_id == run_id).order_by(TraceStep.ts)
    return list(db.scalars(stmt))
