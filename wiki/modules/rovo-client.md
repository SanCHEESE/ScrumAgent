---
type: module
title: "Rovo Client"
path: "backend/app/rovo_client.py"
language: python
status: planned
created: 2026-05-18
updated: 2026-05-18
depends_on: []
used_by: [runtime-orchestrator]
tags: [module, rovo, atlassian, jira]
---

# Rovo Client (`rovo_client.py`)

Atlassian **Rovo** access for Jira. Replaces the Jira half of [[modules/mcp-clients]] per [[decisions/2026-05-18-rovo-replaces-jira-mcp]].

## Responsibilities

- Authenticate against Atlassian Rovo with API token + site URL.
- Surface Jira read capabilities: issue lookup, JQL search, comment fetch, status read.
- Surface Rovo AI capabilities: cross-Jira search, summarize, generate update text, invoke Rovo Agents.
- Generate **staged** Jira writes (issue update, comment, transition) — payload only; persistence into the `updates` table is the agent's responsibility.
- Apply staged writes when called by the `jira_notion` agent after user approval.
- Normalize Rovo / Jira REST payloads into app-internal shapes (`Issue`, `Comment`, `Transition`).

## Capability split

| Group | Examples | Risk |
|---|---|---|
| Safe read | get_issue, jql_search, get_comments, get_transitions | none |
| Rovo AI | rovo_search, summarize_issue, generate_update_text, run_agent | none (read-only inference) |
| Staged write | update_issue_field, add_comment, transition_issue | gated; staged → approved → applied |

Risky writes require the [[concepts/human-in-the-loop]] approval lifecycle. Only `jira_notion` agent calls this module — enforced by [[modules/runtime-orchestrator]].

## Env

- `ROVO_BASE_URL` — Rovo API base (default: `https://api.atlassian.com/rovo`)
- `ROVO_API_TOKEN` — Atlassian API token with Rovo enabled
- `ATLASSIAN_SITE_URL` — Jira cloud site (e.g. `https://municorn.atlassian.net`)
- `ATLASSIAN_USER_EMAIL` — Atlassian account email (token owner)

## Related

- [[entities/atlassian-rovo]] — vendor profile
- [[entities/jira]] — what we read/write
- [[modules/mcp-clients]] — Notion-only sibling
- [[concepts/human-in-the-loop]] — staged-write policy
- [[domains/agents]] — capability boundary
