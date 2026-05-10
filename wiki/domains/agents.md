---
type: domain
title: "Agents"
created: 2026-05-10
updated: 2026-05-10
tags: [domain, agents]
---

# Agents

Three agents, fixed for MVP. Each has a hard capability boundary enforced by the [[modules/runtime-orchestrator]].

## `meeting_participation`

**Owns:** Google Calendar/Meet ingest and meeting analysis.

- Sync calendar events through [[modules/calendar-sync]].
- Normalize meeting artifacts into SQLite.
- Run analysis through [[modules/llm-gateway]] (OpenAI).
- Index transcripts and summaries into [[modules/rag]].

**Cannot:** call Jira or Notion MCP. Hands off to `jira_notion` via the orchestrator if external sync is needed.

## `user_chat`

**Owns:** the user-facing chat answer.

- RAG retrieval via [[modules/rag]].
- Decides whether live Jira/Notion context is needed (and asks orchestrator for handoff).
- Streams the final answer with citations over SSE.

**Cannot:** make external writes. Cannot bypass the orchestrator.

## `jira_notion`

**Owns:** every Jira/Notion read and write.

- All Atlassian + Notion MCP reads.
- Generates **staged** updates that wait for approval.
- Creates or appends meeting notes in the permitted Notion parent.
- Applies risky writes only after explicit user approval.

**Cannot:** read Google artifacts. Cannot generate the final chat answer.

## Why exactly three

See [[decisions/2026-03-27-three-agents-only]]. More agents would dilute capability boundaries; the [[concepts/human-in-the-loop]] property only holds because exactly one agent owns external writes.

## Handoff matrix

| From → To | When |
|---|---|
| `meeting_participation` → `jira_notion` | Meeting analysis surfaces references to Jira issues / Notion pages, or proposes updates |
| `user_chat` → `jira_notion` | Chat needs live Jira/Notion context that RAG can't supply |
| `jira_notion` → `user_chat` | Live context retrieved, return to chat to compose answer |

All transitions are recorded in [[modules/trace-store]] for the Agent Trace UI.
