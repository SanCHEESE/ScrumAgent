# Incremental RAG auto-sync — design

**Issue:** ScrumAgent-3wq · **Follow-up to:** ScrumAgent-vw3 (auto-sync), ScrumAgent-clo (auto-heal) · **Date:** 2026-06-22

## Problem

Every `auto` run is a **destructive full re-index**: `execute_run` calls `clear_project`
then re-fetches the entire Jira/Notion backlog and re-indexes all of it
(`app/ingestion.py`, `app/auto_sync.py`). This was deliberate — LightRAG has no upsert,
so re-inserting an edited item would accumulate orphaned content-hash docs — but it means
LightRAG re-runs LLM **entity/relationship extraction** (`LIGHTRAG_LLM_MODEL`, e.g.
`gpt-5.4-mini`) over the whole backlog on every tick, regardless of whether anything
changed. On a ~2626-doc backlog at the old 6h cadence that burned ~$100 of OpenAI spend in
3 days. "Tasks rarely change" never helped, because the run never looked at what changed.

Short-term mitigation already applied: `RAG_AUTO_SYNC_INTERVAL_HOURS` widened 6h → 24h
(`.env`, documented in `.env.example`). That cuts spend ~4× but does not remove the
structural waste.

## Goal

Make an `auto` run **re-extract only what changed and remove only what's gone**, while the
manual **Re-sync** button keeps its destructive full-rebuild semantics (and doubles as the
reconciliation hammer). The dominant cost — LLM extraction — should scale with the *delta*,
not the backlog size.

Decisions locked during brainstorming:
- **Scope:** both Jira and Notion get incremental.
- **Deletions:** active detection every run (not "manual-resync-only", not "periodic full rebuild").
- **Deleted counters:** first-class `jira_deleted` / `notion_deleted` on `IngestionRun`
  (accepts one manual `ALTER`).

## Trigger semantics (no new `IngestionTrigger` value)

| Trigger | Behavior |
|---|---|
| `created` | Full index (project is empty). Sets watermarks. |
| `resync` (manual button) | **Unchanged:** `clear_project` + reindex all configured sources. Resets+sets watermarks. |
| `auto` | **Incremental** when every *configured* source has a watermark; **full fallback** (`clear_project` + reindex all + set watermarks) otherwise. |

**`needs_full` rule for `auto`:** if any configured source (`jira_project_key` set / `notion_page_id`
set) has a `None` watermark → run the full path once, then set watermarks. This handles:
- **Cold start** after deploy: existing projects have no `ProjectSyncState` row → one full
  run reconciles existing cruft and seeds watermarks; every later `auto` is incremental.
- **A source added later** (e.g. Notion added to a Jira-only project): its watermark is
  `None` → one full run picks it up, then incremental resumes.

Using `clear_project` (one wipe) for the full path — never per-item `clear_source` — keeps
cold start O(N) instead of O(N²) (see "Why not per-item clear on the full path").

## Design

### 1. `ProjectSyncState` — new table (migration-free)

Mirrors the lazily-created 1:1 `ProjectAgentSettings` pattern. `Base.metadata.create_all`
(`app/database.py:61`) creates new tables at startup, so **no manual migration** for this
table. Register it in `app/models/__init__.py`.

```python
class ProjectSyncState(TimestampMixin, Base):
    __tablename__ = "project_sync_state"
    project_id: Mapped[str] = mapped_column(ForeignKey("projects.id"), primary_key=True)
    jira_synced_until:   Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    notion_synced_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    updated_at: ...  # onupdate=func.now(), like the sibling tables
```

- **Watermark is data-driven:** `jira_synced_until = max(issue.updated)` actually observed;
  `notion_synced_until = max(page.last_edited_time)` actually observed. Never our wall clock
  → immune to server/Jira clock skew.
- **No row = never incrementally synced** → `needs_full`. The row is created/updated at the
  end of a successful run.

### 2. `RagBackend.list_source_ids` — new protocol method

```python
async def list_source_ids(self, project_id: str) -> set[tuple[str, str]]: ...
# returns {(source_kind, source_id), ...} currently indexed for the project
```

- **LightRAG** (`app/rag/lightrag.py`): one pass over `_iter_project_docs`, parse each
  `file_path` `"{pid}::{kind}::{id}"` → `(kind, id)`; skip malformed (reuse `_parse_citation`).
- **Vertex** (`app/rag/vertex.py`): one pass over `_files(corpus)`, parse `(kind, id)` from
  each file's display-name using the same identity scheme `clear_source`/`status` already
  match on.

This is the only new protocol method; it backs deletion detection.

### 3. Change detection

**Jira — two queries** (`app/jira_client.py`):
- `fetch_issue_index(project_key) -> dict[str, datetime]` — cheap scan, `fields=["updated"]`,
  pages through all. No bodies, no LLM. Yields the **current key set** (for §4) and each
  key's `updated`.
- `fetch_issues(project_key, *, updated_since: datetime | None = None)` — extend the existing
  method; when `updated_since` is set, append `AND updated >= "{fmt}"` to the JQL. Full
  fields, only for the changed set.
- **JQL `updated` is minute-granular.** Format the watermark to `"yyyy/MM/dd HH:mm"` and use
  `>=`. The boundary minute re-indexes harmlessly (clear+index is idempotent).

**Notion — walk + per-page timestamp** (`app/notion_client.py`):
- The tree walk is unavoidable (needed to enumerate current pages and find children) and is
  cheap (Notion API, no LLM). Today only the **root** page gets `last_edited_time`
  (`_walk_page` skips `_get_page` when the child title is already known, `notion_client.py:56`).
  Change the walk to fetch `last_edited_time` for **every** page so every returned
  `SourceDocument.updated_at` is populated.
- `fetch_pages` returns **all** pages (with `updated_at`) plus the full current page-id set.
  Filtering by watermark happens in `execute_run`, keeping the reader dumb.

### 4. Active deletion detection (with outage guard)

Per source, on the incremental path:
```
current  = ids the source returned this run            # Jira: fetch_issue_index keys; Notion: walked page_ids
indexed  = {id for (kind,id) in list_source_ids(pid) if kind == this_kind}
deleted  = indexed - current
for id in deleted: clear_source(pid, kind, id)
```

**Critical safety guard:** deletion detection runs **only if the source fetch succeeded**.
A failed/empty fetch (Jira 5xx, Notion token expiry) must NOT be read as "everything was
deleted" — that would wipe the index on a transient outage. If a source's fetch raises, we
isolate that source (existing per-source `try/except` in `execute_run`), record the failure,
**skip its deletion detection and skip advancing its watermark**, and leave its indexed docs
intact.

### 5. `execute_run` restructure

Split the body into two helpers; the trigger/`needs_full` decision picks one **per run**:

- `_full_run(...)` — today's path: `clear_project` (resync only; `created` skips it as it
  does now), fetch all configured sources, `index_documents`, set both watermarks to the
  max timestamp observed. Keeps the existing **busy-defer guard** (`ingestion.py:64-72`).
- `_incremental_run(...)` — per configured source, isolated in its own `try/except`:
  1. detect changed (§3) and current-id set,
  2. `clear_source` each changed id, then `index_documents` the changed docs,
  3. deletion detection (§4),
  4. advance that source's watermark to the **max timestamp over the full current set**
     (Jira: every `updated` from `fetch_issue_index`; Notion: every page's
     `last_edited_time`) — always defined when the fetch succeeded and was non-empty; left
     unchanged if the source returned nothing. Using the full set (not just the changed
     subset) means the next run's `>=` filter is anchored to the most-recent item.
  Uses per-item `clear_source` (which already waits for pipeline idle) — no `clear_project`,
  so no big destructive lock.

`run_ingestion` (production wiring) is unchanged except it loads/creates the
`ProjectSyncState` row and passes watermarks in.

### 6. `IngestionRun` deleted counters (manual migration)

Add two nullable columns (mirror `jira_submitted` / `notion_submitted`):

```python
jira_deleted:   Mapped[int | None] = mapped_column(Integer)
notion_deleted: Mapped[int | None] = mapped_column(Integer)
```

`ingestion_runs` is an existing table, so `create_all` will **not** add these — ship a manual
migration (SQLite dev DB + any Postgres app DB; both support `ADD COLUMN`):

```sql
ALTER TABLE ingestion_runs ADD COLUMN jira_deleted   INTEGER;
ALTER TABLE ingestion_runs ADD COLUMN notion_deleted INTEGER;
```

### 7. Status field semantics

| Field | Full run | Incremental run |
|---|---|---|
| `jira_total` / `notion_total` | items fetched (whole backlog) | items **changed** |
| `jira_submitted` / `notion_submitted` | items indexed | changed items indexed |
| `jira_deleted` / `notion_deleted` | `0` | items removed from RAG |

Final `status` aggregation (`completed` / `partial` / `failed`) is unchanged; a fully
no-op incremental tick (0 changed, 0 deleted) is `completed`.

## Why not per-item clear on the full path

`clear_source` resolves a `source_id` to a LightRAG doc-id by paging through **all** project
docs (`lightrag.py:240`). Calling it per item over the whole backlog would be O(N²). The
full path therefore uses a single `clear_project`; per-item `clear_source` is reserved for
the incremental path, where the changed+deleted set is small. (Batching `clear_source` into a
single-pass `clear_sources` is a possible later optimization if delta volume grows; out of
scope here — the LightRAG list calls are local Postgres, not OpenAI, so they don't affect the
cost goal.)

## Edge cases & limitations

- **Notion nested/synced-block edits:** a page's `last_edited_time` may not move for some
  deeply-nested or synced-source edits, so incremental could miss them. Covered by manual
  Re-sync. Documented limitation, not a blocker.
- **Source outage:** handled by the §4 guard — no deletions, no watermark advance on failure.
- **Boundary minute (Jira):** `>=` minute-granular watermark re-indexes the boundary issue(s)
  each run; idempotent, negligible.
- **Pipeline busy:** the full path keeps the existing defer-on-busy; the incremental path's
  `clear_source`/`index_documents` already wait for idle and retry on 409.

## Testing (TDD)

`execute_run` already takes injected `rag`/readers, so logic is testable with fakes.

- Incremental indexes **only** changed items; unchanged items are not re-submitted.
- Deleted ids (in RAG, absent from source) are `clear_source`d; counts land in
  `jira_deleted`/`notion_deleted`.
- **Outage guard:** a source whose fetch raises → no deletions, watermark unchanged, run is
  `partial`.
- Watermark advances to the max timestamp over the **current set** (not just the changed
  subset); `>=` boundary behavior; empty fetch leaves the watermark unchanged.
- `needs_full`: no `ProjectSyncState` row → full path; row with all configured watermarks →
  incremental; a newly-configured source (its watermark `None`) → one full run.
- `resync` stays destructive (`clear_project` called); `auto` incremental never calls
  `clear_project`.
- Adapter tests: `list_source_ids` for LightRAG (parse `file_path`) and Vertex (parse file
  display-name), including malformed-id skipping.
- Notion reader: `updated_at` populated for **every** page (not just the root).

## Out of scope / follow-ups

- Batched `clear_sources` single-pass optimization.
- Caching the Notion tree structure to skip block fetches for unchanged subtrees.
- True per-project graph isolation (ScrumAgent-o39) is independent of this work.
