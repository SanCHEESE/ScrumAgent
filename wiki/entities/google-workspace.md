---
type: entity
title: "Google Workspace"
created: 2026-05-10
updated: 2026-05-10
tags: [entity, google, integration]
---

# Google Workspace

Calendar, Meet, and OAuth provider.

## Used for

- **OAuth login** — only `@municorn.com` accounts.
- **Calendar API** — service account with domain-wide delegation, syncs events for users in the domain.
- **Meet artifacts** — transcript and notes metadata via Google APIs (post-meeting).

## Touchpoints

- [[modules/calendar-sync]] — only module that talks to Google APIs.
- [[flows/oauth-login]] — login flow.
- [[flows/meeting-processing]] — ingest pipeline.

## Required setup

- Service account key at `data/keys/sa_key.json` (path overridable via `SA_KEY_PATH`).
- `GOOGLE_WORKSPACE_SUBJECT` for impersonation under domain-wide delegation.
- OAuth client (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`).
