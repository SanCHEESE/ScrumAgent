"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type JSX } from "react";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import {
  ApiError,
  api,
  type CreateProjectPayload,
  type DirectoryUser,
  type MeetingParticipantSuggestion,
} from "@/lib/api";
import { StepDetails } from "./StepDetails";
import { StepGoogle } from "./StepGoogle";
import { StepJira } from "./StepJira";
import { StepMembers } from "./StepMembers";
import { StepNotion } from "./StepNotion";
import { WizardSteps, type WizardStep } from "./WizardSteps";
import { INITIAL_FORM, type WizardFormData } from "./types";

const STEPS: readonly WizardStep[] = [
  { key: "details", label: "Details" },
  { key: "google", label: "Google Workspace" },
  { key: "jira", label: "Jira" },
  { key: "notion", label: "Notion" },
  { key: "members", label: "Select team members" },
];

const FIXED_MEMBER_EMAILS = new Set([
  "dev@municorn.com",
  "a.bochkarev@municorn.com",
]);

export interface SuggestedProjectMember extends DirectoryUser {
  source: "meeting" | "fallback";
  eventCount: number;
  meetingDisplayName: string | null;
}

export function AddProjectWizard(): JSX.Element {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [data, setData] = useState<WizardFormData>(INITIAL_FORM);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [memberCandidates, setMemberCandidates] = useState<SuggestedProjectMember[]>([]);
  const [membersLoading, setMembersLoading] = useState(false);
  const [membersError, setMembersError] = useState<string | null>(null);

  const update = (patch: Partial<WizardFormData>) => {
    setData((prev) => ({ ...prev, ...patch }));
  };

  useEffect(() => {
    const authSessionId = data.googleAuthSessionId;
    if (!authSessionId) return;
    let active = true;
    setMembersLoading(true);
    setMembersError(null);
    (async () => {
      try {
        const [directory, me, participants] = await Promise.all([
          api.listUsers(),
          api.me().catch(() => null),
          api.listGoogleMeetingParticipants(authSessionId),
        ]);
        if (!active) return;
        setMemberCandidates(buildMemberCandidates(directory, participants, me?.id));
      } catch (e) {
        if (!active) return;
        setMemberCandidates([]);
        setMembersError(
          e instanceof ApiError
            ? e.message
            : "Could not load meeting participants.",
        );
      } finally {
        if (active) setMembersLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [data.googleAuthSessionId]);

  const next = () => setStep((s) => Math.min(s + 1, STEPS.length - 1));
  const prev = () => setStep((s) => Math.max(s - 1, 0));

  const onCreate = async () => {
    if (!data.googleAuthSessionId) return;
    setCreating(true);
    setError(null);
    try {
      const payload: CreateProjectPayload = {
        name: data.name.trim(),
        description: data.description.trim() || null,
        color: data.color,
        google_auth_session_id: data.googleAuthSessionId,
        members: data.selectedUserIds.map((userId) => ({
          user_id: userId,
          role: data.selectedMemberRoles[userId] ?? "member",
        })),
      };
      if (
        data.jiraSiteUrl.trim() &&
        data.jiraUserEmail.trim() &&
        data.jiraApiToken.trim()
      ) {
        payload.jira = {
          site_url: data.jiraSiteUrl.trim(),
          user_email: data.jiraUserEmail.trim(),
          api_token: data.jiraApiToken,
          project_key: data.jiraProjectKey.trim() || null,
        };
      }
      if (data.notionToken.trim() && data.notionSectionUrl.trim()) {
        payload.notion = {
          token: data.notionToken,
          section_url: data.notionSectionUrl.trim(),
        };
      }
      await api.createProject(payload);
      router.push("/projects?created=1");
    } catch (e) {
      setCreating(false);
      setError(
        e instanceof ApiError ? e.message : "Could not create the project.",
      );
    }
  };

  const isLast = step === STEPS.length - 1;
  // Step 1 requires a name; step 2 (Google) is a hard gate on authorization.
  const canContinue =
    step === 0
      ? data.name.trim().length > 0
      : step === 1
        ? Boolean(data.googleAuthSessionId)
        : true;
  const canCreate =
    !creating && data.name.trim().length > 0 && Boolean(data.googleAuthSessionId);

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Add project</h1>
          <div className="page-subtitle">
            5 steps to wire up a new team: authorize an agent Google account, then
            connect Jira and Notion.
          </div>
        </div>
        <Link
          href="/projects"
          className="btn btn-ghost"
          aria-label="Cancel and return to projects"
        >
          <Icon name="close" size={14} />
          Cancel
        </Link>
      </div>

      <div className="wizard-page-card">
        <WizardSteps steps={STEPS} current={step} />

        <div className="wizard-page-body">
          {step === 0 && <StepDetails data={data} onChange={update} />}
          {step === 1 && <StepGoogle data={data} onChange={update} />}
          {step === 2 && <StepJira data={data} onChange={update} />}
          {step === 3 && <StepNotion data={data} onChange={update} />}
          {step === 4 && (
            <StepMembers
              data={data}
              onChange={update}
              users={memberCandidates}
              loading={membersLoading}
              error={membersError}
            />
          )}
        </div>

        {error && (
          <div className="wizard-page-body" style={{ paddingTop: 0 }}>
            <div className="project-error" role="alert">
              <Icon name="alert" size={12} />
              {error}
            </div>
          </div>
        )}

        <div className="wizard-page-footer">
          <Button variant="secondary" onClick={prev} disabled={step === 0}>
            Back
          </Button>
          <div className="spacer" />
          <span className="muted" style={{ fontSize: 12 }}>
            Step {step + 1} of {STEPS.length}
          </span>
          {isLast ? (
            <Button variant="primary" onClick={onCreate} disabled={!canCreate}>
              <Icon name="sparkles" size={14} />
              {creating ? "Creating…" : "Create project"}
            </Button>
          ) : (
            <Button variant="primary" onClick={next} disabled={!canContinue}>
              Continue
              <Icon name="arrow_right" size={14} />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

function buildMemberCandidates(
  directory: DirectoryUser[],
  participants: MeetingParticipantSuggestion[],
  currentUserId?: number,
): SuggestedProjectMember[] {
  const usersByEmail = new Map(directory.map((u) => [u.email.toLowerCase(), u]));
  const result: SuggestedProjectMember[] = [];
  const added = new Set<string>();

  for (const participant of participants) {
    const email = participant.email.toLowerCase();
    const user = usersByEmail.get(email);
    if (!user || user.id === currentUserId || added.has(email)) continue;
    result.push({
      ...user,
      source: "meeting",
      eventCount: participant.event_count,
      meetingDisplayName: participant.display_name,
    });
    added.add(email);
  }

  for (const email of FIXED_MEMBER_EMAILS) {
    const user = usersByEmail.get(email);
    if (!user || user.id === currentUserId || added.has(email)) continue;
    result.push({
      ...user,
      source: "fallback",
      eventCount: 0,
      meetingDisplayName: null,
    });
    added.add(email);
  }

  return result;
}
