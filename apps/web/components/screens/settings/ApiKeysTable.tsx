"use client";

import type { JSX } from "react";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { BILLING_MOCK, fmtUSD, type ApiKey } from "./billing-mock";

interface KeyRowProps {
  k: ApiKey;
  revealed: boolean;
  onReveal: () => void;
}

function KeyRow({ k, revealed, onReveal }: KeyRowProps): JSX.Element {
  const pct = Math.min(100, (k.used / k.cap) * 100);
  const warn = pct > 75 && k.status === "active";
  const providerIcon = k.provider === "Anthropic" ? "sparkles" : "google";

  return (
    <div className={`billing-key ${k.status === "inactive" ? "is-inactive" : ""}`.trim()}>
      <div className="billing-key-left">
        <div className="billing-key-provider">
          <Icon name={providerIcon} size={13} />
          <span
            className="mono"
            style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.08em" }}
          >
            {k.provider}
          </span>
          {k.status === "active" ? (
            <span className="badge-ok">active</span>
          ) : (
            <span className="badge badge-neutral" style={{ fontSize: 10 }}>
              standby
            </span>
          )}
        </div>
        <div className="billing-key-label">{k.label}</div>
        <div className="billing-key-mask mono">
          <span>{revealed ? k.mask.replace(/•+/g, "live-secret-redacted") : k.mask}</span>
          <button type="button" className="link-btn" onClick={onReveal}>
            {revealed ? "Hide" : "Reveal"}
          </button>
          <button type="button" className="link-btn">
            <Icon name="copy" size={10} />
            Copy
          </button>
        </div>
        <div className="muted" style={{ fontSize: 11 }}>
          Scope: {k.scope} · rotated {k.rotated}
        </div>
      </div>
      <div className="billing-key-right">
        <div className="billing-key-used mono">
          <span className={warn ? "warn" : ""}>{fmtUSD(k.used)}</span>
          <span className="muted"> / {fmtUSD(k.cap)}</span>
        </div>
        <div className="billing-key-bar">
          <div
            className={`billing-key-bar-fill ${warn ? "warn" : ""}`.trim()}
            style={{ width: `${pct}%` }}
          />
        </div>
        <div
          className="hstack"
          style={{ justifyContent: "flex-end", gap: 4, marginTop: 6 }}
        >
          <Button variant="ghost" size="sm">
            Edit cap
          </Button>
          <Button variant="ghost" size="sm" iconOnly aria-label="More">
            <Icon name="more" size={14} />
          </Button>
        </div>
      </div>
    </div>
  );
}

export function ApiKeysTable(): JSX.Element {
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});

  const toggle = (id: string): void => {
    setRevealed((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  return (
    <div className="billing-section">
      <div className="billing-section-header">
        <div>
          <div className="billing-section-title">API keys</div>
          <div className="muted" style={{ fontSize: 12 }}>
            The agent uses your own provider keys. Spending caps are enforced locally.
          </div>
        </div>
        <Button variant="primary" size="sm">
          <Icon name="plus" size={14} />
          Add key
        </Button>
      </div>
      <div className="billing-keys">
        {BILLING_MOCK.apiKeys.map((k) => (
          <KeyRow
            key={k.id}
            k={k}
            revealed={revealed[k.id] ?? false}
            onReveal={() => toggle(k.id)}
          />
        ))}
      </div>
    </div>
  );
}
