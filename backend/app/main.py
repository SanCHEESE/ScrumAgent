"""FastAPI application entrypoint.

Wires middleware, routers, and (MVP, pre-Alembic) creates the SQLite schema on
startup. ``app.models`` is imported for its side effect of registering tables on
``Base`` before ``create_all`` runs.
"""
from __future__ import annotations

import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.database import init_db, make_engine
from app.deps import get_settings
from app.routers import auth, chat, projects, users
from app.security import crypto


@asynccontextmanager
async def lifespan(_app):
    settings = get_settings()
    crypto.configure(settings.secret_key)
    init_db(make_engine(settings.database_url))

    scheduler = None
    if settings.rag_auto_sync_enabled:
        from app.auto_sync import AutoSyncScheduler
        from app.deps import _session_factory

        scheduler = AutoSyncScheduler(settings, _session_factory())
        await scheduler.start()
        _app.state.auto_sync_scheduler = scheduler
    try:
        yield
    finally:
        if scheduler is not None:
            await scheduler.stop()


app = FastAPI(title="Kabanchik", lifespan=lifespan)


def _frontend_origin() -> str:
    # Settings is the source of truth (it also reads the repo-root .env, which
    # a bare ``os.getenv`` misses); fall back to the raw env var so a missing
    # required secret degrades to the dev default instead of failing import.
    try:
        return get_settings().frontend_base_url
    except Exception:
        return os.getenv("FRONTEND_BASE_URL", "http://localhost:3000")


# Frontend (different origin in dev: :3000 vs :8000) calls the API with a
# bearer token, so it needs CORS.
app.add_middleware(
    CORSMiddleware,
    allow_origins=[_frontend_origin()],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(chat.router)
app.include_router(projects.router)
app.include_router(users.router)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
