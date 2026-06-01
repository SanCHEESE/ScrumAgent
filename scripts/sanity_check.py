#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.11"
# dependencies = ["requests>=2.31", "python-dotenv>=1.0"]
# ///
"""
Credential sanity check for Kabanchik.

Read-only probes against each provider to confirm the .env credentials work
BEFORE we invest in the backend scaffold. Part of ScrumAgent-7we acceptance.

Usage:
    ./scripts/sanity_check.py            # uses .env at repo root
    uv run scripts/sanity_check.py

Exit code 0 if every required provider is green, 1 otherwise.
Secrets are never printed.
"""
from __future__ import annotations

import os
import sys
from pathlib import Path

import requests
from dotenv import dotenv_values

ROOT = Path(__file__).resolve().parent.parent
ENV_PATH = ROOT / ".env"

GREEN = "\033[32m"
RED = "\033[31m"
YELLOW = "\033[33m"
DIM = "\033[2m"
RESET = "\033[0m"

OK = f"{GREEN}✓{RESET}"
FAIL = f"{RED}✗{RESET}"
WARN = f"{YELLOW}⚠{RESET}"

TIMEOUT = 15


def line(mark: str, label: str, detail: str = "") -> None:
    tail = f"  {DIM}{detail}{RESET}" if detail else ""
    print(f"  {mark} {label}{tail}")


def check_openai(env: dict[str, str | None]) -> bool:
    print("OpenAI")
    key = env.get("OPENAI_API_KEY")
    if not key:
        line(FAIL, "OPENAI_API_KEY missing")
        return False
    try:
        r = requests.get(
            "https://api.openai.com/v1/models",
            headers={"Authorization": f"Bearer {key}"},
            timeout=TIMEOUT,
        )
    except requests.RequestException as e:
        line(FAIL, "request failed", str(e))
        return False
    if r.status_code != 200:
        line(FAIL, f"auth failed (HTTP {r.status_code})", r.text[:120])
        return False
    ids = {m["id"] for m in r.json().get("data", [])}
    line(OK, "API key valid", f"{len(ids)} models visible")
    model = env.get("OPENAI_MODEL")
    if model:
        if model in ids:
            line(OK, f"model '{model}' available")
        else:
            line(WARN, f"model '{model}' not in your model list",
                 "may still work, or rename in .env")
    return True


def check_google(env: dict[str, str | None]) -> bool:
    print("Google OAuth")
    cid = env.get("GOOGLE_CLIENT_ID") or ""
    secret = env.get("GOOGLE_CLIENT_SECRET") or ""
    ok = True
    if cid.endswith(".apps.googleusercontent.com"):
        line(OK, "client ID format ok")
    else:
        line(FAIL, "client ID missing or malformed")
        ok = False
    if secret.startswith("GOCSPX-"):
        line(OK, "client secret format ok")
    else:
        line(FAIL, "client secret missing or malformed")
        ok = False
    line(WARN, "full OAuth flow validated at first browser login",
         "no headless check possible")
    return ok


def check_atlassian(env: dict[str, str | None]) -> bool:
    print("Atlassian (Jira / Rovo token)")
    site = (env.get("ATLASSIAN_SITE_URL") or "").rstrip("/")
    email = env.get("ATLASSIAN_USER_EMAIL")
    token = env.get("ROVO_API_TOKEN")
    if not (site and email and token):
        line(FAIL, "ATLASSIAN_SITE_URL / USER_EMAIL / ROVO_API_TOKEN incomplete")
        return False
    try:
        r = requests.get(
            f"{site}/rest/api/3/myself",
            auth=(email, token),
            headers={"Accept": "application/json"},
            timeout=TIMEOUT,
        )
    except requests.RequestException as e:
        line(FAIL, "request failed", str(e))
        return False
    if r.status_code == 200:
        who = r.json()
        line(OK, "token valid", f"as {who.get('displayName', '?')}")
        line(WARN, "Rovo-specific endpoints not probed here",
             "this confirms the Jira REST token only")
        return True
    line(FAIL, f"auth failed (HTTP {r.status_code})", r.text[:120])
    return False


def check_notion(env: dict[str, str | None]) -> bool:
    print("Notion")
    token = env.get("NOTION_TOKEN")
    if not token:
        line(FAIL, "NOTION_TOKEN missing")
        return False
    headers = {
        "Authorization": f"Bearer {token}",
        "Notion-Version": "2022-06-28",
    }
    try:
        r = requests.get("https://api.notion.com/v1/users/me",
                         headers=headers, timeout=TIMEOUT)
    except requests.RequestException as e:
        line(FAIL, "request failed", str(e))
        return False
    if r.status_code != 200:
        line(FAIL, f"auth failed (HTTP {r.status_code})", r.text[:120])
        return False
    bot = r.json().get("bot", {}) or {}
    line(OK, "token valid", f"integration '{r.json().get('name', '?')}'")
    # Does the integration actually see any content?
    try:
        s = requests.post("https://api.notion.com/v1/search",
                          headers=headers, json={"page_size": 1}, timeout=TIMEOUT)
        shared = len(s.json().get("results", [])) if s.status_code == 200 else 0
    except requests.RequestException:
        shared = 0
    if shared:
        line(OK, "integration can see shared pages")
    else:
        line(WARN, "integration sees 0 pages",
             "share a test page: ⋯ → Connections → Connect to")
    return True


def main() -> int:
    if not ENV_PATH.exists():
        print(f"{FAIL} no .env at {ENV_PATH}")
        return 1
    env = dotenv_values(ENV_PATH)
    print(f"{DIM}reading {ENV_PATH}{RESET}\n")

    required = {
        "OpenAI": check_openai(env),
        "Google OAuth": check_google(env),
    }
    print()
    optional = {
        "Atlassian": check_atlassian(env),
        "Notion": check_notion(env),
    }
    print()

    all_required_ok = all(required.values())
    for name, ok in {**required, **optional}.items():
        tag = "required" if name in required else "optional"
        mark = OK if ok else (FAIL if tag == "required" else WARN)
        print(f"{mark} {name} {DIM}({tag}){RESET}")

    print()
    if all_required_ok:
        print(f"{GREEN}Required providers OK — clear to start backend bootstrap.{RESET}")
        return 0
    print(f"{RED}Some required provider failed — fix .env before bootstrap.{RESET}")
    return 1


if __name__ == "__main__":
    sys.exit(main())
