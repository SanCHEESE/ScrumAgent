---
type: decision
title: "MVP runtime is app-owned plain Python — does NOT use the deepagents/langgraph libraries"
status: accepted
date: 2026-06-18
created: 2026-06-18
updated: 2026-06-18
tags: [decision, runtime, orchestrator, agents, deepagents]
---

# MVP runtime is app-owned plain Python — does NOT use the deepagents/langgraph libraries

## Decision

The [[modules/runtime-orchestrator]] (`backend/app/runtime/contracts.py` +
`orchestrator.py`) implements the documented app-owned orchestrator contract
(**typed run lifecycle, `CAPABILITIES` allow-list, `GatedServices` proxy,
mediated handoff, trace recording**) entirely in plain Python — without pulling
in the deepagents or langgraph libraries.

## Context

The original architecture notes referenced "DeepAgents-based runtime" and the
[[concepts/deepagents-runtime]] concept page was written with the expectation
that the deepagents library would be used. When implementation began (user_chat
RAG streaming slice, ScrumAgent-r0k / 2jb), the concrete requirements were
evaluated and the library was found unnecessary for the current agent shape.

## Rationale

1. **A single non-handoff agent does not benefit from a tool-loop framework.**
   `user_chat` is a deterministic five-step pipeline (retrieve → check empty →
   prompt → stream → citations). A ReAct / tool-loop framework adds control-flow
   overhead for zero gain when the control flow is fixed.

2. **Determinism and testability.** App-owned code is fully deterministic and
   easy to unit-test with fakes. Framework-owned control flow can silently change
   behavior on library upgrades and is harder to inject fakes into.

3. **Structural anti-hallucination by construction.** The empty-context → zero
   LLM calls guarantee is easiest to enforce and verify in explicit `if`
   statements in the pipeline, not in framework hooks that the library controls.

4. **YAGNI on the tool-loop.** The deepagents / langgraph library becomes
   genuinely valuable when there is real multi-agent handoff (e.g., `user_chat`
   → `jira_notion` → `user_chat`) — a case that is designed but unused in this
   slice. Adopting the library before that handoff is live is premature
   complexity.

5. **Clean adoption seam.** The orchestrator contract (`RunContext`,
   `HandoffTarget`, `GatedServices`, trace recording) maps directly to the
   abstractions the deepagents library exposes. Migrating to the library when
   real multi-agent handoff lands is a refactor confined to
   `runtime/orchestrator.py`, not a rewrite of the agents or routers.

## Consequences

- **+** Full determinism; every code path is explicit and testable.
- **+** The structural anti-hallucination guarantee is visible in code.
- **+** No additional library dependency or version-pinning concern for MVP.
- **+** The handoff mechanism exists and is wired, so adding `jira_notion` handoff
  later requires only enabling it, not re-architecting.
- **−** We own the boilerplate (capability gating, trace recording) that a library
  would provide. Acceptable for the three-agent MVP scope.
- **−** If the tool-loop / planning behavior of deepagents/langgraph is ever
  needed, a migration will be required. Flagged as a future option.

## Alternatives rejected

- **Use deepagents library from the start** — adds complexity and a tool-loop
  model that is wrong for the current deterministic pipeline; YAGNI.
- **Use langgraph** — same objections; additionally a heavier dependency for a
  project that deliberately keeps the tech stack lean (see
  [[decisions/2026-03-27-single-backend-container]]).

## Source

Implemented during user_chat RAG streaming slice (ScrumAgent-r0k / 2jb),
2026-06-18. Related pages: [[modules/runtime-orchestrator]],
[[concepts/deepagents-runtime]], [[domains/agents]].
