---
subjects:
  - test/helpers
---
# 473 — Region boundaries are RegExps or named sentinels

- **Status:** accepted
- **Date:** 2026-10-11
- **Design:** docs/contributing/design/centralise-region-slicer.md · **Supersedes/Refines:** none

## Context

Thirteen call sites spelled "from the top" or "to the end" as `null`. The run-record slicer
tested the end pattern for truthiness, so an omitted or `undefined` end also sliced to the
end of the file without failing, the widening the fail-loud rule exists to stop.

## Options considered

1. **Exported Symbol sentinels** `FROM_TOP` / `TO_END`; any other non-RegExp boundary throws `TypeError` *(recommended)*
2. **Keep `null`** — cons: an omitted argument needs a separate arity check to stay fail-loud
3. **Separate entry points** per open boundary — cons: 4–6 functions once crossed with the two shapes

## Decision

Option 1 — ratified by the user. Slicing to the end is a stated choice at the call site,
never a missing value.

## Consequences

- A boundary pattern given but not found fails the assertion; a boundary of the wrong type
  (`null`, `undefined`, omitted) throws `TypeError`.
