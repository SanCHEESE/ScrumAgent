import type { JSX } from "react";
import { Card, CardBody } from "@/components/ui/Card";
import type { DecisionConfidence, Meeting } from "@/lib/types";

export interface DecisionsTabProps {
  meeting: Meeting;
}

function confidenceClass(c: DecisionConfidence): string {
  switch (c) {
    case "High":
      return "confidence-high";
    case "Medium":
      return "confidence-medium";
    case "Low":
      return "confidence-low";
  }
}

export function DecisionsTab({ meeting }: DecisionsTabProps): JSX.Element {
  const m = meeting;
  if (m.decisions.length === 0) {
    return (
      <Card>
        <CardBody>
          <div className="empty">
            <div className="empty-title">No decisions captured</div>
            <div className="empty-sub">
              {m.status === "done"
                ? "ScrumAgent didn't find any explicit decisions in this meeting."
                : "Decisions will appear once the meeting is fully analyzed."}
            </div>
          </div>
        </CardBody>
      </Card>
    );
  }
  return (
    <div className="vstack">
      {m.decisions.map((d, i) => (
        <div key={`d-${i}`} className="card decision-card">
          <div className="decision-index mono">
            D{String(i + 1).padStart(2, "0")}
          </div>
          <div style={{ flex: 1 }}>
            <div className="decision-text">{d.text}</div>
            <div
              className="muted mono"
              style={{ marginTop: 6, fontSize: 11 }}
            >
              confidence: {d.confidence}
            </div>
          </div>
          <span className={`confidence ${confidenceClass(d.confidence)}`}>
            {d.confidence}
          </span>
        </div>
      ))}
    </div>
  );
}
