"use client";

// Single signed-in-user resolver (ScrumAgent-zis).
//
// The "JWT email claim for an instant label → /auth/me for the full name →
// agent_preview gating → 401-means-signed-out" dance was copy-pasted across the
// Home greeting and the sidebar UserMenu, so the identity-display rules drifted
// independently. This hook is the one place that resolves it.

import { useEffect, useState } from "react";
import { ApiError, api, type MeResponse } from "./api";
import { decodeTokenEmail, getToken, isAgentPreviewEnvironment } from "./auth";

export interface CurrentUser {
  /** A session is present: a real bearer token, or the agent_preview env. */
  isAuthenticated: boolean;
  /** The resolved /auth/me payload once it loads (null until then / on 401). */
  user: MeResponse | null;
  /** Best email we have: /auth/me, else the JWT `email` claim, else "". */
  email: string;
  /** Display label: full name → email local-part → null when unknown. */
  displayName: string | null;
}

/** name → email local-part → null. Shared by the greeting and the avatar chip. */
function resolveDisplayName(name: string | null, email: string): string | null {
  const trimmed = name?.trim();
  if (trimmed) return trimmed;
  const local = email.split("@")[0]?.trim();
  return local || email || null;
}

/**
 * Resolve the signed-in user. Returns a deterministic signed-out shape on the
 * server and first client render (so SSR/hydration agree), then — post-mount —
 * fills in the JWT email label immediately and refines it from /auth/me.
 */
export function useCurrentUser(): CurrentUser {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [tokenEmail, setTokenEmail] = useState<string | null>(null);
  const [user, setUser] = useState<MeResponse | null>(null);

  useEffect(() => {
    const token = getToken();
    const previewMode = isAgentPreviewEnvironment();
    if (!token && !previewMode) {
      setIsAuthenticated(false);
      return;
    }
    setIsAuthenticated(true);
    // The JWT's `email` claim labels the UI instantly, before /auth/me resolves.
    setTokenEmail(token ? decodeTokenEmail(token) : null);

    let active = true;
    api
      .me()
      .then((me) => {
        if (active) setUser(me);
      })
      .catch((err) => {
        // 401 → the API client already cleared the token and redirected; reflect
        // signed-out so a stale identity stops showing. Other failures (e.g.
        // backend offline) keep the JWT-derived label.
        if (active && err instanceof ApiError && err.status === 401) {
          setIsAuthenticated(false);
        }
      });
    return () => {
      active = false;
    };
  }, []);

  const email = user?.email ?? tokenEmail ?? "";
  return {
    isAuthenticated,
    user,
    email,
    displayName: resolveDisplayName(user?.name ?? null, email),
  };
}
