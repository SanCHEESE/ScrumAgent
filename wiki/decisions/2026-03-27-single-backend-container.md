---
type: decision
title: "Single backend container"
status: accepted
date: 2026-03-27
created: 2026-05-10
updated: 2026-05-10
tags: [decision, architecture]
---

# Single backend container

## Decision

The MVP runs a **single Python container** named `backend` that hosts FastAPI, background jobs, the DeepAgents runtime, all 3 agents, SQLite, RAG, MCP adapters, and trace persistence. Frontend lives in a separate Next.js container.

## Context

For local-first MVP we want fast iteration, minimal moving parts, and a single place to debug.

## Consequences

- **+** Easy to run, easy to reason about. One Dockerfile, one process for backend logic.
- **+** Shared in-process services (LLM gateway, RAG, MCP clients) without network overhead.
- **−** No isolation between agents at the OS level — boundaries are enforced in code (orchestrator + capability matrix). See [[modules/runtime-orchestrator]] and [[domains/agents]].
- **−** Scaling beyond MVP will require splitting (likely background workers first). Recorded as a phase-3 concern in [[domains/deployment]].

## Source

[[sources/tech-architecture]] §2, [[sources/mvp-v2-plan]].
