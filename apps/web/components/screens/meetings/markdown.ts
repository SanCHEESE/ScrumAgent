import type { ReactNode } from "react";
import { createElement, Fragment } from "react";

/**
 * Tiny markdown subset used by meeting summaries:
 *
 * - `**Bold**` inline → <strong>
 * - Lines starting with `- ` → wrapped in a single <ul>
 * - A paragraph ending with `:**` becomes an <h4> heading
 * - Blank lines split paragraphs
 *
 * Returns React nodes. We do NOT pull in a full markdown library —
 * the prototype's mock data only ever uses these constructs.
 */

type Token =
  | { type: "heading"; text: string }
  | { type: "paragraph"; text: string }
  | { type: "list"; items: string[] };

function tokenize(src: string): Token[] {
  const lines = src.split("\n");
  const tokens: Token[] = [];
  let buffer: string[] = [];
  let listItems: string[] = [];

  const flushParagraph = () => {
    if (buffer.length === 0) return;
    const text = buffer.join(" ").trim();
    buffer = [];
    if (text === "") return;
    if (
      text.startsWith("**") &&
      text.endsWith("**") &&
      text.length > 4
    ) {
      tokens.push({ type: "heading", text: text.slice(2, -2) });
    } else {
      tokens.push({ type: "paragraph", text });
    }
  };

  const flushList = () => {
    if (listItems.length === 0) return;
    tokens.push({ type: "list", items: listItems });
    listItems = [];
  };

  for (const raw of lines) {
    const line = raw.trimEnd();
    if (line.startsWith("- ")) {
      flushParagraph();
      listItems.push(line.slice(2));
      continue;
    }
    if (line.trim() === "") {
      flushParagraph();
      flushList();
      continue;
    }
    flushList();
    buffer.push(line);
  }
  flushParagraph();
  flushList();

  return tokens;
}

/** Render `**bold**` runs into React nodes. */
function renderInline(text: string, keyBase: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /\*\*([^*]+)\*\*/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) {
      out.push(text.slice(last, m.index));
    }
    out.push(
      createElement("strong", { key: `${keyBase}-b${i}` }, m[1]),
    );
    last = m.index + m[0].length;
    i++;
  }
  if (last < text.length) {
    out.push(text.slice(last));
  }
  return out;
}

export function renderMarkdown(src: string): ReactNode {
  if (!src.trim()) return null;
  const tokens = tokenize(src);
  return createElement(
    Fragment,
    null,
    ...tokens.map((tok, idx) => {
      const key = `t${idx}`;
      switch (tok.type) {
        case "heading":
          return createElement(
            "h4",
            { key },
            ...renderInline(tok.text, key),
          );
        case "paragraph":
          return createElement(
            "p",
            { key },
            ...renderInline(tok.text, key),
          );
        case "list":
          return createElement(
            "ul",
            { key },
            ...tok.items.map((item, i) =>
              createElement(
                "li",
                { key: `${key}-i${i}` },
                ...renderInline(item, `${key}-i${i}`),
              ),
            ),
          );
      }
    }),
  );
}
