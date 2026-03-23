# Техническая архитектура скрам-агента для Google Meet, Jira и Notion

## 1. Цель архитектуры

Построить отказоустойчивую систему, которая:

- подключается к Google Calendar / Meet
- получает артефакты встречи или raw media
- строит транскрипт и speaker attribution
- извлекает контекст из Notion и Jira
- индексирует всё в единую knowledge base
- даёт чатовый интерфейс с RAG
- предлагает или применяет изменения в Jira/Notion
- ведёт audit trail и agent trace

---

## 2. High-level архитектура

Систему стоит разделить на следующие домены:

1. **Web App**
2. **API / BFF**
3. **Auth & Integration Layer**
4. **Meeting Orchestration**
5. **Media Processing Pipeline**
6. **Knowledge & Retrieval Layer**
7. **Agent Runtime**
8. **Sync / Action Layer**
9. **Observability / Audit / Security**

---

## 3. Сервисы

## 3.1 Web App

### Назначение
Пользовательский интерфейс.

### Функции
- Google login
- дашборд встреч
- чат
- просмотр транскриптов
- просмотр action items
- просмотр предложенных изменений в Jira/Notion
- подтверждение изменений
- просмотр agent trace
- настройки источников и политик

### Рекомендуемый стек
- **Next.js**
- **TypeScript**
- SSR + client streaming
- WebSocket / SSE для статусов jobs и streaming chat

---

## 3.2 API Gateway / BFF

### Назначение
Единая точка входа для фронта.

### Функции
- проверка сессии
- выдача данных по meetings/tasks/chat
- запуск фоновых jobs
- orchestration запросов к knowledge layer и agent runtime
- отдача безопасного agent trace
- diff preview для Jira/Notion updates

### Технологии
- **FastAPI** или **NestJS**
- REST + SSE/WebSocket
- rate limiting
- RBAC

---

## 3.3 Auth Service

### Назначение
Авторизация и управление токенами.

### Функции
- Google OAuth / OIDC
- хранение refresh/access tokens
- управление consent
- ротация токенов
- привязка внешних аккаунтов
- tenant isolation

### Данные
- users
- organizations
- memberships
- auth_providers
- oauth_credentials
- permissions

---

## 3.4 Calendar / Meet Adapter

### Назначение
Интеграция с Google Calendar и Google Meet.

### Функции
- подписка на события календаря
- обнаружение встреч с Meet link
- создание internal meeting jobs
- подтягивание metadata встречи
- получение transcript/recording/notes
- fallback на browser bot mode

### Подмодули
- `calendar-sync`
- `meet-artifacts-fetcher`
- `meeting-rules-engine`

---

## 3.5 Browser Bot Service

### Назначение
Fallback-режим для встреч, если нет нативных артефактов.

### Функции
- поднимать headless browser
- логиниться под сервисным аккаунтом / delegated account
- входить во встречу
- писать аудио / видео
- читать captions / participant labels
- определять факт screen share
- делать snapshot по расписанию или по событию

### Важные особенности
- отдельный isolated execution pool
- лимиты по времени
- антидеградационные проверки
- запись всех ошибок UI automation

---

## 3.6 Media Ingest Service

### Назначение
Нормализация сырых файлов и артефактов встречи.

### Функции
- приём аудио / видео / transcript / notes
- конвертация форматов
- генерация waveform metadata
- резка больших файлов на чанки
- публикация downstream jobs

### Выход
- normalized audio
- normalized video
- transcript draft
- media metadata

---

## 3.7 Transcription Service

### Назначение
Точная пост-обработка аудио.

### Функции
- ASR
- diarization
- language detection
- timestamp alignment
- confidence scoring
- merge с browser speaker hints

### Выход
- utterances
- speakers
- confidence per segment
- cleaned transcript
- transcript summary metadata

### Примечание
Лучше хранить отдельно:
- raw transcript
- normalized transcript
- reviewed transcript

---

## 3.8 Vision / OCR Service

### Назначение
Анализ screen share и визуального контекста.

### Функции
- OCR
- UI element detection
- issue key extraction
- document title extraction
- log/error extraction
- screenshot deduplication
- thumbnail generation

### Выход
- OCR chunks
- visual entities
- linked issue candidates
- screen-share timeline

---

## 3.9 Knowledge Ingestion Service

### Назначение
Превращает данные из встреч, Jira и Notion в индексируемую базу знаний.

### Функции
- chunking
- metadata enrichment
- entity extraction
- embeddings generation
- upsert в vector store
- upsert в search index
- graph edge creation

### Индексируемые объекты
- transcript segments
- meeting summaries
- decisions
- action items
- Jira issues
- Notion pages
- OCR chunks
- comments
- linked docs

---

## 3.10 Knowledge Query Service

### Назначение
Слой retrieval для чата и агентных задач.

### Функции
- semantic search
- keyword search
- hybrid retrieval
- filters by tenant/project/meeting/time
- graph traversal
- source ranking
- citation assembly

### Подход
Использовать не только vector retrieval, но и:

- full-text search
- metadata filters
- entity graph traversal
- temporal ranking

---

## 3.11 Agent Runtime

### Назначение
Оркестрация интеллектуальных сценариев.

### Функции
- planning
- tool calling
- evidence collection
- decision synthesis
- update proposal generation
- trace generation
- policy checks

### Роли агентов
Лучше не один агент, а набор сценариев:

- `meeting_summarizer`
- `action_item_extractor`
- `jira_update_planner`
- `notion_sync_planner`
- `chat_qa_agent`
- `cross_meeting_research_agent`

### Почему так лучше
- проще дебажить
- проще ограничивать права
- меньше риск неуправляемых действий

---

## 3.12 Jira Adapter

### Назначение
Безопасное взаимодействие с Jira.

### Функции
- чтение issues
- чтение comments
- поиск issues
- создание draft updates
- публикация approved updates
- маппинг internal diff → Jira API/MCP action

### Режимы
- read-only
- suggest-only
- apply-approved
- limited-auto-apply

---

## 3.13 Notion Adapter

### Назначение
Безопасное взаимодействие с Notion.

### Функции
- чтение страниц/баз
- поиск по workspace
- создание meeting summary pages
- обновление decision logs
- линковка meeting ↔ docs ↔ tasks

---

## 3.14 Sync Execution Service

### Назначение
Применение подтверждённых изменений.

### Функции
- получать approved diff
- запускать идемпотентные операции
- логировать результат
- откатывать или повторять при transient failures

---

## 3.15 Audit & Trace Service

### Назначение
Хранить полную историю действий системы.

### Функции
- audit log каждого чтения/записи
- agent trace
- policy evaluation log
- external API call log
- redacted reasoning summary
- human approval history

---

## 3.16 Notification Service

### Назначение
Отправка уведомлений пользователям.

### Функции
- встреча обработана
- требуется подтверждение изменений
- не удалось распознать speakers
- sync упал
- готов summary

---

## 4. Потоки данных

## 4.1 Поток A — обнаружение встречи

1. пользователь подключает Google account
2. Calendar adapter синхронизирует события
3. находится событие с Meet link
4. rules engine решает, нужно ли обрабатывать встречу
5. создаётся `meeting_ingest_job`

### Условия rules engine
- встреча не private/blacklisted
- пользователь дал consent
- календарь разрешён к индексации
- домен участников допустим
- тип встречи поддерживается

---

## 4.2 Поток B — ingest встречи

1. worker получает `meeting_ingest_job`
2. пытается получить нативные артефакты:
   - transcript
   - recording
   - notes
3. если недоступно — переключается на browser bot strategy
4. media и metadata складываются в object storage
5. создаются downstream jobs:
   - `transcription_job`
   - `vision_job`
   - `knowledge_ingest_job`

---

## 4.3 Поток C — post-call transcription

1. audio нормализуется
2. ASR строит первичный transcript
3. diarization разбивает по спикерам
4. browser hints мержатся с diarization
5. строится итоговый transcript с confidence
6. transcript кладётся в DB + search + vector index

---

## 4.4 Поток D — visual understanding

1. service получает snapshots
2. удаляет дубликаты
3. делает OCR
4. извлекает task ids / titles / logs
5. маппит сущности на Jira/Notion objects
6. пишет visual evidence в knowledge base

---

## 4.5 Поток E — agent post-processing

1. agent получает meeting transcript + visual evidence + linked docs/issues
2. извлекает:
   - decisions
   - action items
   - blockers
   - owners
   - due dates
   - unresolved questions
3. строит proposed updates
4. сохраняет reasoning summary
5. публикует в UI preview

---

## 4.6 Поток F — подтверждение и sync

1. пользователь открывает diff preview
2. выбирает approve/reject/edit
3. approved diff уходит в Sync Execution Service
4. Jira/Notion adapter применяет изменения
5. результат логируется в audit trail

---

## 4.7 Поток G — чатовый режим

1. пользователь задаёт вопрос
2. Chat API определяет scope:
   - по встрече
   - по проекту
   - по организации
3. Knowledge Query Service делает retrieval
4. Agent Runtime формирует ответ
5. фронт показывает:
   - ответ
   - citations
   - использованные сущности
   - trace summary

---

## 5. Событийная модель и очереди

Нужна событийная шина или очередь.

### Основные jobs / events
- `meeting.detected`
- `meeting.ingest.requested`
- `meeting.artifacts.ready`
- `meeting.browser_capture.ready`
- `transcription.requested`
- `transcription.completed`
- `vision.requested`
- `vision.completed`
- `knowledge.ingest.requested`
- `knowledge.ingest.completed`
- `meeting.analysis.requested`
- `meeting.analysis.completed`
- `sync.requested`
- `sync.completed`
- `sync.failed`

### Рекомендуемые варианты
Для MVP:
- Redis + BullMQ
или
- Celery + Redis

Для production:
- RabbitMQ
- NATS
- Kafka, если будет очень высокий throughput

---

## 6. Базы данных и хранилища

## 6.1 Postgres

### Основные таблицы

#### identity / auth
- `users`
- `organizations`
- `organization_members`
- `oauth_accounts`
- `api_credentials`
- `consents`

#### meetings
- `meetings`
- `meeting_participants`
- `meeting_artifacts`
- `meeting_speaker_segments`
- `meeting_summaries`
- `meeting_decisions`
- `meeting_action_items`
- `meeting_visual_events`

#### knowledge
- `documents`
- `document_chunks`
- `entities`
- `entity_links`
- `citations`
- `retrieval_logs`

#### sync
- `external_links`
- `jira_issue_cache`
- `notion_page_cache`
- `proposed_updates`
- `approved_updates`
- `sync_operations`

#### observability
- `agent_runs`
- `agent_steps`
- `tool_calls`
- `audit_logs`
- `policy_evaluations`
- `job_runs`

### Почему Postgres
- транзакционность
- нормальные связи
- удобно для multitenancy
- можно быстро стартовать
- можно добавить `pgvector`

---

## 6.2 Object Storage

Использовать S3-compatible storage.

### Что хранить
- raw audio
- normalized audio
- raw video
- screenshots
- OCR artifacts
- exported notes
- transcript files
- generated summaries
- temp browser recordings

### Требования
- lifecycle policies
- versioning
- encryption
- signed URLs
- per-tenant prefixes

---

## 6.3 Vector Store

Для MVP можно:
- `pgvector`

Для масштаба:
- Qdrant
- Weaviate
- Pinecone
- Milvus

### Индексируемые объекты
- transcript chunks
- OCR chunks
- notion blocks
- jira descriptions/comments
- summaries
- decisions

---

## 6.4 Search Engine

Нужен отдельный полнотекстовый поиск либо как минимум расширенный поиск в Postgres.

Для роста:
- OpenSearch
- Elasticsearch
- Typesense
- Meilisearch

### Что искать
- точные issue keys
- имена людей
- текст транскриптов
- OCR текст
- titles docs/pages
- comments/logs/errors

---

## 6.5 Graph Layer

Полноценная графовая БД не обязательна для MVP.

Можно начать с:
- `entities`
- `entity_links`

Связи:
- person ↔ meeting
- meeting ↔ issue
- meeting ↔ notion page
- issue ↔ person
- decision ↔ meeting
- action item ↔ owner
- document ↔ project

---

## 7. Модель данных

## 7.1 Meeting

Поля:
- `id`
- `tenant_id`
- `calendar_event_id`
- `meet_link`
- `title`
- `start_at`
- `end_at`
- `status`
- `ingest_strategy`
- `recording_url`
- `transcript_status`
- `analysis_status`

## 7.2 MeetingParticipant
- `meeting_id`
- `person_id`
- `display_name`
- `email`
- `join_time`
- `leave_time`
- `role`

## 7.3 SpeakerSegment
- `meeting_id`
- `speaker_candidate_id`
- `start_ms`
- `end_ms`
- `text`
- `confidence`
- `source` (`asr`, `browser_hint`, `merged`)

## 7.4 ActionItem
- `meeting_id`
- `owner_person_id`
- `text`
- `due_date`
- `confidence`
- `status`
- `linked_issue_id`

## 7.5 ProposedUpdate
- `source_type`
- `source_id`
- `target_system`
- `target_object_id`
- `update_type`
- `before_json`
- `after_json`
- `reasoning_summary`
- `confidence`
- `approval_status`

---

## 8. Multitenancy

Нужно закладывать изоляцию с самого начала.

### Уровни изоляции
- organization
- workspace / project
- user-private scope

### Подход
Во всех ключевых таблицах:
- `tenant_id`
- `org_id`
- `workspace_id` при необходимости

### Обязательные ограничения
- фильтрация retrieval только по доступным scope
- object storage prefixes по tenant
- vector namespace по tenant
- search filters по tenant
- access policy check перед каждым retrieval и sync

---

## 9. RAG-архитектура

## 9.1 Типы источников
- meetings
- Jira issues
- Jira comments
- Notion pages
- OCR from screenshots
- generated summaries
- decisions / action items

## 9.2 Chunking strategy

### Для транскриптов
- чанки по 30–90 секунд
- overlap
- привязка к speaker timeline
- meeting metadata

### Для Notion
- по блокам / секциям
- сохранять hierarchy path

### Для Jira
- issue description
- comments
- linked subtasks
- recent changes

### Для OCR
- группировать по screen-share interval
- хранить confidence

## 9.3 Retrieval strategy
Hybrid retrieval:
- semantic similarity
- BM25/full-text
- exact entity match
- graph expansion
- recency re-ranking
- source credibility re-ranking

## 9.4 Citation strategy
Каждый ответ должен ссылаться на:
- meeting
- transcript timestamp
- Jira issue
- Notion page
- screenshot segment

---

## 10. Политика автообновлений

### Режимы
1. `manual_only`
2. `suggest_only`
3. `auto_apply_safe`
4. `custom_policy`

### Safe updates
Можно автоаплаить:
- комментарий “meeting summary draft”
- link issue ↔ meeting
- tag/label `mentioned-in-meeting`
- добавление ссылки на notes

### Только после approval
- assignee
- status
- due date
- estimate/story points
- priority
- изменение description
- создание новых subtasks

---

## 11. Безопасность

## 11.1 OAuth и секреты
- шифрование токенов
- key rotation
- secrets manager
- least privilege scopes

## 11.2 Data protection
- encryption at rest
- encryption in transit
- signed URLs
- masking PII
- retention rules

## 11.3 Consent и compliance
- включение записи/анализа только после согласия
- policy rules по доменам и календарям
- список исключённых встреч
- право на удаление артефактов встречи

## 11.4 Trace visibility
Не показывать raw internal reasoning. Показывать:
- tool calls
- evidence
- confidence
- reason summary
- proposed diff

---

## 12. Observability

### Метрики
- количество встреч
- % успешно обработанных встреч
- среднее время от окончания встречи до summary
- % speaker attribution confidence > threshold
- % успешных sync operations
- latency retrieval
- latency chat response
- token/media costs

### Логи
- structured logs
- job logs
- integration logs
- browser automation logs
- agent step logs

### Трейсы
- distributed tracing
- correlation id на meeting/job/request

---

## 13. Отказоустойчивость

## 13.1 На уровне очередей
- retry policy
- dead letter queue
- idempotency keys
- backoff strategy

## 13.2 На уровне интеграций
- rate limit handling
- circuit breaker
- graceful degradation
- cached reads where possible

## 13.3 На уровне browser bots
- isolated workers
- timeout caps
- watchdog
- restart on crash
- separate resource pool

## 13.4 На уровне данных
- регулярные backup Postgres
- versioning object storage
- экспорт audit trail
- disaster recovery plan

---

## 14. Рекомендованный deployment

## 14.1 MVP
- Web App
- API
- Worker
- Postgres
- Redis
- S3 storage

Размещение:
- Cloud Run / ECS / Railway / Render / Fly.io
- managed Postgres
- managed Redis
- managed S3-compatible storage

## 14.2 Production
- Kubernetes или ECS/Fargate
- отдельные deployment groups:
  - `web`
  - `api`
  - `workers`
  - `browser-bots`
  - `transcription`
  - `vision`
- autoscaling
- separate queues
- private networking

---

## 15. Этапы внедрения

## Этап 1 — Foundations
- Google login
- Calendar sync
- meeting detection
- ingest meeting artifacts
- storage + Postgres
- чат по meeting summaries
- Jira/Notion read-only integration

## Этап 2 — Post-call intelligence
- transcription
- diarization
- OCR/screenshots
- suggested updates
- agent trace UI
- approval flow

## Этап 3 — Advanced RAG
- hybrid retrieval
- entity graph
- cross-meeting linking
- citations
- project memory

## Этап 4 — Controlled automation
- safe auto-apply rules
- policy engine
- tenant admin controls
- richer Jira/Notion sync

## Этап 5 — Real-time mode
- live capture
- live assistant
- in-meeting prompts
- real-time task context retrieval

---

## 16. Минимальный рекомендуемый состав репозиториев / модулей

Можно начать с монорепы:

- `apps/web`
- `apps/api`
- `apps/worker`
- `services/browser-bot`
- `services/transcription`
- `services/vision`
- `packages/db`
- `packages/auth`
- `packages/integrations-google`
- `packages/integrations-jira`
- `packages/integrations-notion`
- `packages/knowledge`
- `packages/agent-runtime`
- `packages/common`

---

## 17. Что я бы выбрал как практический старт

### Стек
- **Next.js**
- **FastAPI**
- **Python workers**
- **Postgres + pgvector**
- **Redis**
- **S3**
- **Playwright** для browser bot fallback
- **Whisper / managed ASR**
- **OCR + lightweight vision pipeline**
- **ironclaw** как orchestration layer
- **MCP/adapters** для Jira и Notion

### Почему это хорошо
- быстро стартует
- понятная эксплуатация
- можно поэтапно наращивать
- не требует сразу тяжёлой distributed системы

---

## 18. Финальный архитектурный принцип

Главный принцип такой:

> Встреча — это событие.  
> Сервис не просто транскрибирует звонок, а превращает встречу в структурированный knowledge object, связанный с людьми, задачами, документами и решениями.

И уже поверх этого строятся:
- чат
- память команды
- suggested updates
- контролируемая автоматизация
- traceable agent workflow
