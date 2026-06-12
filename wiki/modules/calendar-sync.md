---
type: module
title: "Calendar Sync"
path: "backend/app/google_calendar.py"
language: python
status: partial
created: 2026-05-10
updated: 2026-06-12
depends_on: [project-provisioning]
used_by: [runtime-orchestrator]
tags: [module, google, calendar]
---

# Calendar Sync (`google_calendar.py`)

Google Calendar + Meet adapter.

## Implemented: live read path (ScrumAgent-m5x, 2026-06-12)

No service account / domain-wide delegation (no Workspace admin — see the
`slice-3` bd memory). Instead the **per-project agent refresh token** captured
at provisioning ([[modules/project-provisioning]]) is used directly:

- `app/google_calendar.py` — `GoogleCalendarClient.list_events(refresh_token, time_min, time_max)`:
  mints an access token (`grant_type=refresh_token`), then `events.list` on the agent's
  **primary** calendar (`singleEvents=true`, `orderBy=startTime`). `invalid_grant` →
  `GoogleAuthRevokedError`; other failures → `GoogleCalendarError`. Injectable via
  `deps.get_google_calendar` (faked in tests).
- `GET /projects/{id}/meetings?days_back=30&days_forward=60` (member-only, 404 otherwise) →
  normalized `CalendarMeetingOut` rows (title, start/end incl. all-day, organizer,
  attendees, Meet link from `hangoutLink`/`conferenceData`, `htmlLink`); cancelled events
  dropped. `409` when the grant is missing/revoked ("reconnect the agent account"),
  `502` on other upstream failures. A revoked grant also persists
  `project.google_connected = False`, so `GET /projects` reflects the broken grant and
  the Projects grid pill shows **Error** (Active when connected — was hardcoded Pending,
  ScrumAgent-4rb).
- **Frontend** — `/meetings` (`apps/web/app/(shell)/meetings/page.tsx`) now lists *live*
  events merged across all of the user's projects (mock `MEETINGS` gone from this page):
  All / Upcoming / Past tabs, search, attendee initials avatars, Scheduled/Past pills,
  rows deep-link to the Google Calendar event. Per-project failures surface as inline
  alerts; zero projects → "Create a project" hint. Detail page `/meetings/[id]` is still
  mock-backed (artifacts pipeline pending).

## Still planned

- Filter/flag events without Meet links for the agent join flow.
- After meeting end, fetch transcript and notes metadata via Google APIs (blocked on
  Workspace admin or the browser-bot path).
- Persist into `meetings` / `meeting_artifacts` tables (today the endpoint proxies live;
  nothing is written).

## Used by

- `meeting_participation` agent — only this agent has access (per [[domains/agents]] boundary).

## Related

- [[entities/google-workspace]]
- [[flows/meeting-processing]]
