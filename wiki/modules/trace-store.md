---
type: module
title: "Trace Store"
path: "backend/app/repositories/trace.py"
language: python
status: implemented
created: 2026-05-10
updated: 2026-06-18
depends_on: []
used_by: [runtime-orchestrator]
tags: [module, observability, trace]
---

# Trace Store (`repositories/trace.py`)

Persists full agent run history for the Agent Trace UI.

## Status

**Implemented** (repository layer shipped as part of the user_chat RAG streaming
slice, ScrumAgent-r0k / 2jb). The models (`agent_runs`, `agent_steps`) existed
previously; the read+write repository is now live.

## Repository API

- `start_run(run_id, entry_agent, context)` — create an `agent_runs` row in status
  `running`.
- `record_step(run_id, step)` — append an `agent_steps` row (agent, step_index,
  kind, input, output, handoff target).
- `finish_run(run_id, status, outcome)` — update the run row with final status and
  `ended_at`.
- `get_run(run_id)` → run row.
- `list_steps(run_id)` → ordered list of step rows.

## Schema

- `agent_runs` — run lifecycle (id, entry agent, status, started_at, ended_at,
  final outcome).
- `agent_steps` — per-step records (run_id, agent, step_index, kind, input, output,
  tool_calls, handoff target).

## What gets recorded

- Run start, finish, status.
- Agent handoff (from → to, reason).
- Tool use (name, input, output).
- Final agent output and any staged updates.

## Consumers

- [[modules/runtime-orchestrator]] — writes every step during a run.
- `routers/trace.py` — exposes runs and steps to the [[domains/frontend]] Agent
  Trace screen.
