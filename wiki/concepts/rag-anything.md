---
type: concept
title: "RAG-Anything"
status: superseded
created: 2026-05-10
updated: 2026-06-17
tags: [concept, rag]
---

# RAG-Anything

Original retrieval-augmented generation library named in the MVP concept. It is
now superseded in the project design by [[concepts/lightrag-multimodal]] because
the upstream multimodal path has moved into LightRAG.

Historical references to RAG-Anything in the original source documents should be
read as "the RAG engine"; the active implementation target is LightRAG behind the
app-owned [[modules/rag]] adapter.

## Role in the system

- Historical pointer for the original MVP wording.
- The current runtime role is documented in [[concepts/lightrag-multimodal]].

## Storage

No longer the active storage design. LightRAG uses PostgreSQL-backed storage
adapters locally and Cloud SQL PostgreSQL on GCP.

## Related

- [[concepts/human-in-the-loop]] — citations make agent claims auditable.
- [[flows/chat]] — retrieval is the first step of any chat answer.
