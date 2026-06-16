"use client";

// Single fan-out of each project's Google Calendar (ScrumAgent-iar).
//
// HomeMeetingsStat, RecentMeetingsLive, the Sidebar badge, and the meetings
// page all need "every project's meetings". Each used to run its own
// listProjects + Promise.allSettled(listProjectMeetings) — on one Home render
// that fanned out ~3× listProjects + ~3×N listProjectMeetings, and the copies
// had drifted (dedup/cancelled/error handling lived in some but not all).
//
// This provider fetches each project's calendar exactly once (driven by
// ActiveProjectProvider.projects — no per-component listProjects refetch),
// dedupes by event id, drops cancelled events, and exposes per-project
// failures *with their HTTP status* so each consumer can classify them its own
// way (409 "no calendar" vs. a hard error) without re-implementing the fan-out.

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { ReactNode } from "react";
import { ApiError, api, type CalendarMeeting } from "@/lib/api";
import { useActiveProject } from "./ActiveProjectProvider";

const DEFAULT_PROJECT_COLOR = "#0077e6";

/** A calendar event tagged with the project whose agent calendar surfaced it. */
export interface ProjectMeeting extends CalendarMeeting {
  projectId: string;
  projectName: string;
  projectColor: string;
}

/** One project whose calendar fetch failed. `status` is the HTTP status when
 *  the failure was an ApiError (e.g. 409 = no Google calendar connected), so
 *  consumers can tell a soft "connect calendar" state from a hard error. */
export interface ProjectMeetingFailure {
  projectId: string;
  projectName: string;
  status: number | null;
  message: string;
}

export interface ProjectMeetingsContextValue {
  /** Projects are still loading, or their calendars are still being fetched. */
  loading: boolean;
  /** Every project's events — deduped by id (keep first), cancelled dropped,
   *  each annotated with its source project. Past *and* future; consumers
   *  filter/sort as they need. */
  meetings: ProjectMeeting[];
  /** One entry per project whose calendar fetch failed. */
  failures: ProjectMeetingFailure[];
  /** How many projects we attempted to fetch calendars for. */
  total: number;
  /** The account has zero projects (projects loaded successfully, but empty). */
  noProjects: boolean;
  /** GET /projects itself failed (non-401), so no calendars could be fetched. */
  projectsError: boolean;
}

const ProjectMeetingsContext =
  createContext<ProjectMeetingsContextValue | null>(null);

interface FetchState {
  loading: boolean;
  meetings: ProjectMeeting[];
  failures: ProjectMeetingFailure[];
  total: number;
}

const INITIAL_FETCH: FetchState = {
  loading: true,
  meetings: [],
  failures: [],
  total: 0,
};

export function ProjectMeetingsProvider({
  children,
}: {
  children: ReactNode;
}) {
  const { projects, status } = useActiveProject();
  const [fetchState, setFetchState] = useState<FetchState>(INITIAL_FETCH);

  // Re-fetch only when the *set* of projects changes, not on every re-render of
  // the context value (which would otherwise loop).
  const projectsKey = projects.map((p) => p.id).join(",");

  useEffect(() => {
    // Nothing to fetch: projects still loading, the listing errored, or the
    // account is empty. Mirror the projects load state so consumers don't hang.
    if (status !== "ready" || projects.length === 0) {
      setFetchState({
        loading: status === "loading",
        meetings: [],
        failures: [],
        total: 0,
      });
      return;
    }

    let active = true;
    setFetchState((prev) => ({ ...prev, loading: true }));
    (async () => {
      const results = await Promise.allSettled(
        projects.map(async (p) => {
          const events = await api.listProjectMeetings(p.id);
          return events.map<ProjectMeeting>((event) => ({
            ...event,
            projectId: p.id,
            projectName: p.name,
            projectColor: p.color ?? DEFAULT_PROJECT_COLOR,
          }));
        }),
      );
      if (!active) return;

      // Dedup by event id (an event invited to two agent accounts shares one
      // id) and drop cancelled events — once, here, for every consumer.
      const seen = new Set<string>();
      const meetings = results
        .filter(
          (r): r is PromiseFulfilledResult<ProjectMeeting[]> =>
            r.status === "fulfilled",
        )
        .flatMap((r) => r.value)
        .filter((m) => {
          if (seen.has(m.id)) return false;
          seen.add(m.id);
          return m.status?.toLowerCase() !== "cancelled";
        });

      const failures: ProjectMeetingFailure[] = [];
      results.forEach((r, i) => {
        if (r.status !== "rejected") return;
        const reason: unknown = r.reason;
        const httpStatus = reason instanceof ApiError ? reason.status : null;
        // 401 → the API client already cleared the token and is redirecting to
        // login; don't surface a dead error on the way out.
        if (httpStatus === 401) return;
        failures.push({
          projectId: projects[i].id,
          projectName: projects[i].name,
          status: httpStatus,
          message:
            reason instanceof ApiError
              ? reason.message
              : "could not load calendar",
        });
      });

      setFetchState({
        loading: false,
        meetings,
        failures,
        total: projects.length,
      });
    })();
    return () => {
      active = false;
    };
  }, [projectsKey, status, projects]);

  const value = useMemo<ProjectMeetingsContextValue>(
    () => ({
      loading: status === "loading" || fetchState.loading,
      meetings: fetchState.meetings,
      failures: fetchState.failures,
      total: fetchState.total,
      noProjects: status === "ready" && projects.length === 0,
      projectsError: status === "error",
    }),
    [status, projects.length, fetchState],
  );

  return (
    <ProjectMeetingsContext.Provider value={value}>
      {children}
    </ProjectMeetingsContext.Provider>
  );
}

export function useProjectMeetings(): ProjectMeetingsContextValue {
  const ctx = useContext(ProjectMeetingsContext);
  if (!ctx) {
    throw new Error(
      "useProjectMeetings must be used inside <ProjectMeetingsProvider>",
    );
  }
  return ctx;
}
