---
type: meta
title: "Hot Cache"
updated: 2026-05-10T12:55:00
tags: [meta, hot-cache]
---

# Recent Context

## Last Updated
2026-05-10. Vault scaffold complete. All existing project documentation migrated from `docs/` into structured wiki.

## Key Recent Facts
- Project: **Telecom Scrum Agent**, branded **Kabanchik**. Local-first Docker Compose service for Municorn (`@municorn.com`).
- Two services: `backend` (FastAPI + DeepAgents runtime + 3 agents + SQLite + RAG-Anything + MCP) and `frontend` (Next.js 14).
- Three agents only: [[entities/_index|see entities]] / [[domains/agents]] — `meeting_participation`, `user_chat`, `jira_notion`. No agent-to-agent calls outside the orchestrator.
- LLM is OpenAI-only via `langchain-openai`. RAG is RAG-Anything. Jira and Notion live behind MCP adapters.
- Canonical execution plan: [[sources/mvp-v2-plan]]. Older [[sources/mvp-plan]] is deprecated and must not contradict v2.
- Issue tracking: `bd` (beads). Workflow notes in [[meta/conventions]].

## Recent Changes
- Created: full wiki structure (see [[log]] for the entry list).
- Updated: `CLAUDE.md` with minimal wiki-maintenance pointer.
- Configured: MCP `obsidian-vault` (filesystem) at user scope. CSS snippet `.obsidian/snippets/vault-colors.css` enabled.

## Active Threads
- Implementation has not started yet — wiki captures spec + plans, not running code.
- Open question: is `obsidian-cli` (>=v1.12) available in this Obsidian install? Currently using filesystem MCP (no plugin needed).
