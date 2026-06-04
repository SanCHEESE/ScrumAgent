// Client-side auth helpers for the Google OAuth login flow (ScrumAgent-u2b).
//
// The backend (FastAPI) owns the OAuth dance: we send the user to
// `GET /auth/google/start`, Google redirects back to the backend callback,
// and the backend redirects here with the signed JWT in the URL fragment
// (`/login#token=…`). We pull it out, stash it, and attach it as a bearer
// token on subsequent API calls.

export const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";

const TOKEN_KEY = "kabanchik.token";

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  window.localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  window.localStorage.removeItem(TOKEN_KEY);
}

/** Kick off the OAuth flow by handing the browser to the backend. */
export function startGoogleLogin(): void {
  window.location.href = `${API_BASE}/auth/google/start`;
}

/**
 * Send the browser to the login screen, unless we're already there (avoids a
 * redirect loop when the login page itself makes an API call). Used both by
 * explicit sign-out and by the API client when the backend rejects our token.
 */
export function redirectToLogin(): void {
  if (typeof window === "undefined") return;
  if (window.location.pathname === "/login") return;
  window.location.href = "/login";
}

/** Drop the session and return to the login screen. */
export function logout(): void {
  clearToken();
  redirectToLogin();
}

/**
 * Best-effort read of the `email` claim from the stored JWT *without verifying
 * it* — only for instantly labelling the UI before `/auth/me` resolves. Never
 * trust this for anything security-sensitive. Returns null if absent/malformed.
 */
export function decodeTokenEmail(token: string): string | null {
  try {
    const payload = token.split(".")[1];
    if (!payload) return null;
    const base64 = payload.replace(/-/g, "+").replace(/_/g, "/");
    const json = atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, "="));
    const claims = JSON.parse(json) as { email?: unknown };
    return typeof claims.email === "string" ? claims.email : null;
  } catch {
    return null;
  }
}

/**
 * If the backend redirected us back with `#token=…`, store it and strip it
 * from the visible URL. Returns true when a token was consumed.
 */
export function consumeTokenFromHash(): boolean {
  if (typeof window === "undefined") return false;
  const match = window.location.hash.match(/(?:^#|&)token=([^&]+)/);
  if (!match) return false;
  setToken(decodeURIComponent(match[1]));
  // Drop the fragment so the token isn't left in the address bar / history.
  history.replaceState(null, "", window.location.pathname + window.location.search);
  return true;
}
