---
type: meta
title: "Flows"
created: 2026-05-10
updated: 2026-06-17
tags: [meta, index, flow]
---

# Flows

Pipelines and sequences across the system.

- [[meeting-processing]] — meeting → analysis → RAG → optional Jira/Notion
- [[chat]] — user question → RAG → optional live context → answer
- [[backlog-ingestion]] — project create → Jira/Notion fetch → LightRAG index
- [[oauth-login]] — Google OAuth callback → JWT
- [[gcp-deployment-topology]] — connectivity diagram for the Compute Engine deployment
