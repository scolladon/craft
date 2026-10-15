---
subjects:
  - engine/src/guards/git-ext-diff-predicate.js
  - adapters/opencode/src/git-guard-predicate.js
supersedes: []
---
# 587 — The GIT_DIFF_SHOW_RE export is removed

- **Status:** accepted — adopted-as-recommended (no user judgment)
- **Date:** 2026-10-15
- **Design:** docs/contributing/design/copilot-git-argv-normalising-guard.md

## Context

The ext-diff predicate is rebuilt on the shared invocation module, so its anchor regex has no
reader. Only the opencode surface re-exports it; no test imports it.

## Options considered

1. **Delete it from the engine and the opencode re-export** *(recommended)*
2. **Keep it exported, unused** — cons: dead code.

## Decision

Adopted-as-recommended (no user judgment): option 1; aligns with the no-dead-code guardrail.

## Consequences

None beyond the removed export.
