# GCP Access & Permissions

**Date:** 2026-03-23
**Project:** Scrum Agent

Всё что нужно запросить и настроить перед первым деплоем.

---

## 1. GCP APIs — включить

```bash
gcloud services enable \
  run.googleapis.com \
  sqladmin.googleapis.com \
  sql-component.googleapis.com \
  aiplatform.googleapis.com \
  secretmanager.googleapis.com \
  cloudscheduler.googleapis.com \
  artifactregistry.googleapis.com \
  cloudbuild.googleapis.com \
  calendar-json.googleapis.com \
  admin.googleapis.com \
  people.googleapis.com \
  iam.googleapis.com \
  iamcredentials.googleapis.com
```

> **Примечание:** Google Meet API (`meet.googleapis.com`) включается отдельно и требует может потребовать верификации для production OAuth приложений.

```bash
gcloud services enable meet.googleapis.com
```

---

## 2. IAM Роли — Cloud Run Service Account

Создать service account для Cloud Run сервиса:

```bash
export PROJECT_ID=$(gcloud config get-value project)
export SA_EMAIL="scrum-agent-sa@${PROJECT_ID}.iam.gserviceaccount.com"

gcloud iam service-accounts create scrum-agent-sa \
  --display-name="Scrum Agent — Cloud Run SA"
```

Назначить роли:

| Роль | Зачем |
|------|-------|
| `roles/cloudsql.client` | подключение к Cloud SQL через Unix socket |
| `roles/aiplatform.user` | вызовы Vertex AI (Gemini Embedding 2) |
| `roles/secretmanager.secretAccessor` | чтение секретов из Secret Manager |
| `roles/logging.logWriter` | запись логов в Cloud Logging |
| `roles/monitoring.metricWriter` | метрики в Cloud Monitoring |
| `roles/cloudtrace.agent` | трейсинг запросов |

```bash
for role in \
  roles/cloudsql.client \
  roles/aiplatform.user \
  roles/secretmanager.secretAccessor \
  roles/logging.logWriter \
  roles/monitoring.metricWriter \
  roles/cloudtrace.agent; do
    gcloud projects add-iam-policy-binding $PROJECT_ID \
      --member="serviceAccount:${SA_EMAIL}" \
      --role="$role"
done
```

---

## 3. IAM Роли — Cloud Scheduler Service Account

Отдельный SA для Cloud Scheduler (вызывает `/api/sync-all`):

```bash
export SCHEDULER_SA="scrum-agent-scheduler@${PROJECT_ID}.iam.gserviceaccount.com"

gcloud iam service-accounts create scrum-agent-scheduler \
  --display-name="Scrum Agent — Cloud Scheduler SA"

# Право вызывать Cloud Run сервис
gcloud run services add-iam-policy-binding scrum-agent \
  --member="serviceAccount:${SCHEDULER_SA}" \
  --role="roles/run.invoker" \
  --region=us-central1
```

---

## 4. Google OAuth — настройка в Google Cloud Console

### Шаги в Console

1. Перейти в **APIs & Services → Credentials**
2. Нажать **Create Credentials → OAuth 2.0 Client ID**
3. Тип: **Web application**
4. Добавить в **Authorized redirect URIs**:
   ```
   https://YOUR-SERVICE-URL.run.app/auth/callback
   http://localhost:8000/auth/callback    ← для локальной разработки
   ```
5. Скопировать `Client ID` и `Client Secret` → сохранить в Secret Manager

### OAuth Consent Screen

1. Перейти в **APIs & Services → OAuth consent screen**
2. User Type: **External** (если не Workspace org)
3. Добавить scopes:
   - `openid`
   - `userinfo.email`
   - `userinfo.profile`
   - `https://www.googleapis.com/auth/calendar.readonly`
   - `https://www.googleapis.com/auth/meetings.space.readonly`
4. Добавить test users на этапе разработки
5. Для production: подать на **Google verification** (calendar + Meet scopes требуют верификации для > 100 пользователей)

> ⚠️ **Важно:** `meetings.space.readonly` — чувствительный scope. Для production приложения с внешними пользователями потребуется Google Security Assessment. На MVP-стадии достаточно добавить test users.

---

## 5. Secret Manager — создать секреты

```bash
# Список всех необходимых секретов
declare -A SECRETS=(
  [DATABASE_URL]="postgresql+psycopg2://scrum_agent:PASSWORD@/scrum_agent?host=/cloudsql/PROJECT:us-central1:scrum-agent-db"
  [GOOGLE_CLIENT_ID]="из Google Cloud Console"
  [GOOGLE_CLIENT_SECRET]="из Google Cloud Console"
  [ANTHROPIC_API_KEY]="sk-ant-..."
  [JIRA_API_TOKEN]="из Atlassian console"
  [JIRA_EMAIL]="your-email@company.com"
  [JIRA_BASE_URL]="https://your-domain.atlassian.net"
  [NOTION_TOKEN]="secret_..."
  [SECRET_KEY]="$(openssl rand -hex 32)"
  [GCP_PROJECT_ID]="your-project-id"
)

for name in "${!SECRETS[@]}"; do
  echo -n "${SECRETS[$name]}" | gcloud secrets create "$name" --data-file=-
  # Дать доступ Cloud Run SA
  gcloud secrets add-iam-policy-binding "$name" \
    --member="serviceAccount:${SA_EMAIL}" \
    --role="roles/secretmanager.secretAccessor"
done
```

---

## 6. Cloud SQL — настройка

```bash
# Создать instance (занимает ~5 минут)
gcloud sql instances create scrum-agent-db \
  --database-version=POSTGRES_15 \
  --tier=db-g1-small \
  --region=us-central1 \
  --storage-size=20GB \
  --storage-auto-increase \
  --backup-start-time=03:00 \
  --retained-backups-count=7

# Создать БД и пользователя
gcloud sql databases create scrum_agent --instance=scrum-agent-db
gcloud sql users create scrum_agent \
  --instance=scrum-agent-db \
  --password=GENERATE_STRONG_PASSWORD

# Включить pgvector (через Cloud SQL Studio в Console или psql)
# psql -h /cloudsql/PROJECT:us-central1:scrum-agent-db -U scrum_agent -d scrum_agent
# => CREATE EXTENSION IF NOT EXISTS vector;
# => CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
```

---

## 7. Artifact Registry — для Docker образов

```bash
gcloud artifacts repositories create scrum-agent \
  --repository-format=docker \
  --location=us-central1 \
  --description="Scrum Agent container images"

# Дать Cloud Build право писать образы
gcloud artifacts repositories add-iam-policy-binding scrum-agent \
  --location=us-central1 \
  --member="serviceAccount:$(gcloud projects describe $PROJECT_ID --format='value(projectNumber)')@cloudbuild.gserviceaccount.com" \
  --role="roles/artifactregistry.writer"
```

---

## 8. Vertex AI — Gemini Embedding 2

Vertex AI включается через `gcloud services enable aiplatform.googleapis.com`.

После этого:
- Модель `gemini-embedding-exp-03-07` доступна без дополнительных настроек
- Billing должен быть включён на проекте
- Service Account с `roles/aiplatform.user` может делать embedding запросы

Проверить доступность:
```bash
gcloud ai models list --region=us-central1 | grep gemini-embedding
```

---

## 9. Внешние токены (не GCP)

### Atlassian (Jira MCP)

1. Перейти на https://id.atlassian.com/manage-profile/security/api-tokens
2. **Create API token**
3. Сохранить как `JIRA_API_TOKEN` в Secret Manager
4. Также нужны: `JIRA_EMAIL` (email аккаунта) и `JIRA_BASE_URL` (`https://your-domain.atlassian.net`)

### Notion MCP

1. Перейти на https://www.notion.so/my-integrations
2. **New integration** → тип: Internal
3. Дать интеграции доступ к нужным workspace страницам (через Share в Notion)
4. Скопировать **Internal Integration Token** → `NOTION_TOKEN` в Secret Manager

---

## 10. Локальная разработка

Для локального запуска без Cloud Run:

```bash
# Установить Cloud SQL Auth Proxy
curl -o cloud-sql-proxy https://storage.googleapis.com/cloud-sql-connectors/cloud-sql-proxy/v2.x.x/cloud-sql-proxy.linux.amd64
chmod +x cloud-sql-proxy

# Запустить proxy
./cloud-sql-proxy --port=5432 $PROJECT_ID:us-central1:scrum-agent-db &

# .env для локальной разработки
DATABASE_URL=postgresql+psycopg2://scrum_agent:PASSWORD@localhost:5432/scrum_agent
GOOGLE_CLOUD_PROJECT=your-project-id
# ... остальные секреты

# Запустить сервис
python scrum_agent_gcp.py
```

> Или использовать SQLite для быстрой разработки без Cloud SQL:
> `DATABASE_URL=sqlite:///./dev.db` (pgvector не работает, embedding запросы нужно мокать)

---

## 11. Checklist перед первым деплоем

- [ ] GCP billing включён
- [ ] Все APIs включены (`gcloud services list --enabled`)
- [ ] Service accounts созданы и роли назначены
- [ ] OAuth consent screen заполнен, redirect URIs добавлены
- [ ] Все секреты в Secret Manager
- [ ] Cloud SQL instance запущен, pgvector включён
- [ ] Atlassian API token получен
- [ ] Notion integration token получен и страницы расшарены
- [ ] Тестовый деплой прошёл: `gcloud run deploy --source . --region us-central1`
- [ ] Smoke test: открыть URL, войти через Google, нажать Sync Calendar
