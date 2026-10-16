---
subjects:
  - test/helpers/commit-signing.js
  - test/craft-run.test.js
  - test/commit-signing.test.js
  - test/worktree.test.js
supersedes: []
---
# 598 — Signing regression proof is per fixture

- **Status:** accepted — adopted-as-recommended (no user judgment)
- **Date:** 2026-10-16
- **Design:** docs/contributing/design/fixture-commits-skip-gpg-signing.md · **Supersedes/Refines:** none

## Context

The fix in ADR-597 needs a test that is red without it. The failure shape is an ambient git
config, so the proof must build each fixture under a hostile global config and show the commit
still lands, and it must prove the hostile config really fails a plain commit.

## Options considered

1. **One test per fixture family under `withFailingCommitSigner`, plus an anti-vacuity test of the
   helper** *(recommended)* — pros: a precise red per fixture; follows the per-helper shape of
   `test/tmp-git-repo.test.js` / cons: a commit site added outside the wrappers is not caught.
2. **A suite-level lane re-running the three suites under the hostile config** — pros: catches any
   future commit site / cons: re-runs about 160 tests on every `ci.sh`, adding the load that
   triggers the original failure.
3. **Both** — cons: option 2's cost on top of option 1.

## Decision

Adopted-as-recommended (no user judgment): option 1. `createRunRepo` is proven in a new eponymous
`test/craft-run.test.js`, `mkWorktreeNoRemote` in `test/worktree.test.js`, and
`withFailingCommitSigner` in `test/commit-signing.test.js`.

## Consequences

Each fixture carries its own red-able proof at negligible CI cost. A future commit made outside
the two wrappers is unprotected until it routes through one.
