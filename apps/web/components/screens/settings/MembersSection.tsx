"use client";

import type { ChangeEvent, JSX } from "react";
import { useEffect, useMemo, useState } from "react";
import { Avatar } from "@/components/ui/Avatar";
import { Badge, type BadgeVariant } from "@/components/ui/Badge";
import { Icon } from "@/components/ui/Icon";
import { ApiError, api, type ProjectOut } from "@/lib/api";
import { toParticipant } from "@/lib/avatar";

function roleLabel(role: string): string {
  return role
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function roleBadge(role: string): BadgeVariant {
  return role === "admin" ? "brand" : "neutral";
}

export function MembersSection(): JSX.Element {
  const [projects, setProjects] = useState<ProjectOut[] | null>(null);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

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

  const selectedProject = useMemo(
    () => projects?.find((project) => project.id === projectId) ?? null,
    [projects, projectId],
  );

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
          People who can chat with the agent and review proposed updates.
        </p>

        {members.length === 0 ? (
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
                  <tr key={member.user_id}>
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
                      <Badge variant={roleBadge(member.role)}>
                        {roleLabel(member.role)}
                      </Badge>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
