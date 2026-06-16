"use client";

// Meetings — live Google Calendar events of each project's agent account
// (ScrumAgent-m5x). The per-project calendar fan-out is shared with the Home
// stat/recent cards and the sidebar badge via ProjectMeetingsProvider
// (ScrumAgent-iar); this page just projects it into the Upcoming/Past table.

import { useMemo, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import {
  CalendarMeetingRow,
  type CalendarMeetingVM,
} from "@/components/screens/meetings/CalendarMeetingRow";
import { useProjectMeetings } from "@/components/shell/ProjectMeetingsProvider";
import { parseCalendarMs } from "@/lib/calendar-date";

type Filter = "all" | "upcoming" | "past";

const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "upcoming", label: "Upcoming" },
  { key: "past", label: "Past" },
];

function startMs(m: CalendarMeetingVM): number {
  return parseCalendarMs(m.start) ?? 0;
}

export default function MeetingsPage() {
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const { meetings, failures, loading, noProjects, projectsError } =
    useProjectMeetings();

  // Tag each shared event with whether it is still upcoming (the table splits
  // on it). The provider already deduped by id and dropped cancelled events.
  const vms = useMemo<CalendarMeetingVM[]>(() => {
    const now = Date.now();
    return meetings.map((m) => ({ ...m, upcoming: (parseCalendarMs(m.start) ?? 0) >= now }));
  }, [meetings]);

  // Surface every per-project failure (incl. 409 "reconnect the agent account")
  // as its own alert, exactly as before; a failed project listing collapses to
  // a single notice.
  const problems = useMemo(
    () =>
      projectsError
        ? ["Could not load projects"]
        : failures.map((f) => `${f.projectName}: ${f.message}`),
    [projectsError, failures],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const subset = vms.filter((m) => {
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
  }, [vms, filter, query]);

  const counts = useMemo(() => {
    const upcoming = vms.filter((m) => m.upcoming).length;
    return {
      all: vms.length,
      upcoming,
      past: vms.length - upcoming,
    };
  }, [vms]);

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

      {problems.map((p) => (
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
        {loading ? (
          <div className="empty">
            <div className="empty-title">Loading calendar…</div>
            <div className="empty-sub">Fetching events from Google Calendar.</div>
          </div>
        ) : noProjects ? (
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
