import { Fragment, useMemo } from "react";
import type { JSX, ReactNode } from "react";

export interface StreamingTextProps {
  text: string;
  /** While true, the trailing block gets a blinking cursor. */
  streaming: boolean;
}

interface Block {
  type: "p" | "quote";
  content: string;
}

/**
 * Tiny markdown renderer used by the agent message body. Supports:
 *  - paragraph breaks on blank lines
 *  - "> text" blockquotes
 *  - inline **bold** and *italic*
 *
 * Logic ported from screens-chat.jsx so streaming chunks render the same
 * structure regardless of where the text was split.
 */
export function StreamingText({ text, streaming }: StreamingTextProps): JSX.Element {
  const blocks = useMemo<Block[]>(() => {
    const lines = text.split("\n");
    const out: Block[] = [];
    let buf: string[] = [];
    const flush = (): void => {
      if (buf.length) {
        out.push({ type: "p", content: buf.join(" ") });
        buf = [];
      }
    };
    for (const ln of lines) {
      if (ln.startsWith("> ")) {
        flush();
        out.push({ type: "quote", content: ln.slice(2) });
      } else if (ln.trim() === "") {
        flush();
      } else {
        buf.push(ln);
      }
    }
    flush();
    return out;
  }, [text]);

  return (
    <>
      {blocks.map((b, i) => {
        const isLast = i === blocks.length - 1;
        const inline = renderInline(b.content);
        const trailingCursor = streaming && isLast ? <span className="cursor" /> : null;
        if (b.type === "quote") {
          return (
            <blockquote key={i}>
              {inline}
              {trailingCursor}
            </blockquote>
          );
        }
        return (
          <p key={i}>
            {inline}
            {trailingCursor}
          </p>
        );
      })}
      {/* If streaming has begun but there are no blocks yet, still show a cursor
          so users see something is happening. */}
      {streaming && blocks.length === 0 ? (
        <p>
          <span className="cursor" />
        </p>
      ) : null}
    </>
  );
}

function renderInline(t: string): ReactNode[] {
  const parts = t.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g);
  return parts.map((p, i) => {
    if (p.startsWith("**") && p.endsWith("**")) {
      return <strong key={i}>{p.slice(2, -2)}</strong>;
    }
    if (p.startsWith("*") && p.endsWith("*")) {
      return <em key={i}>{p.slice(1, -1)}</em>;
    }
    return <Fragment key={i}>{p}</Fragment>;
  });
}
