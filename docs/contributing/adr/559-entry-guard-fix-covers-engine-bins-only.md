---
subjects:
  - engine/bin
---
# 559 — The entry-guard fix covers `engine/bin` only; the two adapter entry points are a follow-up

- **Status:** accepted — adopted-as-recommended (no user judgment)
- **Date:** 2026-10-14
- **Design:** docs/contributing/design/bin-entry-symlink-guard.md · **Supersedes/Refines:** none

## Context

`adapters/codex/bin/trust-hook.js` and `adapters/pi/src/cli.js` carry the same guard. Run through a link, each exits 0 with no output; run from the physical path, each exits 2. `adapters/pi/test/cli.test.js` checks the literal guard string.

## Options considered

1. **`engine/bin/*.js` only** *(recommended)* — pros: matches the brief / cons: two adapter entry points stay affected until a follow-up.
2. **Also fix both adapter entry points** — cons: adds two more packages to the change and rewrites the pi literal-string pin.

## Decision

Adopted-as-recommended (no user judgment): option 1, under the no-scope-expansion principle. The adapter defect goes in as a backlog follow-up with its repro.

## Consequences

The adapters keep the old guard until the follow-up. Since `isEntryPoint` is exported from `engine/src`, which the adapters already import from, the follow-up only needs to swap the import.
