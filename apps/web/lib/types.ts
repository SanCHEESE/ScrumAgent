// ============ Domain types ============
// Shape mirrors the prototype mock data in
// .worktrees/_design-bundle/project/kabanchik-data.jsx.

export type ProjectStatus = "active" | "error" | "never_synced";

export interface Project {
  id: string;
  name: string;
  email: string;
  /** Human-readable last sync timestamp, or null if never synced. */
  lastSync: string | null;
  status: ProjectStatus;
  description: string;
  meetings: number;
  pending: number;
}

export interface Participant {
  name: string;
  initials: string;
  /** CSS color for the avatar circle. */
  color: string;
}

export type ParticipantId = string;

export type MeetingStatus =
  | "done"
  | "analyzing"
  | "transcribing"
  | "error";

export interface JiraIssue {
  key: string;
  title: string;
  status: string;
}

export interface NotionPage {
  title: string;
}

export interface TranscriptUtterance {
  speaker: string;
  /** Mm:ss style time offset from the start of the meeting. */
  time: string;
  text: string;
}

export type ActionItemStatus = "done" | "pending";

export interface ActionItem {
  id: string;
  /** Participant key, e.g. "alice". */
  owner: ParticipantId;
  text: string;
  /** ISO date (YYYY-MM-DD). */
  due: string;
  status: ActionItemStatus;
  jiraKey: string | null;
}

export type DecisionConfidence = "High" | "Medium" | "Low";

export interface Decision {
  text: string;
  confidence: DecisionConfidence;
}

export interface Meeting {
  id: string;
  title: string;
  /** ISO date. */
  date: string;
  /** 24h time, e.g. "10:00". */
  time: string;
  duration: string;
  participants: ParticipantId[];
  status: MeetingStatus;
  summary: string;
  jiraIssues: JiraIssue[];
  notionPages: NotionPage[];
  transcript: TranscriptUtterance[];
  actionItems: ActionItem[];
  decisions: Decision[];
}

export type UpdateTarget = "jira" | "notion";
export type UpdateStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "applied";

export interface Update {
  id: string;
  target: UpdateTarget;
  /** Issue key, page title, etc. */
  objectName: string;
  updateType: string;
  before: string;
  after: string;
  reasoning: string;
  confidence: DecisionConfidence;
  status: UpdateStatus;
  meetingId: string;
  meetingTitle: string;
}

export type TraceRunStatus = "done" | "analyzing" | "error";

export interface TraceToolCall {
  name: string;
  /** Stringified JSON. */
  args: string;
  /** Stringified JSON. */
  result: string;
}

export interface TraceStep {
  name: string;
  agent: string;
  /** Stringified JSON. */
  input: string;
  /** Stringified JSON or human-readable status. */
  output: string;
  tools: TraceToolCall[];
  duration: string;
}

export interface TraceRun {
  id: string;
  /** "YYYY-MM-DD HH:MM" local time. */
  datetime: string;
  meetingTitle: string;
  status: TraceRunStatus;
  duration: string;
  model: string;
  steps: TraceStep[];
}

// ============ Navigation ============
export interface NavItem {
  key: string;
  label: string;
  icon: string;
  href: string;
  badge?: number;
  badgeWarn?: boolean;
}
