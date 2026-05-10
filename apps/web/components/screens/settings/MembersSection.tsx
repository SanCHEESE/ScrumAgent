import type { JSX } from "react";
import { Avatar } from "@/components/ui/Avatar";
import { Badge, type BadgeVariant } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { PARTICIPANTS } from "@/lib/mock-data";

interface Member {
  id: string;
  email: string;
  role: "Admin" | "Member" | "Viewer";
  status: "active" | "invited";
  lastActive: string;
}

const MEMBERS: Member[] = [
  { id: "alice", email: "alice@municorn.com", role: "Admin", status: "active", lastActive: "5 min ago" },
  { id: "bob", email: "bob@municorn.com", role: "Member", status: "active", lastActive: "2 hours ago" },
  { id: "carol", email: "carol@municorn.com", role: "Member", status: "active", lastActive: "Yesterday" },
  { id: "dave", email: "dave@municorn.com", role: "Member", status: "active", lastActive: "Yesterday" },
  { id: "eve", email: "eve@municorn.com", role: "Viewer", status: "invited", lastActive: "—" },
];

function roleBadge(role: Member["role"]): BadgeVariant {
  if (role === "Admin") return "brand";
  if (role === "Viewer") return "neutral";
  return "neutral";
}

export function MembersSection(): JSX.Element {
  return (
    <div className="vstack" style={{ gap: 0 }}>
      <div className="setting-group">
        <div
          className="hstack"
          style={{ justifyContent: "space-between", alignItems: "flex-end", marginTop: 6 }}
        >
          <div>
            <h2 className="setting-group-title">Team members</h2>
            <p className="setting-group-sub">
              People who can chat with the agent and review proposed updates.
            </p>
          </div>
          <Button variant="primary" size="sm">
            <Icon name="plus" size={14} />
            Invite member
          </Button>
        </div>

        <table className="members-table">
          <thead>
            <tr>
              <th>Member</th>
              <th>Role</th>
              <th>Status</th>
              <th>Last active</th>
              <th style={{ textAlign: "right" }}>{" "}</th>
            </tr>
          </thead>
          <tbody>
            {MEMBERS.map((m) => {
              const p = PARTICIPANTS[m.id];
              return (
                <tr key={m.id}>
                  <td>
                    <div className="member-cell">
                      {p !== undefined && <Avatar participant={p} size={28} />}
                      <div>
                        <div style={{ fontWeight: 500 }}>{p?.name ?? m.email}</div>
                        <div className="muted mono" style={{ fontSize: 11 }}>
                          {m.email}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td>
                    <Badge variant={roleBadge(m.role)}>{m.role}</Badge>
                  </td>
                  <td>
                    {m.status === "active" ? (
                      <Badge variant="paid">Active</Badge>
                    ) : (
                      <Badge variant="unpaid">Invited</Badge>
                    )}
                  </td>
                  <td className="mono muted" style={{ fontSize: 12 }}>
                    {m.lastActive}
                  </td>
                  <td style={{ textAlign: "right" }}>
                    <Button variant="ghost" size="sm" iconOnly aria-label="Member actions">
                      <Icon name="more" size={14} />
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
