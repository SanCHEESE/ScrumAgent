"use client";

import type { ChangeEvent, JSX } from "react";
import { useCallback, useEffect, useState } from "react";
import { Avatar } from "@/components/ui/Avatar";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import {
  ApiError,
  api,
  type MeetingParticipantSuggestion,
  type ProjectOut,
  type ProjectRole,
} from "@/lib/api";
import { toParticipant } from "@/lib/avatar";

const ROLE_OPTIONS: readonly { value: ProjectRole; label: string }[] = [
  { value: "member", label: "Member" },
  { value: "viewer", label: "Viewer" },
  { value: "admin", label: "Admin" },
];

type SuggestState =
  | { status: "loading" }
  | { status: "ready"; rows: MeetingParticipantSuggestion[] }
  | { status: "not_connected" }
  | { status: "error"; message: string };

export function MembersSection(): JSX.Element {
  const [projects, setProjects] = useState<ProjectOut[] | null>(null);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [suggest, setSuggest] = useState<SuggestState>({ status: "loading" });
  const [selected, setSelected] = useState<Set<string>>(new Set());

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const rows = await api.listProjects();
        if (!active) return;
        setProjects(rows);
        setProjectId(rows[0]?.id ?? null);
      } catch (e) {
        if (!active) return;
        if (e instanceof ApiError && e.status === 401) return;
        setError(e instanceof ApiError ? e.message : "Could not load projects.");
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const loadSuggestions = useCallback(async (id: string) => {
    setSuggest({ status: "loading" });
    try {
      const rows = await api.listMemberSuggestions(id);
      setSuggest({ status: "ready", rows });
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) return;
      if (e instanceof ApiError && e.status === 409) {
        setSuggest({ status: "not_connected" });
        return;
      }
      setSuggest({
        status: "error",
        message:
          e instanceof ApiError ? e.message : "Could not load suggestions.",
      });
    }
  }, []);

  // Reload suggestions and reset the selection whenever the project changes.
  useEffect(() => {
    setSelected(new Set());
    setActionError(null);
    if (projectId) void loadSuggestions(projectId);
  }, [projectId, loadSuggestions]);

  const selectedProject =
    projects?.find((project) => project.id === projectId) ?? null;

  const replaceProject = (updated: ProjectOut) =>
    setProjects((prev) =>
      prev ? prev.map((p) => (p.id === updated.id ? updated : p)) : prev,
    );

  const runMutation = async (fn: () => Promise<ProjectOut>) => {
    setBusy(true);
    setActionError(null);
    try {
      replaceProject(await fn());
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) return;
      setActionError(e instanceof ApiError ? e.message : "Update failed.");
    } finally {
      setBusy(false);
    }
  };

  const addSelected = async () => {
    if (!projectId || selected.size === 0) return;
    const members = [...selected].map((email) => ({
      email,
      role: "member" as ProjectRole,
    }));
    setBusy(true);
    setActionError(null);
    try {
      replaceProject(await api.addProjectMembers(projectId, members));
      setSelected(new Set());
      await loadSuggestions(projectId);
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) return;
      setActionError(e instanceof ApiError ? e.message : "Could not add members.");
    } finally {
      setBusy(false);
    }
  };

  const toggle = (email: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(email)) next.delete(email);
      else next.add(email);
      return next;
    });

  if (error) {
    return (
      <div className="project-error" role="alert">
        <Icon name="alert" size={12} />
        {error}
      </div>
    );
  }
  if (projects === null) {
    return <div className="muted">Loading projects...</div>;
  }
  if (projects.length === 0) {
    return (
      <div className="muted">
        No projects yet - create a project to manage members.
      </div>
    );
  }

  const members = selectedProject?.members ?? [];
  const pending = selectedProject?.pending_members ?? [];

  return (
    <div className="vstack" style={{ gap: 0 }}>
      <div className="setting-group">
        <div className="setting-row">
          <div className="setting-row-label">
            <div className="setting-row-name">Project</div>
            <div className="setting-row-hint">
              Membership is scoped to the selected project.
            </div>
          </div>
          <div className="setting-row-control">
            <select
              className="select"
              style={{ width: 220 }}
              value={projectId ?? ""}
              onChange={(e: ChangeEvent<HTMLSelectElement>) =>
                setProjectId(e.target.value)
              }
              aria-label="Project"
            >
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className="setting-group">
        <h2 className="setting-group-title">Team members</h2>
        <p className="setting-group-sub">
          People who can chat with the agent and review proposed updates. Invited
          people join automatically the first time they sign in.
        </p>

        {actionError && (
          <div className="project-error" role="alert" style={{ marginBottom: 10 }}>
            <Icon name="alert" size={12} />
            {actionError}
          </div>
        )}

        {members.length === 0 && pending.length === 0 ? (
          <div className="muted" style={{ paddingTop: 8 }}>
            This project has no members yet.
          </div>
        ) : (
          <table className="members-table">
            <thead>
              <tr>
                <th>Member</th>
                <th>Role</th>
              </tr>
            </thead>
            <tbody>
              {members.map((member) => {
                const participant = toParticipant(member.email, member.name);
                return (
                  <tr key={`m-${member.user_id}`}>
                    <td>
                      <div className="member-cell">
                        <Avatar participant={participant} size={28} />
                        <div>
                          <div style={{ fontWeight: 500 }}>
                            {member.name ?? member.email}
                          </div>
                          <div className="muted mono" style={{ fontSize: 11 }}>
                            {member.email}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td>
                      <select
                        aria-label={`Role for ${member.name ?? member.email}`}
                        className="input member-role-select"
                        value={member.role}
                        disabled={busy}
                        onChange={(e) =>
                          void runMutation(() =>
                            api.updateMemberRole(
                              selectedProject!.id,
                              member.user_id,
                              e.target.value as ProjectRole,
                            ),
                          )
                        }
                      >
                        {ROLE_OPTIONS.map((role) => (
                          <option key={role.value} value={role.value}>
                            {role.label}
                          </option>
                        ))}
                      </select>
                    </td>
                  </tr>
                );
              })}
              {pending.map((invite) => {
                const participant = toParticipant(invite.email, null);
                return (
                  <tr key={`p-${invite.email}`} className="member-row-pending">
                    <td>
                      <div className="member-cell">
                        <Avatar participant={participant} size={28} />
                        <div>
                          <div style={{ fontWeight: 500 }}>
                            {invite.email}{" "}
                            <Badge variant="neutral">Invited</Badge>
                          </div>
                          <div className="muted mono" style={{ fontSize: 11 }}>
                            Joins on first sign-in
                          </div>
                        </div>
                      </div>
                    </td>
                    <td>
                      <select
                        aria-label={`Role for ${invite.email}`}
                        className="input member-role-select"
                        value={invite.role}
                        disabled={busy}
                        onChange={(e) =>
                          void runMutation(() =>
                            api.updatePendingMemberRole(
                              selectedProject!.id,
                              invite.email,
                              e.target.value as ProjectRole,
                            ),
                          )
                        }
                      >
                        {ROLE_OPTIONS.map((role) => (
                          <option key={role.value} value={role.value}>
                            {role.label}
                          </option>
                        ))}
                      </select>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <div className="setting-group">
        <h2 className="setting-group-title">Suggested members</h2>
        <p className="setting-group-sub">
          People from recent meetings on the agent&apos;s calendar. Select and add
          them, then set their roles above.
        </p>

        {suggest.status === "loading" && (
          <div className="muted" style={{ paddingTop: 8 }}>
            Loading suggestions…
          </div>
        )}
        {suggest.status === "not_connected" && (
          <div className="muted" style={{ paddingTop: 8 }}>
            Connect the agent&apos;s Google account (Settings → Integrations) to see
            meeting participants.
          </div>
        )}
        {suggest.status === "error" && (
          <div className="project-error" role="alert">
            <Icon name="alert" size={12} />
            {suggest.message}
          </div>
        )}
        {suggest.status === "ready" && suggest.rows.length === 0 && (
          <div className="muted" style={{ paddingTop: 8 }}>
            Everyone from recent meetings is already on the team.
          </div>
        )}
        {suggest.status === "ready" && suggest.rows.length > 0 && (
          <>
            <div className="notion-db-picker">
              {suggest.rows.map((row) => {
                const isSelected = selected.has(row.email);
                const participant = toParticipant(row.email, row.display_name);
                return (
                  <div
                    key={row.email}
                    role="button"
                    tabIndex={0}
                    aria-pressed={isSelected}
                    className={`db-option ${isSelected ? "selected" : ""}`}
                    onClick={() => toggle(row.email)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        toggle(row.email);
                      }
                    }}
                  >
                    <Avatar participant={participant} size={28} />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 500 }}>
                        {row.display_name ?? row.email}
                      </div>
                      <div className="muted" style={{ fontSize: 12 }}>
                        {row.email}
                      </div>
                      <div
                        className="muted"
                        style={{ fontSize: 11, marginTop: 3 }}
                      >
                        {row.event_count} meeting
                        {row.event_count === 1 ? "" : "s"}
                      </div>
                    </div>
                    <div className="member-select-check">
                      {isSelected && <Icon name="check" size={14} />}
                    </div>
                  </div>
                );
              })}
            </div>
            <div style={{ marginTop: 12 }}>
              <Button
                variant="primary"
                onClick={() => void addSelected()}
                disabled={busy || selected.size === 0}
              >
                Add selected{selected.size > 0 ? ` (${selected.size})` : ""}
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
