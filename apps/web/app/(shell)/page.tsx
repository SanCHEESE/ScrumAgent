"use client";

import { useEffect, useState } from "react";
import type { JSX } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/ui/Icon";
import { useActiveProject } from "@/components/shell/ActiveProjectProvider";
import { UPDATES } from "@/lib/mock-data";
import { ActivityFeed } from "@/components/screens/home/ActivityFeed";
import { AskAgentCard } from "@/components/screens/home/AskAgentCard";
import { HomeMeetingsStat } from "@/components/screens/home/HomeMeetingsStat";
import { RecentMeetingsLive } from "@/components/screens/home/RecentMeetingsLive";
import { StatCard } from "@/components/screens/home/StatCard";
import { UpdateRowCompact } from "@/components/screens/home/UpdateRowCompact";
import { api } from "@/lib/api";
import {
  decodeTokenEmail,
  getToken,
  isAgentPreviewEnvironment,
} from "@/lib/auth";

type LayoutVariant = "split" | "focused" | "classic";

const LAYOUT_KEY = "tweaks.layoutVariant";
const VARIANTS: readonly LayoutVariant[] = ["split", "focused", "classic"] as const;

function isLayoutVariant(value: string | null): value is LayoutVariant {
  return value !== null && (VARIANTS as readonly string[]).includes(value);
}

function readLayoutVariant(): LayoutVariant {
  if (typeof window === "undefined") return "split";
  const raw = window.localStorage.getItem(LAYOUT_KEY);
  return isLayoutVariant(raw) ? raw : "split";
}

function greetingForHour(hour: number): string {
  if (hour >= 5 && hour < 12) return "Good morning";
  if (hour >= 12 && hour < 17) return "Good afternoon";
  return "Good evening";
}

function displayNameFromEmail(email: string | null): string | null {
  if (!email) return null;
  const localPart = email.split("@")[0]?.trim();
  return localPart || email;
}

function displayNameFromUser(name: string | null, email: string): string {
  return name?.trim() || displayNameFromEmail(email) || "there";
}

/**
 * Home dashboard. Renders one of three layout variants ("split" / "focused" /
 * "classic") based on the value persisted by the tweaks panel under
 * `localStorage["tweaks.layoutVariant"]`. Subscribes to the cross-tab `storage`
 * event so changes from the tweaks panel propagate without a reload.
 */
export default function HomePage(): JSX.Element {
  const router = useRouter();
  const { activeProject, status: projectStatus } = useActiveProject();
  const [layoutVariant, setLayoutVariant] = useState<LayoutVariant>("split");
  const [userName, setUserName] = useState<string | null>(null);
  // `null` on the server and the first client render so the greeting is
  // hydration-safe; the real browser time is filled in after mount. Computing
  // `greetingForHour(new Date().getHours())` during render would let the server
  // clock (often UTC) and the browser clock fall in different greeting buckets,
  // causing a hydration text mismatch and a visible greeting flip.
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
  }, []);

  useEffect(() => {
    setLayoutVariant(readLayoutVariant());
    const onStorage = (e: StorageEvent): void => {
      if (e.key === null || e.key === LAYOUT_KEY) {
        setLayoutVariant(readLayoutVariant());
      }
    };
    const onTweaksChanged = (): void => setLayoutVariant(readLayoutVariant());
    window.addEventListener("storage", onStorage);
    window.addEventListener("tweaks-changed", onTweaksChanged);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("tweaks-changed", onTweaksChanged);
    };
  }, []);

  useEffect(() => {
    const token = getToken();
    const previewMode = isAgentPreviewEnvironment();
    const tokenEmail = token ? decodeTokenEmail(token) : null;

    setUserName(displayNameFromEmail(tokenEmail));
    if (!token && !previewMode) return undefined;

    let active = true;
    api
      .me()
      .then((me) => {
        if (active) setUserName(displayNameFromUser(me.name, me.email));
      })
      .catch(() => {
        // 401 redirects are handled by the API client; keep the token fallback
        // for transient backend failures.
      });
    return () => {
      active = false;
    };
  }, []);

  const pendingUpdates = UPDATES.filter((u) => u.status === "pending");
  // Before mount `now` is null on both the server and the first client render,
  // so we show a stable, mismatch-free fallback (the user name if known, else a
  // neutral word). After mount it resolves to `${greeting}, ${userName}`.
  const greeting = now ? greetingForHour(now.getHours()) : null;
  const pageTitle = greeting
    ? userName
      ? `${greeting}, ${userName}`
      : greeting
    : userName ?? "Welcome";

  // Subtitle distinguishes the projects load lifecycle so a backend failure no
  // longer looks identical to a genuinely empty account. `loading` is neutral,
  // `error` is a clear "couldn't load" affordance, and `ready` keeps the
  // existing project-name copy (the NO_PROJECT empty case is acceptable as-is).
  const projectSubtitle =
    projectStatus === "loading" ? (
      <>ScrumAgent has been busy. Loading your projects&hellip;</>
    ) : projectStatus === "error" ? (
      <>
        ScrumAgent has been busy, but we couldn&rsquo;t load your projects.{" "}
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={() => router.refresh()}
        >
          Try again
        </button>
      </>
    ) : (
      <>
        ScrumAgent has been busy. Here&rsquo;s what&rsquo;s new with{" "}
        <strong>{activeProject.name}</strong>.
      </>
    );

  const headerActions = (
    <div className="hstack">
      <button
        type="button"
        className="btn btn-secondary"
        onClick={() => router.push("/trace")}
      >
        <Icon name="trace" size={16} /> Agent trace
      </button>
      <button
        type="button"
        className="btn btn-primary"
        onClick={() => router.push("/chat")}
      >
        <Icon name="chat" size={16} /> Ask agent
      </button>
    </div>
  );

  if (layoutVariant === "focused") {
    return (
      <div className="page">
        <div className="page-header">
          <div>
            <h1 className="page-title">{pageTitle}</h1>
            <div className="page-subtitle">
              ScrumAgent analyzed 2 meetings while you were away
            </div>
          </div>
          {headerActions}
        </div>

        <div className="focused-hero">
          <div className="focused-hero-label">Pending your review</div>
          <div className="focused-hero-number">{pendingUpdates.length}</div>
          <div className="focused-hero-text">
            proposed updates across Jira and Notion, waiting for a human to approve.
          </div>
          <div className="hstack" style={{ marginTop: 24 }}>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => router.push("/updates")}
            >
              Review updates <Icon name="arrow_right" size={14} />
            </button>
            <span className="mono muted">last run · 2m ago</span>
          </div>
        </div>

        <div className="card-grid-2" style={{ marginTop: 32 }}>
          <div className="card">
            <div className="card-header">
              <h3 className="card-title">Recent meetings</h3>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => router.push("/meetings")}
              >
                View all
              </button>
            </div>
            <RecentMeetingsLive />
          </div>
          <div className="card">
            <div className="card-header">
              <h3 className="card-title">Ask agent anything</h3>
            </div>
            <div className="card-body">
              <AskAgentCard />
            </div>
          </div>
        </div>
      </div>
    );
  }

  // split / classic share the same content; only the grid container differs.
  const gridClass = layoutVariant === "classic" ? "card-grid-2" : "home-split-grid";

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">{pageTitle}</h1>
          <div className="page-subtitle">{projectSubtitle}</div>
        </div>
        {headerActions}
      </div>

      <div className="stat-row">
        <HomeMeetingsStat />
        <StatCard label="Jira tickets updated" value="28" trend="+6" />
        <StatCard label="Notion pages touched" value="7" trend="+2" />
        <StatCard
          label="Pending your review"
          value={pendingUpdates.length}
          highlight
        />
      </div>

      <div className={gridClass} style={{ marginTop: 24 }}>
        <div>
          <div className="card">
            <div className="card-header">
              <h3 className="card-title">Recent meetings</h3>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => router.push("/meetings")}
              >
                View all →
              </button>
            </div>
            <RecentMeetingsLive />
          </div>

          <div className="card" style={{ marginTop: 20 }}>
            <div className="card-header">
              <h3 className="card-title">Pending updates</h3>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => router.push("/updates")}
              >
                Review {pendingUpdates.length} →
              </button>
            </div>
            <div>
              {pendingUpdates.map((u) => (
                <UpdateRowCompact
                  key={u.id}
                  update={u}
                  onClick={() => router.push("/updates")}
                />
              ))}
            </div>
          </div>
        </div>

        <div>
          <div className="card ask-card">
            <div className="ask-card-eyebrow">LLM Orchestrator</div>
            <div className="ask-card-title">Talk to your team&rsquo;s memory.</div>
            <div className="ask-card-sub">
              Ask anything about past meetings, decisions, tickets, and docs.
              The agent knows.
            </div>
            <AskAgentCard />
            <div className="ask-card-chips">
              <div className="ask-chip">
                What did we decide about the auth refactor?
              </div>
              <div className="ask-chip">Who&rsquo;s blocked right now?</div>
              <div className="ask-chip">Summarize yesterday&rsquo;s standup</div>
            </div>
          </div>

          <div className="card" style={{ marginTop: 20 }}>
            <div className="card-header">
              <h3 className="card-title">Agent activity</h3>
            </div>
            <div className="card-body" style={{ padding: 0 }}>
              <ActivityFeed />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
