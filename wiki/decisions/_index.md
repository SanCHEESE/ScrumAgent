---
type: meta
title: "Decisions"
created: 2026-05-10
updated: 2026-06-02
tags: [meta, index, decision]
---

# Decisions

Architecture Decision Records (ADRs). Newest on top.

| Date | Decision | Status |
|---|---|---|
| 2026-06-02 | [[2026-06-02-agent-google-offline-oauth]] — agent Google via offline OAuth refresh token, not a service account | accepted |
| 2026-06-01 | [[2026-06-01-cloud-sql-postgres-prod-db]] — prod DB is Cloud SQL for PostgreSQL; SQLite local-only | accepted |
| 2026-05-18 | [[2026-05-18-gcp-compute-engine-deployment]] — GCP deployment target is a single Compute Engine VM | accepted |
| 2026-05-18 | [[2026-05-18-rovo-replaces-jira-mcp]] — Jira moves off MCP to Atlassian Rovo | accepted |
| 2026-03-27 | [[2026-03-27-single-backend-container]] — one Python container holds API + agents + RAG + Notion MCP | accepted |
| 2026-03-27 | [[2026-03-27-three-agents-only]] — exactly 3 agents with strict capability boundaries | accepted |
| 2026-03-27 | [[2026-03-27-openai-only-llm]] — OpenAI as the single LLM provider for MVP | accepted |
