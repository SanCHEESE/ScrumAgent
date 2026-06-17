---
type: flow
title: "Backlog ingestion"
created: 2026-06-17
updated: 2026-06-17
tags: [flow, ingestion, rag, jira, notion]
---

# Backlog ingestion

Triggered when a project is created with a Jira and/or Notion integration. Fetches
the existing backlog and indexes it into [[modules/rag]] (via LightRAG) as a
background job, so chat and agents have backlog context from day one. Manual re-sync
is supported via a dedicated endpoint.

```text
START (project created OR resync requested)
  -> IngestionRunner.trigger()    # non-blocking asyncio.create_task
  -> run_ingestion()              # own DB session
  -> execute_run()                # per-source error isolation
  -> JiraReadClient / NotionReadClient
  -> RagClient.clear_project()    # on resync only
  -> RagClient.index_documents()
  -> LightRAG POST /documents/texts
  -> END (IngestionRun status = completed | partial | failed)
```

## Steps

1. **Project creation** (`POST /projects`) enqueues an `IngestionRun` record
   (status `pending`, trigger `created`) and calls `IngestionRunner.trigger()`
   which wraps `run_ingestion()` in `asyncio.create_task`. The HTTP response
   returns immediately — project creation latency is unchanged.
2. **`run_ingestion`** opens its own DB session (GC-safe, decoupled from the
   request session) and calls `execute_run`.
3. **`execute_run`** iterates configured sources (Jira, Notion, whichever are
   present). Each source is fetched independently; a single-source failure sets
   the run to `partial` rather than `failed`, preserving results from successful
   sources.
4. **`JiraReadClient.fetch_issues`** paginates `/rest/api/3/search` and converts
   Atlassian Document Format (ADF) fields to plain text, producing
   `SourceDocument` records.
5. **`NotionReadClient.fetch_pages`** does a recursive block/page walk (depth-
   bounded), producing `SourceDocument` records.
6. Both readers share the `app/sources.py::SourceDocument` shape (text, metadata,
   source kind, source id).
7. **`RagClient.index_documents`** sends a batch `POST /documents/texts` to
   LightRAG. Documents carry a `file_source` tag:
   `"{project_id}::{source_kind}::{source_id}"` — this is the only project
   isolation available in LightRAG v1.5.3 (shared graph; see [[modules/rag]]
   for the known limitation tracked as `ScrumAgent-o39`).
8. On **re-sync**, `clear_project` deletes all documents with the matching
   `file_source` prefix before re-inserting; this is required because LightRAG
   v1.5.3 has no per-doc metadata, caller-id, or upsert support (API spike
   `ScrumAgent-m3c`).

## Endpoints

- **`GET /projects/{id}/knowledge-base/status`** (members) — returns
  project-scoped document counts from `RagClient.status()`. Backs the
  Settings → Knowledge base tab.
- **`POST /projects/{id}/knowledge-base/resync`** (admin-only, gated by
  `require_project_admin`) — enqueues a new `IngestionRun` with trigger
  `resync` and fires it as a background task.

## Data model

`IngestionRun` (`app/models/ingestion.py`):

| field | notes |
|---|---|
| `id` | UUID primary key |
| `project_id` | FK to `Project` |
| `status` | `pending` → `running` → `completed` / `partial` / `failed` |
| `trigger` | `created` or `resync` |
| `created_at` / `updated_at` | timestamps |

## Scope (text-only slice)

This slice is text-only. Deferred to later slices:
- Image/attachment ingestion.
- Automatic background re-sync (scheduled or event-driven).
- Chat-side retrieval against ingested backlog (`ScrumAgent-n6h`).

## Related

- [[modules/rag]] — `RagClient` adapter; `file_source` project-tagging scheme;
  shared-graph limitation (`ScrumAgent-o39`).
- [[entities/jira]] — Jira integration details.
- [[entities/notion]] — Notion integration details.
- [[domains/backend]] — `app/ingestion.py`, `app/jira_client.py`,
  `app/notion_client.py`, `app/sources.py`, `app/routers/projects.py`.
