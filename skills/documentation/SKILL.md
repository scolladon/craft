---
name: documentation
description: Craft phase 9 - refresh affected documentation pages, tick the backlog entry under guard, author follow-ups; runs in parallel with the background validation run.
---

# craft:documentation

## Preamble (always runs — non-overridable)

1. Manifest read (lint if standalone). Probe: `backlog:` declared? (else no backlog
   work); which doc pages the change actually affects — the **affected-page floor is
   mechanical**: `(diff ∩ subjects) ∪ probe` — the existing judgment probe (public
   surface, behaviour a page states) UNIONed with every living page whose declared
   `subjects` the diff matches (via the intention port's `consult`; see
   `docs/adapters/intention.md`). A **coverage gap** — a load-bearing changed scope
   matched by no page's `subjects`, under `intention.covers` — escalates via the
   blocker protocol `{ unit, reason, ≤3 options }` rather than silently passing.

## Procedure (default body — a manifest `override:` replaces everything below)

Runs in parallel with the validation phase's background run.

1. **Pages — only if any are affected:** spawn **craft:docs-writer** with the affected
   page list + what changed per page, the design doc path as content source, the
   commit message `docs(<slug>): refresh pages`, and the context files. Page
   refresh/create routes through the intention port's `record`. **`docs-writer` stays
   update-only** — it never creates a new page; a coverage gap that implies a missing
   page is a human decision, escalated per the Preamble, never auto-created. No affected
   pages → skip honestly (run record).
2. **Backlog tick — guarded by source** (see `docs/adapters/backlog.md`):
   - `source: file` — **consult `backlog-write` action** (default `always`, ADR-127;
     see `docs/adapters/policy.md` for surface semantics); then spawn **craft:backlog-ticker**
     with the exact entry line and the exact reference suffix. **Accept ONLY if the diff
     touches exactly the expected line(s)** — otherwise discard and do the one-line edit
     yourself.
   - `source: custom` — **consult `external-send` action** (default `ask`, ADR-127;
     see `docs/adapters/policy.md`); on proceed, run `ref` with argv `["complete", id, ...refs]`;
     `id`/`refs` are untrusted, passed as discrete arguments (never spliced into a shell
     string) and `id` validated against the source's id-form before invoking (see the spec's
     safe-invocation note). A **non-zero exit is a blocker** (never a silent tick-skip);
     idempotency is the custom script's documented contract (see `docs/adapters/backlog.md`),
     not framework-asserted.

   Commit `docs(<slug>): backlog flip`.
3. **Synthesis — session-owned, never delegated:** new backlog follow-up entries
   surfaced during the run (full context, cross-links, placed per the repo's ordering
   convention); they are what a future craft run resolves from. The PR body drafts
   here too: decisions + ADR numbers, design doc path, divergences, pinned behaviours,
   test plan, the run record.
