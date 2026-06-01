"""ORM models. Importing this package registers every table on Base.metadata."""
from app.models.user import User  # noqa: F401

__all__ = ["User"]
