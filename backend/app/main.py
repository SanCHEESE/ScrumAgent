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
from app.routers import auth
from app.security import crypto


@asynccontextmanager
async def lifespan(_app):
    settings = get_settings()
    crypto.configure(settings.secret_key)
    init_db(make_engine(settings.database_url))
    yield


app = FastAPI(title="Kabanchik", lifespan=lifespan)

# Frontend (different origin in dev: :3000 vs :8000) calls the API with a
# bearer token, so it needs CORS. Read the origin directly to avoid building
# Settings at import time.
app.add_middleware(
    CORSMiddleware,
    allow_origins=[os.getenv("FRONTEND_BASE_URL", "http://localhost:3000")],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
