"""ORM models.

Currently only ``User`` — the minimum the OAuth login flow (ScrumAgent-u2b)
needs to upsert and reference a signed-in person. The full domain schema
(threads, messages, traces, …) lands with ScrumAgent-67j and attaches to the
same ``Base``.
"""
from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    # Google's stable subject id — the join key for repeat logins.
    google_sub: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    email: Mapped[str] = mapped_column(String(320), index=True)
    name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
