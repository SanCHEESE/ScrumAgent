import Link from "next/link";
import type { JSX } from "react";
import { Icon } from "@/components/ui/Icon";
import { StatusPill } from "@/components/ui/StatusPill";
import type { Project, ProjectStatus } from "@/lib/types";

const PILL_STATUS: Record<ProjectStatus, "done" | "error" | "pending"> = {
  active: "done",
  error: "error",
  never_synced: "pending",
};

export interface ProjectCardProps {
  project: Project;
  href?: string;
}

/**
 * Single project tile. Matches `.project-tile` from kabanchik-screens.css —
 * status dot + pill, name, description, mono email, three-up stats grid.
 */
export function ProjectCard({
  project,
  href = "#",
}: ProjectCardProps): JSX.Element {
  return (
    <Link href={href} className="project-tile">
      <div
        className="hstack"
        style={{ justifyContent: "space-between", alignItems: "flex-start" }}
      >
        <div className="hstack">
          <span className={`project-dot ${project.status}`} />
          <StatusPill status={PILL_STATUS[project.status]} />
        </div>
      </div>
      <div className="project-tile-name">{project.name}</div>
      <div className="project-tile-desc muted">{project.description}</div>
      <div className="project-tile-email mono">{project.email}</div>
      <div className="divider" />
      <div className="project-tile-stats">
        <div>
          <div className="pst-num">{project.meetings}</div>
          <div className="pst-label">meetings</div>
        </div>
        <div>
          <div className="pst-num">{project.pending}</div>
          <div className="pst-label">pending</div>
        </div>
        <div>
          <div className="pst-num mono" style={{ fontSize: 12 }}>
            {project.lastSync ?? "—"}
          </div>
          <div className="pst-label">last sync</div>
        </div>
      </div>
      {project.status === "error" && (
        <div className="project-error">
          <Icon name="alert" size={12} />
          Jira sync failed — token expired
        </div>
      )}
    </Link>
  );
}
