---
subjects:
  - engine/src/observability/metrics-line.js
---
# 369 — equiv weights are fixed constants, never price-derived

- **Status:** accepted
- **Date:** 2026-09-20
- **Design:** docs/contributing/design/shrink-agent-context-cost.md · **Supersedes/Refines:** refines ADR-331

## Context

The ledger row gains an `equiv` column expressing one comparable cost number per phase. The
weights were given in the brief: cache-read x0.1, cache-write x1.25, output x5, input x1. The
question is whether they stay constants or become a function of the price table.

## Options considered

1. **Named constants, model-independent** (recommended) — pros: rows stay comparable forever /
   cons: `equiv` is not model-accurate.
2. **Derived per row from the `--prices` table** — pros: model-accurate / cons: a value that
   changes with a price table makes every row incomparable to every other row.
3. **No `equiv` column** — cons: fails acceptance.

## Decision

`equiv` is computed from fixed named constants. The ledger is append-only and a format change
is a hard comparison boundary, so these weights are effectively permanent; a price-varying
weight would silently destroy the one property the column exists to provide.

This mirrors the split the aggregate already draws between a relative cost axis and a priced
one: the relative axis is deliberately price-free, and model-accurate costing already exists
as the priced figure.

Recorded as **adopted-as-recommended (no user judgment)**: the weights were fixed in the brief
and the alternatives are foreclosed by the append-only ledger.

## Consequences

- Rows remain comparable across models and across price changes.
- `equiv` must be documented as a relative unit, not a currency figure.
- Changing a weight later is a format change and needs its own boundary marker.
