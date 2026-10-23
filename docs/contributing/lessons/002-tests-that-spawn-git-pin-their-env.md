---
subjects:
  - engine/test/**/*.test.js
  - test/**/*.test.js
  - adapters/*/test/**/*.test.js
phases: [implementation, review]
kind: trap
trigger: writing a test that spawns git or a bin that runs git against a throwaway repo
evidence:
  - engine/test/lessons-hint.bin.test.js:20-25
  - test/helpers/tmp-git-repo.js:10-15
source: { run: lessons-corpus, phase: review, date: 2026-10-19 }
status: active
supersedes: []
last-verified: 2026-10-23
---
# 002 — Tests that spawn git must pin their environment

## Context

A bin test ran `git init`, `add` and `commit` in a temp dir with the environment it inherited. Review reproduced the leak: with `GIT_DIR` pointing at a decoy repo, the fixture commit landed in the decoy.

## Lesson

Git honours `GIT_DIR`, `GIT_WORK_TREE`, `GIT_INDEX_FILE` and the global and system config ahead of the cwd. A hook, a linked worktree or a user setting exports them, so an unpinned spawn can write into a repo the test never created.

## How to apply

- Spawn git, and any bin that runs git, with an allowlisted env: `PATH` plus
  `GIT_CONFIG_GLOBAL=/dev/null`, `GIT_CONFIG_SYSTEM=/dev/null`, `GIT_CONFIG_NOSYSTEM=1`.
- Never pass `process.env` through; reuse the root helper's pinned env where the module format allows.
- Prove it: run the test with `GIT_DIR` set to a decoy repo and check the decoy stays empty.

## Evidence

`engine/test/lessons-hint.bin.test.js` builds `PINNED_ENV` and passes it to every git call and to the spawned bin; `test/helpers/tmp-git-repo.js` holds the same allowlist for the root suites. With `GIT_DIR` pointed at a decoy repo the bin suite passes and the decoy keeps 0 commits and 0 files.
