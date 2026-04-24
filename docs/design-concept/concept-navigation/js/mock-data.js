// ============================================
// Kabanchik Mock Data
// ============================================

const MOCK_PROJECTS = [
  {
    id: 'p1',
    name: 'Platform Team',
    email: 'scrumagent.platform@municorn.com',
    lastSync: '5 min ago',
    status: 'active',
    description: 'Backend platform & infra squad',
  },
  {
    id: 'p2',
    name: 'Mobile Team',
    email: 'scrumagent.mobile@municorn.com',
    lastSync: null,
    status: 'never_synced',
    description: 'iOS & Android apps',
  },
  {
    id: 'p3',
    name: 'Data Team',
    email: 'scrumagent.data@municorn.com',
    lastSync: '2 hours ago',
    status: 'error',
    description: 'Data pipelines & analytics',
  },
];

// Kabanchik uikit avatar palette — royal-blue family + warm semantics
const AVATAR_COLORS = ['#0077e6','#005fc4','#10b981','#f59e0b','#ef4444','#a16207','#7c3aed'];

const MOCK_PARTICIPANTS = {
  alice: { name: 'Alice Kim', initials: 'AK', color: '#0077e6' },
  bob:   { name: 'Bob Chen', initials: 'BC', color: '#005fc4' },
  carol: { name: 'Carol Diaz', initials: 'CD', color: '#10b981' },
  dave:  { name: 'Dave Park', initials: 'DP', color: '#f59e0b' },
  eve:   { name: 'Eve Russo', initials: 'ER', color: '#ef4444' },
};

const MOCK_MEETINGS = [
  {
    id: 'm1',
    title: 'Daily Standup',
    date: '2026-03-26',
    time: '10:00',
    duration: '15m',
    participants: ['alice','bob','carol','dave','eve'],
    status: 'done',
    summary: `
**Overview:** Quick sync on current sprint progress. Team is on track for sprint goal with one blocker identified.

**Key Points:**
- Bob completed the auth token fix (PLAT-234) and deployed to staging
- Carol is blocked on the Notion integration pending API key renewal
- Dave picked up the metrics dashboard ticket (PLAT-198)
- Sprint velocity looks good, no risks to the sprint goal
    `.trim(),
    jiraIssues: [
      { key: 'PLAT-234', title: 'Fix auth token expiry handling', status: 'done' },
      { key: 'PLAT-198', title: 'Metrics dashboard widget', status: 'in-progress' },
    ],
    notionPages: [
      { title: 'Sprint 42 Notes', icon: '📋' },
      { title: 'Team Wiki', icon: '📚' },
    ],
    transcript: [
      { speaker: 'Alice', time: '0:00', text: 'Good morning everyone, let\'s start the standup. Bob, want to go first?' },
      { speaker: 'Bob', time: '0:12', text: 'Sure! Yesterday I finished the auth token fix — PLAT-234 is deployed to staging and looking good. Today I\'m writing the unit tests and will open the PR for review.' },
      { speaker: 'Alice', time: '0:30', text: 'Great, I\'ll take a look this afternoon. Carol?' },
      { speaker: 'Carol', time: '0:35', text: 'I\'m blocked on the Notion integration. The API key expired and I\'m waiting for IT to renew it. Otherwise I\'d be able to finish by EOD.' },
      { speaker: 'Alice', time: '0:50', text: 'I\'ll ping IT now. Dave, how\'s the dashboard?' },
      { speaker: 'Dave', time: '0:58', text: 'Just picked it up yesterday. Reviewing the design with Eve today and should have a prototype by tomorrow.' },
      { speaker: 'Eve', time: '1:10', text: 'Confirmed, we have a design sync at 2pm.' },
      { speaker: 'Alice', time: '1:15', text: 'Sounds good. No other blockers? Great, see you all tomorrow!' },
    ],
    actionItems: [
      { id: 'ai1', owner: 'alice', text: 'Ping IT to renew Notion API key', due: '2026-03-26', status: 'done', jiraKey: null },
      { id: 'ai2', owner: 'bob', text: 'Open PR for PLAT-234 auth fix', due: '2026-03-26', status: 'open', jiraKey: 'PLAT-234' },
      { id: 'ai3', owner: 'dave', text: 'Dashboard prototype ready', due: '2026-03-27', status: 'open', jiraKey: 'PLAT-198' },
    ],
    decisions: [
      { text: 'Deploy auth fix to production after PR review, not waiting for next release cycle', confidence: 'High' },
      { text: 'Carol to pick up Notion integration immediately after API key is renewed', confidence: 'High' },
      { text: 'Dashboard design review determines if animation is in scope for this sprint', confidence: 'Medium' },
    ],
  },
  {
    id: 'm2',
    title: 'Sprint Planning',
    date: '2026-03-25',
    time: '14:00',
    duration: '1h 30m',
    participants: ['alice','bob','carol','dave'],
    status: 'processing',
    summary: 'Processing...',
    jiraIssues: [],
    notionPages: [],
    transcript: null,
    actionItems: [],
    decisions: [],
  },
  {
    id: 'm3',
    title: 'Backlog Grooming',
    date: '2026-03-24',
    time: '11:00',
    duration: '45m',
    participants: ['alice','carol','eve'],
    status: 'pending',
    summary: '',
    jiraIssues: [],
    notionPages: [],
    transcript: null,
    actionItems: [],
    decisions: [],
  },
  {
    id: 'm4',
    title: 'Retrospective',
    date: '2026-03-20',
    time: '16:00',
    duration: '1h',
    participants: ['alice','bob','carol'],
    status: 'error',
    summary: '',
    jiraIssues: [],
    notionPages: [],
    transcript: null,
    actionItems: [],
    decisions: [],
  },
  {
    id: 'm5',
    title: 'Architecture Review',
    date: '2026-03-19',
    time: '13:00',
    duration: '2h',
    participants: ['alice','bob','dave','eve'],
    status: 'done',
    summary: `
**Overview:** Reviewed the proposed microservice split for the auth subsystem.

**Key Points:**
- Decision to keep auth as a monolith for this quarter
- Will revisit microservice split in Q3
- Bob to document current auth flow in Notion
    `.trim(),
    jiraIssues: [
      { key: 'PLAT-201', title: 'Document auth flow', status: 'open' },
    ],
    notionPages: [
      { title: 'Architecture Decisions', icon: '🏗️' },
    ],
    transcript: [],
    actionItems: [
      { id: 'ai4', owner: 'bob', text: 'Document current auth flow in Notion', due: '2026-03-22', status: 'done', jiraKey: 'PLAT-201' },
    ],
    decisions: [
      { text: 'Keep auth as monolith through Q2, revisit microservice split in Q3 planning', confidence: 'High' },
      { text: 'All architecture decisions to be documented in Notion Architecture Decisions page', confidence: 'High' },
    ],
  },
];

const MOCK_UPDATES = [
  {
    id: 'u1',
    target: 'jira',
    objectName: 'PLAT-234',
    updateType: 'Change status',
    before: 'In Progress',
    after: 'Done',
    reasoning: 'Meeting transcript clearly indicates Bob confirmed the deployment completed successfully: "PLAT-234 is deployed to staging and looking good." Combined with his commitment to opening the PR, the ticket is functionally done.',
    confidence: 'High',
    status: 'pending',
    meetingId: 'm1',
    meetingTitle: 'Daily Standup',
  },
  {
    id: 'u2',
    target: 'notion',
    objectName: 'Sprint 42 Notes',
    updateType: 'Add comment',
    before: '',
    after: 'Decided to delay dashboard animation feature to next sprint pending design review outcome (agreed in standup 2026-03-26).',
    reasoning: 'Dave mentioned that the design review determines if animation is in scope. Alice agreed, making this a conditional decision that should be logged.',
    confidence: 'Medium',
    status: 'pending',
    meetingId: 'm1',
    meetingTitle: 'Daily Standup',
  },
  {
    id: 'u3',
    target: 'jira',
    objectName: 'PLAT-201',
    updateType: 'Set assignee',
    before: 'Unassigned',
    after: 'Bob Chen',
    reasoning: 'Bob explicitly volunteered to document the auth flow during the architecture review.',
    confidence: 'High',
    status: 'approved',
    meetingId: 'm5',
    meetingTitle: 'Architecture Review',
  },
  {
    id: 'u4',
    target: 'notion',
    objectName: 'Team Wiki',
    updateType: 'Add comment',
    before: '',
    after: 'New hotfix process: all P0 fixes bypass normal sprint planning and go directly to a hotfix branch.',
    reasoning: 'Discussed during retrospective but decision was not fully confirmed — Alice said "we should consider it" rather than agreeing.',
    confidence: 'Low',
    status: 'rejected',
    meetingId: 'm4',
    meetingTitle: 'Retrospective',
  },
  {
    id: 'u5',
    target: 'jira',
    objectName: 'PLAT-198',
    updateType: 'Add comment',
    before: '',
    after: 'Dave and Eve to do design review 2026-03-26 14:00. Animation feature decision pending outcome.',
    reasoning: 'Eve confirmed the design sync time explicitly in standup.',
    confidence: 'High',
    status: 'applied',
    meetingId: 'm1',
    meetingTitle: 'Daily Standup',
  },
];

const MOCK_TRACE_RUNS = [
  {
    id: 'r1',
    datetime: '2026-03-26 10:18',
    meetingTitle: 'Daily Standup',
    meetingId: 'm1',
    status: 'done',
    duration: '42s',
    agentModel: 'claude-sonnet-4-6',
    steps: [
      {
        name: 'Fetch transcript',
        input: JSON.stringify({ meetingId: 'm1', projectId: 'p1' }, null, 2),
        output: JSON.stringify({ utteranceCount: 8, speakers: ['Alice','Bob','Carol','Dave','Eve'], duration: '1m 20s' }, null, 2),
        tools: [],
        duration: '1.2s',
      },
      {
        name: 'Analyze decisions',
        input: JSON.stringify({ transcript: '[...8 utterances...]', context: 'Sprint 42 standup' }, null, 2),
        output: JSON.stringify({ decisions: ['Deploy auth fix immediately', 'Carol picks up Notion after key renewal', 'Dashboard animation TBD'] }, null, 2),
        tools: [
          { name: 'llm_call', args: JSON.stringify({ model: 'claude-sonnet-4-6', max_tokens: 2048 }), result: '{ decisions: [...] }' },
        ],
        duration: '8.4s',
      },
      {
        name: 'Extract action items',
        input: JSON.stringify({ transcript: '[...]', existingJiraIssues: ['PLAT-234','PLAT-198'] }, null, 2),
        output: JSON.stringify({ actionItems: [{ owner: 'alice', text: 'Ping IT for Notion key', due: '2026-03-26' }, { owner: 'bob', text: 'Open PR for PLAT-234', due: '2026-03-26' }] }, null, 2),
        tools: [],
        duration: '6.1s',
      },
      {
        name: 'Fetch Jira context',
        input: JSON.stringify({ keys: ['PLAT-234', 'PLAT-198'] }, null, 2),
        output: JSON.stringify({ issues: [{ key: 'PLAT-234', status: 'In Progress', assignee: 'Bob Chen' }, { key: 'PLAT-198', status: 'To Do', assignee: null }] }, null, 2),
        tools: [
          { name: 'jira_get_issue', args: JSON.stringify({ key: 'PLAT-234' }), result: '{ key: "PLAT-234", status: "In Progress" }' },
          { name: 'jira_get_issue', args: JSON.stringify({ key: 'PLAT-198' }), result: '{ key: "PLAT-198", status: "To Do" }' },
        ],
        duration: '3.2s',
      },
      {
        name: 'Generate proposed updates',
        input: JSON.stringify({ decisions: '[...]', actionItems: '[...]', jiraContext: '[...]' }, null, 2),
        output: JSON.stringify({ updates: [{ target: 'jira', key: 'PLAT-234', field: 'status', from: 'In Progress', to: 'Done', confidence: 'High' }] }, null, 2),
        tools: [],
        duration: '12.3s',
      },
      {
        name: 'Save results',
        input: JSON.stringify({ meetingId: 'm1', updates: '[5 updates]', summary: '[...]' }, null, 2),
        output: JSON.stringify({ saved: true, updatesCreated: 5, summaryId: 'sum_m1' }, null, 2),
        tools: [],
        duration: '0.8s',
      },
    ],
  },
  {
    id: 'r2',
    datetime: '2026-03-25 14:35',
    meetingTitle: 'Sprint Planning',
    meetingId: 'm2',
    status: 'processing',
    duration: '—',
    agentModel: 'claude-sonnet-4-6',
    steps: [
      {
        name: 'Fetch transcript',
        input: JSON.stringify({ meetingId: 'm2' }, null, 2),
        output: 'Processing...',
        tools: [],
        duration: '1.1s',
      },
    ],
  },
  {
    id: 'r3',
    datetime: '2026-03-20 17:12',
    meetingTitle: 'Retrospective',
    meetingId: 'm4',
    status: 'done',
    duration: '1m 8s',
    agentModel: 'claude-sonnet-4-6',
    steps: [
      {
        name: 'Fetch transcript',
        input: JSON.stringify({ meetingId: 'm4' }, null, 2),
        output: JSON.stringify({ utteranceCount: 22 }, null, 2),
        tools: [],
        duration: '1.4s',
      },
      {
        name: 'Analyze decisions',
        input: '...',
        output: JSON.stringify({ decisions: ['Consider hotfix process change'] }, null, 2),
        tools: [
          { name: 'llm_call', args: '{ model: "claude-sonnet-4-6" }', result: '{ decisions: [...] }' },
        ],
        duration: '9.1s',
      },
    ],
  },
];

// ============================================
// Helpers
// ============================================

function getProjectById(id) {
  return MOCK_PROJECTS.find(p => p.id === id);
}

function getMeetingById(id) {
  return MOCK_MEETINGS.find(m => m.id === id);
}

function getParticipant(key) {
  return MOCK_PARTICIPANTS[key] || { name: key, initials: key.slice(0,2).toUpperCase(), color: '#0077e6' };
}

function getUpdatesForMeeting(meetingId) {
  return MOCK_UPDATES.filter(u => u.meetingId === meetingId);
}
