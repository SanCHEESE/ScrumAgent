---
type: concept
title: "LightRAG Multimodal"
status: developing
created: 2026-06-17
updated: 2026-06-19
tags: [concept, rag, lightrag, multimodal]
---

# LightRAG Multimodal

LightRAG is the active RAG engine for Kabanchik. It replaces the original
RAG-Anything wording in the MVP documents while preserving the same product role:
project-scoped retrieval with auditable citations.

## Role in the system

- Runs as a separate Docker service, not inside the FastAPI process.
- Indexes meeting transcripts, summaries, decisions, action items, blockers, and
  later multimodal artifacts such as screenshots, PDFs, Office documents, and
  images.
- Returns passages with **citations** so chat answers can show source provenance.
- Is owned by [[modules/rag]], which exposes the app contract to agents.

## Input model

The first ScrumAgent slice feeds text artifacts:

- meeting transcript
- meeting summary
- decisions
- action items
- blockers

The service boundary is intentionally ready for multimodal ingestion. Later slices
can pass files or document references for LightRAG parsers to handle, while the
backend still stores citation metadata in a stable app-owned shape.

## Storage

LightRAG uses storage adapters. The project target is PostgreSQL-backed storage:

- local Docker Compose: local PostgreSQL service for RAG testing
- GCP: Cloud SQL PostgreSQL

The backend does not depend on LightRAG's storage classes directly. It calls
LightRAG through [[modules/rag]].

## Boundaries

- `meeting_participation` writes meeting artifacts through [[modules/rag]].
- `user_chat` retrieves project-scoped context through [[modules/rag]].
- `jira_notion` remains responsible for live Jira and Notion reads/writes.
- LightRAG results must carry citation metadata before they can be used in final
  chat answers.

## Multimodal ingestion path (as of 2026-06-19)

As of ScrumAgent-65g, multimodal ingestion (images, PDFs, binary media) is handled by
the **Vertex AI RAG Engine adapter** (`VertexRagBackend`), not by LightRAG.

LightRAG remains **text-only**. Passing a `RagDocument` with a non-empty `media` list to
`LightRagBackend.index_documents` raises `RagError("multimodal ingestion not supported
by the LightRAG backend")` — an explicit failure, not a silent drop.

The multimodal `RagDocument` model (`text: str | None`, `media: list[RagMedia]`) is
defined in the shared `app.rag.base` module and is the same type on both backend paths.
Existing callers (Jira/Notion ingestion) pass `media=[]` and are unaffected.

Multimodal LightRAG via RAG-Anything / LightRAG file endpoints is out of scope for the
current implementation. See [[decisions/2026-06-19-rag-provider-protocol]] for the
full design decision.
