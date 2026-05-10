// ============ Chat mock data ============
// Ported verbatim from .worktrees/_design-bundle/project/screens-chat.jsx
// (CHAT_SEED, SAMPLE_RESPONSES, SESSIONS). Until backend wiring lands the chat
// screen drives its streaming simulation off these constants.

export type MessageRole = "user" | "agent";

export type AgentActionKind = "retrieve" | "compose";

export interface AgentAction {
  kind: AgentActionKind;
  label: string;
  detail: string;
}

export type SourceType = "meeting" | "transcript" | "notion" | "file";

export interface Source {
  type: SourceType;
  name: string;
}

export interface ToolUse {
  tool: string;
  args: Record<string, string>;
}

export interface Message {
  role: MessageRole;
  text: string;
  ts: string;
  /** True once the message is fully populated (i.e. streaming finished). */
  final: boolean;
  actions?: AgentAction[];
  sources?: Source[];
  followups?: string[];
  toolUse?: ToolUse | null;
  needsConfirm?: boolean;
}

export interface SampleResponse {
  chunks: string[];
  actions?: AgentAction[];
  sources?: Source[];
  followups?: string[];
  toolUse?: ToolUse;
  needsConfirm?: boolean;
}

export interface Session {
  id: string;
  title: string;
  preview: string;
  ts: string;
  msgs: number;
  active?: boolean;
}

export const CHAT_SEED: Message[] = [
  {
    role: "agent",
    text:
      "Hey Alice! I'm your ScrumAgent. I've indexed everything from your last 42 meetings, your Jira board, and your Notion workspace. Ask me anything — I can also create or update tickets for you if you want.",
    ts: "10:24",
    final: true,
  },
];

export const SAMPLE_RESPONSES: Record<
  "blocked" | "auth" | "create",
  SampleResponse
> = {
  blocked: {
    chunks: [
      "Looking at the last few standups, ",
      "**Carol** is currently the only person blocked. ",
      "\n\nShe mentioned it this morning:\n\n",
      "> *\"I'm blocked on the Notion integration. The API key expired and I'm waiting for IT to renew it.\"*\n\n",
      "Alice committed to pinging IT in the same meeting. ",
      "I'm tracking this as an action item and will notify you when Carol is unblocked.",
    ],
    actions: [
      {
        kind: "retrieve",
        label: "Searched meeting transcripts",
        detail: "3 meetings · standup 03-26, 03-25, 03-24",
      },
      {
        kind: "retrieve",
        label: "Queried Jira",
        detail: 'No open "blocked" status tickets',
      },
    ],
    sources: [
      { type: "meeting", name: "Daily Standup · 2026-03-26" },
      { type: "transcript", name: "Carol @ 0:35" },
    ],
    followups: [
      "What is the Notion integration for?",
      "When was the API key supposed to be renewed?",
      "Create a Jira ticket for IT",
    ],
  },
  auth: {
    chunks: [
      "The team decided to **keep auth as a monolith through Q2**, ",
      "revisiting the microservice split during Q3 planning.\n\n",
      "This came out of the Architecture Review on 2026-03-19. ",
      "The key reasoning was: the current auth load is well within monolith capacity, ",
      "and the team wants to focus migration effort on the data pipeline first.\n\n",
      "Bob took the action to document the current auth flow in Notion — ",
      "that page is now live.",
    ],
    actions: [
      {
        kind: "retrieve",
        label: "Searched RAG",
        detail: "matched 4 transcripts, 2 Notion pages",
      },
      {
        kind: "retrieve",
        label: "Opened Notion",
        detail: "Architecture Decisions · auth section",
      },
    ],
    sources: [
      { type: "meeting", name: "Architecture Review · 2026-03-19" },
      { type: "notion", name: "Architecture Decisions" },
    ],
    followups: [
      "Show me the Notion page",
      "What did Bob say exactly?",
      "When is the Q3 planning meeting?",
    ],
  },
  create: {
    chunks: ["I can create that ticket for you. Here's what I'm proposing:"],
    toolUse: {
      tool: "jira.create_issue",
      args: {
        project: "PLAT",
        summary: "Renew expired Notion API key",
        description:
          "Blocking Carol on the Notion integration work. Mentioned in standup 2026-03-26.",
        assignee: "IT Ops",
        priority: "High",
      },
    },
    sources: [],
    followups: [],
    needsConfirm: true,
  },
};

export const SESSIONS: Session[] = [
  {
    id: "s1",
    title: "Who is blocked right now?",
    preview: "Carol is blocked on the Notion integration…",
    ts: "Today · 10:24",
    msgs: 4,
    active: true,
  },
  {
    id: "s2",
    title: "Auth refactor decision",
    preview: "The team decided to keep auth as monolith through Q2…",
    ts: "Yesterday · 16:40",
    msgs: 8,
  },
  {
    id: "s3",
    title: "Sprint 42 velocity check",
    preview: "Velocity is tracking at 38 points — in line with…",
    ts: "Mar 24 · 11:02",
    msgs: 6,
  },
  {
    id: "s4",
    title: "PLAT-198 context",
    preview: "Dashboard widget. Eve and Dave are reviewing design…",
    ts: "Mar 23 · 09:15",
    msgs: 3,
  },
  {
    id: "s5",
    title: "Hotfix process recap",
    preview: "Retro discussion on hotfix handling. Not finalized.",
    ts: "Mar 20 · 17:30",
    msgs: 12,
  },
  {
    id: "s6",
    title: "Notion API renewal status",
    preview: "Reached out to IT; ETA for new key is EOD.",
    ts: "Mar 19 · 14:22",
    msgs: 2,
  },
];

export function pickResponse(q: string): SampleResponse {
  const l = q.toLowerCase();
  if (l.includes("blocked") || l.includes("block")) return SAMPLE_RESPONSES.blocked;
  if (l.includes("auth")) return SAMPLE_RESPONSES.auth;
  if (l.includes("create") || l.includes("ticket") || l.includes("jira"))
    return SAMPLE_RESPONSES.create;
  return SAMPLE_RESPONSES.blocked;
}

export function nowHHMM(): string {
  return new Date().toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}
