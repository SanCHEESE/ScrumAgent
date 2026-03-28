# Техническая архитектура Telecom Scrum Agent (локальный деплой)

## 1. Цель архитектуры

Построить локально запускаемую систему, которая:

- подключается к Google Calendar / Meet через сервисный аккаунт
- получает артефакты встречи (транскрипты, заметки, записи)
- строит summary, action items, decisions через LLM
- индексирует всё в единую knowledge base (RAG-Anything)
- даёт чатовый интерфейс с RAG по встречам + Jira + Notion
- предлагает или применяет изменения в Jira/Notion через MCP
- ведёт agent trace

---

## 2. High-level архитектура

Два Docker-контейнера + общий volume для данных:

```
docker-compose
├── backend      FastAPI + LangGraph + RAG-Anything + SQLite
├── frontend     Next.js 14 + TypeScript + Tailwind + shadcn/ui
└── ./data/      монтируется как volume (db, rag-index, keys)
```

OAuth flow проходит через FastAPI, JWT передаётся на фронт.

---

## 3. Структура проекта

```
telecom-scrum-agent/
├── docker-compose.yml
├── .env.example
├── backend/
│   ├── Dockerfile
│   ├── requirements.txt
│   └── app/
│       ├── main.py            FastAPI app + роуты
│       ├── auth.py            Google OAuth + JWT
│       ├── database.py        SQLAlchemy / SQLite
│       ├── models.py          ORM-модели
│       ├── settings_store.py  настройки из env
│       ├── rag.py             RAG-Anything обёртка
│       ├── calendar_sync.py   Google Calendar / Meet
│       ├── core.py            LangGraph supervisor + AgentState
│       ├── mcp_clients.py     Jira + Notion MCP клиенты
│       └── modules/scrum/
│           ├── meeting_agent.py
│           ├── rag_agent.py
│           ├── jira_agent.py
│           ├── notion_agent.py
│           └── chat_agent.py
├── frontend/
│   ├── Dockerfile
│   ├── package.json
│   ├── next.config.ts
│   ├── tailwind.config.ts
│   ├── tsconfig.json
│   └── src/
│       ├── app/
│       │   ├── layout.tsx
│       │   ├── page.tsx
│       │   ├── auth/callback/page.tsx
│       │   ├── chat/page.tsx
│       │   ├── meetings/page.tsx
│       │   ├── meetings/[id]/page.tsx
│       │   ├── updates/page.tsx
│       │   └── settings/page.tsx
│       ├── components/
│       │   ├── Nav.tsx
│       │   └── AuthGuard.tsx
│       └── lib/
│           ├── api.ts
│           └── auth.ts
├── data/
│   ├── db/          SQLite база
│   ├── rag/         RAG-Anything индексы
│   └── keys/        service account JSON
└── backend/tests/
```

---

## 4. Компоненты

### 4.1 Frontend — Next.js

**Назначение:** пользовательский интерфейс.

**Стек:**
- Next.js 14 (App Router)
- TypeScript
- Tailwind CSS + shadcn/ui
- SSE для стриминга чата

**Экраны:**
- Google login
- Chat — вопрос-ответ по базе знаний
- Meetings — список встреч, статус обработки
- Meeting detail — транскрипт, summary, action items, связанные Jira/Notion
- Updates — предложенные изменения, approve/reject
- Settings — настройки интеграций

---

### 4.2 Backend — FastAPI

**Назначение:** единая точка API для фронта.

**Функции:**
- проверка JWT
- REST эндпоинты для meetings / chat / updates / settings
- SSE для стриминга chat-ответов
- запуск background jobs (calendar sync, meeting ingest)
- оркестрация запросов к LangGraph и RAG

**Технологии:**
- FastAPI + uvicorn
- python-jose (JWT)
- CORS middleware

---

### 4.3 Auth

**Функции:**
- Google OAuth 2.0 (только @municorn.com)
- JWT выдаётся на фронт после успешного OAuth
- Сервисный аккаунт `telecom.scrum.agent@municorn.com` с domain-wide delegation для Calendar/Meet

---

### 4.4 Calendar / Meet Adapter (`calendar_sync.py`)

**Функции:**
- синхронизация событий Google Calendar
- обнаружение встреч с Meet-ссылкой
- получение нативных артефактов: transcript, recording, notes (требует Workspace Business Plus+)
- создание meeting record в SQLite

---

### 4.5 Agent Runtime — LangGraph (`core.py`)

**Архитектура:** Supervisor → sub-agents через AgentRegistry.

**Sub-agents:**
- `meeting_agent` — ingest и анализ встречи
- `rag_agent` — индексация в RAG-Anything
- `jira_agent` — чтение и предложения в Jira через MCP
- `notion_agent` — чтение и запись в Notion через MCP
- `chat_agent` — RAG-чат с retrieval и citations

**AgentState** передаётся между узлами графа, содержит контекст meeting / query / retrieval results.

---

### 4.6 RAG / Knowledge Base (`rag.py`)

**Инструмент:** RAG-Anything (LightRAG-based).

**Индексируемые источники:**
- транскрипты встреч
- summaries, decisions, action items
- Jira issues + comments
- Notion pages

**Retrieval:** гибридный — semantic + keyword, автоматический knowledge graph.

**Хранение:** файловая система (`/data/rag/`), персистентность через Docker volume.

---

### 4.7 MCP Clients (`mcp_clients.py`)

- **Atlassian Remote MCP** — Jira: чтение issues, предложение обновлений
- **Notion Remote MCP** — чтение страниц, создание meeting notes

---

### 4.8 Human-in-the-loop

Автоматически (без подтверждения):
- добавление summary как комментария к issue
- линк meeting ↔ issue
- тег "mentioned-in-meeting"
- создание meeting notes в Notion

Только после подтверждения пользователем:
- смена assignee, статуса, due date, estimate
- изменение description
- создание subtasks

---

## 5. База данных — SQLite

**ORM:** SQLAlchemy, файл в `/data/db/dev.db`.

### Основные таблицы

#### auth
- `users` — id, email, name, google_id, created_at

#### meetings
- `meetings` — id, calendar_event_id, meet_link, title, start_at, end_at, status, transcript_status, analysis_status
- `meeting_participants` — meeting_id, email, display_name
- `meeting_speaker_segments` — meeting_id, speaker, start_ms, end_ms, text, confidence
- `meeting_summaries` — meeting_id, summary_text, created_at
- `meeting_decisions` — meeting_id, text, confidence
- `meeting_action_items` — meeting_id, owner_email, text, due_date, confidence, status, linked_jira_issue_id

#### sync
- `proposed_updates` — id, target_system (jira/notion), target_object_id, update_type, before_json, after_json, reasoning_summary, confidence, approval_status
- `sync_operations` — id, proposed_update_id, status, result, created_at

#### observability
- `agent_runs` — id, meeting_id, agent_name, status, created_at
- `agent_steps` — agent_run_id, step_name, input_json, output_json, tool_calls, created_at

---

## 6. Пайплайн после встречи

```
calendar_sync.py
  → meeting detected → meeting record created
  → ingest job (meeting_agent):
      1. fetch artifacts (transcript, notes) via Google APIs
      2. LLM analysis: summary, action items, decisions, blockers, owners
      3. index everything into RAG-Anything (rag_agent)
      4. propose Jira/Notion updates (jira_agent, notion_agent)
      5. save agent trace (agent_runs, agent_steps)
  → UI: meeting available, updates pending approval
  → user approve/reject → sync_operations → MCP apply
```

---

## 7. Чатовый режим

```
user query
  → chat_agent:
      1. RAG retrieval (meetings + Jira + Notion)
      2. LLM response generation
      3. citations assembly
  → SSE streaming to frontend
  → show: answer + citations + sources
```

---

## 8. Переменные окружения

```bash
# Google OAuth
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
ALLOWED_DOMAIN=municorn.com

# Anthropic
ANTHROPIC_API_KEY=

# App
SECRET_KEY=
BACKEND_URL=http://localhost:8000
FRONTEND_URL=http://localhost:3000

# Paths (внутри контейнера)
DATABASE_URL=sqlite:////data/db/dev.db
RAG_STORAGE_PATH=/data/rag
SA_KEY_PATH=/data/keys/sa_key.json
```

---

## 9. Деплой

### Локально (MVP)

```bash
cp .env.example .env
# заполнить .env
# положить service account key в data/keys/sa_key.json
docker compose up --build
```

- Backend: `http://localhost:8000`
- Frontend: `http://localhost:3000`

### Требования к хосту
- Docker + Docker Compose
- Google Workspace Business Plus+ (для нативных транскриптов)
- Service account с domain-wide delegation

---

## 10. Безопасность

- Google OAuth ограничен доменом `@municorn.com`
- JWT с коротким TTL, проверяется на каждый запрос
- Service account key хранится в `data/keys/` (не в репозитории)
- Данные не выходят за пределы локальной машины
- Proposed updates в Jira/Notion только после явного approve

---

## 11. Observability

- Структурированные логи FastAPI
- Agent trace сохраняется в SQLite (`agent_runs`, `agent_steps`)
- Просмотр trace в UI (Agent Trace экран)

---

## 12. Этапы внедрения

### Этап 1 — Foundations (MVP)
- Google login (@municorn.com only)
- Calendar sync через сервисный аккаунт
- Ingest meeting artifacts
- RAG-чат по встречам + Jira + Notion
- Suggested Jira/Notion updates + approval UI

### Этап 2 — Meeting Intelligence
- Diarization (кто говорил)
- OCR/screenshots со screen share
- Cross-meeting memory
- Headless browser fallback (если нет нативных артефактов)

### Этап 3 — Production Deploy
- Перенос на Cloud Run + GCS FUSE mount
- Managed Redis для очередей
- Autoscaling workers

### Этап 4 — Real-time
- Live meeting assistant
- Live action item detection
- In-meeting prompts
