from jose import JWTError
import pytest

from app.security import create_access_token, decode_access_token

SECRET = "unit-test-secret"


def test_token_roundtrip_returns_subject_and_extra_claims():
    token = create_access_token("42", SECRET, extra={"email": "a@municorn.com"})
    payload = decode_access_token(token, SECRET)
    assert payload["sub"] == "42"
    assert payload["email"] == "a@municorn.com"


def test_expired_token_is_rejected():
    token = create_access_token("42", SECRET, ttl_hours=-1)
    with pytest.raises(JWTError):
        decode_access_token(token, SECRET)


def test_token_signed_with_other_key_is_rejected():
    token = create_access_token("42", "other-secret")
    with pytest.raises(JWTError):
        decode_access_token(token, SECRET)
