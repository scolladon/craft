---
subjects:
  - hooks/git-no-ext-diff.sh
supersedes: []
---
# 539 — The git hook crash trap is inline

- **Status:** accepted — adopted-as-recommended (no user judgment)
- **Date:** 2026-10-13
- **Design:** docs/contributing/design/claude-hook-nonzero-exit-probe.md

## Context

`hooks/bound-run.sh` holds the house `never_block` EXIT trap. Sharing a `fail_closed` sibling would mean sourcing it from the hook.

## Options considered

1. **Inline the trap in `git-no-ext-diff.sh`** *(recommended)*
2. **A `fail_closed` helper in `hooks/bound-run.sh`, sourced** — cons: sourcing is a crash point before any trap exists (a missing helper exits 1, fail-open), and resolving the hook dir adds code ahead of the trap

## Decision

Adopted-as-recommended (no user judgment): option 1. About six shared lines do not justify a pre-trap crash point; bound-run's header scopes it to fail-open wrapping and the run-ledger lookup.

## Consequences

The hook stays self-contained: nothing runs before the trap but `set -euo pipefail` and constant assignments.
