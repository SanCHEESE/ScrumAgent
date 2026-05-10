---
type: meta
title: "Hot Cache"
updated: 2026-05-10T20:30:00
tags: [meta, hot-cache]
---

# Recent Context

## Last Updated
2026-05-10. Frontend implementation kicked off. Full design prototype ported to a runnable Next.js 14 app.

## Key Recent Facts
- Project: **Telecom Scrum Agent**, branded **Kabanchik**. Local-first Docker Compose service for Municorn (`@municorn.com`).
- Two services: `backend` (FastAPI + DeepAgents + 3 agents + SQLite + RAG-Anything + MCP) and `frontend` (Next.js 14 + TypeScript at `apps/web/`).
- Three agents only: `meeting_participation`, `user_chat`, `jira_notion`. No agent-to-agent calls outside the orchestrator.
- LLM is OpenAI-only via `langchain-openai`. RAG is RAG-Anything. Jira and Notion live behind MCP adapters.
- Canonical execution plan: [[sources/mvp-v2-plan]].
- Issue tracking: `bd` (beads).

## Frontend (new)
- Lives in `apps/web/`. Next.js 14 App Router, TypeScript strict, Tailwind utility-only (preflight off).
- Routes implemented: `/`, `/chat`, `/meetings`, `/meetings/[id]`, `/updates`, `/trace`, `/projects`, `/projects/new`, `/settings`, `/login`.
- Design system: ported from Kabanchik prototype. CSS variables (`--brand-*`, `--ink-*`, `--bg-*`), three densities, light/dark, accent hue runtime-tunable.
- Tweaks panel: floating bottom-right; persists to `localStorage["kabanchik.tweaks"]` (JSON) plus `localStorage["tweaks.layoutVariant"]` (string mirror for the home screen).
- Mocks: `apps/web/lib/mock-data.ts` exports `PROJECTS`, `PARTICIPANTS`, `MEETINGS`, `UPDATES`, `TRACE_RUNS`. No backend wired yet.
- Tests: Playwright at `apps/web/tests/e2e/`. 38 tests, all passing. Run `cd apps/web && npm run test:e2e`.
- Build: `cd apps/web && npm run build` — passes, 12 routes.

## Recent Changes
- Bootstrapped Next.js 14 foundation via parallel agent in worktree (`a39c207a7b5962e32`).
- 9 parallel screen agents in isolated worktrees built Home / Chat / Meetings / Updates / Trace / Projects / Settings / Login / Tweaks panel; all merged to main.
- 9 parallel code-reviewer agents reviewed each implementation; critical fixes applied (tweaks-changed event listener on Home; `.integration-icon` CSS scope leak).
- Playwright + UI tests for all screens added; 38/38 pass.
- Follow-ups for deferred review feedback in `bd-d5g`.

## Active Threads
- Open: `bd-d5g` — apply remaining P2 review feedback (a11y for home rows, projects toast auto-dismiss, sparkline memoization, settings switch exhaustiveness, etc.).
- Backend implementation has not started. Frontend uses mocks only.
- Tweaks panel layout-variant change now propagates same-tab via custom `tweaks-changed` event.
