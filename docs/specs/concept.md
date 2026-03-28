# Telecom Scrum Agent — Концепция MVP

**Домен:** @municorn.com
**Сервисный аккаунт:** telecom.scrum.agent@municorn.com

---

## 1. Что делает продукт

Сервис на Cloud Run:

- подключается к **Google Calendar + Meet** через сервисный аккаунт `telecom.scrum.agent@municorn.com`
- подключается к **Jira** и **Notion** через MCP
- имеет **веб-интерфейс** (вход через Google OAuth, только @municorn.com)
- имеет **чатовый режим** с RAG по единой базе знаний
- после встречи: транскрибация, summary, action items, decisions
- предлагает обновления в Jira/Notion с подтверждением

---

## 2. Веб-приложение

4 раздела:

### Chat
- вопрос-ответ по единой базе знаний (встречи + Jira + Notion)
- ответы с ссылками на источники

### Meetings
- список встреч, статус обработки
- транскрипт, summary, action items
- связанные Jira issues и Notion pages

### Tasks / Sync
- предложенные изменения в Jira/Notion
- что применено, что ожидает подтверждения

### Agent Trace
- шаги агента, инструменты, источники данных, выводы

---

## 3. Доступ и авторизация

- **Вход:** Google OAuth, только пользователи @municorn.com
- **Calendar/Meet:** сервисный аккаунт `telecom.scrum.agent@municorn.com` с domain-wide delegation (calendar.readonly, meetings.space.readonly)
- **База знаний:** единая, без скоупов — все видят всё, все могут спрашивать и редактировать
- **Jira/Notion:** через MCP, общие API-токены

---

## 4. Интеграции

### Google Calendar + Meet
1. Сервисный аккаунт синхронизирует календари пользователей @municorn.com
2. Находит встречи с Meet-ссылкой
3. После встречи забирает транскрипт/recording/notes через Google APIs

### Jira
- Через Atlassian Remote MCP
- Чтение issues, предложение обновлений через human-in-the-loop

### Notion
- Через Notion Remote MCP
- Чтение страниц, создание meeting notes

---

## 5. Получение данных встречи (MVP)

**Основной путь:** нативные артефакты Google (транскрипты, записи, заметки).
Требует Google Workspace Business Plus+ с включённой транскрибацией.

**Fallback (post-MVP):** headless browser participant.

---

## 6. RAG и база знаний

Единая база знаний через **RAG-Anything** (LightRAG-based). Без разделения по пользователям — все данные доступны всей команде.

Индексируемые источники:
- транскрипты встреч
- summaries, decisions, action items
- Jira issues
- Notion pages

Knowledge graph строится автоматически (люди, встречи, задачи, решения, документы).

---

## 7. Пайплайн после встречи

1. **Ingest** — забрать metadata, transcript, notes
2. **Анализ** — summary, action items, decisions, blockers, owners
3. **Индексация** — всё в RAG-Anything
4. **Предложения** — обновления в Jira/Notion
5. **Подтверждение** — пользователь approve/reject через UI
6. **Sync** — применить подтверждённые изменения через MCP

---

## 8. Human-in-the-loop

Автоматически (без подтверждения):
- summary, link meeting ↔ issue, комментарии, пометка "mentioned in meeting"

Только после подтверждения:
- смена assignee, статуса, due date, estimate, description, создание subtasks

---

## 9. Технический стек (MVP)

| Компонент | Решение |
|-----------|---------|
| Backend | **FastAPI** (Python) |
| Agent Runtime | **LangGraph** (Supervisor → sub-agents) |
| LLM | **Anthropic Claude** |
| RAG | **RAG-Anything** (LightRAG-based) |
| MCP | **Atlassian Remote MCP** + **Notion Remote MCP** |
| DB | **SQLite** (операционные данные) |
| Storage | **Cloud Storage** (GCS FUSE mount) |
| Auth | **Google OAuth** (только @municorn.com) |
| Deploy | **Cloud Run** |
| Scheduler | **Cloud Scheduler** (sync + backup) |

---

## 10. Roadmap

### MVP
- Google login (@municorn.com only)
- Calendar sync через сервисный аккаунт
- Ingest meeting artifacts
- RAG-чат по встречам + Jira + Notion
- Suggested Jira/Notion updates + approval

### v2 — Meeting Intelligence
- Diarization (кто говорил)
- OCR/screenshots со screen share
- Cross-meeting memory

### v3 — Real-time Assistant
- Live meeting assistant
- Live action item detection
- Подсказки фасилитатору

---

## 11. Итог

> Платформа для анализа встреч, работы с базой знаний и контролируемого обновления Jira/Notion. Единая база знаний для всей команды @municorn.com.
