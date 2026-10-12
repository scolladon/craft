---
subjects:
  - engine/src/cli-io.js
---
# 487 — cli-io.js is the single home of the shared lint predicates

- **Status:** accepted
- **Date:** 2026-10-12
- **Design:** docs/contributing/design/backlog-sweep-six-entries.md · **Supersedes/Refines:** none

## Context

`isRegularFile`, `isDirectoryPath` and `isNonEmptyString` are re-implemented across the lint
mains and `intention.js`. `intention.js` is documented as pure; `cli-io.js` imports
`node:fs` at module scope and calls it only inside function bodies.

## Options considered

1. **`cli-io.js` for all three** *(recommended)* — pros: one home / cons: `intention.js` gains an import edge to an fs-importing module
2. fs predicates in `cli-io.js`, `isNonEmptyString` in a new pure module — cons: a module and suite for one three-line function
3. Keep the `isNonEmptyString` copies — cons: the dedupe stays half-done

## Decision

Option 1 — ratified by the user. The three predicates are exported from `cli-io.js` and every
local copy is deleted. `isNonSymlinkFile` (lstat on purpose) and the list-form predicates
stay where they are, since they differ.

## Consequences

`intention.js` stays free of I/O calls but no longer has a pure import graph.
