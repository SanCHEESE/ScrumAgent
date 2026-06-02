"use client";

import { useEffect, useState, type JSX } from "react";
import { Icon } from "@/components/ui/Icon";
import { ApiError, api, type ProjectOut } from "@/lib/api";
import type { Project } from "@/lib/types";
import { ProjectsList } from "./ProjectsList";

/** Map a backend project onto the view shape the grid renders. Sync stats are
 *  not tracked yet, so they default to zero / never-synced. */
function toView(p: ProjectOut): Project {
  return {
    id: p.id,
    name: p.name,
    email: p.agent_email,
    description: p.description ?? "",
    lastSync: null,
    status: "never_synced",
    meetings: 0,
    pending: 0,
  };
}

/** Client wrapper that loads the caller's real projects (owned or member of). */
export function ProjectsListLive(): JSX.Element {
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    api
      .listProjects()
      .then((rows) => {
        if (active) setProjects(rows.map(toView));
      })
      .catch((e) => {
        if (active) {
          setError(
            e instanceof ApiError ? e.message : "Could not load projects.",
          );
        }
      });
    return () => {
      active = false;
    };
  }, []);

  if (error) {
    return (
      <div className="project-error" role="alert">
        <Icon name="alert" size={12} />
        {error}
      </div>
    );
  }
  if (projects === null) {
    return <div className="muted">Loading projects…</div>;
  }
  return <ProjectsList projects={projects} />;
}
