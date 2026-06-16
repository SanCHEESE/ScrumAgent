---
type: module
title: "Project Provisioning"
path: backend/app/routers/projects.py
status: active
created: 2026-06-02
updated: 2026-06-16
tags: [module, backend, projects, oauth, integrations, billing]
---

# Project Provisioning

End-to-end creation of a **Project** — the bundle of an agent Google Workspace
account, Jira, Notion, and the team members who can see it. Backs the Add Project
wizard ([[domains/frontend]]). Shipped in `ScrumAgent-lb9`.

## Code

| File | Role |
|---|---|
| `app/models/project.py` | `Project`, `ProjectMember`, `ProjectCredential`, `PendingOAuth` |
| `app/routers/projects.py` | create/list/detail + per-project integration endpoints |
| `app/routers/users.py` | `GET /users/directory` (member picker) |
| `app/integrations.py` | `IntegrationValidators` (Jira/Notion live checks) + `parse_notion_page_id` |
| `app/oauth.py` | `GoogleOAuthClient` extended with offline scopes/`access_type`/`prompt` + `AGENT_SCOPES` |
| `app/security/_state.py` | signed, short-lived OAuth `state` tokens |

## Data model

- **`Project`** — owner, name, description, color, `agent_email`, `google_connected`, Jira fields (`jira_site_url`/`jira_user_email`/`jira_project_key`), Notion fields (`notion_section_url`/`notion_page_id`).
- **`ProjectMember`** — composite PK `(project_id, user_id)`, `role` ∈ {`viewer`,`member`,`admin`}. The owner is inserted as `admin`; a member row is what makes a project show up in someone's list.
- **`ProjectCredential`** — 1:1 with `Project`; `google_refresh_token`/`jira_api_token`/`notion_token`, each `EncryptedString` (Fernet at rest). Secrets never live on `Project` and are never returned by any endpoint.
- **`PendingOAuth`** — one-shot bridge: the agent Google grant captured *before* the project row exists, consumed (and deleted) at create.

## Agent Google offline-OAuth (the production-ready path)

Service-account / domain-wide delegation stay deferred (no Workspace admin), so the
agent authorizes its **own** account. See [[decisions/2026-06-02-agent-google-offline-oauth]].

1. `POST /projects/integrations/google/start` (auth'd) mints `auth_session_id`, signs a
   `state` carrying `{sid, uid}`, and returns an `access_type=offline`,
   `prompt=consent`, Calendar-scoped (`calendar.events`) authorize URL.
2. The wizard opens it in a **popup** (preserves form state). Someone signs in *as the
   agent account* and consents.
3. `GET /projects/integrations/google/callback` verifies the signed `state`, exchanges
   the code for a **refresh token**, enforces the `@municorn.com` agent domain (+
   `email_verified`), writes a `PendingOAuth`, and returns an HTML page that
   `postMessage`s the result back to the wizard. Since the OAuth audit (ScrumAgent-imt,
   2026-06-12) **every failure also renders that popup page** (`ok=false` +
   `error∈{wrong_domain, no_refresh_token, exchange_failed, access_denied, missing_code}`)
   — a raised JSON error would never `postMessage` and left the wizard stuck on
   "Waiting…". A grant without a refresh token is rejected up front; a replayed/refreshed
   callback is idempotent (no duplicate-PK 500). `StepGoogle.tsx` additionally polls
   `popup.closed`, so a manually closed popup resets the button with an error.
4. `POST /projects` requires a valid, unconsumed `auth_session_id` owned by the caller →
   moves the refresh token into `ProjectCredential`, deletes the `PendingOAuth`. Missing
   → `400` (Google is a hard gate).
5. After the popup grant but before project creation, the wizard can call
   `GET /projects/integrations/google/meeting-participants?auth_session_id=...`.
   The backend lists the pending agent calendar, dedupes organizer/attendee emails,
   skips cancelled events and the agent account itself, and returns lightweight
   suggestions with `event_count`. The frontend preloads this while the user is on
   Jira/Notion steps.

## Jira / Notion validation

`IntegrationValidators` hits Atlassian `GET /rest/api/3/myself` (Basic `email:token`) and
Notion `GET /v1/users/me` (Bearer + `Notion-Version`). The `/test` endpoints power the
wizard's "Test connection". At create, **any provided token is re-validated server-side
and rejected with `422` if it fails** — "if the keys are added, they must work". Both
integrations are otherwise skippable. The Notion section link is parsed to a page id via
`parse_notion_page_id` (trailing 32-hex of the last path segment).

## API

| Method · Path | Purpose |
|---|---|
| `POST /projects/integrations/google/start` | begin agent offline-OAuth |
| `GET /projects/integrations/google/callback` | exchange code → `PendingOAuth` (popup `postMessage`) |
| `GET /projects/integrations/google/meeting-participants` | preview deduped organizer/attendee emails from the pending Google grant |
| `POST /projects/integrations/jira/test` | validate a Jira site + token |
| `POST /projects/integrations/notion/test` | validate a Notion token |
| `POST /projects` | provision (Google required; Jira/Notion validated if present; `members[]` may set `admin`/`member`/`viewer`) |
| `GET /projects` | projects the caller is a member of (owner included) |
| `GET /projects/{id}` | detail; `404` for non-members |
| `GET /users/directory` | selectable members |
| `GET /projects/{id}/integrations` | real per-project status (member-only, never secrets) |
| `PUT /projects/{id}/integrations/jira` | replace Jira creds — live-validated, `422` on failure |
| `PUT /projects/{id}/integrations/notion` | replace Notion creds — live-validated, `422` on failure |
| `PUT /projects/{id}/integrations/google` | reconnect agent account from a `PendingOAuth` grant |
| `POST /projects/{id}/integrations/{provider}/test` | probe the **stored** creds (`google`/`jira`/`notion`); `409` if unconfigured |
| `GET /projects/{id}/billing` | current-cycle usage aggregation from `llm_usage` (member-only) |

All are protected by `get_current_user` except the callback (identity rides in the signed `state`). Access to a specific project is centralized in **one** FastAPI dependency, `require_project_access` (ScrumAgent-1yf), which resolves a `{project_id}` path param to a `Project` or raises `404` — every `/{project_id}/…` endpoint depends on it instead of re-threading `settings` through a per-route helper, so a new endpoint inherits the rule automatically. The `agent_preview` "see all projects" bypass has a single source of truth, the `can_access_all_projects` dependency (wraps `is_agent_preview`), consulted by **both** `require_project_access` and `list_projects` (no two bypass implementations to keep in sync). In `APP_ENVIRONMENT=production`, project reads/writes stay member-only. In `APP_ENVIRONMENT=agent_preview`, `get_current_user` supplies the local fake dev user (`dev@municorn.com` / `dev-sub`) when no bearer is present and `can_access_all_projects` returns true, so Codex/agent preview sessions can inspect the whole local dataset without borrowing a real user's token. Do not run `agent_preview` in shared or real deployments.

## Settings → Integrations (post-provisioning, ScrumAgent-d9q, 2026-06-12)

`/settings → Integrations` is live (was a hardcoded mock): project picker, real
Connected/Not-connected badges from `GET /{id}/integrations`, inline configure forms
(Jira 4-field / Notion token+URL, "Validate & save" = the PUT), and per-card **Test**
buttons probing the *stored* credentials. The Google **Test** runs a 1-event calendar
probe; `invalid_grant` flips `google_connected=false` (and a later successful probe
flips it back). **Reconnect** reuses the wizard popup handshake, then
`PUT /{id}/integrations/google` consumes the staged `PendingOAuth` — closing the loop
with the meetings endpoint's 409 "reconnect the agent account". Status responses carry
booleans + non-secret fields only. OpenAI/Slack mock cards were dropped (OpenAI key is
server-side config; Slack doesn't exist yet).

## Settings → Billing (ScrumAgent-307, 2026-06-12)

`/settings → Billing` is live (was a hardcoded mock). New `llm_usage` table
(`app/models/usage.py`): one row per provider call — `project_id`, `run_id`
(groups calls of one agent invocation), `context` (human label, e.g. meeting
title), `provider`, `model`, `kind` (`llm`/`stt`/`embed`), `category`
(orchestrator/subagents/whisper/embeddings/storage, free-form string),
`input_units`/`output_units` (M tokens or STT minutes), `cost_usd`.
**The LLM gateway ([[modules/llm-gateway]], `ScrumAgent-wqj`) must write these
rows** — until it lands, real projects show honest zeros/empty states.

`GET /projects/{id}/billing` aggregates the current calendar month in Python
(small row volume; sidesteps SQLite/Postgres timestamp quirks): cycle MTD +
linear projection (`mtd / days_elapsed × days_in_month`), per-category costs,
per-model usage with a 10-day daily-cost sparkline series, and the 6 most
recent invocations grouped by `run_id` (rows without one stand alone). No
budget field exists anywhere yet, so the UI shows spent-vs-projected instead
of a budget bar.

Frontend: `BillingSection.tsx` (project picker + fetch), props-driven
`BillingSummary`/`CostBreakdown`/`UsageByModel`/`RecentInvocations`,
category label/colour map in `billing-format.ts`. `ApiKeysTable` and
`billing-mock.ts` deleted (keys are server config, never per-user). Dev seed:
`backend/.local/_seed_billing.py`.

## Related

- [[modules/auth]] — reuses the Google OAuth client + Fernet crypto + JWT.
- [[domains/backend]] §Persistence — portability conventions these models follow.
- [[entities/google-workspace]], [[entities/jira]], [[entities/notion]].
- Project creation member suggestions now come from signed-in users whose emails
  appear in pending Google meeting participants, plus fixed fallbacks
  `dev@municorn.com` and `a.bochkarev@municorn.com`; arbitrary directory users
  are no longer suggested. Members still select from existing [[modules/auth]]
  users only (no email invites yet — `bd` follow-up).
