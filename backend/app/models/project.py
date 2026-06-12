"""Project domain (ScrumAgent-lb9.1).

A Project bundles an agent Google account with Jira + Notion. Secrets live in a
1:1 ``ProjectCredential`` (Fernet-encrypted at rest), never on ``Project`` itself.
``ProjectMember`` rows make a project show up in each member's project list.
``PendingOAuth`` is the one-shot bridge for authorizing the agent's Google account
*before* the project row exists (consumed at ``POST /projects``).
"""
from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import (
    Boolean,
    DateTime,
    Enum as SAEnum,
    ForeignKey,
    Integer,
    String,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.types import (
    EncryptedString,
    ProjectRole,
    ResponseStyle,
    TimestampMixin,
    UUIDPKMixin,
)

if TYPE_CHECKING:
    from app.models.user import User


class Project(UUIDPKMixin, TimestampMixin, Base):
    __tablename__ = "projects"

    owner_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(String(2000))
    color: Mapped[str] = mapped_column(String(16), default="#0077e6", nullable=False)
    agent_email: Mapped[str] = mapped_column(String(320), nullable=False)
    google_connected: Mapped[bool] = mapped_column(
        Boolean, default=False, nullable=False
    )

    jira_site_url: Mapped[str | None] = mapped_column(String(512))
    jira_user_email: Mapped[str | None] = mapped_column(String(320))
    jira_project_key: Mapped[str | None] = mapped_column(String(64))

    notion_section_url: Mapped[str | None] = mapped_column(String(1024))
    notion_page_id: Mapped[str | None] = mapped_column(String(64))

    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    members: Mapped[list["ProjectMember"]] = relationship(
        back_populates="project", cascade="all, delete-orphan"
    )
    credential: Mapped["ProjectCredential | None"] = relationship(
        back_populates="project", uselist=False, cascade="all, delete-orphan"
    )
    agent_settings: Mapped["ProjectAgentSettings | None"] = relationship(
        back_populates="project", uselist=False, cascade="all, delete-orphan"
    )


class ProjectMember(TimestampMixin, Base):
    __tablename__ = "project_members"

    project_id: Mapped[str] = mapped_column(
        ForeignKey("projects.id"), primary_key=True
    )
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), primary_key=True)
    role: Mapped[ProjectRole] = mapped_column(
        SAEnum(ProjectRole, native_enum=False),
        default=ProjectRole.member,
        nullable=False,
    )

    project: Mapped["Project"] = relationship(back_populates="members")


class ProjectCredential(TimestampMixin, Base):
    """Per-project secrets. Every column is Fernet-encrypted at rest."""

    __tablename__ = "project_credentials"

    project_id: Mapped[str] = mapped_column(
        ForeignKey("projects.id"), primary_key=True
    )
    google_refresh_token: Mapped[str | None] = mapped_column(EncryptedString(2048))
    jira_api_token: Mapped[str | None] = mapped_column(EncryptedString(2048))
    notion_token: Mapped[str | None] = mapped_column(EncryptedString(2048))

    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    project: Mapped["Project"] = relationship(back_populates="credential")


class ProjectAgentSettings(TimestampMixin, Base):
    """Per-project agent behavior knobs (1:1 with Project, row created lazily).

    No row means "all defaults" — GET serves the column defaults without
    writing, the first PUT materializes the row.
    """

    __tablename__ = "project_agent_settings"

    project_id: Mapped[str] = mapped_column(
        ForeignKey("projects.id"), primary_key=True
    )
    auto_join_meetings: Mapped[bool] = mapped_column(
        Boolean, default=True, nullable=False
    )
    record_audio: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    capture_screenshots: Mapped[bool] = mapped_column(
        Boolean, default=False, nullable=False
    )
    confidence_threshold: Mapped[int] = mapped_column(
        Integer, default=70, nullable=False
    )
    auto_apply_high_confidence: Mapped[bool] = mapped_column(
        Boolean, default=True, nullable=False
    )
    response_style: Mapped[ResponseStyle] = mapped_column(
        SAEnum(ResponseStyle, native_enum=False),
        default=ResponseStyle.balanced,
        nullable=False,
    )
    context_window_meetings: Mapped[int] = mapped_column(
        Integer, default=10, nullable=False
    )

    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    project: Mapped["Project"] = relationship(back_populates="agent_settings")


class PendingOAuth(UUIDPKMixin, TimestampMixin, Base):
    """One-shot OAuth grant captured before the project exists.

    The ``id`` doubles as the ``auth_session_id`` handed to the frontend; the row
    is consumed (and deleted) when the project is created.
    """

    __tablename__ = "pending_oauth"

    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    provider: Mapped[str] = mapped_column(String(32), nullable=False)
    account_email: Mapped[str | None] = mapped_column(String(320))
    refresh_token: Mapped[str | None] = mapped_column(EncryptedString(2048))
    scopes: Mapped[str | None] = mapped_column(String(1024))
