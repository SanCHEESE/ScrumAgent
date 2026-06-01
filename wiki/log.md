---
type: meta
title: "Wiki Log"
created: 2026-05-10
updated: 2026-05-22
tags: [meta, log]
---

# Wiki Log

Append-only chronological record. Newest entries on top. Never edit past entries.

---

## 2026-05-22 save — GCP deployment topology diagram

Added [[flows/gcp-deployment-topology]] — Mermaid connectivity diagram showing the full GCP deploy: edge plane (Cloud DNS → Static IP → Caddy/TLS), in-VM service plane (frontend + backend container with DeepAgents orchestrator and three agents), state plane (SQLite + RAG-Anything on persistent SSD), GCP control plane (Secret Manager, daily snapshots), and external integrations (OpenAI, Atlassian Rovo, Notion MCP, Google OAuth/Calendar/Meet). Linked from [[flows/_index]], top-level [[index]], and [[domains/deployment]]. No architecture change — purely a visual synthesis of what was decided on 2026-05-18.

---

## 2026-05-18 — Rovo replaces Jira MCP + GCP Compute Engine deploy target

Two scope changes landed simultaneously, both driven by user directive:

**1) Jira moves off MCP to Atlassian Rovo.** A new module [[modules/rovo-client]] replaces the Jira side of [[modules/mcp-clients]]; the latter is now Notion-only. The `jira_notion` agent gains Rovo AI capabilities (cross-Jira search, summarization, generated update text, Rovo Agent invocation). Notion stays on MCP. Capability boundary in [[domains/agents]] is unchanged. New ADR: [[decisions/2026-05-18-rovo-replaces-jira-mcp]]. Env shift: `ATLASSIAN_MCP_URL` / `ATLASSIAN_API_TOKEN` → `ROVO_BASE_URL` / `ROVO_API_TOKEN` / `ATLASSIAN_SITE_URL` / `ATLASSIAN_USER_EMAIL`.

**2) GCP deployment target = single Compute Engine VM.** Local Docker Compose stays canonical. Cloud target lifts-and-shifts the same compose stack onto a GCE VM with a 100 GB persistent SSD at `/opt/scrumagent/data/`. Caddy fronts ports 8000/3000 with auto Let's Encrypt. Secrets via Secret Manager. Daily disk snapshots. No backend code change required — SQLite + RAG-Anything keep their filesystem assumptions. Cloud Run was considered and rejected (would force Postgres + GCS migration). New ADR: [[decisions/2026-05-18-gcp-compute-engine-deployment]].

**Wiki updates:** new pages [[modules/rovo-client]], [[entities/atlassian-rovo]], two ADRs. Edited [[modules/mcp-clients]] (Notion-only), [[concepts/mcp]] (Notion-only), [[entities/jira]] (access via Rovo), [[domains/integrations]] (env block + Rovo section), [[domains/deployment]] (full GCE deploy section + env reference + rollout phase), [[domains/agents]] (`jira_notion` transport split), indexes for modules / decisions / entities, top-level [[index]].

**Beads:** updated `ScrumAgent-ilz` (Notion-only scope), `ScrumAgent-2u9` (Rovo + Notion transport), `ScrumAgent-7we` (prereqs: Rovo + GCP creds). New issues for Rovo client module and GCE Terraform/provisioning.

---

## 2026-05-10 — Frontend implementation kickoff (Next.js 14 + 8 screens)

First running code lands. The Kabanchik design prototype (HTML/JSX bundle exported from claude.ai/design — ScrumAgent-h-QdelD4EXia08CypPVGrU2g) has been ported to a Next.js 14 + TypeScript app at `apps/web/`. Layout: 9 routes (`/`, `/chat`, `/meetings`, `/meetings/[id]`, `/updates`, `/trace`, `/projects`, `/projects/new`, `/settings`, `/login`).

Approach: decomposed into 10 beads issues (foundation + 8 screens + tweaks panel), executed via 1 sequential agent for the foundation, then 9 parallel agents in isolated git worktrees for each screen, then 9 parallel code-review agents, then 1 agent for Playwright UI tests. All work merged to `main`, build passes, 38 Playwright tests green.

Design system: CSS variables (royal blue `#0077e6`, warm stone neutrals, Inter), light/dark themes, three densities (compact/cozy/comfortable), three home layout variants (split/focused/classic), runtime tweaks panel (theme, accent hue, fonts, density, layout) backed by `localStorage`. Mocks in `apps/web/lib/mock-data.ts`; no backend wired.

Open follow-ups in `bd-d5g` (deferred review feedback: a11y on home rows, projects toast auto-dismiss, settings sparkline memo, css de-dup, etc.).

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
