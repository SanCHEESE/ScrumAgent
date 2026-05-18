---
type: module
title: "MCP Clients (Notion)"
path: "backend/app/mcp_clients.py"
language: python
status: planned
created: 2026-05-10
updated: 2026-05-18
depends_on: []
used_by: [runtime-orchestrator]
tags: [module, mcp, notion]
---

# MCP Clients (`mcp_clients.py`)

Notion access via MCP. See [[concepts/mcp]].

> [!note] Scope narrowed 2026-05-18
> Jira no longer goes through MCP. It moved to direct Atlassian Rovo integration in [[modules/rovo-client]] per [[decisions/2026-05-18-rovo-replaces-jira-mcp]]. This module is **Notion-only** going forward.

## Responsibilities

- Establish and reuse the Notion MCP connection.
- Tool caching (avoid re-listing tools per call).
- Normalize MCP tool results into app-internal payload shapes (`Page`, `Block`, `Comment`).

## Tools surface

| Source | Tool category |
|---|---|
| Notion MCP | page read, page append (auto), page edit (gated) |

Risky page edits are staged through the `jira_notion` agent and require user approval — see [[concepts/human-in-the-loop]]. Page-append for meeting-notes into the permitted parent is auto-approved.

## Env

- `NOTION_MCP_URL` (default `https://mcp.notion.com/v1/sse`)
- `NOTION_TOKEN`

## Related

- [[modules/rovo-client]] — Jira sibling (direct vendor, not MCP)
- [[entities/notion]]
- [[concepts/mcp]]
