# DB Persistence Layer + Chat History Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the full SQLAlchemy persistence layer (all `ScrumAgent-67j` tables + user chat history), portable across SQLite (local/tests) and Cloud SQL Postgres (prod), with FK integrity and encrypted-at-rest integration secrets.

**Architecture:** One `Base`; all tables in an `app/models/` package split by domain. Portable column types (string-UUID PKs, `JSON`→`JSONB` variant, timezone-aware timestamps, non-native enums). Engine selection driven solely by `settings.database_url`. SQLite FK enforcement via a connect-time `PRAGMA`. Integration secrets encrypted with Fernet via an `EncryptedString` type. Schema bootstrapped with `create_all` (no Alembic for MVP).

**Tech Stack:** SQLAlchemy 2.0 (sync), psycopg3 (prod driver), `cryptography` (Fernet), pytest.

Spec: [`docs/superpowers/specs/2026-06-01-db-persistence-chat-history-design.md`](../specs/2026-06-01-db-persistence-chat-history-design.md)

**Run tests from `backend/`** (pytest `pythonpath=.`): `cd backend && pytest -q`

**Key decision:** `messages` uses an **integer autoincrement PK** for guaranteed append-log ordering (SQLite `CURRENT_TIMESTAMP` is second-granular → ties). All other tables use string-UUID PKs.

---

### Task 1: Crypto helper (Fernet)

**Files:**
- Create: `backend/app/security/__init__.py` (empty)
- Create: `backend/app/security/crypto.py`
- Test: `backend/tests/test_crypto.py`

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/test_crypto.py
import pytest

from app.security import crypto


def test_encrypt_roundtrip():
    crypto.configure("unit-test-secret")
    token = crypto.encrypt("ntn_supersecret")
    assert token != "ntn_supersecret"
    assert crypto.decrypt(token) == "ntn_supersecret"


def test_encrypt_requires_configure(monkeypatch):
    monkeypatch.setattr(crypto, "_fernet", None)
    with pytest.raises(RuntimeError):
        crypto.encrypt("x")
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && pytest tests/test_crypto.py -q`
Expected: FAIL (ModuleNotFoundError: app.security.crypto)

- [ ] **Step 3: Write minimal implementation**

```python
# backend/app/security/__init__.py
```

```python
# backend/app/security/crypto.py
"""Symmetric encryption for secrets at rest.

A process-global Fernet, configured once at startup from ``settings.secret_key``.
Keeps integration secrets out of the database in plaintext while staying
portable (no Secret Manager dependency locally).
"""
from __future__ import annotations

import base64
import hashlib

from cryptography.fernet import Fernet

_fernet: Fernet | None = None


def _derive_key(secret_key: str) -> bytes:
    digest = hashlib.sha256(secret_key.encode("utf-8")).digest()
    return base64.urlsafe_b64encode(digest)


def configure(secret_key: str) -> None:
    global _fernet
    _fernet = Fernet(_derive_key(secret_key))


def _require() -> Fernet:
    if _fernet is None:
        raise RuntimeError(
            "crypto not configured; call crypto.configure(secret_key) at startup"
        )
    return _fernet


def encrypt(plaintext: str) -> str:
    return _require().encrypt(plaintext.encode("utf-8")).decode("utf-8")


def decrypt(token: str) -> str:
    return _require().decrypt(token.encode("utf-8")).decode("utf-8")
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && pytest tests/test_crypto.py -q`
Expected: PASS (2 passed)

- [ ] **Step 5: Commit**

```bash
git add backend/app/security backend/tests/test_crypto.py
git commit -m "feat(backend): Fernet crypto helper for secrets at rest (ScrumAgent-67j)"
```

---

### Task 2: Engine portability + FK pragma + init_db

**Files:**
- Modify: `backend/app/database.py`
- Test: `backend/tests/test_database.py`

- [ ] **Step 1: Write the failing tests** (append to existing `test_database.py`)

```python
from sqlalchemy import text

from app.database import init_db, make_engine, make_session_factory


def test_sqlite_foreign_keys_enabled():
    engine = make_engine("sqlite://")
    with engine.connect() as conn:
        assert conn.execute(text("PRAGMA foreign_keys")).scalar() == 1


def test_in_memory_uses_shared_connection():
    # StaticPool: a temp table created in one session is visible in the next
    engine = make_engine("sqlite://")
    factory = make_session_factory(engine)
    with factory() as s:
        s.execute(text("CREATE TABLE t (x int)"))
        s.execute(text("INSERT INTO t VALUES (1)"))
        s.commit()
    with factory() as s:
        assert s.execute(text("SELECT x FROM t")).scalar() == 1


def test_init_db_creates_tables():
    engine = make_engine("sqlite://")
    init_db(engine)
    from sqlalchemy import inspect

    names = set(inspect(engine).get_table_names())
    assert {"users", "conversations", "messages"} <= names
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd backend && pytest tests/test_database.py -q`
Expected: FAIL (`init_db` does not exist; pragma off by default)

- [ ] **Step 3: Rewrite `database.py`**

```python
# backend/app/database.py
"""SQLAlchemy engine + session plumbing.

Engine selection is driven entirely by ``database_url`` so callers never branch
on dialect: ``sqlite://`` (tests), a file URL (local), or ``postgresql+psycopg``
(Cloud SQL in prod). Models attach to ``Base`` and are created via ``init_db``.
"""
from __future__ import annotations

import sqlite3
from pathlib import Path

from sqlalchemy import Engine, create_engine, event
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker
from sqlalchemy.pool import StaticPool

_IN_MEMORY = {"sqlite://", "sqlite:///:memory:"}


class Base(DeclarativeBase):
    """Declarative base all ORM models inherit from."""


def make_engine(database_url: str) -> Engine:
    if database_url.startswith("sqlite"):
        connect_args = {"check_same_thread": False}
        if database_url in _IN_MEMORY:
            # one shared connection so create_all + rows survive across sessions
            return create_engine(
                database_url,
                connect_args=connect_args,
                poolclass=StaticPool,
                future=True,
            )
        return create_engine(database_url, connect_args=connect_args, future=True)
    # Postgres / Cloud SQL: recycle dead connections the proxy drops while idle
    return create_engine(database_url, pool_pre_ping=True, future=True)


def make_session_factory(engine: Engine) -> sessionmaker[Session]:
    return sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True)


@event.listens_for(Engine, "connect")
def _enable_sqlite_foreign_keys(dbapi_conn, _connection_record) -> None:
    # SQLite ignores FK constraints unless this pragma is set per connection.
    if isinstance(dbapi_conn, sqlite3.Connection):
        cur = dbapi_conn.cursor()
        cur.execute("PRAGMA foreign_keys=ON")
        cur.close()


def init_db(engine: Engine) -> None:
    """Create all tables. MVP bootstrap — no Alembic (see ScrumAgent follow-up)."""
    from app import models  # noqa: F401  (registers every model on Base.metadata)

    if engine.url.get_backend_name() == "sqlite" and engine.url.database not in (
        None,
        ":memory:",
    ):
        Path(engine.url.database).parent.mkdir(parents=True, exist_ok=True)
    Base.metadata.create_all(engine)
```

> Note: `test_init_db_creates_tables` will stay red until the models package exists (Task 3+). That's expected; leave it and proceed — it goes green once `app/models/__init__.py` imports the models.

- [ ] **Step 4: Run the pragma + StaticPool tests**

Run: `cd backend && pytest tests/test_database.py -q -k "foreign_keys or shared_connection"`
Expected: PASS (2 passed). `test_init_db_creates_tables` fails until Task 9 — acceptable.

- [ ] **Step 5: Commit**

```bash
git add backend/app/database.py backend/tests/test_database.py
git commit -m "feat(backend): portable engine + SQLite FK pragma + init_db (ScrumAgent-67j)"
```

---

### Task 3: Portable types + enums + conftest wiring

**Files:**
- Create: `backend/app/models/__init__.py`
- Create: `backend/app/models/types.py`
- Modify: `backend/tests/conftest.py` (wire crypto + init_db into `db_session`)
- Test: `backend/tests/test_model_types.py`

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/test_model_types.py
from app.models.types import (
    ArtifactType,
    MessageRole,
    RunStatus,
    StepKind,
    UpdateStatus,
    UpdateTarget,
    uuid_str,
)


def test_uuid_str_is_36_chars():
    value = uuid_str()
    assert isinstance(value, str)
    assert len(value) == 36


def test_enum_values():
    assert MessageRole.user.value == "user"
    assert {r.value for r in MessageRole} == {"user", "assistant", "system", "tool"}
    assert {a.value for a in ArtifactType} == {"transcript", "notes", "recording"}
    assert {t.value for t in UpdateTarget} == {"jira", "notion"}
    assert {s.value for s in UpdateStatus} == {
        "staged",
        "approved",
        "rejected",
        "applied",
    }
    assert {k.value for k in StepKind} == {"llm", "tool", "handoff"}
    assert {s.value for s in RunStatus} == {"running", "completed", "failed"}
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd backend && pytest tests/test_model_types.py -q`
Expected: FAIL (ModuleNotFoundError: app.models.types)

- [ ] **Step 3: Implement types + empty package init**

```python
# backend/app/models/types.py
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
```

```python
# backend/app/models/__init__.py
"""ORM models. Importing this package registers every table on Base.metadata."""
from app.models.user import User
from app.models.chat import Conversation, Message
from app.models.meeting import Meeting, MeetingArtifact
from app.models.update import Update
from app.models.trace import TraceRun, TraceStep
from app.models.integration import Integration

__all__ = [
    "User",
    "Conversation",
    "Message",
    "Meeting",
    "MeetingArtifact",
    "Update",
    "TraceRun",
    "TraceStep",
    "Integration",
]
```

> The `__init__.py` imports model modules created in Tasks 4–9. Until those exist it will ImportError, so create it now but expect `test_model_types.py` to still pass (it imports `app.models.types` directly, not the package root). Tests for `init_db` / `db_session` that import the package root go green as each model task lands. If you prefer strictly-green checkpoints, add the import lines to `__init__.py` incrementally in Tasks 4–9 instead of all at once.

- [ ] **Step 4: Wire crypto + init_db into the existing `db_session` fixture**

In `backend/tests/conftest.py`, add the import and update `db_session`:

```python
# add near the other imports
from app.database import init_db, make_engine
from app.security import crypto
```

Replace the existing `db_session` fixture body with:

```python
@pytest.fixture
def db_session() -> Iterator[Session]:
    crypto.configure(TEST_SECRET)
    engine = make_engine("sqlite://")
    init_db(engine)
    factory = sessionmaker(bind=engine, autoflush=False, future=True)
    db = factory()
    try:
        yield db
    finally:
        db.close()
        engine.dispose()
```

- [ ] **Step 5: Run the types test**

Run: `cd backend && pytest tests/test_model_types.py -q`
Expected: PASS (2 passed)

- [ ] **Step 6: Commit**

```bash
git add backend/app/models/__init__.py backend/app/models/types.py backend/tests/test_model_types.py backend/tests/conftest.py
git commit -m "feat(backend): portable model types, enums, crypto-wired test fixture (ScrumAgent-67j)"
```

---

### Task 4: User model

**Files:**
- Create: `backend/app/models/user.py`
- Test: `backend/tests/test_models_user.py`

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/test_models_user.py
import pytest
from sqlalchemy.exc import IntegrityError

from app.models.user import User


def test_create_and_read_user(db_session):
    db_session.add(User(email="alice@municorn.com", name="Alice"))
    db_session.commit()
    got = db_session.query(User).filter_by(email="alice@municorn.com").one()
    assert got.id and len(got.id) == 36
    assert got.name == "Alice"
    assert got.created_at is not None


def test_user_email_unique(db_session):
    db_session.add(User(email="dup@municorn.com"))
    db_session.commit()
    db_session.add(User(email="dup@municorn.com"))
    with pytest.raises(IntegrityError):
        db_session.commit()
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd backend && pytest tests/test_models_user.py -q`
Expected: FAIL (ModuleNotFoundError: app.models.user)

- [ ] **Step 3: Implement the model**

```python
# backend/app/models/user.py
from __future__ import annotations

from typing import TYPE_CHECKING

from sqlalchemy import String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.types import TimestampMixin, UUIDPKMixin

if TYPE_CHECKING:
    from app.models.chat import Conversation


class User(UUIDPKMixin, TimestampMixin, Base):
    __tablename__ = "users"

    email: Mapped[str] = mapped_column(String(320), unique=True, nullable=False)
    name: Mapped[str | None] = mapped_column(String(255))

    conversations: Mapped[list["Conversation"]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd backend && pytest tests/test_models_user.py -q`
Expected: PASS (2 passed)

- [ ] **Step 5: Commit**

```bash
git add backend/app/models/user.py backend/tests/test_models_user.py
git commit -m "feat(backend): User model (ScrumAgent-67j)"
```

---

### Task 5: Conversation + Message models (chat history)

**Files:**
- Create: `backend/app/models/chat.py`
- Test: `backend/tests/test_models_chat.py`

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/test_models_chat.py
import pytest
from sqlalchemy.exc import IntegrityError

from app.models.chat import Conversation, Message
from app.models.types import MessageRole
from app.models.user import User


def _user(db):
    u = User(email="u@municorn.com")
    db.add(u)
    db.flush()
    return u


def test_create_conversation_and_message(db_session):
    user = _user(db_session)
    convo = Conversation(user_id=user.id, agent="user_chat", title="hi")
    db_session.add(convo)
    db_session.flush()
    msg = Message(
        conversation_id=convo.id,
        role=MessageRole.user,
        content="hello",
        meta={"tokens": 3},
    )
    db_session.add(msg)
    db_session.commit()

    got = db_session.query(Message).one()
    assert got.id == 1  # integer autoincrement PK
    assert got.role == MessageRole.user
    assert got.content == "hello"
    assert got.meta == {"tokens": 3}
    assert convo.messages == [got]


def test_message_fk_integrity_enforced(db_session):
    # dangling conversation_id must be rejected (proves SQLite FK pragma is on)
    db_session.add(
        Message(conversation_id="nope", role=MessageRole.user, content="x")
    )
    with pytest.raises(IntegrityError):
        db_session.commit()
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd backend && pytest tests/test_models_chat.py -q`
Expected: FAIL (ModuleNotFoundError: app.models.chat)

- [ ] **Step 3: Implement the models**

```python
# backend/app/models/chat.py
"""User chat history: conversations grouped per user+agent, append-only messages."""
from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, Enum as SAEnum, ForeignKey, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.types import JSONType, MessageRole, TimestampMixin, UUIDPKMixin

if TYPE_CHECKING:
    from app.models.trace import TraceRun
    from app.models.user import User


class Conversation(UUIDPKMixin, TimestampMixin, Base):
    __tablename__ = "conversations"

    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), nullable=False)
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
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd backend && pytest tests/test_models_chat.py -q`
Expected: PASS (2 passed)

- [ ] **Step 5: Commit**

```bash
git add backend/app/models/chat.py backend/tests/test_models_chat.py
git commit -m "feat(backend): chat history models — Conversation + Message (ScrumAgent-67j)"
```

---

### Task 6: Meeting + MeetingArtifact models

**Files:**
- Create: `backend/app/models/meeting.py`
- Test: `backend/tests/test_models_meeting.py`

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/test_models_meeting.py
from datetime import datetime, timezone

from app.models.meeting import Meeting, MeetingArtifact
from app.models.types import ArtifactType


def test_create_meeting_with_artifact(db_session):
    m = Meeting(
        google_event_id="evt-1",
        title="Standup",
        start=datetime(2026, 6, 1, 9, tzinfo=timezone.utc),
        organizer="alice@municorn.com",
        attendees=["alice@municorn.com", "bob@municorn.com"],
        has_meet=True,
    )
    db_session.add(m)
    db_session.flush()
    db_session.add(
        MeetingArtifact(
            meeting_id=m.id,
            type=ArtifactType.transcript,
            source="meet",
            content_ref="rag://evt-1/transcript",
        )
    )
    db_session.commit()

    got = db_session.query(Meeting).one()
    assert got.attendees == ["alice@municorn.com", "bob@municorn.com"]
    assert got.has_meet is True
    assert got.artifacts[0].type == ArtifactType.transcript
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd backend && pytest tests/test_models_meeting.py -q`
Expected: FAIL (ModuleNotFoundError: app.models.meeting)

- [ ] **Step 3: Implement the models**

```python
# backend/app/models/meeting.py
from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING

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

if TYPE_CHECKING:
    pass


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
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd backend && pytest tests/test_models_meeting.py -q`
Expected: PASS (1 passed)

- [ ] **Step 5: Commit**

```bash
git add backend/app/models/meeting.py backend/tests/test_models_meeting.py
git commit -m "feat(backend): Meeting + MeetingArtifact models (ScrumAgent-67j)"
```

---

### Task 7: TraceRun + TraceStep models

**Files:**
- Create: `backend/app/models/trace.py`
- Test: `backend/tests/test_models_trace.py`

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/test_models_trace.py
from app.models.trace import TraceRun, TraceStep
from app.models.types import RunStatus, StepKind


def test_create_run_with_steps(db_session):
    run = TraceRun(entry_agent="orchestrator", status=RunStatus.running)
    db_session.add(run)
    db_session.flush()
    db_session.add(
        TraceStep(
            run_id=run.id,
            agent="jira_notion",
            kind=StepKind.tool,
            input={"q": "create issue"},
            output={"id": "JIRA-1"},
        )
    )
    db_session.commit()

    got = db_session.query(TraceRun).one()
    assert got.status == RunStatus.running
    assert got.started_at is not None
    assert got.steps[0].kind == StepKind.tool
    assert got.steps[0].output == {"id": "JIRA-1"}
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd backend && pytest tests/test_models_trace.py -q`
Expected: FAIL (ModuleNotFoundError: app.models.trace)

- [ ] **Step 3: Implement the models**

```python
# backend/app/models/trace.py
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
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd backend && pytest tests/test_models_trace.py -q`
Expected: PASS (1 passed)

- [ ] **Step 5: Commit**

```bash
git add backend/app/models/trace.py backend/tests/test_models_trace.py
git commit -m "feat(backend): TraceRun + TraceStep models (ScrumAgent-67j)"
```

---

### Task 8: Update model (staged Jira/Notion writes)

**Files:**
- Create: `backend/app/models/update.py`
- Test: `backend/tests/test_models_update.py`

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/test_models_update.py
from app.models.trace import TraceRun
from app.models.types import RunStatus, UpdateStatus, UpdateTarget
from app.models.update import Update


def test_create_update_defaults_to_staged(db_session):
    run = TraceRun(entry_agent="orchestrator", status=RunStatus.completed)
    db_session.add(run)
    db_session.flush()
    upd = Update(
        target=UpdateTarget.jira,
        action="create_issue",
        payload={"summary": "Fix bug"},
        source_run_id=run.id,
    )
    db_session.add(upd)
    db_session.commit()

    got = db_session.query(Update).one()
    assert got.status == UpdateStatus.staged
    assert got.target == UpdateTarget.jira
    assert got.payload == {"summary": "Fix bug"}
    assert got.created_at is not None
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd backend && pytest tests/test_models_update.py -q`
Expected: FAIL (ModuleNotFoundError: app.models.update)

- [ ] **Step 3: Implement the model**

```python
# backend/app/models/update.py
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
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd backend && pytest tests/test_models_update.py -q`
Expected: PASS (1 passed)

- [ ] **Step 5: Commit**

```bash
git add backend/app/models/update.py backend/tests/test_models_update.py
git commit -m "feat(backend): Update model for staged Jira/Notion writes (ScrumAgent-67j)"
```

---

### Task 9: Integration model (encrypted secrets at rest)

**Files:**
- Create: `backend/app/models/integration.py`
- Test: `backend/tests/test_models_integration.py`

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/test_models_integration.py
from sqlalchemy import text

from app.models.integration import Integration


def test_secret_is_encrypted_at_rest(db_session):
    db_session.add(
        Integration(key="notion_token", value="ntn_supersecret", is_secret=True)
    )
    db_session.commit()

    # raw read bypasses the ORM type → must be ciphertext, not plaintext
    raw = db_session.execute(
        text("SELECT value FROM integrations WHERE key='notion_token'")
    ).scalar()
    assert raw != "ntn_supersecret"
    assert "ntn_supersecret" not in raw

    # ORM read decrypts transparently
    got = db_session.get(Integration, "notion_token")
    assert got.value == "ntn_supersecret"
    assert got.is_secret is True
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd backend && pytest tests/test_models_integration.py -q`
Expected: FAIL (ModuleNotFoundError: app.models.integration)

- [ ] **Step 3: Implement the model**

```python
# backend/app/models/integration.py
from __future__ import annotations

from datetime import datetime

from sqlalchemy import Boolean, DateTime, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base
from app.models.types import EncryptedString


class Integration(Base):
    """Settings-UI key/value. ``value`` is always encrypted at rest."""

    __tablename__ = "integrations"

    key: Mapped[str] = mapped_column(String(128), primary_key=True)
    value: Mapped[str | None] = mapped_column(EncryptedString(2048))
    is_secret: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )
```

- [ ] **Step 4: Run to verify it passes (and the deferred init_db test now goes green)**

Run: `cd backend && pytest tests/test_models_integration.py tests/test_database.py -q`
Expected: PASS (all models now importable; `test_init_db_creates_tables` green)

- [ ] **Step 5: Commit**

```bash
git add backend/app/models/integration.py backend/tests/test_models_integration.py
git commit -m "feat(backend): Integration model with encrypted secrets at rest (ScrumAgent-67j)"
```

---

### Task 10: Chat repository helpers

**Files:**
- Create: `backend/app/repositories/__init__.py` (empty)
- Create: `backend/app/repositories/chat.py`
- Test: `backend/tests/test_repositories_chat.py`

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/test_repositories_chat.py
from app.models.types import MessageRole
from app.models.user import User
from app.repositories import chat as chat_repo


def test_append_and_get_history_in_order(db_session):
    user = User(email="u@municorn.com")
    db_session.add(user)
    db_session.flush()

    convo = chat_repo.create_conversation(
        db_session, user_id=user.id, agent="user_chat", title="t"
    )
    chat_repo.append_message(
        db_session, conversation_id=convo.id, role=MessageRole.user, content="q1"
    )
    chat_repo.append_message(
        db_session,
        conversation_id=convo.id,
        role=MessageRole.assistant,
        content="a1",
    )
    chat_repo.append_message(
        db_session, conversation_id=convo.id, role=MessageRole.user, content="q2"
    )
    db_session.commit()

    history = chat_repo.get_history(db_session, convo.id)
    assert [m.content for m in history] == ["q1", "a1", "q2"]
    assert [m.role for m in history] == [
        MessageRole.user,
        MessageRole.assistant,
        MessageRole.user,
    ]
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd backend && pytest tests/test_repositories_chat.py -q`
Expected: FAIL (ModuleNotFoundError: app.repositories.chat)

- [ ] **Step 3: Implement the repository**

```python
# backend/app/repositories/__init__.py
```

```python
# backend/app/repositories/chat.py
"""Persistence helpers for user chat history."""
from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.chat import Conversation, Message
from app.models.types import MessageRole


def create_conversation(
    db: Session, *, user_id: str, agent: str, title: str | None = None
) -> Conversation:
    convo = Conversation(user_id=user_id, agent=agent, title=title)
    db.add(convo)
    db.flush()
    return convo


def append_message(
    db: Session,
    *,
    conversation_id: str,
    role: MessageRole,
    content: str,
    meta: dict | None = None,
    trace_run_id: str | None = None,
) -> Message:
    msg = Message(
        conversation_id=conversation_id,
        role=role,
        content=content,
        meta=meta,
        trace_run_id=trace_run_id,
    )
    db.add(msg)
    db.flush()
    return msg


def get_history(db: Session, conversation_id: str) -> list[Message]:
    stmt = (
        select(Message)
        .where(Message.conversation_id == conversation_id)
        .order_by(Message.id)
    )
    return list(db.scalars(stmt))
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd backend && pytest tests/test_repositories_chat.py -q`
Expected: PASS (1 passed)

- [ ] **Step 5: Commit**

```bash
git add backend/app/repositories backend/tests/test_repositories_chat.py
git commit -m "feat(backend): chat history repository helpers (ScrumAgent-67j)"
```

---

### Task 11: Bootstrap schema on app startup (lifespan) + deps wiring

**Files:**
- Modify: `backend/app/main.py`
- Test: `backend/tests/test_startup.py`

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/test_startup.py
from pathlib import Path

from fastapi.testclient import TestClient
from sqlalchemy import create_engine, inspect

from app import deps
from app.main import app

REQUIRED = {
    "SECRET_KEY": "startup-secret",
    "OPENAI_API_KEY": "k",
    "GOOGLE_CLIENT_ID": "cid",
    "GOOGLE_CLIENT_SECRET": "sec",
}


def test_lifespan_creates_schema(monkeypatch, tmp_path):
    db_file = tmp_path / "startup.db"
    for k, v in REQUIRED.items():
        monkeypatch.setenv(k, v)
    monkeypatch.setenv("DATABASE_URL", f"sqlite:///{db_file}")
    deps.get_settings.cache_clear()

    # entering the context manager runs the lifespan (startup → init_db)
    with TestClient(app):
        pass

    engine = create_engine(f"sqlite:///{db_file}")
    assert "users" in set(inspect(engine).get_table_names())
    assert Path(db_file).exists()
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd backend && pytest tests/test_startup.py -q`
Expected: FAIL (no lifespan; schema not created)

- [ ] **Step 3: Add the lifespan to `main.py`**

```python
# backend/app/main.py
from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.database import init_db, make_engine
from app.deps import get_settings
from app.security import crypto


@asynccontextmanager
async def lifespan(_app: FastAPI):
    settings = get_settings()
    crypto.configure(settings.secret_key)
    init_db(make_engine(settings.database_url))
    yield


app = FastAPI(title="Kabanchik", lifespan=lifespan)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
```

- [ ] **Step 4: Run to verify it passes + full suite stays green**

Run: `cd backend && pytest tests/test_startup.py -q && pytest -q`
Expected: PASS (startup test green; whole suite green — `test_health` unaffected since it uses a bare `TestClient`)

- [ ] **Step 5: Commit**

```bash
git add backend/app/main.py backend/tests/test_startup.py
git commit -m "feat(backend): bootstrap schema via FastAPI lifespan (ScrumAgent-67j)"
```

---

### Task 12: Dependencies + wiki + bd

**Files:**
- Modify: `backend/requirements.txt`
- Modify: `wiki/domains/backend.md`, `wiki/flows/gcp-deployment-topology.md`, `wiki/domains/deployment.md`, `wiki/log.md`, `wiki/hot.md`

- [ ] **Step 1: Add prod driver + crypto to `requirements.txt`**

Under the `# --- persistence ---` section, add:

```text
psycopg[binary]>=3.1,<4.0   # Cloud SQL Postgres driver (prod); SQLite locally
cryptography>=42.0,<46.0    # Fernet — integration secrets encrypted at rest
```

- [ ] **Step 2: Run the full suite once more**

Run: `cd backend && pytest -q`
Expected: PASS (all green)

- [ ] **Step 3: Update the wiki**

- `wiki/domains/backend.md`: `models.py` → `models/` package; list `conversations`/`messages`, `security/crypto.py`, `repositories/`; bump `updated:`.
- `wiki/flows/gcp-deployment-topology.md` + `wiki/domains/deployment.md`: prod DB = **Cloud SQL for PostgreSQL** (SQLite is local-only); update the `DB[("SQLite")]` node and State-plane text.
- Prepend a dated entry to `wiki/log.md`; overwrite `wiki/hot.md` with a fresh summary (models slice done).

- [ ] **Step 4: File follow-up issues + close 67j**

```bash
bd create --title="backend: Alembic migrations (prod is Cloud SQL Postgres)" --type=task --priority=2 --description="create_all is MVP-only; prod managed Postgres needs versioned migrations."
bd create --title="backend: Cloud SQL Python Connector (IAM auth)" --type=task --priority=3 --description="Replace DATABASE_URL/proxy with the Cloud SQL connector creator() for IAM-based auth."
bd create --title="backend: Secret Manager refs for integrations" --type=task --priority=3 --description="Option to store sm:// references instead of Fernet ciphertext for integration secrets."
bd close ScrumAgent-67j --reason="Models + chat history + encrypted secrets implemented with tests; portable SQLite/Postgres."
```

- [ ] **Step 5: Commit**

```bash
git add backend/requirements.txt wiki/
git commit -m "docs(wiki): Cloud SQL Postgres prod DB + models package; deps (ScrumAgent-67j)"
```

---

## Self-Review

**Spec coverage:**
- Portability (engine/types/FK pragma) → Tasks 2, 3 ✓
- All `67j` tables → Tasks 4 (users), 6 (meetings/artifacts), 7 (trace), 8 (updates), 9 (integrations) ✓
- Chat history (conversations + messages, trace link) → Task 5; repository → Task 10 ✓
- Secrets never plaintext → Task 1 (crypto) + Task 9 (EncryptedString test) ✓
- FK integrity enforced → Task 5 (`test_message_fk_integrity_enforced`) ✓
- create/read per table → Tasks 4–9 ✓
- `create_all` bootstrap (no Alembic) → Task 2 (`init_db`) + Task 11 (lifespan) ✓
- Prod driver + wiki update + follow-ups → Task 12 ✓

**Placeholder scan:** No TBD/TODO; every code step has complete code. The one intentional deferred-red test (`test_init_db_creates_tables`) is explicitly flagged in Tasks 2 and 9.

**Type consistency:** `MessageRole`/`ArtifactType`/`UpdateTarget`/`UpdateStatus`/`StepKind`/`RunStatus` defined in Task 3 and used consistently. `uuid_str`, `UUIDPKMixin`, `TimestampMixin`, `JSONType`, `EncryptedString` defined in Task 3, used in Tasks 4–10. `Message.id` is `int` (autoincrement) everywhere it's referenced; all other PKs `str`. Repository signatures (`create_conversation`, `append_message`, `get_history`) match their test usage.
