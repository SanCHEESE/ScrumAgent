"use client";

import type { JSX } from "react";
import { useState } from "react";
import { BILLING_MOCK, fmtUSD, type ModelKind, type ModelUsage } from "./billing-mock";
import { Sparkline } from "./Sparkline";

const RANGES = ["This cycle", "Last cycle", "30 days"] as const;
type Range = (typeof RANGES)[number];

function kindBadgeClass(kind: ModelKind): string {
  if (kind === "STT") return "badge-warn";
  if (kind === "Embed") return "badge-ok";
  return "badge badge-brand";
}

function sparkColor(kind: ModelKind): string {
  if (kind === "STT") return "#f59e0b";
  if (kind === "Embed") return "#10b981";
  return "var(--brand-500)";
}

function formatUnits(m: ModelUsage, value: number): string {
  if (value === 0) return "—";
  if (m.kind === "STT") return `${value.toLocaleString()} min`;
  return `${value}M tok`;
}

export function UsageByModel(): JSX.Element {
  const [range, setRange] = useState<Range>("This cycle");

  return (
    <div className="billing-section">
      <div className="billing-section-header">
        <div>
          <div className="billing-section-title">Usage by model</div>
          <div className="muted" style={{ fontSize: 12 }}>
            LLM tokens, Whisper minutes, and embedding tokens this cycle.
          </div>
        </div>
        <div className="segmented" role="tablist">
          {RANGES.map((r) => (
            <button
              key={r}
              type="button"
              className={r === range ? "active" : ""}
              onClick={() => setRange(r)}
              role="tab"
              aria-selected={r === range}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      <table className="billing-table">
        <thead>
          <tr>
            <th>Model</th>
            <th>Type</th>
            <th>Calls</th>
            <th style={{ textAlign: "right" }}>Input</th>
            <th style={{ textAlign: "right" }}>Output</th>
            <th style={{ textAlign: "right" }}>Rate</th>
            <th style={{ textAlign: "right" }}>Trend</th>
            <th style={{ textAlign: "right" }}>Cost</th>
          </tr>
        </thead>
        <tbody>
          {BILLING_MOCK.models.map((m) => (
            <tr key={m.name}>
              <td>
                <div className="mono" style={{ fontWeight: 600 }}>
                  {m.name}
                </div>
                <div className="muted" style={{ fontSize: 11 }}>
                  {m.provider}
                </div>
              </td>
              <td>
                <span className={kindBadgeClass(m.kind)}>{m.kind}</span>
              </td>
              <td className="mono">{m.calls.toLocaleString()}</td>
              <td className="mono" style={{ textAlign: "right" }}>
                {formatUnits(m, m.inUnits)}
              </td>
              <td className="mono" style={{ textAlign: "right" }}>
                {m.outUnits > 0 ? `${m.outUnits}M tok` : <span className="muted">—</span>}
              </td>
              <td className="mono muted" style={{ textAlign: "right", fontSize: 11 }}>
                ${m.inRate.toFixed(2)}
                {m.outRate > 0 && ` / $${m.outRate.toFixed(2)}`}{" "}
                <span style={{ fontSize: 10 }}>per {m.unit}</span>
              </td>
              <td style={{ textAlign: "right" }}>
                <span style={{ display: "inline-block", lineHeight: 0 }}>
                  <Sparkline data={m.spark} color={sparkColor(m.kind)} />
                </span>
              </td>
              <td className="mono" style={{ textAlign: "right", fontWeight: 600 }}>
                {fmtUSD(m.cost)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
