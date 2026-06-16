---
type: module
title: "Calendar Sync"
path: "backend/app/google_calendar.py"
language: python
status: partial
created: 2026-05-10
updated: 2026-06-16
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
- **Frontend** — `/meetings` (`apps/web/app/(shell)/meetings/page.tsx`) lists *live*
  events merged across all of the user's projects (mock `MEETINGS` gone from this page):
  All / Upcoming / Past tabs, search, attendee initials avatars, Scheduled/Past pills,
  rows deep-link to the Google Calendar event. Home's **Recent meetings** card now uses
  the same project calendar endpoint via `RecentMeetingsLive`, showing the newest three
  calendar events with real date/month, attendee count, duration, project name, and
  Scheduled/Past status. Home's **Meetings this week** stat and the shell **Meetings**
  nav badge share `apps/web/lib/meeting-stats.ts`, so both count non-cancelled live
  calendar rows in the browser-local Monday-to-Monday current week instead of rendering
  stale mock constants. The Home widget only fetches when a decodable bearer JWT exists,
  so optional calendar loading does not redirect unauthenticated shell/tweaks views.
  Per-project failures surface as inline alerts on `/meetings`; Home shows an honest
  empty/error state when no calendar data can be loaded. Detail page `/meetings/[id]` is
  still mock-backed (artifacts pipeline pending).

## Hardening (2026-06-16 code review — ScrumAgent-y6a / -oqo / -hky)

Follow-up fixes to the live read path above:

- `meeting-stats.ts` now **de-duplicates events by id** before counting (a meeting
  whose invite reaches two project agent accounts is no longer double-counted) and
  derives week bounds via **calendar arithmetic** (`startOfWeek(now ± 7 days)`)
  instead of a fixed 168h offset, so the current/previous-week split stays correct
  across DST transitions.
- `HomeMeetingsStat` and the shell **Meetings** badge **surface partial failures**:
  when some project calendars fail to load they flag the count as possibly
  incomplete (title/aria; the stat shows `—` if *all* fail) instead of silently
  under-reporting.
- `RecentMeetingsLive` distinguishes three end states — generic empty,
  **needs-connection** (a project calendar returns `409`), and a genuine load
  **error** (non-409) — instead of one red error whenever any project failed and no
  upcoming events remained. It also drops `cancelled` events from the list
  (consistent with the stat) and de-duplicates rows by id.
- The Home greeting is computed **after mount** (no SSR/browser-timezone hydration
  mismatch), and `ActiveProjectProvider` exposes a `status` (`loading`/`ready`/`error`);
  the Home subtitle and the sidebar project switcher show a real error affordance
  instead of the misleading "No project selected" sentinel when `GET /projects` fails.

## Refactor: single meetings fan-out + shared date parser (2026-06-16 — ScrumAgent-iar / -7xk)

Altitude/reuse follow-ups to the read path above. Behaviour-preserving (e2e green):

- **`ProjectMeetingsProvider`** (`apps/web/components/shell/ProjectMeetingsProvider.tsx`,
  mounted in `AppShell`) now fetches each project's calendar **exactly once** and
  shares it with all four consumers — `HomeMeetingsStat`, `RecentMeetingsLive`, the
  Sidebar badge, and `/meetings`. Previously each ran its own
  `listProjects → Promise.allSettled(listProjectMeetings)` (≈3× `listProjects` +
  3×N `listProjectMeetings` on one Home render) with drifted dedup/cancelled/error
  handling. The provider dedups by event id, drops cancelled events, and reads the
  project set from `ActiveProjectProvider.projects` (no per-component `listProjects`
  refetch — `Project` now carries `color`). It exposes per-project **failures with
  their HTTP status**, so each consumer classifies them itself: `/meetings` lists
  every failure (incl. 409 "reconnect"), `RecentMeetingsLive` splits 409
  (needs-connection) from hard errors, and the stat/badge treat 409 as "no
  meetings" (not a load failure) — only hard failures flag the count as incomplete.
- **`lib/calendar-date.ts`** (`parseCalendarDate` / `parseCalendarMs`) is the one
  parser for the all-day-vs-dateTime idiom (`YYYY-MM-DD` → local midnight, else the
  RFC 3339 dateTime), with consistent null handling. Replaces five hand-rolled
  copies (one returned `null`, another `0`) across `RecentMeetingsLive`,
  `meeting-stats.ts`, `/meetings`, `ProjectsListLive`, and `CalendarMeetingRow`.

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
