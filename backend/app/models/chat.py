"""User chat history: conversations grouped per user+agent, append-only messages."""
from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, Enum as SAEnum, ForeignKey, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.types import JSONType, MessageRole, TimestampMixin, UUIDPKMixin

if TYPE_CHECKING:
    from app.models.user import User


class Conversation(UUIDPKMixin, TimestampMixin, Base):
    __tablename__ = "conversations"

    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    agent: Mapped[str] = mapped_column(String(64), nullable=False)
    title: Mapped[str | None] = mapped_column(String(255))
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    user: Mapped["User"] = relationship(back_populates="conversations")
    messages: Mapped[list["Message"]] = relationship(
        back_populates="conversation",
        order_by="Message.id",
        cascade="all, delete-orphan",
    )


class Message(TimestampMixin, Base):
    __tablename__ = "messages"

    # integer autoincrement PK: guaranteed append-order on SQLite and Postgres
    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    conversation_id: Mapped[str] = mapped_column(
        ForeignKey("conversations.id"), nullable=False
    )
    role: Mapped[MessageRole] = mapped_column(
        SAEnum(MessageRole, native_enum=False), nullable=False
    )
    content: Mapped[str] = mapped_column(Text, nullable=False)
    meta: Mapped[dict | None] = mapped_column(JSONType)
    trace_run_id: Mapped[str | None] = mapped_column(ForeignKey("trace_runs.id"))

    conversation: Mapped["Conversation"] = relationship(back_populates="messages")
