"use client";

// Meetings — live Google Calendar events of each project's agent account
// (ScrumAgent-m5x). Replaces the mock archive: we list every user project and
// merge the agent calendars, split into Upcoming / Past.

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import {
  CalendarMeetingRow,
  type CalendarMeetingVM,
} from "@/components/screens/meetings/CalendarMeetingRow";
import { ApiError, api } from "@/lib/api";

type Filter = "all" | "upcoming" | "past";

const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "upcoming", label: "Upcoming" },
  { key: "past", label: "Past" },
];

interface LoadState {
  loading: boolean;
  meetings: CalendarMeetingVM[];
  /** Per-project load failures, e.g. revoked Google grant. */
  problems: string[];
  /** No projects at all → point at the wizard instead of an empty table. */
  noProjects: boolean;
}

const INITIAL: LoadState = {
  loading: true,
  meetings: [],
  problems: [],
  noProjects: false,
};

function startMs(m: CalendarMeetingVM): number {
  if (!m.start) return 0;
  return new Date(m.start.length === 10 ? `${m.start}T00:00:00` : m.start).getTime();
}

export default function MeetingsPage() {
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [state, setState] = useState<LoadState>(INITIAL);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const projects = await api.listProjects();
        if (projects.length === 0) {
          if (!cancelled)
            setState({ ...INITIAL, loading: false, noProjects: true });
          return;
        }
        const now = Date.now();
        const results = await Promise.allSettled(
          projects.map(async (p) => {
            const events = await api.listProjectMeetings(p.id);
            return events.map<CalendarMeetingVM>((e) => ({
              ...e,
              projectName: p.name,
              projectColor: p.color,
              upcoming: e.start
                ? new Date(
                    e.start.length === 10 ? `${e.start}T00:00:00` : e.start,
                  ).getTime() >= now
                : false,
            }));
          }),
        );
        if (cancelled) return;
        const meetings = results
          .filter(
            (r): r is PromiseFulfilledResult<CalendarMeetingVM[]> =>
              r.status === "fulfilled",
          )
          .flatMap((r) => r.value);
        const problems = results
          .map((r, i) =>
            r.status === "rejected"
              ? `${projects[i].name}: ${
                  r.reason instanceof ApiError
                    ? r.reason.message
                    : "could not load calendar"
                }`
              : null,
          )
          .filter((p): p is string => p !== null);
        setState({ loading: false, meetings, problems, noProjects: false });
      } catch (e) {
        if (cancelled) return;
        setState({
          ...INITIAL,
          loading: false,
          problems: [e instanceof ApiError ? e.message : "Could not load projects"],
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const subset = state.meetings.filter((m) => {
      if (filter === "upcoming" && !m.upcoming) return false;
      if (filter === "past" && m.upcoming) return false;
      if (
        q &&
        !(m.title ?? "").toLowerCase().includes(q) &&
        !(m.organizer_email ?? "").toLowerCase().includes(q)
      )
        return false;
      return true;
    });
    // Upcoming reads soonest-first; past (and the mixed view) newest-first.
    return subset.sort((a, b) =>
      filter === "upcoming" ? startMs(a) - startMs(b) : startMs(b) - startMs(a),
    );
  }, [state.meetings, filter, query]);

  const counts = useMemo(() => {
    const upcoming = state.meetings.filter((m) => m.upcoming).length;
    return {
      all: state.meetings.length,
      upcoming,
      past: state.meetings.length - upcoming,
    };
  }, [state.meetings]);

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">
            Meetings <em>calendar</em>
          </h1>
          <div className="page-subtitle">
            Live from each project&apos;s agent Google Calendar.
          </div>
        </div>
        <div className="hstack">
          <label className="input-search">
            <Icon name="search" size={14} />
            <input
              className="input-bare"
              placeholder="Search meetings…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
          <Button variant="secondary" size="sm" disabled>
            <Icon name="plus" size={14} /> Upload recording
          </Button>
        </div>
      </div>

      {state.problems.map((p) => (
        <div className="project-error" role="alert" key={p}>
          <Icon name="alert" size={12} />
          {p}
        </div>
      ))}

      <div className="tabs" role="tablist">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            role="tab"
            aria-selected={filter === f.key}
            className={`tab ${filter === f.key ? "active" : ""}`}
            onClick={() => setFilter(f.key)}
          >
            {f.label}
            <span className="tab-count">{counts[f.key]}</span>
          </button>
        ))}
      </div>

      <div className="meetings-table">
        <div className="meetings-table-head" role="row">
          <div>Meeting</div>
          <div>Date</div>
          <div>Participants</div>
          <div>Outputs</div>
          <div>Status</div>
          <div></div>
        </div>
        {state.loading ? (
          <div className="empty">
            <div className="empty-title">Loading calendar…</div>
            <div className="empty-sub">Fetching events from Google Calendar.</div>
          </div>
        ) : state.noProjects ? (
          <div className="empty">
            <div className="empty-title">No projects yet</div>
            <div className="empty-sub">
              <Link href="/projects/new">Create a project</Link> and authorize
              its agent account to see the team calendar here.
            </div>
          </div>
        ) : filtered.length === 0 ? (
          <div className="empty">
            <div className="empty-title">No meetings match</div>
            <div className="empty-sub">
              Try a different search or clear the filter.
            </div>
          </div>
        ) : (
          filtered.map((m) => (
            <CalendarMeetingRow key={`${m.projectName}-${m.id}`} meeting={m} />
          ))
        )}
      </div>
    </div>
  );
}
