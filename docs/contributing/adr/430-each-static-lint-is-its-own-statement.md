---
subjects:
  - scripts/static-lints.sh
---
# 430 — Each static lint is its own statement

- **Status:** accepted
- **Date:** 2026-10-09
- **Design:** docs/contributing/design/ci-lint-chain-fail-closed.md · **Supersedes/Refines:** ADR-429

## Context

Under `set -euo pipefail`, a failure stops the script only when the failing command is its own statement or the last command of an `&&` list. Pinned on bash 3.2: with the old list, seven of the ten lints let a failure through and the script exited 0. Two fixes close it: split the list into separate statements, or append `|| exit 1` to every command.

## Options considered

1. **One command per line** *(recommended)*: errexit enforces it, and both `for` loops drop their inner `|| exit 1`. Pros: the lint's own exit status propagates (a 2 stays 2), and it matches every other step in `ci.sh`. Cons: none recorded.
2. **`|| exit 1` on each command**: pros: works even without errexit. Cons: redundant under the script's declared `set -euo pipefail`, every status becomes 1, and the next edit can leave the suffix off one line without anyone noticing.

## Decision

Adopted as recommended (no user judgment). It is the first fix the brief names, and it matches the bare-statement style of every other step in `ci.sh`. Every lint in `scripts/static-lints.sh` is one bare statement on its own line, never joined to another by `&&`, `||` or a `\` continuation. A loop body is a bare lint call and errexit stops the loop at the first failing file. A failing lint ends the script with that lint's own exit status.

## Consequences

- Fail-fast is kept: the first red lint stops the block, as the `&&` list was meant to.
- Re-joining two lines with `&&` reopens the hole for the left command. The per-position test (ADR-431) catches it.
