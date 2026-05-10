"use client";

import { useState } from "react";
import type { JSX } from "react";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { TRACE_RUNS } from "@/lib/mock-data";
import { TraceRunDetail } from "./TraceRunDetail";
import { TraceRunRow } from "./TraceRunRow";

const DATE_RANGES: ReadonlyArray<{ value: string; label: string }> = [
  { value: "24h", label: "Last 24 hours" },
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
  { value: "all", label: "All time" },
];

/**
 * Agent trace observability screen. Left = recent runs, right = selected
 * run with a vertical timeline of steps and their tool calls.
 *
 * Selection state is local — the brief calls for client behaviour only.
 */
export function TraceScreen(): JSX.Element {
  const initialId = TRACE_RUNS[0]?.id ?? "";
  const [selectedId, setSelectedId] = useState<string>(initialId);
  const [dateRange, setDateRange] = useState<string>("7d");

  const selected = TRACE_RUNS.find((r) => r.id === selectedId) ?? TRACE_RUNS[0];

  return (
    <div className="page wide">
      <div className="page-header">
        <div>
          <h1 className="page-title">
            Agent <em>trace</em>
          </h1>
          <div className="page-subtitle">
            Multi-agent observability — every run, step, tool call.
          </div>
        </div>
        <div className="hstack" style={{ gap: 8 }}>
          <Button variant="secondary" size="sm">
            <Icon name="search" size={14} />
            Filter
          </Button>
          <select
            className="select"
            style={{ width: "auto", padding: "6px 28px 6px 10px", fontSize: 12 }}
            value={dateRange}
            onChange={(e) => setDateRange(e.target.value)}
            aria-label="Date range"
          >
            {DATE_RANGES.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="trace-screen">
        <aside className="trace-list" aria-label="Recent runs">
          <div className="trace-list-header">
            <span>Recent runs</span>
            <span className="mono muted">{TRACE_RUNS.length}</span>
          </div>
          <div className="trace-list-scroll">
            {TRACE_RUNS.map((run) => (
              <TraceRunRow
                key={run.id}
                run={run}
                active={run.id === selectedId}
                onSelect={setSelectedId}
              />
            ))}
          </div>
        </aside>

        {selected ? (
          <TraceRunDetail run={selected} />
        ) : (
          <section className="trace-detail">
            <div className="trace-detail-empty">
              <Icon name="trace" size={32} />
              <p>Select a run to view details.</p>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
