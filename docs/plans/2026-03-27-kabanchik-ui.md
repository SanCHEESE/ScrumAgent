# Kabanchik UI Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a complete static HTML+JS prototype of the Kabanchik Scrum Agent UI covering all 9 screens from the design spec, navigable from a root index.html with mock data throughout.

**Architecture:** Pure HTML files per screen, shared CSS design system, shared JS for mock data and nav component injection. State (current project, auth) stored in sessionStorage. URL params used for project/meeting IDs.

**Tech Stack:** Vanilla HTML5, CSS custom properties, vanilla JS (ES6 modules), no build tools, no frameworks, no backend.

---

### Task 1: Project Scaffold + Design System CSS

**Files:**
- Create: `ui/index.html`
- Create: `ui/css/style.css`
- Create: `ui/js/mock-data.js`
- Create: `ui/js/app.js`

**Step 1: Create directory structure**

```bash
mkdir -p ui/css ui/js
```

**Step 2: Create `ui/css/style.css` — design system**

Colors, typography, base components (card, badge, button, input, dialog).

Color tokens:
```css
:root {
  --bg-sidebar: #1a1d23;
  --bg-content: #f8f9fa;
  --bg-card: #ffffff;
  --text-primary: #111827;
  --text-secondary: #6b7280;
  --text-sidebar: #d1d5db;
  --accent: #6366f1;
  --accent-hover: #4f46e5;
  --status-pending: #9ca3af;
  --status-processing: #f59e0b;
  --status-done: #10b981;
  --status-error: #ef4444;
  --border: #e5e7eb;
  --sidebar-width: 240px;
}
```

Badge variants: `.badge.pending`, `.badge.processing`, `.badge.done`, `.badge.error`
Button variants: `.btn`, `.btn-primary`, `.btn-secondary`, `.btn-danger`, `.btn-ghost`
Layout: `.app-layout` (flex row), `.sidebar` (240px fixed), `.content` (flex-grow)

**Step 3: Create `ui/js/mock-data.js`**

Export `MOCK_PROJECTS`, `MOCK_MEETINGS`, `MOCK_UPDATES`, `MOCK_TRACE_RUNS`.

```js
const MOCK_PROJECTS = [
  { id: 'p1', name: 'Platform Team', email: 'scrumagent.platform@municorn.com', lastSync: '5 min ago', status: 'active' },
  { id: 'p2', name: 'Mobile Team', email: 'scrumagent.mobile@municorn.com', lastSync: 'Never', status: 'never_synced' },
  { id: 'p3', name: 'Data Team', email: 'scrumagent.data@municorn.com', lastSync: null, status: 'error' },
];
// ... meetings, updates, trace runs
```

**Step 4: Create `ui/js/app.js` — shared utilities**

```js
function getCurrentProject() { return sessionStorage.getItem('currentProject') || 'p1'; }
function setCurrentProject(id) { sessionStorage.setItem('currentProject', id); }
function getProjectById(id) { return MOCK_PROJECTS.find(p => p.id === id); }
function navigate(url) { window.location.href = url; }
```

**Step 5: Create `ui/index.html` — redirect**

```html
<!DOCTYPE html>
<html>
<head><meta http-equiv="refresh" content="0;url=login.html"></head>
<body></body>
</html>
```

**Step 6: Commit**

```bash
git add ui/
git commit -m "feat: scaffold Kabanchik UI with design system and mock data"
```

---

### Task 2: Nav Component + Sidebar

**Files:**
- Create: `ui/js/nav.js`

**Step 1: Create `ui/js/nav.js`**

Function `renderNav(activePage)` that injects sidebar HTML into `#sidebar` element.

```js
function renderNav(activePage) {
  const project = getProjectById(getCurrentProject());
  const links = [
    { id: 'chat', label: 'Chat', icon: '💬', href: 'project-chat.html' },
    { id: 'meetings', label: 'Meetings', icon: '📹', href: 'project-meetings.html' },
    { id: 'updates', label: 'Updates', icon: '✓', href: 'project-updates.html', badge: 3 },
    { id: 'trace', label: 'Agent Trace', icon: '📋', href: 'project-trace.html' },
    { id: 'settings', label: 'Settings', icon: '⚙️', href: 'project-settings.html' },
  ];
  // render sidebar with project switcher dropdown and user footer
}
```

Sidebar includes:
- Project name + dropdown arrow → `projects.html`
- Nav links with active state
- Updates badge
- Footer: avatar + email + Sign out link

---

### Task 3: Login Page

**Files:**
- Create: `ui/login.html`

**Step 1: Create `ui/login.html`**

Center-aligned card on full-viewport background.
- Logo placeholder (running boar silhouette emoji 🐗)
- Title "Kabanchik"
- Subtitle "Scrum agent for your team"
- "Sign in with Google" button (Google-style white button with G icon)
- Small note "@municorn.com accounts only"
- Three states: default, loading (spinner on button), error (red banner)

**Step 2: JS behavior**

Click → loading state (500ms) → set `sessionStorage.authed=true` → redirect to `projects.html`.
If email field shown and not @municorn.com → error state.

---

### Task 4: Projects List Page

**Files:**
- Create: `ui/projects.html`

**Step 1: Create `ui/projects.html`**

Layout: no sidebar (pre-project screen), simple header.
- Header: "Projects" + "Add Project" button → `projects-new.html`
- Render `MOCK_PROJECTS` as cards:
  - Name, email, last sync time, status badge
  - "Open" button → sets currentProject + navigate to `project-chat.html`
- Empty state section (commented out, swap to show)

**Step 2: Status badge colors**
- active → green "Synced"
- never_synced → gray "Never synced"
- error → red "Sync error"

---

### Task 5: Add Project Wizard

**Files:**
- Create: `ui/projects-new.html`

**Step 1: Create `ui/projects-new.html`**

3-step wizard with progress indicator at top.

Step 1 — Basic Info:
- Project name (text input, required)
- Description (textarea, optional)

Step 2 — Google Account:
- "Connect Scrum Agent Google Account" button
- Click → simulate OAuth → show connected state (email + green checkmark)
- Note text below

Step 3 — Integrations:
- Jira: base URL input + API token input
- Notion: Integration Token input
- Both optional

Footer: "Back" + "Next"/"Create Project" buttons.

**Step 2: JS**

Track `currentStep` (1-3), validate step 1 before advancing, simulate Google OAuth on step 2 click.
On "Create Project" → push to `MOCK_PROJECTS` → navigate to `projects.html`.

---

### Task 6: Chat Page

**Files:**
- Create: `ui/project-chat.html`

**Step 1: Create `ui/project-chat.html`**

Layout: sidebar + content (flex column: message history + input area).

Mock conversation messages (2-3 exchanges):
```js
const MOCK_MESSAGES = [
  { role: 'user', text: 'What were the key decisions from yesterday\'s standup?' },
  { role: 'agent', text: 'In yesterday\'s standup (Mar 26)...', sources: [
    { type: 'meeting', title: 'Daily Standup Mar 26', timestamp: '10:02' },
    { type: 'jira', key: 'PLAT-234', title: 'Fix auth token expiry' },
  ]},
];
```

Agent messages include collapsed "Sources" accordion.

Input: textarea (Enter to send, Shift+Enter newline) + Send button + Stop icon.

**Step 2: States**

- Empty state: "Ask me about your meetings, action items, or project decisions"
- Typing indicator (animated dots) for 1.5s before mock response appears
- Simulated streaming (text appears word by word with setInterval)

---

### Task 7: Meetings List Page

**Files:**
- Create: `ui/project-meetings.html`

**Step 1: Create `ui/project-meetings.html`**

Mock meetings data covering all statuses: Pending, Processing, Transcribing, Analyzing, Done, Error.

```js
const MOCK_MEETINGS = [
  { id: 'm1', title: 'Daily Standup', date: '2026-03-26', time: '10:00', duration: '15m', participants: ['Alice', 'Bob', 'Carol', 'Dave', 'Eve'], status: 'done' },
  { id: 'm2', title: 'Sprint Planning', date: '2026-03-25', time: '14:00', duration: '1h 30m', participants: ['Alice', 'Bob'], status: 'processing' },
  { id: 'm3', title: 'Backlog Grooming', date: '2026-03-24', time: '11:00', duration: '45m', participants: ['Carol'], status: 'pending' },
  { id: 'm4', title: 'Retrospective', date: '2026-03-20', time: '16:00', duration: '1h', participants: ['Alice', 'Bob', 'Carol'], status: 'error' },
];
```

Toolbar: search input, date range (two date inputs), status filter buttons.
List: table or cards, each row: title, date+time, participant avatars (max 4 + +N), status badge, "View" button.

**Step 2: Filtering JS**

Live filter on search input (title match), status filter buttons toggle active class and filter list.

---

### Task 8: Meeting Detail Page

**Files:**
- Create: `ui/project-meeting-detail.html`

**Step 1: Header + tabs structure**

URL param: `?id=m1`
Load meeting by ID from mock data.

Header: title, date/time/duration, participant avatars, status badge.
Tabs: Summary | Transcript | Action Items | Decisions | Updates

**Step 2: Tab — Summary**

- Summary text (markdown-like, render with simple `<p>` and `<strong>` parsing)
- Linked Jira issues: cards with key + title + status badge
- Linked Notion pages: list with 📄 icon + title

**Step 3: Tab — Transcript**

Utterances list:
```js
[
  { speaker: 'Alice', time: '0:00', text: 'Good morning everyone...' },
  { speaker: 'Bob', time: '0:45', text: 'I finished the auth fix...' },
]
```
Search input filters utterances live. Empty state if no transcript.

**Step 4: Tab — Action Items**

List items:
```js
[
  { owner: 'Bob', text: 'Deploy auth fix to staging', due: '2026-03-28', status: 'open', jiraKey: 'PLAT-234' },
  { owner: 'Alice', text: 'Update runbook', due: '2026-03-29', status: 'open', jiraKey: null },
]
```
Each item: owner avatar, text, due date, status badge, Jira inline badge (if linked), "Link to Jira" button (opens simple dialog).

**Step 5: Tab — Decisions**

List:
```js
[
  { text: 'Move deployment to Friday to avoid Monday incidents', confidence: 'High' },
  { text: 'Alice will lead the migration', confidence: 'Medium' },
]
```
Confidence badge: High=green, Medium=yellow, Low=gray.

**Step 6: Tab — Updates**

Subset of updates for this meeting (same card style as Updates page).
Approve/Reject buttons inline.

---

### Task 9: Updates Page

**Files:**
- Create: `ui/project-updates.html`

**Step 1: Mock updates data**

```js
const MOCK_UPDATES = [
  { id: 'u1', target: 'jira', objectName: 'PLAT-234', updateType: 'Change status', before: 'In Progress', after: 'Done', reasoning: 'Meeting transcript indicates Bob confirmed deployment completed.', confidence: 'High', status: 'pending', meetingId: 'm1' },
  { id: 'u2', target: 'notion', objectName: 'Sprint 42 Notes', updateType: 'Add comment', before: '', after: 'Decided to delay feature X to next sprint.', reasoning: 'Decision explicitly stated by Alice.', confidence: 'High', status: 'pending', meetingId: 'm1' },
  { id: 'u3', target: 'jira', objectName: 'PLAT-201', updateType: 'Set assignee', before: 'Unassigned', after: 'Carol', reasoning: 'Carol volunteered during planning.', confidence: 'Medium', status: 'approved', meetingId: 'm2' },
  { id: 'u4', target: 'notion', objectName: 'Team Wiki', updateType: 'Add comment', before: '', after: 'New process for hotfixes agreed.', reasoning: 'Discussed but not fully confirmed.', confidence: 'Low', status: 'rejected', meetingId: 'm2' },
];
```

**Step 2: Cards UI**

Each card:
- Top: target icon (Jira=blue J / Notion=black N) + object name + update type label
- Diff view: two columns "Before" / "After" with highlight
- "Agent reasoning" collapsible section
- Confidence badge
- Action buttons: Approve (green) / Reject (gray) / Edit (blue) for pending items
- Applied/Failed states for post-action display

Toolbar: filter by status (All/Pending/Approved/Rejected), target (All/Jira/Notion), meeting dropdown.
Bulk: checkboxes on cards + "Approve selected" / "Reject selected" buttons.

**Step 3: State management**

Click Approve/Reject → update card state in local array → re-render card.

---

### Task 10: Agent Trace Page

**Files:**
- Create: `ui/project-trace.html`

**Step 1: Mock trace runs**

```js
const MOCK_TRACE_RUNS = [
  { id: 'r1', datetime: '2026-03-26 10:18', meetingTitle: 'Daily Standup', status: 'done', duration: '42s', steps: [
    { name: 'Fetch transcript', input: '{ meetingId: "m1" }', output: '{ utterances: [...] }', tools: [], duration: '1.2s' },
    { name: 'Analyze decisions', input: '{ transcript: "..." }', output: '{ decisions: [...] }', tools: [{ name: 'llm_call', args: '{ model: "claude-sonnet-4-6" }', result: '...' }], duration: '8.4s' },
    { name: 'Extract action items', input: '...', output: '...', tools: [], duration: '6.1s' },
    { name: 'Generate Jira updates', input: '...', output: '...', tools: [{ name: 'jira_get_issue', args: '{ key: "PLAT-234" }', result: '...' }], duration: '3.2s' },
    { name: 'Propose changes', input: '...', output: '{ updates: [...] }', tools: [], duration: '0.8s' },
  ]},
  { id: 'r2', datetime: '2026-03-25 14:35', meetingTitle: 'Sprint Planning', status: 'done', duration: '1m 12s', steps: [] },
];
```

**Step 2: Two-panel layout**

Left panel (list): each run as clickable row → datetime, meeting title, status badge, duration.
Right panel (detail): selected run's steps as accordion timeline. Each step: name, input (collapsed), output (collapsed), tool calls (collapsed with tool name + args + result), duration.
Summary bar: agent model, step count, tools used, total time.

Empty state in right panel: "Select a run to view details".

---

### Task 11: Settings Page

**Files:**
- Create: `ui/project-settings.html`

**Step 1: Two-column layout**

Left: section menu (General, Google Account, Jira, Notion, Sync Policy).
Right: content of active section.

**Step 2: General section**

- Project name (editable input + Save button)
- Delete project: button → confirmation dialog (type project name to confirm) → navigate to projects.html

**Step 3: Google Account section**

- Connected email display
- Last sync: "5 min ago" + "Sync Now" button (shows spinner, then updates time)
- Disconnect button (confirmation) / Reconnect button

**Step 4: Jira section**

- Base URL input (pre-filled)
- API Token input (masked, eye toggle to reveal)
- "Test Connection" button → simulate success (green banner) or error (red banner)
- Disconnect button

**Step 5: Notion section**

- Integration Token (masked + eye toggle)
- Test Connection button
- Disconnect button

**Step 6: Sync Policy section**

- Toggle: "Auto-apply safe changes" (comments, links, tags)
- Toggle: "Require approval for all changes"
- Info callout: what counts as safe

---

### Task 12: Wire All Navigation

**Files:** All HTML files (minimal edits)

**Step 1: Verify all inter-page links work**

Checklist:
- index.html → login.html ✓
- login.html → projects.html (on sign in)
- projects.html → project-chat.html (Open button, sets currentProject)
- projects.html → projects-new.html (Add Project)
- projects-new.html → projects.html (Create / Cancel)
- sidebar: Chat / Meetings / Updates / Trace / Settings links
- sidebar: project switcher → projects.html
- meetings list → meeting-detail.html?id=X
- meeting detail → back to meetings list
- sidebar sign out → login.html (clears sessionStorage)

**Step 2: Project switcher dropdown in sidebar**

Click project name → dropdown shows all projects → click → setCurrentProject + reload.

**Step 3: Final smoke test**

Open `ui/index.html` in browser, click through every screen and verify no broken links or JS errors.

**Step 4: Commit**

```bash
git add ui/
git commit -m "feat: complete Kabanchik UI prototype with all screens and navigation"
```

---

## File Summary

```
ui/
├── index.html                  redirect → login.html
├── login.html                  Login (Google OAuth mock)
├── projects.html               Projects list
├── projects-new.html           Add project wizard
├── project-chat.html           RAG Chat
├── project-meetings.html       Meetings list
├── project-meeting-detail.html Meeting detail (tabs)
├── project-updates.html        Proposed changes
├── project-trace.html          Agent trace
├── project-settings.html       Project settings
├── css/
│   └── style.css               Design system
└── js/
    ├── mock-data.js             All mock data
    ├── app.js                   Shared utils (nav, routing)
    └── nav.js                   Sidebar component
```
