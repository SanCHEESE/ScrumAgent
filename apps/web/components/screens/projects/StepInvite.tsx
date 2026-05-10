import type { JSX } from "react";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import {
  slugify,
  type Invite,
  type InviteRole,
  type WizardFormData,
} from "./types";

const ROLES: readonly InviteRole[] = ["Member", "Admin"];

export interface StepInviteProps {
  data: WizardFormData;
  onChange: (patch: Partial<WizardFormData>) => void;
}

export function StepInvite({ data, onChange }: StepInviteProps): JSX.Element {
  const updateInvite = (idx: number, patch: Partial<Invite>) => {
    const next = data.invites.map((inv, i) =>
      i === idx ? { ...inv, ...patch } : inv,
    );
    onChange({ invites: next });
  };
  const addInvite = () => {
    onChange({
      invites: [...data.invites, { email: "", role: "Member" as InviteRole }],
    });
  };
  const removeInvite = (idx: number) => {
    if (data.invites.length === 1) {
      onChange({ invites: [{ email: "", role: "Member" }] });
      return;
    }
    onChange({ invites: data.invites.filter((_, i) => i !== idx) });
  };

  const generated = `scrumagent.${slugify(data.name)}@municorn.com`;
  const filledInvites = data.invites.filter((i) => i.email.trim()).length;

  return (
    <div className="vstack">
      <div>
        <label className="label">
          Invite team members{" "}
          <span className="muted">
            (they will be able to chat with the agent)
          </span>
        </label>
        <div className="vstack" style={{ gap: 8 }}>
          {data.invites.map((inv, i) => (
            <div key={i} className="invite-row">
              <input
                className="input invite-input"
                type="email"
                placeholder="teammate@municorn.com"
                value={inv.email}
                onChange={(e) => updateInvite(i, { email: e.target.value })}
              />
              <select
                className="select"
                value={inv.role}
                onChange={(e) =>
                  updateInvite(i, { role: e.target.value as InviteRole })
                }
              >
                {ROLES.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
              <Button
                variant="ghost"
                iconOnly
                aria-label="Remove invite"
                onClick={() => removeInvite(i)}
              >
                <Icon name="close" size={14} />
              </Button>
            </div>
          ))}
        </div>
        <div
          className="hstack"
          style={{ marginTop: 10, justifyContent: "space-between" }}
        >
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={addInvite}
          >
            <Icon name="plus" size={12} />
            Add another
          </button>
          <span className="muted" style={{ fontSize: 12 }}>
            You can do this later in Settings.
          </span>
        </div>
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
          <SummaryRow label="Agent account" value={generated} />
          <SummaryRow
            label="Jira"
            value={`${data.jiraUrl || "—"} · ${data.jiraProjectKey}`}
          />
          <SummaryRow
            label="Notion"
            value={`${data.notionWorkspaceUrl || "—"} · ${data.notionDb || "(no default)"}`}
          />
          <SummaryRow
            label="Invites"
            value={
              filledInvites === 0
                ? "Skipped"
                : `${filledInvites} team member${filledInvites === 1 ? "" : "s"}`
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
