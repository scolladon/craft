---
name: documentation
description: Craft phase 9 - refresh affected documentation pages, tick the backlog entry under guard, fold in-scope findings into the PR and defer the rest to impact triage; runs in parallel with the background validation run.
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
3. **Synthesis — session-owned, never delegated.** Fold before defer: every finding
   this step inventories gets its verdict under the run skill's cross-phase invariant
   **Impacts: fold or defer at discovery**, which holds the scope boundary, the fold
   limits and the deferral form. This step authors no backlog entry and appends no
   filing line: the `impact-triage` phase files triaged impacts.
   1. **Inventory** every finding no phase resolved: the session's own observations,
      discoveries from step 1, and triage EXCEPTIONs or `IMPACT(` lines an earlier phase
      has not yet given a verdict. Read them from the ledger and the handbacks; nothing
      new is written for it. A triage EXCEPTION the background harness lands after this
      step gets the same triage before `propose`.
   2. **Triage** each finding to one verdict, folded or deferred, by the invariant's rule.
   3. **Fold:** the session makes each fix itself under the invariant's fold limits, then
      appends `FOLDED(<file>): <finding> -> <sha>` after the fold commit, one line per
      locus file.
   4. **Defer** the rest through `run-ledger.sh defer <run-id> documentation` (the run
      skill's shimmed `$ledger`), one entry per finding with its re-runnable proof. With
      no open run (standalone), `defer` refuses: list the findings in the final output.

   No findings → the fold step records nothing. The PR body drafts here
   too, per the default template (repo's own `templates/pr-body.md`, else
   `"${CRAFT_ROOT:-${CLAUDE_PLUGIN_ROOT}}/templates/pr-body.md"`; a manifest `override:` replaces it):
   three reader-first narrative sections — **Background** (the system as it stands),
   **Intuition** (the core idea, a toy example, a mermaid diagram where it helps),
   **Code** (a grouped high-level walkthrough of the diff) — then a **Provenance &
   verification** trailer carrying decisions + ADR numbers, design doc path, divergences,
   pinned behaviours, test plan, the run record.
   The trailer's `- **Discovered impacts:**` line reads `<n> deferred, triage pending`,
   counted from this run's `DEFERRED(` lines, or `none`; the `impact-triage` phase
   rewrites it with the verdicts.
