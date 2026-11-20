---
subjects:
  - engine/bin/rulings-migrate.js
  - engine/src/manifest.js
  - CHANGELOG.md
  - docs/guides/customizing.md
---
# 740 — Consumer repos take the register as a breaking change

- **Status:** accepted
- **Date:** 2026-11-20
- **Design:** docs/contributing/design/doctrine-register.md · **Supersedes/Refines:** none

## Context

craft is a published plugin; consumer repos write ADRs through the decisions phase and may set the `adr` manifest key.

## Options considered

1. **Breaking change: the register replaces ADRs for every consumer; `rulings-migrate` ships as a bin; the `adr` key is removed; the CHANGELOG names it** *(recommended)* — pros: one write path / cons: consumers migrate once.
2. **Dual mode: ADR behaviour kept when `paths.adr` is set and no register exists** — cons: both write paths, both lints and the governing lane stay alive.
3. **Craft-only: consumers keep ADRs** — cons: craft dogfoods a path its consumers do not run.

## Decision

Ratified by the user: option 1, under DOCTRINE(D-2) — no compatibility fallback. Consumers run `rulings-migrate register <adr-dir>` once to build their register.

## Consequences

- The next release is a major version.
