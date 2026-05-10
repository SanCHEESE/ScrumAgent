# Project Instructions for AI Agents

This file provides instructions and context for AI coding agents working on this project.

<!-- BEGIN BEADS INTEGRATION v:1 profile:minimal hash:ca08a54f -->
## Beads Issue Tracker

This project uses **bd (beads)** for issue tracking. Run `bd prime` to see full workflow context and commands.

### Quick Reference

```bash
bd ready              # Find available work
bd show <id>          # View issue details
bd update <id> --claim  # Claim work
bd close <id>         # Complete work
```

### Rules

- Use `bd` for ALL task tracking — do NOT use TodoWrite, TaskCreate, or markdown TODO lists
- Run `bd prime` for detailed command reference and session close protocol
- Use `bd remember` for persistent knowledge — do NOT use MEMORY.md files

## Session Completion

**When ending a work session**, you MUST complete ALL steps below. Work is NOT complete until `git push` succeeds.

**MANDATORY WORKFLOW:**

1. **File issues for remaining work** - Create issues for anything that needs follow-up
2. **Run quality gates** (if code changed) - Tests, linters, builds
3. **Update issue status** - Close finished work, update in-progress items
4. **PUSH TO REMOTE** - This is MANDATORY:
   ```bash
   git pull --rebase
   bd dolt push
   git push
   git status  # MUST show "up to date with origin"
   ```
5. **Clean up** - Clear stashes, prune remote branches
6. **Verify** - All changes committed AND pushed
7. **Hand off** - Provide context for next session

**CRITICAL RULES:**
- Work is NOT complete until `git push` succeeds
- NEVER stop before pushing - that leaves work stranded locally
- NEVER say "ready to push when you are" - YOU must push
- If push fails, resolve and retry until it succeeds
<!-- END BEADS INTEGRATION -->


## Knowledge Base (Obsidian wiki)

The project's knowledge base lives in `wiki/`. It is the source of truth for architecture, decisions, modules, integrations, and design.

**Read first when you need context** that isn't in the current conversation:

1. `wiki/hot.md` — recent context (~500 words)
2. `wiki/index.md` — full catalog
3. `wiki/domains/<area>.md` or the relevant module/decision/concept page

**Update as you work** — keep these three things in sync, nothing else:

- **New module / decision / concept** → add a page under `wiki/<modules|decisions|concepts|entities|flows>/` (use `_templates/` as a starting point) and link it from the matching `_index.md` and from `wiki/index.md`.
- **Behavior or architecture change** → update the affected `wiki/modules/*.md` or `wiki/domains/*.md` page. Bump `updated:` in frontmatter.
- **End of session (when something meaningful changed)** → append a dated entry **at the top** of `wiki/log.md` and overwrite `wiki/hot.md` with a fresh ~500-word summary.

Don't create wiki pages for trivial changes. Don't duplicate `bd` issue tracking into the wiki — `bd` is for tasks, the wiki is for durable knowledge.

Sources stay immutable: original docs are snapshotted in `.raw/migrated/`. Edit the curated summary in `wiki/sources/` instead.

## Build & Test

_Add your build and test commands here_

## Architecture Overview

See [`wiki/overview.md`](wiki/overview.md) and [`wiki/domains/architecture.md`](wiki/domains/architecture.md).

## Conventions & Patterns

See [`wiki/meta/conventions.md`](wiki/meta/conventions.md).
