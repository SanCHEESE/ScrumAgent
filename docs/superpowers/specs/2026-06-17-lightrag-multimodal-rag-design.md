# LightRAG Multimodal RAG Design

Date: 2026-06-17
Status: approved direction, ready for implementation planning

## Context

The original MVP documents named RAG-Anything as the RAG engine. Current upstream
direction folds RAG-Anything's multimodal capabilities into LightRAG, and the
project decision is to use LightRAG as an external service rather than linking it
directly into the FastAPI backend.

The backend still owns the app contract. Agents call `backend/app/rag.py`, not
LightRAG directly. This keeps `meeting_participation`, `user_chat`, Settings, and
Trace insulated from LightRAG API changes and lets deployment switch storage
backends without changing agent code.

## Goals

- Run LightRAG multimodal processing in a separate Docker service.
- Use a storage adapter instead of direct filesystem-only storage.
- Use PostgreSQL locally for RAG storage parity.
- Use Cloud SQL for PostgreSQL on GCP when the deployment target is built.
- Preserve project-scoped retrieval and citation metadata.
- Keep the first implementation slice useful for text meeting artifacts while
  leaving document/image ingestion available through the same service boundary.

## Non-Goals

- Do not make agents import or configure LightRAG directly.
- Do not move Jira/Notion live reads into RAG. `jira_notion` remains the owner of
  live external context.
- Do not add arbitrary user file upload as part of the first backend slice.
- Do not replace the app's existing relational persistence model in the same RAG
  issue unless a later implementation plan explicitly chooses to do so.

## Architecture

The runtime has three relevant layers:

1. FastAPI backend, including `app/rag.py`.
2. LightRAG service container.
3. PostgreSQL storage used by LightRAG adapters.

Local Docker Compose will gain a `postgres` service and a `lightrag` service.
The backend calls LightRAG over HTTP through a small client in `app/rag.py`.
Locally, LightRAG points its KV/vector/graph/document-status stores at the local
PostgreSQL service. On GCP, the same storage adapter points at Cloud SQL
PostgreSQL.

The backend configuration should expose only app-level settings, for example:

- `RAG_PROVIDER=lightrag`
- `LIGHTRAG_BASE_URL=http://lightrag:9621`
- `LIGHTRAG_WORKSPACE=scrumagent`
- `LIGHTRAG_TIMEOUT_SECONDS=...`

LightRAG's own parser, VLM, embedding, and storage settings stay on the LightRAG
container side. The backend should not know about `KV_STORAGE`, `VECTOR_STORAGE`,
or parser routing except through deployment config.

## Data Flow

### Meeting indexing

`meeting_participation` receives normalized meeting artifacts and LLM analysis.
It calls the app RAG contract with project-scoped documents:

- transcript
- summary
- decisions
- action items
- blockers
- later: screen captures or linked documents when available

The app adapter sends text artifacts to LightRAG first. Multimodal files can be
sent to LightRAG's file/document ingestion endpoint when the source module starts
producing files. Every ingested unit carries app metadata:

- `project_id`
- `meeting_id`
- `artifact_id` when available
- `artifact_type`
- `source_kind`
- `title`
- `source_uri` or content reference
- timestamp range when available

### Chat retrieval

`user_chat` calls `retrieve(question, k, filters)` through `app/rag.py`.
The default filters include the active `project_id`, so no cross-project leakage
is possible through normal chat. The adapter translates LightRAG hits into the
stable app result shape:

- `text`
- `score`
- `citation_meta`

`user_chat` passes these snippets and citation metadata into the LLM gateway. If
RAG is insufficient and the question needs live Jira/Notion data, the runtime
handoff to `jira_notion` remains unchanged.

### Settings preview

`/settings -> Knowledge base` should use backend endpoints backed by the same
adapter:

- index source counts by project
- index health/status
- search preview

Until the LightRAG status API is implemented, the UI must show honest unavailable
or empty states rather than mock counts.

## Storage

LightRAG uses PostgreSQL through its storage adapters for local testing and GCP.
The intended production backend is Cloud SQL for PostgreSQL, consistent with the
existing production DB direction.

Local Postgres is introduced for RAG parity. The app's own `DATABASE_URL` can
remain on SQLite for unrelated backend tests unless the implementation plan
explicitly scopes a broader local-Postgres migration.

## Error Handling

- LightRAG unavailable: indexing returns a retryable backend error and records a
  trace step; chat retrieval degrades to an empty context with a visible trace
  warning, not a silent hallucination path.
- Partial ingestion failure: meeting artifacts keep their relational state; RAG
  indexing can be retried idempotently by `meeting_id` plus artifact metadata.
- Citation metadata missing: adapter rejects the hit in tests or returns it as an
  uncited low-confidence result only if the caller explicitly permits that.
- Cross-project retrieval: adapter requires project filters for user-facing chat.

## Testing

- Unit tests for `app/rag.py` with a fake LightRAG HTTP client.
- Contract tests proving index and query metadata round-trip.
- Tests that `project_id` filters are mandatory for chat retrieval.
- Compose smoke test in the implementation slice: backend can reach LightRAG;
  LightRAG can reach local Postgres.
- Later e2e: Settings Knowledge base search preview shows real results and honest
  empty/error states.

## Implementation Slices

1. Ops foundation: add local Postgres and LightRAG services, health checks, env
   template, and storage adapter configuration.
2. Backend adapter: implement `app/rag.py` against LightRAG with fake-client TDD
   and stable app result types.
3. Agent integration: `meeting_participation` writes, `user_chat` reads, Trace
   records retrieval/indexing steps.
4. Settings: replace hardcoded Knowledge base tab with live project-scoped status
   and search preview.
5. GCP: configure the same LightRAG service to use Cloud SQL PostgreSQL.
