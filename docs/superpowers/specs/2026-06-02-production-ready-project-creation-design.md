# Production-ready project creation — design

- **Date:** 2026-06-02
- **Status:** Approved (ready for `bd` task breakdown)
- **Area:** `apps/web` (Add Project wizard) + `backend/app` (new Project domain)
- **Scope:** Full-stack. Make the 5-step Add Project wizard provision a real project: a real agent Google account (offline OAuth), Jira/Notion tokens, and member selection from existing users.

## 1. Context

Today the Add Project wizard (`apps/web/components/screens/projects/`) is 100% mock:
`onCreate` just `setTimeout`s and redirects. The backend has **no** `Project`
model and **no** projects router — only `auth.py`. Building blocks that already
exist and will be reused:

- `app/oauth.py` — `GoogleOAuthClient` (authorization-code flow, injectable for tests).
- `app/models/integration.py` — `EncryptedString` Fernet column type for secrets at rest.
- `app/security/crypto.py` — Fernet key derivation, configured at startup.
- `app/routers/auth.py` — the working Google login flow + CSRF-state cookie pattern.
- `apps/web/lib/auth.ts` — JWT in `localStorage["kabanchik.token"]`, `API_BASE`.

The config (`app/config.py`) already marks the Google **service-account /
domain-wide-delegation** path as deferred ("needs Workspace admin"), so the
realistic production path is **OAuth offline + refresh token from the agent's own
Google account**.

## 2. Decisions (confirmed with user)

1. **Depth:** full-stack now (build the backend Project foundation too).
2. **Google = production-ready** via **OAuth offline**: the agent account
   `telecom.scrum.agent@municorn.com` signs in *as itself*, consents to Calendar,
   and we store its **refresh token** (Fernet-encrypted), per-project. Service
   account / DWD stay deferred. **The agent account exists and can consent now**,
   so this is end-to-end testable. **Google authorization is required** — no
   project is created without it.
3. **Calendar scope:** read + write events (`calendar.events`).
4. **Jira/Notion tokens:** pasted by the user and **live-validated** (a "Test
   connection" call). **Each step is skippable** — if provided, the token must
   validate; integrations can also be added later in Settings.
5. **Members:** multi-select from **existing signed-in users** only (the `User`
   table). A selected user gets a `ProjectMember` row, so the project appears in
   their project list. (No email invites in this iteration.)

## 3. Non-goals / scope boundaries

- Not migrating the rest of the shell (project switcher `ActiveProjectProvider`,
  chat, meetings) off mock data — they keep using `lib/mock-data.ts`. Only the
  `/projects` **list page** reads real data so created/assigned projects appear.
  → `bd` follow-up to migrate the shell.
- No Alembic migration; schema bootstraps via the existing `init_db()` /
  `create_all` lifespan hook (consistent with current backend; Alembic is a
  separate filed follow-up).
- No Google Meet transcript ingestion (separate deferred concern — no Workspace admin).
- No email-invite / pending-user flow.

## 4. Data model (backend, new files under `app/models/`)

All models follow existing portability conventions: string-UUID PKs
(`UUIDPKMixin`), `Enum(native_enum=False)`, `DateTime(timezone=True)`,
`EncryptedString` for secrets.

### `Project` (`app/models/project.py`)
| column | type | notes |
|---|---|---|
| `id` | str UUID PK | |
| `owner_id` | FK → `users.id` | creator |
| `name` | str | required |
| `description` | str \| None | |
| `color` | str | hex swatch |
| `agent_email` | str | the authorized Google account |
| `google_connected` | bool | true once a refresh token is attached |
| `jira_site_url` | str \| None | |
| `jira_user_email` | str \| None | for Basic auth with the token |
| `jira_project_key` | str \| None | |
| `notion_section_url` | str \| None | raw pasted link |
| `notion_page_id` | str \| None | parsed 32-hex id |
| `created_at` / `updated_at` | tz datetime | `TimestampMixin` |

### `ProjectMember`
Composite PK `(project_id, user_id)`. `role`: `Member | Admin` (`native_enum=False`).
Owner is inserted as `Admin` at creation. "Project in member's list" = query
`ProjectMember` by `user_id`.

### `ProjectCredential` (1:1 with `Project` — secrets isolated)
`project_id` PK/FK; `google_refresh_token`, `jira_api_token`, `notion_token` — all
`EncryptedString` (nullable; only set when that integration is connected).

### `PendingOAuth` (bridge: authorize before the project row exists)
`id` (= `auth_session_id`, UUID), `user_id` FK, `provider` (`"google"`),
`account_email`, `refresh_token` (`EncryptedString`), `scopes`, `created_at`.
Created by the OAuth callback, **consumed once** at `POST /projects`, then deleted.
TTL: rows older than ~15 min are ignored/swept.

## 5. Backend flows

### 5.1 Google offline OAuth (popup + pending session)

Extend `GoogleOAuthClient.authorization_url` with optional `scopes`,
`access_type`, `prompt` params (defaults preserve the current login behavior — no
change to `/auth/google/start`). Agent scopes:
`openid email https://www.googleapis.com/auth/calendar.events`.

1. `POST /projects/integrations/google/start` (auth'd) → mints `auth_session_id`,
   pins a signed CSRF `state` (carrying user id + session id), returns
   `{ authorize_url, auth_session_id }` with `access_type=offline`, `prompt=consent`.
2. Frontend opens `authorize_url` in a **popup** (preserves wizard form state).
   User signs in **as the agent account** and consents.
3. `GET /projects/integrations/google/callback` verifies `state`, `exchange_code`
   → `refresh_token` + userinfo. Captures the authorized account email. Writes a
   `PendingOAuth` row. Returns a tiny HTML page that does
   `window.opener.postMessage({ source: "scrumagent-google-oauth", ok, authSessionId, email })`
   then `window.close()`.
4. Wizard's `message` listener marks Google connected and stores `authSessionId` +
   the confirmed email.
5. `POST /projects` requires a valid, unconsumed `authSessionId` owned by the
   current user → moves the refresh token into `ProjectCredential.google_refresh_token`,
   sets `google_connected = true`, deletes the `PendingOAuth`. Missing/invalid → `400`.

**Rejected alternatives:** create a draft project first (clutters DB with abandoned
drafts); full-page redirect + restore form state (fragile, loses in-memory state).

### 5.2 Jira / Notion validation
- `POST /projects/integrations/jira/test` — body `{site_url, user_email, api_token}`
  → Atlassian `GET {site_url}/rest/api/3/myself` with Basic `user_email:api_token`.
  Returns `{ ok, account?: {...}, error? }`.
- `POST /projects/integrations/notion/test` — body `{token}` →
  `GET https://api.notion.com/v1/users/me` with `Authorization: Bearer` +
  `Notion-Version`. Returns `{ ok, bot?: {...}, error? }`.
- Notion section URL → parse the trailing 32-hex id into `notion_page_id`.

### 5.3 Projects + users endpoints
- `GET /users/directory` (auth'd) → `[{ id, email, name }]` for the member picker.
- `POST /projects` (auth'd) → validates the google session (required); **for any
  provided Jira/Notion token, re-runs the §5.2 validation server-side and rejects
  creation (`422`) if it fails** — "if the keys are added, they must work" (not just
  the optional Test button). Tokens may still be omitted entirely (skippable).
  Creates `Project` + `ProjectCredential` + `ProjectMember` rows (owner as `Admin`,
  selected users as `Member`). Returns the project.
- `GET /projects` (auth'd) → projects where the current user is owner OR member.
- `GET /projects/{id}` (auth'd, membership-checked) → detail.

All new routers are mounted in `app/main.py` and protected by
`deps.get_current_user`.

## 6. Frontend (`apps/web`)

- **`lib/api.ts`** (new) — `apiFetch(path, opts)` attaching `Authorization: Bearer`
  from `getToken()`; typed helpers for the calls above.
- **Step 2 — Google** (`StepGoogle.tsx`): replace the read-only *generated* email
  with an editable input defaulting to `telecom.scrum.agent@municorn.com`. The
  "Authorize agent" button opens the OAuth popup; on `postMessage` success show the
  connected account. Required to continue past create.
- **Step 3 — Jira** (`StepJira.tsx`): add `user_email` + `api_token` fields (keep
  site URL + project key). "Test connection" calls the validate endpoint and shows
  the result. Skippable.
- **Step 4 — Notion** (`StepNotion.tsx`): add `token` field + **"Link to Notion
  section"** field (replaces the 3 hardcoded fake DB options). "Test connection".
  Skippable.
- **Step 5 — Select team members** (`StepInvite.tsx` → `StepMembers.tsx`): rename;
  fetch `/users/directory`; render a multi-select checkbox list (avatar + name +
  email + role select). Update the summary. Owner included implicitly.
- **`AddProjectWizard.tsx`**: rename step label `"Invite team"` → `"Select team
  members"`; wire `onCreate` to `POST /projects` (send agent email + auth session +
  jira/notion + member ids); redirect to `/projects?created=1` on success; surface
  errors.
- **`types.ts`**: extend `WizardFormData` (agent email, google auth session id,
  jira email/token, notion token/section url, `selectedUserIds`).
- **`/projects` page + `ProjectsList`**: read `GET /projects` (map backend project →
  view `Project` shape: `email ← agent_email`, `name`/`description` passthrough,
  defaults `status: "never_synced"`, `meetings: 0`, `pending: 0`, `lastSync: null`).

## 7. Security

- Refresh tokens + API tokens stored only via `EncryptedString` (Fernet at rest);
  never returned by any GET endpoint.
- OAuth `state` is signed/HMAC'd and single-use; `PendingOAuth` consumed once.
- Callback re-verifies the `@municorn.com` domain (reuse existing check).
- `postMessage` target origin pinned to the app origin; message `source` tag checked.
- All project endpoints require a valid JWT and enforce membership.

## 8. Testing (TDD — mandatory)

- **Backend (pytest):** inject a fake `GoogleOAuthClient` (existing pattern) to test
  start → callback → `PendingOAuth` write → consume-at-create; httpx-mock the Jira/
  Notion validate calls; project create/list/membership; assert tokens are encrypted
  at rest (raw DB value ≠ plaintext).
- **Frontend (Playwright):** mock backend routes + the OAuth popup `postMessage`
  (existing e2e mock pattern); cover the happy path, the "Google required" gate, the
  skippable Jira/Notion path, and member multi-select.

## 9. Prerequisites / handoff (user, in Google Cloud Console)

- Add the `https://www.googleapis.com/auth/calendar.events` scope to the OAuth
  consent screen.
- Register the popup redirect URI `{backend_base_url}/projects/integrations/google/callback`.
- Ensure `telecom.scrum.agent@municorn.com` can sign in and grant consent.

## 10. Phased implementation (→ `bd` epic + issues)

1. **Models** — `Project`, `ProjectMember`, `ProjectCredential`, `PendingOAuth` (+ register in `models/__init__.py`).
2. **Google offline OAuth** — extend `GoogleOAuthClient`; `start` + `callback` endpoints; `PendingOAuth` lifecycle.
3. **Jira/Notion validate** — two `*/test` endpoints.
4. **Projects + users API** — `POST/GET /projects`, `GET /projects/{id}`, `GET /users/directory`; mount routers.
5. **Frontend** — `lib/api.ts`; rewire all 5 steps; `onCreate`; `/projects` list reads real data.
6. **Tests + docs** — backend pytest, frontend e2e; wiki page(s) for the Project domain + decision; bd follow-ups (shell off-mock, Alembic).

## 11. Acceptance criteria

- Creating a project requires a successful agent Google authorization (offline,
  refresh token persisted encrypted); skipping it blocks creation.
- Step 2 asks for a real, editable agent email defaulting to
  `telecom.scrum.agent@municorn.com`.
- Jira and Notion accept pasted tokens, validate them on "Test connection", and are
  individually skippable; Notion also captures a section link parsed to a page id.
- Step 5 is titled "Select team members" and selects from existing users; selected
  users see the project in their `/projects` list.
- All secrets are encrypted at rest; backend + frontend tests pass.

## 12. Open follow-ups (file in `bd`)

- Migrate the shell (project switcher, chat, meetings) off `mock-data.ts` to the real `/projects` data.
- Alembic migrations (pre-existing follow-up; now also covers the new tables).
- Email-invite / pending-user flow for members who haven't signed in yet.
