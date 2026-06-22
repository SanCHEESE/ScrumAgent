"""One-off migration (no Alembic): add ingestion_runs.jira_deleted / notion_deleted.

Fresh DBs get these from create_all automatically; this patches pre-existing dev/prod
DBs. Idempotent — safe to run repeatedly. ScrumAgent-3wq.

Run: cd backend && uv run python scripts/migrate_2026_06_22_ingestion_deleted.py
"""
from __future__ import annotations

from sqlalchemy import inspect, text

from app.config import Settings
from app.database import make_engine


def main() -> None:
    engine = make_engine(Settings().database_url)
    with engine.begin() as conn:
        existing = {c["name"] for c in inspect(conn).get_columns("ingestion_runs")}
        if "jira_deleted" not in existing:
            conn.execute(text("ALTER TABLE ingestion_runs ADD COLUMN jira_deleted INTEGER"))
            print("added ingestion_runs.jira_deleted")
        if "notion_deleted" not in existing:
            conn.execute(text("ALTER TABLE ingestion_runs ADD COLUMN notion_deleted INTEGER"))
            print("added ingestion_runs.notion_deleted")
    print("migration complete")


if __name__ == "__main__":
    main()
