"""Reconcile email project invitations into real memberships at login.

A ``PendingProjectMember`` is an invitation addressed to an email that had no
account when an operator added it in Settings → Members. On the invitee's first
Google login the auth callback calls ``grant_pending_memberships``, which turns
each invitation for that email into a real ``ProjectMember`` and consumes the
invitation. Idempotent — safe to run on every login.
"""
from __future__ import annotations

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models import PendingProjectMember, ProjectMember, User


def grant_pending_memberships(db: Session, user: User) -> None:
    """Grant ``user`` membership for every invitation addressed to their email.

    Does not commit — the caller owns the transaction. An existing membership is
    left untouched (the invitation is still consumed, never a role downgrade).
    """
    email = (user.email or "").strip().lower()
    if not email:
        return
    invites = (
        db.query(PendingProjectMember)
        .filter(func.lower(PendingProjectMember.email) == email)
        .all()
    )
    for inv in invites:
        existing = db.get(
            ProjectMember, {"project_id": inv.project_id, "user_id": user.id}
        )
        if existing is None:
            db.add(
                ProjectMember(
                    project_id=inv.project_id, user_id=user.id, role=inv.role
                )
            )
        db.delete(inv)
