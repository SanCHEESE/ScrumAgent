---
type: domain
title: "Architecture"
created: 2026-05-10
updated: 2026-05-10
tags: [domain, architecture]
---

# Architecture

High-level shape of the system. Source: [[sources/tech-architecture]].

## Topology

Two Docker Compose services + a shared `./data` volume:

```text
docker-compose
├── backend      FastAPI + DeepAgents runtime + 3 agents + SQLite + RAG + MCP
├── frontend     Next.js 14 + TypeScript + Tailwind + shadcn/ui
└── ./data/      db/, rag/, keys/   (mounted into backend only)
```

`backend` is a single Python container hosting API, background jobs, and all agents. `frontend` is a separate UI container. OAuth flow runs through FastAPI; JWT is forwarded to the frontend after callback.

## Boundaries

- **Frontend never** calls Google/Jira/Notion/OpenAI directly. Only the backend does.
- **Agents never** call each other directly. Only the [[modules/runtime-orchestrator]] hands off runs.
- **Risky external writes** (Jira assignee/status, Notion edits) only happen through `jira_notion` after explicit approval. See [[concepts/human-in-the-loop]].

## Key components

- [[modules/runtime-orchestrator]] — DeepAgents runtime, handoff policy, trace recording
- [[modules/llm-gateway]] — OpenAI client (`llm.py`)
- [[modules/rag]] — RAG-Anything wrapper (`rag.py`)
- [[modules/calendar-sync]] — Google Calendar/Meet adapter (`calendar_sync.py`)
- [[modules/mcp-clients]] — Atlassian + Notion MCP adapters (`mcp_clients.py`)
- [[modules/trace-store]] — agent run / step persistence (`trace_store.py`)

## Pipelines

- [[flows/meeting-processing]] — meeting → analysis → RAG → optional Jira/Notion
- [[flows/chat]] — chat retrieval with optional handoff for live context
- [[flows/oauth-login]] — domain-restricted Google login

## Database

SQLite at `/data/db/dev.db`. Tables: `users`, `meetings`, `meeting_artifacts`, `meeting_summaries`, `meeting_decisions`, `meeting_action_items`, `proposed_updates`, `sync_operations`, `agent_runs`, `agent_steps`, `settings`. `agent_runs` and `agent_steps` must exist before the trace UI ships.

## Decisions that shaped this

- [[decisions/2026-03-27-single-backend-container]]
- [[decisions/2026-03-27-three-agents-only]]
- [[decisions/2026-03-27-openai-only-llm]]
