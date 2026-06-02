"""User directory (ScrumAgent-lb9.4).

Feeds the wizard's "Select team members" picker — the set of existing signed-in
users a project can be shared with. Identity fields only; never secrets.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.deps import get_current_user, get_db
from app.models import User

router = APIRouter(prefix="/users", tags=["users"])


@router.get("/directory")
def directory(
    _user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[dict]:
    users = db.query(User).order_by(User.email).all()
    return [{"id": u.id, "email": u.email, "name": u.name} for u in users]
