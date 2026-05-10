# Техническая архитектура Telecom Scrum Agent (локальный деплой)

## 1. Цель архитектуры

Построить локально запускаемую систему, которая:

- подключается к Google Calendar и Meet через сервисный аккаунт,
- получает артефакты встречи и строит summary, action items, decisions и blockers,
- индексирует данные в общую knowledge base на RAG-Anything,
- даёт чатовый интерфейс по встречам, Jira и Notion,
- предлагает изменения в Jira/Notion через MCP,
- сохраняет trace runtime и handoff между агентами.

---

## 2. High-level архитектура

Два Docker Compose сервиса и общий volume для данных:

```text
docker-compose
├── backend      FastAPI + DeepAgents runtime + 3 agents + SQLite + RAG + MCP
├── frontend     Next.js 14 + TypeScript + Tailwind + shadcn/ui
└── ./data/      db, rag, keys (mounted into backend only)
```

`backend` — один контейнер для API, background jobs и всех агентов.  
`frontend` — отдельный UI контейнер.  
OAuth flow проходит через FastAPI, JWT передаётся на фронт после callback.

---

## 3. Структура проекта

```text
telecom-scrum-agent/
├── docker-compose.yml
├── .env.example
├── backend/
│   ├── Dockerfile
│   ├── requirements.txt
│   ├── pytest.ini
│   └── app/
│       ├── main.py
│       ├── config.py
│       ├── auth.py
│       ├── deps.py
│       ├── database.py
│       ├── models.py
│       ├── llm.py
│       ├── rag.py
│       ├── calendar_sync.py
│       ├── mcp_clients.py
│       ├── trace_store.py
│       ├── runtime/
│       │   ├── contracts.py
│       │   └── orchestrator.py
│       ├── agents/
│       │   ├── meeting_participation.py
│       │   ├── user_chat.py
│       │   └── jira_notion.py
│       └── routers/
│           ├── auth.py
│           ├── chat.py
│           ├── meetings.py
│           ├── updates.py
│           ├── settings.py
│           └── trace.py
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

---

## 4. Компоненты

### 4.1 Frontend — Next.js

**Назначение:** пользовательский интерфейс.

**Функции:**
- login callback,
- chat с SSE,
- meetings list и detail,
- review staged updates,
- settings,
- trace viewer.

### 4.2 Backend — FastAPI

**Назначение:** единая точка API и orchestration boundary.

**Функции:**
- JWT auth,
- REST endpoints для meetings, updates, settings и trace,
- SSE endpoint для chat,
- запуск background jobs,
- доступ к runtime orchestrator и shared services.

### 4.3 OpenAI gateway

`llm.py` отвечает за:
- инициализацию `ChatOpenAI`,
- конфигурацию через `OPENAI_MODEL`,
- fail-fast поведение при отсутствии `OPENAI_API_KEY`,
- небольшие app-owned helper функции для meeting analysis и chat generation.

### 4.4 Calendar / Meet adapter

`calendar_sync.py` отвечает за:
- sync Calendar events,
- фильтрацию событий без Meet links,
- получение transcript и notes metadata,
- нормализацию meeting artifacts в SQLite.

### 4.5 DeepAgents runtime

`runtime/contracts.py` определяет:
- `RunMode`,
- `AgentName`,
- `RunContext`,
- handoff target,
- формат trace event и proposed update payload.

`runtime/orchestrator.py` отвечает за:
- запуск и завершение run,
- handoff policy,
- shared services,
- защиту от неконтролируемых agent-to-agent вызовов,
- запись trace.

### 4.6 Агенты

#### `meeting_participation`
- ingest meeting artifacts,
- meeting analysis через OpenAI,
- запись результатов в SQLite,
- indexing в RAG.

**Не может:** работать с Jira/Notion MCP.

#### `user_chat`
- RAG retrieval,
- формирование финального ответа,
- решение, нужен ли handoff к `jira_notion`,
- streaming SSE ответа.

**Не может:** делать прямые external writes.

#### `jira_notion`
- все Jira/Notion MCP reads,
- staged update generation,
- create/append meeting notes,
- apply approved external changes.

**Не может:** читать Google artifacts или генерировать финальный chat answer.

### 4.7 RAG / Knowledge Base

`rag.py` предоставляет небольшой app-owned API:
- индексирование transcript, summary, decisions, action items,
- retrieval с нормализованными citations,
- хранение в `RAG_STORAGE_PATH`.

### 4.8 MCP clients

`mcp_clients.py` инкапсулирует:
- Atlassian MCP connection,
- Notion MCP connection,
- tool caching,
- normalization of tool results.

### 4.9 Trace store

`trace_store.py` сохраняет:
- run lifecycle,
- agent handoff,
- tool use,
- input/output payloads,
- final status.

---

## 5. Workflow

### 5.1 Meeting processing

```text
START
  -> meeting_participation
  -> optional jira_notion
  -> END
```

Сценарий:
1. `meeting_participation` получает transcript и metadata.
2. Строит analysis через OpenAI.
3. Индексирует результаты в RAG.
4. При наличии Jira/Notion references или update candidates orchestrator передаёт run в `jira_notion`.
5. `jira_notion` создаёт staged updates и meeting note actions.

### 5.2 Chat

```text
START
  -> user_chat
  -> optional jira_notion
  -> user_chat
  -> END
```

Сценарий:
1. `user_chat` делает retrieval из RAG.
2. Если нужен live Jira/Notion context, orchestrator вызывает `jira_notion`.
3. `user_chat` формирует финальный ответ с citations.

---

## 6. База данных

SQLite в `/data/db/dev.db`.

Основные таблицы:
- `users`
- `meetings`
- `meeting_artifacts`
- `meeting_summaries`
- `meeting_decisions`
- `meeting_action_items`
- `proposed_updates`
- `sync_operations`
- `agent_runs`
- `agent_steps`
- `settings`

`agent_runs` и `agent_steps` должны быть готовы до UI trace functionality.

---

## 7. Human-in-the-loop

Автоматически:
- локальная связь meeting ↔ external object,
- local metadata tags,
- create/append meeting notes,
- сохранение proposed updates.

Только после approve:
- Jira assignee/status/due date/estimate/priority/description,
- Notion edits beyond note append,
- любые неидемпотентные external writes.

Единственная точка применения risky changes — `jira_notion`.

---

## 8. Переменные окружения

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

---

## 9. Деплой

### Локально

```bash
cp .env.example .env
# заполнить переменные
# положить service account key в data/keys/sa_key.json
docker compose up --build
```

- Backend: `http://localhost:8000`
- Frontend: `http://localhost:3000`

Требования:
- Docker + Docker Compose
- Google Workspace с доступом к нативным meeting artifacts
- Service account с domain-wide delegation

---

## 10. Безопасность

- Google OAuth ограничен доменом `@municorn.com`.
- JWT проверяется на каждый запрос.
- Service account key лежит в `data/keys/` и не попадает в репозиторий.
- Секреты не возвращаются через settings API.
- Рискованные Jira/Notion writes невозможны без approve.

---

## 11. Observability

- структурированные логи FastAPI,
- trace run lifecycle в SQLite,
- handoff и tool-call audit trail,
- UI экран Agent Trace для просмотра runtime.

---

## 12. Этапы внедрения

### Этап 1 — Local MVP
- auth,
- ingest Google Calendar/Meet,
- RAG knowledge base,
- DeepAgents runtime,
- staged Jira/Notion updates,
- trace UI.

### Этап 2 — Post-MVP Intelligence
- diarization,
- OCR/screenshots,
- richer memory across meetings.

### Этап 3 — Production hardening
- deployment hardening,
- queue separation if needed,
- scaling and operational safeguards.
