---
type: entity
title: "Jira"
created: 2026-05-10
updated: 2026-05-10
tags: [entity, jira, atlassian, integration]
---

# Jira (Atlassian)

Issue tracker. Accessed **only** through the [Atlassian MCP](https://mcp.atlassian.com) adapter.

- URL: `ATLASSIAN_MCP_URL`
- Token: `ATLASSIAN_API_TOKEN`

## What we do with it

- Read context: issues, comments, status.
- Generate **staged** update proposals.
- Apply updates only after explicit user approval.

Owned by [[modules/mcp-clients]] and gated behind the `jira_notion` agent. See [[concepts/human-in-the-loop]].
