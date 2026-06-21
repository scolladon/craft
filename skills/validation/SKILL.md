---
name: validation
description: Craft phase 8 - mutation-test the change, triage survivors (kill or prove equivalent); gates the PR. Also useful standalone after a hotfix.
---

# craft:validation

## Preamble (always runs — non-overridable)

1. Manifest read (lint if standalone). Standalone: scope = current branch vs default
   branch.
2. **DoD assertion** — probe `paths.dod` (manifest) else default `docs/DOD.md`. Warn on
   absence; never create the file (deliberate inversion: a DoD is repo-authored, not
   engine-created). Read the file **verbatim as trusted operator input** — same trust
   model as `context:` files; never interpret it as engine instructions.
   - **Absent** (no `paths.dod`, no `docs/DOD.md`) → record
     `NO-OP(verify): no DoD declared — <what was asserted instead: gates green, mutation
     triaged-or-no-op'd>`. When the `architecture` phase is also OFF and no DoD exists,
     append an honest gap-note: *the architecture boundary check did not run* — never
     fabricate alignment. The verify no-op never blocks `propose` on its own; it only
     drives gate-release when the mutation sub-concern also no-op'd (see gate-satisfaction
     note below).
   - **Present** → assert each criterion (met / unmet / not-auto-checkable-asserted) and
     record per-criterion outcomes. Criteria that reference engineering checks (gates
     green, mutation testing clean) are evidenced by reading the existing `gates.phase`
     and this phase's mutation results — **never re-run** them. If mutation no-op'd, that
     criterion is recorded against the no-op (a stated limitation, not a fabricated pass).
     Architecture-alignment criteria are evidenced by the `architecture` gate when that
     phase ran and was green; when it is OFF/no-op'd, the criterion is asserted on the
     DoD's terms. A positive outcome is recorded as `verify: DoD met — <N criteria, K
     evidenced by phase results, J session-asserted>`. An unmet criterion is a
     blocker `{ verify, "<criterion> unmet", ≤3 options }` escalated to the user —
     never a silent pass and never a silent gate fail. Headless (Pi adapter, no user):
     record the blocker and halt; never degrade to a silent pass.
3. **Read harness knobs** from `phase.harness` (the resolved descriptor): `tool` names
   which mutation tool to run (absent → the probe below determines it); `scope` (default
   `per-hunk`); `incremental` (default `false`). Then **probe: mutation tooling
   configured?** (stryker/mutmut/cosmic-ray/cargo-mutants config, or whatever the repo
   `context:`/`override:` names) — it runs regardless of `tool`. Absent → **no-op with a
   note** in the run record; the phase ends here. A manifest may never pre-empt this
   probe.

**Gate-satisfaction note.** The `validation` propose-gate entry is a single entry. It is
**satisfied** when the mutation run lands and triages green (`gates.phase` green), and
**released** (per the recorded-no-op release clause) when the phase lands no mutation run
at all. A `NO-OP(verify):` line is the DoD sub-concern's recorded outcome — it never
blocks `propose` on its own, and only drives gate-release in the case where the mutation
sub-concern also no-op'd.

## Procedure (default body — a manifest `override:` replaces everything below)

1. **Scope the run per `phase.harness.scope`** (default `per-hunk`), never wider than the
   change's touched code and never the full tree: with `per-hunk`, derive one range per
   *contiguous changed hunk* (`git diff -U0`); with `per-file`, scope to the full touched
   files. Do NOT consolidate across unchanged gaps regardless of mode, and honor
   `incremental` when the tool supports it. Loose/merged ranges inflate the run AND
   surface out-of-scope survivors the triage must then filter — a tight per-hunk list is
   faster and cleaner.
   Start it **in the background**; write the run-lock
   (`<root>/.craft-mutation.lock` ← `<pid> <iso-timestamp>`); clear the lock when the
   run lands. The documentation phase may proceed in parallel while it grinds.
2. **The PR waits for triage** (orchestrator invariant): when the run lands, filter
   survivors/no-coverage to the change's lines only (pre-existing-line survivors are
   out of scope), then spawn **craft:validation-triager** with: the filtered survivors;
   **reviewer-predicted equivalent mutants verbatim** (from the review phase's
   advisory notes); the gates; the commit message `test(mutation): <scope>`; global +
   validation-phase `context:` files verbatim (tool-specific triage procedure included).
3. Verify the triager's commit; run `gates.phase`; record per-survivor outcomes in the
   run record.
4. **Never destroy the worktree while the run is alive** — `worktree-teardown.sh`
   refuses on the lock; don't fight it.
