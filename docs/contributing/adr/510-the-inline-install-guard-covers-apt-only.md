---
subjects:
  - test/install-dev-tools.test.js
---
# 510 — The inline-install guard covers apt only

- **Status:** accepted
- **Date:** 2026-10-12
- **Design:** docs/contributing/design/backlog-sweep-hooks-quote-dev-tools.md · **Supersedes/Refines:** none

## Context

`test/install-dev-tools.test.js` asserts no CI step installs the shared tools inline, matching `/apt-get install/` and `/mikefarah\/yq/`. ADR-509 removes yq from the shared set.

## Options considered

1. **Reduce the guard to `/apt-get install/`** *(recommended)* — pros: guards exactly the shared set
2. **Keep `/mikefarah\/yq/`** — cons: guards a tool nobody uses
3. **A generic `curl|wget` guard** — cons: a new rule with no evidence it is needed

## Decision

Option 1 — **adopted-as-recommended (no user judgment).** Aligns with YAGNI: the guard tracks the shared tool set and nothing beyond it.

## Consequences

An inline yq install in CI would no longer be flagged; ADR-509 already requires such a tool to come back through the shared script.
