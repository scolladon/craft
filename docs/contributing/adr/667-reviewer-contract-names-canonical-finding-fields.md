---
subjects:
  - contracts/harness-read.md
  - engine/src/findings.js
supersedes: []
---
# 667 — The reviewer contract names the canonical finding fields

- **Status:** accepted — ratified by the user
- **Date:** 2026-10-21
- **Design:** docs/contributing/design/reviewer-findings-shape-mismatch.md · **Supersedes/Refines:** none

## Context

`contracts/harness-read.md` told reviewers to report each finding as
`{ file:line, severity, finding, suggested fix, status? }`. `normalize-findings` requires the
canonical keys `file`, `line`, `severity` and `finding`, so a reviewer that follows the contract
literally and emits a JSON array makes the bin exit 2 with "missing required field: file".

## Options considered

1. **Align the contract to the canonical shape** *(recommended)* — pros: removes the only
   source of the legacy shape; no new parser surface; a test pins the contract's field set to
   the parser / cons: a model that emits the legacy shape out of habit still exits 2
2. **Teach `normalizeFindings` the `file:line` and `suggested fix` aliases** — pros: legacy
   output parses / cons: two vocabularies stay valid indefinitely; new fail-loud rules for
   conflicts and malformed values
3. **Both** — pros: closes the residual of option 1 / cons: the most code, and keeps option 2's
   second vocabulary

## Decision

Ratified by the user: option 1. The contract lists `{ file, line, severity, finding, fix?,
status? }`; `engine/src/findings.js` is unchanged. A test reads the live contract's field set and
runs a contract-shaped array through `normalize-findings`, so the two cannot drift apart again.

## Consequences

The parser keeps one vocabulary. Legacy-shaped JSON output still exits 2 and goes to the
consumer's existing malformed-output route.
