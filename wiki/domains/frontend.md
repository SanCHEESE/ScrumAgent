---
type: domain
title: "Frontend"
created: 2026-05-10
updated: 2026-06-16
tags: [domain, frontend, nextjs]
---

# Frontend

Next.js 14 (App Router) + TypeScript + Tailwind + shadcn/ui. Talks only to the [[domains/backend]] over typed HTTP and SSE. Source: [[sources/tech-architecture]], [[sources/kabanchik-ui-plan]].

## Sections

| Section | Purpose |
|---|---|
| **Login / Callback** | Receives JWT from backend after Google OAuth. |
| **Projects** | Grid of real projects (`GET /projects`) + Add Project wizard that provisions an agent Google account (offline-OAuth popup), Jira/Notion tokens, and team members. See [[modules/project-provisioning]]. |
| **Chat** | SSE-streamed Q&A with citations. |
| **Meetings** | List + detail: transcript, summary, action items, decisions, linked Jira issues / Notion pages. The header keeps the future Upload recording CTA visible but disabled until the upload/import pipeline exists. |
| **Updates** | Staged Jira/Notion changes with approve / reject / apply. Shows the reason each change was proposed. |
| **Settings** | Integration config. Secrets never returned by the API. |
| **Agent Trace** | Run lifecycle, handoff between agents, tool use, payloads. |

## Layout

```text
frontend/
├── Dockerfile
├── package.json
└── src/
    ├── app/
    ├── components/
    └── lib/
```

## Shared client helpers (DRY refactors, 2026-06-16)

Cross-cutting logic that had been copy-pasted (and had drifted) is centralized:

- **`lib/use-current-user.ts`** (`useCurrentUser`, ScrumAgent-zis) — the one signed-in
  identity resolver: instant JWT-`email` label → `/auth/me` full-name refinement →
  `agent_preview` gating → 401-means-signed-out. Consumed by the Home greeting
  (`app/(shell)/page.tsx`) and the sidebar `UserMenu`.
- **`lib/avatar.ts`** (`toParticipant` / `avatarColor` / `avatarInitials`, ScrumAgent-44x)
  — one palette + one initials/colour rule for `UserMenu`, `MembersSection`, and
  `CalendarMeetingRow` (each previously had its own palette, so the same person could
  render different colours in different places).
- **`lib/calendar-date.ts`** (`parseCalendarDate` / `parseCalendarMs`, ScrumAgent-7xk)
  and **`components/shell/ProjectMeetingsProvider`** (`useProjectMeetings`,
  ScrumAgent-iar) — see [[modules/calendar-sync]]. The provider is the single
  per-project calendar fan-out behind the Home stat/recent cards, the sidebar
  meetings badge, and `/meetings`.

## Design language

See [[domains/design]] and [[sources/design-brief]]. Brand: **Kabanchik**. Light B2B SaaS aesthetic — calm, trustworthy, operational, **no dark mode**.

## Test stack

Vitest or Jest + Playwright (per [[sources/mvp-v2-plan]]).
