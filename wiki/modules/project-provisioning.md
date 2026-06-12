---
type: module
title: "Project Provisioning"
path: backend/app/routers/projects.py
status: active
created: 2026-06-02
updated: 2026-06-12
tags: [module, backend, projects, oauth, integrations]
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
- **`ProjectMember`** — composite PK `(project_id, user_id)`, `role` ∈ {`member`,`admin`}. The owner is inserted as `admin`; a member row is what makes a project show up in someone's list.
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
| `POST /projects/integrations/jira/test` | validate a Jira site + token |
| `POST /projects/integrations/notion/test` | validate a Notion token |
| `POST /projects` | provision (Google required; Jira/Notion validated if present) |
| `GET /projects` | projects the caller is a member of (owner included) |
| `GET /projects/{id}` | detail; `404` for non-members |
| `GET /users/directory` | selectable members |
| `GET /projects/{id}/integrations` | real per-project status (member-only, never secrets) |
| `PUT /projects/{id}/integrations/jira` | replace Jira creds — live-validated, `422` on failure |
| `PUT /projects/{id}/integrations/notion` | replace Notion creds — live-validated, `422` on failure |
| `PUT /projects/{id}/integrations/google` | reconnect agent account from a `PendingOAuth` grant |
| `POST /projects/{id}/integrations/{provider}/test` | probe the **stored** creds (`google`/`jira`/`notion`); `409` if unconfigured |

All are protected by `get_current_user` except the callback (identity rides in the signed `state`).

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

## Related

- [[modules/auth]] — reuses the Google OAuth client + Fernet crypto + JWT.
- [[domains/backend]] §Persistence — portability conventions these models follow.
- [[entities/google-workspace]], [[entities/jira]], [[entities/notion]].
- Members select from existing [[modules/auth]] users only (no email invites yet — `bd` follow-up).
