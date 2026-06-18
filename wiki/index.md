---
type: meta
title: "Wiki Index"
created: 2026-05-10
updated: 2026-06-18
tags: [meta, index]
---

# Wiki Index — Telecom Scrum Agent (Kabanchik)

Master catalog of all wiki pages. Updated on every ingest.

## Quick Start

- [[overview]] — what is this project, in 60 seconds
- [[hot]] — most recent context (~500 words, refresh between sessions)
- [[domains/_index|Domains]] — major topic areas

## Top-Level Pages

| Page | Purpose |
|---|---|
| [[overview]] | Executive summary of the whole project |
| [[hot]] | Hot cache — recent context |
| [[log]] | Append-only chronological log |
| [[meta/conventions]] | Wiki conventions and frontmatter |

## Domains

- [[domains/architecture]] — high-level system shape
- [[domains/agents]] — three-agent model
- [[domains/backend]] — FastAPI service internals
- [[domains/frontend]] — Next.js UI surface
- [[domains/integrations]] — Google, Jira, Notion, OpenAI
- [[domains/deployment]] — Docker Compose, env, security
- [[domains/design]] — UX and visual design

## Modules

See [[modules/_index]] for full list. Highlights:

- [[modules/auth]]
- [[modules/project-provisioning]]
- [[modules/runtime-orchestrator]]
- [[modules/llm-gateway]]
- [[modules/rag]]
- [[modules/calendar-sync]]
- [[modules/rovo-client]]
- [[modules/mcp-clients]]
- [[modules/trace-store]]

## Concepts

- [[concepts/deepagents-runtime]]
- [[concepts/lightrag-multimodal]]
- [[concepts/rag-anything]]
- [[concepts/mcp]]
- [[concepts/human-in-the-loop]]

## Entities

- [[entities/municorn]]
- [[entities/google-workspace]]
- [[entities/jira]]
- [[entities/atlassian-rovo]]
- [[entities/notion]]
- [[entities/openai]]

## Decisions

- [[decisions/_index]]
- [[decisions/2026-06-18-app-owned-orchestrator-not-deepagents-lib]] — MVP runtime app-owned, not deepagents/langgraph

## Flows

- [[flows/meeting-processing]]
- [[flows/chat]]
- [[flows/backlog-ingestion]]
- [[flows/oauth-login]]
- [[flows/gcp-deployment-topology]]

## Sources

Original migrated documents live in `.raw/migrated/`. Summary pages:

- [[sources/concept]] — Концепция MVP
- [[sources/tech-architecture]] — Локальная техническая архитектура
- [[sources/mvp-plan]] — MVP plan v1 (deprecated)
- [[sources/mvp-v2-plan]] — MVP v2 implementation plan (canonical)
- [[sources/kabanchik-ui-plan]] — Kabanchik UI plan
- [[sources/design-brief]] — Visual design brief
- [[sources/google-stitch-prompts]] — Google Stitch prompts
