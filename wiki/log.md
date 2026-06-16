---
type: meta
title: "Wiki Log"
created: 2026-05-10
updated: 2026-06-16
tags: [meta, log]
---

# Wiki Log

Append-only chronological record. Newest entries on top. Never edit past entries.

## 2026-06-16 — Split preview and production environments (ScrumAgent-byz)

Added an explicit runtime boundary for Codex/agent preview vs real use.
Backend `Settings.app_environment` accepts `production` (default) or
`agent_preview`. Real OAuth JWTs now carry an `env` claim; `get_current_user`
rejects missing/wrong-environment tokens, still 401s in production without a bearer, and
only in `agent_preview` resolves a local preview principal without a bearer.
Project access is still member-only in production, while preview can list/read all
local projects without reusing a real user's token.

Frontend `NEXT_PUBLIC_APP_ENVIRONMENT` mirrors the backend mode. JWTs moved from
the old shared `localStorage["kabanchik.token"]` key into
`kabanchik.production.token` or `kabanchik.agent_preview.token`; storing a new
token clears foreign/legacy keys. The login page shows an explicit preview entry
point, while the sidebar resolves `/auth/me` without bearer in preview and shows
the local fake dev user (`Dev User`, `dev@municorn.com`). `RecentMeetingsLive`
can fetch in preview without requiring a decodable bearer. Config docs and
Compose env forwarding were updated; frontend scripts now include `dev:preview`
and `dev:production`.

Verification: watched RED for backend env-claim/preview-access tests and the
frontend token namespace regression, then green. Full backend pytest green,
`npm --prefix apps/web run typecheck` green, and auth-related Playwright suite
(`login`, `auth`, `home`, `meetings`, `settings`) 34/34 green.

## 2026-06-16 — Live Home Recent meetings (ScrumAgent-0i6)

Home's **Recent meetings** card no longer renders `MEETINGS.slice(0, 3)` from
`apps/web/lib/mock-data.ts`. New `RecentMeetingsLive` loads `GET /projects` and
then each project's `GET /projects/{id}/meetings`, merges the returned Google
Calendar events, sorts by event start descending, and renders the newest three
with real date/month, attendee count, duration, project name, and Scheduled/Past
pills. Rows open the Google Calendar `html_link` when available; otherwise they
fall back to `/meetings`. Empty/error/loading states are local to the card, and
the existing Home layout variants all reuse the same live component. The widget
skips the calendar fetch when no decodable bearer JWT exists, preserving the
unauthenticated shell/tweaks views instead of letting optional calendar loading
redirect the whole page to `/login`. Added a
Playwright regression that mocks calendar events and asserts the old `Daily
Standup` mock row is gone. Verification: RED watched, then `home.spec.ts` green,
`tsc --noEmit` green, and in-app browser checked against the running local app
showing real calendar rows with no console errors.

## 2026-06-15 — Live /settings Members tab (ScrumAgent-l5p)

Reviewed the current project settings surface. Agent behavior (`ScrumAgent-7qy`),
Integrations (`ScrumAgent-d9q`), and Billing (`ScrumAgent-307`) were already live.
`/settings → Members` was still hardcoded mock data; it now loads real projects
through the existing API, lets the user pick a project, and renders that
project's returned member list with names, emails, roles, and honest empty/error
states. Added a focused Playwright regression for project switching. Remaining
mock-only settings tabs were filed separately: Knowledge base (`ScrumAgent-sxm`)
and Notifications (`ScrumAgent-0r1`). Also filed `ScrumAgent-n60` for the invalid
`.gitignore` pattern that makes `rg` print parse errors.

## 2026-06-12 — Live /settings Billing tab (ScrumAgent-307)

`/settings → Billing` is no longer a hardcoded mock. New `llm_usage` table
(`app/models/usage.py`): one row per provider call (project, `run_id` grouping
an agent invocation, `context` label, provider/model/kind/category, units,
`cost_usd`) — designed for the LLM gateway (`ScrumAgent-wqj`) to write into;
until it lands real projects show honest zeros. New member-only
`GET /projects/{id}/billing` aggregates the current calendar month in Python:
MTD + linear projection, per-category costs, per-model usage with 10-day
sparkline series, 6 most recent run-grouped invocations. Frontend
`BillingSection` rewritten: project picker, live fetch, empty states;
`ApiKeysTable` + `billing-mock.ts` deleted (no fake API keys / invoices /
budget — no budget config exists, so the hero bar is spent-vs-projected).
Playwright billing specs now mock `/billing`; `mockSettingsApi` gained default
routes for live tabs so nav clicks never leak requests to a real backend.
Dev seed: `backend/.local/_seed_billing.py`. 9 new pytest (131 total green),
58 Playwright green, verified live against seeded dev data.

## 2026-06-12 — Live /settings Integrations tab (ScrumAgent-d9q)

`/settings → Integrations` is no longer a hardcoded mock (fake OpenAI/Slack cards,
fake Jira sites). New member-only endpoints: `GET /projects/{id}/integrations`
(real google/jira/notion status, never secrets), `PUT …/integrations/jira|notion`
(live-validated then saved — 422 leaves stored creds untouched),
`PUT …/integrations/google` (reconnect: consumes a staged `PendingOAuth`, updates
agent_email + refresh token — finally a recovery path for the meetings 409),
`POST …/integrations/{provider}/test` (probes the *stored* creds; google = 1-event
calendar probe that flips `google_connected` on revoked/restored grants; 409 when
unconfigured). Frontend `IntegrationsSection` rewritten: project picker, real
badges, inline Jira/Notion configure forms with "Validate & save", per-card Test
buttons, Google Reconnect popup (same handshake as the wizard's StepGoogle).
OpenAI/Slack mocks dropped with an honest note. Tests: 23 new pytest (122 green),
4 new e2e (58 green), tsc clean; verified live against dev.db — stored Jira and
Google probes both returned "Connection works" against the real services.

## 2026-06-12 — Real per-project Agent behavior settings (ScrumAgent-7qy)

`/settings → Agent behavior` is no longer local mock state. New
`project_agent_settings` table (1:1 with Project, lazily created — no row means
defaults) holding auto-join / record-audio / capture-screenshots /
confidence-threshold / auto-apply / response-style (enum concise|balanced|detailed)
/ context-window-meetings. New endpoints `GET/PUT
/projects/{id}/settings/agent` (member-only 404 otherwise, PUT = validated full
replace upsert, GET serves defaults when unset). Frontend
`AgentBehaviorSection` now has a project picker, loads settings per project, and
debounce-autosaves every change (600 ms) with a Saving…/Saved/error indicator.
Tests: 14 new pytest (99 green total), settings e2e rewritten with API stubs + 3
new sync tests (54 e2e green), tsc clean, verified live (toggle + select persisted
to dev.db across reloads).

## 2026-06-12 — Live meetings/pending counts on project cards (ScrumAgent-0dx)

`/projects` tiles no longer hardcode `meetings: 0, pending: 0`. `ProjectsListLive`
now fetches each project's agent calendar (`GET /projects/{id}/meetings`, same
endpoint the `/meetings` page uses) after the project list renders: *meetings* =
events in the default window, *pending* = the upcoming subset. Per-project calendar
failures (revoked grant, upstream error) leave that card's counts at zero without
breaking the grid. Covered by two new Playwright tests in `projects.spec.ts`
(counts from a mocked calendar; 409 degrades gracefully). 51 e2e green, tsc clean,
verified live (eSIM card: 20 meetings / 14 pending). `last sync` still shows "—" —
nothing is persisted/synced yet.

## 2026-06-12 — OAuth audit fixes + live calendar meetings (ScrumAgent-imt, ScrumAgent-m5x)

Audited both Google OAuth flows and fixed: consent-cancel no longer 422s (login
callback now 302s to `/login?error=<code>`, rendered as an alert); `email_verified`
required in both callbacks; agent-flow callback renders the `postMessage` popup on
*every* failure (`wrong_domain`, `no_refresh_token`, `exchange_failed`) instead of raw
JSON that left the wizard stuck on "Waiting…"; replayed callback idempotent;
`get_current_user` 401s on non-numeric `sub` and rejects `purpose`-claim (state) JWTs;
CORS origin from `Settings` (.env honored); `StepGoogle` polls `popup.closed`. Then
shipped the first **live calendar read path**: `app/google_calendar.py`
(refresh-token → `events.list`, injectable) + member-only
`GET /projects/{id}/meetings` (409 revoked / 502 upstream), and `/meetings` now renders
real agent-calendar events across all projects (Upcoming/Past tabs, Meet badge,
Google-Calendar deep links) instead of mock data. Updated [[modules/auth]],
[[modules/project-provisioning]], [[modules/calendar-sync]]. Backend 85 tests green,
47 Playwright e2e green, verified live (incl. real `invalid_grant` → reconnect alert).

---

## 2026-06-04 — Real auth identity in the sidebar + graceful session expiry (ScrumAgent-9pf)

Frontend-only. The sidebar-footer user chip is now `components/shell/UserMenu.tsx` and reflects the **real** signed-in user (name + initials avatar from `/auth/me`, JWT `email` claim as an instant label) instead of the hard-coded mock `alice`; clicking it opens a Sign out menu, and with no token it offers Sign in → `/login`. The API client (`apps/web/lib/api.ts`) now treats **any 401 as an expired/invalid session**: it clears `localStorage["kabanchik.token"]` and redirects to `/login` rather than surfacing a dead "Invalid or expired token" — which is exactly what was breaking the **Projects** page for users whose earlier login had expired. `UserMenu` validates via `/auth/me` on mount, so expired sessions bounce to login on app load, not only on Projects. Added `tests/e2e/auth.spec.ts` (4 cases) and repaired the stale `login.spec.ts` sign-in test (it now asserts hand-off to the backend OAuth start rather than the old mock route-to-home). **44/44 Playwright e2e green, tsc clean.** Verified live against the running backend (minted dev token → real name + Sign out; bogus token → `/projects` redirects to `/login`, no error). See [[modules/auth]] → *Frontend session*.

---

## 2026-06-02 — Production-ready project creation, full-stack (ScrumAgent-lb9)

Shipped the Add Project wizard end-to-end on branch `feat/project-creation-lb9` (TDD; **71 backend pytest + 5 Playwright e2e green**). New backend **Project domain** ([[modules/project-provisioning]]): `Project`, `ProjectMember` (composite PK + role), `ProjectCredential` (1:1, Fernet-encrypted secrets), `PendingOAuth` (one-shot bridge). The agent's Google account is authorized via **offline OAuth** (refresh token, `calendar.events`) — service account / domain-wide delegation stay deferred (no Workspace admin); see [[decisions/2026-06-02-agent-google-offline-oauth]]. Consent runs in a **popup** (preserves wizard state) bound by a signed `state` JWT (`security/_state.py`); the callback writes a `PendingOAuth` and `postMessage`s the result back; `POST /projects` consumes it (Google is a hard gate). Jira/Notion tokens are pasted, live-validated (`app/integrations.py` — Atlassian `/myself` + Notion `/users/me`), **re-validated server-side at create (422)** when present and otherwise skippable; the Notion section link is parsed to a page id. Members are selected from existing users (`GET /users/directory`); a `ProjectMember` row is what makes a project appear in their list.

**Frontend** ([[domains/frontend]]): `apps/web/lib/api.ts` (Bearer `apiFetch`), all five wizard steps rewired, "Invite team" → **"Select team members"**, `/projects` list reads real data via `ProjectsListLive`. Browser- and e2e-verified the agent-email default (`telecom.scrum.agent@municorn.com`), the Google gate, and the create POST.

**Decisions:** secrets isolated in a 1:1 `ProjectCredential` (not on `Project`); `agent_email` comes from the consented account, not the client; the shell project-switcher/chat/meetings deliberately stay on mock data (scoped out). **Prerequisite:** register the `calendar.events` scope + the `{backend}/projects/integrations/google/callback` redirect URI in the Google Cloud console. **Follow-ups:** migrate the shell off mock (extends `ScrumAgent-r0k`), Alembic for the 4 new tables (`ScrumAgent-soe`), email-invite flow for not-yet-signed-in members. Design spec: `docs/superpowers/specs/2026-06-02-production-ready-project-creation-design.md`.

---

## 2026-06-01 — Local Docker daemon moved to Colima (no Docker Desktop)

The local stack no longer depends on Docker Desktop. macOS has no native Docker daemon, so the canonical `docker compose up --build` now runs against **Colima** (Lima VM on Apple Virtualization.framework `vz`, with `virtiofs` bind mounts). The `docker` CLI plus the `compose`/`buildx` plugins were reinstalled from Homebrew (`/opt/homebrew/bin` precedes the old `Docker.app` symlinks in `PATH`), so they no longer belong to Desktop. `"credsStore": "desktop"` was removed from `~/.docker/config.json` — otherwise `docker` shells out to the Desktop credential helper and even anonymous pulls of public images break once Desktop is gone.

Verified end-to-end with Docker Desktop **fully quit**: `colima start --cpu 6 --memory 8 --disk 60 --vm-type vz --mount-type virtiofs` → `colima` docker context active → `docker compose up --build backend` builds and runs → `GET /health` returns `200 {"status":"ok"}`, container reports healthy, in-container pytest all green. Desktop was not uninstalled (left dormant; only the root `vmnetd` helper lingers, harmless). Setup documented in [[domains/deployment]] ("Local Docker daemon") and the `docker-compose.yml` header. Tracked as `ScrumAgent-2s3`.

---

## 2026-06-01 — Auth landed: Google OAuth login + JWT (ScrumAgent-u2b)

First authenticated slice. TDD'd Google OAuth 2.0 login restricted to `@municorn.com`, issuing a backend-signed JWT. New module [[modules/auth]] = `app/oauth.py` (`GoogleOAuthClient`: pure consent-URL builder + httpx code-exchange + userinfo — injectable so tests fake it), `app/security.py` (HS256 create/decode over `SECRET_KEY`, 24h `jwt_ttl_hours`), `app/routers/auth.py` (`/auth/google/start` → 307 consent with CSRF `state` cookie; `/auth/google/callback` → state-check 400, code exchange, `hd`/email domain gate 403, upsert on `google_sub`, 302 to `{FRONTEND}/login#token=…`; `/auth/me`), and `deps.get_current_user` (bearer → `User`, else 401). Added a **minimal** `User` model (`app/models.py`) — full schema stays ScrumAgent-67j (noted there). `main.py` now includes the router, adds CORS for the frontend origin, and creates tables in a lifespan hook (`Base.metadata.create_all`, no Alembic yet).

**Decisions:** identity read from Google's **userinfo endpoint** (token already trusted via TLS+secret exchange) instead of local id_token verification → no `google-auth`, deps stay lean. JWT delivered to the SPA via **URL fragment** + `localStorage` (`kabanchik.token`), not a cross-origin cookie (dev is http `:3000`/`:8000` where `Secure`/`SameSite=None` is painful). Revisit httpOnly-cookie + CSRF for the https GCP deploy.

**Frontend** wired: `apps/web/lib/auth.ts` (`startGoogleLogin`, `consumeTokenFromHash`, token store) + the `/login` page now redirects to the backend and consumes the returned token.

**Verification:** 20 pytest green under `-W error` (3 security + 9 flow + 8 prior). Real-app smoke confirmed `/auth/google/start` builds a correct consent URL (real client id, `redirect_uri=localhost:8000/auth/google/callback`, `scope=openid email profile`, `hd=municorn.com`, state cookie). Browser preview confirmed the login page renders clean and the `#token=…` → `localStorage` + redirect-to-`/` path works. Closed u2b (`--force`; was graph-blocked by 67j, satisfied by the inline User). Follow-up ScrumAgent-sdc: attach the bearer token to the frontend API client + guard `(shell)` routes (depends on real routers 2jb).

---

## 2026-06-01 — Backend bootstrap landed; credentials wired on personal account

First backend code. Implementation started against `@municorn` **personal** accounts (personal Atlassian/Notion/Calendar, self-funded GCP) ahead of a later corporate migration.

**Credentials** (`ScrumAgent-7we`, advanced not closed): `.env` populated and validated green by a new `scripts/sanity_check.py` (standalone `uv` probe of OpenAI / Google OAuth / Atlassian / Notion). Model corrected to `gpt-5.4-mini` (the key cannot see `gpt-5.5-mini`/`gpt-4.1-mini`). Deferred: Google service-account + domain-wide delegation (no Workspace admin → blocks slice 3 meetings — see memory), full GCP deploy block. Notion will use a self-hosted MCP / direct REST with the static `ntn_` token, **not** the hosted OAuth endpoint.

**Bootstrap** (`ScrumAgent-9cg`): TDD'd `backend/` scaffold — `app/main.py` (`GET /health`), `config.py` (typed pydantic-settings, fail-fast on missing secrets), `database.py` (decoupled engine/session helpers + `Base`), `deps.py` (cached `get_settings`/`get_db`). 8 pytest green; `uvicorn` serves `/health` 200. `Dockerfile` + `docker-compose.yml` (backend :8000, frontend :3000 dev-mode, `./data` volumes). **Lean deps on purpose** — deepagents/raganything/google/mcp land with their own modules so the image always builds. Container build itself pending (Docker daemon was down). Follow-up filed for a production frontend Dockerfile.

**Build order** (user directive): jira_notion slice → RAG → orchestrator, value-first. Real dependency path still requires bootstrap → models → auth/llm → thin orchestrator → jira_notion.

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
