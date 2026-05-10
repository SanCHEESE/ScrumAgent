---
type: decision
title: "Exactly three agents"
status: accepted
date: 2026-03-27
created: 2026-05-10
updated: 2026-05-10
tags: [decision, agents]
---

# Exactly three agents for MVP

## Decision

MVP has exactly three agents: `meeting_participation`, `user_chat`, `jira_notion`. No others. All capability boundaries are enforced by [[modules/runtime-orchestrator]].

## Why this matters

[[concepts/human-in-the-loop]] is the safety property of the system. It only holds because **exactly one** agent owns external writes (`jira_notion`). Adding more agents that touch externals would dilute the boundary and require re-proving the property.

## Capability boundary

| Agent | Can | Cannot |
|---|---|---|
| `meeting_participation` | Google ingest, RAG indexing | Jira/Notion MCP |
| `user_chat` | RAG retrieve, compose final answer | External writes |
| `jira_notion` | Jira/Notion read; staged + approved write | Read Google artifacts; compose chat answer |

## Consequences

- **+** Simple mental model. Easy onboarding. Easy trace UI.
- **+** External-write surface area is small and auditable.
- **−** Some workflows require handoff round-trips (chat → jira_notion → chat). Acceptable for MVP.

## Source

[[sources/concept]] §3, [[sources/tech-architecture]] §4.6, [[domains/agents]].
