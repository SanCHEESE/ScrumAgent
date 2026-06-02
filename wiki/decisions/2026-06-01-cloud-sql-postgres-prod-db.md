---
type: decision
title: "Production DB: Cloud SQL for PostgreSQL (SQLite local-only)"
status: accepted
date: 2026-06-01
created: 2026-06-01
updated: 2026-06-02
tags: [decision, database, gcp, cloud-sql, postgres, sqlite]
related:
  - "[[decisions/2026-05-18-gcp-compute-engine-deployment]]"
  - "[[domains/backend]]"
  - "[[flows/gcp-deployment-topology]]"
---

# Production DB: Cloud SQL for PostgreSQL (SQLite local-only)

## Decision

The **production** persistence store on GCP is **Cloud SQL for PostgreSQL** (a managed instance), not the embedded SQLite file. **Local dev and the test suite continue to use SQLite.** The ORM layer is written dialect-portable so the same models run on both — the engine is selected solely by `settings.database_url` (`postgresql+psycopg://…` in prod, `sqlite://…` locally).

This refines the data-layer half of [[decisions/2026-05-18-gcp-compute-engine-deployment]]: the VM + Docker Compose + persistent-SSD topology still stands, and **RAG-Anything storage stays on the disk**, but relational state moves to Cloud SQL.

## Context

- User directive (2026-06-01): build the DB layer with user chat-history persistence, "with the DB deployed on GCP, and SQLite for local runs."
- The earlier GCP decision put SQLite on the VM SSD. A managed Postgres gives proper concurrency, backups/PITR, and survives VM rebuilds independently of the data disk — worth it now that we persist real user chat history.
- Keeping SQLite for local/CI keeps the dev loop zero-setup and the test suite fast and hermetic.

## How portability is kept

- String-UUID PKs everywhere (no SERIAL/identity dependence) **except** `messages.id`, an int autoincrement PK for guaranteed chat append-order.
- `JSON().with_variant(JSONB, "postgresql")` → JSONB in prod, JSON-text in SQLite.
- `DateTime(timezone=True)`; `Enum(native_enum=False)` (portable VARCHAR+CHECK).
- SQLite FK integrity enforced via a `PRAGMA foreign_keys=ON` connect-event listener (Postgres enforces natively).
- Schema bootstrap = `create_all` in the FastAPI lifespan (MVP; Alembic is a filed follow-up now that prod is managed Postgres).

## Consequences

- Connection to Cloud SQL via `DATABASE_URL` (Cloud SQL Auth Proxy / private IP) for MVP; the Cloud SQL Python Connector (IAM auth) is a follow-up.
- `domains/deployment.md` still describes SQLite-on-SSD and must be updated (follow-up filed; that file has unrelated in-flight edits).
- `psycopg[binary]` added to `requirements.txt`.
