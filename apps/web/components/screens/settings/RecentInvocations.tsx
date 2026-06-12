import type { JSX } from "react";
import type { BillingInvocation } from "@/lib/api";
import { fmtUSD, relativeTime } from "./billing-format";

export function RecentInvocations({
  recent,
}: {
  recent: BillingInvocation[];
}): JSX.Element {
  return (
    <div className="billing-section">
      <div className="billing-section-header">
        <div>
          <div className="billing-section-title">Recent agent invocations</div>
          <div className="muted" style={{ fontSize: 12 }}>
            Cost attributed per agent run.
          </div>
        </div>
      </div>
      {recent.length === 0 ? (
        <div className="muted" style={{ fontSize: 13 }}>
          No agent invocations recorded this cycle yet.
        </div>
      ) : (
        <div className="billing-invocations">
          {recent.map((r) => (
            <div key={r.run_id} className="billing-invocation">
              <div>
                <div
                  className="mono"
                  style={{ fontSize: 11, color: "var(--brand-500)" }}
                >
                  {r.run_id.slice(0, 12)}
                </div>
                <div style={{ fontWeight: 500, marginTop: 2 }}>
                  {r.context ?? "Agent run"}
                </div>
                <div className="muted" style={{ fontSize: 11, marginTop: 2 }}>
                  {relativeTime(r.at)}
                </div>
              </div>
              <div className="billing-invocation-models">
                {r.models.map((m, i) => (
                  <div
                    key={`${m.model}-${i}`}
                    className="billing-invocation-model mono"
                  >
                    <span className="muted">{m.model}</span>
                    <span>{fmtUSD(m.cost_usd)}</span>
                  </div>
                ))}
              </div>
              <div className="billing-invocation-total mono">
                {fmtUSD(r.total_usd)}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
