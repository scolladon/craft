# 064 — Per-invocation `--harness` flag re-parked (precondition unmet)

- **Status:** accepted
- **Date:** 2026-06-18
- **Design:** docs/DESIGN-P12-dx.md · **Supersedes/Refines:** refines the "Parked from P8" routing

## Context

A *Parked from P8* backlog item routed a per-invocation `--harness` CLI flag (override a harness knob
without a manifest, à la `--profile`/`--skip` ADR-022) **"to P12 (DX)"** — a per-invocation override
is DX-surface polish. But the same parked note adds a precondition: it is *"best landed **after** the
harness knobs it overrides (`passes>1`, numeric `convergence`) are actually engine-enforced."* Those
knobs are still **walk-judgment**, not engine-enforced (the validator accepts them and the descriptor
carries them, but the N-reviewers-per-dimension fan-out and the arbitrary-threshold stop rule are
session-honored, per the other Parked-from-P8 items). So at P12 the precondition is unmet. Does P12
implement the flag or re-park it?

## Options considered

1. **Re-park** — P12 = the PRD §17 DX *docs* scope (mental model + catalog + samples); the `--harness`
   flag rides with the later walk/parallelism pass that makes `passes>1`/`convergence` engine-enforced.
   pros: honors the parked note's own "best landed after" guidance; avoids shipping a flag that
   overrides knobs the engine doesn't yet enforce (low value, confusing). *(chosen)*
2. **Implement now** — add the flag at P12 anyway (a `cli-overlay.js`-style dotted-path
   `phases.<id>.harness.<knob>` overlay with type coercion). cons: lets a user override a knob whose
   effect is still session-judgment, not an engine invariant; contradicts the parked precondition;
   expands P12 from docs into engine/CLI code.

## Decision

The `--harness` flag is **re-parked**. P12 ships the DX documentation surface only; the flag lands
with the future walk/parallelism pass that enforces `passes>1` and numeric `convergence`. The guide
documents the *manifest* form of harness config (point #6, [`examples/review-harness/`]) and the
existing per-invocation flags (`--profile`, `--skip`); it does not promise a `--harness` flag.

## Consequences

- No engine/CLI change in P12 — the phase stays docs-only (`docs/`, `examples/`, `test/`, READMEs,
  `BACKLOG.md`).
- `BACKLOG.md` keeps the item parked, re-pointed from "P12" to the walk/parallelism pass with this
  rationale, so the trail is explicit (cf. [[045-no-forge-era-migration-support]] recording a scope
  decision rather than a change).
- When `passes`/`convergence` become engine-enforced, the flag is a bounded follow-up reusing the
  `--profile`/`--skip` overlay pattern.
