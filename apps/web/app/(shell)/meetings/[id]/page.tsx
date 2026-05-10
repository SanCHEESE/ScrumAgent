"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ActionsTab } from "@/components/screens/meetings/ActionsTab";
import { DecisionsTab } from "@/components/screens/meetings/DecisionsTab";
import { MeetingTabs } from "@/components/screens/meetings/MeetingTabs";
import type {
  MeetingTab,
  MeetingTabKey,
} from "@/components/screens/meetings/MeetingTabs";
import { OutputsTab } from "@/components/screens/meetings/OutputsTab";
import { SummaryTab } from "@/components/screens/meetings/SummaryTab";
import { TranscriptTab } from "@/components/screens/meetings/TranscriptTab";
import { AvatarStack } from "@/components/ui/AvatarStack";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { StatusPill } from "@/components/ui/StatusPill";
import { MEETINGS, PARTICIPANTS } from "@/lib/mock-data";

interface PageProps {
  params: { id: string };
}

export default function MeetingDetailPage({ params }: PageProps) {
  const meeting = useMemo(
    () => MEETINGS.find((m) => m.id === params.id) ?? null,
    [params.id],
  );

  const [tab, setTab] = useState<MeetingTabKey>("summary");

  if (!meeting) {
    return (
      <div className="page">
        <Link href="/meetings" className="back-link">
          <Icon name="chevron_right" size={14} stroke={2} />
          <span>Back to Meetings</span>
        </Link>
        <div className="empty">
          <div className="empty-title">Meeting not found</div>
          <div className="empty-sub">
            The meeting <span className="mono">{params.id}</span> doesn&apos;t exist
            or has been archived.
          </div>
          <Link href="/meetings" className="btn btn-secondary btn-sm">
            View all meetings
          </Link>
        </div>
      </div>
    );
  }

  const m = meeting;
  const participantNames = m.participants
    .map((pid) => PARTICIPANTS[pid]?.name ?? pid)
    .join(", ");

  // Non-done meetings get a single processing card.
  if (m.status !== "done") {
    const phase =
      m.status === "analyzing"
        ? "analyzing"
        : m.status === "transcribing"
          ? "transcribing"
          : "processing";
    return (
      <div className="page meeting-detail-screen">
        <Link href="/meetings" className="back-link">
          <Icon name="chevron_right" size={14} stroke={2} />
          <span>Back to Meetings</span>
        </Link>
        <div className="page-header">
          <div>
            <h1 className="page-title">{m.title}</h1>
            <div className="page-subtitle mono">
              {m.date} · {m.time} · {m.duration}
            </div>
          </div>
          <StatusPill status={m.status} />
        </div>
        <div className="card meeting-empty">
          <div className="empty-title">
            ScrumAgent is {phase} this meeting
          </div>
          <div className="empty-sub">
            {m.status === "error"
              ? "Something went wrong. Try re-running the analysis from the trace screen."
              : "Typically takes 1–3 minutes. You can leave this page and come back."}
          </div>
          {m.status !== "error" && (
            <div className="progress-bar">
              <div className="progress-bar-fill" style={{ width: "45%" }} />
            </div>
          )}
        </div>
      </div>
    );
  }

  const tabs: MeetingTab[] = [
    { key: "summary", label: "Summary" },
    { key: "transcript", label: "Transcript", count: m.transcript.length },
    { key: "actions", label: "Action items", count: m.actionItems.length },
    { key: "decisions", label: "Decisions", count: m.decisions.length },
    {
      key: "outputs",
      label: "Outputs",
      count: m.jiraIssues.length + m.notionPages.length,
    },
  ];

  return (
    <div className="page meeting-detail-screen">
      <Link href="/meetings" className="back-link">
        <Icon name="chevron_right" size={14} stroke={2} />
        <span>Back to Meetings</span>
      </Link>
      <div className="page-header">
        <div>
          <h1 className="page-title">{m.title}</h1>
          <div className="page-subtitle mono">
            {m.date} · {m.time} · {m.duration} · project: platform
          </div>
        </div>
        <div className="hstack">
          <span title={participantNames}>
            <AvatarStack ids={m.participants} max={6} />
          </span>
          <Button variant="secondary" size="sm">
            <Icon name="chat" size={14} /> Ask about this
          </Button>
          <Button variant="ghost" iconOnly aria-label="More actions">
            <Icon name="more" size={16} />
          </Button>
          <StatusPill status={m.status} />
        </div>
      </div>

      <MeetingTabs tabs={tabs} active={tab} onChange={setTab} />

      {tab === "summary" && <SummaryTab meeting={m} />}
      {tab === "transcript" && <TranscriptTab meeting={m} />}
      {tab === "actions" && <ActionsTab meeting={m} />}
      {tab === "decisions" && <DecisionsTab meeting={m} />}
      {tab === "outputs" && <OutputsTab meeting={m} />}
    </div>
  );
}
