# 043 — Review cadence: single `review` phase is canonical

- **Status:** accepted
- **Date:** 2026-06-17
- **Design:** docs/DESIGN-P9-hardening.md · **Supersedes/Refines:** none (cross-links Parked-from-P8 walk/parallelism pass)

## Context

The stated working style is "a 4-dimension review after every code slice," but the engine pipeline
models a single `review` phase over the whole change (per-dimension convergence). Nothing in the
skills states which is the canonical cadence, leaving the per-slice interleave an undocumented
discipline that could be mistaken for an engine invariant.

## Options considered

1. **Single phase canonical + working-style note** — the engine cadence is the one `review` phase;
   the per-slice interleave is a documented session working-style (home: run/SKILL.md), cross-linked
   to the Parked-from-P8 walk/parallelism pass. No code change. *(designer's recommendation; chosen)*
2. **`review.cadence` harness knob** — model per-slice as a run/harness knob (engine + data + walk).
3. **BACKLOG-note only** — record the decision, change no skill prose.

## Decision

The canonical cadence IS the single engine `review` phase. The per-slice 4-dimension review is a
session working-style — a discipline the orchestrator may apply, not an engine invariant. This is
documented in `run/SKILL.md`, cross-linked to the Parked-from-P8 walk/parallelism pass that would
own a real per-slice fan-out knob.

## Consequences

No code behaviour change; the engine's actual cadence is stated honestly. Modeling per-slice review
as a first-class knob is explicitly deferred to the parallelism pass (where `passes>1` and numeric
`convergence` enforcement also live), so this batch does not grow the run/harness surface.
