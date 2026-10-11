---
subjects:
  - engine/src/observability/usage-aggregate.js
---
# 459 — One pure export formats the compaction estimate line

- **Status:** accepted
- **Date:** 2026-10-11
- **Design:** docs/contributing/design/compaction-estimate-at-done.md · **Supersedes/Refines:** none

## Context

The fold and the formatter are private to `usage-aggregate.js`.

## Options considered

1. **A new export `formatCompactionEstimateLine(compactions)` returning a string or null** *(recommended)* — pros: one export, fold stays private, wording identical to the report by construction
2. **Export both private helpers** — cons: two exports and composition pushed to the caller
3. **Run `aggregate` + `renderMarkdown` and extract the line** — cons: no line when there are no events; needs a price table

## Decision

Option 1 — adopted-as-recommended (no user judgment): smallest surface, single formatter (DRY).

## Consequences

- `renderMarkdown` and emit-metrics share one formatter.
