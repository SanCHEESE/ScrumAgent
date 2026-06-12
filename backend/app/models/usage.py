"""Per-call LLM/STT/embedding usage events (ScrumAgent-307).

One row per provider call, written by the LLM gateway (ScrumAgent-wqj). The
Settings → Billing endpoint aggregates these into cycle totals, per-category
and per-model breakdowns. ``run_id`` groups the calls of one agent invocation
(e.g. one meeting run) so cost can be attributed per run.
"""
from __future__ import annotations

from sqlalchemy import Enum as SAEnum, Float, ForeignKey, String

from app.database import Base
from app.models.types import TimestampMixin, UsageKind, UUIDPKMixin
from sqlalchemy.orm import Mapped, mapped_column


class LlmUsage(UUIDPKMixin, TimestampMixin, Base):
    __tablename__ = "llm_usage"

    project_id: Mapped[str] = mapped_column(
        ForeignKey("projects.id"), nullable=False, index=True
    )
    run_id: Mapped[str | None] = mapped_column(String(64), index=True)
    # Human-readable attribution, e.g. the meeting title the run belonged to.
    context: Mapped[str | None] = mapped_column(String(255))

    provider: Mapped[str] = mapped_column(String(32), nullable=False)
    model: Mapped[str] = mapped_column(String(128), nullable=False)
    kind: Mapped[UsageKind] = mapped_column(
        SAEnum(UsageKind, native_enum=False), nullable=False
    )
    # Spend category for the breakdown bar: orchestrator / subagents / whisper /
    # embeddings / storage. Free-form so new categories don't need a migration.
    category: Mapped[str] = mapped_column(String(32), nullable=False)

    # Units depend on kind: millions of tokens for llm/embed, minutes for stt.
    input_units: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    output_units: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    cost_usd: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
