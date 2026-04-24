# Telecom Scrum Agent — Концепция MVP

**Домен:** `@municorn.com`  
**Сервисный аккаунт:** `telecom.scrum.agent@municorn.com`

---

## 1. Что делает продукт

Локальный сервис в Docker Compose, который:

- подключается к **Google Calendar + Meet** через сервисный аккаунт,
- подключается к **Jira** и **Notion** через MCP,
- имеет **веб-интерфейс** с Google OAuth только для `@municorn.com`,
- поддерживает **чат по единой базе знаний**,
- после встречи строит summary, action items, decisions и blockers,
- предлагает изменения в Jira/Notion с human-in-the-loop подтверждением,
- сохраняет trace действий агентов и handoff между ними.

---

## 2. Архитектура продукта

Приложение состоит из двух сервисов:

- `backend` — один Python контейнер с FastAPI, DeepAgents runtime, background jobs, SQLite, RAG, MCP adapters и trace persistence.
- `frontend` — Next.js интерфейс.

Общий каталог `./data` монтируется только в `backend`.

---

## 3. Агентная модель MVP

В MVP есть ровно 3 агента:

### `meeting_participation`
- синхронизирует встречи из Google Calendar/Meet,
- нормализует артефакты встречи,
- вызывает OpenAI для анализа встречи,
- индексирует результаты в RAG.

### `user_chat`
- отвечает на пользовательские вопросы,
- ищет контекст в RAG,
- при необходимости запрашивает актуальный Jira/Notion контекст,
- формирует финальный ответ с citations.

### `jira_notion`
- владеет всеми Jira/Notion MCP read/write операциями,
- создаёт staged updates,
- создаёт или дополняет meeting notes,
- применяет только явно одобренные рискованные изменения.

---

## 4. Веб-приложение

Основные разделы:

### Chat
- вопрос-ответ по встречам, Jira и Notion,
- ответы с citations и source provenance.

### Meetings
- список встреч и статус обработки,
- transcript, summary, action items, decisions,
- связанные Jira issues и Notion pages.

### Updates
- staged изменения в Jira/Notion,
- approve/reject/apply flow,
- видимая причина, почему изменение было предложено.

### Settings
- интеграционные настройки,
- секреты не возвращаются в открытом виде.

### Agent Trace
- шаги runtime,
- handoff между агентами,
- используемые инструменты и результаты.

---

## 5. Доступ и авторизация

- **Вход:** Google OAuth, только пользователи `@municorn.com`.
- **Calendar/Meet:** сервисный аккаунт с domain-wide delegation.
- **База знаний:** единая для команды в рамках MVP.
- **Jira/Notion:** общие токены через MCP adapters backend-сервиса.

---

## 6. Интеграции

### Google Calendar + Meet
1. Сервисный аккаунт синхронизирует календари пользователей домена.
2. Находит события с Meet-ссылкой.
3. После встречи получает transcript и notes metadata через Google APIs.

### Jira
- доступ только через Atlassian MCP adapter,
- чтение контекста и staged update proposals,
- рискованные write-операции только после approve.

### Notion
- доступ только через Notion MCP adapter,
- чтение контекста,
- создание или дополнение meeting notes,
- более широкие write-операции только после approve.

---

## 7. Пайплайны

### После встречи

1. `meeting_participation` получает metadata и artifacts.
2. Анализирует встречу через OpenAI.
3. Индексирует transcript и analysis в RAG.
4. При наличии внешних ссылок или кандидатов на sync вызывает `jira_notion`.
5. `jira_notion` создаёт staged Jira/Notion updates.
6. Пользователь подтверждает или отклоняет изменения в UI.

### Чат

1. `user_chat` делает retrieval из RAG.
2. При необходимости передаёт запрос в `jira_notion` за live Jira/Notion context.
3. `user_chat` собирает финальный ответ и citations.

---

## 8. Human-in-the-loop

Автоматически:
- локальные связи meeting ↔ issue/page,
- локальный tag `mentioned-in-meeting`,
- create/append meeting notes в разрешённом Notion parent,
- сохранение proposed updates и trace.

Только после подтверждения:
- assignee/status/due date/estimate/priority/description в Jira,
- крупные edit-операции в Notion,
- иные неидемпотентные внешние изменения.

---

## 9. Технический стек MVP

| Компонент | Решение |
|-----------|---------|
| Backend | **FastAPI** |
| Agent Runtime | **DeepAgents runtime** |
| LLM | **OpenAI** |
| RAG | **RAG-Anything** |
| MCP | **Atlassian MCP** + **Notion MCP** |
| DB | **SQLite** |
| Storage | **локальный `./data` volume** |
| Auth | **Google OAuth** |
| Deploy | **Docker Compose (local MVP)** |

---

## 10. Roadmap

### MVP
- Google login (`@municorn.com` only)
- Calendar/Meet ingest
- единая RAG база знаний
- chat с citations
- staged Jira/Notion updates + approval
- trace runtime handoff и tool use

### Post-MVP
- diarization,
- OCR/screenshots,
- cross-meeting memory,
- production hardening,
- live assistant scenarios.

---

## 11. Итог

> Платформа для анализа встреч, общей базы знаний и контролируемого обновления Jira/Notion, где orchestration выполняется внутри одного backend+agents контейнера с тремя специализированными агентами.
