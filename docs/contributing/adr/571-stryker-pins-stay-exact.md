---
subjects:
  - engine/package.json
---
# 571 — Stryker devDependencies stay exact pins

- **Status:** accepted
- **Date:** 2026-10-14
- **Design:** docs/contributing/design/stryker-9-upgrade.md · **Supersedes/Refines:** none

## Context

ADR-570 moves `@stryker-mutator/core` and `@stryker-mutator/tap-runner` to 10.0.0. Both are pinned
exactly today. Stryker minors have changed the mutant set before: 9.5.0 ignores signal options and
9.6.0 stops mutating dynamic-import string literals. From 9.x on, the tap-runner's peer dependency
on core is exact (`core: 10.0.0`, it was `~8.7.0`), so the two packages can only move together.

## Options considered

1. **Exact (`"10.0.0"`) on both** — pros: every recorded score ties to a known instrumenter; the
   house idiom / cons: a patch release needs a manual bump. *(designer's recommendation)*
2. **Caret (`"^10.0.0"`) on both** — pros: `npm update` picks up fixes / cons: the lockfile already
   pins installs, so a caret only changes what `npm update` does, and what it would change is the
   instrumenter, silently.

## Decision

Adopted-as-recommended (no user judgment): option 1. Both Stryker devDependencies are exact pins;
any version change is a deliberate edit with its own mutation comparison.

## Consequences

- Stryker patch releases are not picked up by `npm update`.
- A score change between two recorded runs on the same pin comes from the code or tests, never
  from the tool.
