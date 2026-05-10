"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

const LIVE_TICKS: readonly string[] = [
  '✶ meeting_participation → joined "Sprint Planning" at 14:35',
  "✶ meeting_participation → transcribing speaker 2 / 4",
  "✶ jira_notion → proposed 3 Jira updates for review",
  "✶ orchestrator → answered Bob about blocked tickets (4.2s)",
  '✶ jira_notion → pushed Notion update to "Sprint 42 Notes"',
];

const TICK_INTERVAL_MS = 3500;

/**
 * Animated activity ticker. Rotates through {@link LIVE_TICKS} every 3.5s.
 * Clicking the trace link routes to /trace.
 */
export function LiveBar() {
  const router = useRouter();
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    const t = setInterval(
      () => setIdx((i) => (i + 1) % LIVE_TICKS.length),
      TICK_INTERVAL_MS,
    );
    return () => clearInterval(t);
  }, []);

  return (
    <div className="live-bar">
      <div className="live-dot" aria-hidden />
      <span className="live-label">live</span>
      <span className="live-msg" key={idx}>
        {LIVE_TICKS[idx]}
      </span>
      <span
        className="live-trace"
        role="button"
        tabIndex={0}
        onClick={() => router.push("/trace")}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            router.push("/trace");
          }
        }}
      >
        view full trace →
      </span>
    </div>
  );
}
