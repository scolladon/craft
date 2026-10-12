---
subjects:
  - engine/test/findings.test.js
  - engine/test/model-class-shape.test.js
  - engine/test/normalize-findings-bin.test.js
  - engine/test/telemetry-claude.test.js
---
# 492 — Tests cite no review id that shipped code no longer carries

- **Status:** accepted
- **Date:** 2026-10-12
- **Design:** docs/contributing/design/provenance-sweep-part-two.md · **Supersedes/Refines:** refines ADR-489

## Context

ADR-489 strips `R10` and `F6` from shipped code. Seven test lines cite them (`R10` ×6 across
`engine/test/findings.test.js`, `engine/test/model-class-shape.test.js` and
`engine/test/normalize-findings-bin.test.js`; `F6` ×1 in `engine/test/telemetry-claude.test.js`).
`engine/test` holds 25 single-letter `R`/`F`/`T` ids in all; the class-E test-tree scan
(ADR-490) does not match them.

## Options considered

1. **Leave every test id** — cons: seven tests cite ids with no shipped anchor
2. **Reword the seven twins only** *(recommended)* — pros: no test cites a stripped id; one 4-file part / cons: 18 other ids remain
3. **Reword all 25** — cons: outside the backlog entries' scope; two more parts

## Decision

Option 2 — ratified by the user. The seven lines citing `R10` or `F6` say what they pin without
the id. Other test-side single-letter ids stay, and `R1`–`R3` remain rule names in
`test/architecture-boundaries.test.js`. No rule is added.

## Consequences

The remaining 18 test-side ids are unguarded and untouched.
