---
type: module
title: "LLM Gateway"
path: "backend/app/llm.py"
language: python
status: implemented
created: 2026-05-10
updated: 2026-06-18
depends_on: []
used_by: [runtime-orchestrator, rag, user_chat]
tags: [module, llm]
---

# LLM Gateway (`llm.py`)

Single entry point for OpenAI calls.

## Status

**Implemented** (shipped as part of the user_chat RAG streaming slice,
ScrumAgent-r0k / 2jb). The gateway is the live chokepoint actually used by
`user_chat` for grounded chat answer streaming.

## Responsibilities

- Initialize `ChatOpenAI` from `langchain-openai` (added to `requirements.txt`).
- Read `OPENAI_API_KEY` and model from settings. Chat model is read from
  `OPENAI_CHAT_MODEL` first, falling back to `OPENAI_MODEL`; a new
  `openai_chat_model` setting exposes this. Default is `gpt-4.1-mini`.
- **Fail fast** if `OPENAI_API_KEY` is missing.
- Expose a `LlmGateway` class — a **streaming wrapper** over
  `langchain_openai.ChatOpenAI`; callers iterate token events via an async
  generator.
- **Write one `LlmUsage` row per provider call** (model, kind, category,
  units, cost, `run_id`) — the Settings → Billing tab aggregates these via
  `GET /projects/{id}/billing` (see [[modules/project-provisioning]] §Billing,
  shipped `ScrumAgent-307`).

## Why one file

See [[decisions/2026-03-27-openai-only-llm]]. Centralizing here means no agent
imports OpenAI directly, and swapping providers later is a one-file change.

## Related

- [[entities/openai]] — provider details
- [[modules/rag]] — `user_chat` pairs retrieval from RAG with generation via this
  gateway
