---
subjects:
  - hooks/progress/attention.test.tsx
  - hooks/progress/progress.test.tsx
  - hooks/progress/register.tsx
  - hooks/progress/status-line.test.tsx
phases: [implementation, review]
kind: trap
trigger: a test pins a guard that sits behind earlier early-return exits
evidence:
  - hooks/progress/attention.test.tsx:164
  - hooks/progress/register.tsx:143
  - hooks/progress/progress.test.tsx:250
  - hooks/progress/register.tsx:62
  - hooks/progress/status-line.test.tsx:142
source: { run: run-visibility-task-list, phase: review, date: 2026-10-27 }
status: active
supersedes: []
last-verified: 2026-10-30
---
# 011 — A guard test must start past the earlier exits

## Context

Review asked for a test of the `turn.start` guard that keeps a sub-agent from rebinding. The
first test fired `turn.start` with an `agentId` at an unbound session that had no cached
envelope. `bind()` already returns early when the envelope is missing, so the test passed with
the guard deleted (`if (true)`, 40/40 green). The cache-reset test had the same flaw: it never
reached the state where the reset matters. A second review cycle caught both.

## Lesson

A test of one guard proves nothing when an earlier exit already produces the expected outcome.
The arrange step has to bring the system past every exit in front of the guard, so that the
guard is the only thing standing between the input and the wrong outcome.

## How to apply

- Arrange the state in which only the guard decides: bound, cached, or exhausted, as the guard requires.
- Assert an outcome that the unguarded path would change, not "nothing happened".
- Mutate the guard on a temp copy (`if (true)`, drop the reset) and watch the test fail before trusting it.

## Evidence

The rewritten test at `hooks/progress/attention.test.tsx:164` binds and reaches `waiting on you`
first; deleting the guard at `hooks/progress/register.tsx:143` now fails it. The test at
`hooks/progress/progress.test.tsx:250` exhausts locate before changing the transcript, so dropping
the reset at `hooks/progress/register.tsx:62` fails it.

A later run repeated the trap in a pure renderer test: a "no cycle number once review is done" guard
put review out of flight, so the cycle lookup never ran and a mutant reading the last child
survived. The replacement at `hooks/progress/status-line.test.tsx:142` keeps review in flight with
every cycle completed, and the mutant now fails it.
