---
subjects:
  - adapters/codex/test/hook-trust-differential.test.js
  - scripts/install-dev-tools.sh
  - test/install-dev-tools.test.js
supersedes: []
---
# 525 — A missing shell skips its leg, and CI installs zsh

- **Status:** accepted — ratified by the user
- **Date:** 2026-10-13
- **Design:** docs/contributing/design/codex-trust-matcher-differential-fuzz.md · **Supersedes/Refines:** refines ADR-505, ADR-509

## Context

`ubuntu-latest` ships no zsh, so a reason-only skip would drop the zsh leg on every CI push. zsh is the shell that surfaced the EQUALS bypass, and it alone observes the operand-glob class (`no matches found`). ADR-516 called a conditional skip "a test that sometimes says nothing".

## Options considered

1. **Per-leg skip with a reason, plus `zsh` in `scripts/install-dev-tools.sh`** *(recommended)* — pros: CI and the devcontainer run all four legs; the skip becomes a fallback / cons: touches the shared dev-tool set; one more apt package
2. **Per-leg skip with a reason only** — pros: exactly the brief / cons: zsh never runs in CI
3. **Hard-fail unless an env allow-list names the missing shell** — pros: no silent gap / cons: breaks the local gate on boxes without zsh, no gain over option 1

## Decision

The user ratified option 1. A shell not on `PATH` skips only its own leg with `{ skip: '<shell> is not on PATH, so its leg did not run' }`. `zsh` joins `APT_PACKAGES` in `scripts/install-dev-tools.sh`, and `test/install-dev-tools.test.js` moves in lockstep.

## Consequences

CI install time grows by one package (not measured). Refines ADR-505 and ADR-509's shared tool set.
