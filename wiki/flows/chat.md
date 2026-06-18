---
type: flow
title: "Chat"
status: implemented
created: 2026-05-10
updated: 2026-06-18
tags: [flow, chat, sse]
---

# Chat

User asks a question through the [[domains/frontend]] chat surface. Backend
streams the answer over SSE. **Implemented** end-to-end (ScrumAgent-r0k / 2jb,
2026-06-18).

## SSE event contract

The router (`POST /projects/{id}/chat`) emits these events in order:

| Event | Payload | Notes |
|---|---|---|
| `meta` | `{conversation_id, run_id}` | First event; client binds the active conversation and trace run |
| `token` | `{delta}` | One event per streamed token delta; many events |
| `citations` | `{items: [{source_kind, source_id, title, source_uri, score}]}` | Single event after all tokens |
| `done` | `{message_id}` | Successful end; persisted assistant message id for Remember |
| `error` | `{detail}` | Replaces `done` on failure |

## Pipeline (deterministic, NOT a tool-loop)

```text
START
  → retrieve(project_id, question, k)   ← rag.py
  ↓
  [empty context?]
  → YES: emit fixed "not in knowledge base" message; ZERO LLM calls; done
  → NO:
      → grounded prompt (numbered passages + last 10 history msgs)
      → stream tokens via LlmGateway
      → emit token events
      → emit citations event
      → done
```

The retrieve-first step is **unconditional** — the agent never calls the LLM
before checking the knowledge base. This is the structural anti-hallucination
guarantee by construction: answers are only generated from retrieved passages.

## Jira/Notion handoff (designed, unused this slice)

The orchestrator handoff mechanism exists in
[[modules/runtime-orchestrator]], and the `jira_notion` path is designed:

```text
[optional, future]
  user_chat → jira_notion (live context fetch) → user_chat (compose answer)
```

This handoff is not active in the current slice. The `user_chat` agent operates
purely from RAG context for now.

## Remember write-back loop

After a chat answer is saved, the user can press "Remember" on any assistant
message. This triggers `POST /projects/{id}/chat/messages/{mid}/remember`:

1. `clear_source(project_id, "note", message_id)` — remove any prior version of
   this Q+A from the index (dedup).
2. `index_documents(project_id, [{text: Q+A, file_source: ...}])` — push the
   question + answer back into LightRAG so future retrieval can surface it.

## Conversation ownership

- Conversations are **private to their owner** (JWT `user_id`).
- Conversations are **project-scoped** (`project_id` FK, NOT NULL, indexed on
  `Conversation`).
- `GET /projects/{id}/conversations` returns the calling user's conversations
  only.
- `GET /projects/{id}/conversations/{cid}/messages` returns messages for a
  conversation the caller owns.

## Boundaries

- `user_chat` cannot make external writes.
- RAG retrieval enforces project scope (only passages tagged `"{project_id}::"`)
  — no cross-project leakage.
- The [[modules/runtime-orchestrator]] `GatedServices` proxy enforces the
  read-only capability allow-list for `user_chat`.

## Trace

All steps logged in [[modules/trace-store]] for the Agent Trace UI.
