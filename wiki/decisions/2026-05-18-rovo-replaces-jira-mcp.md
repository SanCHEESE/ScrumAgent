---
type: decision
title: "Rovo replaces Atlassian MCP for Jira"
status: accepted
date: 2026-05-18
created: 2026-05-18
updated: 2026-05-18
tags: [decision, integrations, jira, rovo, atlassian]
---

# Rovo replaces Atlassian MCP for Jira

## Decision

Jira access is moved off the Atlassian MCP adapter onto **Atlassian Rovo** (direct vendor integration). Notion access stays on the Notion MCP. The `jira_notion` agent now uses two different transports — Rovo for Jira, MCP for Notion.

A new backend module [[modules/rovo-client]] (`backend/app/rovo_client.py`) replaces the Jira half of [[modules/mcp-clients]]. The MCP clients module is reduced to Notion only.

## Context

- The MCP shim was a thin abstraction. We're not gaining cross-vendor portability from it in practice — both clients are bespoke anyway.
- Rovo gives native Jira AI capabilities (search across Jira projects, generate update text, summarize tickets, invoke Rovo Agents) that we would otherwise reimplement on top of MCP tool calls.
- Confluence is out of scope for MVP — see [[decisions/_index]]. Rovo's Confluence reach is noted as a future option but not enabled.

## Consequences

- **+** Native Rovo features available to `jira_notion` agent (search, summarize, agent invocation).
- **+** Fewer indirections: one Atlassian-native client instead of an MCP adapter wrapping Atlassian.
- **+** Forward path to Confluence is one config flip away once we're ready.
- **−** Symmetry lost: Notion via MCP, Jira via vendor SDK. The `jira_notion` agent surface is no longer uniform.
- **−** Tighter coupling to Atlassian-specific shapes; if Rovo API changes, we feel it directly.
- **−** Authentication shifts: Rovo API token instead of Atlassian MCP token. Prereqs change. See [[entities/atlassian-rovo]].

## Boundary stays unchanged

The agent capability matrix in [[domains/agents]] is unchanged: only `jira_notion` may touch Jira (regardless of transport). Risky writes still go through the staged-update lifecycle per [[concepts/human-in-the-loop]].

## Source

User directive 2026-05-18: "вместо jira mcp подключить atlassian rovo". Updates: [[domains/integrations]], [[modules/mcp-clients]], [[modules/rovo-client]], [[entities/jira]], [[entities/atlassian-rovo]], [[concepts/mcp]].
