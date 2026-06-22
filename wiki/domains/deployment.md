---
type: domain
title: "Deployment"
created: 2026-05-10
updated: 2026-06-22
tags: [domain, deployment, docker, gcp]
---

# Deployment

Two deployment paths:

1. **Local** (canonical, dev) — Docker Compose on the developer's machine.
2. **Google Cloud (Compute Engine VM)** — single VM running the same Docker Compose stack on a persistent disk. See [[decisions/2026-05-18-gcp-compute-engine-deployment]] and the connectivity diagram in [[flows/gcp-deployment-topology]].

Source: [[sources/tech-architecture]] §9–10, ADRs above.

---

## Run locally

```bash
cp .env.example .env
# fill env vars
# put service account key at data/keys/sa_key.json
docker compose up --build
```

- Backend: `http://localhost:8000`
- Frontend: `http://localhost:3000`
- LightRAG: internal Compose service, reached by backend over the Docker network
- PostgreSQL: local Compose service for LightRAG storage parity

### Runtime environments

`APP_ENVIRONMENT` and `NEXT_PUBLIC_APP_ENVIRONMENT` are the hard boundary between
real use and agent preview:

- `production` (default): real-use mode. Backend protected routes require a valid
  bearer JWT, project access is member-only, and frontend tokens live under
  `kabanchik.production.token`.
- `agent_preview`: Codex/agent-system preview mode. Backend can resolve a local
  preview principal without a bearer and project endpoints can inspect all
  projects. The preview principal is the local fake dev user
  (`dev@municorn.com` / `dev-sub`), so the UI shows real local DB data as that
  user. Frontend tokens live under `kabanchik.agent_preview.token` if a preview
  token is ever stored; unauthenticated preview still works.

For frontend-only local work, use `npm --prefix apps/web run dev:production` or
`npm --prefix apps/web run dev:preview`. For the Compose stack, set
`APP_ENVIRONMENT=agent_preview` in the local `.env` only for local preview; never
ship that value to GCP/shared real usage.

### Local requirements

- Docker Desktop on macOS, or Docker Engine on Linux/GCE, with Compose support
  (`docker compose` or the standalone `docker-compose` CLI)
- Google Workspace tenant with native Meet artifacts available *(slice 3 only)*
- Service account with domain-wide delegation *(slice 3 only)*

### Local Docker daemon

macOS has no native Docker daemon: containers need a Linux engine running in a small
VM. The current supported local daemon is **Docker Desktop**. Start it with:

```bash
open -a Docker
```

Verify the active context is Desktop:

```bash
docker context ls
docker run --rm hello-world
```

Notes:

- Some local shells may expose the standalone `docker-compose` binary instead of
  the Compose plugin. Use `docker-compose up --build` in those shells; the stack
  file is the same.
- The same Compose stack runs on the GCE VM unchanged; Docker Desktop is a
  developer-machine concern only.

---

## Deploy to Google Cloud (Compute Engine VM)

A single VM with a persistent disk running the exact same `docker compose up` stack. No code change vs local. See [[decisions/2026-05-18-gcp-compute-engine-deployment]] for rationale.

### Shape

- **1 VM**: `e2-standard-2` or `n2-standard-2`, Container-Optimized OS or Debian 12.
- **1 persistent SSD**: 100 GB, mounted at `/opt/scrumagent/data/`. Contains
  service runtime state and `keys/`; relational/RAG storage moves to PostgreSQL
  where scoped.
- **Static external IP** reserved; A record in Cloud DNS.
- **Firewall**: 80/443 open to internet; 22 only via IAP.
- **Caddy** in front of `backend` (8000) and `frontend` (3000), auto Let's Encrypt for TLS.
- **Secret Manager** holds `.env` contents and SA JSON key; written to disk at boot.
- **Daily snapshot** of the persistent disk.

### Provisioning

Terraform module under `deploy/gcp/` (planned, beads `ScrumAgent-*`):

- `google_compute_instance` with startup script
- `google_compute_disk` for the data volume
- `google_compute_address` for the static IP
- `google_secret_manager_secret` per env var + sa_key
- `google_service_account` for the VM with `secretmanager.secretAccessor` role
- Optional `google_compute_firewall` rules

Startup script:

1. Mount the persistent disk at `/opt/scrumagent/data/`.
2. Pull `.env` and `sa_key.json` from Secret Manager (`gcloud secrets versions access`).
3. Place `sa_key.json` under `data/keys/`.
4. `git clone` the repo (or pull a versioned tarball from Artifact Registry).
5. `docker compose up -d --build`.
6. Start Caddy as a separate service or container.

### GCP-specific env

```bash
# Identity
GCP_PROJECT_ID=
GCP_REGION=europe-west1
GCP_ZONE=europe-west1-b

# Public hostname
PUBLIC_HOSTNAME=kabanchik.municorn.com
LETSENCRYPT_EMAIL=ops@municorn.com

# Secret Manager refs (resolved by startup script)
SM_ENV_SECRET=projects/${GCP_PROJECT_ID}/secrets/scrumagent-env
SM_SA_KEY_SECRET=projects/${GCP_PROJECT_ID}/secrets/scrumagent-sa-key
```

### LightRAG storage on Cloud SQL

The local Compose stack uses a `postgres` service for LightRAG storage parity. On
GCP, keep the same LightRAG container and storage adapter names, but point the
container's PostgreSQL settings at Cloud SQL PostgreSQL:

```bash
RAG_PROVIDER=lightrag
LIGHTRAG_BASE_URL=http://lightrag:9621
LIGHTRAG_WORKSPACE=scrumagent

LIGHTRAG_POSTGRES_HOST=<cloud-sql-private-ip-or-auth-proxy-host>
LIGHTRAG_POSTGRES_PORT=5432
LIGHTRAG_POSTGRES_USER=<cloud-sql-user>
LIGHTRAG_POSTGRES_PASSWORD=<cloud-sql-password-from-secret-manager>
LIGHTRAG_POSTGRES_DATABASE=lightrag
LIGHTRAG_POSTGRES_SSL_MODE=require
```

The backend still reads only the app-facing `LIGHTRAG_*` adapter settings. Compose
maps the `LIGHTRAG_POSTGRES_*` values into the LightRAG container's upstream
`POSTGRES_*` environment variables. Agents and routers continue to call only
[[modules/rag]].

### Updates / redeploys

- Tag-based: `git pull && docker compose up -d --build`.
- Brief outage during compose rebuild (acceptable for MVP).
- Rollback: snapshot-restore the disk; previous compose state restored.

### OAuth redirect URI on GCP

The Google OAuth client registered for local dev uses `http://localhost:8000/auth/google/callback`. The cloud deploy needs a **second** authorized redirect URI:

```
https://${PUBLIC_HOSTNAME}/auth/google/callback
```

Same `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` are reused.

---

## Environment variables (full reference)

```bash
# Google
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
ALLOWED_DOMAIN=municorn.com
GOOGLE_WORKSPACE_SUBJECT=
SA_KEY_PATH=/data/keys/sa_key.json

# OpenAI
OPENAI_API_KEY=
OPENAI_MODEL=gpt-4.1-mini

# Auth / backend
SECRET_KEY=change-me-in-production
APP_ENVIRONMENT=production
NEXT_PUBLIC_APP_ENVIRONMENT=production
BACKEND_URL=http://localhost:8000
FRONTEND_URL=http://localhost:3000

# Storage
DATABASE_URL=sqlite:////app/data/db/scrumagent.db
RAG_PROVIDER=lightrag
LIGHTRAG_BASE_URL=http://lightrag:9621
LIGHTRAG_WORKSPACE=scrumagent
LIGHTRAG_TIMEOUT_SECONDS=10
LIGHTRAG_API_KEY=
LIGHTRAG_LLM_MODEL=gpt-5.4-mini
LIGHTRAG_ENABLE_LLM_CACHE=true
LIGHTRAG_EMBEDDING_MODEL=text-embedding-3-small
LIGHTRAG_EMBEDDING_DIM=1536
LIGHTRAG_POSTGRES_HOST=postgres
LIGHTRAG_POSTGRES_PORT=5432
LIGHTRAG_POSTGRES_USER=rag
LIGHTRAG_POSTGRES_PASSWORD=rag
LIGHTRAG_POSTGRES_DATABASE=lightrag
LIGHTRAG_POSTGRES_MAX_CONNECTIONS=25
LIGHTRAG_POSTGRES_VECTOR_INDEX_TYPE=HNSW
LIGHTRAG_POSTGRES_SSL_MODE=disable
RAG_STORAGE_PATH=/app/data/rag

# Atlassian Rovo (Jira)
ROVO_BASE_URL=https://api.atlassian.com/rovo
ROVO_API_TOKEN=
ATLASSIAN_SITE_URL=https://municorn.atlassian.net
ATLASSIAN_USER_EMAIL=

# Notion (MCP)
NOTION_MCP_URL=https://mcp.notion.com/v1/sse
NOTION_TOKEN=

# GCP (only when deploying to GCE)
GCP_PROJECT_ID=
GCP_REGION=europe-west1
GCP_ZONE=europe-west1-b
PUBLIC_HOSTNAME=
LETSENCRYPT_EMAIL=
```

## Security posture

- Google OAuth restricted to `@municorn.com`.
- JWT verified on every backend request.
- Service account key lives under `data/keys/` (volume mount), **never** committed.
- Settings API never returns secrets in clear.
- Risky Jira/Notion writes are impossible without explicit user approval — enforced by `jira_notion` agent boundary, see [[concepts/human-in-the-loop]].
- On GCP: secrets come from Secret Manager; the VM's service account has only `roles/secretmanager.secretAccessor` and `roles/logging.logWriter`.

## Rollout phases

1. **Local MVP** — auth, ingest, RAG, runtime, staged updates, trace UI. Canonical plan: [[sources/mvp-v2-plan]].
2. **GCP deployment** — single-VM Compute Engine target alongside local, with
   LightRAG storage pointed at Cloud SQL PostgreSQL. See
   [[decisions/2026-05-18-gcp-compute-engine-deployment]].
3. **Post-MVP intelligence** — diarization, OCR/screenshots, cross-meeting memory.
4. **Production hardening** — split into Cloud Run + Cloud SQL + GCS when scale demands; queue separation if needed.
