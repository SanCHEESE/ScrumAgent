---
type: entity
title: "Atlassian Rovo"
created: 2026-05-18
updated: 2026-05-18
tags: [entity, atlassian, rovo, integration]
---

# Atlassian Rovo

Atlassian's AI platform across Jira (and Confluence, not in MVP). We use it as the single transport for all Jira access — see [[decisions/2026-05-18-rovo-replaces-jira-mcp]].

## Used for

- Jira issue read (search, lookup, comments, transitions).
- Rovo AI calls: cross-Jira search, summarization, generated update text, Rovo Agent invocation.
- Staged Jira writes (issue updates, comments, transitions) — applied only after explicit user approval per [[concepts/human-in-the-loop]].

## Touchpoints

- Owned by [[modules/rovo-client]] (`backend/app/rovo_client.py`).
- Driven by the `jira_notion` agent — see [[domains/agents]].
- All operations recorded into [[modules/trace-store]] for the Agent Trace UI.

## Required setup

- Atlassian Cloud workspace with **Rovo enabled** (Premium or Enterprise plan).
- API token from `id.atlassian.com/manage-profile/security/api-tokens`.
- Token owner's email (used as `ATLASSIAN_USER_EMAIL`).
- Jira site URL: `https://<workspace>.atlassian.net`.
- Sandbox Jira project for safe write testing.

## Env

```bash
ROVO_BASE_URL=https://api.atlassian.com/rovo
ROVO_API_TOKEN=
ATLASSIAN_SITE_URL=https://municorn.atlassian.net
ATLASSIAN_USER_EMAIL=
```

Atlassian MCP env (`ATLASSIAN_MCP_URL`, `ATLASSIAN_API_TOKEN`) is **removed** — see migration note in [[domains/integrations]].
