# 036 — `.forge-mutation.lock` → `.craft-mutation.lock` — clean rename, no old-name reader

- **Status:** accepted
- **Date:** 2026-06-17
- **Phase:** P8.5 · **Relates:** [032](032-rename-forge-to-craft.md), [033](033-no-namespace-alias.md)

## Context

The validation (mutation) phase writes a run-lock the worktree-teardown script honors so a
teardown can't destroy a live mutation run. The lock file carries the product name:
`.forge-mutation.lock`. It appears in three lockstep sites — the writer prose
(`skills/validation/SKILL.md`), the reader (`scripts/worktree-teardown.sh`), and the protocol
test (`test/worktree.bats`, 5 assertions). Should teardown also read the old name for a
migration window?

## Options considered

1. **Clean rename to `.craft-mutation.lock`; teardown reads only the new name.** *(user choice)*
2. Rename the writer but have teardown read `.forge-mutation.lock` too for one release. A dead
   code path for a migration window that doesn't exist (no installed users, no live worktrees).

## Decision

Rename the lock to **`.craft-mutation.lock`** across all three sites in lockstep; teardown
reads **only** the new name. The bats suite — which writes the lock directly and asserts the
script's REFUSED/FORCED/stale-lock behavior — is the proof the protocol still holds; it flips
to the new name in the same commit as the script (the CI-coupled atomic unit). The
writer-prose flips with them.

## Consequences

No back-compat reader, consistent with the clean-break stance of
[033](033-no-namespace-alias.md). The lock rename is behavior-bearing (the protocol must keep
working), so it lands as a 4-dimension-reviewed slice with the script + bats together. No
installed users means no orphaned `.forge-mutation.lock` to worry about.
