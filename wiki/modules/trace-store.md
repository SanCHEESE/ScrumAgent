---
type: module
title: "Trace Store"
path: "backend/app/trace_store.py"
language: python
status: planned
created: 2026-05-10
updated: 2026-05-10
depends_on: []
used_by: [runtime-orchestrator]
tags: [module, observability, trace]
---

# Trace Store (`trace_store.py`)

Persists full agent run history into SQLite for the Agent Trace UI.

## Schema

- `agent_runs` — run lifecycle (id, entry agent, status, started_at, ended_at, final outcome).
- `agent_steps` — per-step records (run_id, agent, step_index, kind, input, output, tool_calls, handoff target).

Both tables must exist before the trace UI can ship.

## What gets recorded

- Run start, finish, status.
- Agent handoff (from → to, reason).
- Tool use (name, input, output).
- Final agent output and any staged updates.

## Consumers

- `routers/trace.py` — exposes runs and steps to the [[domains/frontend]] Agent Trace screen.
