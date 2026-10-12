---
subjects:
  - scripts/install-dev-tools.sh
  - test/install-dev-tools.test.js
  - test/helpers
---
# 509 — The shared dev-tool set drops bats and yq

- **Status:** accepted
- **Date:** 2026-10-12
- **Design:** docs/contributing/design/backlog-sweep-hooks-quote-dev-tools.md · **Supersedes/Refines:** none

## Context

`scripts/install-dev-tools.sh` (CI and the devcontainer) installs `bats` and a checksum-pinned `yq`. No tracked `.bats` suite remains — the bats suites were ported to `node:test` — and no script calls `yq`. `test/helpers/{hooks,worktree,manifest-lint}.bash` are bats-shaped helpers nothing sources.

## Options considered

1. **Drop both tools and delete the orphaned helpers** *(recommended)* — pros: no dead install step, no dead code; shorter devcontainer create
2. **Drop both tools, keep the helpers** — cons: leaves dead code
3. **Wire bats into `scripts/ci.sh`** — cons: needs new `.bats` suites duplicating the `node:test` coverage

## Decision

Option 1 — **ratified by the user.** The install set is `shellcheck` and `jq` only; the yq download, checksums and architecture probe are removed with their tests; the three helpers are deleted.

## Consequences

Re-introducing a bats suite or a `yq` caller means re-adding the tool to the install set in the same change.
