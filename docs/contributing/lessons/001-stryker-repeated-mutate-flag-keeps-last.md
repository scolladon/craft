---
subjects:
  - engine/src/**/*.js
  - adapters/*/src/**/*.js
phases: [validation]
kind: trap
trigger: composing a per-hunk Stryker run over more than one file or line range
evidence:
  - test/mutation-scope.test.js
  - .claude/workflow.md
source: { run: lessons-corpus, phase: design, date: 2026-10-19 }
status: active
supersedes: []
last-verified: 2026-10-21
---
# 001 — Stryker keeps only the last repeated --mutate flag

## Context

A per-hunk mutation run passes one `--mutate` flag per file or line range. It runs green while most of the scoped hunks were never mutated.

## Lesson

The Stryker CLI's `--mutate` is a single comma-separated list option, so a repeated flag overwrites the previous value. Two flags, `--mutate "a.js:1-2" --mutate "b.js:3-4"`, mutate only `b.js:3-4`; the dropped ranges are never instrumented.

## How to apply

- Pass ONE comma-joined flag: `--mutate "a.js:1-2,b.js:3-4"`.
- Never repeat `--mutate`: the CLI keeps only the last value.
- Before trusting a green run, check the instrumented mutant count
  is at least the number of hunks you scoped.

## Evidence

`test/mutation-scope.test.js` drives the installed CLI with an injected runner: two flags give `["b.js:3-4"]`, one comma-joined flag gives both ranges. `.claude/workflow.md` states the one-flag contract.
