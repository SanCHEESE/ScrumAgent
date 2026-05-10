---
type: source
title: "Техническая архитектура — sources/tech-architecture"
status: summarized
source_path: ".raw/migrated/tech-architecture-local.md"
original_path: "docs/specs/tech-architecture-local.md"
created: 2026-05-10
updated: 2026-05-10
tags: [source, spec, architecture]
---

# Техническая архитектура (summary)

Original: `.raw/migrated/tech-architecture-local.md` (also `docs/specs/tech-architecture-local.md`).

## What this doc establishes

- Concrete directory layout (`backend/app/...`, `frontend/src/...`, `data/...`).
- Module-level responsibilities: `llm.py`, `rag.py`, `calendar_sync.py`, `mcp_clients.py`, `runtime/contracts.py`, `runtime/orchestrator.py`, agents, routers, `trace_store.py`.
- Database schema: `users`, `meetings`, `meeting_artifacts`, `meeting_summaries`, `meeting_decisions`, `meeting_action_items`, `proposed_updates`, `sync_operations`, `agent_runs`, `agent_steps`, `settings`.
- Workflow shapes for meeting processing and chat.
- Env var contract for Google, OpenAI, Atlassian/Notion MCP, JWT secret, DB URL.
- Local deploy via `docker compose up --build`.
- Security: domain-restricted OAuth, JWT, service-account key under `data/keys/`, secrets never returned by settings API, gated risky writes.
- Three implementation phases: Local MVP, Post-MVP Intelligence, Production hardening.

## Where this lands in the wiki

- [[domains/architecture]] — top-level shape
- [[domains/backend]] — directory layout, modules, routers
- [[domains/deployment]] — env, run, security
- [[modules/_index]] — per-module pages
- [[flows/meeting-processing]], [[flows/chat]], [[flows/oauth-login]]

> [!key-insight] DB tables `agent_runs` and `agent_steps` are blockers for the trace UI.
> They must exist before the trace screen ships.
