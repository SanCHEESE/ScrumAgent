// Formatting helpers + display metadata for Settings → Billing.
// Data comes live from GET /projects/{id}/billing (see lib/api.ts).

import type { UsageKind } from "@/lib/api";

/** Format a USD amount with two decimals. */
export function fmtUSD(n: number): string {
  return (
    "$" +
    n.toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
  );
}

/** Display label + bar colour for spend categories the gateway emits. */
const CATEGORY_META: Record<string, { label: string; color: string }> = {
  orchestrator: { label: "Orchestrator LLM", color: "#0077e6" },
  subagents: { label: "Subagents LLM", color: "#5aa7ff" },
  whisper: { label: "Whisper STT", color: "#f59e0b" },
  embeddings: { label: "Embeddings", color: "#10b981" },
  storage: { label: "Storage & retrieval", color: "#8b5cf6" },
};

export function categoryMeta(category: string): { label: string; color: string } {
  return (
    CATEGORY_META[category] ?? {
      label: category.charAt(0).toUpperCase() + category.slice(1),
      color: "#94a3b8",
    }
  );
}

export function kindLabel(kind: UsageKind): string {
  if (kind === "stt") return "STT";
  if (kind === "embed") return "Embed";
  return "LLM";
}

/** "Jun 2026" from an ISO date. */
export function cycleLabel(isoDate: string): string {
  return new Date(`${isoDate}T00:00:00Z`).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** "Jun 1 – Jun 12" from two ISO dates. */
export function cycleRange(startIso: string, endIso: string): string {
  const fmt = (iso: string) =>
    new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      timeZone: "UTC",
    });
  return `${fmt(startIso)} – ${fmt(endIso)}`;
}

/** Compact relative time: "just now", "12 min ago", "3h ago", "2 days ago". */
export function relativeTime(iso: string, now: Date = new Date()): string {
  const then = new Date(iso).getTime();
  const minutes = Math.max(0, Math.floor((now.getTime() - then) / 60_000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return days === 1 ? "Yesterday" : `${days} days ago`;
}
