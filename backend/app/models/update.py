from __future__ import annotations

from sqlalchemy import Enum as SAEnum, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base
from app.models.types import (
    JSONType,
    TimestampMixin,
    UpdateStatus,
    UpdateTarget,
    UUIDPKMixin,
)


class Update(UUIDPKMixin, TimestampMixin, Base):
    __tablename__ = "updates"

    target: Mapped[UpdateTarget] = mapped_column(
        SAEnum(UpdateTarget, native_enum=False), nullable=False
    )
    action: Mapped[str] = mapped_column(String(128), nullable=False)
    payload: Mapped[dict | None] = mapped_column(JSONType)
    status: Mapped[UpdateStatus] = mapped_column(
        SAEnum(UpdateStatus, native_enum=False),
        default=UpdateStatus.staged,
        nullable=False,
    )
    source_run_id: Mapped[str | None] = mapped_column(ForeignKey("trace_runs.id"))
