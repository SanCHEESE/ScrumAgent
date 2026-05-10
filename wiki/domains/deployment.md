---
type: domain
title: "Deployment"
created: 2026-05-10
updated: 2026-05-10
tags: [domain, deployment, docker]
---

# Deployment

Local-first via Docker Compose. Source: [[sources/tech-architecture]] §9–10.

## Run locally

```bash
cp .env.example .env
# fill env vars
# put service account key at data/keys/sa_key.json
docker compose up --build
```

- Backend: `http://localhost:8000`
- Frontend: `http://localhost:3000`

## Requirements

- Docker + Docker Compose
- Google Workspace tenant with native Meet artifacts available
- Service account with domain-wide delegation

## Environment variables

```bash
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
ALLOWED_DOMAIN=municorn.com
GOOGLE_WORKSPACE_SUBJECT=
SA_KEY_PATH=/data/keys/sa_key.json

OPENAI_API_KEY=
OPENAI_MODEL=gpt-4.1-mini

SECRET_KEY=change-me-in-production
BACKEND_URL=http://localhost:8000
FRONTEND_URL=http://localhost:3000

DATABASE_URL=sqlite:////data/db/dev.db
RAG_STORAGE_PATH=/data/rag

ATLASSIAN_MCP_URL=https://mcp.atlassian.com/v1/sse
ATLASSIAN_API_TOKEN=
NOTION_MCP_URL=https://mcp.notion.com/v1/sse
NOTION_TOKEN=
```

## Security posture

- Google OAuth restricted to `@municorn.com`.
- JWT verified on every backend request.
- Service account key lives under `data/keys/` (volume mount), **never** committed.
- Settings API never returns secrets in clear.
- Risky Jira/Notion writes are impossible without explicit user approval — enforced by `jira_notion` agent boundary, see [[concepts/human-in-the-loop]].

## Rollout phases

1. **Local MVP** — auth, ingest, RAG, runtime, staged updates, trace UI. Canonical plan: [[sources/mvp-v2-plan]].
2. **Post-MVP intelligence** — diarization, OCR/screenshots, cross-meeting memory.
3. **Production hardening** — deployment hardening, queue separation if needed, scaling.
