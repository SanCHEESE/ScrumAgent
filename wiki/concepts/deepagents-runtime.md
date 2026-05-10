---
type: concept
title: "DeepAgents Runtime"
status: developing
created: 2026-05-10
updated: 2026-05-10
tags: [concept, runtime, agents]
---

# DeepAgents Runtime

The agent orchestration framework used by [[modules/runtime-orchestrator]]. It exposes a typed run lifecycle (start → steps → handoff → end) that plays well with strict capability boundaries.

## Why this fits the project

- **Typed contracts** — run mode, agent name, run context, handoff target. Maps cleanly to `runtime/contracts.py`.
- **Mediated handoff** — agents transition through the runtime, not directly. This is what makes the [[domains/agents]] capability matrix enforceable.
- **Trace-ready** — each step is a record we can persist into [[modules/trace-store]].

## Used in

- [[modules/runtime-orchestrator]] — wraps DeepAgents in app-owned types.
- [[flows/meeting-processing]], [[flows/chat]] — concrete run flows.

> [!gap] No deep API notes yet
> Once the orchestrator is implemented, expand this page with the actual DeepAgents APIs touched.
