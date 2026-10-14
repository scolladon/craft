---
subjects:
  - CHANGELOG.md
---
# 569 — The Node floor raise ships as a breaking change

- **Status:** accepted
- **Date:** 2026-10-14
- **Design:** docs/contributing/design/entry-guard-symlink-swap-race.md · **Supersedes/Refines:** none

## Context

ADR-564 raises `engines` from `>=18` to `^22.18.0 || >=24.2.0`, dropping Node 22.0-22.17, a line still under upstream LTS. `docs/contributing/releasing.md` maps "Removed or a breaking change" to a major bump.

## Options considered

1. **Breaking: a `### Removed` CHANGELOG line and `!` on the code commit** *(recommended)* — pros: follows releasing.md; users on a dropped Node see it in the version number.
2. **`### Changed`, minor** — cons: a runtime that worked stops working without a major bump.
3. **No floor line** — cons: the support change is invisible.

## Decision

Option 1, ratified by the user. The `[Unreleased]` section gains a `### Removed` line for the dropped Node versions and a `### Fixed` line for the race; the commit that raises the floor carries `!`. The next release is 2.0.0.

## Consequences

The release that ships this is a major version.
