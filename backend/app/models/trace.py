from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, Enum as SAEnum, ForeignKey, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.types import JSONType, RunStatus, StepKind, UUIDPKMixin


class TraceRun(UUIDPKMixin, Base):
    __tablename__ = "trace_runs"

    entry_agent: Mapped[str] = mapped_column(String(64), nullable=False)
    started_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    status: Mapped[RunStatus] = mapped_column(
        SAEnum(RunStatus, native_enum=False),
        default=RunStatus.running,
        nullable=False,
    )

    steps: Mapped[list["TraceStep"]] = relationship(
        back_populates="run", order_by="TraceStep.ts", cascade="all, delete-orphan"
    )


class TraceStep(UUIDPKMixin, Base):
    __tablename__ = "trace_steps"

    run_id: Mapped[str] = mapped_column(ForeignKey("trace_runs.id"), nullable=False)
    agent: Mapped[str] = mapped_column(String(64), nullable=False)
    kind: Mapped[StepKind] = mapped_column(
        SAEnum(StepKind, native_enum=False), nullable=False
    )
    input: Mapped[dict | None] = mapped_column(JSONType)
    output: Mapped[dict | None] = mapped_column(JSONType)
    ts: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    run: Mapped["TraceRun"] = relationship(back_populates="steps")
