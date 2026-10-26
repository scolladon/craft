---
subjects:
  - engine/src/guards/shell-tokeniser.js
  - engine/test/guards/shell-tokeniser.test.js
phases: [design, implementation, review]
kind: trap
trigger: a tokeniser rule checks the word being built at every quote, escape or appended character
evidence:
  - engine/src/guards/shell-tokeniser.js:227
  - engine/src/guards/shell-tokeniser.js:278
  - engine/test/guards/shell-tokeniser.test.js:381
  - engine/test/guards/shell-tokeniser.test.js:389
source: { run: guard-arith-cleanup, phase: review, date: 2026-10-26 }
status: active
supersedes: []
last-verified: 2026-10-26
---
# 008 — A per-append guard check must not rescan the word

## Context

Two word rules tested the whole piece with a regex: `/\[[^\]]*$/` at every quote, and
`/\[[\s\S]*(?:\$\(|\$\{|`)/` at every word end. Both backtrack across the piece, and the first also ran
once per quote, so a 130k-character command under the length cap took 7.5 s against 7 ms on main. The
guard runs as a PreToolUse hook on every Bash command, so one proposed command stalled the session.
The unit suites stayed green: nothing fed them a long word.

## Lesson

The tokeniser builds a word one append at a time, so any check that reads the whole piece at each
append is quadratic, and a backtracking regex makes a single read quadratic too. Keep the state the
check needs on the context, updated from the appended text alone, and make any end-of-word check one
linear pass.

## How to apply

- Never test a regex against the growing piece inside an append, quote or escape handler.
- Keep per-word state (an open `[`, the tail that may end in `$`) as a context flag updated from the appended text.
- At word end, prefer `indexOf` plus a fixed-alternation regex over a `[\s\S]*` pattern.
- Add a bounded-time row near the length cap for every new per-word rule, and check it fails on the slow code.

## Evidence

`tracksSubscript` at `engine/src/guards/shell-tokeniser.js:227` keeps the open-subscript state per
append; `bracketBeforeOpener` at `:278` replaced the backtracking regex. The bounded-time rows at
`engine/test/guards/shell-tokeniser.test.js:381` and `:389` take 40866 ms and 19563 ms on the old code
and under 40 ms now.
