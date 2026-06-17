---
type: concept
title: "LightRAG Multimodal"
status: developing
created: 2026-06-17
updated: 2026-06-17
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
