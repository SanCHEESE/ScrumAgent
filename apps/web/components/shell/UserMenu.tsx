"use client";

import type { JSX } from "react";
import { useRouter } from "next/navigation";
import { Avatar } from "@/components/ui/Avatar";
import { Icon } from "@/components/ui/Icon";
import { logout } from "@/lib/auth";
import { toParticipant } from "@/lib/avatar";
import { useCurrentUser } from "@/lib/use-current-user";

/**
 * Sidebar-footer account control (ScrumAgent-9pf).
 *
 * Authenticated: shows the real user (name + initials avatar) with a direct
 * Sign out button. The JWT's `email` claim labels the chip instantly; `/auth/me`
 * then refines it to the full name. Unauthenticated: a Sign in affordance routing
 * to the login screen. A 401 from `/auth/me` is handled by the API client, which
 * clears the token and redirects — so an expired session lands on /login.
 */
export function UserMenu(): JSX.Element {
  const router = useRouter();
  const { isAuthenticated, user, email } = useCurrentUser();

  if (!isAuthenticated) {
    return (
      <button
        type="button"
        className="user-chip user-chip-signin"
        onClick={() => router.push("/login")}
      >
        <div className="avatar avatar-muted" aria-hidden>
          <Icon name="user" size={15} />
        </div>
        <div className="user-name">Sign in</div>
      </button>
    );
  }

  const participant = toParticipant(email, user?.name ?? null, "Account");
  const showEmail = email && email !== participant.name;

  return (
    <div className="user-menu">
      <div className="user-chip" title={showEmail ? email : participant.name}>
        <Avatar participant={participant} />
        <div className="user-name">{participant.name}</div>
        <button
          type="button"
          className="user-logout-btn"
          aria-label="Sign out"
          title="Logout"
          onClick={() => logout()}
        >
          <Icon name="arrow_right" size={14} />
        </button>
      </div>
    </div>
  );
}
