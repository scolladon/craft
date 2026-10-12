---
subjects:
  - test/plugin-structure.test.js
  - test/repo-dod.test.js
  - test/memory-store.test.js
---
# 491 — Root test files are named for their subject, not their phase

- **Status:** accepted
- **Date:** 2026-10-12
- **Design:** docs/contributing/design/provenance-sweep-part-two.md · **Supersedes/Refines:** none

## Context

Three root suites carry phase numbers in their file names: `test/p10-structure.test.js`,
`test/p20-dod.test.js`, `test/p22-memory.test.js`. ci.sh discovers root suites by find
expansion, so no gate names them. Live references: the `subjects:` lists of ADR-436 and
ADR-449, and two delivered entries in `BACKLOG.md`. No gate catches a dangling ADR subject.

## Options considered

1. **Rename** *(recommended)* — pros: removes the most visible provenance; ci.sh result unchanged in a probe / cons: first edit to an accepted ADR's `subjects:` list
2. **Keep the names** — cons: provenance stays in the tree
3. **Rename plus a file-name guard** — cons: guards a pattern with 3 instances, all removed by the rename

## Decision

Option 1 — ratified by user. The files become `test/plugin-structure.test.js`,
`test/repo-dod.test.js` and `test/memory-store.test.js`. The same commit updates the
`subjects:` of ADR-436 and ADR-449; the `BACKLOG.md` mentions are updated with the backlog flip.
Dated design, plan and ADR bodies stay as written.

## Consequences

`git log --follow` resolves the old names from dated ledgers. A new phase-numbered file name is
not guarded.
