---
subjects:
  - adapters/codex/test/hook-trust-differential.test.js
supersedes: []
---
# 526 — The trust-matcher fuzz mixes grammar builds and seed mutation

- **Status:** accepted — adopted-as-recommended (no user judgment)
- **Date:** 2026-10-13
- **Design:** docs/contributing/design/codex-trust-matcher-differential-fuzz.md · **Supersedes/Refines:** none

## Context

A uniform alphabet search almost never yields a trusted command, so most draws would never reach a shell. Measured kills out of eleven reverts, seeds 1-4: grammar plus mutation 11/11/10/10; grammar only 10/11/10/10; mutation only 6/7/6/6.

## Options considered

1. **Grammar fragments plus operand-only mutation of the fixed cases, 50/50** *(recommended)* — pros: the only mix that kills all eleven at seed 1
2. **Grammar only** — cons: misses the bare-`$` revert at seed 1
3. **Mutation only** — cons: cannot reach new interpreters or leading words

## Decision

Adopted-as-recommended (no user judgment): option 1. The interpreter and the path placeholders are never mutated: they come from a fixed table whose trusted entries must exist on disk, so a generator bug fails as a bug, not as a false differential.

## Consequences

The fragment tables may grow, never shrink, without re-measuring.
