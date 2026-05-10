---
type: module
title: "LLM Gateway"
path: "backend/app/llm.py"
language: python
status: planned
created: 2026-05-10
updated: 2026-05-10
depends_on: []
used_by: [runtime-orchestrator, rag]
tags: [module, llm]
---

# LLM Gateway (`llm.py`)

Single entry point for OpenAI calls.

## Responsibilities

- Initialize `ChatOpenAI` from `langchain-openai`.
- Read `OPENAI_API_KEY` and `OPENAI_MODEL` (default `gpt-4.1-mini`).
- **Fail fast** if `OPENAI_API_KEY` is missing.
- Provide small app-owned helpers for: meeting analysis, chat answer composition.

## Why one file

See [[decisions/2026-03-27-openai-only-llm]]. Centralizing here means no agent imports OpenAI directly, and swapping providers later is a one-file change.

## Related

- [[entities/openai]] — provider details
- [[modules/rag]] — uses the gateway for retrieval-augmented answers
