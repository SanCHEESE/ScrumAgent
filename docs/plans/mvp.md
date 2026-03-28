# Telecom Scrum Agent — MVP Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Локальный Telecom Scrum Agent — Next.js фронт + FastAPI бэкенд, всё в Docker Compose, авторизация через Google OAuth, база знаний RAG-Anything, синхронизация Calendar/Meet/Jira/Notion.

**Architecture:** Two containers. `backend` — FastAPI чистый REST API + LangGraph + RAG-Anything + SQLite. `frontend` — Next.js (App Router, TypeScript, Tailwind). OAuth flow через FastAPI, JWT передаётся на фронт. Данные в `./data/` монтируются как Docker volume.

**Tech Stack:**
- Backend: FastAPI, LangGraph, langchain-anthropic, langchain-mcp-adapters, rag-anything, SQLAlchemy (SQLite), google-auth, google-auth-oauthlib, google-api-python-client, python-jose
- Frontend: Next.js 14, TypeScript, Tailwind CSS, shadcn/ui

---

## Структура проекта

```
telecom-scrum-agent/
├── docker-compose.yml
├── .env.example
├── backend/
│   ├── Dockerfile
│   ├── requirements.txt
│   └── app/
│       ├── main.py
│       ├── auth.py
│       ├── database.py
│       ├── models.py
│       ├── settings_store.py
│       ├── rag.py
│       ├── calendar_sync.py
│       ├── core.py
│       ├── mcp_clients.py
│       └── modules/scrum/
│           ├── __init__.py
│           ├── meeting_agent.py
│           ├── rag_agent.py
│           ├── jira_agent.py
│           ├── notion_agent.py
│           └── chat_agent.py
├── frontend/
│   ├── Dockerfile
│   ├── package.json
│   ├── tsconfig.json
│   ├── next.config.ts
│   ├── tailwind.config.ts
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
│   ├── db/
│   ├── rag/
│   └── keys/
└── backend/tests/
    ├── test_auth.py
    ├── test_models.py
    └── test_rag.py
```

---

## Секция 1: Project Scaffold

### Шаг 1.1 — `.env.example`

```bash
# Google OAuth
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
ALLOWED_DOMAIN=municorn.com

# Anthropic
ANTHROPIC_API_KEY=

# App
SECRET_KEY=change-me-in-production
BACKEND_URL=http://localhost:8000
FRONTEND_URL=http://localhost:3000

# Paths (внутри контейнера)
DATABASE_URL=sqlite:////data/db/dev.db
RAG_STORAGE_PATH=/data/rag
SA_KEY_PATH=/data/keys/sa_key.json
```

### Шаг 1.2 — `docker-compose.yml`

```yaml
services:
  backend:
    build: ./backend
    ports:
      - "8000:8000"
    volumes:
      - ./data:/data
      - ./backend/app:/app/app
    env_file: .env
    restart: unless-stopped

  frontend:
    build: ./frontend
    ports:
      - "3000:3000"
    volumes:
      - ./frontend/src:/app/src
    environment:
      - NEXT_PUBLIC_API_URL=http://localhost:8000
    depends_on:
      - backend
    restart: unless-stopped
```

### Шаг 1.3 — `backend/requirements.txt`

```
fastapi
uvicorn[standard]
sqlalchemy
google-auth
google-auth-oauthlib
google-api-python-client
anthropic
httpx
langgraph
langchain-anthropic
langchain-core
langchain-mcp-adapters
mcp
rag-anything
python-jose[cryptography]
python-multipart
```

### Шаг 1.4 — `backend/Dockerfile`

```dockerfile
FROM python:3.12-slim
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends gcc && rm -rf /var/lib/apt/lists/*
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY app/ app/
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]
```

### Шаг 1.5 — `backend/app/main.py` (skeleton)

```python
import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="Telecom Scrum Agent API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[os.environ.get("FRONTEND_URL", "http://localhost:3000")],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/health")
async def health():
    return {"status": "ok"}
```

### Шаг 1.6 — `frontend/Dockerfile`

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install
COPY . .
CMD ["npm", "run", "dev"]
```

### Шаг 1.7 — `frontend/package.json`

```json
{
  "name": "telecom-scrum-agent-frontend",
  "version": "0.1.0",
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start"
  },
  "dependencies": {
    "next": "14.2.0",
    "react": "^18",
    "react-dom": "^18"
  },
  "devDependencies": {
    "@types/node": "^20",
    "@types/react": "^18",
    "@types/react-dom": "^18",
    "autoprefixer": "^10",
    "postcss": "^8",
    "tailwindcss": "^3",
    "typescript": "^5"
  }
}
```

### Шаг 1.8 — `frontend/next.config.ts`

```ts
import type { NextConfig } from 'next'

const config: NextConfig = {
  output: 'standalone',
}

export default config
```

### Шаг 1.9 — `frontend/src/app/layout.tsx`

```tsx
import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Telecom Scrum Agent',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
      <body>{children}</body>
    </html>
  )
}
```

### Шаг 1.10 — `frontend/src/app/globals.css`

```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

### Шаг 1.11 — `frontend/tailwind.config.ts`

```ts
import type { Config } from 'tailwindcss'
const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: { extend: {} },
  plugins: [],
}
export default config
```

### Шаг 1.12 — `frontend/tsconfig.json`

```json
{
  "compilerOptions": {
    "target": "es2017",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "paths": { "@/*": ["./src/*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx"],
  "exclude": ["node_modules"]
}
```

### Шаг 1.13 — Минимальный `frontend/src/app/page.tsx`

```tsx
export default function Home() {
  return <div className="p-8"><h1 className="text-2xl font-bold">Telecom Scrum Agent</h1></div>
}
```

### Шаг 1.14 — Создать `data/` и `.gitignore`

```bash
mkdir -p data/db data/rag data/keys
cat >> .gitignore << 'EOF'
data/
.env
__pycache__/
*.pyc
.next/
node_modules/
EOF
```

### Шаг 1.15 — Проверка

```bash
cp .env.example .env
docker compose up --build
# backend: curl http://localhost:8000/health → {"status":"ok"}
# frontend: open http://localhost:3000 → "Telecom Scrum Agent"
```

### Шаг 1.16 — Commit

```bash
git add .
git commit -m "feat: project scaffold — Next.js + FastAPI, Docker Compose"
```

---

## Секция 2: Database + Models (backend)

**Файлы:** `backend/app/database.py`, `backend/app/models.py`, `backend/tests/test_models.py`

### Шаг 2.1 — `backend/app/database.py`

```python
import os
import pathlib
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base

DATABASE_URL = os.environ.get("DATABASE_URL", "sqlite:////data/db/dev.db")

db_path = DATABASE_URL.replace("sqlite:///", "")
pathlib.Path(db_path).parent.mkdir(parents=True, exist_ok=True)

engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
```

### Шаг 2.2 — `backend/app/models.py`

```python
import uuid
from datetime import datetime, timezone
from sqlalchemy import Column, String, Text, DateTime, JSON

from app.database import Base

def now_utc():
    return datetime.now(timezone.utc)

class User(Base):
    __tablename__ = "users"
    id         = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    email      = Column(String, unique=True, nullable=False, index=True)
    name       = Column(String, nullable=False)
    picture    = Column(String)
    created_at = Column(DateTime, default=now_utc)
    last_login = Column(DateTime, default=now_utc)

class Meeting(Base):
    __tablename__ = "meetings"
    id                = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    calendar_event_id = Column(String, unique=True, index=True)
    title             = Column(String, nullable=False)
    start_at          = Column(DateTime)
    end_at            = Column(DateTime)
    meet_link         = Column(String)
    status            = Column(String, default="pending")
    transcript        = Column(Text)
    summary           = Column(Text)
    action_items      = Column(JSON, default=list)
    decisions         = Column(JSON, default=list)
    raw_analysis      = Column(JSON)
    indexed_at        = Column(DateTime)
    created_at        = Column(DateTime, default=now_utc)

class ProposedUpdate(Base):
    __tablename__ = "proposed_updates"
    id            = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    meeting_id    = Column(String, index=True)
    target_system = Column(String, nullable=False)
    target_id     = Column(String)
    update_type   = Column(String)
    content       = Column(Text)
    reasoning     = Column(Text)
    status        = Column(String, default="pending")
    created_at    = Column(DateTime, default=now_utc)
    resolved_at   = Column(DateTime)

class Setting(Base):
    __tablename__ = "settings"
    key        = Column(String, primary_key=True)
    value      = Column(Text)
    updated_at = Column(DateTime, default=now_utc)
```

### Шаг 2.3 — Добавить `create_all` в `backend/app/main.py`

```python
from app.database import engine, Base
import app.models  # noqa

@app.on_event("startup")
async def startup():
    Base.metadata.create_all(bind=engine)
```

### Шаг 2.4 — `backend/tests/test_models.py`

```python
import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from app.database import Base
from app.models import User, Meeting, Setting

@pytest.fixture
def db():
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
    Base.metadata.create_all(engine)
    session = sessionmaker(bind=engine)()
    yield session
    session.close()

def test_create_user(db):
    db.add(User(email="alex@municorn.com", name="Alex"))
    db.commit()
    assert db.query(User).filter_by(email="alex@municorn.com").first() is not None

def test_create_meeting(db):
    db.add(Meeting(calendar_event_id="evt_001", title="Sprint Planning"))
    db.commit()
    assert db.query(Meeting).filter_by(calendar_event_id="evt_001").first().status == "pending"

def test_setting_upsert(db):
    db.merge(Setting(key="jira_token", value="secret"))
    db.commit()
    assert db.query(Setting).filter_by(key="jira_token").first().value == "secret"
```

```bash
docker compose exec backend pytest tests/test_models.py -v
```

### Шаг 2.5 — Commit

```bash
git commit -m "feat: SQLite models — User, Meeting, ProposedUpdate, Setting"
```

---

## Секция 3: Auth (backend)

OAuth flow: фронт → `/auth/login` (бэк) → Google → `/auth/callback` (бэк) → редирект на `FRONTEND_URL/auth/callback?token=JWT`.

**Файлы:** `backend/app/auth.py`, `backend/tests/test_auth.py`

### Шаг 3.1 — `backend/app/auth.py`

```python
import os
from datetime import datetime, timedelta, timezone
from fastapi import Depends, HTTPException
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import jwt, JWTError
from google_auth_oauthlib.flow import Flow
from googleapiclient.discovery import build

GOOGLE_CLIENT_ID     = os.environ.get("GOOGLE_CLIENT_ID", "")
GOOGLE_CLIENT_SECRET = os.environ.get("GOOGLE_CLIENT_SECRET", "")
BACKEND_URL          = os.environ.get("BACKEND_URL", "http://localhost:8000")
FRONTEND_URL         = os.environ.get("FRONTEND_URL", "http://localhost:3000")
ALLOWED_DOMAIN       = os.environ.get("ALLOWED_DOMAIN", "municorn.com")
SECRET_KEY           = os.environ.get("SECRET_KEY", "change-me")
ALGORITHM            = "HS256"

SCOPES = [
    "openid",
    "https://www.googleapis.com/auth/userinfo.email",
    "https://www.googleapis.com/auth/userinfo.profile",
]

bearer_scheme = HTTPBearer()

def make_flow():
    return Flow.from_client_config(
        {"web": {
            "client_id": GOOGLE_CLIENT_ID,
            "client_secret": GOOGLE_CLIENT_SECRET,
            "auth_uri": "https://accounts.google.com/o/oauth2/auth",
            "token_uri": "https://oauth2.googleapis.com/token",
        }},
        scopes=SCOPES,
        redirect_uri=f"{BACKEND_URL}/auth/callback",
    )

def is_allowed_email(email: str) -> bool:
    return email.endswith(f"@{ALLOWED_DOMAIN}")

def create_token(user_id: str, email: str, name: str, picture: str) -> str:
    payload = {
        "sub": user_id,
        "email": email,
        "name": name,
        "picture": picture,
        "exp": datetime.now(timezone.utc) + timedelta(days=30),
    }
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)

def decode_token(token: str) -> dict:
    return jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])

def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme)) -> dict:
    try:
        return decode_token(credentials.credentials)
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid token")
```

### Шаг 3.2 — Добавить auth routes в `backend/app/main.py`

```python
from fastapi.responses import RedirectResponse, JSONResponse
from fastapi import Depends
from sqlalchemy.orm import Session
from app.database import get_db, SessionLocal
from app.auth import make_flow, is_allowed_email, create_token, get_current_user, FRONTEND_URL, ALLOWED_DOMAIN
from app.models import User
from datetime import datetime, timezone

@app.get("/auth/login")
async def login():
    flow = make_flow()
    auth_url, _ = flow.authorization_url(prompt="consent")
    return RedirectResponse(auth_url)

@app.get("/auth/callback")
async def callback(code: str, db: Session = Depends(get_db)):
    flow = make_flow()
    flow.fetch_token(code=code)
    service = build("oauth2", "v2", credentials=flow.credentials)
    info = service.userinfo().get().execute()
    email = info["email"]

    if not is_allowed_email(email):
        return RedirectResponse(f"{FRONTEND_URL}/auth/error?reason=domain")

    user = db.query(User).filter_by(email=email).first()
    if not user:
        user = User(email=email, name=info.get("name", email), picture=info.get("picture"))
        db.add(user)
    else:
        user.last_login = datetime.now(timezone.utc)
    db.commit()

    token = create_token(user.id, user.email, user.name, user.picture or "")
    return RedirectResponse(f"{FRONTEND_URL}/auth/callback?token={token}")

@app.get("/auth/me")
async def me(user=Depends(get_current_user)):
    return user
```

### Шаг 3.3 — `backend/tests/test_auth.py`

```python
from app.auth import is_allowed_email, create_token, decode_token

def test_allowed_domain():
    assert is_allowed_email("alex@municorn.com") is True

def test_blocked_domain():
    assert is_allowed_email("alex@gmail.com") is False

def test_token_roundtrip():
    token = create_token("uid1", "alex@municorn.com", "Alex", "")
    payload = decode_token(token)
    assert payload["email"] == "alex@municorn.com"
    assert payload["sub"] == "uid1"
```

```bash
docker compose exec backend pytest tests/test_auth.py -v
```

### Шаг 3.4 — Commit

```bash
git commit -m "feat: Google OAuth with JWT, @municorn.com domain restriction"
```

---

## Секция 4: Frontend Auth

### Шаг 4.1 — `frontend/src/lib/auth.ts`

```ts
const TOKEN_KEY = 'scrum_token'

export function getToken(): string | null {
  if (typeof window === 'undefined') return null
  return localStorage.getItem(TOKEN_KEY)
}

export function setToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token)
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY)
}

export function parseToken(token: string): { sub: string; email: string; name: string; picture: string } | null {
  try {
    const payload = token.split('.')[1]
    return JSON.parse(atob(payload))
  } catch {
    return null
  }
}
```

### Шаг 4.2 — `frontend/src/lib/api.ts`

```ts
import { getToken } from './auth'

const BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000'

export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = getToken()
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init.headers,
    },
  })
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
  return res.json()
}
```

### Шаг 4.3 — `frontend/src/app/auth/callback/page.tsx`

```tsx
'use client'
import { useEffect } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { setToken } from '@/lib/auth'

export default function AuthCallback() {
  const params = useSearchParams()
  const router = useRouter()

  useEffect(() => {
    const token = params.get('token')
    if (token) {
      setToken(token)
      router.replace('/')
    } else {
      router.replace('/?error=auth')
    }
  }, [params, router])

  return <div className="p-8">Авторизация...</div>
}
```

### Шаг 4.4 — `frontend/src/components/AuthGuard.tsx`

```tsx
'use client'
import { useEffect, useState } from 'react'
import { getToken, parseToken, clearToken } from '@/lib/auth'

export type User = { sub: string; email: string; name: string; picture: string }

export function useUser(): { user: User | null; loading: boolean; logout: () => void } {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const token = getToken()
    if (token) {
      const parsed = parseToken(token)
      setUser(parsed)
    }
    setLoading(false)
  }, [])

  function logout() {
    clearToken()
    setUser(null)
  }

  return { user, loading, logout }
}

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { user, loading } = useUser()

  if (loading) return <div className="p-8">Загрузка...</div>
  if (!user) {
    return (
      <div className="p-8 max-w-md mx-auto mt-20 text-center">
        <h1 className="text-2xl font-bold mb-4">Telecom Scrum Agent</h1>
        <a
          href={`${process.env.NEXT_PUBLIC_API_URL}/auth/login`}
          className="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700"
        >
          Войти через Google (@municorn.com)
        </a>
      </div>
    )
  }
  return <>{children}</>
}
```

### Шаг 4.5 — `frontend/src/components/Nav.tsx`

```tsx
'use client'
import Link from 'next/link'
import { useUser } from './AuthGuard'

export function Nav() {
  const { user, logout } = useUser()
  if (!user) return null
  return (
    <nav className="bg-gray-900 text-white px-6 py-3 flex gap-6 items-center">
      <Link href="/" className="font-semibold">Scrum Agent</Link>
      <Link href="/meetings" className="text-gray-300 hover:text-white">Встречи</Link>
      <Link href="/chat" className="text-gray-300 hover:text-white">Чат</Link>
      <Link href="/updates" className="text-gray-300 hover:text-white">Обновления</Link>
      <Link href="/settings" className="text-gray-300 hover:text-white">Настройки</Link>
      <span className="ml-auto text-sm text-gray-400">{user.email}</span>
      <button onClick={logout} className="text-sm text-gray-400 hover:text-white">Выйти</button>
    </nav>
  )
}
```

### Шаг 4.6 — Обновить `frontend/src/app/layout.tsx`

```tsx
import type { Metadata } from 'next'
import { Nav } from '@/components/Nav'
import './globals.css'

export const metadata: Metadata = { title: 'Telecom Scrum Agent' }

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
      <body className="min-h-screen bg-gray-50">
        <Nav />
        <main className="max-w-5xl mx-auto px-6 py-8">{children}</main>
      </body>
    </html>
  )
}
```

### Шаг 4.7 — Обновить `frontend/src/app/page.tsx`

```tsx
'use client'
import { AuthGuard, useUser } from '@/components/AuthGuard'
import Link from 'next/link'

function Home() {
  const { user } = useUser()
  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">Добро пожаловать, {user?.name}</h1>
      <div className="flex gap-4">
        <Link href="/meetings" className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700">Встречи</Link>
        <Link href="/chat" className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700">Чат</Link>
      </div>
    </div>
  )
}

export default function Page() {
  return <AuthGuard><Home /></AuthGuard>
}
```

### Шаг 4.8 — Commit

```bash
git commit -m "feat(frontend): auth flow — JWT storage, AuthGuard, Nav"
```

---

## Секция 5: Settings (backend + frontend)

### Шаг 5.1 — `backend/app/settings_store.py`

```python
from sqlalchemy.orm import Session
from app.models import Setting

def get_setting(db: Session, key: str, default: str = "") -> str:
    row = db.query(Setting).filter_by(key=key).first()
    return row.value if row else default

def set_setting(db: Session, key: str, value: str):
    row = db.query(Setting).filter_by(key=key).first()
    if row:
        row.value = value
    else:
        db.add(Setting(key=key, value=value))
    db.commit()
```

### Шаг 5.2 — Settings routes в `backend/app/main.py`

```python
import pathlib, shutil
from fastapi import UploadFile, File, Form
from app.settings_store import get_setting, set_setting

SA_KEY_PATH = os.environ.get("SA_KEY_PATH", "/data/keys/sa_key.json")

@app.get("/api/settings")
async def get_settings(db: Session = Depends(get_db), user=Depends(get_current_user)):
    return {
        "sa_configured":     pathlib.Path(SA_KEY_PATH).exists(),
        "jira_configured":   bool(get_setting(db, "jira_api_token")),
        "notion_configured": bool(get_setting(db, "notion_token")),
        "jira_base_url":     get_setting(db, "jira_base_url"),
        "jira_email":        get_setting(db, "jira_email"),
    }

@app.post("/api/settings/sa-key")
async def upload_sa_key(file: UploadFile = File(...), user=Depends(get_current_user)):
    pathlib.Path(SA_KEY_PATH).parent.mkdir(parents=True, exist_ok=True)
    with open(SA_KEY_PATH, "wb") as f:
        shutil.copyfileobj(file.file, f)
    return {"ok": True}

@app.post("/api/settings/mcp")
async def save_mcp(
    jira_base_url: str = Form(""),
    jira_email: str = Form(""),
    jira_api_token: str = Form(""),
    notion_token: str = Form(""),
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    if jira_base_url:  set_setting(db, "jira_base_url", jira_base_url)
    if jira_email:     set_setting(db, "jira_email", jira_email)
    if jira_api_token: set_setting(db, "jira_api_token", jira_api_token)
    if notion_token:   set_setting(db, "notion_token", notion_token)
    return {"ok": True}
```

### Шаг 5.3 — `frontend/src/app/settings/page.tsx`

```tsx
'use client'
import { useEffect, useState } from 'react'
import { AuthGuard } from '@/components/AuthGuard'
import { apiFetch } from '@/lib/api'
import { getToken } from '@/lib/auth'

type SettingsData = {
  sa_configured: boolean
  jira_configured: boolean
  notion_configured: boolean
  jira_base_url: string
  jira_email: string
}

function Badge({ ok }: { ok: boolean }) {
  return (
    <span className={`ml-2 text-xs px-2 py-0.5 rounded-full ${ok ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-700'}`}>
      {ok ? '✓ настроен' : '✗ не настроен'}
    </span>
  )
}

function SettingsPage() {
  const [data, setData] = useState<SettingsData | null>(null)
  const [msg, setMsg] = useState('')

  async function load() {
    const d = await apiFetch<SettingsData>('/api/settings')
    setData(d)
  }

  useEffect(() => { load() }, [])

  async function uploadSaKey(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = e.currentTarget
    const fd = new FormData(form)
    const token = getToken()
    await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/settings/sa-key`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: fd,
    })
    setMsg('SA ключ сохранён')
    load()
  }

  async function saveMcp(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const token = getToken()
    const fd = new FormData(e.currentTarget)
    await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/settings/mcp`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: fd,
    })
    setMsg('MCP настройки сохранены')
    load()
  }

  if (!data) return <p>Загрузка...</p>

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Настройки</h1>
      {msg && <p className="text-green-700 bg-green-50 px-4 py-2 rounded">{msg}</p>}

      <div className="bg-white border rounded-lg p-6">
        <h2 className="text-lg font-semibold mb-3">
          Сервисный аккаунт Google <Badge ok={data.sa_configured} />
        </h2>
        <p className="text-sm text-gray-600 mb-3">
          Загрузите JSON-ключ <strong>telecom.scrum.agent@municorn.com</strong>.<br />
          Domain-wide delegation должен быть настроен в Google Admin Console.
        </p>
        <form onSubmit={uploadSaKey} className="flex gap-2">
          <input type="file" name="file" accept=".json" required className="text-sm" />
          <button type="submit" className="bg-blue-600 text-white px-4 py-1.5 rounded text-sm hover:bg-blue-700">Загрузить</button>
        </form>
      </div>

      <div className="bg-white border rounded-lg p-6">
        <h2 className="text-lg font-semibold mb-3">
          Jira (Atlassian MCP) <Badge ok={data.jira_configured} />
        </h2>
        <form onSubmit={saveMcp} className="space-y-3">
          <input name="jira_base_url" defaultValue={data.jira_base_url} placeholder="https://your-domain.atlassian.net" className="w-full border rounded px-3 py-2 text-sm" />
          <input name="jira_email" defaultValue={data.jira_email} placeholder="you@municorn.com" className="w-full border rounded px-3 py-2 text-sm" />
          <input name="jira_api_token" type="password" placeholder="API Token (оставьте пустым чтобы не менять)" className="w-full border rounded px-3 py-2 text-sm" />
          <button type="submit" className="bg-blue-600 text-white px-4 py-2 rounded text-sm hover:bg-blue-700">Сохранить</button>
        </form>
      </div>

      <div className="bg-white border rounded-lg p-6">
        <h2 className="text-lg font-semibold mb-3">
          Notion MCP <Badge ok={data.notion_configured} />
        </h2>
        <form onSubmit={saveMcp} className="space-y-3">
          <input name="notion_token" type="password" placeholder="secret_..." className="w-full border rounded px-3 py-2 text-sm" />
          <button type="submit" className="bg-blue-600 text-white px-4 py-2 rounded text-sm hover:bg-blue-700">Сохранить</button>
        </form>
      </div>
    </div>
  )
}

export default function Page() {
  return <AuthGuard><SettingsPage /></AuthGuard>
}
```

### Шаг 5.4 — Commit

```bash
git commit -m "feat: settings UI — SA key upload, Jira/Notion MCP config"
```

---

## Секция 6: Calendar Sync (backend)

### Шаг 6.1 — `backend/app/calendar_sync.py`

```python
import os, pathlib
from datetime import datetime, timedelta, timezone
from google.oauth2 import service_account
from googleapiclient.discovery import build

SA_KEY_PATH = os.environ.get("SA_KEY_PATH", "/data/keys/sa_key.json")
CALENDAR_SCOPES = [
    "https://www.googleapis.com/auth/calendar.readonly",
    "https://www.googleapis.com/auth/meetings.space.readonly",
]

def _creds(subject_email: str):
    if not pathlib.Path(SA_KEY_PATH).exists():
        raise FileNotFoundError(f"SA key not found: {SA_KEY_PATH}")
    creds = service_account.Credentials.from_service_account_file(SA_KEY_PATH, scopes=CALENDAR_SCOPES)
    return creds.with_subject(subject_email)

def list_meetings_for_user(user_email: str, days_back: int = 7) -> list[dict]:
    service = build("calendar", "v3", credentials=_creds(user_email))
    now = datetime.now(timezone.utc)
    result = service.events().list(
        calendarId="primary",
        timeMin=(now - timedelta(days=days_back)).isoformat(),
        timeMax=now.isoformat(),
        singleEvents=True,
        orderBy="startTime",
    ).execute()

    meetings = []
    for event in result.get("items", []):
        entry_points = event.get("conferenceData", {}).get("entryPoints", [])
        meet_link = next((ep["uri"] for ep in entry_points if ep.get("entryPointType") == "video"), None)
        if meet_link:
            meetings.append({
                "calendar_event_id": event["id"],
                "title": event.get("summary", "Без названия"),
                "start_at": event["start"].get("dateTime", event["start"].get("date")),
                "end_at":   event["end"].get("dateTime", event["end"].get("date")),
                "meet_link": meet_link,
            })
    return meetings
```

### Шаг 6.2 — Sync route в `backend/app/main.py`

```python
from app.calendar_sync import list_meetings_for_user
from app.models import Meeting, User

@app.post("/api/sync")
async def sync_all(db: Session = Depends(get_db), user=Depends(get_current_user)):
    users = db.query(User).all()
    added = 0
    for u in users:
        try:
            events = list_meetings_for_user(u.email)
        except Exception:
            continue
        for ev in events:
            if not db.query(Meeting).filter_by(calendar_event_id=ev["calendar_event_id"]).first():
                m = Meeting(
                    calendar_event_id=ev["calendar_event_id"],
                    title=ev["title"],
                    start_at=datetime.fromisoformat(ev["start_at"].replace("Z", "+00:00")) if ev["start_at"] else None,
                    end_at=datetime.fromisoformat(ev["end_at"].replace("Z", "+00:00")) if ev["end_at"] else None,
                    meet_link=ev["meet_link"],
                )
                db.add(m)
                added += 1
    db.commit()
    return {"added": added}

@app.get("/api/meetings")
async def list_meetings(db: Session = Depends(get_db), user=Depends(get_current_user)):
    meetings = db.query(Meeting).order_by(Meeting.start_at.desc()).limit(50).all()
    return [
        {
            "id": m.id, "title": m.title, "status": m.status,
            "start_at": m.start_at.isoformat() if m.start_at else None,
            "meet_link": m.meet_link,
        }
        for m in meetings
    ]

@app.get("/api/meetings/{meeting_id}")
async def get_meeting(meeting_id: str, db: Session = Depends(get_db), user=Depends(get_current_user)):
    m = db.query(Meeting).filter_by(id=meeting_id).first()
    if not m:
        raise HTTPException(404)
    updates = db.query(ProposedUpdate).filter_by(meeting_id=meeting_id).all()
    return {
        "id": m.id, "title": m.title, "status": m.status,
        "start_at": m.start_at.isoformat() if m.start_at else None,
        "summary": m.summary, "action_items": m.action_items, "decisions": m.decisions,
        "transcript": m.transcript,
        "proposed_updates": [
            {"id": u.id, "target_system": u.target_system, "target_id": u.target_id,
             "content": u.content, "reasoning": u.reasoning, "status": u.status}
            for u in updates
        ],
    }
```

### Шаг 6.3 — `frontend/src/app/meetings/page.tsx`

```tsx
'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { AuthGuard } from '@/components/AuthGuard'
import { apiFetch } from '@/lib/api'

type Meeting = { id: string; title: string; status: string; start_at: string | null }

function MeetingsPage() {
  const [meetings, setMeetings] = useState<Meeting[]>([])

  async function load() {
    const data = await apiFetch<Meeting[]>('/api/meetings')
    setMeetings(data)
  }

  async function sync() {
    await apiFetch('/api/sync', { method: 'POST' })
    load()
  }

  useEffect(() => { load() }, [])

  const statusColor: Record<string, string> = {
    done: 'bg-green-100 text-green-800',
    processing: 'bg-yellow-100 text-yellow-800',
    error: 'bg-red-100 text-red-800',
    pending: 'bg-gray-100 text-gray-700',
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Встречи</h1>
        <button onClick={sync} className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 text-sm">
          Синхронизировать
        </button>
      </div>
      <div className="space-y-3">
        {meetings.map(m => (
          <div key={m.id} className="bg-white border rounded-lg p-4 flex justify-between items-center">
            <div>
              <p className="font-medium">{m.title}</p>
              <p className="text-sm text-gray-500">{m.start_at}</p>
            </div>
            <div className="flex items-center gap-3">
              <span className={`text-xs px-2 py-1 rounded-full ${statusColor[m.status] ?? statusColor.pending}`}>{m.status}</span>
              <Link href={`/meetings/${m.id}`} className="text-blue-600 text-sm hover:underline">Подробнее →</Link>
            </div>
          </div>
        ))}
        {meetings.length === 0 && <p className="text-gray-500">Нет встреч. Нажмите «Синхронизировать».</p>}
      </div>
    </div>
  )
}

export default function Page() {
  return <AuthGuard><MeetingsPage /></AuthGuard>
}
```

### Шаг 6.4 — Commit

```bash
git commit -m "feat: calendar sync, meetings API + list UI"
```

---

## Секция 7: RAG-Anything (backend)

### Шаг 7.1 — `backend/app/rag.py`

```python
import os, pathlib

RAG_STORAGE_PATH = os.environ.get("RAG_STORAGE_PATH", "./data/rag")
_rag = None

def get_rag():
    global _rag
    if _rag is None:
        from rag_anything import RAGAnything
        pathlib.Path(RAG_STORAGE_PATH).mkdir(parents=True, exist_ok=True)
        _rag = RAGAnything(working_dir=RAG_STORAGE_PATH)
    return _rag

def rag_index(text: str, metadata: dict | None = None):
    get_rag().insert(text, metadata=metadata or {})

def rag_search(query: str, top_k: int = 5) -> list[dict]:
    results = get_rag().query(query, top_k=top_k)
    if isinstance(results, str):
        return [{"text": results, "score": 1.0, "metadata": {}}]
    return results if isinstance(results, list) else []
```

### Шаг 7.2 — `backend/tests/test_rag.py`

```python
def test_rag_index_and_search(tmp_path, monkeypatch):
    monkeypatch.setenv("RAG_STORAGE_PATH", str(tmp_path / "rag"))
    import app.rag as rag_module
    rag_module._rag = None
    from app.rag import rag_index, rag_search

    rag_index("Sprint planning: уменьшаем scope аутентификации")
    results = rag_search("аутентификация")
    assert len(results) > 0
```

```bash
docker compose exec backend pytest tests/test_rag.py -v
```

### Шаг 7.3 — Commit

```bash
git commit -m "feat: RAG-Anything wrapper"
```

---

## Секция 8: LangGraph Core (backend)

### Шаг 8.1 — `backend/app/core.py`

```python
from __future__ import annotations
import os, json
from typing import TypedDict, Annotated, Optional
from dataclasses import dataclass, field
from langchain_core.messages import BaseMessage, SystemMessage
from langchain_anthropic import ChatAnthropic
from langgraph.graph import StateGraph, END
from langgraph.graph.message import add_messages

class AgentState(TypedDict):
    messages:         Annotated[list[BaseMessage], add_messages]
    mode:             str
    user_id:          str
    meeting_id:       Optional[str]
    next_agent:       str
    context:          dict
    proposed_updates: list[dict]
    final_answer:     Optional[str]

@dataclass
class SharedServices:
    db_factory:   object
    rag_index:    object
    rag_search:   object
    llm:          ChatAnthropic
    jira_tools:   list = field(default_factory=list)
    notion_tools: list = field(default_factory=list)

class AgentModule:
    name: str
    description: str

    def get_node(self, services: SharedServices):
        raise NotImplementedError

class AgentRegistry:
    def __init__(self):
        self._modules: dict[str, AgentModule] = {}

    def add(self, module: AgentModule):
        self._modules[module.name] = module

    def build_graph(self, services: SharedServices):
        graph = StateGraph(AgentState)

        def supervisor(state: AgentState) -> AgentState:
            agents_desc = "\n".join(f"- {n}: {m.description}" for n, m in self._modules.items())
            response = services.llm.invoke([
                SystemMessage(content=f"""You are an orchestrator.
Available agents:
{agents_desc}
- END: task complete

Mode: {state['mode']}
Respond JSON only: {{"next_agent": "<name>|END"}}"""),
                *state["messages"],
            ])
            try:
                next_agent = json.loads(response.content).get("next_agent", "END")
            except Exception:
                next_agent = "END"
            return {**state, "next_agent": next_agent}

        graph.add_node("supervisor", supervisor)
        for name, module in self._modules.items():
            graph.add_node(name, module.get_node(services))
            graph.add_edge(name, "supervisor")

        graph.add_conditional_edges(
            "supervisor",
            lambda s: s["next_agent"] if s["next_agent"] in self._modules else END,
            {name: name for name in self._modules} | {END: END},
        )
        graph.set_entry_point("supervisor")
        return graph.compile()

def make_llm() -> ChatAnthropic:
    return ChatAnthropic(model="claude-sonnet-4-6", api_key=os.environ.get("ANTHROPIC_API_KEY", ""))
```

### Шаг 8.2 — Commit

```bash
git commit -m "feat: LangGraph core — AgentState, AgentRegistry, Supervisor"
```

---

## Секция 9: MCP Clients (backend)

### Шаг 9.1 — `backend/app/mcp_clients.py`

```python
from sqlalchemy.orm import Session
from app.settings_store import get_setting

async def load_jira_tools(db: Session) -> list:
    from mcp import ClientSession
    from mcp.client.sse import sse_client
    from langchain_mcp_adapters.tools import load_mcp_tools
    import base64

    token = get_setting(db, "jira_api_token")
    email = get_setting(db, "jira_email")
    if not (token and email):
        return []
    try:
        credentials = base64.b64encode(f"{email}:{token}".encode()).decode()
        async with sse_client("https://mcp.atlassian.com/v1/sse", headers={"Authorization": f"Basic {credentials}"}) as (r, w):
            async with ClientSession(r, w) as session:
                await session.initialize()
                return await load_mcp_tools(session)
    except Exception as e:
        print(f"Jira MCP failed: {e}")
        return []

async def load_notion_tools(db: Session) -> list:
    from mcp import ClientSession
    from mcp.client.sse import sse_client
    from langchain_mcp_adapters.tools import load_mcp_tools

    token = get_setting(db, "notion_token")
    if not token:
        return []
    try:
        async with sse_client("https://mcp.notion.com/v1/sse", headers={"Authorization": f"Bearer {token}"}) as (r, w):
            async with ClientSession(r, w) as session:
                await session.initialize()
                return await load_mcp_tools(session)
    except Exception as e:
        print(f"Notion MCP failed: {e}")
        return []
```

### Шаг 9.2 — Commit

```bash
git commit -m "feat: MCP clients for Jira and Notion"
```

---

## Секция 10: Scrum Module (backend)

### Шаг 10.1 — `backend/app/modules/scrum/meeting_agent.py`

```python
import json
from app.core import AgentModule, AgentState, SharedServices

PROMPT = """Analyze this meeting transcript and extract:
1. summary (2-3 sentences)
2. action_items (list of strings)
3. decisions (list of strings)
4. blockers (list of strings)
Respond JSON only."""

class MeetingAgentModule(AgentModule):
    name = "meeting_agent"
    description = "Analyzes meeting transcript: summary, action items, decisions"

    def get_node(self, services: SharedServices):
        def node(state: AgentState) -> AgentState:
            transcript = state["context"].get("transcript", "")
            if not transcript:
                return {**state}
            response = services.llm.invoke([
                {"role": "system", "content": PROMPT},
                {"role": "user", "content": f"Transcript:\n{transcript}"},
            ])
            try:
                analysis = json.loads(response.content)
            except Exception:
                analysis = {"summary": response.content, "action_items": [], "decisions": [], "blockers": []}
            return {**state, "context": {**state["context"], "meeting_analysis": analysis}}
        return node
```

### Шаг 10.2 — `backend/app/modules/scrum/rag_agent.py`

```python
from app.core import AgentModule, AgentState, SharedServices

class RagAgentModule(AgentModule):
    name = "rag_agent"
    description = "Indexes meeting content or searches knowledge base"

    def get_node(self, services: SharedServices):
        def node(state: AgentState) -> AgentState:
            ctx = state["context"]
            if state["mode"] == "pipeline":
                analysis = ctx.get("meeting_analysis", {})
                mid = state.get("meeting_id")
                if analysis.get("summary"):
                    services.rag_index(analysis["summary"], {"source_type": "summary", "meeting_id": mid})
                for item in analysis.get("action_items", []):
                    services.rag_index(str(item), {"source_type": "action_item", "meeting_id": mid})
                for d in analysis.get("decisions", []):
                    services.rag_index(d, {"source_type": "decision", "meeting_id": mid})
                if ctx.get("transcript"):
                    services.rag_index(ctx["transcript"], {"source_type": "transcript", "meeting_id": mid})
                return {**state, "context": {**ctx, "rag_indexed": True}}
            else:
                query = state["messages"][-1].content if state["messages"] else ""
                results = services.rag_search(query, top_k=5)
                return {**state, "context": {**ctx, "rag_results": results}}
        return node
```

### Шаг 10.3 — `backend/app/modules/scrum/jira_agent.py`

```python
from app.core import AgentModule, AgentState, SharedServices
from langchain_core.messages import HumanMessage, SystemMessage

class JiraAgentModule(AgentModule):
    name = "jira_agent"
    description = "Reads Jira issues, proposes updates based on meeting context"

    def get_node(self, services: SharedServices):
        def node(state: AgentState) -> AgentState:
            if not services.jira_tools:
                return {**state, "context": {**state["context"], "jira_data": "Jira not configured"}}
            ctx = state["context"]
            services.llm.bind_tools(services.jira_tools).invoke([
                SystemMessage(content="You are a Jira integration agent."),
                HumanMessage(content=f"Meeting analysis:\n{ctx.get('meeting_analysis', {})}"),
            ])
            return {**state, "context": {**ctx, "jira_done": True}}
        return node
```

### Шаг 10.4 — `backend/app/modules/scrum/notion_agent.py`

```python
from app.core import AgentModule, AgentState, SharedServices
from langchain_core.messages import HumanMessage, SystemMessage

class NotionAgentModule(AgentModule):
    name = "notion_agent"
    description = "Creates meeting notes in Notion"

    def get_node(self, services: SharedServices):
        def node(state: AgentState) -> AgentState:
            if not services.notion_tools:
                return {**state, "context": {**state["context"], "notion_data": "Notion not configured"}}
            ctx = state["context"]
            services.llm.bind_tools(services.notion_tools).invoke([
                SystemMessage(content="You are a Notion integration agent."),
                HumanMessage(content=f"Create meeting note: {ctx.get('meeting_analysis', {}).get('summary', '')}"),
            ])
            return {**state, "context": {**ctx, "notion_done": True}}
        return node
```

### Шаг 10.5 — `backend/app/modules/scrum/chat_agent.py`

```python
from app.core import AgentModule, AgentState, SharedServices
from langchain_core.messages import SystemMessage

class ChatAgentModule(AgentModule):
    name = "chat_agent"
    description = "Composes final answer from context and RAG results"

    def get_node(self, services: SharedServices):
        def node(state: AgentState) -> AgentState:
            ctx = state["context"]
            rag = ctx.get("rag_results", [])
            context_block = "Knowledge base:\n" + "\n".join(
                f"- {(r.get('text', r) if isinstance(r, dict) else str(r))[:500]}"
                for r in rag
            ) if rag else ""
            response = services.llm.invoke([
                SystemMessage(content="You are a Scrum assistant for @municorn.com. Answer using context. Cite sources."),
                SystemMessage(content=f"Context:\n{context_block}"),
                *state["messages"],
            ])
            return {**state, "final_answer": response.content}
        return node
```

### Шаг 10.6 — `backend/app/modules/scrum/__init__.py`

```python
from app.modules.scrum.meeting_agent import MeetingAgentModule
from app.modules.scrum.rag_agent     import RagAgentModule
from app.modules.scrum.jira_agent    import JiraAgentModule
from app.modules.scrum.notion_agent  import NotionAgentModule
from app.modules.scrum.chat_agent    import ChatAgentModule

def register(registry):
    registry.add(MeetingAgentModule())
    registry.add(RagAgentModule())
    registry.add(JiraAgentModule())
    registry.add(NotionAgentModule())
    registry.add(ChatAgentModule())
```

### Шаг 10.7 — Commit

```bash
git commit -m "feat(scrum): all 5 sub-agents"
```

---

## Секция 11: Chat API + Pipeline (backend)

### Шаг 11.1 — Инициализация графа и `/api/chat` в `backend/app/main.py`

```python
from langchain_core.messages import HumanMessage
from fastapi import BackgroundTasks
from app.core import AgentRegistry, SharedServices, make_llm
from app.rag import rag_index, rag_search
from app.modules.scrum import register as register_scrum
from app.mcp_clients import load_jira_tools, load_notion_tools
from app.database import SessionLocal

_graph = None

async def _get_graph(db):
    global _graph
    if _graph is None:
        jira_tools   = await load_jira_tools(db)
        notion_tools = await load_notion_tools(db)
        reg = AgentRegistry()
        register_scrum(reg)
        services = SharedServices(
            db_factory=SessionLocal,
            rag_index=rag_index,
            rag_search=rag_search,
            llm=make_llm(),
            jira_tools=jira_tools,
            notion_tools=notion_tools,
        )
        _graph = reg.build_graph(services)
    return _graph

@app.post("/api/chat")
async def chat(request: Request, db: Session = Depends(get_db), user=Depends(get_current_user)):
    body = await request.json()
    question = body.get("question", "").strip()
    if not question:
        return JSONResponse({"error": "empty"}, status_code=400)
    graph = await _get_graph(db)
    result = await graph.ainvoke({
        "messages": [HumanMessage(content=question)],
        "mode": "chat",
        "user_id": user["sub"],
        "meeting_id": None,
        "next_agent": "",
        "context": {},
        "proposed_updates": [],
        "final_answer": None,
    })
    return {"answer": result.get("final_answer", "Нет ответа")}
```

### Шаг 11.2 — Pipeline в `backend/app/main.py`

```python
async def _run_pipeline(meeting_id: str):
    db = SessionLocal()
    try:
        m = db.query(Meeting).filter_by(id=meeting_id).first()
        if not m:
            return
        m.status = "processing"
        db.commit()

        graph = await _get_graph(db)
        result = await graph.ainvoke({
            "messages": [HumanMessage(content=f"Process meeting: {m.title}")],
            "mode": "pipeline",
            "user_id": "system",
            "meeting_id": m.id,
            "next_agent": "",
            "context": {"transcript": m.transcript or f"[No transcript for: {m.title}]"},
            "proposed_updates": [],
            "final_answer": None,
        })

        analysis = result["context"].get("meeting_analysis", {})
        m.summary      = analysis.get("summary", "")
        m.action_items = analysis.get("action_items", [])
        m.decisions    = analysis.get("decisions", [])
        m.raw_analysis = analysis
        m.status       = "done"
        m.indexed_at   = datetime.now(timezone.utc)

        for upd in result.get("proposed_updates", []):
            db.add(ProposedUpdate(
                meeting_id=m.id,
                target_system=upd.get("target_system", ""),
                target_id=upd.get("target_id", ""),
                update_type=upd.get("update_type", "comment"),
                content=upd.get("content", ""),
                reasoning=upd.get("reasoning", ""),
            ))
        db.commit()
    except Exception as e:
        db.query(Meeting).filter_by(id=meeting_id).update({"status": "error"})
        db.commit()
        raise
    finally:
        db.close()

@app.post("/api/meetings/{meeting_id}/process")
async def process_meeting(meeting_id: str, background_tasks: BackgroundTasks, user=Depends(get_current_user)):
    background_tasks.add_task(_run_pipeline, meeting_id)
    return {"ok": True}
```

### Шаг 11.3 — Updates routes

```python
@app.get("/api/updates")
async def list_updates(db: Session = Depends(get_db), user=Depends(get_current_user)):
    updates = db.query(ProposedUpdate).filter_by(status="pending").order_by(ProposedUpdate.created_at.desc()).all()
    return [{"id": u.id, "meeting_id": u.meeting_id, "target_system": u.target_system,
             "target_id": u.target_id, "content": u.content, "reasoning": u.reasoning} for u in updates]

@app.post("/api/updates/{update_id}/approve")
async def approve(update_id: str, db: Session = Depends(get_db), user=Depends(get_current_user)):
    upd = db.query(ProposedUpdate).filter_by(id=update_id).first()
    if upd:
        upd.status = "approved"
        upd.resolved_at = datetime.now(timezone.utc)
        db.commit()
    return {"ok": True}

@app.post("/api/updates/{update_id}/reject")
async def reject(update_id: str, db: Session = Depends(get_db), user=Depends(get_current_user)):
    upd = db.query(ProposedUpdate).filter_by(id=update_id).first()
    if upd:
        upd.status = "rejected"
        upd.resolved_at = datetime.now(timezone.utc)
        db.commit()
    return {"ok": True}

@app.post("/api/backup")
async def backup():
    import subprocess
    bucket = os.environ.get("GCS_BACKUP_BUCKET", "")
    ts = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    if bucket:
        subprocess.run(["gcloud", "storage", "cp", "-r", "/data/", f"gs://{bucket}/{ts}/"], check=False)
    return {"status": "ok", "timestamp": ts}
```

### Шаг 11.4 — Commit

```bash
git commit -m "feat: chat API, meeting pipeline, updates approve/reject, backup"
```

---

## Секция 12: Frontend Pages

### Шаг 12.1 — `frontend/src/app/chat/page.tsx`

```tsx
'use client'
import { useState } from 'react'
import { AuthGuard } from '@/components/AuthGuard'
import { apiFetch } from '@/lib/api'

type Message = { role: 'user' | 'agent'; text: string }

function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)

  async function send(e: React.FormEvent) {
    e.preventDefault()
    if (!input.trim()) return
    const question = input.trim()
    setInput('')
    setMessages(prev => [...prev, { role: 'user', text: question }])
    setLoading(true)
    try {
      const res = await apiFetch<{ answer: string }>('/api/chat', {
        method: 'POST',
        body: JSON.stringify({ question }),
      })
      setMessages(prev => [...prev, { role: 'agent', text: res.answer }])
    } catch {
      setMessages(prev => [...prev, { role: 'agent', text: 'Ошибка. Попробуйте ещё раз.' }])
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col h-[calc(100vh-120px)]">
      <h1 className="text-2xl font-bold mb-4">Чат</h1>
      <div className="flex-1 overflow-y-auto space-y-3 mb-4 bg-white border rounded-lg p-4">
        {messages.length === 0 && <p className="text-gray-400">Задайте вопрос по встречам, задачам или решениям команды.</p>}
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-2xl px-4 py-2 rounded-lg text-sm whitespace-pre-wrap ${
              m.role === 'user' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-900'
            }`}>{m.text}</div>
          </div>
        ))}
        {loading && <div className="text-gray-400 text-sm">Думаю...</div>}
      </div>
      <form onSubmit={send} className="flex gap-2">
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          placeholder="Ваш вопрос..."
          className="flex-1 border rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          disabled={loading}
        />
        <button type="submit" disabled={loading} className="bg-blue-600 text-white px-6 py-2 rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50">
          Отправить
        </button>
      </form>
    </div>
  )
}

export default function Page() {
  return <AuthGuard><ChatPage /></AuthGuard>
}
```

### Шаг 12.2 — `frontend/src/app/meetings/[id]/page.tsx`

```tsx
'use client'
import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { AuthGuard } from '@/components/AuthGuard'
import { apiFetch } from '@/lib/api'

type Update = { id: string; target_system: string; target_id: string; content: string; reasoning: string; status: string }
type MeetingDetail = {
  id: string; title: string; status: string; start_at: string | null
  summary: string; action_items: string[]; decisions: string[]
  proposed_updates: Update[]
}

function MeetingDetail() {
  const { id } = useParams<{ id: string }>()
  const [meeting, setMeeting] = useState<MeetingDetail | null>(null)

  async function load() {
    const data = await apiFetch<MeetingDetail>(`/api/meetings/${id}`)
    setMeeting(data)
  }

  async function process() {
    await apiFetch(`/api/meetings/${id}/process`, { method: 'POST' })
    load()
  }

  async function resolve(updateId: string, action: 'approve' | 'reject') {
    await apiFetch(`/api/updates/${updateId}/${action}`, { method: 'POST' })
    load()
  }

  useEffect(() => { if (id) load() }, [id])
  if (!meeting) return <p>Загрузка...</p>

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-2xl font-bold">{meeting.title}</h1>
          <p className="text-gray-500 text-sm">{meeting.start_at}</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm bg-gray-100 px-3 py-1 rounded-full">{meeting.status}</span>
          {meeting.status === 'pending' && (
            <button onClick={process} className="bg-blue-600 text-white px-4 py-2 rounded text-sm hover:bg-blue-700">
              Обработать
            </button>
          )}
        </div>
      </div>

      {meeting.summary && (
        <div className="bg-white border rounded-lg p-4">
          <h2 className="font-semibold mb-2">Summary</h2>
          <p className="text-sm text-gray-700">{meeting.summary}</p>
        </div>
      )}

      {meeting.action_items?.length > 0 && (
        <div className="bg-white border rounded-lg p-4">
          <h2 className="font-semibold mb-2">Action Items</h2>
          <ul className="space-y-1">{meeting.action_items.map((item, i) => <li key={i} className="text-sm">• {item}</li>)}</ul>
        </div>
      )}

      {meeting.decisions?.length > 0 && (
        <div className="bg-white border rounded-lg p-4">
          <h2 className="font-semibold mb-2">Decisions</h2>
          <ul className="space-y-1">{meeting.decisions.map((d, i) => <li key={i} className="text-sm">• {d}</li>)}</ul>
        </div>
      )}

      {meeting.proposed_updates?.length > 0 && (
        <div className="bg-white border rounded-lg p-4">
          <h2 className="font-semibold mb-3">Предложенные обновления</h2>
          <div className="space-y-3">
            {meeting.proposed_updates.map(u => (
              <div key={u.id} className="border rounded p-3">
                <p className="text-sm font-medium">{u.target_system.toUpperCase()} {u.target_id}</p>
                <p className="text-sm text-gray-700 my-1">{u.content}</p>
                <p className="text-xs text-gray-500 italic mb-2">{u.reasoning}</p>
                {u.status === 'pending' && (
                  <div className="flex gap-2">
                    <button onClick={() => resolve(u.id, 'approve')} className="bg-green-600 text-white px-3 py-1 rounded text-xs hover:bg-green-700">Принять</button>
                    <button onClick={() => resolve(u.id, 'reject')} className="bg-red-600 text-white px-3 py-1 rounded text-xs hover:bg-red-700">Отклонить</button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export default function Page() {
  return <AuthGuard><MeetingDetail /></AuthGuard>
}
```

### Шаг 12.3 — `frontend/src/app/updates/page.tsx`

```tsx
'use client'
import { useEffect, useState } from 'react'
import { AuthGuard } from '@/components/AuthGuard'
import { apiFetch } from '@/lib/api'

type Update = { id: string; target_system: string; target_id: string; content: string; reasoning: string }

function UpdatesPage() {
  const [updates, setUpdates] = useState<Update[]>([])

  async function load() {
    setUpdates(await apiFetch<Update[]>('/api/updates'))
  }

  async function resolve(id: string, action: 'approve' | 'reject') {
    await apiFetch(`/api/updates/${id}/${action}`, { method: 'POST' })
    load()
  }

  useEffect(() => { load() }, [])

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Предложенные обновления</h1>
      {updates.length === 0 && <p className="text-gray-500">Нет ожидающих обновлений.</p>}
      <div className="space-y-4">
        {updates.map(u => (
          <div key={u.id} className="bg-white border rounded-lg p-4">
            <p className="font-medium">{u.target_system.toUpperCase()} {u.target_id}</p>
            <p className="text-sm text-gray-700 my-2">{u.content}</p>
            <p className="text-xs text-gray-500 italic mb-3">{u.reasoning}</p>
            <div className="flex gap-2">
              <button onClick={() => resolve(u.id, 'approve')} className="bg-green-600 text-white px-4 py-1.5 rounded text-sm hover:bg-green-700">✓ Принять</button>
              <button onClick={() => resolve(u.id, 'reject')} className="bg-red-600 text-white px-4 py-1.5 rounded text-sm hover:bg-red-700">✗ Отклонить</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export default function Page() {
  return <AuthGuard><UpdatesPage /></AuthGuard>
}
```

### Шаг 12.4 — Commit

```bash
git commit -m "feat(frontend): chat, meeting detail, updates pages"
```

---

## Финальная проверка

```bash
docker compose up --build

# Backend
curl http://localhost:8000/health          # {"status":"ok"}
docker compose exec backend pytest tests/ -v

# Frontend
open http://localhost:3000                 # страница входа
# войти через Google @municorn.com
# /settings → загрузить SA ключ + токены
# /meetings → Синхронизировать → открыть встречу → Обработать
# /chat → задать вопрос
# /updates → принять/отклонить
```

## Порядок секций

```
1 Scaffold → 2 DB → 3 Auth (backend) → 4 Auth (frontend) → 5 Settings →
6 Calendar → 7 RAG → 8 LangGraph → 9 MCP → 10 Scrum Module →
11 Chat+Pipeline → 12 Frontend Pages
```
