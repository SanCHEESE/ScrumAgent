import type { JSX } from "react";
import { Avatar } from "@/components/ui/Avatar";
import { Card, CardBody } from "@/components/ui/Card";
import { PARTICIPANTS } from "@/lib/mock-data";
import type { Meeting, Participant } from "@/lib/types";

export interface TranscriptTabProps {
  meeting: Meeting;
}

function findSpeaker(name: string): Participant | undefined {
  return Object.values(PARTICIPANTS).find((p) => p.name.startsWith(name));
}

export function TranscriptTab({ meeting }: TranscriptTabProps): JSX.Element {
  const m = meeting;
  if (m.transcript.length === 0) {
    return (
      <Card>
        <CardBody>
          <div className="empty">
            <div className="empty-title">
              {m.status === "transcribing"
                ? "Transcription in progress…"
                : "No transcript yet"}
            </div>
            <div className="empty-sub">
              {m.status === "transcribing"
                ? "Hang tight — the audio is still being transcribed."
                : "Transcript will appear here once the meeting is processed."}
            </div>
          </div>
        </CardBody>
      </Card>
    );
  }
  return (
    <Card>
      <CardBody className="transcript">
        {m.transcript.map((t, i) => {
          const speaker = findSpeaker(t.speaker);
          return (
            <div key={`utt-${i}`} className="transcript-row">
              <div className="transcript-time mono muted">{t.time}</div>
              {speaker && <Avatar participant={speaker} size={28} />}
              <div style={{ flex: 1 }}>
                <div className="transcript-speaker">{t.speaker}</div>
                <div className="transcript-text">{t.text}</div>
              </div>
            </div>
          );
        })}
      </CardBody>
    </Card>
  );
}
