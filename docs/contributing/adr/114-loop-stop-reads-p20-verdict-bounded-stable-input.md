# 114 — The loop reads the P20 verdict, is bounded, and threads no per-pass input

- **Status:** accepted
- **Date:** 2026-06-21
- **Design:** docs/DESIGN-P21-loop-recipe.md · **Supersedes/Refines:** none

## Context

Independent of which entry point drives it (ADR-112/113), the loop needs three settled mechanics:
*where doneness comes from*, *how it is bounded*, and *what "re-run against PRD + DoD + config"
means per pass*. These three candidates (the design's DC-3 verdict-source, DC-4 bound, DC-5 input
threading) carry clear recommendations that align with existing craft principles — adopted without
escalation.

## Options considered

- **Doneness source** — (a) read the existing P20 `validation`-phase verdict the run record already
  carries *(chosen)*; (b) re-run gates/mutation in the loop; (c) re-parse acceptance criteria. (b)/(c)
  duplicate and could diverge from craft's authoritative verdict.
- **Bound** — (a) a small, loud iteration bound (`MAX_ITERATIONS`-style count, or `/loop`'s own
  cadence the operator caps) *(chosen)*; (b) wall-clock timeout; (c) both. A count is the simplest
  bound a reader can reason about; timeout is a documented extension.
- **Per-pass input** — (a) stable committed inputs, the worktree evolving under a fixed DoD/manifest
  *(chosen)*; (b) swap a per-pass input file mid-loop; (c) a per-pass fresh brief. craft-pi ignores
  argv (pinned), so there is no per-pass seam without an engine change; `/craft:run` *can* take a
  per-pass brief, but the convergence loop's model is a stable acceptance bar.

## Decision — *adopted-as-recommended (no user judgment)*

1. **Doneness is read, not recomputed.** The loop's stop condition is the P20 `validation` verdict
   craft already produces and records — `verify: DoD met` (done), `verify: … unmet` (not-yet),
   `NO-OP(verify):` (premise violated: a DoD was expected but none resolved). The loop never re-runs
   gates, mutation, or re-parses criteria itself (that would duplicate and could diverge from the
   authoritative verdict, ADR-104/109).
2. **The loop is bounded and loud on exhaustion.** A small iteration bound (a count, default ~5 on
   the headless path; the operator's `/loop` cadence/cap on the canonical path) prevents an infinite
   loop when the DoD never converges. Exhaustion is a first-class, surfaced, non-zero outcome — never
   a silent spin (mirrors craft's "blocker, never spin" floor).
3. **No per-pass input threading.** The loop relies on stable committed inputs (the DoD and config
   the entry point already reads) re-evaluated each pass as the worktree changes. Varying input per
   pass is out of scope (it would need an engine seam craft-pi does not expose); a human-present
   `/craft:run` per-pass-brief cadence is a noted extension, not the recipe's model.

## Consequences

- The loop stays thin: run a pass → read the recorded verdict → stop/continue/halt → bound.
- Idempotency falls out for free: re-running on an already-met change records `verify: DoD met` on
  pass 1 and stops immediately; the worktree is the only state carried between passes
  (artifact-is-the-handoff, extended to the outer level).
- Doneness has a single source of truth (the P20 verdict), so the loop can never disagree with what
  craft itself would report at `propose`.
