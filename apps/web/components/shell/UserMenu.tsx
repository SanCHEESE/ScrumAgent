"use client";

import { useEffect, useRef, useState, type JSX } from "react";
import { useRouter } from "next/navigation";
import { Avatar } from "@/components/ui/Avatar";
import { Icon } from "@/components/ui/Icon";
import { ApiError, api, type MeResponse } from "@/lib/api";
import {
  decodeTokenEmail,
  getToken,
  isAgentPreviewEnvironment,
  logout,
} from "@/lib/auth";
import type { Participant } from "@/lib/types";

// Deterministic avatar colour per user, drawn from the same palette the mock
// participants use so real and seeded users look consistent.
const AVATAR_COLORS = [
  "#0077e6",
  "#005fc4",
  "#10b981",
  "#f59e0b",
  "#ef4444",
  "#8b5cf6",
] as const;

function pickColor(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

function initialsFrom(name: string | null, email: string): string {
  const trimmed = (name ?? "").trim();
  if (trimmed) {
    return trimmed
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0])
      .join("")
      .toUpperCase();
  }
  const local = email.split("@")[0] || email;
  return local.slice(0, 2).toUpperCase() || "?";
}

function toParticipant(email: string, name: string | null): Participant {
  const display = (name && name.trim()) || email || "Account";
  return {
    name: display,
    initials: initialsFrom(name, email),
    color: pickColor(email || display),
  };
}

/**
 * Sidebar-footer account control (ScrumAgent-9pf).
 *
 * Authenticated: shows the real user (name + initials avatar) with a Sign out
 * menu. The JWT's `email` claim labels the chip instantly; `/auth/me` then
 * refines it to the full name. Unauthenticated: a Sign in affordance routing to
 * the login screen. A 401 from `/auth/me` is handled by the API client, which
 * clears the token and redirects — so an expired session lands on /login.
 */
export function UserMenu(): JSX.Element {
  const router = useRouter();
  const [hasToken, setHasToken] = useState(false);
  const [tokenEmail, setTokenEmail] = useState<string | null>(null);
  const [user, setUser] = useState<MeResponse | null>(null);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const token = getToken();
    const previewMode = isAgentPreviewEnvironment();
    if (!token && !previewMode) {
      setHasToken(false);
      return;
    }
    setHasToken(true);
    setTokenEmail(token ? decodeTokenEmail(token) : null);

    let active = true;
    api
      .me()
      .then((me) => {
        if (active) setUser(me);
      })
      .catch((err) => {
        // 401 → the API client already cleared the token and redirected.
        // Other failures (e.g. backend offline) keep the JWT-derived label.
        if (active && err instanceof ApiError && err.status === 401) {
          setHasToken(false);
        }
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    const onPointer = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (!hasToken) {
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

  const email = user?.email ?? tokenEmail ?? "";
  const participant = toParticipant(email, user?.name ?? null);
  const showEmail = email && email !== participant.name;

  return (
    <div className="user-menu" ref={ref}>
      {open && (
        <div className="user-menu-pop" role="menu">
          <div className="user-menu-id">
            <div className="user-menu-name">{participant.name}</div>
            {showEmail && <div className="user-menu-email">{email}</div>}
          </div>
          <button
            type="button"
            className="user-menu-item"
            role="menuitem"
            onClick={() => logout()}
          >
            <Icon name="arrow_right" size={15} />
            <span>Sign out</span>
          </button>
        </div>
      )}
      <button
        type="button"
        className="user-chip"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <Avatar participant={participant} />
        <div className="user-name">{participant.name}</div>
        <Icon name="chevron_down" size={14} />
      </button>
    </div>
  );
}
