"""Application configuration.

All runtime config flows through a single typed `Settings` object loaded from
environment variables (injected by docker-compose `env_file`) or, for local
non-Docker runs, the repo-root `.env`. Required secrets have no default, so a
missing one fails fast at startup instead of surfacing as a confusing 500 later.
"""
from __future__ import annotations

from pathlib import Path

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
    allowed_domain: str = "municorn.com"
    jwt_ttl_hours: int = 24
    backend_base_url: str = "http://localhost:8000"
    frontend_base_url: str = "http://localhost:3000"
    database_url: str = "sqlite:////app/data/db/scrumagent.db"
    rag_storage_path: str = "/app/data/rag"
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

    # --- GCP deploy (optional) ---
    gcp_project_id: str | None = None
    gcp_region: str | None = None
    gcp_zone: str | None = None
    public_hostname: str | None = None
    letsencrypt_email: str | None = None
    sm_env_secret: str | None = None
    sm_sa_key_secret: str | None = None
