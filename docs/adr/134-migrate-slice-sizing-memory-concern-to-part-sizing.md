# 134 — The `slice-sizing` memory concern is migrated to `part-sizing`, committed data included

- **Status:** accepted
- **Date:** 2026-06-22
- **Design:** docs/DESIGN-P24-rename-slice-vocabulary.md · **Supersedes/Refines:** none

## Context

The repo-local memory store carries a machine-maintained concern key `slice-sizing` (and a
gate-cmd entry keyed `phase: slice`), defined in `engine/src/memory.js` and exercised by
`engine/test/memory.test.js`, with stored entries committed in `.claude/craft-memory.md`. It is
an internal datum, invisible to plan authors. On its own a freeze would be defensible, but ADR 135
chose to sweep every craft-vocabulary "slice" to a globally clean grep — which voids the freeze
premise for this internal key.

## Options considered

1. **Freeze** *(designer recommendation, premised on a frozen-history boundary)* — pros: no data migration; no count-drift risk. Cons: leaves "slice" alive in internal data, contradicting the globally-clean-grep goal of ADR 135.
2. **Migrate** *(user choice)* — pros: no surviving "slice" token anywhere in craft vocabulary, internal data included; consistent with ADR 135. Cons: a data migration of committed memory entries; `memory.test.js` strings change (must hold the test count).

## Decision

Migrate the concern `slice-sizing` → `part-sizing` and the gate-cmd phase value `slice` → `part`
in `engine/src/memory.js`, its tests, `docs/adapters/memory.md`, and the committed
`.claude/craft-memory.md` entries. The user chose a globally clean grep over data stability,
consistent with ADR 135.

## Consequences

- Stored memory entries are rewritten to the new concern/phase names; no entry is orphaned.
- `memory.test.js` strings flip with no test added or removed (`EXPECTED_TESTS` holds).
- The historical unit name does not survive in internal memory data.
