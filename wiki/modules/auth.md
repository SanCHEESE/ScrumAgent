---
type: module
title: "Auth"
path: "backend/app/routers/auth.py"
language: python
status: active
created: 2026-06-01
updated: 2026-06-12
depends_on: []
used_by: []
tags: [module, auth, oauth, jwt]
---

# Auth (`routers/auth.py` + `security.py` + `oauth.py`)

Google OAuth 2.0 login restricted to `@municorn.com`, issuing a backend-signed
JWT used as a bearer token on every protected route. Implements
[[flows/oauth-login]] (ScrumAgent-u2b).

## Pieces

| File | Role |
|---|---|
| `app/oauth.py` | `GoogleOAuthClient` — builds the consent URL (pure), exchanges the code, reads userinfo. Injectable so tests fake it (no network). |
| `app/security.py` | `create_access_token` / `decode_access_token` — HS256 over `SECRET_KEY`, 24h TTL (`jwt_ttl_hours`). |
| `app/routers/auth.py` | The three endpoints below. |
| `app/deps.py` | `get_google_oauth` (factory) + `get_current_user` (bearer → `User`, else 401). |
| `app/models.py` | minimal `User` (`google_sub`, `email`, `name`). Full schema = ScrumAgent-67j. |

## Endpoints

- `GET /auth/google/start` → 307 to Google consent. Generates a CSRF `state`, pins it to an `httponly`/`SameSite=Lax` cookie (`Secure` when `BACKEND_BASE_URL` is https). Adds an `hd` domain hint.
- `GET /auth/google/callback?code&state[&error]` → verifies the state cookie (400 on mismatch), exchanges the code, reads userinfo. Requires `email_verified` **and** (`hd == ALLOWED_DOMAIN` or email ends `@municorn.com`). Upserts the user on `google_sub`, signs a JWT, and 302-redirects to `{FRONTEND_BASE_URL}/login#token=<jwt>`. **User-facing failures never dead-end on backend JSON** (OAuth audit, ScrumAgent-imt, 2026-06-12): consent cancel (`error=access_denied`, no code), token-exchange failure, unverified email, and wrong domain all 302 to `{FRONTEND_BASE_URL}/login?error=<code>`, which the login page renders as an alert (`access_denied` / `domain_not_allowed` / `exchange_failed` / `missing_code`).
- `GET /auth/me` → current user via `get_current_user`; 401 on missing/invalid/expired token.

## Hardening (ScrumAgent-imt, 2026-06-12)

- `get_current_user` 401s (not 500s) on a non-numeric/absent `sub`, and explicitly rejects any token carrying a `purpose` claim — OAuth `state` JWTs share the signing key and must never pass as sessions.
- `email_verified` is required in **both** callbacks (login + agent offline flow).
- CORS origin in `main.py` now comes from `Settings.frontend_base_url` (which reads the repo-root `.env`) with an env-var fallback — previously a bare `os.getenv` silently fell back to `localhost:3000` when the value lived only in `.env`.

## Decisions / notes

- **Identity from the userinfo endpoint, not local id_token verification** — the token came straight from Google's token endpoint over TLS in exchange for our client secret, so it's already trusted, and this keeps deps lean (no `google-auth`; just `httpx`, already present).
- **Token delivery via URL fragment** (`/login#token=…`), not a cross-origin cookie — dev runs `:3000` (frontend) and `:8000` (backend) on http, where `Secure`/`SameSite=None` cookies are painful. Frontend reads the fragment, stores it in `localStorage` (`kabanchik.token`), and strips it from the URL (`apps/web/lib/auth.ts`).
- **Schema bootstrap** — `main.py` lifespan calls `Base.metadata.create_all` (no Alembic yet). Idempotent; revisit with migrations once 67j lands.

## Frontend session (ScrumAgent-9pf)

The browser holds the JWT in `localStorage["kabanchik.token"]` (`apps/web/lib/auth.ts`).

- **Identity UI** — the sidebar-footer chip is `components/shell/UserMenu.tsx` (replaces the old hard-coded mock `alice`). With a token it labels instantly from the JWT `email` claim (decoded client-side, unverified — display only), then refines to the full name via `/auth/me`; an initials avatar with a deterministic colour stands in for the (absent) profile photo. Clicking opens a small upward popover with name/email + **Sign out** (`logout()` = clear token → `/login`). With no token it renders a **Sign in** affordance routing to `/login`.
- **Graceful session expiry** — the API client (`apps/web/lib/api.ts`) treats *any* 401 as "our bearer is missing/expired/invalid": it clears the token and redirects to `/login` instead of letting callers surface a dead "Invalid or expired token". This is what fixed that error appearing on the Projects page for users whose earlier login had expired. `UserMenu` calls `/auth/me` on mount, so an expired session is bounced to login on app load, not just when Projects is opened.
- **Tests** — `apps/web/tests/e2e/auth.spec.ts` (real-name display, sign out → `/login` + token cleared, unauth Sign in, expired-token-on-Projects → `/login` with no error). `login.spec.ts` asserts the sign-in button hands off to the backend OAuth start.

## Tests

`backend/tests/test_security.py` (roundtrip / expired / wrong-key) and
`test_auth.py` (start redirect, allowed-domain happy path, idempotent upsert,
non-allowed-domain → login redirect, unverified-email → login redirect, consent
cancel → login redirect, exchange failure → login redirect, state-mismatch 400,
`/me` valid + missing/invalid/expired/state-token/non-numeric-sub 401). All via
in-memory SQLite + a fake `GoogleOAuthClient`.

## Related

- [[flows/oauth-login]] — the flow this implements
- [[entities/google-workspace]] — Calendar/Meet use a **separate** service account, not these OAuth tokens
- [[domains/deployment]] — security posture
