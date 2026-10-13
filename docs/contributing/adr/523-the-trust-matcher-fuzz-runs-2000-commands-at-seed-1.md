---
subjects:
  - adapters/codex/test/hook-trust-differential.test.js
supersedes: []
---
# 523 — The trust-matcher fuzz runs 2000 generated commands at seed 1

- **Status:** accepted — adopted-as-recommended (no user judgment)
- **Date:** 2026-10-13
- **Design:** docs/contributing/design/codex-trust-matcher-differential-fuzz.md · **Supersedes/Refines:** none

## Context

The fuzz runs inside the per-part gate (`npm --prefix adapters/codex test`, 1.04 s today), so its cap trades detection for gate time. Measured: at seed 1, cap 2000 yields 74 trusted commands, 296 shell runs and a 1.28 s gate; every one of eleven single-rule reverts of the matcher is caught.

## Options considered

1. **Cap 2000, seed 1** *(recommended)* — pros: kills all eleven reverts; gate +0.24 s / cons: the weakest class (`$` in a bare word) is first caught at index 1449
2. **Cap 3000, seed 1** — pros: more headroom / cons: gate wall about 2.0 s
3. **Cap 1000** — pros: fastest / cons: misses the bare-`$` revert at seed 1

## Decision

Adopted-as-recommended (no user judgment): option 1. `SEED` and `CAP` are named constants. If the committed generator's draw order shifts the kill indices, keep the cap and pick the smallest seed that kills all eleven reverts. Aligns with the brief's "fast enough for the per-part gate".

## Consequences

The eleven-revert table is a guaranteed floor at the committed `(SEED, CAP)`, not a bound on unknown classes.
