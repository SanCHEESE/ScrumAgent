from __future__ import annotations

from datetime import datetime

from sqlalchemy import (
    Boolean,
    DateTime,
    Enum as SAEnum,
    ForeignKey,
    String,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.types import ArtifactType, JSONType, UUIDPKMixin


class Meeting(UUIDPKMixin, Base):
    __tablename__ = "meetings"

    google_event_id: Mapped[str] = mapped_column(
        String(255), unique=True, nullable=False
    )
    title: Mapped[str | None] = mapped_column(String(512))
    start: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    end: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    organizer: Mapped[str | None] = mapped_column(String(320))
    attendees: Mapped[list | None] = mapped_column(JSONType)
    has_meet: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    artifacts: Mapped[list["MeetingArtifact"]] = relationship(
        back_populates="meeting", cascade="all, delete-orphan"
    )


class MeetingArtifact(UUIDPKMixin, Base):
    __tablename__ = "meeting_artifacts"

    meeting_id: Mapped[str] = mapped_column(ForeignKey("meetings.id"), nullable=False)
    type: Mapped[ArtifactType] = mapped_column(
        SAEnum(ArtifactType, native_enum=False), nullable=False
    )
    source: Mapped[str | None] = mapped_column(String(255))
    content_ref: Mapped[str | None] = mapped_column(String(1024))
    fetched_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    meeting: Mapped["Meeting"] = relationship(back_populates="artifacts")
