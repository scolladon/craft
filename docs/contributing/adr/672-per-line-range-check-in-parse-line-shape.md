---
subjects:
  - engine/src/findings.js
supersedes: []
---
# 672 — The per-line range check runs where per-line errors are thrown, not in parseLine

- **Status:** accepted — adopted-as-recommended (no user judgment)
- **Date:** 2026-10-21
- **Design:** docs/contributing/design/per-line-over-range-line.md · **Supersedes/Refines:** none

## Context

`parseLine` returns `Finding | null`, null meaning no-match; the throwing loop owns every
per-line error and holds the truncated `shown` echo. A distinct range error cannot travel through
a bare null.

## Options considered

1. **Check `finding.line` in the throwing per-line loop, after the no-match check** *(recommended)*
   — pros: `parseLine` and `toFinding` untouched; `shown` already in scope / cons: the check runs
   on an already-built finding
2. **`parseLine` returns a tagged result** — pros: one place decides / cons: widens a contract for
   one case
3. **`parseLine` returns null** — pros: no new code path / cons: only yields the no-match message,
   which ADR-671 rejects

## Decision

Adopted-as-recommended (no user judgment): option 1. Check order per record: character cap, then
no-match, then range. The per-line checks move into one per-record helper so the loop stays under
the 20-line function limit.

## Consequences

`parseLine` keeps its contract. A record that is both unparseable and over-range reports no-match.
