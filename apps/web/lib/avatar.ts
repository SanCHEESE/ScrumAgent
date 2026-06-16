// Shared avatar helpers: deterministic initials + colour + participant mapping
// (ScrumAgent-44x).
//
// UserMenu, MembersSection, and CalendarMeetingRow each hand-rolled their own
// initials/colour logic over *different* palettes, so the same person could
// render a different colour/initials in the sidebar chip vs. the members table
// vs. a meeting row. This is the single source of truth: one palette, one hash,
// one initials rule.

import type { Participant } from "./types";

/** The one avatar palette. Seeded deterministically so a given person always
 *  maps to the same swatch everywhere they appear. */
export const AVATAR_COLORS = [
  "#0077e6",
  "#005fc4",
  "#10b981",
  "#f59e0b",
  "#ef4444",
  "#8b5cf6",
] as const;

/** Deterministic palette colour for a seed string (same seed → same colour). */
export function avatarColor(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

/**
 * Up to two uppercase initials for a person. Prefers their display name, falls
 * back to the local part of their email. A two-word source yields first +
 * last initials ("Morgan Lee" → "ML"); a single token yields its first two
 * letters ("morgan" → "MO"). Returns "?" when there's nothing to go on.
 */
export function avatarInitials(
  name: string | null | undefined,
  email?: string | null,
): string {
  const source = ((name ?? "").trim() || (email ?? "").split("@")[0] || "").trim();
  const parts = source.split(/[\s._-]+/).filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }
  return "?";
}

/**
 * Map a person (email and/or display name) to an avatar {@link Participant}:
 * display label, deterministic initials, and deterministic colour. The colour
 * is seeded by email when present (stable across name changes), else by the
 * display label. `fallbackLabel` is the display name of last resort.
 */
export function toParticipant(
  email: string | null,
  name: string | null,
  fallbackLabel = "?",
): Participant {
  const display = (name && name.trim()) || email || fallbackLabel;
  return {
    name: display,
    initials: avatarInitials(name, email),
    color: avatarColor(email || display),
  };
}
