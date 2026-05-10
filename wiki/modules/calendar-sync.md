---
type: module
title: "Calendar Sync"
path: "backend/app/calendar_sync.py"
language: python
status: planned
created: 2026-05-10
updated: 2026-05-10
depends_on: []
used_by: [runtime-orchestrator]
tags: [module, google, calendar]
---

# Calendar Sync (`calendar_sync.py`)

Google Calendar + Meet adapter.

## Responsibilities

- Sync calendar events for `@municorn.com` users via service account (domain-wide delegation).
- Filter events without Meet links.
- After meeting end, fetch transcript and notes metadata via Google APIs.
- Normalize meeting artifacts into SQLite tables (`meetings`, `meeting_artifacts`).

## Used by

- `meeting_participation` agent — only this agent has access (per [[domains/agents]] boundary).

## Related

- [[entities/google-workspace]]
- [[flows/meeting-processing]]
