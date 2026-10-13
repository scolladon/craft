---
subjects:
  - adapters/codex/test/hook-trust-differential.test.js
supersedes: []
---
# 529 — The fuzz uses an unspaced plugin root and a spaced HOME

- **Status:** accepted — adopted-as-recommended (no user judgment)
- **Date:** 2026-10-13
- **Design:** docs/contributing/design/codex-trust-matcher-differential-fuzz.md · **Supersedes/Refines:** none

## Context

With a spaced plugin root, the only differential is the bare legacy shim splitting, which ADR-517 accepts. A spaced `HOME` exposes the same class — a wrongly trusted bare expansion splitting — without that residual.

## Options considered

1. **Unspaced plugin root, spaced `HOME`** *(recommended)* — pros: no residual to encode; adds a kill of the bare-`$` revert
2. **Also a spaced-root leg with the legacy shim excluded** — cons: re-encodes an accepted residual in the test
3. **Nothing spaced** — cons: loses that kill

## Decision

Adopted-as-recommended (no user judgment): option 1. The quoted registered command under a spaced root stays pinned by `config.test.js`.

## Consequences

The fuzz never re-observes ADR-517's spaced-root residual.
