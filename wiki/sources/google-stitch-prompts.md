---
type: source
title: "Google Stitch prompts — sources/google-stitch-prompts"
status: summarized
source_path: ".raw/migrated/google-stitch-prompts.md"
original_path: "docs/stitch/google-stitch-prompts.md"
created: 2026-05-10
updated: 2026-05-10
tags: [source, design, prompts, stitch]
---

# Google Stitch prompts (summary)

Original: `.raw/migrated/google-stitch-prompts.md`.

## What this doc establishes

A set of prompts for [Google Stitch](https://stitch.googleapis.com) used to generate high-fidelity Kabanchik UI mockups. Each prompt encodes layout, content, and the constraints from the [[sources/design-brief]].

## Use

When you need to regenerate or branch a screen, edit the prompt that matches the surface and rerun in Stitch. Output is reference-only; the production UI is built in Next.js.

## Where this lands in the wiki

- [[domains/design]] — accepts the visual outcomes
- [[domains/frontend]] — implements them

> [!gap] Per-screen prompt index not extracted yet.
> When working on a specific screen (e.g. Updates approval flow), promote the relevant prompt into a dedicated page or component note.
