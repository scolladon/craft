---
subjects:
  - engine/src/findings.js
  - engine/src/observability/adapters/claude/telemetry.js
  - engine/src/observability/metrics-line.js
  - test/source-hygiene.test.js
---
# 489 — Shipped code carries no single-letter review ids, pinned by a case-sensitive token

- **Status:** accepted
- **Date:** 2026-10-12
- **Design:** docs/contributing/design/provenance-sweep-part-two.md · **Supersedes/Refines:** refines ADR-485

## Context

The class-E provenance test (ADR-485) does not match single-letter ids. Three sit in shipped
comments: `R10` (`engine/src/findings.js:197`) and `F6`
(`engine/src/observability/adapters/claude/telemetry.js:59`) are review ids with no in-repo
definition; `R3` (`engine/src/observability/metrics-line.js:9`) names a rule that
`test/architecture-boundaries.test.js` defines. Case-sensitive, `\b[RTF]\d+\b` hits exactly these
3 lines over the shipped paths; under the scan's `-i` it also hits `scripts/run-ledger.sh:214`
(`-f2-`).

## Options considered

1. **Strip all three, rule with no exceptions** *(recommended)* — pros: class E stays exception-free; the next `F7` turns ci.sh red / cons: a future legitimate `R2`/`T0` in a shipped comment fails closed and must be reworded
2. **Keep R3 as a defined rule name** — pros: keeps the cross-reference token / cons: a definition-site convention, a helper and a file read per row to save one id
3. **Strip R10/F6 only, no rule change** — cons: the next id waits for a manual sweep

## Decision

Option 1 — ratified by the user. `R10` and `F6` are dropped from their comments and the `R3`
comment describes the rule in words. Class E's shipped-code scan adds the token
`(?-i:[RTF]\d+)` — case-sensitive inside the case-insensitive scan — and keeps every other token
of ADR-485's pattern. The test-tree scan does not carry this token.

## Consequences

A capital `R`, `T` or `F` followed by digits as a whole word in shipped code turns ci.sh red.
`R1`–`R3` remain rule names inside `test/architecture-boundaries.test.js`, which is test code.
