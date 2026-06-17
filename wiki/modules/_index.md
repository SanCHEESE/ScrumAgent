---
type: meta
title: "Modules"
created: 2026-05-10
updated: 2026-06-17
tags: [meta, index, module]
---

# Modules

Backend code modules. Each page tracks purpose, path, status, dependencies.

| Module | Path | Status |
|---|---|---|
| [[auth]] | `backend/app/routers/auth.py` | active |
| [[project-provisioning]] | `backend/app/routers/projects.py` | active |
| [[runtime-orchestrator]] | `backend/app/runtime/` | planned |
| [[llm-gateway]] | `backend/app/llm.py` | planned |
| [[rag]] | `backend/app/rag.py` | planned LightRAG adapter |
| [[calendar-sync]] | `backend/app/calendar_sync.py` | planned |
| [[rovo-client]] | `backend/app/rovo_client.py` | planned |
| [[mcp-clients]] | `backend/app/mcp_clients.py` | planned (Notion only) |
| [[trace-store]] | `backend/app/trace_store.py` | planned |

> [!gap] Module pages will fill in as code lands.
> Status flips from `planned` → `active` once the module exists in the repo.
