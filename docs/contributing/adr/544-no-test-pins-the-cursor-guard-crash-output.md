---
subjects:
  - adapters/cursor/test/craft-guard-hook.test.js
---
# 544 — No test pins the cursor guard's crash output

- **Status:** accepted — adopted-as-recommended (no user judgment)
- **Date:** 2026-10-13
- **Design:** docs/contributing/design/cursor-hook-nonzero-exit-probe.md · **Supersedes/Refines:** none

## Context

With its engine predicate unresolvable, the cursor guard exits 1 with empty stdout. Cursor blocks that under `failClosed: true` (live). A throwaway-tree test could pin "a dependency-load crash writes no stdout".

## Options considered

1. **No new test** *(recommended)* — `failClosed: true` is the load-bearing property and is already pinned in `hooks.json` and `config.template.json` (`native-surface.test.js`)
2. **A throwaway-tree test asserting a non-zero status and empty stdout** — cons: it pins node's ESM link behaviour, not craft code; it would turn red on a legitimate future hardening that writes a deny object

## Decision

Adopted-as-recommended (no user judgment): option 1. No fail-open was proven, and the brief hardens only on proof, so no code or test is added.

## Consequences

The guard's crash path stays covered by the `failClosed` pins plus the live record. A future hardening adds its own tests.
