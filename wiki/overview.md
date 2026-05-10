---
type: overview
title: "Project Overview"
created: 2026-05-10
updated: 2026-05-10
tags: [overview]
---

# Telecom Scrum Agent (Kabanchik)

Local-first Docker Compose service for the Municorn team that turns meetings into structured knowledge and controlled Jira/Notion updates.

## What it does

- Connects to **Google Calendar + Meet** via a service account with domain-wide delegation.
- Connects to **Jira** and **Notion** through MCP adapters.
- Hosts a Next.js **web UI** with Google OAuth restricted to `@municorn.com`.
- Provides a **chat** over a shared knowledge base (RAG-Anything).
- After every meeting: builds summary, action items, decisions, blockers; offers staged Jira/Notion changes for human approval.
- Persists a **trace** of every agent run and handoff.

## Shape

Two Docker Compose services + a shared `./data` volume, mounted into backend only.

```text
backend   → FastAPI + DeepAgents runtime + 3 agents + SQLite + RAG + MCP
frontend  → Next.js 14 + TypeScript + Tailwind + shadcn/ui
data/     → db/, rag/, keys/
```

See [[domains/architecture]] for full system diagram and [[domains/deployment]] for the run/build story.

## Three agents

Exactly three, with strict capability boundaries — see [[domains/agents]]:

- **`meeting_participation`** — owns Google ingest and meeting analysis. Cannot touch Jira/Notion.
- **`user_chat`** — owns RAG retrieval and the final chat answer. Cannot do external writes.
- **`jira_notion`** — owns all Jira/Notion MCP reads and (after approval) writes. Cannot read Google artifacts or generate chat answers.

The [[modules/runtime-orchestrator]] enforces these boundaries.

## Stack

| Layer | Choice |
|---|---|
| Backend | FastAPI, Uvicorn, SQLAlchemy, SQLite |
| Agent runtime | [[concepts/deepagents-runtime]] |
| LLM | [[entities/openai]] (only) via `langchain-openai` |
| RAG | [[concepts/rag-anything]] |
| MCP | [[entities/jira|Atlassian MCP]] + [[entities/notion|Notion MCP]] |
| Auth | [[entities/google-workspace|Google OAuth]] — domain-restricted |
| Frontend | Next.js 14 + TypeScript + Tailwind + shadcn/ui |
| Deploy | Docker Compose (local MVP) |

## Status

Pre-implementation. Spec + plans are canonical (see [[sources/mvp-v2-plan]] and [[sources/tech-architecture]]). Code lives elsewhere; this vault captures the design and decisions.
