"use client";

import { useState } from "react";
import type { JSX, KeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/ui/Icon";

export interface AskAgentCardProps {
  /** Optional placeholder override. */
  placeholder?: string;
}

/**
 * Textarea + send button. On submit navigates to `/chat?seed=<encoded query>`.
 * Enter sends, Shift+Enter inserts a newline. Disabled while empty.
 *
 * Mirrors the prototype `AskAgentCard` (screens-home.jsx).
 */
export function AskAgentCard({
  placeholder = "Ask about a meeting, ticket, decision, or person…",
}: AskAgentCardProps): JSX.Element {
  const router = useRouter();
  const [value, setValue] = useState("");
  const trimmed = value.trim();
  const disabled = trimmed.length === 0;

  const submit = (): void => {
    if (disabled) return;
    router.push(`/chat?seed=${encodeURIComponent(trimmed)}`);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>): void => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };

  return (
    <div className="ask-input-wrap">
      <textarea
        className="textarea ask-input"
        placeholder={placeholder}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={onKeyDown}
        rows={3}
      />
      <button
        type="button"
        className="btn btn-primary ask-send"
        onClick={submit}
        disabled={disabled}
        aria-label="Send"
      >
        <Icon name="send" size={14} />
      </button>
    </div>
  );
}
