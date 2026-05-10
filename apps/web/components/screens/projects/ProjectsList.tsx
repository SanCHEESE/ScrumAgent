import Link from "next/link";
import type { JSX } from "react";
import { Icon } from "@/components/ui/Icon";
import { PROJECTS } from "@/lib/mock-data";
import type { Project } from "@/lib/types";
import { ProjectCard } from "./ProjectCard";

export interface ProjectsListProps {
  projects?: Project[];
}

/**
 * Projects grid. Renders `.projects-grid` with one `.project-tile` per
 * project plus a final dashed `.project-tile-add` linking to /projects/new.
 */
export function ProjectsList({
  projects = PROJECTS,
}: ProjectsListProps): JSX.Element {
  return (
    <div className="projects-grid">
      {projects.map((p) => (
        <ProjectCard key={p.id} project={p} />
      ))}
      <Link href="/projects/new" className="project-tile project-tile-add">
        <div className="add-circle">
          <Icon name="plus" size={22} />
        </div>
        <div style={{ fontWeight: 500, marginTop: 12 }}>New project</div>
        <div className="muted" style={{ marginTop: 4, fontSize: 12 }}>
          Provision an agent Google account and connect Jira + Notion
        </div>
      </Link>
    </div>
  );
}
