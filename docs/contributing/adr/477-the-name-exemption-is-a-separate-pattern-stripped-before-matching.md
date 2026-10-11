---
subjects:
  - engine/src/stub-lint-main.js
---
# 477 — The name exemption is a separate pattern stripped before matching

- **Status:** accepted
- **Date:** 2026-10-11
- **Design:** docs/contributing/design/stub-lint-ci-self-reference.md · **Supersedes/Refines:** none

## Context

ADR-474's token rule can live in the marker regex itself, in a post-filter, or as its own
pattern.

## Options considered

1. **`OWN_NAME_PATTERN` replaced by a space in `scan`** before `matchAll` *(recommended)* — pros: `MARKERS` / `MARKER_PATTERN` untouched, separately testable / cons: one replace per line
2. Negative lookahead special-cased for `STUB` in `MARKER_PATTERN` — cons: couples the marker list to one exception
3. Post-filter each match by peeking past its index — cons: index arithmetic in a 9-line function

## Decision

Option 1 — adopted-as-recommended (no user judgment). The replacement is a single space,
so line numbers are unchanged and no marker can be glued together.

## Consequences

The ADR-210 marker set and regex stay as ratified.
