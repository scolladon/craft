---
name: planning
description: Craft phase 4 - produce the parted TDD implementation plan via the planner agent; mechanically linted so every part carries its context block.
---

# craft:planning

## Preamble (always runs — non-overridable)

1. Manifest read (lint if standalone).
2. Probe: plan directory (`paths.plan`, else `docs/plan/`, create if absent); **design
   doc present?** present → hard input; absent → the planner's mandatory input is the
   resolved brief and it performs its own exploration (slower, never blocked).
3. **Memory read/write surface (advisory).**
   READS: `part-sizing` entries from prior runs as a weak planner hint (no per-use
   re-check; confidence-weighted). Prepended to the planner spawn's injected block when
   non-empty.
   WRITES: none directly from this phase — part sizing is observed at implementation when
   each part's pass/blocked outcome is known.
4. **Intention consult surface (advisory).** The phase receives the intention consult
   slice on slot 1 — the `IntentionView` entries whose subjects intersect this phase's
   change scope, prepended into the same injected contract block as the memory hint (see
   `skills/run/SKILL.md` step 4). An empty slice means the phase runs its own probes.

## Procedure (default body — a manifest `override:` replaces everything below)

1. Spawn **craft:planner** with: the design doc path (or brief) + the accepted ADR paths; the
   absolute working directory; the output path `<plan-dir>/<slug>.md`; the template
   `"${CRAFT_ROOT:-${CLAUDE_PLUGIN_ROOT}}/templates/plan.md"`; the part-gate command (manifest
   `gates.part`, or probe: the repo's test runner over touched files, falling back to
   `gates.phase`); the commit message `docs(plan): <slug>`; global + planning-phase
   `context:` files verbatim.
2. When it returns: a final message starting `NO-OP: no part remains — ` takes the
   **no-op branch** below; any other return runs
   `"${CRAFT_ROOT:-${CLAUDE_PLUGIN_ROOT}}/scripts/plan-lint.sh" <plan-path>` —
   **the phase cannot close red**. On failure, respawn fresh with the lint output; ≤2
   respawns, then escalate.

   **No-op branch** (every design requirement is already delivered by a commit this run
   landed; no plan file exists, so plan-lint is not run). `<base>` is the default branch the workspace phase probed (`origin/HEAD` → `main` → `master`);
   resolve it once with `git rev-parse --verify --quiet '<base>^{commit}'` — a failure
   escalates. Every check below must pass before anything is recorded:
   - **Coverage:** every requirement id in the design doc's Requirements section appears
     in the planner's mapping; an empty or partial mapping fails.
   - **Shape:** each mapped value is a token matching `^[0-9a-f]{7,40}$` that
     `git rev-parse --verify --quiet '<sha>^{commit}'` resolves; a symbolic rev or any
     other text fails. Each sha is passed to git as one single-quoted argument.
   - **Landed this run:** `git merge-base --is-ancestor <sha> HEAD` must exit 0 and
     `git merge-base --is-ancestor <sha> <base>` must exit exactly 1; any other exit
     (128 included) escalates.
   - **Not the run's own paperwork:** a sha whose
     `git diff-tree --no-commit-id --name-only -r <sha>` touches only the design directory, the plan directory and `README.md`
     fails — the design commit (with its README corpus-count bump) always lands before
     planning and delivers no requirement. An ADR commit is not rejected here: a decision
     can be the deliverable, so the spot-check below judges it.
   - **Delivers what it claims:** read each cited commit's `git show --stat` and confirm it
     delivers the requirement mapped to it (the same spot-check Procedure 3 runs on parts).

   Any failure: respawn fresh with the failures — the same ≤2 respawns — then escalate
   `{ planning, reason, ≤3 options }`. All pass: append
   `NO-OP(planning): no part remains — <justification>` (the planner's requirement → sha
   list verbatim) and `PHASE-DONE(planning): no-op — no part remains` in one
   `run-ledger.sh append <run-id> planning` call (walk step 7). Commit nothing.
   Standalone (no open run): report the planner's line and stop — there is no ledger to
   receive it and no commit.
3. Read the plan; verify part sizing (no test-only parts) and that part contexts
   reference real files/symbols (spot-check). Record in the run record. Skipped on the
   no-op branch: there are no parts.
