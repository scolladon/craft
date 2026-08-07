# 344 — `review-waste` evidence keeps mirroring its `reviewCycles` entry

- **Status:** accepted
- **Date:** 2026-08-07
- **Design:** docs/contributing/design/harness-hygiene-followups.md · **Supersedes/Refines:** refines ADR-343

## Context

ADR-343 moves the `review-waste` filter off `cycles` and onto `billedTurns`. That leaves
`evidence.cycles` in the emitted payload as a field the filter no longer reads, raising
the question of whether it should still be emitted.

`docs/contributing/specs/telemetry.md` documents `evidence` as mirroring its
`reviewCycles` entry exactly. Both fields are already present in that entry.

## Options considered

1. **Keep both `cycles` and `billedTurns`** — pros: preserves the documented mirror; a
   reader can still see why a low-cycle review was flagged / cons: emits a field the
   filter does not read. *(designer's recommendation)*
2. **Drop `cycles`, emit only the axis that fired** — pros: leaner payload, no unread
   field / cons: breaks the spec's "mirrors its `reviewCycles` entry exactly" contract,
   and removes the context that makes a `cycles: 4` flag legible.
3. **Keep both and add a `firedOn` discriminator** — pros: explicit about which axis
   selected the entry / cons: its only consumer would be prose that `detail` already
   carries.

## Decision

`evidence` continues to mirror its `reviewCycles` entry exactly:
`{ role, cycles, billedTurns, totalCost, maxCost, meanCost }`. No key is added or removed.

The rule: `evidence` is a **mirror of the source entry, not a justification of the
filter**. A field earns its place in `evidence` by being part of the entry the
recommendation points at, not by being read by the predicate that selected it. A future
axis change therefore never changes the `evidence` shape.

## Consequences

- Only `detail` prose changes in `reviewWasteRecs`; the `evidence` object is untouched.
- Structured consumers of `review-waste` are unaffected by ADR-343 — the emitted-shape
  change is confined to a human-readable string.
- `cycles` stays computed in `buildReviewCycles`; nothing downstream may assume the
  selector and the emitted fields coincide.
