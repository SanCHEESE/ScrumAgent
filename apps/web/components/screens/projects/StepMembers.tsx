"use client";

import type { JSX } from "react";
import { Icon } from "@/components/ui/Icon";
import type { ProjectRole } from "@/lib/api";
import type { SuggestedProjectMember } from "./AddProjectWizard";
import type { WizardFormData } from "./types";

export interface StepMembersProps {
  data: WizardFormData;
  onChange: (patch: Partial<WizardFormData>) => void;
  users: SuggestedProjectMember[];
  loading: boolean;
  error: string | null;
}

const ROLE_OPTIONS: readonly { value: ProjectRole; label: string }[] = [
  { value: "member", label: "Member" },
  { value: "viewer", label: "Viewer" },
  { value: "admin", label: "Admin" },
];

export function StepMembers({
  data,
  onChange,
  users,
  loading,
  error,
}: StepMembersProps): JSX.Element {
  const toggle = (id: number) => {
    if (data.selectedUserIds.includes(id)) {
      const nextRoles = { ...data.selectedMemberRoles };
      delete nextRoles[id];
      onChange({
        selectedUserIds: data.selectedUserIds.filter((x) => x !== id),
        selectedMemberRoles: nextRoles,
      });
      return;
    }
    onChange({
      selectedUserIds: [...data.selectedUserIds, id],
      selectedMemberRoles: { ...data.selectedMemberRoles, [id]: "member" },
    });
  };

  const setRole = (id: number, role: ProjectRole) => {
    const selectedUserIds = data.selectedUserIds.includes(id)
      ? data.selectedUserIds
      : [...data.selectedUserIds, id];
    onChange({
      selectedUserIds,
      selectedMemberRoles: { ...data.selectedMemberRoles, [id]: role },
    });
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
            No signed-in meeting participants found. You can add members later in
            Settings.
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
                    <div className="muted" style={{ fontSize: 11, marginTop: 3 }}>
                      {u.source === "meeting"
                        ? `${u.eventCount} meeting${u.eventCount === 1 ? "" : "s"}`
                        : "Suggested account"}
                    </div>
                  </div>
                  <select
                    aria-label={`Role for ${u.name ?? u.email}`}
                    value={data.selectedMemberRoles[u.id] ?? "member"}
                    className="input member-role-select"
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => setRole(u.id, e.target.value as ProjectRole)}
                  >
                    {ROLE_OPTIONS.map((role) => (
                      <option key={role.value} value={role.value}>
                        {role.label}
                      </option>
                    ))}
                  </select>
                  <div className="member-select-check">
                    {selected && <Icon name="check" size={14} />}
                  </div>
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
