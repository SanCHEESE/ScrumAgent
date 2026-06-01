---
type: module
title: "Auth"
path: "backend/app/routers/auth.py"
language: python
status: active
created: 2026-06-01
updated: 2026-06-01
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
- `GET /auth/google/callback?code&state` → verifies the state cookie (400 on mismatch), exchanges the code, reads userinfo. Enforces `hd == ALLOWED_DOMAIN` **or** email ends `@municorn.com` (else **403**). Upserts the user on `google_sub`, signs a JWT, and 302-redirects to `{FRONTEND_BASE_URL}/login#token=<jwt>`.
- `GET /auth/me` → current user via `get_current_user`; 401 on missing/invalid/expired token.

## Decisions / notes

- **Identity from the userinfo endpoint, not local id_token verification** — the token came straight from Google's token endpoint over TLS in exchange for our client secret, so it's already trusted, and this keeps deps lean (no `google-auth`; just `httpx`, already present).
- **Token delivery via URL fragment** (`/login#token=…`), not a cross-origin cookie — dev runs `:3000` (frontend) and `:8000` (backend) on http, where `Secure`/`SameSite=None` cookies are painful. Frontend reads the fragment, stores it in `localStorage` (`kabanchik.token`), and strips it from the URL (`apps/web/lib/auth.ts`).
- **Schema bootstrap** — `main.py` lifespan calls `Base.metadata.create_all` (no Alembic yet). Idempotent; revisit with migrations once 67j lands.

## Tests

`backend/tests/test_security.py` (roundtrip / expired / wrong-key) and
`test_auth.py` (start redirect, allowed-domain happy path, idempotent upsert,
non-allowed-domain 403, state-mismatch 400, `/me` valid + missing/invalid/expired
401). All via in-memory SQLite + a fake `GoogleOAuthClient`.

## Related

- [[flows/oauth-login]] — the flow this implements
- [[entities/google-workspace]] — Calendar/Meet use a **separate** service account, not these OAuth tokens
- [[domains/deployment]] — security posture
