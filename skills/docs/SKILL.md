---
name: docs
description: Forge phase 9 - refresh affected documentation pages, tick the backlog entry under guard, author follow-ups; runs in parallel with the background mutation run.
---

# forge:docs

## Preamble (always runs — non-overridable)

1. Manifest read (lint if standalone). Probe: `backlog:` declared? (else no backlog
   work); which doc pages the change actually affects (public surface, behaviour a
   page states).

## Procedure (default body — a manifest `override:` replaces everything below)

Runs in parallel with the mutation phase's background run.

1. **Pages — only if any are affected:** spawn **forge:docs-writer** with the affected
   page list + what changed per page, the design doc path as content source, the
   commit message `docs(<slug>): refresh pages`, and the context files. No affected
   pages → skip honestly (run record).
2. **Backlog tick — guarded:** spawn **forge:backlog-ticker** with the exact entry
   line and the exact reference suffix. **Accept ONLY if the diff touches exactly the
   expected line(s)** — otherwise discard and do the one-line edit yourself. Commit
   `docs(<slug>): backlog flip`.
3. **Synthesis — session-owned, never delegated:** new backlog follow-up entries
   surfaced during the run (full context, cross-links, placed per the repo's ordering
   convention); they are what a future forge run resolves from. The PR body drafts
   here too: decisions + ADR numbers, design doc path, divergences, pinned behaviours,
   test plan, the run record.
