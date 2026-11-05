---
subjects:
  - evals/decisions-adopts-covered-tradeoff/
supersedes: []
---
# 729 — The covered-trade-off eval pairs byte-for-byte with decisions-escalates-fork

- **Status:** accepted
- **Date:** 2026-11-05
- **Design:** docs/contributing/design/decisions-doctrine-layer.md · **Supersedes/Refines:** none

## Context

ADR-433 noted the clear-aligned-but-trade-off case had no eval. Under ADR-727 such a candidate is adopted when an ADR or doctrine entry covers it.

## Options considered

1. **A new case whose design file is byte-identical to `decisions-escalates-fork`'s, adding `DOCTRINE.md` D-1 and evidence ADR-002** *(recommended)* — pros: the doctrine is the only variable between the pair / cons: one more paid case.
2. **An aligning ADR only** — cons: measures the same path as noop-when-clear.
3. **Both** — cons: a paid case that measures nothing new.

## Decision

**adopted-as-recommended (no user judgment)** — no trade-off. `evals/decisions-adopts-covered-tradeoff/` copies `decisions-escalates-fork`, adds `docs/DOCTRINE.md` (D-1) and ADR-002, and grades that the reply adopts without asking and cites `DOCTRINE(D-1)`. It runs locally as a maintainer smoke, never in CI.

## Consequences

- The fork case stays the anti-vanity half: its trade-off is uncovered, so it still escalates.
