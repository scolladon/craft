# 349 — Repaired store confidences are rescaled onto the integer ladder and lifted off the floor

- **Status:** accepted
- **Date:** 2026-08-07
- **Design:** docs/contributing/design/harness-hygiene-followups.md · **Supersedes/Refines:** none

## Context

`.claude/craft-memory.md` has been unparseable YAML since commit `1f7e76f`, so every
`load` since has returned an empty view and no run has been able to refresh an entry.
Repairing the parse (three malformed scalars, two defect classes) is necessary but not
sufficient.

Measured across all 67 entries once the store parses: **none has a confidence above 1.**
45 carry fractional values (0.5, 0.7, 0.8, 0.9) that the engine can never produce — the
model is integer `FLOOR = 0` .. `CEILING = 5` with `STEP = 1`, and `ADDED` starts at 1.
The other 22 sit at exactly `1`.

`DECAYED` subtracts one `STEP` from every entry a run does not re-observe, and evicts at
`FLOOR`. So `survive one decay = 0`: the first successful `save` after the repair would
evict all 67 entries. The repair alone re-arms the wipe it was meant to prevent.

The 22 legal `1`s are a direct artifact of the bug — they sat at the `ADDED` floor only
because `load` could never hand a run the view it needed to refresh them.

## Options considered

1. **Rescale the 45 fractional values to `max(1, min(5, round(v × CEILING)))`, leave the 22
   legal `1`s** — pros: fixes the schema violation; the rescale preserves the author's
   intended ordering (0.5→3, 0.7→4, 0.8→4, 0.9→5) / cons: still loses all of `toolchain`,
   `gate-cmd`, `validation-tool` and 18 of 20 `part-sizing` on the first non-re-observing
   run.
2. **As (1), and lift the 22 legal `1`s to `2`** — pros: the smallest correction that lets
   the decay model start working; all 67 survive their first decay / cons: grants one step
   of confidence no run actually observed. *(designer's recommendation)*
3. **Set all 67 to a single uniform value** — pros: trivially consistent / cons: discards
   the ordering; uniform-high claims corroboration nothing has, uniform-low re-arms the wipe.

## Decision

Both corrections land in the repair:

- The 45 fractional values are rescaled onto the integer ladder by
  `max(1, min(5, round(v × CEILING)))`.
- The 22 entries at exactly `1` are lifted to `2`.

The reasoning to carry forward: **an entry is not charged for a defect in the machinery
that was supposed to refresh it.** Those 22 sat at the `ADDED` floor for the whole window
in which `load` was broken; decaying them out on the first working run would let the bug
claim its own evidence. One `STEP` is the minimum that restores the decay model's ability
to discriminate, and no more.

The fractional values are a data defect from hand-editing, not a signal — the rescale is
chosen because it is the only mapping that preserves their relative ordering.

## Consequences

- All 67 entries survive their first decay, so the store's accumulated content starts
  participating in the confidence model instead of being erased by it.
- Confidences after repair are integers in 2..5; nothing sits at `1`, so a single
  non-observing run cannot evict anything.
- Entries that genuinely no longer hold now decay on the normal schedule rather than
  disappearing all at once — the store will shrink over the next few runs, and that is the
  model working.
- The store schema is unchanged; this is a data repair, not a format change.
- Hand-editing the store remains possible and remains the source of both defect classes;
  ADR-350 addresses the blast radius rather than the practice.
