import pytest

from app.security import crypto


def test_encrypt_roundtrip():
    crypto.configure("unit-test-secret")
    token = crypto.encrypt("ntn_supersecret")
    assert token != "ntn_supersecret"
    assert crypto.decrypt(token) == "ntn_supersecret"


def test_encrypt_requires_configure(monkeypatch):
    monkeypatch.setattr(crypto, "_fernet", None)
    with pytest.raises(RuntimeError):
        crypto.encrypt("x")
