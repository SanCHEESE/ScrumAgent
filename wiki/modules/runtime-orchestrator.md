---
type: module
title: "Runtime Orchestrator"
path: "backend/app/runtime/"
language: python
status: planned
created: 2026-05-10
updated: 2026-05-10
depends_on: [trace-store, llm-gateway]
used_by: []
tags: [module, runtime]
---

# Runtime Orchestrator

DeepAgents-based runtime that owns agent lifecycle and handoff.

## Files

- `runtime/contracts.py` — `RunMode`, `AgentName`, `RunContext`, handoff target shape, trace event and proposed-update payloads.
- `runtime/orchestrator.py` — start/finish runs, handoff policy, shared services, agent-to-agent isolation, trace recording.

## Responsibilities

- Start a run with a given entry agent and `RunContext`.
- Provide each agent with the shared services it is **allowed** to use (gated by [[domains/agents]] capability matrix).
- Mediate every handoff. Agents cannot call each other directly.
- Record every step (input, output, tool use, handoff) into [[modules/trace-store]].
- Surface staged proposed updates for the [[domains/frontend]] to render.

## Interactions

- Calls [[modules/llm-gateway]] on behalf of agents (so agents don't bypass the gateway).
- Reads/writes [[modules/trace-store]] for every step.
- Triggered by routers in [[domains/backend]].
