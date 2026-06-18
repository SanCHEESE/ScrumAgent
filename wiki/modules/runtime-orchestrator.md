---
type: module
title: "Runtime Orchestrator"
path: "backend/app/runtime/"
language: python
status: implemented
created: 2026-05-10
updated: 2026-06-18
depends_on: [trace-store, llm-gateway]
used_by: [user_chat]
tags: [module, runtime]
---

# Runtime Orchestrator

App-owned runtime that owns agent lifecycle and handoff. **Does NOT use the
deepagents or langgraph libraries** — see
[[decisions/2026-06-18-app-owned-orchestrator-not-deepagents-lib]] and
[[concepts/deepagents-runtime]].

## Status

**Implemented** (shipped as part of the user_chat RAG streaming slice,
ScrumAgent-r0k / 2jb).

## Files

- `runtime/contracts.py` — `AgentName`, `RunMode`, `RunContext`, `HandoffTarget`,
  `CAPABILITIES` allow-list (the read-only set of service keys each agent may
  receive).
- `runtime/orchestrator.py` — `Orchestrator` class: start/finish runs, handoff
  policy, `GatedServices` (allow-list proxy that raises `CapabilityError` for
  un-allowed service keys), trace recording, mediated handoff mechanism.

## Responsibilities

- Start a run with a given entry agent and `RunContext`.
- Wrap shared services in a `GatedServices` proxy so each agent only receives the
  services listed in the `CAPABILITIES` allow-list for that agent name.
- Mediate every handoff. Agents cannot call each other directly.
- Record every step (input, output, handoff) into [[modules/trace-store]] via
  `repositories/trace.py`.
- Surface staged proposed updates for the [[domains/frontend]] to render (future).

## Key design decision: app-owned, not deepagents-library

The orchestrator implements the documented contract (typed run lifecycle, mediated
handoff, capability gating) in plain Python without pulling in deepagents or
langgraph. Rationale: determinism, testability, and structural anti-hallucination
for a single non-handoff agent. The seam is clean — adopting deepagents when real
multi-agent handoff lands is a refactor, not a rewrite. See
[[decisions/2026-06-18-app-owned-orchestrator-not-deepagents-lib]].

## Handoff mechanism (designed, unused this slice)

The mechanism exists in `orchestrator.py` but `user_chat` does not trigger it in
this slice (no live Jira/Notion handoff yet). The `jira_notion` handoff path is
wired but dormant.

## Interactions

- Calls [[modules/llm-gateway]] on behalf of agents (so agents don't bypass the gateway).
- Reads/writes [[modules/trace-store]] via `repositories/trace.py` for every step.
- Triggered by routers in [[domains/backend]].
