"use client";

import type { JSX, ReactNode } from "react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Icon, type IconName } from "@/components/ui/Icon";

interface IntegrationCardProps {
  name: string;
  desc: string;
  icon: IconName;
  iconClass: string;
  /** "connected" or "not_connected". */
  connected: boolean;
  /** Pills under the description (e.g. site or workspace names). */
  pills?: string[];
  /** Mono-spaced detail line (e.g. service account email). */
  detail?: string;
  actions?: ReactNode;
}

function IntegrationCard({
  name,
  desc,
  icon,
  iconClass,
  connected,
  pills,
  detail,
  actions,
}: IntegrationCardProps): JSX.Element {
  return (
    <div className="integration-row">
      <div className={`settings-integration-icon ${iconClass}`}>
        <Icon name={icon} size={18} />
      </div>
      <div className="integration-meta">
        <div className="integration-name">{name}</div>
        <div className="integration-desc">{desc}</div>
        {detail !== undefined && (
          <div className="integration-detail">
            <span className="mono">{detail}</span>
          </div>
        )}
        {pills !== undefined && pills.length > 0 && (
          <div className="integration-detail">
            {pills.map((p) => (
              <span key={p} className="pill">
                {p}
              </span>
            ))}
          </div>
        )}
      </div>
      <div className="integration-actions">
        {connected ? (
          <Badge variant="paid">
            <Icon name="check" size={10} />
            Connected
          </Badge>
        ) : (
          <Badge variant="neutral">Not connected</Badge>
        )}
        {actions}
      </div>
    </div>
  );
}

export function IntegrationsSection(): JSX.Element {
  return (
    <div className="vstack" style={{ gap: 0 }}>
      <div className="setting-group">
        <h2 className="setting-group-title">Connected services</h2>
        <p className="setting-group-sub">
          The agent reads from and writes to these on your behalf. Tokens are stored
          encrypted and scoped to the project.
        </p>

        <IntegrationCard
          name="Google Workspace"
          desc="Provides the dedicated agent account that joins Google Meet calls."
          icon="google"
          iconClass="google"
          connected
          detail="scrumagent.platform@municorn.com"
          actions={
            <Button variant="ghost" size="sm">
              Reconnect
            </Button>
          }
        />

        <IntegrationCard
          name="Jira (Atlassian)"
          desc="Read and update issues, manage sprints across linked sites."
          icon="jira"
          iconClass="jira"
          connected
          pills={["municorn.atlassian.net · 4 projects", "platform-sandbox.atlassian.net · 1 project"]}
          actions={
            <>
              <Button variant="ghost" size="sm">
                Add another
              </Button>
              <Button variant="ghost" size="sm">
                Configure
              </Button>
            </>
          }
        />

        <IntegrationCard
          name="Notion"
          desc="Create and update documentation pages."
          icon="notion"
          iconClass="notion"
          connected
          pills={["Municorn HQ · 218 pages", "Platform Wiki · 64 pages"]}
          actions={
            <Button variant="ghost" size="sm">
              Configure
            </Button>
          }
        />

        <IntegrationCard
          name="OpenAI"
          desc="API key powers orchestrator + subagents + Whisper + embeddings."
          icon="sparkles"
          iconClass="openai"
          connected
          detail="sk-...•••3f2 · last used 12 min ago"
          actions={
            <>
              <Button variant="ghost" size="sm">
                Test
              </Button>
              <Button variant="secondary" size="sm">
                Update key
              </Button>
            </>
          }
        />

        <IntegrationCard
          name="Slack"
          desc="Post meeting summaries to channels and accept @mentions."
          icon="chat"
          iconClass="slack"
          connected={false}
          actions={
            <Button variant="primary" size="sm">
              <Icon name="link" size={12} />
              Connect
            </Button>
          }
        />
      </div>
    </div>
  );
}
