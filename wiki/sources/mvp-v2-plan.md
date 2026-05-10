---
type: source
title: "MVP v2 implementation plan — sources/mvp-v2-plan"
status: synthesized
source_path: ".raw/migrated/mvp_v2.md"
original_path: "docs/plans/mvp_v2.md"
created: 2026-05-10
updated: 2026-05-10
tags: [source, plan, canonical]
---

# MVP v2 implementation plan (canonical)

Original: `.raw/migrated/mvp_v2.md`.

## What this doc establishes

The **authoritative execution contract** for building the MVP.

## Non-negotiable workflow

1. `bd prime` at session start.
2. `bd ready --json`; claim issue atomically before implementation.
3. Use `superpowers:using-superpowers`.
4. Use `superpowers:test-driven-development` for every behavior change. No production code without a failing test first.
5. At session end: commit, `git pull --rebase`, `bd dolt push`, `git push`. Final `git status` must say "up to date with origin".

## Tech stack (canonical)

- **Backend:** FastAPI, Uvicorn, SQLAlchemy, SQLite, OpenAI via `langchain-openai`, DeepAgents runtime, MCP Python client, `langchain-mcp-adapters`, RAG-Anything, Google auth + API clients, `python-jose`, `pytest`.
- **Frontend:** Next.js 14, TypeScript, Tailwind, shadcn/ui, Vitest or Jest, Playwright.
- **Runtime:** Docker Compose, local `./data/db`, `./data/rag`, `./data/keys`.

## Where this lands in the wiki

- [[overview]], [[domains/architecture]], [[domains/backend]], [[domains/frontend]], [[domains/deployment]]
- [[modules/_index]] — module-by-module work
- [[meta/conventions]] — wiki side; the original doc covers the code side

> [!key-insight] If `mvp.md` and `mvp_v2.md` ever disagree, `mvp_v2.md` wins.
