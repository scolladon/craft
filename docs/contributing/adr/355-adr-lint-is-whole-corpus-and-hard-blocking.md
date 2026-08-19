---
subjects:
  - scripts/adr-lint.sh
  - scripts/ci.sh
---
# 355 — `adr-lint` is whole-corpus and hard-blocking

- **Status:** accepted
- **Date:** 2026-08-18
- **Design:** docs/contributing/design/decision-drift-propagation.md · **Supersedes/Refines:** none

## Context

The lint family has two shapes: structural lints run whole-corpus and hard-block; hygiene lints
run over the touched diff and honour the `hygiene.gate` knob, advisory by default. `adr-lint`
has to pick one, against a corpus of 350 files that declare nothing.

## Options considered

1. **Whole-corpus, hard-blocking**, joining the `design-lint` loop — pros: a supersession is
   re-checked on every run / cons: a whole-corpus pass on every CI run. *(designer's
   recommendation)*
2. **Touched-diff scoped, honouring `hygiene.gate`** — pros: smallest blast radius / cons: a
   target's `Status:` can regress, or a live citation of a superseded ADR can land, in any run
   that does not touch those files; also forces a fourth new token.
3. **Whole-corpus but advisory-only** — pros: full coverage, no wedge risk / cons: reproduces
   today's state, where ADR-348 was correct only because a human was careful.

## Decision

Option 1, **ratified by the user**. `bash scripts/adr-lint.sh <adr-dir>` joins the existing
`&&` chain in `ci.sh` after the `design-lint` loop. No `hygiene.gate` knob: a superseded
decision left un-propagated is a correctness fact about the decision log, not a style smell.

## Consequences

Legacy-greenness must be **structural**, not incidental: C1–C3 fire only on a declaration no
legacy ADR carries and C0 fires only on a fence no legacy ADR has, so all 350 pass with the
checks *not firing* — which survives any later re-scoping of `ci.sh`. Runtime cost is one
`git grep` pass per superseding ADR, one today; zero superseding ADRs spawns no process at all.
This choice also holds the new-token count at three rather than four.
