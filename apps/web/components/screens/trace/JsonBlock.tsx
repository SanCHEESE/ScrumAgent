"use client";

import { useMemo, useState } from "react";
import type { JSX } from "react";

export interface JsonBlockProps {
  /**
   * Stringified JSON (or any string). If JSON.parse succeeds, the value is
   * pretty-printed with 2-space indent; otherwise the raw text is shown.
   */
  raw: string;
  /** Visual treatment — only affects the wrapping class. */
  variant?: "input" | "output";
  /** Threshold (chars) above which the block is collapsible. */
  collapseAt?: number;
}

/**
 * Pretty-prints a JSON-as-string value into a `<pre>` block. Long blocks
 * (> `collapseAt` chars) get a one-line preview and an expand toggle.
 *
 * Parsing is defensive — any non-JSON string falls through to raw render,
 * and the parsed value is treated as `unknown` since we cannot trust the
 * shape of mock data at the type level.
 */
export function JsonBlock({
  raw,
  variant = "input",
  collapseAt = 200,
}: JsonBlockProps): JSX.Element {
  const pretty = useMemo<string>(() => {
    try {
      const parsed: unknown = JSON.parse(raw);
      return JSON.stringify(parsed, null, 2);
    } catch {
      return raw;
    }
  }, [raw]);

  const className = variant === "output" ? "trace-output" : "trace-input";
  const collapsible = pretty.length > collapseAt;
  const [expanded, setExpanded] = useState<boolean>(false);

  if (!collapsible) {
    return <pre className={`mono ${className}`}>{pretty}</pre>;
  }

  if (!expanded) {
    const preview = pretty.replace(/\s+/g, " ").trim().slice(0, collapseAt);
    return (
      <>
        <pre className={`mono ${className}`}>{preview}…</pre>
        <button
          type="button"
          className="trace-json-toggle"
          onClick={() => setExpanded(true)}
        >
          Expand ({pretty.length} chars)
        </button>
      </>
    );
  }

  return (
    <>
      <pre className={`mono ${className}`}>{pretty}</pre>
      <button
        type="button"
        className="trace-json-toggle"
        onClick={() => setExpanded(false)}
      >
        Collapse
      </button>
    </>
  );
}
