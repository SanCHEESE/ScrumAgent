import type { JSX } from "react";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import type { WizardFormData } from "./types";

const DB_OPTIONS = [
  "Sprint Notes",
  "Architecture Decisions",
  "Team Wiki",
] as const;

export interface StepNotionProps {
  data: WizardFormData;
  onChange: (patch: Partial<WizardFormData>) => void;
}

export function StepNotion({ data, onChange }: StepNotionProps): JSX.Element {
  return (
    <div className="vstack">
      <div>
        <label className="label" htmlFor="notion-url">
          Workspace URL
        </label>
        <input
          id="notion-url"
          className="input"
          placeholder="https://municorn.notion.site"
          value={data.notionWorkspaceUrl}
          onChange={(e) => onChange({ notionWorkspaceUrl: e.target.value })}
        />
      </div>

      <div
        className={`integration-card ${data.notionConnected ? "connected" : ""}`}
      >
        <div className="integration-icon">
          <Icon name="notion" size={20} />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 500 }}>Notion</div>
          <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>
            {data.notionConnected
              ? "Connected · pages can be created and edited"
              : "Authorize the agent in your Notion workspace"}
          </div>
        </div>
        {data.notionConnected ? (
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
            onClick={() => onChange({ notionConnected: true })}
          >
            <Icon name="link" size={14} />
            Connect Notion
          </Button>
        )}
      </div>

      <div>
        <label className="label">Default page for meeting notes</label>
        <div className="notion-db-picker">
          {DB_OPTIONS.map((db) => (
            <div
              key={db}
              role="button"
              tabIndex={0}
              className={`db-option ${data.notionDb === db ? "selected" : ""}`}
              onClick={() => onChange({ notionDb: db })}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onChange({ notionDb: db });
                }
              }}
            >
              <Icon name="notion" size={14} />
              <span>{db}</span>
              {data.notionDb === db && <Icon name="check" size={14} />}
            </div>
          ))}
        </div>
      </div>

      <div className="info-box info-box-sm">
        <Icon name="sparkles" size={12} />
        <div className="muted">
          The agent will create one new page in this database for every
          meeting it attends.
        </div>
      </div>
    </div>
  );
}
