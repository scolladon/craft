---
subjects:
  - CONTRIBUTING.md
---
# 506 — Contributions are process-agnostic and gated by CI

- **Status:** accepted
- **Date:** 2026-10-12
- **Design:** docs/contributing/design/public-front-door-completion.md · **Supersedes/Refines:** none

## Context

CONTRIBUTING.md must state the contribution model. craft is built with craft, but requiring a craft run would make a paid model a prerequisite to contribute.

## Options considered

1. **Any process; the bar is `scripts/ci.sh` green + Conventional Commits; open an issue first for features** *(recommended)* — pros: open door, objective bar
2. **Feature PRs must come from a craft run** — pros: dogfooding receipts / cons: paid-model prerequisite
3. **Issues only, PRs by invitation** — pros: low maintainer load / cons: closes the door the scaffolding opens

## Decision

Option 1 — ratified by the user. Any contribution process is welcome; a PR is acceptable when `bash scripts/ci.sh` is green and commits follow Conventional Commits; features start with an issue. craft runs are mentioned as the maintainer's own way of working, not required.

## Consequences

Review effort is not reduced by process receipts. The CI gate is the contract with contributors.
