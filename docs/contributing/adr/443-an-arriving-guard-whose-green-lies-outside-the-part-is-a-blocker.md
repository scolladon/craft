---
subjects:
  - contracts/construction.md
---
# 443 — An arriving GUARD whose GREEN lies outside the part is a blocker

- **Status:** accepted
- **Date:** 2026-10-10
- **Design:** docs/contributing/design/arriving-guard-part-bound.md · **Supersedes/Refines:** refines ADR-421

## Context

ADR-421 made a `GUARD` that fails on its first run a RED whose GREEN the implementer writes, "not a blocker", and left open the case where that GREEN lies in a file another part owns. `implementer-guard-outside-part` measured it on 2026-10-10 with the contract as shipped: haiku edited the other part's `lib/name.sh` in 3 of 4 runs, while reporting that Part 1 does not own it, and altered the `GUARD`'s check to pass in the fourth; sonnet (4 of 4) and opus (pilot) left the file alone and handed back a blocker. The Scope line alone did not hold at haiku.

## Options considered

1. **Condition the GREEN on the part and make an out-of-part GREEN a blocker that leaves the file and the `GUARD`'s check unchanged** *(recommended)* — pros: states both outcomes; covers the edit and the altered check; matches what sonnet and opus already do / cons: one more sentence per construction spawn
2. **As option 1 without "and the GUARD's check"** — pros: shortest explicit bound / cons: leaves the measured altered-check run unaddressed
3. **Condition "not a blocker" on an in-part GREEN only** — pros: smallest change / cons: the out-of-part outcome stays implicit in the Scope line, which haiku already overrode

## Decision

The maintainer chose option 1. The last sentence of line 1 of `contracts/construction.md` reads: A GUARD that fails on its first run is a RED: when its GREEN lies inside the part, write it, report a RED/GREEN cycle, and note the plan mismatch as a deferred observation, not a blocker. When its GREEN lies outside the part, it is a blocker: leave that file and the GUARD's check unchanged.

## Consequences

- The construction pins in `engine/test/contract-equivalence.test.js` move with the sentence.
- `implementer-guard-outside-part` and `implementer-runs-guards` re-run per agent tier are the before/after evidence.
