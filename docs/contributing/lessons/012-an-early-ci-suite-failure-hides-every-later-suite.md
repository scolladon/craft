---
subjects:
  - scripts/ci.sh
phases: [implementation, review, validation]
kind: trap
trigger: ci.sh fails on a known flaky test and only that test is re-run before committing
evidence:
  - scripts/ci.sh:43
source: { run: decisions-doctrine-layer, phase: review, date: 2026-11-05 }
status: active
supersedes: []
last-verified: 2026-11-05
---
# 012 — An early ci.sh suite failure hides every later suite

## Context

A review fix batch ran ci.sh under load. The engine suite failed on a timing test known to flake, and the file passed 3 of 3 runs on its own, so the batch was committed. The root suite never ran in that ci.sh call: a pinned shim-count test it holds was already red, and the next full ci.sh run showed it.

## Lesson

`run_suite` exits on the first failing suite, so a failure in `engine` means no adapter or root suite ran. Re-running the flaky file proves the flake, not the rest of the tree.

## How to apply

- After a flake-only failure, re-run the whole `bash scripts/ci.sh`, not just the flaky file.
- Commit only on a ci.sh run that exits 0 end to end.
- Read the last `ci: <label> node --test failed` line to see which suite stopped the run.

## Evidence

`scripts/ci.sh:43` runs `exit "$status"` inside `run_suite`, and `scripts/ci.sh:47` runs the engine suite before every adapter and root suite.
