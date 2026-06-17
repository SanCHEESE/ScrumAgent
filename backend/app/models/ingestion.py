from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, Enum as SAEnum, ForeignKey, Integer, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base
from app.models.types import (
    IngestionStatus,
    IngestionTrigger,
    JSONType,
    TimestampMixin,
    UUIDPKMixin,
)


class IngestionRun(UUIDPKMixin, TimestampMixin, Base):
    __tablename__ = "ingestion_runs"

    project_id: Mapped[str] = mapped_column(
        ForeignKey("projects.id"), index=True, nullable=False
    )
    status: Mapped[IngestionStatus] = mapped_column(
        SAEnum(IngestionStatus, native_enum=False),
        default=IngestionStatus.pending,
        nullable=False,
    )
    trigger: Mapped[IngestionTrigger] = mapped_column(
        SAEnum(IngestionTrigger, native_enum=False), nullable=False
    )
    jira_total: Mapped[int | None] = mapped_column(Integer)
    jira_submitted: Mapped[int | None] = mapped_column(Integer)
    notion_total: Mapped[int | None] = mapped_column(Integer)
    notion_submitted: Mapped[int | None] = mapped_column(Integer)
    failed_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    error: Mapped[str | None] = mapped_column(Text)
    errors: Mapped[list | None] = mapped_column(JSONType)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
