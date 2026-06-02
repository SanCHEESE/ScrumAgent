---
type: domain
title: "Frontend"
created: 2026-05-10
updated: 2026-06-02
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
| **Meetings** | List + detail: transcript, summary, action items, decisions, linked Jira issues / Notion pages. |
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

## Design language

See [[domains/design]] and [[sources/design-brief]]. Brand: **Kabanchik**. Light B2B SaaS aesthetic — calm, trustworthy, operational, **no dark mode**.

## Test stack

Vitest or Jest + Playwright (per [[sources/mvp-v2-plan]]).
