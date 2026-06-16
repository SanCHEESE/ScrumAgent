"use client";

import { useEffect, useState, type JSX } from "react";
import { Icon } from "@/components/ui/Icon";
import { ApiError, api, type ProjectOut } from "@/lib/api";
import { parseCalendarMs } from "@/lib/calendar-date";
import type { Project } from "@/lib/types";
import { ProjectsList } from "./ProjectsList";

/** Map a backend project onto the view shape the grid renders. Counts start at
 *  zero and are filled in from the live calendar fetch. */
function toView(p: ProjectOut): Project {
  return {
    id: p.id,
    name: p.name,
    email: p.agent_email,
    description: p.description ?? "",
    lastSync: null,
    status: p.google_connected ? "active" : "error",
    meetings: 0,
    pending: 0,
  };
}

/** Client wrapper that loads the caller's real projects (owned or member of)
 *  and per-project live calendar counts: meetings = events in the default
 *  window, pending = the upcoming subset. A failed calendar fetch (revoked
 *  grant, upstream error) leaves that card's counts at zero. */
export function ProjectsListLive(): JSX.Element {
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const rows = await api.listProjects();
        if (!active) return;
        setProjects(rows.map(toView));

        const now = Date.now();
        const counts = await Promise.allSettled(
          rows.map(async (p) => {
            const events = await api.listProjectMeetings(p.id);
            return {
              id: p.id,
              meetings: events.length,
              pending: events.filter((e) => (parseCalendarMs(e.start) ?? 0) >= now)
                .length,
            };
          }),
        );
        if (!active) return;
        const byId = new Map(
          counts
            .filter(
              (
                r,
              ): r is PromiseFulfilledResult<{
                id: string;
                meetings: number;
                pending: number;
              }> => r.status === "fulfilled",
            )
            .map((r) => [r.value.id, r.value]),
        );
        setProjects((prev) =>
          (prev ?? []).map((p) => {
            const c = byId.get(p.id);
            return c ? { ...p, meetings: c.meetings, pending: c.pending } : p;
          }),
        );
      } catch (e) {
        if (!active) return;
        // 401 → the API client is already redirecting to /login; don't flash a
        // dead "Invalid or expired token" on the way out.
        if (e instanceof ApiError && e.status === 401) return;
        setError(
          e instanceof ApiError ? e.message : "Could not load projects.",
        );
      }
    })();
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
