"""FastAPI application entrypoint.

Wires middleware, routers, and (MVP, pre-Alembic) creates the SQLite schema on
startup. ``app.models`` is imported for its side effect of registering tables on
``Base`` before ``create_all`` runs.
"""
from __future__ import annotations

import os
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app import models  # noqa: F401  — registers ORM tables on Base
from app.database import Base
from app.deps import get_engine
from app.routers import auth


@asynccontextmanager
async def lifespan(app: FastAPI):
    engine = get_engine()
    # Ensure the SQLite parent dir exists for local (non-Docker) runs.
    if engine.url.drivername.startswith("sqlite") and engine.url.database:
        Path(engine.url.database).parent.mkdir(parents=True, exist_ok=True)
    Base.metadata.create_all(engine)
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
