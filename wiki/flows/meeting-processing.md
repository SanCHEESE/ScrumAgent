---
type: flow
title: "Meeting processing"
created: 2026-05-10
updated: 2026-05-10
tags: [flow, meeting, pipeline]
---

# Meeting processing

Triggered after a Google Meet event ends.

```text
START
  -> meeting_participation
  -> [optional] jira_notion
  -> END
```

## Steps

1. [[modules/calendar-sync]] retrieves transcript + notes metadata for the event.
2. `meeting_participation` agent normalizes artifacts and persists into SQLite.
3. Agent calls [[modules/llm-gateway]] for analysis (summary, action items, decisions, blockers).
4. Results indexed into [[modules/rag]] with citation metadata.
5. If analysis surfaces external references or update candidates, [[modules/runtime-orchestrator]] hands off to `jira_notion`.
6. `jira_notion` reads live Jira/Notion context, then **stages** updates and meeting-note actions.
7. Run terminates; staged updates appear in the [[domains/frontend]] Updates screen.

## Trace

Every step recorded in [[modules/trace-store]]. Visible in the Agent Trace UI.

## Related

- [[concepts/human-in-the-loop]] — why staging exists.
- [[domains/agents]] — capability boundaries that make the handoff safe.
