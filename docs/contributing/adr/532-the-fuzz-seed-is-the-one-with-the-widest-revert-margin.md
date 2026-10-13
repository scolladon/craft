---
subjects:
  - adapters/codex/test/hook-trust-differential.test.js
supersedes: []
---
# 532 — The fuzz seed is the one with the widest revert margin

- **Status:** accepted — adopted in review (no user judgment)
- **Date:** 2026-10-13
- **Design:** docs/contributing/design/codex-trust-matcher-differential-fuzz.md · **Supersedes/Refines:** refines ADR-523

## Context

ADR-523 picks the smallest seed that kills all eleven single-rule matcher reverts. Review showed that rule can land on a seed where a revert dies to exactly one case, so a small table edit can let it survive unnoticed: after the generator fix, seeds 1, 3, 6, 7 and 8 kill all eleven, and seed 1 kills two of them with one case each.

## Options considered

1. **Among seeds 1-8 at `CAP = 2000`, the one whose weakest revert has the most failing cases** *(recommended)* — pros: the largest guaranteed margin at the same gate cost / cons: the seed is chosen by measurement, not by order
2. **The smallest seed that kills all eleven (ADR-523 as written)** — cons: margin of one case

## Decision

Adopted in review (no user judgment): option 1. `SEED = 6`: every revert dies to at least 4 cases, 65 commands are trusted, and `ACCEPTED_FLOOR = 52`. `CAP` stays 2000 (ADR-523).

## Consequences

A table edit or a change in draw order re-runs the eleven-revert sweep over seeds 1-8 before the seed is kept.
