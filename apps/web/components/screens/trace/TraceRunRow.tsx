import type { JSX } from "react";
import { StatusPill } from "@/components/ui/StatusPill";
import type { TraceRun } from "@/lib/types";

export interface TraceRunRowProps {
  run: TraceRun;
  active: boolean;
  onSelect: (id: string) => void;
}

/**
 * Single entry in the run list — clickable; sets the selected run id.
 */
export function TraceRunRow({
  run,
  active,
  onSelect,
}: TraceRunRowProps): JSX.Element {
  return (
    <button
      type="button"
      className={`trace-row${active ? " active" : ""}`}
      onClick={() => onSelect(run.id)}
      aria-pressed={active}
    >
      <span className="trace-row-title">{run.meetingTitle}</span>
      <span className="trace-row-meta">
        <span className="mono">{run.datetime}</span>
        <span className="sep" />
        <span className="mono muted">{run.model}</span>
        <span className="trace-row-meta-spacer" />
        <span className="mono">{run.duration}</span>
        <StatusPill status={run.status} />
      </span>
    </button>
  );
}
