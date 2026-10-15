---
subjects:
  - engine/stryker.conf.json
  - engine/test/mutation-config.test.js
supersedes: []
---
# 592 — The fuzz is kept out of Stryker by one extglob pattern

- **Status:** accepted — adopted-as-recommended (no user judgment)
- **Date:** 2026-10-15
- **Design:** docs/contributing/plan/copilot-git-argv-normalising-guard.md · **Supersedes/Refines:** refines ADR-589

## Context

ADR-589 places the fuzz under `engine/test/guards/` outside Stryker, falling back to the copilot
adapter tests if a negated glob is refused. The tap runner ignores a `!`-prefixed `testFiles`
entry; the single pattern `engine/test/**/!(*.differential).test.js` excludes only
`*.differential.test.js`, and node's `path.matchesGlob` agrees.

## Options considered

1. **The single extglob pattern, pinned by a mutation-config test** *(recommended)*
2. **ADR-589's fallback location** — cons: moves an engine test into an adapter.
3. **A file name not ending in `.test.js`** — cons: `scripts/ci.sh` discovers `*.test.js` only.

## Decision

Adopted-as-recommended (no user judgment): option 1; it is ADR-589's primary option made concrete.

## Consequences

A test pins that the pattern excludes the fuzz file and still matches every other engine test.
