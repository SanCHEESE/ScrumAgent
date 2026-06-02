from sqlalchemy import text

from app.models.integration import Integration


def test_secret_is_encrypted_at_rest(db_session):
    db_session.add(
        Integration(key="notion_token", value="ntn_supersecret", is_secret=True)
    )
    db_session.commit()

    # raw read bypasses the ORM type → must be ciphertext, not plaintext
    raw = db_session.execute(
        text("SELECT value FROM integrations WHERE key='notion_token'")
    ).scalar()
    assert raw != "ntn_supersecret"
    assert "ntn_supersecret" not in raw

    # ORM read decrypts transparently
    got = db_session.get(Integration, "notion_token")
    assert got.value == "ntn_supersecret"
    assert got.is_secret is True
