---
type: concept
title: "MCP — Model Context Protocol"
status: developing
created: 2026-05-10
updated: 2026-05-10
tags: [concept, mcp, integrations]
---

# MCP — Model Context Protocol

Standard protocol for exposing external tools to LLM agents. Used here as the only path to Jira and Notion.

## In this project

- **Atlassian MCP** — Jira read + write. URL: `ATLASSIAN_MCP_URL`.
- **Notion MCP** — Notion read + edit. URL: `NOTION_MCP_URL`.

Both are accessed via the Python MCP client + `langchain-mcp-adapters`, wrapped by [[modules/mcp-clients]].

## Why MCP-only access

- Single normalized adapter shape for two different vendors.
- Tool listing is discoverable; no hard-coded REST clients to maintain.
- Aligns with the [[concepts/human-in-the-loop]] policy: writes are gated, observable, and easy to log into [[modules/trace-store]].

## Boundary

Only the `jira_notion` agent ever calls these clients. Enforced by [[modules/runtime-orchestrator]]. See [[domains/agents]].
