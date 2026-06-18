"""Application configuration.

All runtime config flows through a single typed `Settings` object loaded from
environment variables (injected by docker-compose `env_file`) or, for local
non-Docker runs, the repo-root `.env`. Required secrets have no default, so a
missing one fails fast at startup instead of surfacing as a confusing 500 later.
"""
from __future__ import annotations

from pathlib import Path
from typing import Literal

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

# repo-root/.env locally; harmlessly absent inside the container (vars injected).
_ENV_FILE = Path(__file__).resolve().parents[2] / ".env"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=str(_ENV_FILE),
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # --- required (fail fast if missing) ---
    secret_key: str
    openai_api_key: str
    google_client_id: str
    google_client_secret: str

    # --- core defaults ---
    openai_model: str = "gpt-5.4-mini"
    # Chat composition can run a cheaper model than the default; falls back to
    # openai_model when unset. Lets us drop to a cheaper tier without code.
    openai_chat_model: str | None = None
    allowed_domain: str = "municorn.com"
    jwt_ttl_hours: int = 24
    app_environment: Literal["production", "agent_preview"] = "production"
    backend_base_url: str = "http://localhost:8000"
    frontend_base_url: str = "http://localhost:3000"
    database_url: str = "sqlite:////app/data/db/scrumagent.db"
    rag_storage_path: str = "/app/data/rag"
    rag_provider: Literal["lightrag"] = "lightrag"
    lightrag_base_url: str = "http://lightrag:9621"
    lightrag_workspace: str = "scrumagent"
    lightrag_timeout_seconds: float = 10.0
    lightrag_api_key: str | None = None
    log_level: str = "INFO"

    # --- Google service account (deferred: needs Workspace admin) ---
    google_application_credentials: str | None = None
    google_workspace_subject: str | None = None

    # --- Atlassian Rovo / Jira (optional) ---
    rovo_base_url: str = "https://api.atlassian.com/rovo"
    rovo_api_token: str | None = None
    atlassian_site_url: str | None = None
    atlassian_user_email: str | None = None

    # --- Notion (optional) ---
    notion_mcp_url: str = "https://mcp.notion.com/v1/sse"
    notion_token: str | None = None

    # --- Backlog ingestion ---
    jira_page_size: int = 100
    notion_max_depth: int = 5

    # --- Backlog auto-sync (periodic re-index of Jira/Notion into LightRAG) ---
    rag_auto_sync_enabled: bool = True  # global kill-switch for the scheduler loop
    rag_auto_sync_interval_hours: float = 6.0  # fixed cadence (not per-project)
    rag_auto_sync_tick_seconds: float = 300.0  # how often the loop re-checks

    # --- RAG pipeline coordination (LightRAG is single-flight; ScrumAgent-srp) ---
    # Re-sync clears then re-inserts; LightRAG drains deletes asynchronously and
    # rejects overlapping work (delete status="busy" / insert HTTP 409). The
    # adapter polls /documents/pipeline_status until idle and retries busy ops.
    rag_pipeline_poll_seconds: float = 1.0  # interval between pipeline_status polls
    rag_pipeline_max_wait_seconds: float = 120.0  # give up waiting for idle after this
    rag_pipeline_busy_retries: int = 5  # retries when a delete/insert reports busy/409

    # --- GCP deploy (optional) ---
    gcp_project_id: str | None = None
    gcp_region: str | None = None
    gcp_zone: str | None = None
    public_hostname: str | None = None
    letsencrypt_email: str | None = None
    sm_env_secret: str | None = None
    sm_sa_key_secret: str | None = None

    @field_validator("lightrag_api_key", mode="before")
    @classmethod
    def _blank_to_none(cls, v: object) -> object:
        """`LIGHTRAG_API_KEY=` (present but empty in .env) reads as "" via env_file;
        treat it as unset so downstream `is None` checks match an absent var."""
        if isinstance(v, str) and not v.strip():
            return None
        return v
