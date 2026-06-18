---
type: meta
title: "Wiki Log"
created: 2026-05-10
updated: 2026-06-18
tags: [meta, log]
---

# Wiki Log

Append-only chronological record. Newest entries on top. Never edit past entries.

## 2026-06-18 — RAG sync hardening: defer-on-busy + embedding throughput guard (ScrumAgent-vw3)

Debugged a live eSIM-project error `clear_project failed: LightRAG pipeline still
busy after 120s`. Two linked root causes, both fixed:

1. **LightRAG embedding overload.** The eSIM Jira backlog is **2626 docs**. LightRAG's
   default **8** concurrent embedding workers (`EMBEDDING_FUNC_MAX_ASYNC`) against
   OpenAI `text-embedding-3-small` hit rate-limit backoff that pushed calls past the
   **60s** embedding *worker* timeout (`EMBEDDING_TIMEOUT=30` → worker 60s) → **493/2626
   docs FAILED** and the pipeline halted at batch 2134. While that long job ran,
   `pipeline_status.busy` stayed true >120s, so a concurrent resync's `clear_project`
   idle-wait timed out → the reported error. (Distinct from `x0f` 403-no-access.)
   Fix: lower embedding concurrency + raise the timeout via new overridable compose
   env — `LIGHTRAG_EMBEDDING_FUNC_MAX_ASYNC=2`, `LIGHTRAG_EMBEDDING_TIMEOUT=180`,
   `LIGHTRAG_MAX_PARALLEL_INSERT=2`. Verified live: workers re-init as
   `2 workers, Func 180s/Worker 360s`, reprocess of the 493 failed ran with **zero**
   60s timeouts.
2. **App fragility.** A destructive resync/auto run that meets a busy pipeline waited
   the bounded `RAG_PIPELINE_MAX_WAIT_SECONDS=120` then hard-failed as `failed` (scary
   "Last sync error"); since `failed` isn't a success the scheduler kept re-firing.
   Fix: `execute_run` now probes `RagClient.pipeline_busy()` before the destructive
   clear; if LightRAG is busy with another job the run is marked the new
   `IngestionStatus.deferred` (no error banner) and the scheduler retries next tick.
   First-time `created` ingestion never probes. A failing probe means "proceed" so a
   genuinely-down LightRAG still surfaces. New `pipeline_busy()` adapter method.

Recovery: used LightRAG `POST /documents/reprocess_failed` (re-processes only the 493
FAILED docs, no re-fetch, no full wipe). Tests: 252 backend green (+5 new); web tsc
clean. Touches `rag.py`, `ingestion.py`, `models/types.py`, `KnowledgeBaseSection.tsx`,
`docker-compose.yml`, `.env.example`. Follow-up to `ScrumAgent-srp`.

## 2026-06-18 — Code-review fixes for live user_chat regressions (ScrumAgent-5t3)

Reviewed the 2026-06-18 user_chat/RAG streaming commits and fixed confirmed
regressions in the live chat path.

**Bugs fixed:**

- `/chat?seed=...` could drop the Home → chat auto-send when the chat screen mounted
  before `ActiveProjectProvider` finished loading projects. `ChatScreen` now waits
  for a real active project before consuming and sending the seed.
- Switching active projects kept the previous project's `conversationIdRef`,
  active session, and persisted message ids. The first send in the next project
  could include a stale `conversation_id` and get rejected by the backend. Project
  changes now cancel in-flight streams and reset chat session state.
- `lib/chat-stream.ts` used raw `fetch` without the shared 401 behavior. Expired
  tokens during SSE chat now clear local auth storage and redirect to `/login`,
  matching `apiFetch`.
- `append_message()` did not bump `Conversation.updated_at`, so active old
  conversations could stay buried in the history list. The repository now updates
  the parent conversation timestamp in the same transaction.
- `wiki/flows/chat.md` had stale SSE payload names (`text` instead of `delta`,
  `message_id` in the wrong event) and the wrong Remember source kind. Contract
  docs now match `routers/chat.py`.

**Verification:** backend pytest green (**247 tests**); `apps/web` typecheck green;
`apps/web` production build green; `chat.spec.ts` green (**7 Playwright tests**),
including new regressions for delayed seed send, project switch reset, and SSE 401
session expiry.

## 2026-06-18 — user_chat RAG streaming chat slice (ScrumAgent-r0k / 2jb / o39)

Shipped the project-scoped, RAG-grounded chat end-to-end. Answers come ONLY from
the knowledge base (anti-hallucination by construction). Streams over SSE with
inline citations. Conversations are private and resumable per user/project. A
"Remember" button pushes Q+A answers back into the RAG index.

**What shipped (code + tests):**

- `backend/app/rag.py` gained `retrieve(project_id, question, k)` (LightRAG
  `/query` with `only_need_context`, then project-prefix post-filter — drops
  cross-project + uncited chunks) and `clear_source(project_id, kind, id)` (exact
  `file_source` delete used for Remember dedup). `index_meeting` remains planned
  (`ScrumAgent-o39`).
- `backend/app/llm.py`: `LlmGateway` — streaming wrapper over
  `langchain_openai.ChatOpenAI`; model from `OPENAI_CHAT_MODEL or OPENAI_MODEL`;
  writes one `LlmUsage` row per call. New setting `openai_chat_model`.
  `langchain-openai` added to requirements.
- `backend/app/runtime/` (orchestrator): `contracts.py` (`AgentName`, `RunMode`,
  `RunContext`, `HandoffTarget`, `CAPABILITIES` allow-list) + `orchestrator.py`
  (`Orchestrator`, `GatedServices` proxy, `CapabilityError`, trace recording,
  mediated handoff).
- `backend/app/repositories/trace.py`: `start_run` / `record_step` / `finish_run` /
  `get_run` / `list_steps` read+write repository (models pre-existed).
- `backend/app/agents/user_chat.py`: DETERMINISTIC pipeline — retrieve always first;
  empty context → fixed "not in knowledge base" message, ZERO LLM calls; else
  grounded prompt (numbered passages + last 10 history msgs) → stream tokens →
  citations. Yields `TokenEvent` / `CitationsEvent`.
- `backend/app/routers/chat.py`: `POST /projects/{id}/chat` (SSE:
  meta→token\*→citations→done/error), `GET /projects/{id}/conversations`, `GET
  /projects/{id}/conversations/{cid}/messages`, `POST
  /projects/{id}/chat/messages/{mid}/remember`. JWT + `require_project_access` +
  per-user conversation ownership.
- `backend/app/models/chat.py`: `Conversation` gained `project_id` FK (NOT NULL,
  indexed) — conversations are project-scoped AND private.
- Frontend `apps/web`: real SSE chat in `ChatScreen.tsx` (replaces setTimeout mock),
  Remember button in `ChatMessage.tsx`, resumable per-project history,
  `lib/chat-stream.ts` (fetch-based SSE reader) + chat methods in `lib/api.ts`.
  `tsc` clean.
- **245 backend unit tests green.** Live e2e against Docker/LightRAG/OpenAI is NOT
  yet done — tracked as `ScrumAgent-uzx`.

**Key decisions made this slice:**

1. **App-owned orchestrator, NOT deepagents/langgraph** — determinism +
   testability + structural anti-hallucination for a single non-handoff agent;
   YAGNI on the tool-loop; clean seam to adopt the library when real multi-agent
   handoff lands. ADR: [[decisions/2026-06-18-app-owned-orchestrator-not-deepagents-lib]].
2. **Remember dedup via `clear_source`** — exact-match delete before re-insert
   prevents duplicate passages from repeated presses on the same message.
3. **Project-scoped private conversations** — `project_id` FK on `Conversation`;
   only the owning user can read their conversations.
4. **No live Jira/Notion handoff in this slice** — the orchestrator handoff
   mechanism exists and is wired but unused; `user_chat` answers purely from RAG.

**Wiki pages updated:** [[modules/rag]], [[modules/llm-gateway]],
[[modules/runtime-orchestrator]], [[modules/trace-store]],
[[concepts/deepagents-runtime]], [[flows/chat]], [[domains/agents]]. New ADR:
[[decisions/2026-06-18-app-owned-orchestrator-not-deepagents-lib]].

## 2026-06-18 — Fix RAG re-sync race vs LightRAG single-flight pipeline (ScrumAgent-srp)

Fixed the re-sync race found live in the `bah` full-stack test (308 docs → only 100
deleted, insert 409'd, run failed). Verified the exact v1.5.3 REST contract from the
pinned image source (`document_routes.py`): deletes run async and the pipeline is
single-flight, so `DELETE /documents/delete_document` returns `200
{status:"deletion_started"}` while draining and `200 {status:"busy"}` when it
scheduled nothing (not an HTTP error — our old code's `raise_for_status()` treated a
busy delete as success → the partial-delete symptom), while `POST /documents/texts`
returns **409** during a drain. `_acquire/_release_destructive_busy` couple
`pipeline_status.busy` with `destructive_busy`, so polling `GET
/documents/pipeline_status` until `busy=false` reliably means a clear has drained.

`RagClient` ([[modules/rag]]) now: polls for idle before each delete batch and
**retries** a `status:"busy"` delete; drains after `clear_project`; waits for idle
before each insert and **retries on 409**. Bounded by new settings
`RAG_PIPELINE_POLL_SECONDS` (1) / `RAG_PIPELINE_MAX_WAIT_SECONDS` (120) /
`RAG_PIPELINE_BUSY_RETRIES` (5); a `sleep` seam is injected for fast tests. Timeout
surfaces a `RagError` (hard, visible run failure) rather than a silent partial sync.
TDD with a stateful `MockTransport` fake modelling busy→idle, delete-busy→accepted,
and 409→200. 6 new adapter tests; 2 pre-existing handlers updated for the new poll;
**216 backend tests green**. Not re-verified against a live stack (docker down).

## 2026-06-17 — Full-stack RAG indexing verification (live, ScrumAgent-bah)

Brought up the full Docker stack (postgres + lightrag + backend + frontend, all
healthy) and exercised auto-sync end-to-end against the real **eSIM** project
(Jira project `ESIM` on municorn.atlassian.net), seeded from `backend/.local/dev.db`
into the compose DB, in `agent_preview` mode.

**Proven working live:** auto-sync scheduler fires on startup → `IngestionRun(trigger=auto)`
→ Jira fetch → submit to LightRAG (308 real issues) → KB status reflects
`by_source_kind={jira:308}`. The whole adapter/scheduler/endpoint path is sound.

**Bugs found live + fixed (TDD, 211 backend tests green):**
- `ScrumAgent-2vi` — `JiraReadClient` called the removed `GET /rest/api/3/search`
  (410 Gone; Atlassian removed it May 2025). Migrated to `POST /rest/api/3/search/jql`
  with `nextPageToken` paging. After fix: fetched 308 real ESIM issues.
- `ScrumAgent-54k` — `resync_knowledge_base` was a sync `def`, so FastAPI ran it in
  a threadpool and `IngestionRunner.schedule`'s `asyncio.create_task` raised
  "no running event loop" (500). Made it `async` (matches `create_project`). The
  unit test missed it because `get_ingestion_runner` was faked with a runner that
  never calls `create_task`; added a loop-requiring-runner regression test.

**Filed (not fixed):**
- `ScrumAgent-srp` — re-sync/auto-sync of an already-indexed project races
  LightRAG's single-flight pipeline: `clear_project` fires async DELETEs, returns
  before they drain, then `index_documents` POST hits 409 Conflict. Affects every
  re-sync with existing docs. Fix: poll `GET /documents/pipeline_status` until idle
  between clear and insert, and/or retry on 409.

**Environment blocker (not code):** LightRAG processing failed all 308 docs —
the configured `OPENAI_API_KEY`'s project (`proj_bWsAjbNswWOhDqzZhpAGcAcX`) has no
access to OpenAI embedding models (both `text-embedding-3-small` and
`text-embedding-ada-002` → 403 `model_not_found`), though it can use the chat model.
Real indexing needs a key whose project is granted an embedding model. Stack left
running in `agent_preview` for inspection; `.env` got temporary
`APP_ENVIRONMENT=agent_preview`, `NEXT_PUBLIC_APP_ENVIRONMENT=agent_preview`,
`LIGHTRAG_EMBEDDING_MODEL=text-embedding-ada-002` (revert to restore production mode).

## 2026-06-17 — RAG auto-sync + real Knowledge base settings tab (ScrumAgent-bah)

Extended the ingestion epic (`lcw`) with periodic auto-sync and made the mock
Knowledge base settings tab real. Decisions: per-project on/off toggle + a fixed
backend cadence (6h), on by default; whole KB tab made real except search (deferred
to the unbuilt retrieve path `n6h`/`o39`, shown as an honest empty state).

**Backend:**

- `IngestionTrigger.auto` added; `execute_run` now clears-then-reindexes for
  `resync` **or** `auto` (LightRAG has no upsert — edited items would orphan).
- `Project.auto_sync_enabled` (bool, default true). No Alembic yet (`soe`) — fresh
  DBs get the column via `create_all`; existing dev DBs need a one-line `ALTER`.
- `app/auto_sync.py` — in-process scheduler (approach A): `select_due_projects`
  (integration + enabled + no in-flight run + never-synced-or-stale),
  `run_due_syncs` (one `IngestionRun(trigger=auto)` per due project via the shared
  `IngestionRunner`), `AutoSyncScheduler.start/stop` (asyncio loop seam). Wired in
  `main.py` lifespan behind the `rag_auto_sync_enabled` kill-switch. Settings:
  `rag_auto_sync_enabled`, `rag_auto_sync_interval_hours=6`,
  `rag_auto_sync_tick_seconds=300`. Single-process assumption noted.
- `RagClient.status` now also returns `by_source_kind` (parsed from `file_source`).
- Endpoints: `PUT /knowledge-base/auto-sync {enabled}` (admin-only); `GET
  /knowledge-base/status` extended with `auto_sync_enabled`,
  `auto_sync_interval_hours`, computed `next_sync_at`, and `rag.by_source_kind`.
- 209 backend tests green (foundation 3, scheduler 10, KB API 4 new + existing).

**Frontend:**

- `KnowledgeBaseSection.tsx` rewritten from mock to live: real source counts
  (`by_source_kind`; meetings shown as "indexed when meetings ship"), real index
  health (last run, total docs, `by_status`), admin-gated auto-sync `Toggle` (PUT)
  and "Sync now" (resync), search rendered as a disabled "available when chat ships"
  empty state. New `lib/api.ts` methods: `getKnowledgeBaseStatus`,
  `resyncKnowledgeBase`, `setKnowledgeBaseAutoSync`. Typecheck clean; 16 settings
  e2e green (4 new, route-mocked).

Spec: `docs/superpowers/specs/2026-06-17-rag-auto-sync-design.md`.

## 2026-06-17 — Jira/Notion backlog ingestion into LightRAG (ScrumAgent-lcw)

Shipped the first RAG write path: when a project is created with Jira and/or Notion
credentials, the existing backlog is fetched and indexed into LightRAG as a
non-blocking background job. Chat and agents therefore have backlog context from day
one. Manual re-sync is available via admin endpoint.

**Components shipped** (all in `backend/`):

- `app/rag.py` — `RagClient` adapter: `index_documents(project_id, docs)` (batch
  `POST /documents/texts`), `clear_project` (delete-by-`file_source` prefix),
  `status` (project-scoped doc counts). Project isolation is encoded as
  `file_source = "{project_id}::{source_kind}::{source_id}"` because LightRAG
  v1.5.3 has no per-doc metadata, caller-id, or upsert (API spike `ScrumAgent-m3c`);
  re-sync = clear-then-reinsert. The knowledge graph itself is shared
  (`ScrumAgent-o39`).
- `app/jira_client.py` / `app/notion_client.py` — read-only clients:
  `JiraReadClient.fetch_issues` (paginated ADF→text) and
  `NotionReadClient.fetch_pages` (recursive depth-bounded block walk). Both produce
  `app/sources.py::SourceDocument`. Read-only ahead of the planned Rovo (`qor`) /
  Notion MCP (`ilz`) write slices.
- `app/ingestion.py` — `IngestionRun` model (status `pending/running/completed/
  partial/failed`, trigger `created/resync`), `execute_run` (per-source error
  isolation), `run_ingestion` (own DB session), `IngestionRunner` (GC-safe
  `asyncio.create_task` background seam).
- `app/routers/projects.py` — create-time trigger (non-blocking; `POST /projects`
  latency unchanged), `GET /projects/{id}/knowledge-base/status` (members),
  `POST /projects/{id}/knowledge-base/resync` (admin-only via `require_project_admin`).

**Scope:** text only. Deferred: images/attachments, auto-sync, chat-side retrieval
(`ScrumAgent-n6h`).

**Verification:** 192 backend tests passing. Design spec:
`docs/superpowers/specs/2026-06-17-jira-notion-backlog-ingestion-design.md`.

**Wiki:** updated [[modules/rag]] (write-path status, `file_source` scheme, shared-
graph limitation); created [[flows/backlog-ingestion]]; linked from
[[flows/_index]] and [[index]].

## 2026-06-17 — Code-review fixes on LightRAG local stack (ScrumAgent-89a)

Follow-up to `qjh` after a code review of the day's commits. Startup coupling was
too tight: `backend` (and via it `frontend`) hard-gated on `lightrag`
`service_healthy`, even though RAG isn't wired into the backend yet
([[modules/rag]], ScrumAgent-o39). A LightRAG/Postgres failure — or a VM reboot
with a flaky RAG — would block the whole app (auth, projects, chat) from
starting. Changed `backend → lightrag` and `frontend → backend` to
`service_started` (ordering only); `lightrag → postgres` stays `service_healthy`
because LightRAG genuinely needs the DB. Added `start_period: 15s` to the backend
healthcheck, and normalized a blank `LIGHTRAG_API_KEY=` to `None` in `Settings`
(field validator, TDD red→green) so downstream `is None` checks match an absent
var. The top-of-file compose comment was corrected: this is not a verbatim GCP
lift-and-shift (the local `postgres` would run redundantly next to Cloud SQL).

Follow-ups filed: GCP compose override to drop local postgres (ScrumAgent-ebp);
deeper LightRAG readiness probe, since `/health` doesn't exercise the OpenAI or
PG write paths (ScrumAgent-8w4).

Verification: new config test red→green; full backend pytest green (171);
`docker-compose config --quiet` green; resolved compose confirms `service_started`
on backend/frontend and `start_period` applied.

## 2026-06-17 — LightRAG local ops foundation (ScrumAgent-qjh)

Local Compose now includes the infrastructure foundation for the LightRAG
multimodal RAG slice: `postgres`, `lightrag`, `backend`, and `frontend`.
`postgres` uses `gzdaniel/postgres-for-rag:pg18-age-pgvector` with the
Postgres 18-compatible `/var/lib/postgresql` mount and is marked
`platform: linux/amd64` for Apple Silicon Docker Desktop. `lightrag` is pinned to
`ghcr.io/hkuds/lightrag:v1.5.3`, exposes `:9621`, and uses PostgreSQL-backed
`PGKVStorage`, `PGDocStatusStorage`, `PGGraphStorage`, and `PGVectorStorage`.
Startup ordering is health-gated: backend waits for healthy LightRAG, and the
frontend waits for healthy backend.

Backend settings gained only app-facing adapter config:
`RAG_PROVIDER`, `LIGHTRAG_BASE_URL`, `LIGHTRAG_WORKSPACE`,
`LIGHTRAG_TIMEOUT_SECONDS`, and optional `LIGHTRAG_API_KEY`; storage adapter and
`POSTGRES_*` details remain container-side deployment config. `.env.example` now
documents local and GCP LightRAG storage wiring. [[domains/deployment]],
[[flows/gcp-deployment-topology]], and [[modules/rag]] were updated to make the
local PostgreSQL vs Cloud SQL mapping explicit and to correct local Docker docs
back to Docker Desktop.

Verification: config TDD red/green for new backend settings; full backend
pytest green; `docker-compose config --quiet` green; smoke-started
`postgres`/`lightrag`/`backend` with all three healthy; backend `/health` returned
`{"status":"ok"}`; backend reached `http://lightrag:9621/health` over the
Compose network and LightRAG reported the PostgreSQL storage adapters and
workspace `scrumagent`.

## 2026-06-17 — RAG target changed to LightRAG multimodal service

The RAG architecture moved from the original RAG-Anything wording to a separate
LightRAG multimodal service. `backend/app/rag.py` remains the app-owned adapter
contract, so agents and routers do not depend on LightRAG internals. Local
testing will use PostgreSQL-backed LightRAG storage for parity; GCP will point
the same storage adapter at Cloud SQL PostgreSQL.

First implementation slice remains text-first: meeting transcripts, summaries,
decisions, action items, and blockers are indexed with `project_id`, `meeting_id`,
artifact metadata, and citation refs. The service boundary leaves room for later
multimodal artifacts (screenshots, PDFs, Office docs, images) without changing
agent contracts. Updated [[modules/rag]], [[concepts/lightrag-multimodal]],
[[concepts/rag-anything]], [[sources/concept]], [[sources/mvp-v2-plan]],
[[domains/backend]], [[domains/deployment]], and the hot cache. Spec written at
`docs/superpowers/specs/2026-06-17-lightrag-multimodal-rag-design.md`.

## 2026-06-16 — Suggested members + batch-add + editable roles in Settings → Members (ScrumAgent-idt)

`/settings → Members` went from a read-only role table to read-write, full-stack. Now
you see meeting participants as **Suggested members**, select and batch-add them, and
edit roles in **Team members**. People without an account are persisted as **email
invitations** and become real members on their first Google login.

- **Data model**: new `PendingProjectMember(project_id, email, role)` (composite PK,
  cascade-deleted with project, email lower-cased) — *not* a nullable `ProjectMember.user_id`
  (that breaks its composite PK). `ProjectOut` gained an additive `pending_members[]`.
- **Endpoints** (all under `require_project_access`): `GET /{id}/member-suggestions`
  (live agent calendar via the existing `_participant_suggestions`, minus agent/members/
  invites; 409 if Google unconnected), `POST /{id}/members` (batch — existing user →
  `ProjectMember`, unknown email → invite; idempotent), `PATCH /{id}/members/{user_id}`,
  `PATCH /{id}/pending-members/{email}`.
- **Login reconciliation**: new `app/membership.py` `grant_pending_memberships(db, user)`,
  called in `auth.py`'s `google_callback` after the user upsert, **every** login,
  idempotent, never downgrades an existing membership.
- **Frontend**: `MembersSection.tsx` rewritten (editable role `<select>`s, Invited rows,
  `.db-option` selectable suggestions + "Add selected (N)"); 4 new `lib/api.ts` methods
  reusing the `MeetingParticipantSuggestion` shape.
- **Scope/altitude**: mutations gated by `require_project_access` only (see-all preview
  compat) — admin-only gating, member/invite removal, and invite expiry are filed
  follow-ups. DRY: reused `MeetingParticipantSuggestionOut`/`_participant_suggestions`
  rather than new types.
- **Gates**: backend `pytest` **170 passing** (22 new across model, 4 endpoints,
  reconciliation, login wiring); frontend `tsc` clean. Browser data-flow check was
  CORS-blocked (preview forced onto a non-`:3000` port; backend allows `:3000` only) —
  `/settings → Members` confirmed to mount without runtime error; full flow verifiable
  on the user's own `:3000` (HMR + CORS-allowed). Spec + plan in
  `docs/superpowers/{specs,plans}/2026-06-16-suggested-members*.md`.

## 2026-06-16 — DRY/altitude refactors from the code review (ScrumAgent-iar, -1yf, -7xk, -44x, -zis)

Five behaviour-preserving refactors filed by the same review. Quality gates green:
backend `pytest` (148), frontend `tsc`, Playwright e2e (68 passing; the only reds are
the pre-existing login/auth specs that assume a production server but ran against the
local `dev:preview` one — env, not code).

- **`-1yf` backend access gate**: `backend/app/routers/projects.py` now resolves
  per-project access through one dependency, `require_project_access`, and the
  `agent_preview` see-all bypass through one `can_access_all_projects` (consulted by
  both that gate **and** `list_projects`). Removed the per-route
  `settings=Depends(get_settings)` plumbing + the duplicate bypass branch + the
  `_can_access_project`/`_get_member_project` helpers. A new `/{project_id}/…`
  endpoint now inherits access just by depending on the gate.
- **`-iar` meetings fan-out**: new `ProjectMeetingsProvider` (mounted in `AppShell`)
  fetches each project's calendar once and feeds `HomeMeetingsStat`,
  `RecentMeetingsLive`, the Sidebar badge, and `/meetings`. Removed each component's
  own `listProjects` + fan-out; the project set comes from `ActiveProjectProvider`
  (`Project` gained `color`). See [[modules/calendar-sync]].
- **`-7xk` date parser**: `lib/calendar-date.ts` replaces five hand-rolled all-day
  parse copies. **`-44x` avatar**: `lib/avatar.ts` (one palette + rule) replaces three
  copies (`UserMenu`/`MembersSection`/`CalendarMeetingRow`). **`-zis` identity**:
  `lib/use-current-user.ts` (`useCurrentUser`) replaces the duplicated token→`/auth/me`
  resolution; after `-iar` only the Home greeting and `UserMenu` still need it. See
  [[domains/frontend]] §Shared client helpers.

## 2026-06-16 — Code-review fixes: meetings count, recent list, home header, backend hardening (ScrumAgent-y6a, -oqo, -hky, -02t)

A review of the 2026-06-15/16 commits surfaced correctness bugs in the freshly
shipped live-data work; fixed via four parallel agents + integration.

- **Meetings count** (`meeting-stats.ts`, `HomeMeetingsStat`, `Sidebar`): dedup
  events by id (no cross-project double-count); DST-safe week bounds via calendar
  arithmetic (was a fixed 168h offset); partial fetch failures surfaced
  (title/aria, `—` when all fail) instead of silently under-reported.
- **Recent meetings** (`RecentMeetingsLive`): distinguishes empty vs
  needs-connection (409) vs hard error; filters cancelled events from the list;
  dedups rows by id; key uses event id.
- **Home header** (`page.tsx`, `ActiveProjectProvider`, `Sidebar`): greeting
  computed post-mount (hydration-safe); provider exposes `status`
  loading/ready/error; subtitle AND sidebar switcher show an error affordance on
  `GET /projects` failure rather than the "No project selected" sentinel.
- **Backend hardening** (`deps.py`, `projects.py`): `_ensure_preview_user`
  tolerates a concurrent insert (IntegrityError → rollback → re-query) and
  pre-existing duplicates (`.first()`); `_serialize` skips orphaned memberships
  instead of 500-ing.
- **Config** (`docker-compose.yml`): frontend `NEXT_PUBLIC_APP_ENVIRONMENT` reads
  its own var (was slaved to `${APP_ENVIRONMENT}`, making the documented knob a
  no-op under Compose).

Verification: `tsc --noEmit` clean; backend `pytest` 148 passed (141 + 7 new TDD);
17 home e2e tests green, no regression. (Pre-existing `login`/`auth` e2e failures
were the local dev server running in `agent_preview`, not these changes.) The five
cleanup/altitude findings were filed as ScrumAgent-iar/-1yf/-7xk/-44x/-zis (not
implemented here).

## 2026-06-16 — Project creation meeting participant suggestions and roles (ScrumAgent-eu3)

The Add Project wizard now preloads meeting participant suggestions right after
the Google Workspace agent account is authorized. While the user is on Jira and
Notion steps, the frontend calls the new pending-session endpoint
`GET /projects/integrations/google/meeting-participants?auth_session_id=...`,
then step 5 shows only signed-in users whose emails appeared in organizer or
attendee lists, plus the fixed fallback accounts `dev@municorn.com` and
`a.bochkarev@municorn.com`. Arbitrary directory users are no longer suggested.

Project members can now be created with roles. `ProjectRole` is
`viewer`/`member`/`admin`, the owner remains `admin`, and `POST /projects`
accepts role-aware `members[]` while keeping legacy `member_user_ids` as
`member`. The step 5 UI lets the creator choose a role per selected candidate.

Verification: watched the new backend tests fail on missing endpoint/role-aware
payloads and the e2e fail because `random@municorn.com` was still suggested.
After implementation, `backend/.venv/bin/pytest tests/test_projects_api.py`,
`npm --prefix apps/web run typecheck`, and `npm --prefix apps/web run test:e2e
-- projects.spec.ts` are green.

## 2026-06-16 — Upload recording disabled on Meetings (ScrumAgent-dik)

The `/meetings` header still shows the **Upload recording** affordance, but it
is now disabled because the recording upload/import flow is not implemented yet.
This prevents the button from appearing actionable while preserving the future
CTA location in the page header.

Verification: watched the focused meetings e2e fail because Upload recording was
enabled, then pass after adding `disabled`. `npm --prefix apps/web run
typecheck` and the full `meetings.spec.ts` are green. In-app browser on
`/meetings` showed the button with the disabled attribute.

## 2026-06-16 — Kabanchik SVG boar logo and favicon (ScrumAgent-qe6)

The sidebar brand mark no longer renders the placeholder `🐗` emoji. Added
`apps/web/public/kabanchik-boar.svg`, a compact one-colour running boar
silhouette, and `Sidebar` now renders it as the logo image. `app/layout.tsx`
also registers the same SVG through `metadata.icons`, so it is the app favicon.
The shell smoke test now verifies the SVG logo, absence of the emoji, and the
favicon link.

Verification: watched the focused Home shell test fail because the SVG logo was
missing, then pass after adding the asset and metadata. `npm --prefix apps/web
run typecheck` and the full `home.spec.ts` are green. In-app browser on `/`
reported `/kabanchik-boar.svg` for both the logo `img` and favicon link, with
empty logo text.

## 2026-06-16 — Sidebar footer uses direct logout (ScrumAgent-fv7)

The sidebar footer no longer opens a popover/menu when the user row is clicked.
`components/shell/UserMenu.tsx` now renders the authenticated user row as a
non-menu `div.user-chip`, and the former chevron position is a direct icon
button with `aria-label="Sign out"` / `title="Logout"`. The old upward
`role="menu"` popover and menuitem styles were removed. Explicit logout now
clears every app token key (`kabanchik.production.token`,
`kabanchik.agent_preview.token`, and legacy `kabanchik.token`) so switching
between preview and production dev servers cannot leave a stale session token.

Verification: watched the focused auth e2e fail because direct Sign out was
missing, then pass after the component/CSS/auth change. `npm --prefix apps/web
run typecheck` and `home.spec.ts` are green. Full `auth.spec.ts` was not a clean
signal against the currently reused `agent_preview` dev server: its production
unauthenticated Sign in case expects no preview principal. In-app browser on `/`
showed `Dev User`, direct `Sign out`, and zero menu/popover elements before and
after clicking the user row.

## 2026-06-16 — Meetings sidebar badge uses live weekly count (ScrumAgent-cv3)

The shell **Meetings** nav badge no longer comes from `NAV`'s hardcoded
`badge: 2`. The sidebar now loads each real project calendar through the same
`GET /projects/{id}/meetings` endpoint as Home and counts non-cancelled meetings
in the current browser-local week using shared `apps/web/lib/meeting-stats.ts`
logic. When no live project data exists, the Meetings badge is absent instead of
showing a stale number; the Updates badge remains driven by pending updates.

Verification: watched the Home e2e fail with the nav badge still reading `2`
while the mocked live weekly count was `3`, then pass after the change.
`npm --prefix apps/web run typecheck`, `home.spec.ts`, and `meetings.spec.ts`
are green. The in-app browser on `/` showed no stale Meetings badge when the
local app had no selected project/live calendar data.

## 2026-06-16 — Shell project switcher uses real projects (ScrumAgent-iie)

The shell `ActiveProjectProvider` no longer initializes from
`apps/web/lib/mock-data.ts` `PROJECTS`, which made every screen show the mock
Platform Team in the sidebar even when `/projects` rendered real API projects.
It now loads `GET /projects`, maps backend `ProjectOut` rows into the existing
project view shape, defaults the active project to the first real row, and lets
`ProjectSwitcherModal` select from that real list. Empty/error cases fall back
to a neutral "No project selected" placeholder instead of another fake project.

Verification: watched `projects.spec.ts` fail because the sidebar still showed
`Platform Team`, then pass after the provider change. `tsc --noEmit` is green,
and the in-app browser on `/projects` showed `eSIM` /
`telecom.scrum.agent@municorn.com` in the sidebar and switcher modal.

## 2026-06-16 — Home Meetings this week stat uses live calendar data (ScrumAgent-9we)

Home's leading **Meetings this week** stat no longer renders the mock
`12 / +3 vs last week`. New `HomeMeetingsStat` loads the user's projects, fetches
each project's live Google Calendar events through the existing
`GET /projects/{id}/meetings` endpoint, counts non-cancelled events in the
browser-local Monday-to-Monday current week, and compares against the previous
week. No-project or failed optional calendar loads stay honest at zero.

Verification: watched the Home e2e fail on the hardcoded `12`, then pass with
fixtures expecting `3` current-week meetings and `+2 vs last week`. `tsc --noEmit`
is green, and the in-app browser showed the real local stat as `2` with
`+1 vs last week`.

## 2026-06-16 — Home Recent meetings shows nearest scheduled events (ScrumAgent-ec9)

Home's **Recent meetings** card now filters live Google Calendar rows to future
events only and sorts them by start time ascending before applying the existing
three-row cap. The card therefore shows the nearest scheduled meetings rather
than the newest calendar events overall, so past meetings no longer appear just
because they are recent.

Verification: watched the Home e2e fail with mixed past/future fixtures
(`Sprint Planning`, `Team Standup`, and past `Calendar Retro` rendered in the old
order), then pass after the component fix. `tsc --noEmit` is green, and the
in-app browser showed only Scheduled rows ordered by upcoming dates.

## 2026-06-16 — Home greeting uses current user and time of day (ScrumAgent-qiw)

Home's page title no longer hardcodes `Good morning, Alice`. The client now
derives `Good morning` / `Good afternoon` / `Good evening` from the browser's
local hour and resolves the display name from `/auth/me`, using the JWT email
only as a pending-state fallback. This applies to both split/classic and focused
Home layouts. In `agent_preview`, the title therefore shows the local fake dev
user (`Dev User`, `dev@municorn.com`) once `/auth/me` resolves, matching the
sidebar identity instead of mixing mock and real users.

Verification: watched the focused Home e2e fail on the old heading, then pass
after the change. Full Home Playwright spec and `tsc --noEmit` green.

## 2026-06-16 — Split preview and production environments (ScrumAgent-byz)

Added an explicit runtime boundary for Codex/agent preview vs real use.
Backend `Settings.app_environment` accepts `production` (default) or
`agent_preview`. Real OAuth JWTs now carry an `env` claim; `get_current_user`
rejects missing/wrong-environment tokens, still 401s in production without a bearer, and
only in `agent_preview` resolves a local preview principal without a bearer.
Project access is still member-only in production, while preview can list/read all
local projects without reusing a real user's token.

Frontend `NEXT_PUBLIC_APP_ENVIRONMENT` mirrors the backend mode. JWTs moved from
the old shared `localStorage["kabanchik.token"]` key into
`kabanchik.production.token` or `kabanchik.agent_preview.token`; storing a new
token clears foreign/legacy keys. The login page shows an explicit preview entry
point, while the sidebar resolves `/auth/me` without bearer in preview and shows
the local fake dev user (`Dev User`, `dev@municorn.com`). `RecentMeetingsLive`
can fetch in preview without requiring a decodable bearer. Config docs and
Compose env forwarding were updated; frontend scripts now include `dev:preview`
and `dev:production`.

Verification: watched RED for backend env-claim/preview-access tests and the
frontend token namespace regression, then green. Full backend pytest green,
`npm --prefix apps/web run typecheck` green, and auth-related Playwright suite
(`login`, `auth`, `home`, `meetings`, `settings`) 34/34 green.

## 2026-06-16 — Live Home Recent meetings (ScrumAgent-0i6)

Home's **Recent meetings** card no longer renders `MEETINGS.slice(0, 3)` from
`apps/web/lib/mock-data.ts`. New `RecentMeetingsLive` loads `GET /projects` and
then each project's `GET /projects/{id}/meetings`, merges the returned Google
Calendar events, sorts by event start descending, and renders the newest three
with real date/month, attendee count, duration, project name, and Scheduled/Past
pills. Rows open the Google Calendar `html_link` when available; otherwise they
fall back to `/meetings`. Empty/error/loading states are local to the card, and
the existing Home layout variants all reuse the same live component. The widget
skips the calendar fetch when no decodable bearer JWT exists, preserving the
unauthenticated shell/tweaks views instead of letting optional calendar loading
redirect the whole page to `/login`. Added a
Playwright regression that mocks calendar events and asserts the old `Daily
Standup` mock row is gone. Verification: RED watched, then `home.spec.ts` green,
`tsc --noEmit` green, and in-app browser checked against the running local app
showing real calendar rows with no console errors.

## 2026-06-15 — Live /settings Members tab (ScrumAgent-l5p)

Reviewed the current project settings surface. Agent behavior (`ScrumAgent-7qy`),
Integrations (`ScrumAgent-d9q`), and Billing (`ScrumAgent-307`) were already live.
`/settings → Members` was still hardcoded mock data; it now loads real projects
through the existing API, lets the user pick a project, and renders that
project's returned member list with names, emails, roles, and honest empty/error
states. Added a focused Playwright regression for project switching. Remaining
mock-only settings tabs were filed separately: Knowledge base (`ScrumAgent-sxm`)
and Notifications (`ScrumAgent-0r1`). Also filed `ScrumAgent-n60` for the invalid
`.gitignore` pattern that makes `rg` print parse errors.

## 2026-06-12 — Live /settings Billing tab (ScrumAgent-307)

`/settings → Billing` is no longer a hardcoded mock. New `llm_usage` table
(`app/models/usage.py`): one row per provider call (project, `run_id` grouping
an agent invocation, `context` label, provider/model/kind/category, units,
`cost_usd`) — designed for the LLM gateway (`ScrumAgent-wqj`) to write into;
until it lands real projects show honest zeros. New member-only
`GET /projects/{id}/billing` aggregates the current calendar month in Python:
MTD + linear projection, per-category costs, per-model usage with 10-day
sparkline series, 6 most recent run-grouped invocations. Frontend
`BillingSection` rewritten: project picker, live fetch, empty states;
`ApiKeysTable` + `billing-mock.ts` deleted (no fake API keys / invoices /
budget — no budget config exists, so the hero bar is spent-vs-projected).
Playwright billing specs now mock `/billing`; `mockSettingsApi` gained default
routes for live tabs so nav clicks never leak requests to a real backend.
Dev seed: `backend/.local/_seed_billing.py`. 9 new pytest (131 total green),
58 Playwright green, verified live against seeded dev data.

## 2026-06-12 — Live /settings Integrations tab (ScrumAgent-d9q)

`/settings → Integrations` is no longer a hardcoded mock (fake OpenAI/Slack cards,
fake Jira sites). New member-only endpoints: `GET /projects/{id}/integrations`
(real google/jira/notion status, never secrets), `PUT …/integrations/jira|notion`
(live-validated then saved — 422 leaves stored creds untouched),
`PUT …/integrations/google` (reconnect: consumes a staged `PendingOAuth`, updates
agent_email + refresh token — finally a recovery path for the meetings 409),
`POST …/integrations/{provider}/test` (probes the *stored* creds; google = 1-event
calendar probe that flips `google_connected` on revoked/restored grants; 409 when
unconfigured). Frontend `IntegrationsSection` rewritten: project picker, real
badges, inline Jira/Notion configure forms with "Validate & save", per-card Test
buttons, Google Reconnect popup (same handshake as the wizard's StepGoogle).
OpenAI/Slack mocks dropped with an honest note. Tests: 23 new pytest (122 green),
4 new e2e (58 green), tsc clean; verified live against dev.db — stored Jira and
Google probes both returned "Connection works" against the real services.

## 2026-06-12 — Real per-project Agent behavior settings (ScrumAgent-7qy)

`/settings → Agent behavior` is no longer local mock state. New
`project_agent_settings` table (1:1 with Project, lazily created — no row means
defaults) holding auto-join / record-audio / capture-screenshots /
confidence-threshold / auto-apply / response-style (enum concise|balanced|detailed)
/ context-window-meetings. New endpoints `GET/PUT
/projects/{id}/settings/agent` (member-only 404 otherwise, PUT = validated full
replace upsert, GET serves defaults when unset). Frontend
`AgentBehaviorSection` now has a project picker, loads settings per project, and
debounce-autosaves every change (600 ms) with a Saving…/Saved/error indicator.
Tests: 14 new pytest (99 green total), settings e2e rewritten with API stubs + 3
new sync tests (54 e2e green), tsc clean, verified live (toggle + select persisted
to dev.db across reloads).

## 2026-06-12 — Live meetings/pending counts on project cards (ScrumAgent-0dx)

`/projects` tiles no longer hardcode `meetings: 0, pending: 0`. `ProjectsListLive`
now fetches each project's agent calendar (`GET /projects/{id}/meetings`, same
endpoint the `/meetings` page uses) after the project list renders: *meetings* =
events in the default window, *pending* = the upcoming subset. Per-project calendar
failures (revoked grant, upstream error) leave that card's counts at zero without
breaking the grid. Covered by two new Playwright tests in `projects.spec.ts`
(counts from a mocked calendar; 409 degrades gracefully). 51 e2e green, tsc clean,
verified live (eSIM card: 20 meetings / 14 pending). `last sync` still shows "—" —
nothing is persisted/synced yet.

## 2026-06-12 — OAuth audit fixes + live calendar meetings (ScrumAgent-imt, ScrumAgent-m5x)

Audited both Google OAuth flows and fixed: consent-cancel no longer 422s (login
callback now 302s to `/login?error=<code>`, rendered as an alert); `email_verified`
required in both callbacks; agent-flow callback renders the `postMessage` popup on
*every* failure (`wrong_domain`, `no_refresh_token`, `exchange_failed`) instead of raw
JSON that left the wizard stuck on "Waiting…"; replayed callback idempotent;
`get_current_user` 401s on non-numeric `sub` and rejects `purpose`-claim (state) JWTs;
CORS origin from `Settings` (.env honored); `StepGoogle` polls `popup.closed`. Then
shipped the first **live calendar read path**: `app/google_calendar.py`
(refresh-token → `events.list`, injectable) + member-only
`GET /projects/{id}/meetings` (409 revoked / 502 upstream), and `/meetings` now renders
real agent-calendar events across all projects (Upcoming/Past tabs, Meet badge,
Google-Calendar deep links) instead of mock data. Updated [[modules/auth]],
[[modules/project-provisioning]], [[modules/calendar-sync]]. Backend 85 tests green,
47 Playwright e2e green, verified live (incl. real `invalid_grant` → reconnect alert).

---

## 2026-06-04 — Real auth identity in the sidebar + graceful session expiry (ScrumAgent-9pf)

Frontend-only. The sidebar-footer user chip is now `components/shell/UserMenu.tsx` and reflects the **real** signed-in user (name + initials avatar from `/auth/me`, JWT `email` claim as an instant label) instead of the hard-coded mock `alice`; clicking it opens a Sign out menu, and with no token it offers Sign in → `/login`. The API client (`apps/web/lib/api.ts`) now treats **any 401 as an expired/invalid session**: it clears `localStorage["kabanchik.token"]` and redirects to `/login` rather than surfacing a dead "Invalid or expired token" — which is exactly what was breaking the **Projects** page for users whose earlier login had expired. `UserMenu` validates via `/auth/me` on mount, so expired sessions bounce to login on app load, not only on Projects. Added `tests/e2e/auth.spec.ts` (4 cases) and repaired the stale `login.spec.ts` sign-in test (it now asserts hand-off to the backend OAuth start rather than the old mock route-to-home). **44/44 Playwright e2e green, tsc clean.** Verified live against the running backend (minted dev token → real name + Sign out; bogus token → `/projects` redirects to `/login`, no error). See [[modules/auth]] → *Frontend session*.

---

## 2026-06-02 — Production-ready project creation, full-stack (ScrumAgent-lb9)

Shipped the Add Project wizard end-to-end on branch `feat/project-creation-lb9` (TDD; **71 backend pytest + 5 Playwright e2e green**). New backend **Project domain** ([[modules/project-provisioning]]): `Project`, `ProjectMember` (composite PK + role), `ProjectCredential` (1:1, Fernet-encrypted secrets), `PendingOAuth` (one-shot bridge). The agent's Google account is authorized via **offline OAuth** (refresh token, `calendar.events`) — service account / domain-wide delegation stay deferred (no Workspace admin); see [[decisions/2026-06-02-agent-google-offline-oauth]]. Consent runs in a **popup** (preserves wizard state) bound by a signed `state` JWT (`security/_state.py`); the callback writes a `PendingOAuth` and `postMessage`s the result back; `POST /projects` consumes it (Google is a hard gate). Jira/Notion tokens are pasted, live-validated (`app/integrations.py` — Atlassian `/myself` + Notion `/users/me`), **re-validated server-side at create (422)** when present and otherwise skippable; the Notion section link is parsed to a page id. Members are selected from existing users (`GET /users/directory`); a `ProjectMember` row is what makes a project appear in their list.

**Frontend** ([[domains/frontend]]): `apps/web/lib/api.ts` (Bearer `apiFetch`), all five wizard steps rewired, "Invite team" → **"Select team members"**, `/projects` list reads real data via `ProjectsListLive`. Browser- and e2e-verified the agent-email default (`telecom.scrum.agent@municorn.com`), the Google gate, and the create POST.

**Decisions:** secrets isolated in a 1:1 `ProjectCredential` (not on `Project`); `agent_email` comes from the consented account, not the client; the shell project-switcher/chat/meetings deliberately stay on mock data (scoped out). **Prerequisite:** register the `calendar.events` scope + the `{backend}/projects/integrations/google/callback` redirect URI in the Google Cloud console. **Follow-ups:** migrate the shell off mock (extends `ScrumAgent-r0k`), Alembic for the 4 new tables (`ScrumAgent-soe`), email-invite flow for not-yet-signed-in members. Design spec: `docs/superpowers/specs/2026-06-02-production-ready-project-creation-design.md`.

---

## 2026-06-01 — Local Docker daemon moved to Colima (no Docker Desktop)

The local stack no longer depends on Docker Desktop. macOS has no native Docker daemon, so the canonical `docker compose up --build` now runs against **Colima** (Lima VM on Apple Virtualization.framework `vz`, with `virtiofs` bind mounts). The `docker` CLI plus the `compose`/`buildx` plugins were reinstalled from Homebrew (`/opt/homebrew/bin` precedes the old `Docker.app` symlinks in `PATH`), so they no longer belong to Desktop. `"credsStore": "desktop"` was removed from `~/.docker/config.json` — otherwise `docker` shells out to the Desktop credential helper and even anonymous pulls of public images break once Desktop is gone.

Verified end-to-end with Docker Desktop **fully quit**: `colima start --cpu 6 --memory 8 --disk 60 --vm-type vz --mount-type virtiofs` → `colima` docker context active → `docker compose up --build backend` builds and runs → `GET /health` returns `200 {"status":"ok"}`, container reports healthy, in-container pytest all green. Desktop was not uninstalled (left dormant; only the root `vmnetd` helper lingers, harmless). Setup documented in [[domains/deployment]] ("Local Docker daemon") and the `docker-compose.yml` header. Tracked as `ScrumAgent-2s3`.

---

## 2026-06-01 — Auth landed: Google OAuth login + JWT (ScrumAgent-u2b)

First authenticated slice. TDD'd Google OAuth 2.0 login restricted to `@municorn.com`, issuing a backend-signed JWT. New module [[modules/auth]] = `app/oauth.py` (`GoogleOAuthClient`: pure consent-URL builder + httpx code-exchange + userinfo — injectable so tests fake it), `app/security.py` (HS256 create/decode over `SECRET_KEY`, 24h `jwt_ttl_hours`), `app/routers/auth.py` (`/auth/google/start` → 307 consent with CSRF `state` cookie; `/auth/google/callback` → state-check 400, code exchange, `hd`/email domain gate 403, upsert on `google_sub`, 302 to `{FRONTEND}/login#token=…`; `/auth/me`), and `deps.get_current_user` (bearer → `User`, else 401). Added a **minimal** `User` model (`app/models.py`) — full schema stays ScrumAgent-67j (noted there). `main.py` now includes the router, adds CORS for the frontend origin, and creates tables in a lifespan hook (`Base.metadata.create_all`, no Alembic yet).

**Decisions:** identity read from Google's **userinfo endpoint** (token already trusted via TLS+secret exchange) instead of local id_token verification → no `google-auth`, deps stay lean. JWT delivered to the SPA via **URL fragment** + `localStorage` (`kabanchik.token`), not a cross-origin cookie (dev is http `:3000`/`:8000` where `Secure`/`SameSite=None` is painful). Revisit httpOnly-cookie + CSRF for the https GCP deploy.

**Frontend** wired: `apps/web/lib/auth.ts` (`startGoogleLogin`, `consumeTokenFromHash`, token store) + the `/login` page now redirects to the backend and consumes the returned token.

**Verification:** 20 pytest green under `-W error` (3 security + 9 flow + 8 prior). Real-app smoke confirmed `/auth/google/start` builds a correct consent URL (real client id, `redirect_uri=localhost:8000/auth/google/callback`, `scope=openid email profile`, `hd=municorn.com`, state cookie). Browser preview confirmed the login page renders clean and the `#token=…` → `localStorage` + redirect-to-`/` path works. Closed u2b (`--force`; was graph-blocked by 67j, satisfied by the inline User). Follow-up ScrumAgent-sdc: attach the bearer token to the frontend API client + guard `(shell)` routes (depends on real routers 2jb).

---

## 2026-06-01 — Backend bootstrap landed; credentials wired on personal account

First backend code. Implementation started against `@municorn` **personal** accounts (personal Atlassian/Notion/Calendar, self-funded GCP) ahead of a later corporate migration.

**Credentials** (`ScrumAgent-7we`, advanced not closed): `.env` populated and validated green by a new `scripts/sanity_check.py` (standalone `uv` probe of OpenAI / Google OAuth / Atlassian / Notion). Model corrected to `gpt-5.4-mini` (the key cannot see `gpt-5.5-mini`/`gpt-4.1-mini`). Deferred: Google service-account + domain-wide delegation (no Workspace admin → blocks slice 3 meetings — see memory), full GCP deploy block. Notion will use a self-hosted MCP / direct REST with the static `ntn_` token, **not** the hosted OAuth endpoint.

**Bootstrap** (`ScrumAgent-9cg`): TDD'd `backend/` scaffold — `app/main.py` (`GET /health`), `config.py` (typed pydantic-settings, fail-fast on missing secrets), `database.py` (decoupled engine/session helpers + `Base`), `deps.py` (cached `get_settings`/`get_db`). 8 pytest green; `uvicorn` serves `/health` 200. `Dockerfile` + `docker-compose.yml` (backend :8000, frontend :3000 dev-mode, `./data` volumes). **Lean deps on purpose** — deepagents/raganything/google/mcp land with their own modules so the image always builds. Container build itself pending (Docker daemon was down). Follow-up filed for a production frontend Dockerfile.

**Build order** (user directive): jira_notion slice → RAG → orchestrator, value-first. Real dependency path still requires bootstrap → models → auth/llm → thin orchestrator → jira_notion.

---

## 2026-05-22 save — GCP deployment topology diagram

Added [[flows/gcp-deployment-topology]] — Mermaid connectivity diagram showing the full GCP deploy: edge plane (Cloud DNS → Static IP → Caddy/TLS), in-VM service plane (frontend + backend container with DeepAgents orchestrator and three agents), state plane (SQLite + RAG-Anything on persistent SSD), GCP control plane (Secret Manager, daily snapshots), and external integrations (OpenAI, Atlassian Rovo, Notion MCP, Google OAuth/Calendar/Meet). Linked from [[flows/_index]], top-level [[index]], and [[domains/deployment]]. No architecture change — purely a visual synthesis of what was decided on 2026-05-18.

---

## 2026-05-18 — Rovo replaces Jira MCP + GCP Compute Engine deploy target

Two scope changes landed simultaneously, both driven by user directive:

**1) Jira moves off MCP to Atlassian Rovo.** A new module [[modules/rovo-client]] replaces the Jira side of [[modules/mcp-clients]]; the latter is now Notion-only. The `jira_notion` agent gains Rovo AI capabilities (cross-Jira search, summarization, generated update text, Rovo Agent invocation). Notion stays on MCP. Capability boundary in [[domains/agents]] is unchanged. New ADR: [[decisions/2026-05-18-rovo-replaces-jira-mcp]]. Env shift: `ATLASSIAN_MCP_URL` / `ATLASSIAN_API_TOKEN` → `ROVO_BASE_URL` / `ROVO_API_TOKEN` / `ATLASSIAN_SITE_URL` / `ATLASSIAN_USER_EMAIL`.

**2) GCP deployment target = single Compute Engine VM.** Local Docker Compose stays canonical. Cloud target lifts-and-shifts the same compose stack onto a GCE VM with a 100 GB persistent SSD at `/opt/scrumagent/data/`. Caddy fronts ports 8000/3000 with auto Let's Encrypt. Secrets via Secret Manager. Daily disk snapshots. No backend code change required — SQLite + RAG-Anything keep their filesystem assumptions. Cloud Run was considered and rejected (would force Postgres + GCS migration). New ADR: [[decisions/2026-05-18-gcp-compute-engine-deployment]].

**Wiki updates:** new pages [[modules/rovo-client]], [[entities/atlassian-rovo]], two ADRs. Edited [[modules/mcp-clients]] (Notion-only), [[concepts/mcp]] (Notion-only), [[entities/jira]] (access via Rovo), [[domains/integrations]] (env block + Rovo section), [[domains/deployment]] (full GCE deploy section + env reference + rollout phase), [[domains/agents]] (`jira_notion` transport split), indexes for modules / decisions / entities, top-level [[index]].

**Beads:** updated `ScrumAgent-ilz` (Notion-only scope), `ScrumAgent-2u9` (Rovo + Notion transport), `ScrumAgent-7we` (prereqs: Rovo + GCP creds). New issues for Rovo client module and GCE Terraform/provisioning.

---

## 2026-05-10 — Frontend implementation kickoff (Next.js 14 + 8 screens)

First running code lands. The Kabanchik design prototype (HTML/JSX bundle exported from claude.ai/design — ScrumAgent-h-QdelD4EXia08CypPVGrU2g) has been ported to a Next.js 14 + TypeScript app at `apps/web/`. Layout: 9 routes (`/`, `/chat`, `/meetings`, `/meetings/[id]`, `/updates`, `/trace`, `/projects`, `/projects/new`, `/settings`, `/login`).

Approach: decomposed into 10 beads issues (foundation + 8 screens + tweaks panel), executed via 1 sequential agent for the foundation, then 9 parallel agents in isolated git worktrees for each screen, then 9 parallel code-review agents, then 1 agent for Playwright UI tests. All work merged to `main`, build passes, 38 Playwright tests green.

Design system: CSS variables (royal blue `#0077e6`, warm stone neutrals, Inter), light/dark themes, three densities (compact/cozy/comfortable), three home layout variants (split/focused/classic), runtime tweaks panel (theme, accent hue, fonts, density, layout) backed by `localStorage`. Mocks in `apps/web/lib/mock-data.ts`; no backend wired.

Open follow-ups in `bd-d5g` (deferred review feedback: a11y on home rows, projects toast auto-dismiss, settings sparkline memo, css de-dup, etc.).

---

## 2026-05-10 — Initial scaffold + migration

Vault scaffold for **Telecom Scrum Agent (Kabanchik)** project.

**Created:**
- Top-level: [[index]], [[overview]], [[hot]], [[meta/conventions]]
- Domains: [[domains/architecture]], [[domains/agents]], [[domains/backend]], [[domains/frontend]], [[domains/integrations]], [[domains/deployment]], [[domains/design]]
- Modules: [[modules/runtime-orchestrator]], [[modules/llm-gateway]], [[modules/rag]], [[modules/calendar-sync]], [[modules/mcp-clients]], [[modules/trace-store]]
- Decisions: [[decisions/2026-03-27-single-backend-container]], [[decisions/2026-03-27-three-agents-only]], [[decisions/2026-03-27-openai-only-llm]]
- Concepts: [[concepts/deepagents-runtime]], [[concepts/rag-anything]], [[concepts/mcp]], [[concepts/human-in-the-loop]]
- Entities: [[entities/municorn]], [[entities/google-workspace]], [[entities/jira]], [[entities/notion]], [[entities/openai]]
- Flows: [[flows/meeting-processing]], [[flows/chat]], [[flows/oauth-login]]
- Sources: [[sources/concept]], [[sources/tech-architecture]], [[sources/mvp-plan]], [[sources/mvp-v2-plan]], [[sources/kabanchik-ui-plan]], [[sources/design-brief]], [[sources/google-stitch-prompts]]

**Migrated** (originals snapshotted into `.raw/migrated/`):
- `docs/specs/concept.md`
- `docs/specs/tech-architecture-local.md`
- `docs/plans/mvp.md`
- `docs/plans/mvp_v2.md`
- `docs/plans/2026-03-27-kabanchik-ui.md`
- `docs/stitch/design-brief.md`
- `docs/stitch/google-stitch-prompts.md`

**Setup:** `.obsidian/snippets/vault-colors.css` written. MCP server (`obsidian-vault`, MCPVault filesystem) configured at user scope.
