---
name: review
description: Craft phase 6 - parallel multi-dimension review with per-dimension convergence; the session applies every fix. Also useful standalone on any branch.
---

# craft:review

## Preamble (always runs — non-overridable)

1. Manifest read (lint if standalone). Standalone: scope = current branch vs default
   branch; establish global-context preconditions (checkout root).
2. Probe harness knobs from `phase.harness` (the resolved descriptor the orchestrator
   holds for this phase), each with a strong fallback when the knob is absent:
   `dimensions` (default `code, security, tests, perf` — a repo `context:` may refine
   their definitions); `passes` = reviewers per dimension (default `1`); `max_cycles`
   (default `3`); `convergence` (default `low-only`). Gates as in implementation's
   preamble; `gates.review-batch` optional extra.
3. **Memory read/write surface (advisory).**
   READS: recurring `findings` entries as advisory **watch-items** — prepended to each
   reviewer spawn's injected block so reviewers check these locations first. A cached
   finding pre-empts re-discovery effort; it never replaces the full-diff review.
   WRITES (buffered to run record, flushed at run end): findings that recurred this run,
   keyed by `file` + `pattern`, with `severity`. `file` MUST be stored repo-RELATIVE
   (strip the repoRoot prefix) — never an absolute path, which would leak `$HOME`/username
   into the committed store. Per ADR-123 whitelist: no provenance refs, no code snippets,
   no prose explanation body, no PII.

## Procedure (default body — a manifest `override:` replaces everything below)

1. **Round 1 — full scope:** fan out **exactly `phase.harness.reviewPlan.passes`
   read-only craft:reviewer per dimension in parallel (one message,
   `dimensions.length × reviewPlan.passes` spawns)**. This count is engine-emitted and
   binding — the walk MUST spawn exactly that many reviewers per dimension, no more, no
   fewer. Each carries: its dimension + definition; the working directory; the diff scope;
   the design doc path (if any); global + review-phase `context:` files verbatim. Perf
   calibrates to the diff — zero findings legitimate. Tests dimension: do NOT run the executing-harness techniques (a dedicated phase owns
   it) — but suspected-benign harness findings MAY be flagged as advisory notes (keep
   them for the validation phase).
2. **Normalize findings:** before applying, pipe each reviewer's raw output through
   `node "${CRAFT_ROOT:-${CLAUDE_PLUGIN_ROOT}}/engine/bin/normalize-findings.js"` to obtain a
   canonical `Finding[]` (`{file, line, severity, finding, fix?, status?}`). Key on these
   fields — never on whether the reviewer emitted a JSON array or a per-line list.
3. **Fixes — session-owned:** the **actionable set** is `status ∈ {absent, VERIFIED,
   SUSPECT, PROBE}` — engage each of these exactly as today (apply the fix, or
   investigate and either fix it or record it as RULED-OUT). **`RULED-OUT` is
   record-only:** write it to the run record as "examined, not a defect" and drop it
   from the fix set. Apply every accepted actionable finding yourself, batched per
   dimension; each batch gates on the targeted checks (`gates.part` over touched
   files) + `gates.review-batch` before its conventional commit (e.g.
   `refactor(<scope>): apply code-review fixes`); `gates.phase` after the round.
4. **Converge per dimension, up to `max_cycles` cycles** (default 3), per
   `phase.harness.reviewPlan.stop_rule` (engine-emitted, binding). Both rules below
   count only **actionable** findings (Step 3) — a `RULED-OUT` record never blocks
   convergence:
   - `low-only` → converged once only LOW-severity actionable findings remain; NO relaunch.
   - `none` → no convergence loop; single pass only.
   - `non-low-count<=<n>` → stop when the count of remaining non-LOW actionable findings
     (severity ≥ MEDIUM, off the normalized `Finding[]`) is ≤ n. The threshold n is
     read directly from the rule string — no re-derivation.
   MEDIUM+ → fresh reviewer scoped to the FIX DELTA only (prior findings + fix
   commits' diff; mission: verify resolutions + review the fix diff). The prior-findings
   payload carries `RULED-OUT` records too, labelled: do not re-raise a RULED-OUT claim
   unless the fix diff reintroduces the condition. This threaded payload is a **bounded,
   status-tagged findings-state, never an accumulated transcript**. Fresh agent each
   cycle — never continue a reviewer.
5. **Security gate:** HIGH/CRITICAL security findings — show the user the fix diff
   BEFORE committing. Everything else: fix-all-then-converge, no user round-trip.
6. Record per-dimension outcomes in the run record.
