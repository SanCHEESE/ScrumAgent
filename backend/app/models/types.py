"""Dialect-portable column types, mixins, and enums shared by all models."""
from __future__ import annotations

import enum
import uuid
from datetime import datetime

from sqlalchemy import DateTime, String, TypeDecorator, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.types import JSON

from app.security import crypto

# JSONB on Postgres, JSON-as-text on SQLite — same Python dict/list interface.
JSONType = JSON().with_variant(JSONB, "postgresql")


def uuid_str() -> str:
    return str(uuid.uuid4())


class UUIDPKMixin:
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid_str)


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class EncryptedString(TypeDecorator):
    """Transparently encrypts on write, decrypts on read (Fernet)."""

    impl = String
    cache_ok = True

    def process_bind_param(self, value, _dialect):
        return None if value is None else crypto.encrypt(value)

    def process_result_value(self, value, _dialect):
        return None if value is None else crypto.decrypt(value)


class MessageRole(str, enum.Enum):
    user = "user"
    assistant = "assistant"
    system = "system"
    tool = "tool"


class ArtifactType(str, enum.Enum):
    transcript = "transcript"
    notes = "notes"
    recording = "recording"


class UpdateTarget(str, enum.Enum):
    jira = "jira"
    notion = "notion"


class UpdateStatus(str, enum.Enum):
    staged = "staged"
    approved = "approved"
    rejected = "rejected"
    applied = "applied"


class StepKind(str, enum.Enum):
    llm = "llm"
    tool = "tool"
    handoff = "handoff"


class RunStatus(str, enum.Enum):
    running = "running"
    completed = "completed"
    failed = "failed"


class ProjectRole(str, enum.Enum):
    viewer = "viewer"
    member = "member"
    admin = "admin"


class UsageKind(str, enum.Enum):
    llm = "llm"
    stt = "stt"
    embed = "embed"


class ResponseStyle(str, enum.Enum):
    concise = "concise"
    balanced = "balanced"
    detailed = "detailed"
