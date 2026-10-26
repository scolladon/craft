---
subjects:
  - test/run-ledger.test.js
  - scripts/run-ledger.sh
phases: [implementation, review]
kind: trap
trigger: a test bounds a possibly hanging shell script with a spawn timeout
evidence:
  - test/run-ledger.test.js:661
  - test/run-ledger.test.js:668
  - test/run-ledger.test.js:681
  - scripts/run-ledger.sh:319
source: { run: discovered-impacts, phase: review, date: 2026-10-26 }
status: active
supersedes: []
last-verified: 2026-10-26
---
# 010 — A timeout must kill the process group

## Context

A test guarded `defer` against an endless id-claim loop with `spawnSync(..., { timeout, killSignal:
'SIGKILL' })`. The loop runs inside `$(claim_impact_id …)`, a command-substitution subshell. The
timeout killed only the direct `bash` child, so on the regression the subshell was reparented to
pid 1 and kept spinning at about 18% CPU after the test, its temp repo already deleted. Every red run
of that test left one more.

## Lesson

A shell script that hangs usually hangs in a subshell, a pipeline stage or a backgrounded job, not
in the process the test spawned. `spawnSync`'s `killSignal` reaches only that process. Bound the
whole process group.

## How to apply

- Spawn the script with `spawn(..., { detached: true })` so it leads its own process group.
- On timeout, `process.kill(-child.pid, 'SIGKILL')`, then resolve on `close`.
- Check it on the hanging code: the test fails and `ps -A -o pid,ppid,command` shows no orphan.
- After any red run of a hang test, look for ppid-1 leftovers before the next run.

## Evidence

`deferWithDeadline` at `test/run-ledger.test.js:661` kills the group at `:668`; the test at `:681`
covers the claim loop at `scripts/run-ledger.sh:319`. Restoring the unbounded loop fails the test and
leaves no orphan.
