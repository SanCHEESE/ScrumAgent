---
type: decision
title: "GCP deployment target: single Compute Engine VM"
status: accepted
date: 2026-05-18
created: 2026-05-18
updated: 2026-05-18
tags: [decision, deployment, gcp, compute-engine]
---

# GCP deployment target: single Compute Engine VM

## Decision

The cloud deployment target is **one Google Compute Engine VM** running the existing `docker compose up` stack on a persistent disk. Local Docker Compose remains the canonical dev path; GCP is an additional deployment target, not a re-architecture.

No code change to the backend or frontend is required for the GCP path. SQLite, RAG-Anything storage, and the Google service-account JSON key all live on the VM's persistent disk under `/opt/scrumagent/data/`.

## Context

- The MVP was scoped local-first ([[decisions/2026-03-27-single-backend-container]]). Both data layers (SQLite + RAG-Anything) assume a writable POSIX filesystem.
- Cloud Run would force migrations: Postgres for state, GCS for RAG storage, plus stateless restructuring. That's a separate, larger project.
- We want a deployable target **now**, not after a rewrite. A VM lifts-and-shifts the Compose stack with one persistent disk.

## Shape

- **1 VM** (`e2-standard-2` or `n2-standard-2`) with Container-Optimized OS or Debian.
- **1 persistent SSD** (100 GB) mounted at `/opt/scrumagent/data/` (`db/`, `rag/`, `keys/`).
- **Reserved static external IP** (or a Cloud Load Balancer if we want managed TLS).
- **Secret Manager** holds `.env` contents and the SA JSON key; injected to disk at boot.
- **Cloud DNS** A record → static IP.
- **Caddy** in front of `backend` (8000) and `frontend` (3000), Let's Encrypt for TLS.
- **Daily disk snapshot** for backup.
- **OAuth redirect URI** updated to the public hostname.

## Provisioning

Terraform module under `deploy/gcp/` (planned, see beads). Bootstrap script clones the repo and runs `docker compose up -d`. Image rebuilds are pull + `docker compose up -d --build`.

## Consequences

- **+** Zero rewrite. Same containers, same data shapes, same DI.
- **+** Operational story is simple: one VM, one disk, one snapshot.
- **+** SQLite + filesystem RAG keep working.
- **−** Single point of failure. No autoscaling. No zero-downtime deploys (brief outage on `docker compose up -d --build`).
- **−** Manual ops: SSH, restarts, snapshot management.
- **−** Cost scales linearly with VM size; cannot scale to zero.
- **−** Will need to revisit at phase-3 ([[domains/deployment]] rollout phases) — likely Cloud Run + Cloud SQL + GCS at that point.

## Source

User directive 2026-05-18: "хочу деплоить ещё в гугл клауд". Cloud Run was considered and rejected because it would force a state-layer migration we don't need yet. Updates: [[domains/deployment]], new beads issue for GCE provisioning.
