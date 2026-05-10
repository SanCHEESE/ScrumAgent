"use client";

// Login screen — Google OAuth-style entry (mock).
// Implemented for ScrumAgent-jnf.
// Source: /tmp/design-extract/kabanchik-agent/project/login.html
//
// This page is intentionally outside the `(shell)` route group so the
// AppShell (live bar + sidebar) does NOT render around it. See
// `app/login/layout.tsx`.

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import "@/styles/screens/login.css";

const APP_VERSION = "v0.1.0";

export default function LoginPage() {
  const router = useRouter();
  const [signingIn, setSigningIn] = useState(false);

  function handleSignIn() {
    if (signingIn) return;
    setSigningIn(true);
    // Mock auth — frontend prototype only. Navigate to the home/dashboard.
    router.push("/");
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
          aria-label="Continue with Google Workspace"
        >
          <Icon name="google" size={18} className="login-google-icon" />
          <span>
            {signingIn ? "Signing in…" : "Continue with Google Workspace"}
          </span>
        </Button>

        <p className="login-domain-note">Only @municorn.com accounts</p>

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
