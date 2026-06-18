---
type: domain
title: "Agents"
created: 2026-05-10
updated: 2026-06-18
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

**Status: implemented** (ScrumAgent-r0k / 2jb, 2026-06-18). Implemented as a
**deterministic pipeline** (NOT a tool-loop): retrieve always first, then either a
fixed "not in knowledge base" message (zero LLM calls) or a grounded LLM stream
with inline citations. See [[flows/chat]] for the full pipeline.

**Owns:** the user-facing chat answer.

- RAG retrieval via [[modules/rag]] — `retrieve(project_id, question, k)` is called
  unconditionally before any LLM invocation.
- Streams the final answer with citations over SSE.
- No external writes — the [[modules/runtime-orchestrator]] `GatedServices` proxy
  enforces a read-only capability allow-list for this agent.
- Decides whether live Jira/Notion context is needed (handoff mechanism exists in
  the orchestrator but is unused in this slice — no live Jira/Notion handoff yet).

**Cannot:** make external writes. Cannot bypass the orchestrator. Cannot surface
content from outside the project's knowledge base (project-scoped RAG filter).

## `jira_notion`

**Owns:** every Jira and Notion read and write.

- Jira access via [[modules/rovo-client]] (Atlassian Rovo — see [[decisions/2026-05-18-rovo-replaces-jira-mcp]]). Includes Rovo AI capabilities: cross-Jira search, summarization, generated update text.
- Notion access via [[modules/mcp-clients]] (Notion MCP).
- Generates **staged** updates that wait for approval.
- Creates or appends meeting notes in the permitted Notion parent (auto, no staging).
- Applies risky writes only after explicit user approval.

**Cannot:** read Google artifacts. Cannot generate the final chat answer. The two-transport asymmetry (Rovo + MCP) is internal to this agent; orchestrator boundary is unchanged.

## Why exactly three

See [[decisions/2026-03-27-three-agents-only]]. More agents would dilute capability boundaries; the [[concepts/human-in-the-loop]] property only holds because exactly one agent owns external writes.

## Handoff matrix

| From → To | When |
|---|---|
| `meeting_participation` → `jira_notion` | Meeting analysis surfaces references to Jira issues / Notion pages, or proposes updates |
| `user_chat` → `jira_notion` | Chat needs live Jira/Notion context that RAG can't supply |
| `jira_notion` → `user_chat` | Live context retrieved, return to chat to compose answer |

All transitions are recorded in [[modules/trace-store]] for the Agent Trace UI.
