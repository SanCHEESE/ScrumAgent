---
type: domain
title: "Integrations"
created: 2026-05-10
updated: 2026-05-10
tags: [domain, integrations]
---

# Integrations

Every external system the backend talks to.

## Google Workspace — [[entities/google-workspace]]

- **OAuth login** — only `@municorn.com` users (`ALLOWED_DOMAIN`).
- **Calendar API** — service account with domain-wide delegation, syncs events for domain users.
- **Meet artifacts** — transcript and notes metadata via Google APIs (post-meeting).

Owned by: [[modules/calendar-sync]]. Driven by `meeting_participation` agent.

## Jira — [[entities/jira]]

Access only through the **Atlassian MCP adapter**.

- Read context (issues, comments, status).
- Generate **staged** update proposals.
- Write only after explicit user approval ([[concepts/human-in-the-loop]]).

Owned by: [[modules/mcp-clients]]. Driven by `jira_notion` agent.

## Notion — [[entities/notion]]

Access only through the **Notion MCP adapter**.

- Read context (pages).
- Create / append meeting notes in a permitted parent (auto).
- Larger edits only after approval.

Owned by: [[modules/mcp-clients]]. Driven by `jira_notion` agent.

## OpenAI — [[entities/openai]]

LLM-only provider. Access through `langchain-openai` in [[modules/llm-gateway]]. Configured by `OPENAI_API_KEY` and `OPENAI_MODEL` (default `gpt-4.1-mini`). See [[decisions/2026-03-27-openai-only-llm]].

## Env summary

```bash
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
ALLOWED_DOMAIN=municorn.com
GOOGLE_WORKSPACE_SUBJECT=
SA_KEY_PATH=/data/keys/sa_key.json

OPENAI_API_KEY=
OPENAI_MODEL=gpt-4.1-mini

ATLASSIAN_MCP_URL=https://mcp.atlassian.com/v1/sse
ATLASSIAN_API_TOKEN=
NOTION_MCP_URL=https://mcp.notion.com/v1/sse
NOTION_TOKEN=
```

Full env list in [[domains/deployment]].
