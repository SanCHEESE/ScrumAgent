---
type: domain
title: "Deployment"
created: 2026-05-10
updated: 2026-06-01
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

### Local requirements

- Docker engine + Docker Compose v2 + Buildx (see "Local Docker daemon" below)
- Google Workspace tenant with native Meet artifacts available *(slice 3 only)*
- Service account with domain-wide delegation *(slice 3 only)*

### Local Docker daemon (Colima — no Docker Desktop)

macOS has no native Docker daemon: containers need a Linux engine running in a small
VM. **Docker Desktop is not required** — the supported daemon is
[Colima](https://github.com/abiosoft/colima) (a thin manager over a Lima VM). The
`docker` CLI and the `compose`/`buildx` plugins are installed from Homebrew, fully
independent of Docker Desktop.

One-time setup (Apple Silicon):

```bash
# CLI + plugins + daemon. Homebrew's bin precedes any Docker.app symlinks in PATH,
# so `docker` resolves to the brew client even with Desktop still installed.
brew install colima docker docker-compose docker-buildx
mkdir -p ~/.docker/cli-plugins
ln -sfn /opt/homebrew/lib/docker/cli-plugins/docker-compose ~/.docker/cli-plugins/docker-compose
ln -sfn /opt/homebrew/lib/docker/cli-plugins/docker-buildx  ~/.docker/cli-plugins/docker-buildx

# Start the VM: Apple Virtualization.framework (vz) + fast virtiofs bind mounts.
colima start --cpu 6 --memory 8 --disk 60 --vm-type vz --mount-type virtiofs
```

`colima start` creates and switches to the `colima` docker context, so `docker` and
`docker compose up --build` work unchanged. Verify with `docker context ls` (the
`colima` row is active) and `colima status`.

Notes:

- When dropping Docker Desktop, remove `"credsStore": "desktop"` from
  `~/.docker/config.json`. Otherwise `docker` shells out to the Desktop credential
  helper and even anonymous pulls of public images can fail once Desktop is gone.
- Survive reboot: `brew services start colima` (reuses the saved cpu/mem/vz profile).
  Disable Docker Desktop's "open at login" so it doesn't relaunch and grab ports.
- Lifecycle: `colima start` / `colima stop`; `colima delete` wipes the VM.
- The same `docker compose` stack runs on the GCE VM (Linux) unchanged — Colima is a
  macOS-host concern only.

---

## Deploy to Google Cloud (Compute Engine VM)

A single VM with a persistent disk running the exact same `docker compose up` stack. No code change vs local. See [[decisions/2026-05-18-gcp-compute-engine-deployment]] for rationale.

### Shape

- **1 VM**: `e2-standard-2` or `n2-standard-2`, Container-Optimized OS or Debian 12.
- **1 persistent SSD**: 100 GB, mounted at `/opt/scrumagent/data/`. Contains `db/`, `rag/`, `keys/`.
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
BACKEND_URL=http://localhost:8000
FRONTEND_URL=http://localhost:3000

# Storage
DATABASE_URL=sqlite:////data/db/dev.db
RAG_STORAGE_PATH=/data/rag

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
2. **GCP deployment** — single-VM Compute Engine target alongside local. See [[decisions/2026-05-18-gcp-compute-engine-deployment]].
3. **Post-MVP intelligence** — diarization, OCR/screenshots, cross-meeting memory.
4. **Production hardening** — split into Cloud Run + Cloud SQL + GCS when scale demands; queue separation if needed.
