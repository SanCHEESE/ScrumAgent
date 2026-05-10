---
type: entity
title: "Notion"
created: 2026-05-10
updated: 2026-05-10
tags: [entity, notion, integration]
---

# Notion

Knowledge / docs platform. Accessed **only** through the Notion MCP adapter.

- URL: `NOTION_MCP_URL`
- Token: `NOTION_TOKEN`

## What we do with it

- Read context (pages).
- Auto-create / append meeting notes in a **permitted parent**.
- Bigger edits only after approval.

Owned by [[modules/mcp-clients]] and gated behind the `jira_notion` agent. See [[concepts/human-in-the-loop]].
