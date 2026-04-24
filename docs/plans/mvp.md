# Telecom Scrum Agent — MVP Implementation Plan

> **For agentic workers:** use `docs/plans/mvp_v2.md` as the authoritative execution contract. This file is a condensed MVP-aligned plan and must not contradict `mvp_v2`.

**Goal:** Локально запускаемый Telecom Scrum Agent с DeepAgents runtime, OpenAI-only LLM слоем, ingest из Google Calendar и Meet, общей базой знаний на RAG-Anything, Jira и Notion через MCP и Next.js интерфейсом для chat, meetings, updates, settings и trace.

**Architecture:** Два Docker Compose сервиса и общий каталог `./data`. `backend` — единый Python-контейнер, где живут FastAPI, background jobs, runtime DeepAgents, все 3 агента, SQLite, RAG, MCP-адаптеры и trace persistence. `frontend` — Next.js приложение, которое ходит только в backend по HTTP и SSE.

**Tech Stack:**
- Backend: FastAPI, Uvicorn, SQLAlchemy, SQLite, OpenAI через `langchain-openai`, DeepAgents runtime, RAG-Anything, MCP Python client, `langchain-mcp-adapters`, Google auth/API clients, python-jose.
- Frontend: Next.js 14, TypeScript, Tailwind CSS, shadcn/ui.
- Runtime: Docker Compose, `./data/db`, `./data/rag`, `./data/keys`.

---

## 1. Структура проекта

```text
telecom-scrum-agent/
├── docker-compose.yml
├── .env.example
├── backend/
│   ├── Dockerfile
│   ├── requirements.txt
│   ├── pytest.ini
│   ├── app/
│   │   ├── main.py
│   │   ├── config.py
│   │   ├── auth.py
│   │   ├── deps.py
│   │   ├── database.py
│   │   ├── models.py
│   │   ├── llm.py
│   │   ├── rag.py
│   │   ├── calendar_sync.py
│   │   ├── mcp_clients.py
│   │   ├── trace_store.py
│   │   ├── runtime/
│   │   │   ├── contracts.py
│   │   │   └── orchestrator.py
│   │   ├── agents/
│   │   │   ├── meeting_participation.py
│   │   │   ├── user_chat.py
│   │   │   └── jira_notion.py
│   │   └── routers/
│   │       ├── auth.py
│   │       ├── chat.py
│   │       ├── meetings.py
│   │       ├── updates.py
│   │       ├── settings.py
│   │       └── trace.py
├── frontend/
│   ├── Dockerfile
│   ├── package.json
│   └── src/
│       ├── app/
│       ├── components/
│       └── lib/
└── data/
    ├── db/
    ├── rag/
    └── keys/
```

Правила:
- `./data` монтируется только в `backend`.
- Отдельного контейнера для агентов нет.
- Frontend не обращается к агентам напрямую.

---

## 2. Контракт окружения

`.env.example` должен содержать:

```bash
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
ALLOWED_DOMAIN=municorn.com
GOOGLE_WORKSPACE_SUBJECT=
SA_KEY_PATH=/data/keys/sa_key.json

OPENAI_API_KEY=
OPENAI_MODEL=gpt-4.1-mini

SECRET_KEY=change-me-in-production
BACKEND_URL=http://localhost:8000
FRONTEND_URL=http://localhost:3000

DATABASE_URL=sqlite:////data/db/dev.db
RAG_STORAGE_PATH=/data/rag

ATLASSIAN_MCP_URL=https://mcp.atlassian.com/v1/sse
ATLASSIAN_API_TOKEN=
NOTION_MCP_URL=https://mcp.notion.com/v1/sse
NOTION_TOKEN=
```

Ограничения:
- `ANTHROPIC_API_KEY` не используется.
- Отсутствие `OPENAI_API_KEY` должно приводить к понятной ошибке в runtime при попытке использовать LLM.
- Тесты не должны зависеть от живых OpenAI, Google, Jira или Notion вызовов.

---

## 3. DeepAgents Runtime

В MVP есть ровно 3 агента:

### `meeting_participation`
- синхронизирует встречи из Calendar и Meet,
- получает transcript/notes metadata,
- строит summary, action items, decisions и blockers через OpenAI,
- индексирует meeting artifacts в RAG.

Разрешённые инструменты:
- Google adapters,
- OpenAI analysis helpers,
- RAG write interface,
- trace store.

Запрещено:
- прямой доступ к Jira и Notion MCP,
- генерация финального ответа пользователю.

### `user_chat`
- обрабатывает интерактивный chat,
- делает retrieval из RAG,
- решает, нужен ли живой Jira/Notion контекст,
- формирует финальный ответ с citations,
- стримит SSE события.

Разрешённые инструменты:
- OpenAI chat helpers,
- RAG read interface,
- handoff к `jira_notion`,
- trace store.

Запрещено:
- доступ к Google Calendar/Meet,
- прямые Jira/Notion write операции.

### `jira_notion`
- владеет всем Jira/Notion MCP доступом,
- делает read и staged write операции,
- создаёт proposed updates,
- создаёт или дополняет meeting notes,
- применяет только одобренные изменения.

Разрешённые инструменты:
- Atlassian MCP adapter,
- Notion MCP adapter,
- approval-policy checker,
- trace store.

Запрещено:
- доступ к Google ingest,
- финальная генерация chat answer.

---

## 4. Основные workflow

### После встречи

```text
START
  -> meeting_participation
  -> optional jira_notion
  -> END
```

- `meeting_participation` всегда первый.
- `jira_notion` вызывается только если есть упоминания Jira/Notion объектов или нужны staged updates.

### Чат

```text
START
  -> user_chat
  -> optional jira_notion
  -> user_chat
  -> END
```

- Финальный ответ всегда формирует `user_chat`.
- Рискованные внешние изменения возможны только через `jira_notion` после approve.

---

## 5. Последовательность внедрения

1. Scaffold и config.
2. SQLite models и trace tables.
3. Google OAuth и JWT.
4. OpenAI gateway.
5. Runtime contracts, orchestrator и trace store.
6. Google Calendar/Meet adapter.
7. RAG service.
8. MCP adapter layer.
9. `meeting_participation`.
10. `jira_notion` и updates API.
11. `user_chat` и chat SSE API.
12. Meetings API и background jobs.
13. Settings и trace API.
14. Frontend API/auth helpers.
15. Frontend shell и основные экраны.
16. Docker smoke и финальный quality gate.

---

## 6. Human-in-the-loop

Автоматически:
- create or append meeting notes в Notion,
- локально связать meeting с Jira/Notion объектами,
- сохранить proposed updates и trace.

Только после подтверждения:
- Jira assignee, status, due date, estimate, priority, description,
- правки Notion beyond note append,
- неидемпотентные внешние операции.

Политика подтверждения реализуется только в `jira_notion`.

---

## 7. Definition Of Done

MVP завершён, когда:

1. Пользователь `@municorn.com` может войти.
2. Backend синхронизирует Calendar события с Meet links.
3. Meeting processing идёт через DeepAgents runtime с `meeting_participation` и optional `jira_notion`.
4. Transcript, summary, decisions и action items сохраняются в SQLite.
5. Meeting artifacts индексируются в RAG-Anything.
6. Chat использует `user_chat`, возвращает citations и при необходимости получает Jira/Notion context через `jira_notion`.
7. Jira/Notion updates staged, reviewable и требуют approve перед рискованной записью.
8. UI показывает Chat, Meetings, Updates, Settings и Agent Trace.
9. Тесты backend/frontend, build и Docker smoke проходят.
