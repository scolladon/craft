# 183 — Pricing table lives in the claude binding with a --prices override

- **Status:** accepted
- **Date:** 2026-06-28
- **Design:** docs/design/usage-telemetry-miner.md · **Refines:** 182

## Context

The miner reports cost in two forms: priced (from a per-model-id table) and relative
units (when prices are absent). Per-model prices are vendor data tied to Claude model
ids (`claude-opus-4-8`, `claude-sonnet-4-6`, …), so where the table lives is bounded by
the same hexagonal boundary as the parse binding (ADR-182), and it must be kept current.

## Options considered

1. **Binding data module + `--prices` override** — `engine/src/pricing-claude.js` holds
   the default table with a `PRICES_AS_OF` staleness marker, pinned from the `claude-api`
   skill; a `--prices <file>` flag overrides at runtime; a model id absent from the table
   degrades to relative units, never a crash. **(recommended)**
2. **External `prices.json`** — prices in a committed data file. Cons: adds a
   load+validate path and a second thing to keep in sync.
3. **Core constant** — pricing in the pure core. Cons: puts vendor model ids in
   `engine/src` core, violating ADR-182 and source hygiene.

## Decision

The default price table lives in the **claude binding** (`pricing-claude.js`) as data,
marked with `PRICES_AS_OF` and sourced from the `claude-api` skill. A `--prices <file>`
flag overrides it. A missing model id yields relative units, not a failure. The core
never sees a model id or a price — it receives resolved per-event cost (or a
relative-unit signal) from the binding.

## Consequences

Keeping prices current is a binding-data edit (bump `PRICES_AS_OF` + the table), linkable
to the `claude-api` skill. The core stays vendor-neutral and the missing-price path keeps
the miner advisory (no crash on an unknown model). cacheRead/cacheWrite multipliers live
beside the base table.
