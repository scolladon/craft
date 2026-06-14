---
name: mutation
description: Forge phase 8 - mutation-test the change, triage survivors (kill or prove equivalent); gates the PR. Also useful standalone after a hotfix.
---

# forge:mutation

## Preamble (always runs — non-overridable)

1. Manifest read (lint if standalone). Standalone: scope = current branch vs default
   branch.
2. **Probe: mutation tooling configured?** (stryker/mutmut/cosmic-ray/cargo-mutants
   config, or whatever the repo `context:`/`override:` names.) Absent → **no-op with a
   note** in the run record; the phase ends here. A manifest may never pre-empt this
   probe.

## Procedure (default body — a manifest `override:` replaces everything below)

1. **Scope the run to exactly the change's touched code** — never the full tree, and
   never wider than the diff: derive one range per *contiguous changed hunk*
   (`git diff -U0`), and do NOT consolidate across unchanged gaps. Loose/merged ranges
   inflate the run AND surface out-of-scope survivors the triage must then filter — a
   tight per-hunk list is faster and cleaner.
   Start it **in the background**; write the run-lock
   (`<root>/.forge-mutation.lock` ← `<pid> <iso-timestamp>`); clear the lock when the
   run lands. The docs phase may proceed in parallel while it grinds.
2. **The PR waits for triage** (orchestrator invariant): when the run lands, filter
   survivors/no-coverage to the change's lines only (pre-existing-line survivors are
   out of scope), then spawn **forge:mutation-triager** with: the filtered survivors;
   **reviewer-predicted equivalent mutants verbatim** (from the review phase's
   advisory notes); the gates; the commit message `test(mutation): <scope>`; global +
   mutation-phase `context:` files verbatim (tool-specific triage procedure included).
3. Verify the triager's commit; run `gates.phase`; record per-survivor outcomes in the
   run record.
4. **Never destroy the worktree while the run is alive** — `worktree-teardown.sh`
   refuses on the lock; don't fight it.
