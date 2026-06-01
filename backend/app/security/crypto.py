"""Symmetric encryption for secrets at rest.

A process-global Fernet, configured once at startup from ``settings.secret_key``.
Keeps integration secrets out of the database in plaintext while staying
portable (no Secret Manager dependency locally).
"""
from __future__ import annotations

import base64
import hashlib

from cryptography.fernet import Fernet

_fernet: Fernet | None = None


def _derive_key(secret_key: str) -> bytes:
    digest = hashlib.sha256(secret_key.encode("utf-8")).digest()
    return base64.urlsafe_b64encode(digest)


def configure(secret_key: str) -> None:
    global _fernet
    _fernet = Fernet(_derive_key(secret_key))


def _require() -> Fernet:
    if _fernet is None:
        raise RuntimeError(
            "crypto not configured; call crypto.configure(secret_key) at startup"
        )
    return _fernet


def encrypt(plaintext: str) -> str:
    return _require().encrypt(plaintext.encode("utf-8")).decode("utf-8")


def decrypt(token: str) -> str:
    return _require().decrypt(token.encode("utf-8")).decode("utf-8")
