# 343 — `review-waste` keys on billed turns, not spawn count

- **Status:** accepted
- **Date:** 2026-08-07
- **Design:** docs/contributing/design/harness-hygiene-followups.md · **Supersedes/Refines:** refines ADR-342

## Context

`REVIEW_WASTE_CYCLES = 2` was written when a "cycle" was whatever the miner happened to
count. ADR-342 gave `cycles` a real meaning — distinct sub-agent spawns — and kept
`billedTurns` beside it. The threshold was never revisited against that new meaning.

Measured over the committed baseline (n=16 `reviewCycles` entries, all `role: reviewer`),
`cycles > 2` fires on 15 of 16. A signal that fires 94% of the time carries almost no
information. The baseline is honest data, so which axis and which threshold is an
empirical question, not a matter of taste.

Two structural facts decide it. `cycles` is tightly clustered — 12 of 16 sit in 4..6 — so
no cycles threshold separates cheap reviews from expensive ones without a cliff edge.
`billedTurns` spans 20..278 with one genuine gap at 65 → 112, and correlates with priced
cost at r=0.988 versus `cycles` at r=0.829. The axes also disagree per-run: one entry is
`cycles: 4` (below any useful cycles threshold) with `billedTurns: 112` and $12.45 spent.

## Options considered

1. **Keep `cycles`, raise the threshold 2 → 6** — pros: minimal diff; no emitted-shape
   change; no living-intention obligation / cons: still selects on the weak axis; misses
   the `cycles: 4` / 112-turn / $12.45 review entirely.
2. **Switch to `billedTurns > 85`** — pros: keys on effort, which is what "waste" means;
   fires 4/16 on the four most expensive reviews; 85 sits inside the empty 65 → 112 band
   so any threshold in that band is behaviourally identical / cons: changes the `detail`
   prose, which is a living-intention obligation on the telemetry spec.
   *(designer's recommendation)*
3. **Two-axis AND: `cycles > 4 && billedTurns > 85`** — pros: narrowest fire rate at
   3/16 / cons: strictly worse than (2) — the AND drops exactly the `cycles: 4` /
   112-turn entry, trading the recommendation's most valuable hit for a smaller number.

## Decision

The `review-waste` recommendation keys on **effort, not round count**: the filter is
`billedTurns > REVIEW_WASTE_BILLED_TURNS`, with the constant set to **85**.

The rule for future recalibration: a recommendation threshold is set from the committed
baseline's own distribution, and is placed inside an empty band between clusters rather
than at a percentile. A threshold with no empty band beneath it is a sign the axis is
wrong, not that the number needs tuning.

The constant `REVIEW_WASTE_CYCLES` is renamed to `REVIEW_WASTE_BILLED_TURNS` so the name
states the axis it gates. `cycles` remains computed and emitted (see ADR-344); it is no
longer the selector.

## Consequences

- `engine/src/observability/usage-aggregate.js` changes the exported constant's name and
  value, and `reviewWasteRecs`'s filter and `detail` prose.
- The `detail` string changes shape, so `docs/contributing/specs/telemetry.md` — which
  carries `subjects: ['engine/src/observability/**']` — is a living-intention obligation
  and must be refreshed in this same change.
- Any consumer matching on the old `detail` prose breaks. The `kind` (`review-waste`) and
  the `evidence` keys are unchanged, so structured consumers are unaffected.
- Re-running the miner over a future corpus may move the empty band; the rule above, not
  the number 85, is what carries forward.
