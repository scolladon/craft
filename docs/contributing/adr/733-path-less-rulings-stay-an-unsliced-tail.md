---
subjects:
  - docs/contributing/RULINGS.md
  - engine/src/rulings.js
---
# 733 — Path-less rulings stay an unsliced tail

- **Status:** accepted
- **Date:** 2026-11-20
- **Design:** docs/contributing/design/doctrine-register.md · **Supersedes/Refines:** none

## Context

345 of the 702 live ADRs carry no `subjects`, so their register lines have no paths and cannot be sliced. Backfilling from the commit that added each ADR was measured: median 19 paths per ADR, and a touch to `scripts/ci.sh` would slice in 197 lines, against a spike median of 6.

## Options considered

1. **Keep them as `[]` lines the hint never slices; the hint prints their count and the register path; a decisions phase may add paths when a ruling touches one** *(recommended)* — pros: no regression, those ADRs are outside today's slice too / cons: half the corpus is reached only by search.
2. **Backfill paths from the commit that added each ADR** — cons: measured noise.
3. **Backfill by agents reading the ADRs** — cons: an agent reads the corpus, which the change forbids.

## Decision

**adopted-as-recommended (no user judgment)** — DOCTRINE(D-14). Option 1: the measurement picked the route.

## Consequences

- Paths accrue on old lines only as decisions touch them.
