# Persistence layer: SQLAlchemy models + chat history (SQLite ↔ Cloud SQL Postgres)

- **Date:** 2026-06-01
- **Beads:** `ScrumAgent-67j` (extends scope: adds chat history + secret encryption + Postgres portability)
- **Status:** design approved, pending spec review

## Problem

The backend has engine/session plumbing ([`backend/app/database.py`](../../../backend/app/database.py)) but no ORM models. We need the full persistence layer that routers and agents build on, plus **user chat history** (new, not in the original `67j` table list).

Production will run on GCP against **Cloud SQL for PostgreSQL**; local dev and the full test suite run against **SQLite**. This is a deliberate change from the earlier wiki plan (`wiki/flows/gcp-deployment-topology.md`), which assumed embedded SQLite on the VM SSD even in production. The wiki topology and `domains/deployment` must be updated to reflect Cloud SQL in prod.

## Goals

- Define all `67j` tables + `conversations`/`messages`, portable across SQLite and Postgres.
- One config knob (`settings.database_url`) selects the engine; no code branches in callers.
- FK integrity enforced on both dialects (SQLite needs an explicit pragma).
- Integration secrets never persisted in plaintext.
- Chat history is functionally usable now (thin repository helpers), not just table definitions.

## Non-goals (deferred to other issues)

- Pydantic request/response schemas in `app/schemas/` — shaped by API contracts, added per router.
- Cloud SQL Python Connector (`creator=`, IAM auth) — MVP uses `DATABASE_URL` via Cloud SQL Auth Proxy / private IP.
- Alembic migrations — `67j` mandates `create_all` for MVP; a follow-up issue tracks Alembic now that prod is managed Postgres.
- Secret Manager `sm://` references for integration values — prod hardening follow-up.

## Portability design (SQLite ↔ Cloud SQL Postgres)

Everything flows through `settings.database_url`:

- **Local / tests:** `sqlite:////app/data/db/scrumagent.db`, or `sqlite://` in-memory in tests.
- **Prod (GCP):** `postgresql+psycopg://USER:PASS@HOST/DB` (psycopg3), reaching Cloud SQL via the Auth Proxy or private IP.

Extend `make_engine` in `backend/app/database.py`:

- SQLite → `connect_args={"check_same_thread": False}`; for in-memory (`sqlite://`) add `poolclass=StaticPool` so `create_all` is visible across sessions in tests.
- Postgres → `pool_pre_ping=True` (Cloud SQL drops idle connections).
- Global `@event.listens_for(Engine, "connect")` issuing `PRAGMA foreign_keys=ON` for SQLite connections only (detected via `isinstance(dbapi_conn, sqlite3.Connection)`). Without this, SQLite silently ignores FK constraints and the `67j` acceptance criterion fails.

Portable column types in `app/models/types.py`:

- **Primary keys:** string UUID — `String(36)`, `default=lambda: str(uuid4())`. Avoids native UUID / SERIAL dialect differences.
- **JSON:** `JSON().with_variant(JSONB, "postgresql")` → JSONB in prod, JSON-as-text in SQLite.
- **Timestamps:** `TimestampMixin` with `DateTime(timezone=True)`, `server_default=func.now()` for `created_at`, plus `onupdate=func.now()` for `updated_at`.
- **Enums:** `Enum(PyEnum, native_enum=False)` → portable VARCHAR + CHECK on both dialects (no fragile Postgres native enum types).

## Schema

All tables inherit from `Base` (already in `backend/app/database.py`). String-UUID PKs unless noted.

| Table | Columns (abridged) | Notes |
|---|---|---|
| `users` | `id` PK, `email` UNIQUE NOT NULL, `name`, `created_at` | `@municorn.com` restriction enforced at the auth layer, not a DB CHECK (domain is configurable). |
| `conversations` | `id` PK, `user_id` FK→users, `agent`, `title`, `created_at`, `updated_at` | **New.** Groups a user's chat with one agent. |
| `messages` | `id` PK, `conversation_id` FK→conversations, `role`, `content` (Text), `meta` (JSON), `trace_run_id` FK→trace_runs NULLABLE, `created_at` | **New.** `role` ∈ {user, assistant, system, tool}. Optional link to the agent run that produced the turn. |
| `meetings` | `id` PK, `google_event_id` UNIQUE, `title`, `start`, `end`, `organizer`, `attendees` (JSON), `has_meet` (bool) | |
| `meeting_artifacts` | `id` PK, `meeting_id` FK→meetings, `type`, `source`, `content_ref`, `fetched_at` | `type` ∈ {transcript, notes, recording}. |
| `updates` | `id` PK, `target`, `action`, `payload` (JSON), `status`, `source_run_id` FK→trace_runs NULLABLE, `created_at` | `target` ∈ {jira, notion}; `status` ∈ {staged, approved, rejected, applied}. |
| `trace_runs` | `id` PK, `entry_agent`, `started_at`, `finished_at` NULLABLE, `status` | |
| `trace_steps` | `id` PK, `run_id` FK→trace_runs, `agent`, `kind`, `input` (JSON), `output` (JSON), `ts` | `kind` ∈ {llm, tool, handoff}. |
| `integrations` | `key` PK (string), `value` (Text), `is_secret` (bool), `updated_at` | `value` stores ciphertext when `is_secret`; settings UI. |

Enum members live as Python `enum.Enum` classes in `app/models/types.py` and are bound via `Enum(..., native_enum=False)`.

## Secrets never stored plaintext

Acceptance: secrets in `integrations` never persisted in plaintext. Solution is encryption-at-rest that works both locally and in prod (no Secret Manager dependency):

- `app/security/crypto.py`: Fernet (`cryptography`, already pulled transitively by `python-jose[cryptography]`). Fernet key derived from `settings.secret_key` (SHA-256 → urlsafe base64).
- `EncryptedString` SQLAlchemy `TypeDecorator`: encrypts on bind, decrypts on result. The module key is set at startup via `crypto.configure(settings.secret_key)` and in the test fixture.
- `integrations.value` uses `EncryptedString` when storing secrets. A test asserts the persisted bytes differ from plaintext and that decryption round-trips.

## Files

```
backend/app/
  models/
    __init__.py        # re-exports all models so create_all sees them
    types.py           # JSONType, EncryptedString, TimestampMixin, UUID-PK mixin, enums
    user.py            # User
    chat.py            # Conversation, Message
    meeting.py         # Meeting, MeetingArtifact
    update.py          # Update
    trace.py           # TraceRun, TraceStep
    integration.py     # Integration
  security/
    crypto.py          # Fernet configure/encrypt/decrypt
  repositories/
    chat.py            # create_conversation, append_message, get_history
  database.py          # extend make_engine + FK pragma event + init_db(engine)
  main.py              # call init_db in FastAPI lifespan
```

`init_db(engine)` calls `Base.metadata.create_all(engine)` (no Alembic). Wired into the FastAPI lifespan in `main.py` for the real engine.

`requirements.txt`: add `psycopg[binary]>=3.1,<4` (prod driver) and an explicit `cryptography` pin (Fernet).

## Testing (TDD — tests written first)

- create/read for **every** table.
- FK integrity enforced: inserting a child with a dangling FK raises (proves the SQLite pragma is active).
- `integrations` secret is ciphertext at rest and round-trips via decrypt.
- chat history: `append_message` then `get_history` returns messages in chronological order, scoped to the conversation.
- JSON column round-trips a dict; UUID PK auto-generated on flush.

In-memory SQLite test fixture uses `StaticPool` + `crypto.configure(...)` + `init_db(engine)`.

## Wiki updates

- `wiki/flows/gcp-deployment-topology.md` + `wiki/domains/deployment.md`: prod DB is Cloud SQL for PostgreSQL (not SQLite-on-SSD); SQLite is local-only.
- `wiki/domains/backend.md`: `models.py` → `models/` package; add `conversations`/`messages`, `security/crypto.py`, `repositories/`.

## Follow-up issues to file

- Alembic migrations (prod is managed Postgres).
- Cloud SQL Python Connector for IAM auth.
- Secret Manager `sm://` references for `integrations` (prod hardening).
- Pydantic schemas per router (`app/schemas/`).
