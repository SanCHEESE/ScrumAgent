---
type: concept
title: "Human-in-the-loop"
status: mature
created: 2026-05-10
updated: 2026-05-10
tags: [concept, safety, hitl]
---

# Human-in-the-loop

The core safety property of the system: **no risky external write happens without explicit user approval**.

## What is automatic

- Local link between meeting ↔ external object (issue / page).
- Local metadata tags (e.g. `mentioned-in-meeting`).
- Create / append meeting notes in a permitted Notion parent.
- Saving proposed updates and trace records.

## What requires approval

- Jira **assignee, status, due date, estimate, priority, description** changes.
- **Larger Notion edits** beyond the meeting-note append pattern.
- Any other non-idempotent external write.

## How it's enforced

- Only the `jira_notion` agent can perform external writes ([[domains/agents]]).
- The agent only **stages** risky updates; the [[domains/frontend]] Updates screen is the approval surface.
- The [[modules/runtime-orchestrator]] records every staged update in [[modules/trace-store]] alongside the run that produced it.

## Why this property is fragile under change

It only holds because [[decisions/2026-03-27-three-agents-only]] keeps the external-write surface to one agent. Any new agent that touches externals must re-prove this property.
