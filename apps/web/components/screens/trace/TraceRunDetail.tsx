import type { JSX } from "react";
import { Badge } from "@/components/ui/Badge";
import { StatusPill } from "@/components/ui/StatusPill";
import type { TraceRun } from "@/lib/types";
import { TraceStepRow } from "./TraceStepRow";

export interface TraceRunDetailProps {
  run: TraceRun;
}

/**
 * Right-hand panel: header (meeting + datetime + duration + model) followed
 * by the vertical timeline of steps. The vertical line is drawn as a
 * pseudo-element on `.trace-line` aligned through the centre of the step
 * icons (see styles/screens/trace.css).
 */
export function TraceRunDetail({ run }: TraceRunDetailProps): JSX.Element {
  const toolCount = run.steps.reduce((acc, s) => acc + s.tools.length, 0);

  return (
    <section className="trace-detail">
      <header className="trace-detail-header">
        <div className="trace-detail-header-left">
          <h2 className="trace-detail-title">{run.meetingTitle}</h2>
          <div className="trace-detail-meta">
            <span className="mono">{run.datetime}</span>
            <span className="sep" />
            <span className="mono">{run.duration}</span>
            <span className="sep" />
            <span>{run.steps.length} steps</span>
            <span className="sep" />
            <span>{toolCount} tool calls</span>
          </div>
        </div>
        <div className="hstack" style={{ gap: 8 }}>
          <Badge variant="brand">{run.model}</Badge>
          <StatusPill status={run.status} />
        </div>
      </header>

      <div className="trace-line">
        {run.steps.map((step, i) => (
          <TraceStepRow key={`${run.id}-${i}`} step={step} />
        ))}
      </div>
    </section>
  );
}
