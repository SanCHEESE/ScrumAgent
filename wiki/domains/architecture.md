---
type: domain
title: "Architecture"
created: 2026-05-10
updated: 2026-06-17
tags: [domain, architecture]
---

# Architecture

High-level shape of the system. Source: [[sources/tech-architecture]].

## Topology

Core Docker Compose services plus the RAG service plane:

```text
docker-compose
├── backend      FastAPI + DeepAgents runtime + 3 agents + app adapters
├── frontend     Next.js 14 + TypeScript + Tailwind + shadcn/ui
├── lightrag     multimodal RAG service
├── postgres     local LightRAG storage parity
└── ./data/      db/, keys/, service runtime state
```

`backend` is a Python container hosting API, background jobs, all agents, and
app-owned adapters. `frontend` is a separate UI container. LightRAG is a separate
service container reached through [[modules/rag]]. OAuth flow runs through
FastAPI; JWT is forwarded to the frontend after callback.

## Boundaries

- **Frontend never** calls Google/Jira/Notion/OpenAI directly. Only the backend does.
- **Agents never** call each other directly. Only the [[modules/runtime-orchestrator]] hands off runs.
- **Risky external writes** (Jira assignee/status, Notion edits) only happen through `jira_notion` after explicit approval. See [[concepts/human-in-the-loop]].

## Key components

- [[modules/runtime-orchestrator]] — DeepAgents runtime, handoff policy, trace recording
- [[modules/llm-gateway]] — OpenAI client (`llm.py`)
- [[modules/rag]] — LightRAG service adapter (`rag.py`)
- [[modules/calendar-sync]] — Google Calendar/Meet adapter (`calendar_sync.py`)
- [[modules/mcp-clients]] — Atlassian + Notion MCP adapters (`mcp_clients.py`)
- [[modules/trace-store]] — agent run / step persistence (`trace_store.py`)

## Pipelines

- [[flows/meeting-processing]] — meeting → analysis → RAG → optional Jira/Notion
- [[flows/chat]] — chat retrieval with optional handoff for live context
- [[flows/oauth-login]] — domain-restricted Google login

## Database

App relational state is selected by `DATABASE_URL`: SQLite remains available for
local/test loops, and Cloud SQL PostgreSQL is the production target. LightRAG
uses PostgreSQL-backed storage adapters locally and on GCP. Tables include
`users`, `conversations`, `messages`, `meetings`, `meeting_artifacts`,
`updates`, `trace_runs`, `trace_steps`, `integrations`, and project-domain
tables.

## Decisions that shaped this

- [[decisions/2026-03-27-single-backend-container]]
- [[decisions/2026-03-27-three-agents-only]]
- [[decisions/2026-03-27-openai-only-llm]]
