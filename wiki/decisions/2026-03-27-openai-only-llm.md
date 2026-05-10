---
type: decision
title: "OpenAI as the only LLM provider"
status: accepted
date: 2026-03-27
created: 2026-05-10
updated: 2026-05-10
tags: [decision, llm]
---

# OpenAI is the only LLM provider for MVP

## Decision

The MVP uses **OpenAI exclusively** as the LLM. Access goes through `langchain-openai` in [[modules/llm-gateway]]. Default model: `gpt-4.1-mini`.

## Rationale

- One provider keeps prompts, cost model, and rate-limit story simple.
- `langchain-openai` is the de-facto integration for the DeepAgents runtime ([[concepts/deepagents-runtime]]).
- A single gateway file means swapping providers later is a one-place change.

## Consequences

- **+** Smallest possible LLM surface. Fail-fast on missing `OPENAI_API_KEY`.
- **−** No fallback if OpenAI is down or rate-limited during MVP. Acceptable for local-first MVP.
- **−** Multi-model experiments (Claude, local LLMs) deferred to post-MVP.

## Source

[[sources/tech-architecture]] §4.3, [[sources/mvp-v2-plan]].
