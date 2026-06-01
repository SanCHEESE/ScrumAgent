---
type: flow
title: "OAuth login"
created: 2026-05-10
updated: 2026-06-01
tags: [flow, auth, oauth]
---

# OAuth login

## Steps

1. Frontend redirects to Google OAuth (with `GOOGLE_CLIENT_ID` and the project's OAuth scopes).
2. Google redirects to backend `routers/auth.py` callback.
3. Backend verifies that the email domain matches `ALLOWED_DOMAIN` (`municorn.com`). Reject otherwise.
4. Backend issues a JWT signed with `SECRET_KEY` and returns it to the frontend.
5. Frontend stores the JWT and uses it on every subsequent backend call.

## Notes

- Only `@municorn.com` users can log in.
- Calendar/Meet access uses a **separate** service account with domain-wide delegation, not the user's OAuth tokens. See [[entities/google-workspace]].

> [!done] Implemented 2026-06-01 (ScrumAgent-u2b) — see [[modules/auth]].
> Refinements vs the sketch above: a CSRF `state` cookie guards the callback; the JWT is handed back via a URL **fragment** (`/login#token=…`), not a cross-origin cookie; identity is read from Google's userinfo endpoint rather than verifying the id_token locally.
