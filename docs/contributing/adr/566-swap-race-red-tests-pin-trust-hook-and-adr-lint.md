---
subjects:
  - adapters/codex/test/trust-hook.bin.test.js
  - engine/test/bin-entry-swap-race.bin.test.js
---
# 566 — The swap-race tests pin `trust-hook --check` and `adr-lint`, not a sweep

- **Status:** accepted — adopted-as-recommended (no user judgment)
- **Date:** 2026-10-14
- **Design:** docs/contributing/design/entry-guard-symlink-swap-race.md · **Supersedes/Refines:** none

## Context

The race reproduces on every entry, since all 26 call one helper. Engine `*.bin.test.js` files run in every Stryker dry run.

## Options considered

1. **Repoint + unlink on `trust-hook --check` (codex suite) and on `adr-lint` (new `engine/test/bin-entry-swap-race.bin.test.js`)** *(recommended)* — pros: the security-relevant exit plus one engine bin; four spawns.
2. **A race sweep over all 26 entries** — cons: about 52 spawns in every dry run; per-entry wiring is already pinned by the link and importer tests.
3. **trust-hook only** — cons: the engine side unproven.

## Decision

Adopted-as-recommended (no user judgment): option 1. It follows ADR-562 (per-entry pins for adapters) and ADR-560 (the existing link sweep stays the per-bin wiring check).

## Consequences

A future entry that hand-rolls its own guard instead of calling the helper is not caught by the race tests.
