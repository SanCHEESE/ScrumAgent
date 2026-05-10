---
type: meta
title: "Wiki Conventions"
created: 2026-05-10
updated: 2026-05-10
tags: [meta, conventions]
---

# Conventions

How this wiki is organized and maintained.

## Layers

- **`.raw/`** — immutable source documents. Never modify. Snapshots of migrated docs live in `.raw/migrated/`.
- **`wiki/`** — LLM-curated knowledge base. Edit freely.
- **`CLAUDE.md`** (project root) — instructions for AI agents.

## Frontmatter

Every wiki page starts with YAML frontmatter:

```yaml
---
type: <module|decision|concept|entity|flow|source|domain|overview|meta>
title: "Page Title"
status: <active|draft|deprecated|stub>     # optional
created: YYYY-MM-DD
updated: YYYY-MM-DD
tags: [...]
---
```

Module pages add: `path`, `language`, `depends_on`, `used_by`.
Decision pages add: `date`, `status` (proposed|accepted|superseded), `supersedes`.

## Wikilinks

- Use `[[Page Title]]` or `[[folder/page]]` — filenames are unique enough that paths are usually optional.
- Cross-link aggressively. Every entity, concept, module mentioned should be a wikilink.

## Index discipline

- `wiki/index.md` is the master catalog — update on every new page.
- Each folder has an `_index.md` (sub-index).
- `wiki/log.md` is append-only — newest entry at the **top**.
- `wiki/hot.md` is a ~500-word cache — overwrite completely after meaningful changes.

## Custom callouts

Defined in `.obsidian/snippets/vault-colors.css`:

- `[!contradiction]` — sources conflict on a claim
- `[!gap]` — topic has no source / needs research
- `[!key-insight]` — most important takeaway in a section
- `[!stale]` — claim may be outdated

## What goes where

| If you're capturing... | File it under |
|---|---|
| A code module / package / service | `wiki/modules/` |
| An architecture decision (ADR) | `wiki/decisions/` |
| A reusable idea or framework | `wiki/concepts/` |
| A real-world person/org/product | `wiki/entities/` |
| A pipeline or sequence | `wiki/flows/` |
| A summary of an external doc | `wiki/sources/` |
| A high-level topic area | `wiki/domains/` |
