---
name: documentation
description: Craft phase 9 - refresh affected documentation pages, tick the backlog entry under guard, fold in-scope findings into the PR and file the rest as follow-ups; runs in parallel with the background validation run.
---

# craft:documentation

## Preamble (always runs — non-overridable)

1. Manifest read (lint if standalone). Probe: `backlog:` declared? (else no backlog
   work); which doc pages the change actually affects — the **affected-page floor is
   mechanical**: `(diff ∩ subjects) ∪ probe` — the existing judgment probe (public
   surface, behaviour a page states) UNIONed with every living page whose declared
   `subjects` the diff matches (via the intention port's `consult`; see
   `docs/contributing/specs/intention.md`). A **coverage gap** — a load-bearing changed scope
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
2. **Backlog tick — guarded by source** (see `docs/contributing/specs/backlog.md`):
   - `source: file` — **consult `backlog-write` action** (default `always`, ADR-127;
     see `docs/contributing/specs/policy.md` for surface semantics); then spawn **craft:backlog-ticker**
     with the exact entry line and the exact reference suffix. **Accept ONLY if the diff
     touches exactly the expected line(s)** — otherwise discard and do the one-line edit
     yourself.
   - `source: custom` — **consult `external-send` action** (default `ask`, ADR-127;
     see `docs/contributing/specs/policy.md`); on proceed, run `ref` with argv `["complete", id, ...refs]`;
     `id`/`refs` are untrusted, passed as discrete arguments (never spliced into a shell
     string) and `id` validated against the source's id-form before invoking (see the spec's
     safe-invocation note). A **non-zero exit is a blocker** (never a silent tick-skip);
     idempotency is the custom script's documented contract (see `docs/contributing/specs/backlog.md`),
     not framework-asserted.

   Commit `docs(<slug>): backlog flip`.
3. **Synthesis — session-owned, never delegated.** Fold before file: every finding the
   run surfaced is triaged before any backlog entry is authored.
   1. **Inventory** every finding no phase resolved: out-of-scope lines in agent
      handbacks, triage EXCEPTIONs, the session's own observations, and discoveries from
      step 1. Read them from the ledger and the handbacks; nothing new is written for it.
   2. **Triage** each finding to one verdict, folded or filed:
      - A finding the brief or the design lists as out of scope is filed, whatever the
        boundary says.
      - It is in scope when its locus file is in `git diff --name-only <base>...HEAD`, or
        when it concerns a claim or behaviour the diff edits, or a statement that
        contradicts what the diff now makes true, in at most one file outside the diff.
        The run's own design, plan and ADR docs and `BACKLOG.md` are in the diff. A
        finding out of scope is filed.
      - An in-scope finding whose fix needs a new decision goes to the user through the
        blocker protocol `{ unit, reason, ≤3 options }`: fold it with an ADR authored
        through the decisions flow, or file it. It is never folded or filed silently.
      - An in-scope finding whose fix needs a paid or live probe, waits on an external
        trigger, or adds feature behaviour is filed.
      - Every other finding is folded.
   3. **Fold:** the session makes each fix itself, in prose, or in source and tests that
      add no feature behaviour. One commit per fold, typed by what it changes
      (`docs(<scope>):`, `fix(<scope>):`, `test(<scope>):`). A fold beyond prose commits
      only on a green `gates.part`. A fold that turns red is reverted and filed with
      `Not folded: the fix did not pass <gate> — <first failing line>`. The PR trailer
      names any source fold as outside the executing-harness run. After each fold commit, append
      `FOLDED(<file>): <finding> -> <sha>` to the ledger, one line per locus file.
   4. **File** the rest as new backlog follow-up entries (full context, cross-links,
      placed per the repo's ordering convention); they are what a future craft run
      resolves from. Each entry carries one sentence that opens `Not folded: ` and gives
      the reason: out of scope, needs its own decision, needs a probe, or waits on an
      external trigger. After each entry commit, append
      `FILED(<file>): <finding> — not folded: <reason>` to the ledger.

   No findings → the fold step records nothing. The PR body drafts here
   too, per the default template (repo's own `templates/pr-body.md`, else
   `"${CRAFT_ROOT:-${CLAUDE_PLUGIN_ROOT}}/templates/pr-body.md"`; a manifest `override:` replaces it):
   three reader-first narrative sections — **Background** (the system as it stands),
   **Intuition** (the core idea, a toy example, a mermaid diagram where it helps),
   **Code** (a grouped high-level walkthrough of the diff) — then a **Provenance &
   verification** trailer carrying decisions + ADR numbers, design doc path, divergences,
   pinned behaviours, test plan, the run record.
