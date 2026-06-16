---
name: review
description: Forge phase 6 - parallel multi-dimension review with per-dimension convergence; the session applies every fix. Also useful standalone on any branch.
---

# forge:review

## Preamble (always runs — non-overridable)

1. Manifest read (lint if standalone). Standalone: scope = current branch vs default
   branch; establish global-context preconditions (checkout root).
2. Probe: dimensions = code, security, tests, perf (a repo `context:` may refine their
   definitions); gates as in implementation's preamble; `gates.review-batch` optional extra.

## Procedure (default body — a manifest `override:` replaces everything below)

1. **Round 1 — full scope:** fan out one read-only **forge:reviewer** per dimension in
   parallel (one message, N spawns). Each carries: its dimension + definition; the
   working directory; the diff scope; the design doc path (if any); global +
   review-phase `context:` files verbatim. Perf calibrates to the diff — zero findings
   legitimate. Tests dimension: no mutation analysis, but suspected-equivalent mutants
   MAY be flagged as advisory notes (keep them for the validation phase).
2. **Fixes — session-owned:** apply every accepted finding yourself, batched per
   dimension; each batch gates on the targeted checks (`gates.slice` over touched
   files) + `gates.review-batch` before its conventional commit (e.g.
   `refactor(<scope>): apply code-review fixes`); `gates.phase` after the round.
3. **Converge per dimension, ≤3 cycles:** LOW-only → converged once fixed, NO
   relaunch. MEDIUM+ → fresh reviewer scoped to the FIX DELTA only (prior findings +
   fix commits' diff; mission: verify resolutions + review the fix diff). Fresh agent
   each cycle — never continue a reviewer.
4. **Security gate:** HIGH/CRITICAL security findings — show the user the fix diff
   BEFORE committing. Everything else: fix-all-then-converge, no user round-trip.
5. Record per-dimension outcomes in the run record.
