---
type: meta
title: "Wiki Log"
created: 2026-05-10
updated: 2026-05-10
tags: [meta, log]
---

# Wiki Log

Append-only chronological record. Newest entries on top. Never edit past entries.

---

## 2026-05-10 — Initial scaffold + migration

Vault scaffold for **Telecom Scrum Agent (Kabanchik)** project.

**Created:**
- Top-level: [[index]], [[overview]], [[hot]], [[meta/conventions]]
- Domains: [[domains/architecture]], [[domains/agents]], [[domains/backend]], [[domains/frontend]], [[domains/integrations]], [[domains/deployment]], [[domains/design]]
- Modules: [[modules/runtime-orchestrator]], [[modules/llm-gateway]], [[modules/rag]], [[modules/calendar-sync]], [[modules/mcp-clients]], [[modules/trace-store]]
- Decisions: [[decisions/2026-03-27-single-backend-container]], [[decisions/2026-03-27-three-agents-only]], [[decisions/2026-03-27-openai-only-llm]]
- Concepts: [[concepts/deepagents-runtime]], [[concepts/rag-anything]], [[concepts/mcp]], [[concepts/human-in-the-loop]]
- Entities: [[entities/municorn]], [[entities/google-workspace]], [[entities/jira]], [[entities/notion]], [[entities/openai]]
- Flows: [[flows/meeting-processing]], [[flows/chat]], [[flows/oauth-login]]
- Sources: [[sources/concept]], [[sources/tech-architecture]], [[sources/mvp-plan]], [[sources/mvp-v2-plan]], [[sources/kabanchik-ui-plan]], [[sources/design-brief]], [[sources/google-stitch-prompts]]

**Migrated** (originals snapshotted into `.raw/migrated/`):
- `docs/specs/concept.md`
- `docs/specs/tech-architecture-local.md`
- `docs/plans/mvp.md`
- `docs/plans/mvp_v2.md`
- `docs/plans/2026-03-27-kabanchik-ui.md`
- `docs/stitch/design-brief.md`
- `docs/stitch/google-stitch-prompts.md`

**Setup:** `.obsidian/snippets/vault-colors.css` written. MCP server (`obsidian-vault`, MCPVault filesystem) configured at user scope.
