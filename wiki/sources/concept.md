---
type: source
title: "Концепция MVP — sources/concept"
status: summarized
source_path: ".raw/migrated/concept.md"
original_path: "docs/specs/concept.md"
created: 2026-05-10
updated: 2026-06-17
tags: [source, spec, concept]
---

# Концепция MVP (summary)

Original: `.raw/migrated/concept.md` (also kept at `docs/specs/concept.md`).

## What this doc establishes

- Product is a **local Docker Compose service** for `@municorn.com`.
- Service account: `telecom.scrum.agent@municorn.com`.
- Two services (`backend`, `frontend`) and a shared `./data` volume mounted into backend only.
- Three agents: `meeting_participation`, `user_chat`, `jira_notion`. See [[domains/agents]].
- Web sections: Chat, Meetings, Updates, Settings, Agent Trace. See [[domains/frontend]].
- Access policy: Google OAuth `@municorn.com` only; service account for Calendar/Meet; shared MCP creds for Jira and Notion.
- After every meeting: summary, action items, decisions, blockers; staged Jira/Notion updates; trace.

## Stack at a glance

| | |
|---|---|
| Backend | FastAPI |
| Runtime | DeepAgents |
| LLM | OpenAI |
| RAG | LightRAG multimodal service (supersedes original RAG-Anything wording) |
| MCP | Atlassian + Notion |
| DB | SQLite |
| Storage | local `./data` |
| Auth | Google OAuth |
| Deploy | Docker Compose |

## Roadmap

- **MVP:** login, ingest, RAG, chat, staged updates, trace.
- **Post-MVP:** diarization, OCR, cross-meeting memory, hardening, live assistant.

## Current RAG refinement

The original concept named RAG-Anything. The active design now targets a separate
LightRAG multimodal service behind the app-owned [[modules/rag]] adapter. Local
testing uses PostgreSQL-backed LightRAG storage; GCP uses Cloud SQL PostgreSQL.

## Where this lands in the wiki

- [[overview]] — the executive summary
- [[domains/architecture]] — system shape
- [[domains/agents]] — the 3-agent model
- [[domains/integrations]] — Google / Jira / Notion / OpenAI
- [[concepts/human-in-the-loop]] — the safety property this concept enshrines
