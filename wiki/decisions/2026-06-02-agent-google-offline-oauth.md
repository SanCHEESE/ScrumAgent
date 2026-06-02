---
type: decision
title: "Agent Google access via offline OAuth (refresh token), not a service account"
status: accepted
date: 2026-06-02
created: 2026-06-02
updated: 2026-06-02
tags: [decision, google, oauth, projects, integrations]
---

# Agent Google access via offline OAuth (refresh token), not a service account

## Decision

The agent's Google Workspace account (default `telecom.scrum.agent@municorn.com`) is
authorized through the **OAuth authorization-code flow with `access_type=offline`**: a
human signs in *as the agent account* in a consent popup and grants Calendar
(`calendar.events`), and we persist the resulting **refresh token** encrypted per project
in `ProjectCredential`. Service accounts and domain-wide delegation stay **deferred**.

The handshake runs *during* project creation, before the project row exists, bridged by a
one-shot `PendingOAuth` row keyed by a signed `state` and consumed at `POST /projects`.
See [[modules/project-provisioning]].

## Context

- `config.py` already marked the service-account path "deferred — needs Workspace admin".
  On the personal `@municorn.com` setup there is no admin to configure DWD, so impersonation
  is not available (see also the `bd` note on meeting transcripts being blocked).
- The wizard holds in-memory form state across 5 steps; a full-page redirect would lose it,
  so the consent runs in a **popup** that hands the result back via `postMessage`.
- The popup is opened cross-origin from the SPA, so a `SameSite` cookie wouldn't reliably
  reach the callback — the CSRF/identity binding rides in a **signed `state` JWT**
  (`security/_state.py`) instead.

## Consequences

- **+** Works today with no Workspace admin; testable end-to-end against the real agent account.
- **+** Refresh token grants long-lived, offline Calendar access without re-consent.
- **+** Reuses the existing `GoogleOAuthClient`, Fernet `EncryptedString`, and JWT signing.
- **−** Someone must interactively consent as the agent account per project (no fleet automation).
- **−** A second redirect URI + the `calendar.events` scope must be registered in the Google
  Cloud console (deploy prerequisite).
- **−** Meet REST transcripts remain out of reach (still needs Workspace admin) — unchanged by this.

## Alternatives rejected

- **Service account + domain-wide delegation** — needs Workspace admin; deferred.
- **Reuse the logged-in user's Google token** — defeats the "dedicated, consented agent participant" model.
- **Draft-project-first / full-page redirect with state restore** — DB clutter / fragile; the
  `PendingOAuth` + popup approach is cleaner.

## Source

User directive 2026-06-02: production-ready Google Workspace connection in the Add Project
wizard, agent email editable with a default, "full OAuth, step required". Updates:
[[modules/project-provisioning]], [[domains/backend]], [[domains/frontend]], [[entities/google-workspace]].
