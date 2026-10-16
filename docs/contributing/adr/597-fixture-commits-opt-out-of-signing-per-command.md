---
subjects:
  - test/helpers/commit-signing.js
  - test/helpers/craft-run.js
  - test/worktree.test.js
supersedes: []
---
# 597 — Fixture commits opt out of signing per command

- **Status:** accepted — adopted-as-recommended (no user judgment)
- **Date:** 2026-10-16
- **Design:** docs/contributing/design/fixture-commits-skip-gpg-signing.md · **Supersedes/Refines:** refines ADR-158

## Context

The `run-ledger`, `hooks` and `worktree` suites build throwaway repositories whose commits inherit
the user's global `commit.gpgsign=true`. Under load gpg fails to sign, and the fixtures fail before
any assertion runs. Pointing `GIT_CONFIG_GLOBAL` at a config that signs with `gpg.program=false`
reproduces it deterministically: 71/73, 35/78 and 9/9 failures.

## Options considered

1. **Prepend `-c commit.gpgsign=false` in both fixture `git` wrappers, the flag pair shared from
   `test/helpers/commit-signing.js`** *(recommended)* — pros: targets exactly the proven cause; one
   site per wrapper covers every current and future commit; command-scope `-c` outranks every config
   file and `GIT_CONFIG_COUNT` / cons: a failing global `core.hooksPath` stays uncovered.
2. **Pinned hermetic env (`pinnedGitEnv()`) in both wrappers** — pros: shuts out all user and system
   config / cons: broader than the proof; changes fixture defaults (`init.defaultBranch`); the
   fixture repo is built under a different config from the ambient-env scripts that run in it.
3. **`--no-gpg-sign` on each commit argv** — cons: five per-site edits; the next commit site is
   unprotected.

## Decision

Adopted-as-recommended (no user judgment): option 1, the minimal change the brief names, shared
through one helper module as ADR-158 established for test isolation. Test fixtures that commit
through a wrapper pass `-c commit.gpgsign=false` ahead of the subcommand; no production code changes.

## Consequences

The three suites no longer depend on the user's signing setup. Other ambient git config (hooks
path, templates) still reaches these fixtures; no run has failed that way, so it stays out of scope.
