# ScrumAgent / Kabanchik web

Next.js 14 (App Router) frontend for the ScrumAgent / Kabanchik product. The
design system is the custom **Kabanchik** stylesheet — CSS variables for
tokens, density modes, and dark mode. Tailwind is loaded for utility classes
only; **do not try to convert design tokens to Tailwind config**.

## Run

```bash
cd apps/web
npm install
npm run dev      # http://localhost:3000
```

Other scripts:

| Script         | What it does                          |
| -------------- | ------------------------------------- |
| `npm run dev`   | Next.js dev server.                   |
| `npm run build` | Production build (`next build`).      |
| `npm run start` | Run the built app.                    |
| `npm run typecheck` | `tsc --noEmit`. CI gate.          |
| `npm run lint`  | `next lint`.                          |

## Adding a screen

Each routed page lives at `app/(shell)/<route>/page.tsx`. The `(shell)` route
group inserts the live bar + sidebar via `app/(shell)/layout.tsx`. Replace the
stub in `page.tsx` with the real screen.

- For interactive screens (state, hooks, browser APIs), add `"use client"` at
  the top of the page or, better, lift the interactive parts into a child
  client component and keep the page itself a server component.
- The `/login` route lives outside the `(shell)` group so the shell does not
  render around it.

### Per-screen CSS

Drop screen-specific stylesheets into `styles/screens/<name>.css` and import
them from the page that owns the screen:

```ts
// app/(shell)/meetings/page.tsx
import "@/styles/screens/meetings.css";
```

Global tokens, base resets, and shared components live in `styles/tokens.css`
and `styles/base.css` (both imported by `app/globals.css`). Don't edit those
unless you're updating the design system itself.

## Shared components

| Path                                          | What                                           |
| --------------------------------------------- | ---------------------------------------------- |
| `components/ui/Icon.tsx`                      | 34-icon registry (`name`, `size`, `stroke`).  |
| `components/ui/Avatar.tsx`                    | Round avatar with initials.                    |
| `components/ui/AvatarStack.tsx`               | Overlapping avatar row with `+N` overflow.     |
| `components/ui/StatusPill.tsx`                | Status badge with the prototype's status map. |
| `components/ui/Badge.tsx`                     | Tone-only chip.                                |
| `components/ui/Card.tsx`                      | `Card` + `CardHeader` + `CardTitle` + `CardBody`. |
| `components/ui/Button.tsx`                    | `variant`, `size`, `iconOnly`.                |
| `components/ui/Modal.tsx`                     | Backdrop + modal + header/body/footer.        |
| `components/shell/AppShell.tsx`               | Live bar + sidebar + main grid.                |
| `components/shell/LiveBar.tsx`                | Animated activity ticker.                      |
| `components/shell/Sidebar.tsx`                | Logo + project switcher + nav + user chip.    |
| `components/shell/ProjectSwitcherModal.tsx`   | Modal for switching active project.           |
| `components/shell/ActiveProjectProvider.tsx`  | React context for the active project.         |

## Mock data

All screens read from `lib/mock-data.ts` until the backend is wired:

- `PROJECTS` — `Project[]`
- `PARTICIPANTS` — `Record<ParticipantId, Participant>`
- `MEETINGS` — `Meeting[]`
- `UPDATES` — `Update[]`
- `TRACE_RUNS` — `TraceRun[]`

Domain types live in `lib/types.ts`. The sidebar nav array lives in `lib/nav.ts`.

## Source materials

The original prototype is at `.worktrees/_design-bundle/project/` (relative to
the repo root, gitignored). Files of interest:

- `kabanchik.css` — design tokens + base styles + shell layout.
- `kabanchik-screens.css` — per-screen CSS (port what you need).
- `kabanchik-ui.jsx` — shared components (already ported).
- `kabanchik-app.jsx` — app shell + routing (already ported).
- `kabanchik-data.jsx` — mock data (already ported to `lib/mock-data.ts`).
- `screens-*.jsx` and the matching `*.html` files — per-screen reference.

When porting a new screen, **read the HTML / CSS / JSX directly**; do not try
to render the prototype in a browser. Match the visual output.
