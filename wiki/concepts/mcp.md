---
type: concept
title: "MCP — Model Context Protocol"
status: developing
created: 2026-05-10
updated: 2026-05-18
tags: [concept, mcp, integrations]
---

# MCP — Model Context Protocol

Standard protocol for exposing external tools to LLM agents. Used here as the path to **Notion**.

> [!note] Scope narrowed 2026-05-18
> Jira moved off MCP onto direct Atlassian Rovo integration — see [[decisions/2026-05-18-rovo-replaces-jira-mcp]] and [[modules/rovo-client]]. MCP now covers Notion only.

## In this project

- **Notion MCP** — Notion read + edit. URL: `NOTION_MCP_URL`.

Accessed via the Python MCP client + `langchain-mcp-adapters`, wrapped by [[modules/mcp-clients]].

## Why MCP for Notion

- Tool listing is discoverable; no hard-coded REST client to maintain.
- Aligns with the [[concepts/human-in-the-loop]] policy: writes are gated, observable, and easy to log into [[modules/trace-store]].

## Boundary

Only the `jira_notion` agent ever calls Notion MCP. Same agent owns Jira via [[modules/rovo-client]]. Enforced by [[modules/runtime-orchestrator]]. See [[domains/agents]].
