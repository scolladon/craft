---
subjects:
  - scripts/ci.sh
  - test/source-hygiene.test.js
  - engine/test/**/*.test.js
phases: [implementation, review, validation]
kind: trap
trigger: running the gate on a change that adds a new file not yet staged
evidence:
  - test/source-hygiene.test.js:233
source: { run: doctrine-register, phase: implementation, date: 2026-11-20 }
status: active
supersedes: []
last-verified: 2026-11-20
---
# 013 — A gate that scans tracked files is blind to a new file you have not staged

## Context

A part generated a new 742-line register and ran `bash scripts/ci.sh` before `git add`. The gate passed and the part committed. The next run of the same gate went red: a whole-tree citation sweep, built on `git grep`, now saw 15 citations in the committed file that it had never scanned.

## Lesson

Any check that lists files through git (`git grep`, `git ls-files`) scans the index and the tracked tree only. A file that exists on disk but is not staged is outside its scope, so the gate passes for a reason that disappears at commit.

## How to apply

- Stage every new file (`git add <path>`) before running the gate that decides the commit.
- Re-run the gate after staging when a part creates files.
- Read a green gate on a part that adds files as provisional until it ran with them staged.

## Evidence

`test/source-hygiene.test.js:233` lists its scan set with `git ls-files`, so a new untracked file in `engine/src/` escapes the provenance and home-path checks until it is staged.
