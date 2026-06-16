"use client";

// Login screen — Google OAuth-style entry (mock).
// Implemented for ScrumAgent-jnf.
// Source: /tmp/design-extract/kabanchik-agent/project/login.html
//
// This page is intentionally outside the `(shell)` route group so the
// AppShell (live bar + sidebar) does NOT render around it. See
// `app/login/layout.tsx`.

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import {
  consumeTokenFromHash,
  environmentLabel,
  isAgentPreviewEnvironment,
  startGoogleLogin,
} from "@/lib/auth";
import "@/styles/screens/login.css";

const APP_VERSION = "v0.1.0";

// Error codes the backend callback can bounce back with (`/login?error=…`).
const LOGIN_ERRORS: Record<string, string> = {
  access_denied: "Sign-in was cancelled.",
  domain_not_allowed: "Only @municorn.com accounts can sign in.",
  exchange_failed: "Google sign-in failed. Please try again.",
  missing_code: "Google sign-in failed. Please try again.",
};

export default function LoginPage() {
  const router = useRouter();
  const previewMode = isAgentPreviewEnvironment();
  const [signingIn, setSigningIn] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const authButtonLabel = previewMode
    ? `Open ${environmentLabel()}`
    : signingIn
      ? "Signing in…"
      : "Continue with Google Workspace";

  // Returning from the backend OAuth callback with `#token=…`: stash it and
  // enter the app. A failed round-trip lands here with `?error=…` instead.
  useEffect(() => {
    if (consumeTokenFromHash()) {
      router.replace("/");
      return;
    }
    const code = new URLSearchParams(window.location.search).get("error");
    if (code) {
      setError(LOGIN_ERRORS[code] ?? "Sign-in failed. Please try again.");
      // Strip the code so a reload doesn't re-show a stale error.
      history.replaceState(null, "", window.location.pathname);
    }
  }, [router]);

  function handleSignIn() {
    if (signingIn) return;
    setSigningIn(true);
    setError(null);
    // Production hands off to the backend; preview enters the app directly.
    startGoogleLogin();
  }

  return (
    <div className="login-shell">
      <div className="login-card">
        <span className="login-logo" role="img" aria-label="Kabanchik">
          {"🐗"}
        </span>
        <h1 className="login-title">Kabanchik</h1>
        <p className="login-tagline">Your AI scrum manager</p>

        <Button
          variant="primary"
          className="login-google-btn"
          onClick={handleSignIn}
          disabled={signingIn}
          aria-label={authButtonLabel}
        >
          <Icon name="google" size={18} className="login-google-icon" />
          <span>{authButtonLabel}</span>
        </Button>

        <p className="login-domain-note">
          {previewMode ? "All local projects visible" : "Only @municorn.com accounts"}
        </p>

        {error && (
          <p className="login-error" role="alert">
            {error}
          </p>
        )}

        <div className="login-footer">
          <a>Terms</a>
          <span className="login-footer-sep" aria-hidden>
            &middot;
          </span>
          <a>Privacy</a>
          <span className="login-footer-sep" aria-hidden>
            &middot;
          </span>
          <span>{APP_VERSION}</span>
        </div>
      </div>
    </div>
  );
}
