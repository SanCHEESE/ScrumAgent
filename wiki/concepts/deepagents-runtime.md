---
type: concept
title: "DeepAgents Runtime"
status: clarified
created: 2026-05-10
updated: 2026-06-18
tags: [concept, runtime, agents]
---

# DeepAgents Runtime

The orchestration pattern that inspired [[modules/runtime-orchestrator]]. It
exposes a typed run lifecycle (start → steps → handoff → end) that plays well
with strict capability boundaries.

## Why this pattern fits the project

- **Typed contracts** — run mode, agent name, run context, handoff target. Maps
  cleanly to `runtime/contracts.py`.
- **Mediated handoff** — agents transition through the runtime, not directly.
  This is what makes the [[domains/agents]] capability matrix enforceable.
- **Trace-ready** — each step is a record we can persist into
  [[modules/trace-store]].

## Implementation decision: app-owned, NOT the deepagents library

> **The MVP runtime does NOT use the deepagents or langgraph libraries.**

The [[modules/runtime-orchestrator]] was implemented in plain Python (`backend/
app/runtime/contracts.py` + `orchestrator.py`) following the spirit of the
DeepAgents pattern without pulling in the library. The decision was made during
the user_chat RAG streaming slice (ScrumAgent-r0k / 2jb, 2026-06-18).

Rationale:
- A single non-handoff agent (user_chat, MVP) gains nothing from a tool-loop
  framework — it is a DETERMINISTIC pipeline, not a ReAct loop.
- App-owned code gives full determinism and testability; no hidden tool-loop
  magic that could hallucinate a path.
- The structural anti-hallucination guarantee (empty context → fixed message,
  zero LLM calls) is easier to enforce in explicit code than in a framework
  that expects to decide control flow.
- YAGNI: the deepagents library becomes valuable when we have real multi-agent
  handoff (e.g., `user_chat` → `jira_notion`). The seam is clean — adopting it
  then is a refactor, not a rewrite.

Full ADR: [[decisions/2026-06-18-app-owned-orchestrator-not-deepagents-lib]].

## Used in

- [[modules/runtime-orchestrator]] — implements the pattern in app-owned code.
- [[flows/meeting-processing]], [[flows/chat]] — concrete run flows.
