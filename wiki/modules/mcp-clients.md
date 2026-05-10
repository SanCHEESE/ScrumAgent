---
type: module
title: "MCP Clients"
path: "backend/app/mcp_clients.py"
language: python
status: planned
created: 2026-05-10
updated: 2026-05-10
depends_on: []
used_by: [runtime-orchestrator]
tags: [module, mcp, jira, notion]
---

# MCP Clients (`mcp_clients.py`)

Encapsulates Jira and Notion access through MCP. See [[concepts/mcp]].

## Responsibilities

- Establish and reuse Atlassian MCP and Notion MCP connections.
- Tool caching (avoid re-listing tools per call).
- Normalize MCP tool results into app-internal payload shapes.

## Tools surface

| Source | Tool category |
|---|---|
| Atlassian MCP | issue read, comment read, issue update (gated) |
| Notion MCP | page read, page append (auto), page edit (gated) |

Risky writes are gated through the `jira_notion` agent and require user approval — see [[concepts/human-in-the-loop]].

## Env

- `ATLASSIAN_MCP_URL`, `ATLASSIAN_API_TOKEN`
- `NOTION_MCP_URL`, `NOTION_TOKEN`
