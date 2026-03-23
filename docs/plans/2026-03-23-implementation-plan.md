# Scrum Agent v2 — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Расширить MVP (`scrum_agent_gcp.py`) до v2: добавить Gemini Embedding 2 RAG, LangGraph оркестратор с модульной архитектурой, Jira + Notion через официальные MCP-серверы.

**Architecture:** Единый Cloud Run сервис. FastAPI → LangGraph Supervisor → sub-agents (scrum module). Модульная система через AgentRegistry для параллельной разработки. Embeddings в pgvector (Cloud SQL), Gemini Embedding 2 через Vertex AI.

**Tech Stack:** FastAPI, LangGraph, langchain-anthropic, langchain-mcp-adapters, mcp, google-cloud-aiplatform, pgvector, SQLAlchemy, Anthropic Claude

**Design doc:** `docs/plans/2026-03-23-scrum-agent-v2-design.md`

---

## Секции плана

Каждая секция — самостоятельный блок работы. По каждой пишется отдельный подробный спек перед реализацией.

| # | Секция | Файлы | Зависит от |
|---|--------|-------|------------|
| 1 | GCP Infrastructure | — (console/CLI) | — |
| 2 | DB Schema v2 | `scrum_agent_gcp.py` | 1 |
| 3 | Gemini Embedding 2 | `rag.py` | 1, 2 |
| 4 | Core: AgentState + Registry | `core.py` | — |
| 5 | MCP Clients | `mcp_clients.py` | 1 |
| 6 | Scrum Module: meeting_agent | `modules/scrum/meeting_agent.py` | 4, 5 |
| 7 | Scrum Module: rag_agent | `modules/scrum/rag_agent.py` | 3, 4 |
| 8 | Scrum Module: jira_agent | `modules/scrum/jira_agent.py` | 4, 5 |
| 9 | Scrum Module: notion_agent | `modules/scrum/notion_agent.py` | 4, 5 |
| 10 | Scrum Module: chat_agent | `modules/scrum/chat_agent.py` | 4, 7 |
| 11 | LangGraph Graph Assembly | `core.py` | 4, 6–10 |
| 12 | FastAPI Integration | `scrum_agent_gcp.py` | 11 |
| 13 | RAG Indexing Pipeline | `rag.py`, `modules/scrum/` | 3, 6 |
| 14 | Frontend Update | `scrum_agent_gcp.py` (HTML) | 12 |
| 15 | Deploy & Cloud Scheduler | `Dockerfile`, GCP | 1–14 |

---

## Секция 1: GCP Infrastructure Setup

> Подробный спек: `docs/plans/spec-01-gcp-setup.md`
> Инструкция по доступам: `docs/plans/2026-03-23-gcp-access.md`

### Шаги

**1.1** Включить необходимые GCP APIs (см. gcp-access.md)

**1.2** Создать Cloud SQL instance
```bash
gcloud sql instances create scrum-agent-db \
  --database-version=POSTGRES_15 \
  --tier=db-g1-small \
  --region=us-central1 \
  --storage-auto-increase

gcloud sql databases create scrum_agent --instance=scrum-agent-db
gcloud sql users create scrum_agent --instance=scrum-agent-db --password=<GENERATE>
```

**1.3** Включить pgvector в базе
```sql
-- через Cloud SQL Studio или psql
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
```

**1.4** Создать Service Account для Cloud Run
```bash
gcloud iam service-accounts create scrum-agent-sa \
  --display-name="Scrum Agent Cloud Run SA"

# Назначить роли (полный список в gcp-access.md)
for role in roles/cloudsql.client roles/aiplatform.user \
            roles/secretmanager.secretAccessor roles/logging.logWriter; do
  gcloud projects add-iam-policy-binding $PROJECT_ID \
    --member="serviceAccount:scrum-agent-sa@$PROJECT_ID.iam.gserviceaccount.com" \
    --role="$role"
done
```

**1.5** Сохранить все секреты в Secret Manager
```bash
for secret in DATABASE_URL GOOGLE_CLIENT_ID GOOGLE_CLIENT_SECRET \
              ANTHROPIC_API_KEY JIRA_API_TOKEN NOTION_TOKEN SECRET_KEY; do
  echo -n "$VALUE" | gcloud secrets create $secret --data-file=-
done
```

**1.6** Commit: `git commit -m "docs: add GCP setup instructions"`

---

## Секция 2: DB Schema v2

> Подробный спек: `docs/plans/spec-02-db-schema.md`

**Добавляем** таблицу `document_chunks` к существующей схеме в `scrum_agent_gcp.py`.

**2.1** Добавить модель `DocumentChunk` в секцию DATABASE

```python
class DocumentChunk(Base):
    __tablename__ = "document_chunks"
    id          = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id     = Column(String, nullable=False, index=True)
    source_type = Column(String, nullable=False)  # meeting_transcript|summary|action_item|...
    source_id   = Column(String, nullable=False)
    chunk_index = Column(Integer, default=0)
    chunk_text  = Column(Text, nullable=False)
    embedding   = Column(Vector(3072))             # pgvector
    metadata_   = Column("metadata", JSON, default=dict)
    created_at  = Column(DateTime, default=lambda: datetime.now(timezone.utc))
```

**2.2** Добавить index через `event.listen` после `create_all`:
```python
from sqlalchemy import event, text
@event.listens_for(Base.metadata, "after_create")
def create_vector_index(target, connection, **kw):
    connection.execute(text(
        "CREATE INDEX IF NOT EXISTS document_chunks_embedding_idx "
        "ON document_chunks USING ivfflat (embedding vector_cosine_ops) WITH (lists=100)"
    ))
```

**2.3** Запустить локально, убедиться что таблица создаётся:
```bash
DATABASE_URL=sqlite:///test.db python -c "from scrum_agent_gcp import Base, engine; print('OK')"
```

**2.4** Commit: `git commit -m "feat: add document_chunks table with pgvector"`

---

## Секция 3: Gemini Embedding 2

> Подробный спек: `docs/plans/spec-03-rag-embedding.md`

**Файл:** `rag.py` (новый)

**3.1** Создать `rag.py` с классом `EmbeddingService`
```python
# rag.py
import vertexai
from vertexai.language_models import TextEmbeddingInput, TextEmbeddingModel

EMBEDDING_MODEL = "gemini-embedding-exp-03-07"
EMBEDDING_DIMS  = 3072

class EmbeddingService:
    def __init__(self, project: str, location: str = "us-central1"):
        vertexai.init(project=project, location=location)
        self.model = TextEmbeddingModel.from_pretrained(EMBEDDING_MODEL)

    def embed(self, texts: list[str], task_type: str = "RETRIEVAL_DOCUMENT") -> list[list[float]]:
        inputs = [TextEmbeddingInput(t, task_type) for t in texts]
        results = self.model.get_embeddings(inputs, output_dimensionality=EMBEDDING_DIMS)
        return [r.values for r in results]

    def embed_one(self, text: str, task_type: str = "RETRIEVAL_DOCUMENT") -> list[float]:
        return self.embed([text], task_type)[0]
```

**3.2** Добавить `chunk_text()` функцию (простой split по словам)
```python
def chunk_text(text: str, size: int = 512, overlap: int = 50) -> list[str]:
    words = text.split()
    chunks, i = [], 0
    while i < len(words):
        chunks.append(" ".join(words[i:i+size]))
        i += size - overlap
    return chunks
```

**3.3** Добавить `index_chunks()` и `search_chunks()`
```python
def index_chunks(db, embedding_svc, user_id, source_type, source_id, text):
    """Chunk, embed, and store in document_chunks."""
    ...

def search_chunks(db, embedding_svc, user_id, query, top_k=5):
    """Embed query and find nearest chunks via pgvector."""
    ...
```

**3.4** Написать smoke test (локально с sqlite — без pgvector, просто проверить что embed работает):
```bash
GOOGLE_CLOUD_PROJECT=my-proj python -c "from rag import EmbeddingService; e=EmbeddingService('my-proj'); print(len(e.embed_one('test')))"
# expected: 3072
```

**3.5** Commit: `git commit -m "feat: add Gemini Embedding 2 RAG module"`

---

## Секция 4: Core — AgentState + AgentRegistry

> Подробный спек: `docs/plans/spec-04-core-orchestrator.md`

**Файл:** `core.py` (новый)

**4.1** Определить `AgentState` TypedDict
```python
from typing import TypedDict, Annotated, Optional
from langgraph.graph.message import add_messages
from langchain_core.messages import BaseMessage

class AgentState(TypedDict):
    messages:         Annotated[list[BaseMessage], add_messages]
    mode:             str               # "chat" | "pipeline"
    user_id:          str
    meeting_id:       Optional[str]
    next_agent:       str
    context:          dict
    proposed_updates: list
    final_answer:     Optional[str]
```

**4.2** Определить `SharedServices` dataclass

**4.3** Определить `AgentModule` Protocol

**4.4** Реализовать `AgentRegistry` с `add()` и `build_graph()`

**4.5** Реализовать `make_supervisor()` — Claude вызов, возвращает `next_agent`

**4.6** Написать тест: registry с двумя mock-агентами, убедиться что граф строится и supervisor может выбрать агента
```bash
pytest tests/test_core.py -v
```

**4.7** Commit: `git commit -m "feat: add AgentRegistry + AgentState + LangGraph builder"`

---

## Секция 5: MCP Clients

> Подробный спек: `docs/plans/spec-05-mcp-clients.md`

**Файл:** `mcp_clients.py` (новый)

**5.1** Создать `MCPClientManager` — управляет подключениями к Atlassian + Notion MCP

```python
# mcp_clients.py
from mcp import ClientSession
from mcp.client.sse import sse_client
from langchain_mcp_adapters.tools import load_mcp_tools

class MCPClientManager:
    def __init__(self):
        self.jira_tools: list = []
        self.notion_tools: list = []

    async def init(self, jira_token: str, notion_token: str):
        self.jira_tools = await self._load("https://mcp.atlassian.com/v1/sse",
                                            {"Authorization": f"Bearer {jira_token}"})
        self.notion_tools = await self._load("https://mcp.notion.com/v1/sse",
                                              {"Authorization": f"Bearer {notion_token}"})

    async def _load(self, url: str, headers: dict) -> list:
        async with sse_client(url, headers=headers) as (r, w):
            async with ClientSession(r, w) as session:
                await session.initialize()
                return await load_mcp_tools(session)
```

**5.2** Инициализировать `MCPClientManager` при FastAPI startup event

**5.3** Проверить: вывести список инструментов от обоих MCP серверов
```bash
python -c "import asyncio; from mcp_clients import MCPClientManager; ..."
```

**5.4** Commit: `git commit -m "feat: add Atlassian + Notion MCP client manager"`

---

## Секция 6: Scrum Module — meeting_agent

> Подробный спек: `docs/plans/spec-06-meeting-agent.md`

**Файл:** `modules/scrum/meeting_agent.py`

**Что делает:** Для mode=pipeline: получает транскрипт встречи из Google Meet API, запускает LLM анализ (summary, action items, decisions), сохраняет в БД.

**Tools:**
- `fetch_meet_transcript(meeting_id)` → transcript text
- `analyze_transcript(transcript, title, participants)` → structured data
- `save_meeting_results(meeting_id, analysis)` → записывает в meeting record

**Node signature:**
```python
def meeting_agent_node(state: AgentState) -> AgentState:
    # достаёт meeting_id из state["context"]
    # вызывает tools через create_react_agent
    # пишет результат в state["context"]["meeting_analysis"]
    ...
```

**6.1** Создать директорию `modules/scrum/`, добавить `__init__.py` с `register(registry)`

**6.2** Реализовать tools как `@tool` функции

**6.3** Реализовать `MeetingAgentModule` с `get_node()`

**6.4** Тест: mock Google Meet API, убедиться что агент достаёт транскрипт и сохраняет summary

**6.5** Commit: `git commit -m "feat(scrum): add meeting_agent node"`

---

## Секция 7: Scrum Module — rag_agent

> Подробный спек: `docs/plans/spec-07-rag-agent.md`

**Файл:** `modules/scrum/rag_agent.py`

**Что делает:**
- В mode=pipeline: индексирует результаты встречи (transcript chunks, summary, action items)
- В mode=chat: семантический поиск по запросу пользователя, возвращает релевантные чанки в контекст

**Tools:**
- `index_meeting(meeting_id)` → embeds и stores chunks
- `search(query, top_k=5)` → возвращает list[dict] с chunk_text + score + source

**7.1** Реализовать `RagAgentModule` используя `EmbeddingService` из `rag.py`

**7.2** Тест: index 3 чанка, search по похожему запросу, убедиться что top result релевантный

**7.3** Commit: `git commit -m "feat(scrum): add rag_agent node"`

---

## Секция 8: Scrum Module — jira_agent

> Подробный спек: `docs/plans/spec-08-jira-agent.md`

**Файл:** `modules/scrum/jira_agent.py`

**Что делает:**
- В pipeline: анализирует meeting_analysis из context, предлагает Jira updates (comment/label)
- В chat: отвечает на вопросы об issues через MCP

**Tools:** все инструменты из Atlassian Remote MCP (`jira_tools` из MCPClientManager)

**Дополнительный tool:**
- `propose_jira_update(issue_key, update_type, content, reasoning)` → сохраняет ProposedUpdate в БД (НЕ применяет сразу)

**8.1** Реализовать `JiraAgentModule`

**8.2** Убедиться что agent НЕ применяет изменения сам — только создаёт ProposedUpdate записи

**8.3** Commit: `git commit -m "feat(scrum): add jira_agent node"`

---

## Секция 9: Scrum Module — notion_agent

> Подробный спек: `docs/plans/spec-09-notion-agent.md`

**Файл:** `modules/scrum/notion_agent.py`

Аналогично jira_agent, но для Notion MCP. Такая же логика с ProposedUpdate.

**9.1** Реализовать `NotionAgentModule`

**9.2** Commit: `git commit -m "feat(scrum): add notion_agent node"`

---

## Секция 10: Scrum Module — chat_agent

> Подробный спек: `docs/plans/spec-10-chat-agent.md`

**Файл:** `modules/scrum/chat_agent.py`

**Что делает:** Финальный агент в chat-режиме. Получает `context["rag_results"]` + `context["jira_data"]` + `context["notion_data"]` из предыдущих агентов. Формирует связный ответ пользователю с ссылками на источники.

**10.1** Реализовать `ChatAgentModule`

**10.2** Убедиться что формат ответа включает источники (meeting title + timestamp)

**10.3** Commit: `git commit -m "feat(scrum): add chat_agent node"`

---

## Секция 11: LangGraph Graph Assembly

> Подробный спек: `docs/plans/spec-11-graph-assembly.md`

**Файл:** `core.py` (дополнение)

**11.1** В `scrum_agent_gcp.py` добавить bootstrap при startup:
```python
from core import AgentRegistry, SharedServices
from modules.scrum import register as register_scrum

registry = AgentRegistry()
register_scrum(registry)

@app.on_event("startup")
async def startup():
    await mcp_manager.init(JIRA_API_TOKEN, NOTION_TOKEN)
    services = SharedServices(db=SessionLocal, embed=embedding_svc,
                               jira_mcp=mcp_manager.jira_tools,
                               notion_mcp=mcp_manager.notion_tools,
                               llm=llm)
    app.state.graph = registry.build_graph(services)
```

**11.2** Smoke test: граф компилируется без ошибок, одна итерация supervisor

**11.3** Commit: `git commit -m "feat: assemble LangGraph graph with scrum module"`

---

## Секция 12: FastAPI Integration

> Подробный спек: `docs/plans/spec-12-api-integration.md`

**12.1** Заменить `/api/chat` endpoint: вместо прямого LLM вызова — `graph.invoke(mode="chat")`

```python
@app.post("/api/chat")
async def chat(request: Request, user=Depends(require_user), db=Depends(get_db)):
    body = await request.json()
    result = app.state.graph.invoke({
        "messages": [HumanMessage(content=body["question"])],
        "mode": "chat",
        "user_id": user.id,
        "context": {},
        "proposed_updates": [],
        "next_agent": "",
        "final_answer": None,
    })
    return {"answer": result["final_answer"]}
```

**12.2** Заменить `process_meeting()` background task: `graph.invoke(mode="pipeline")`

**12.3** Проверить что `/api/updates` всё ещё возвращает ProposedUpdate из БД (без изменений)

**12.4** Commit: `git commit -m "feat: wire LangGraph graph into FastAPI endpoints"`

---

## Секция 13: RAG Indexing Pipeline

> Подробный спек: `docs/plans/spec-13-rag-indexing.md`

**13.1** После успешного `meeting_agent` в pipeline-режиме — `rag_agent` автоматически индексирует результаты

**13.2** Добавить `/api/reindex` endpoint (admin) для переиндексации всех meetings

**13.3** Проверить что search в chat-режиме возвращает результаты по проиндексированной встрече

**13.4** Commit: `git commit -m "feat: RAG indexing in pipeline, reindex endpoint"`

---

## Секция 14: Frontend Update

> Подробный спек: `docs/plans/spec-14-frontend.md`

Минимальные изменения в HTML в `scrum_agent_gcp.py`:

**14.1** В чате показывать источники (meeting title + date) рядом с ответом

**14.2** В деталях встречи добавить статус индексации RAG

**14.3** Commit: `git commit -m "feat(ui): show RAG sources in chat, indexing status"`

---

## Секция 15: Deploy

> Подробный спек: `docs/plans/spec-15-deploy.md`

**15.1** Обновить `requirements.txt`

**15.2** Обновить `Dockerfile` (добавить npm для MCP если нужно)

**15.3** Deploy на Cloud Run:
```bash
gcloud run deploy scrum-agent \
  --source . \
  --service-account=scrum-agent-sa@$PROJECT_ID.iam.gserviceaccount.com \
  --add-cloudsql-instances=$PROJECT_ID:us-central1:scrum-agent-db \
  --set-secrets="DATABASE_URL=DATABASE_URL:latest,ANTHROPIC_API_KEY=ANTHROPIC_API_KEY:latest,..." \
  --region=us-central1 \
  --min-instances=1 \
  --memory=2Gi \
  --cpu=2
```

**15.4** Настроить Cloud Scheduler для автосинка:
```bash
gcloud scheduler jobs create http scrum-agent-sync \
  --schedule="*/15 * * * *" \
  --uri="https://SERVICE_URL/api/sync-all" \
  --oidc-service-account-email=scrum-agent-scheduler-sa@$PROJECT_ID.iam.gserviceaccount.com \
  --location=us-central1
```

**15.5** Smoke test продакшн URL

**15.6** Commit: `git commit -m "chore: production deploy config"`

---

## Порядок выполнения для параллельных команд

Если несколько команд разрабатывают разные модули одновременно:

```
Team Core:    Секции 1 → 2 → 4 → 11   (инфра + core + граф)
Team RAG:     Секции 3 → 7 → 13        (embeddings + rag_agent + indexing)
Team MCP:     Секции 5 → 8 → 9         (mcp clients + jira + notion)
Team Scrum:   Секции 6 → 10            (meeting_agent + chat_agent)
Team Deploy:  Секция 15                (после всех)
```

Зависимости: Team RAG и Team MCP могут работать параллельно после завершения Секции 4.
