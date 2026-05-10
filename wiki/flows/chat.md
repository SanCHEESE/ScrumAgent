---
type: flow
title: "Chat"
created: 2026-05-10
updated: 2026-05-10
tags: [flow, chat, sse]
---

# Chat

User asks a question through the [[domains/frontend]] chat surface. Backend streams the answer over SSE.

```text
START
  -> user_chat
  -> [optional] jira_notion
  -> user_chat
  -> END
```

## Steps

1. `user_chat` retrieves passages from [[modules/rag]] (with citations).
2. If RAG is insufficient and the question requires live Jira/Notion data, the [[modules/runtime-orchestrator]] hands off to `jira_notion` for read-only context.
3. Control returns to `user_chat`, which composes the final answer.
4. Answer is streamed via SSE; citations are included in the payload.

## Boundaries

- `user_chat` cannot do external writes.
- `jira_notion` cannot compose the final answer — it only fetches context and hands back.

## Trace

All steps logged in [[modules/trace-store]] for the Agent Trace UI.
