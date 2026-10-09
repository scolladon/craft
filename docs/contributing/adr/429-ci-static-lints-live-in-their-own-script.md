---
subjects:
  - scripts/ci.sh
  - scripts/static-lints.sh
---
# 429 — ci.sh's static lints live in their own script

- **Status:** accepted
- **Date:** 2026-10-09
- **Design:** docs/contributing/design/ci-lint-chain-fail-closed.md · **Supersedes/Refines:** none

## Context

The static lints in `scripts/ci.sh` run as one `a && b && …` list, so under `set -e` a failure in any command but the last exits 0. A test that proves a failing lint fails the build must run the lints against a failing stub in a mktemp throwaway. The rest of `ci.sh` runs every suite, so the whole script cannot run in one. Errexit does not cross a `bash script.sh` boundary, and a function called from `||`/`&&` runs with errexit off.

## Options considered

1. **Extract to `scripts/static-lints.sh`** *(recommended)*: the script has its own `set -euo pipefail` and its own root, and `ci.sh` calls it as a bare line. Pros: the test copies the shipped file byte for byte into the throwaway, and the script fails closed whoever calls it (precedent: `scripts/living-corpus.sh`). Cons: one new file, and two tests that read the block's text in `ci.sh` must be repointed.
2. **`run_static_lints()` function inside `ci.sh`**: pros: no new file, and the coupled tests stay untouched. Cons: the test runs a regex-carved slice, not the shipped file.
3. **Text-only assertion**: pros: cheapest. Cons: proves no behaviour (`shellcheck … || true` on its own line passes it).

## Decision

The maintainer chose option 1. The static lints live in `scripts/static-lints.sh`, which declares `set -euo pipefail` and roots itself the way `ci.sh` does. `ci.sh` calls it as the bare statement `bash scripts/static-lints.sh` at the block's old position, after `run_intention_lint` and before the hygiene block. That call is never joined by `&&`/`||`.

## Consequences

- A new static lint is added to `scripts/static-lints.sh`, not to `ci.sh`.
- `test/hygiene-gates-ci.test.js` (ordering anchor) and `test/sync-adapter-agents.test.js` (`--check` wiring) read the new call or file instead of the old `ci.sh` text.
- shellcheck covers the new script because it matches `scripts/*.sh`.
