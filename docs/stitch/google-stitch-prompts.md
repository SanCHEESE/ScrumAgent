# Kabanchik Google Stitch Prompt Pack

Use this file as a copy-paste source for Google Stitch.

Recommended workflow:
1. Paste the global design brief first.
2. Then paste one screen prompt at a time.
3. Keep all screens in the same visual system and navigation model.

## Global Design Brief

```text
Design a desktop-first web app called Kabanchik, an AI scrum and meeting intelligence assistant for internal teams. The product connects Google Meet / Calendar, Jira, and Notion, then helps teams review meeting summaries, search knowledge, inspect agent reasoning, and approve suggested updates.

Visual direction:
- Light, polished B2B SaaS product
- Calm, trustworthy, operational, focused on clarity rather than marketing spectacle
- Professional and premium, but not flashy
- Clean enterprise UX with a subtle modern edge

Typography:
- Use Inter throughout
- Clear hierarchy with strong page titles, compact labels, readable 13-14px body copy
- Tight but breathable spacing, moderate information density

Color system:
- App background: soft neutral gray #f3f4f6
- Cards and panels: white
- Primary text: #111827
- Secondary text: #6b7280
- Muted text: #9ca3af
- Primary accent / CTA: indigo #6366f1
- Primary hover: #4f46e5
- Accent tint / active nav background: #eef2ff
- Border color: #e5e7eb

Semantic status colors:
- Pending: neutral gray
- Processing: amber
- Transcribing: violet
- Analyzing: blue
- Done / Connected / Success: green
- Error / Danger: red

Component language:
- Rounded corners, mostly 8px to 12px radius
- Thin borders, subtle shadows, crisp white surfaces
- Compact pills, badges, tabs, segmented filters, and lightweight data tables
- Inputs should look calm and enterprise-grade, not overly decorative
- Buttons should be simple, clean, and slightly bold
- Use avatar circles, status chips, tabs, accordions, split panes, diff cards, and wizard progress steps where appropriate

Navigation model:
- Global, pre-project screens use a clean top bar
- Project-level screens use a fixed left sidebar around 240px wide
- Sidebar contains project switcher, nav links for Chat, Meetings, Updates, Agent Trace, and Settings, plus a small user footer
- Keep navigation consistent across all project-level screens

Layout rules:
- Desktop-first, designed around roughly 1440px width
- Use comfortable whitespace but keep the product information-dense enough for daily work
- Prefer one dominant content area plus secondary panels when needed
- Cards should feel modular and reusable

Interaction tone:
- Human-in-the-loop AI product, so the UI should show confidence, reviewability, and traceability
- Important actions should feel explicit and safe
- AI-generated content should be easy to inspect, not magical or hidden

Avoid:
- Dark mode
- Glassmorphism
- Neon or overly saturated gradients
- Consumer social media aesthetics
- Overly playful illustrations
- Empty dribbble-style dashboard filler

Output requirement:
- Create high-fidelity product UI, not low-fidelity wireframes
- Keep the structure grounded in real SaaS workflows
- Use realistic placeholder data related to meetings, Jira issues, Notion pages, summaries, decisions, and sync states
```

## 1. Login Screen

```text
Using the Kabanchik design brief above, design a high-fidelity desktop login screen for an internal SaaS product.

Goal:
Create a focused authentication screen for Kabanchik that feels secure, clean, and enterprise-ready.

Layout:
- Full-height light gray background
- Center a single white login card with subtle shadow and generous padding
- Card width should feel compact, around 360px

Content inside the card:
- Small boar brand mark or simple mascot-like icon at the top
- Product name: Kabanchik
- Subtitle: Scrum agent for your team
- Hidden or optional inline error banner for invalid domain access
- Primary action: “Sign in with Google” button using a clean Google-style pattern
- Small helper text below: only @municorn.com accounts are allowed

Interaction cues to reflect in the design:
- Default state should be the main focus
- Suggest visual variants for loading and error states without turning the screen into a flowchart
- The sign-in button should feel clearly primary

Visual tone:
- Minimal, quiet, trustworthy
- No illustration-heavy hero area
- No split marketing/auth layout

Make it feel like the first screen of a serious internal AI productivity tool.
```

## 2. Projects List Screen

```text
Using the Kabanchik design brief above, design the “Projects” overview screen for a desktop web app.

Goal:
Show all team projects a user can open, each connected to meetings, Jira, and Notion.

Layout:
- Use a clean top bar, not the project sidebar
- Top bar should include the Kabanchik brand on the left and the signed-in user with avatar plus sign out action on the right
- Main content should be centered in a comfortable max-width container

Header section:
- Page title: Projects
- Subtitle explaining that each project connects a team’s meetings to Jira and Notion
- Primary action button: “Add Project”

Main content:
- Responsive grid of project cards, ideally 2 columns on desktop
- Each card should include:
  - Project name
  - Short project description
  - Connected Scrum Agent email
  - Status badge
  - Sync state text such as “Last synced 5 min ago”, “Never synced”, or “Sync failed”
  - Optional inline warning for authentication error
  - Secondary action button: “Open”

Project examples:
- Platform Team
- Mobile Team
- Data Team

Statuses to show:
- Active / synced
- Never synced
- Error / broken connection

Also design the system so an empty state would fit naturally, even if the main frame shows populated cards.
```

## 3. Add Project Wizard Screen

```text
Using the Kabanchik design brief above, design a desktop “Add New Project” wizard screen.

Goal:
Guide the user through creating a new project and connecting Google, Jira, and Notion in a calm, structured way.

Layout:
- Use the same top bar style as the Projects screen
- Left side of the top bar: Kabanchik brand
- Right side or contextual area: “Back to Projects”
- Main content centered in a medium-width column
- Large white wizard card with subtle border and shadow

Inside the wizard card:
- Title: Add New Project
- A 3-step horizontal progress indicator at the top
  - Step 1: Basic Info
  - Step 2: Google Account
  - Step 3: Integrations

Primary frame state:
- Show Step 1 as the active content state

Step 1 content:
- Project name input, required
- Description textarea, optional
- Inline validation style for missing project name

The design must also make room for these future step states:
- Step 2: connect a dedicated Google account, with a large Google connect button and a success state showing connected email plus green confirmation
- Step 3: optional integration fields for Jira and Notion, including URL and token inputs

Footer of the wizard card:
- Back button on the left
- Next / Create Project actions on the right

Design cues:
- Progress component should feel elegant and readable
- Inputs should follow the UI kit language: rounded, light, compact, enterprise-grade
- Keep the experience clearly multi-step but not intimidating
```

## 4. Project Chat Screen

```text
Using the Kabanchik design brief above, design the main in-project “Chat” screen for a desktop SaaS application.

Goal:
Let the user ask questions about meetings, action items, decisions, Jira issues, and Notion knowledge in a clear AI chat interface.

Layout:
- Use the project-level layout with a fixed left sidebar
- Sidebar should include:
  - Project switcher at the top
  - Nav items: Chat, Meetings, Updates, Agent Trace, Settings
  - Updates should have a small numeric badge
  - User footer at the bottom
- Main content area should be a vertically structured chat workspace

Chat area:
- Slim page header with icon, title “Chat”, and a short helper sentence like “Ask about meetings, decisions & action items”
- Optional “Clear” action in the header
- Large conversation area with alternating user and agent messages
- Bottom anchored input composer with multiline input and a prominent send button

Message content:
- Show 2 user messages and 2 agent replies
- Agent replies should look structured and intelligent, with some bold text and ordered lists
- Each agent reply should include a compact “Sources” control that expands into source chips or pills
- Example source types: meeting, Jira issue, Notion page

Empty-state behavior:
- The screen should still feel complete if the chat history is empty
- Include a tasteful empty-state concept with a centered prompt about asking about meetings, action items, or project decisions

Interaction cues:
- Input supports multiline typing
- Send button can visually support send and stop states
- Include a subtle typing / streaming mental model in the design language

The overall feel should be closer to a serious workspace assistant than a consumer chatbot.
```

## 5. Meetings List Screen

```text
Using the Kabanchik design brief above, design the “Meetings” list screen for a selected project.

Goal:
Help the user browse, filter, and open meetings that have different processing states.

Layout:
- Use the standard project sidebar on the left
- Main content should be a wide content area with a page header and toolbar above a data-rich list

Header:
- Title: Meetings
- Subtitle showing context, such as “All meetings for Platform Team”
- Primary action: “Import Meeting”

Toolbar:
- Search input for meeting title
- Segmented status filters
- Date range filter with from/to fields

Main list:
- Present meetings in a refined table or structured list
- Each row should include:
  - Meeting title
  - Date and time
  - Duration
  - Participant avatars, with overflow handling such as +N
  - Status badge
  - Small “View” action

Statuses to visually support:
- Pending
- Processing
- Transcribing
- Analyzing
- Done
- Error

Example meetings:
- Daily Standup
- Sprint Planning
- Backlog Grooming
- Retrospective
- Architecture Review

Design cues:
- This screen should feel operational and filterable
- It should read like a real admin/productivity table, not a marketing dashboard
- Leave room for an inline empty state when filters return no results
```

## 6. Meeting Detail Screen

```text
Using the Kabanchik design brief above, design the detailed meeting review screen for a selected meeting.

Goal:
Let the user inspect one meeting deeply: summary, transcript, action items, decisions, and proposed updates.

Layout:
- Standard project sidebar on the left
- Main content in a readable centered column
- Small back link at the top leading back to Meetings

Header card:
- Meeting title
- Status badge
- Meta row with date, time, duration, and participant avatars

Below the header:
- A horizontal tab bar with these tabs:
  - Summary
  - Transcript
  - Action Items
  - Decisions
  - Updates
- The Updates tab can show a small pending-count badge

Primary frame state:
- Show the Summary tab as active

Summary tab content:
- Structured summary in polished rich-text card style
- Sections for overview and key points
- Linked resources area for related Jira issues and Notion pages

Design the layout so the same screen system can also support these alternate tab states:
- Transcript: searchable speaker-by-speaker transcript timeline
- Action Items: owner, due date, status, and optional “Link to Jira” action
- Decisions: concise decision cards with confidence labels
- Updates: proposal cards with before/after diff, reasoning, confidence, and approve/reject actions

Important:
- This screen should communicate reviewability and traceability
- Avoid making it feel like a generic notes page
- It should feel like a meeting intelligence workspace
```

## 7. Proposed Updates Screen

```text
Using the Kabanchik design brief above, design the project-level “Proposed Updates” screen.

Goal:
Help users review AI-suggested updates before applying them to Jira and Notion.

Layout:
- Standard project sidebar on the left
- Main content in a comfortable single-column workflow area

Header:
- Title: Proposed Updates
- Subtitle explaining that the agent wants to apply changes to Jira and Notion
- Small pending-count badge near the title

Toolbar / filtering:
- Status filter group: All, Pending, Approved, Rejected
- Target filter group: All, Jira, Notion
- Meeting selector dropdown: All meetings

Bulk action pattern:
- A contextual bulk action bar should appear above the list when items are selected
- Include actions like Approve selected, Reject selected, Clear selection

Update cards:
- Each card should feel reviewable and slightly editorial
- Include:
  - Checkbox
  - Target icon for Jira or Notion
  - Object name, such as a Jira key or Notion page name
  - Update type label
  - Before / After diff view
  - Reasoning text
  - Confidence indicator
  - Approve / Reject buttons for pending items

Also visually support alternate card states:
- Approved
- Rejected
- Applied
- Failed

Make this screen feel like safe human-in-the-loop approval tooling, not like raw audit logs.
```

## 8. Agent Trace Screen

```text
Using the Kabanchik design brief above, design the “Agent Trace” screen for a project.

Goal:
Show how the agent processed a meeting, step by step, including tools, inputs, outputs, and run status.

Layout:
- Standard project sidebar on the left
- Main content should use a split-pane layout

Left pane:
- A vertical list of agent runs
- Header: “Agent Runs” with total count
- Each run item should include:
  - Meeting title
  - Date and time
  - Status badge
  - Duration
- Make the selected run clearly highlighted

Right pane:
- Detailed view for the selected run
- Header showing meeting title, run status, duration, total step count, and tool count
- Scrollable list of agent steps below

Step cards:
- Numbered step indicator
- Step title
- Step duration
- Expand / collapse affordance
- Inside expanded step body, show sections like:
  - Input
  - Output
  - Tool calls

Tool calls should look like compact technical cards with code-like content blocks, but still fit the polished product UI.

State requirements:
- The design should also support an empty state for when no run is selected

Visual tone:
- Technical, inspectable, trustworthy
- Clean and structured, not hacker-themed
- Good balance between product polish and engineering trace detail
```

## 9. Project Settings Screen

```text
Using the Kabanchik design brief above, design the “Project Settings” screen for a selected project.

Goal:
Let the user manage project configuration, connections, and sync behavior in a clear multi-section admin interface.

Layout:
- Standard project sidebar on the left
- Main content uses a two-column settings pattern:
  - Left: section navigation
  - Right: settings cards

Header:
- Title: Project Settings
- Subtitle explaining that the user can manage configuration, integrations, and sync behavior

Left-side settings navigation:
- General
- Google Account
- Jira
- Notion
- Sync Policy

Primary frame state:
- Show the General section as active

General section content:
- Card for editing project name
- Save action
- Separate danger zone card for deleting the project

The overall design must also support these additional section patterns:
- Google Account: connected Google Workspace account, connected badge, last sync info, and “Sync Now” action
- Jira: Jira base URL, token field, test connection action, success / error alerts
- Notion: Notion token or integration settings with test connection feedback
- Sync Policy: toggles or controls for sync behavior and automation rules

Design cues:
- Keep settings cards modular and clean
- The danger zone should be visibly distinct but not visually loud
- Form fields should feel consistent with the UI kit
- This should feel like serious internal product settings, not generic profile settings
```
