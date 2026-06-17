---
name: validation
description: Craft phase 8 - mutation-test the change, triage survivors (kill or prove equivalent); gates the PR. Also useful standalone after a hotfix.
---

# craft:validation

## Preamble (always runs — non-overridable)

1. Manifest read (lint if standalone). Standalone: scope = current branch vs default
   branch.
2. **Read harness knobs** from `phase.harness` (the resolved descriptor): `tool` names
   which mutation tool to run (absent → the probe below determines it); `scope` (default
   `per-hunk`); `incremental` (default `false`). Then **probe: mutation tooling
   configured?** (stryker/mutmut/cosmic-ray/cargo-mutants config, or whatever the repo
   `context:`/`override:` names) — it runs regardless of `tool`. Absent → **no-op with a
   note** in the run record; the phase ends here. A manifest may never pre-empt this
   probe.

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
