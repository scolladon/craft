---
name: review
description: Forge phase 6 - parallel multi-dimension review with per-dimension convergence; the session applies every fix. Also useful standalone on any branch.
---

# forge:review

## Preamble (always runs — non-overridable)

1. Manifest read (lint if standalone). Standalone: scope = current branch vs default
   branch; establish global-context preconditions (checkout root).
2. Probe harness knobs from `phase.harness` (the resolved descriptor the orchestrator
   holds for this phase), each with a strong fallback when the knob is absent:
   `dimensions` (default `code, security, tests, perf` — a repo `context:` may refine
   their definitions); `passes` = reviewers per dimension (default `1`); `max_cycles`
   (default `3`); `convergence` (default `low-only`). Gates as in implementation's
   preamble; `gates.review-batch` optional extra.

## Procedure (default body — a manifest `override:` replaces everything below)

1. **Round 1 — full scope:** fan out `passes` read-only **forge:reviewer** per dimension
   in parallel (one message, N×`passes` spawns). Each carries: its dimension + definition; the
   working directory; the diff scope; the design doc path (if any); global +
   review-phase `context:` files verbatim. Perf calibrates to the diff — zero findings
   legitimate. Tests dimension: no mutation analysis, but suspected-equivalent mutants
   MAY be flagged as advisory notes (keep them for the validation phase).
2. **Normalize findings:** before applying, pipe each reviewer's raw output through
   `node "${CLAUDE_PLUGIN_ROOT}/engine/bin/normalize-findings.js"` to obtain a
   canonical `Finding[]` (`{file, line, severity, finding, fix?}`). Key on these
   fields — never on whether the reviewer emitted a JSON array or a per-line list.
3. **Fixes — session-owned:** apply every accepted finding yourself, batched per
   dimension; each batch gates on the targeted checks (`gates.slice` over touched
   files) + `gates.review-batch` before its conventional commit (e.g.
   `refactor(<scope>): apply code-review fixes`); `gates.phase` after the round.
4. **Converge per dimension, up to `max_cycles` cycles** (default 3), per `convergence`:
   `low-only` → converged once only LOW remains, NO relaunch; `none` → no convergence
   loop, single pass; `<n>` (numeric ≥0) → stop when remaining findings ≤ n. MEDIUM+ →
   fresh reviewer scoped to the FIX DELTA only (prior findings + fix commits' diff;
   mission: verify resolutions + review the fix diff). Fresh agent each cycle — never
   continue a reviewer.
5. **Security gate:** HIGH/CRITICAL security findings — show the user the fix diff
   BEFORE committing. Everything else: fix-all-then-converge, no user round-trip.
6. Record per-dimension outcomes in the run record.

> **Harness-knob fidelity (parked, not a silent cap):** `passes > 1` (multiple reviewers
> per dimension) and a numeric `convergence: <n>` are honored by the session as
> self-directed constraints — the engine validates and carries them on the descriptor,
> but the multi-reviewer fan-out and arbitrary-threshold stopping are walk judgment, not
> engine-enforced in P8.
