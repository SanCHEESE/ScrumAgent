import type { JSX } from "react";
import { Button } from "@/components/ui/Button";
import { BILLING_MOCK, fmtUSD } from "./billing-mock";

export function RecentInvocations(): JSX.Element {
  return (
    <div className="billing-section">
      <div className="billing-section-header">
        <div>
          <div className="billing-section-title">Recent agent invocations</div>
          <div className="muted" style={{ fontSize: 12 }}>
            Cost attributed per meeting run. Click to open the full trace.
          </div>
        </div>
        <Button variant="ghost" size="sm">
          View all
        </Button>
      </div>
      <div className="billing-invocations">
        {BILLING_MOCK.recent.map((r) => (
          <div key={r.id} className="billing-invocation">
            <div>
              <div className="mono" style={{ fontSize: 11, color: "var(--brand-500)" }}>
                {r.id}
              </div>
              <div style={{ fontWeight: 500, marginTop: 2 }}>{r.meeting}</div>
              <div className="muted" style={{ fontSize: 11, marginTop: 2 }}>
                {r.when}
              </div>
            </div>
            <div className="billing-invocation-models">
              {r.models.map((m) => (
                <div key={m.name} className="billing-invocation-model mono">
                  <span className="muted">{m.name}</span>
                  <span>{fmtUSD(m.cost)}</span>
                </div>
              ))}
            </div>
            <div className="billing-invocation-total mono">{fmtUSD(r.total)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
