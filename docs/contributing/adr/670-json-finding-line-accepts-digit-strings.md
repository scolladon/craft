---
subjects:
  - engine/src/findings.js
supersedes: []
---
# 670 — A JSON finding line accepts integers and digit strings

- **Status:** accepted — adopted-as-recommended (no user judgment)
- **Date:** 2026-10-21
- **Design:** docs/contributing/design/normalize-findings-silent-field-loss.md · **Supersedes/Refines:** none

## Context

`toFinding` applies `Number()` to the raw `line`, so `"12x"` becomes `NaN` (serialized as `null`)
and `null`, `""`, `true` become `0` or `1`, all with exit 0.

## Options considered

1. **Safe non-negative integer, or a string matching the per-line `\d+` grammar** *(recommended)* —
   pros: `"12"` keeps normalizing as it does today; JSON accepts the same line digits as per-line /
   cons: the JSON type is looser than a strict integer
2. **Safe non-negative integer only** — pros: strict typed contract / cons: rejects `"12"`, which
   exits 0 with the right value today

## Decision

Adopted-as-recommended (no user judgment): option 1. Anything else throws
`Finding at index N has an invalid line: expected a non-negative safe integer, as a number or a digit string`, without
echoing the value.

## Consequences

No JSON `line` value is coerced into a wrong number. `line: 0` stays valid, matching the per-line path.
