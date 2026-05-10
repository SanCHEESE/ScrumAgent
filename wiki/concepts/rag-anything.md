---
type: concept
title: "RAG-Anything"
status: developing
created: 2026-05-10
updated: 2026-05-10
tags: [concept, rag]
---

# RAG-Anything

Retrieval-augmented generation library used as the knowledge store. Owned by [[modules/rag]].

## Role in the system

- Single shared store for the team (MVP scope).
- Indexes meeting transcripts, summaries, decisions, action items.
- Returns passages with **citations** so chat answers carry source provenance.

## Storage

Local filesystem under `RAG_STORAGE_PATH` (`/data/rag`).

## Related

- [[concepts/human-in-the-loop]] — citations make agent claims auditable.
- [[flows/chat]] — retrieval is the first step of any chat answer.
