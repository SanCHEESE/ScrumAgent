"use client";

import type { ChangeEvent, JSX } from "react";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Icon, type IconName } from "@/components/ui/Icon";

interface KbSource {
  key: string;
  name: string;
  count: string;
  sub: string;
  icon: IconName;
}

interface KbSearchHit {
  title: string;
  source: string;
  snippet: string;
  score: number;
}

const SOURCES: KbSource[] = [
  { key: "meetings", name: "Meeting transcripts", count: "42", sub: "last 90 days", icon: "mic" },
  { key: "jira", name: "Jira issues", count: "1,247", sub: "across 5 projects", icon: "jira" },
  { key: "notion", name: "Notion pages", count: "218", sub: "across 2 workspaces", icon: "notion" },
];

const SEARCH_RESULTS: KbSearchHit[] = [
  {
    title: "PLAT-234 · Fix auth token expiry handling",
    source: "Jira · municorn.atlassian.net",
    snippet:
      "Bob deployed the fix to staging, opens the PR today. Auth refresh now uses the rotation table.",
    score: 0.92,
  },
  {
    title: "Sprint 42 Notes — Auth subsystem",
    source: "Notion · Municorn HQ",
    snippet:
      "Decision: keep auth as a monolith through Q2. Revisit microservice split in Q3 planning.",
    score: 0.87,
  },
  {
    title: "Daily Standup — 2026-03-26 (transcript)",
    source: "Meeting · m1",
    snippet: "Bob: PLAT-234 is deployed to staging and looking good. Today I'm writing unit tests.",
    score: 0.81,
  },
];

export function KnowledgeBaseSection(): JSX.Element {
  const [query, setQuery] = useState("");

  const onChange = (e: ChangeEvent<HTMLInputElement>) => setQuery(e.target.value);

  const filtered = query.trim()
    ? SEARCH_RESULTS.filter(
        (r) =>
          r.title.toLowerCase().includes(query.toLowerCase()) ||
          r.snippet.toLowerCase().includes(query.toLowerCase()),
      )
    : SEARCH_RESULTS;

  return (
    <div className="vstack" style={{ gap: 0 }}>
      <div className="setting-group">
        <h2 className="setting-group-title">Indexed sources</h2>
        <p className="setting-group-sub">
          The agent reads from these to answer questions in chat.
        </p>
        <div className="kb-sources">
          {SOURCES.map((s) => (
            <div key={s.key} className="kb-source-card">
              <div className="kb-source-icon">
                <Icon name={s.icon} size={16} />
              </div>
              <div className="kb-source-name">{s.name}</div>
              <div className="kb-source-count">{s.count}</div>
              <div className="kb-source-sub">{s.sub}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="setting-group">
        <h2 className="setting-group-title">Index health</h2>
        <p className="setting-group-sub">
          Last reindex: <span className="mono">2026-03-26 04:15 UTC</span> (auto, every 6h).
        </p>
        <div className="kb-health">
          <div className="kb-health-card">
            <div className="kb-health-label">Vectors</div>
            <div className="kb-health-value">38,294</div>
          </div>
          <div className="kb-health-card">
            <div className="kb-health-label">Index size</div>
            <div className="kb-health-value">412 MB</div>
          </div>
          <div className="kb-health-card">
            <div className="kb-health-label">Avg recall (P95)</div>
            <div className="kb-health-value">94%</div>
          </div>
          <div className="kb-health-card">
            <div className="kb-health-label">Avg query latency</div>
            <div className="kb-health-value">128 ms</div>
          </div>
        </div>
        <div className="hstack" style={{ marginTop: 14, gap: 10 }}>
          <Button variant="primary" size="sm">
            <Icon name="play" size={14} />
            Reindex now
          </Button>
          <Button variant="ghost" size="sm">
            View reindex history
          </Button>
        </div>
      </div>

      <div className="setting-group">
        <h2 className="setting-group-title">Search index test</h2>
        <p className="setting-group-sub">
          Run a query against the live index to inspect retrieval quality.
        </p>
        <div className="input-search" style={{ maxWidth: 520 }}>
          <Icon name="search" size={14} />
          <input
            type="search"
            className="input-bare"
            placeholder="Try: 'auth token fix' or 'sprint 42 decisions'"
            value={query}
            onChange={onChange}
          />
        </div>
        <div className="kb-search-results">
          {filtered.length === 0 ? (
            <div className="muted" style={{ fontSize: 12 }}>
              No matches. Try a broader query.
            </div>
          ) : (
            filtered.map((r) => (
              <div key={r.title} className="kb-search-result">
                <div className="kb-search-result-title">{r.title}</div>
                <div className="kb-search-result-snippet">{r.snippet}</div>
                <div className="kb-search-result-meta">
                  <span>{r.source}</span>
                  <span>·</span>
                  <span>score {r.score.toFixed(2)}</span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
