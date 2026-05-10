---
type: entity
title: "OpenAI"
created: 2026-05-10
updated: 2026-05-10
tags: [entity, openai, llm]
---

# OpenAI

Sole LLM provider for the MVP. See [[decisions/2026-03-27-openai-only-llm]].

- Library: `langchain-openai`
- Default model: `gpt-4.1-mini` (overridable via `OPENAI_MODEL`)
- Key: `OPENAI_API_KEY` — backend fails fast if missing.

All access goes through [[modules/llm-gateway]]. No agent talks to OpenAI directly.
