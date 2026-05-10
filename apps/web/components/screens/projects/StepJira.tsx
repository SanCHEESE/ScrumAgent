import type { JSX } from "react";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import type { WizardFormData } from "./types";

export interface StepJiraProps {
  data: WizardFormData;
  onChange: (patch: Partial<WizardFormData>) => void;
}

export function StepJira({ data, onChange }: StepJiraProps): JSX.Element {
  return (
    <div className="vstack">
      <div>
        <label className="label" htmlFor="jira-url">
          Atlassian site URL
        </label>
        <input
          id="jira-url"
          className="input"
          placeholder="https://municorn.atlassian.net"
          value={data.jiraUrl}
          onChange={(e) => onChange({ jiraUrl: e.target.value })}
        />
      </div>

      <div>
        <label className="label" htmlFor="jira-key">
          Default project key
        </label>
        <input
          id="jira-key"
          className="input"
          placeholder="PLAT"
          value={data.jiraProjectKey}
          onChange={(e) =>
            onChange({ jiraProjectKey: e.target.value.toUpperCase() })
          }
        />
      </div>

      <div
        className={`integration-card ${data.jiraConnected ? "connected" : ""}`}
      >
        <div className="integration-icon">
          <Icon name="jira" size={20} />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 500 }}>Atlassian / Jira</div>
          <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>
            {data.jiraConnected
              ? "Connected · read + comment + transition"
              : "Read issues, post comments, and transition status"}
          </div>
        </div>
        {data.jiraConnected ? (
          <span
            className="hstack"
            style={{ color: "var(--ok)", fontSize: 12, fontWeight: 500 }}
          >
            <Icon name="check" size={14} />
            Connected
          </span>
        ) : (
          <Button
            variant="secondary"
            onClick={() => onChange({ jiraConnected: true })}
          >
            <Icon name="link" size={14} />
            Connect Atlassian
          </Button>
        )}
      </div>

      <div className="info-box info-box-sm">
        <Icon name="alert" size={12} />
        <div className="muted">
          The agent needs read access to issues and sprints. Status
          transitions and ticket creation require per-action approval.
        </div>
      </div>
    </div>
  );
}
