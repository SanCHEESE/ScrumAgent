import type { JSX } from "react";
import type { BillingModelUsage, UsageKind } from "@/lib/api";
import { fmtUSD, kindLabel } from "./billing-format";
import { Sparkline } from "./Sparkline";

function kindBadgeClass(kind: UsageKind): string {
  if (kind === "stt") return "badge-warn";
  if (kind === "embed") return "badge-ok";
  return "badge badge-brand";
}

function sparkColor(kind: UsageKind): string {
  if (kind === "stt") return "#f59e0b";
  if (kind === "embed") return "#10b981";
  return "var(--brand-500)";
}

function formatUnits(kind: UsageKind, value: number): string {
  if (value === 0) return "—";
  if (kind === "stt") return `${value.toLocaleString()} min`;
  return `${value.toFixed(2)}M tok`;
}

export function UsageByModel({
  models,
}: {
  models: BillingModelUsage[];
}): JSX.Element {
  return (
    <div className="billing-section">
      <div className="billing-section-header">
        <div>
          <div className="billing-section-title">Usage by model</div>
          <div className="muted" style={{ fontSize: 12 }}>
            LLM tokens, Whisper minutes, and embedding tokens this cycle.
          </div>
        </div>
      </div>

      {models.length === 0 ? (
        <div className="muted" style={{ fontSize: 13 }}>
          No model calls recorded this cycle yet.
        </div>
      ) : (
        <table className="billing-table">
          <thead>
            <tr>
              <th>Model</th>
              <th>Type</th>
              <th>Calls</th>
              <th style={{ textAlign: "right" }}>Input</th>
              <th style={{ textAlign: "right" }}>Output</th>
              <th style={{ textAlign: "right" }}>Trend</th>
              <th style={{ textAlign: "right" }}>Cost</th>
            </tr>
          </thead>
          <tbody>
            {models.map((m) => (
              <tr key={m.model}>
                <td>
                  <div className="mono" style={{ fontWeight: 600 }}>
                    {m.model}
                  </div>
                  <div className="muted" style={{ fontSize: 11 }}>
                    {m.provider}
                  </div>
                </td>
                <td>
                  <span className={kindBadgeClass(m.kind)}>{kindLabel(m.kind)}</span>
                </td>
                <td className="mono">{m.calls.toLocaleString()}</td>
                <td className="mono" style={{ textAlign: "right" }}>
                  {formatUnits(m.kind, m.input_units)}
                </td>
                <td className="mono" style={{ textAlign: "right" }}>
                  {m.output_units > 0 ? (
                    `${m.output_units.toFixed(2)}M tok`
                  ) : (
                    <span className="muted">—</span>
                  )}
                </td>
                <td style={{ textAlign: "right" }}>
                  <span style={{ display: "inline-block", lineHeight: 0 }}>
                    <Sparkline data={m.daily_usd} color={sparkColor(m.kind)} />
                  </span>
                </td>
                <td className="mono" style={{ textAlign: "right", fontWeight: 600 }}>
                  {fmtUSD(m.cost_usd)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
