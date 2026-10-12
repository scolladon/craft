---
subjects:
  - scripts/install-dev-tools.sh
  - .github/workflows/ci.yml
  - .devcontainer/devcontainer.json
---
# 505 — CI and the devcontainer share one dev-tool install script

- **Status:** accepted
- **Date:** 2026-10-12
- **Design:** docs/contributing/design/public-front-door-completion.md · **Supersedes/Refines:** none

## Context

The devcontainer needs the same tools `scripts/ci.sh` needs in CI (bats, shellcheck, jq, mikefarah yq v4). Debian's apt `yq` is the wrong tool, so yq must be downloaded per architecture.

## Options considered

1. **Shared `scripts/install-dev-tools.sh` used by the CI `ci` job and `postCreateCommand`** *(recommended)* — pros: one definition; CI exercises the devcontainer's install on every push / cons: CI's install path changes
2. **Inline lists in each, plus a test that they match** — pros: CI untouched / cons: two definitions
3. **Devcontainer installs only what `ci.sh` provably uses; CI unchanged** — pros: minimal / cons: parity drifts

## Decision

Option 1 — **adopted-as-recommended (no user judgment).** `scripts/install-dev-tools.sh` is the single definition of the non-Node dev tools; the CI `ci` job and the devcontainer's `postCreateCommand` both run it. It selects the yq asset by architecture and fails before installing anything on an unsupported one. Aligns with DRY.

## Consequences

A tool change edits one script. The container build itself stays unexercised in CI; a maintainer smoke covers it.
