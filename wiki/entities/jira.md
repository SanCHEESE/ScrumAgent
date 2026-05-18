---
type: entity
title: "Jira"
created: 2026-05-10
updated: 2026-05-18
tags: [entity, jira, atlassian, integration]
---

# Jira (Atlassian)

Issue tracker. Accessed via **[[entities/atlassian-rovo|Atlassian Rovo]]** (direct vendor integration). Atlassian MCP is no longer used — see [[decisions/2026-05-18-rovo-replaces-jira-mcp]].

## What we do with it

- Read context: issues, comments, status, transitions.
- Rovo AI: cross-Jira search, summarization, generated update text, Rovo Agent invocation.
- Generate **staged** update proposals.
- Apply updates only after explicit user approval ([[concepts/human-in-the-loop]]).

## How

- Module: [[modules/rovo-client]] (`backend/app/rovo_client.py`).
- Agent: gated behind `jira_notion` ([[domains/agents]]).
- Env: `ROVO_API_TOKEN`, `ATLASSIAN_SITE_URL`, `ATLASSIAN_USER_EMAIL`. Full list in [[entities/atlassian-rovo]].

## History

Originally planned via Atlassian MCP. Migrated to Rovo on 2026-05-18 — [[decisions/2026-05-18-rovo-replaces-jira-mcp]].
