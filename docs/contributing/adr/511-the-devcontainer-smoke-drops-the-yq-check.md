---
subjects:
  - docs/contributing/maintainer-smokes.md
---
# 511 — The devcontainer smoke drops the yq check

- **Status:** accepted
- **Date:** 2026-10-12
- **Design:** docs/contributing/design/backlog-sweep-hooks-quote-dev-tools.md · **Supersedes/Refines:** none

## Context

The devcontainer cold-start smoke asks that "`yq --version` reports v4.44.3". ADR-509 removes yq from the install set.

## Options considered

1. **Drop the clause** *(recommended)* — pros: the same sentence already requires `bash scripts/ci.sh` to pass, which runs shellcheck and the jq-dependent hooks suite
2. **Replace it with `shellcheck --version` and `jq --version`** — cons: repeats a check `ci.sh` already makes

## Decision

Option 1 — **adopted-as-recommended (no user judgment).** Aligns with DRY: one check per tool.

## Consequences

The smoke proves the remaining tools only through `ci.sh`.
