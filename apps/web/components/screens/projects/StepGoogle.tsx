import type { JSX } from "react";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { slugify, type WizardFormData } from "./types";

export interface StepGoogleProps {
  data: WizardFormData;
  onChange: (patch: Partial<WizardFormData>) => void;
}

export function StepGoogle({ data, onChange }: StepGoogleProps): JSX.Element {
  const generated = `scrumagent.${slugify(data.name)}@municorn.com`;
  return (
    <div className="vstack">
      <div className="info-box">
        <Icon name="mic" size={14} />
        <div>
          <strong>Why a dedicated account?</strong>
          <div className="muted" style={{ marginTop: 4 }}>
            ScrumAgent uses a dedicated Google account to join Google Meet
            calls and read your team's calendar. This makes the agent a
            visible, consented participant in every meeting.
          </div>
        </div>
      </div>

      <div>
        <label className="label">Generated email</label>
        <span className="generated-email">
          <Icon name="google" size={14} />
          {generated}
        </span>
      </div>

      <div
        className={`integration-card ${data.googleConnected ? "connected" : ""}`}
      >
        <div className="integration-icon">
          <Icon name="google" size={20} />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 500 }}>Google Workspace</div>
          <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>
            {data.googleConnected
              ? "Connected · ready to join calls"
              : "Authorize the agent account in your admin console"}
          </div>
        </div>
        {data.googleConnected ? (
          <div className="hstack" style={{ gap: 12 }}>
            <span
              className="hstack"
              style={{ color: "var(--ok)", fontSize: 12, fontWeight: 500 }}
            >
              <Icon name="check" size={14} />
              Connected
            </span>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => onChange({ googleConnected: false })}
            >
              Test connection
            </button>
          </div>
        ) : (
          <Button
            variant="secondary"
            onClick={() => onChange({ googleConnected: true })}
          >
            <Icon name="link" size={14} />
            Connect
          </Button>
        )}
      </div>
    </div>
  );
}
