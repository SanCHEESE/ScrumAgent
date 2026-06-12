"""Seed dev llm_usage rows for the Settings → Billing tab.

Usage:
    DATABASE_URL=sqlite:////…/backend/.local/dev.db PYTHONPATH=. \
        .venv/bin/python .local/_seed_billing.py

Idempotent-ish: wipes previously seeded rows (run_id LIKE 'seed-%') first.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

from sqlalchemy.orm import Session

from app.config import Settings
from app.database import init_db, make_engine
from app.models import LlmUsage, Project
from app.models.types import UsageKind
from app.security import crypto

settings = Settings()
crypto.configure(settings.secret_key)
engine = make_engine(settings.database_url)
init_db(engine)

now = datetime.now(timezone.utc)

with Session(engine) as db:
    project = db.query(Project).first()
    if project is None:
        raise SystemExit("No project in the dev DB — create one first.")

    db.query(LlmUsage).filter(LlmUsage.run_id.like("seed-%")).delete(
        synchronize_session=False
    )

    runs = [
        ("seed-run-1", "Daily Standup · sync", now - timedelta(minutes=30)),
        ("seed-run-2", "Sprint Planning", now - timedelta(hours=5)),
        ("seed-run-3", "Backlog grooming", now - timedelta(days=1, hours=2)),
        ("seed-run-4", "Architecture review", now - timedelta(days=2)),
        ("seed-run-5", "Retro", now - timedelta(days=4)),
    ]
    for i, (run_id, context, at) in enumerate(runs):
        db.add(
            LlmUsage(
                project_id=project.id,
                run_id=run_id,
                context=context,
                provider="openai",
                model="gpt-5.4-mini",
                kind=UsageKind.llm,
                category="orchestrator",
                input_units=0.8 + 0.2 * i,
                output_units=0.1 + 0.05 * i,
                cost_usd=0.9 + 0.3 * i,
                created_at=at,
            )
        )
        db.add(
            LlmUsage(
                project_id=project.id,
                run_id=run_id,
                context=context,
                provider="openai",
                model="gpt-5.4-mini",
                kind=UsageKind.llm,
                category="subagents",
                input_units=0.3,
                output_units=0.05,
                cost_usd=0.25 + 0.1 * i,
                created_at=at,
            )
        )
        db.add(
            LlmUsage(
                project_id=project.id,
                run_id=run_id,
                context=context,
                provider="openai",
                model="whisper-1",
                kind=UsageKind.stt,
                category="whisper",
                input_units=30 + 5 * i,
                output_units=0,
                cost_usd=0.18 + 0.03 * i,
                created_at=at,
            )
        )
    db.add(
        LlmUsage(
            project_id=project.id,
            run_id="seed-embed-1",
            context="Wiki reindex",
            provider="openai",
            model="text-embedding-3-large",
            kind=UsageKind.embed,
            category="embeddings",
            input_units=2.4,
            output_units=0,
            cost_usd=0.31,
            created_at=now - timedelta(days=3),
        )
    )
    db.commit()
    print(f"Seeded billing usage for project {project.name} ({project.id})")
