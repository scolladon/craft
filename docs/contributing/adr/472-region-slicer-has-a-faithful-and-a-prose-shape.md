---
subjects:
  - test/helpers
---
# 472 — The region slicer has a faithful and a prose shape

- **Status:** accepted
- **Date:** 2026-10-11
- **Design:** docs/contributing/design/centralise-region-slicer.md · **Supersedes/Refines:** none

## Context

Four process suites sliced markdown regions with their own helpers, joined with `' '` or
`'\n'`. Run against all four suites, no single output shape keeps them green: the Sources
bullet count needs line anchors (`'\n'`), the run-record and model-retry pins need
word-wrapped, indented prose to match as one phrase (normalised whitespace).

## Options considered

1. **Two functions over one core**: `sliceRegion` returns the `'\n'`-joined slice; `sliceProse` normalises it *(recommended)*
2. **Named option** `{ join: 'prose' | 'lines' }` — cons: a mode flag passed as a string
3. **Return lines**, each call site joins — cons: re-duplicates the join across 38 sites

## Decision

Option 1 — ratified by the user. Each call site names the shape it relies on; the
boundary logic exists once.

## Consequences

- `run-record.test.js` moves from a plain `' '` join to the normalised shape; its 49 tests
  stay green unchanged.
- `model-retry-token.test.js` imports `normaliseWhitespace` from the helper instead of
  defining its own.
