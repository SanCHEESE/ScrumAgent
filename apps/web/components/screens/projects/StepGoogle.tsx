"use client";

import { useState, type JSX } from "react";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { API_BASE, ApiError, api } from "@/lib/api";
import type { WizardFormData } from "./types";

export interface StepGoogleProps {
  data: WizardFormData;
  onChange: (patch: Partial<WizardFormData>) => void;
}

const POPUP_SOURCE = "scrumagent-google-oauth";

export function StepGoogle({ data, onChange }: StepGoogleProps): JSX.Element {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const connected = Boolean(data.googleAuthSessionId);

  const authorize = async () => {
    setBusy(true);
    setError(null);
    try {
      const { authorize_url, auth_session_id } = await api.startGoogleAuth();
      const popup = window.open(
        authorize_url,
        POPUP_SOURCE,
        "width=520,height=680",
      );
      const backendOrigin = new URL(API_BASE).origin;

      const handler = (event: MessageEvent) => {
        if (event.origin !== backendOrigin) return;
        const msg = event.data as {
          source?: string;
          ok?: boolean;
          authSessionId?: string;
          email?: string;
        };
        if (!msg || msg.source !== POPUP_SOURCE) return;
        window.removeEventListener("message", handler);
        setBusy(false);
        if (msg.ok && msg.authSessionId === auth_session_id) {
          onChange({
            googleAuthSessionId: auth_session_id,
            googleAccountEmail: msg.email ?? data.agentEmail,
          });
        } else {
          setError("Authorization was cancelled. Please try again.");
        }
      };
      window.addEventListener("message", handler);

      if (!popup) {
        window.removeEventListener("message", handler);
        setBusy(false);
        setError("Popup was blocked — allow popups for this site and retry.");
      }
    } catch (e) {
      setBusy(false);
      setError(
        e instanceof ApiError ? e.message : "Could not start authorization.",
      );
    }
  };

  return (
    <div className="vstack">
      <div className="info-box">
        <Icon name="mic" size={14} />
        <div>
          <strong>Why a dedicated account?</strong>
          <div className="muted" style={{ marginTop: 4 }}>
            ScrumAgent signs in as a dedicated Google account to read your team&apos;s
            calendar and join Google Meet calls — a visible, consented participant
            in every meeting.
          </div>
        </div>
      </div>

      <div>
        <label className="label" htmlFor="agent-email">
          Agent account email
        </label>
        <input
          id="agent-email"
          className="input"
          type="email"
          placeholder="telecom.scrum.agent@municorn.com"
          value={data.agentEmail}
          onChange={(e) => onChange({ agentEmail: e.target.value })}
          disabled={connected}
        />
        <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
          Sign in as this account in the popup to grant Calendar access.
        </div>
      </div>

      <div className={`integration-card ${connected ? "connected" : ""}`}>
        <div className="integration-icon">
          <Icon name="google" size={20} />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 500 }}>Google Workspace</div>
          <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>
            {connected
              ? `Authorized · ${data.googleAccountEmail ?? data.agentEmail}`
              : "Authorize the agent account to continue"}
          </div>
        </div>
        {connected ? (
          <span
            className="hstack"
            style={{ color: "var(--ok)", fontSize: 12, fontWeight: 500 }}
          >
            <Icon name="check" size={14} />
            Authorized
          </span>
        ) : (
          <Button
            variant="secondary"
            onClick={authorize}
            disabled={busy || !data.agentEmail.trim()}
          >
            <Icon name="link" size={14} />
            {busy ? "Waiting…" : "Authorize agent"}
          </Button>
        )}
      </div>

      {error && (
        <div className="project-error" role="alert">
          <Icon name="alert" size={12} />
          {error}
        </div>
      )}
    </div>
  );
}
