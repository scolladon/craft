---
subjects:
  - engine/src/cli-io.js
---
# 568 — The entry guard's floor error names the supported range and the running Node

- **Status:** accepted — adopted-as-recommended (no user judgment)
- **Date:** 2026-10-14
- **Design:** docs/contributing/design/entry-guard-symlink-swap-race.md · **Supersedes/Refines:** none

## Context

ADR-564 makes `isEntryPoint` throw when `import.meta.main` is not a boolean. The thrown message is all a reader gets when the error is caught, and the same throw fires for a leftover call site passing `import.meta.url` on a supported Node.

## Options considered

1. **`craft needs Node ^22.18.0 || >=24.2.0 (import.meta.main); running vX`** *(recommended)* — pros: names the fix and the observed version; on a supported Node the version shows the cause is a misuse, not the runtime.
2. **The range only** — cons: a misuse on a supported Node reads as a version problem.
3. **The range plus a misuse hint** — cons: a second clause for a case a version number already disambiguates.

## Decision

Adopted-as-recommended (no user judgment): option 1, following the guardrail that errors carry their context. The range is a private constant in `engine/src/cli-io.js`; the running version is `process.version`.

## Consequences

The unit test reads the range from `engine/package.json`, so an emptied constant is a killed mutant and the message cannot drift from `engines`.
