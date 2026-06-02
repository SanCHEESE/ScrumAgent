"use client";

import { useEffect, useState, type JSX } from "react";
import { Icon } from "@/components/ui/Icon";
import { ApiError, api, type DirectoryUser } from "@/lib/api";
import type { WizardFormData } from "./types";

export interface StepMembersProps {
  data: WizardFormData;
  onChange: (patch: Partial<WizardFormData>) => void;
}

export function StepMembers({ data, onChange }: StepMembersProps): JSX.Element {
  const [users, setUsers] = useState<DirectoryUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const [directory, me] = await Promise.all([
          api.listUsers(),
          api.me().catch(() => null),
        ]);
        if (!active) return;
        // Exclude the creator — they're added as admin automatically.
        setUsers(directory.filter((u) => u.id !== me?.id));
      } catch (e) {
        if (!active) return;
        setError(e instanceof ApiError ? e.message : "Could not load members.");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const toggle = (id: number) => {
    const selected = data.selectedUserIds.includes(id)
      ? data.selectedUserIds.filter((x) => x !== id)
      : [...data.selectedUserIds, id];
    onChange({ selectedUserIds: selected });
  };

  const hasJira =
    data.jiraSiteUrl.trim() !== "" && data.jiraApiToken.trim() !== "";
  const hasNotion =
    data.notionToken.trim() !== "" && data.notionSectionUrl.trim() !== "";
  const count = data.selectedUserIds.length;

  return (
    <div className="vstack">
      <div>
        <label className="label">
          Select team members{" "}
          <span className="muted">
            (they will see this project and can chat with the agent)
          </span>
        </label>

        {loading && <div className="muted">Loading members…</div>}
        {error && (
          <div className="project-error" role="alert">
            <Icon name="alert" size={12} />
            {error}
          </div>
        )}

        {!loading && !error && users.length === 0 && (
          <div className="muted" style={{ fontSize: 13 }}>
            No other members have signed in yet. You can add them later in Settings.
          </div>
        )}

        {!loading && users.length > 0 && (
          <div className="notion-db-picker">
            {users.map((u) => {
              const selected = data.selectedUserIds.includes(u.id);
              return (
                <div
                  key={u.id}
                  role="button"
                  tabIndex={0}
                  aria-pressed={selected}
                  className={`db-option ${selected ? "selected" : ""}`}
                  onClick={() => toggle(u.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      toggle(u.id);
                    }
                  }}
                >
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 500 }}>{u.name ?? u.email}</div>
                    <div className="muted" style={{ fontSize: 12 }}>
                      {u.email}
                    </div>
                  </div>
                  {selected && <Icon name="check" size={14} />}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="ready-summary">
        <div
          className="mono muted"
          style={{
            fontSize: 11,
            textTransform: "uppercase",
            letterSpacing: "0.1em",
            marginBottom: 10,
          }}
        >
          Ready to provision
        </div>
        <div className="vstack" style={{ gap: 6 }}>
          <SummaryRow label="Project" value={data.name || "(unnamed)"} />
          <SummaryRow
            label="Agent account"
            value={data.googleAccountEmail ?? data.agentEmail}
          />
          <SummaryRow label="Jira" value={hasJira ? data.jiraSiteUrl : "Skipped"} />
          <SummaryRow
            label="Notion"
            value={hasNotion ? "Section linked" : "Skipped"}
          />
          <SummaryRow
            label="Members"
            value={
              count === 0
                ? "Just you (admin)"
                : `You + ${count} member${count === 1 ? "" : "s"}`
            }
          />
        </div>
      </div>
    </div>
  );
}

function SummaryRow({
  label,
  value,
}: {
  label: string;
  value: string;
}): JSX.Element {
  return (
    <div className="hstack" style={{ justifyContent: "space-between" }}>
      <span className="muted">{label}</span>
      <span className="mono" style={{ fontSize: 12 }}>
        {value}
      </span>
    </div>
  );
}
