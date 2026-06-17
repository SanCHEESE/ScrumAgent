---
type: overview
title: "Project Overview"
created: 2026-05-10
updated: 2026-06-17
tags: [overview]
---

# Telecom Scrum Agent (Kabanchik)

Local-first Docker Compose service for the Municorn team that turns meetings into structured knowledge and controlled Jira/Notion updates.

## What it does

- Connects to **Google Calendar + Meet** via a service account with domain-wide delegation.
- Connects to **Jira** through Atlassian Rovo and **Notion** through MCP.
- Hosts a Next.js **web UI** with Google OAuth restricted to `@municorn.com`.
- Provides a **chat** over a shared LightRAG-backed knowledge base.
- After every meeting: builds summary, action items, decisions, blockers; offers staged Jira/Notion changes for human approval.
- Persists a **trace** of every agent run and handoff.

## Shape

Core Docker Compose services plus shared runtime storage. LightRAG runs outside
the FastAPI process.

```text
backend   → FastAPI + DeepAgents runtime + 3 agents + app adapters
frontend  → Next.js 14 + TypeScript + Tailwind + shadcn/ui
lightrag  → multimodal RAG service
postgres  → local LightRAG storage parity
data/     → db/, keys/, service runtime state
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
| RAG | [[concepts/lightrag-multimodal]] |
| External work systems | [[entities/atlassian-rovo|Atlassian Rovo]] + [[entities/notion|Notion MCP]] |
| Auth | [[entities/google-workspace|Google OAuth]] — domain-restricted |
| Frontend | Next.js 14 + TypeScript + Tailwind + shadcn/ui |
| Deploy | Docker Compose (local MVP) |

## Status

Implementation in progress. Spec + plans are canonical (see
[[sources/mvp-v2-plan]] and [[sources/tech-architecture]]). This vault captures
the design and decisions alongside the codebase.
