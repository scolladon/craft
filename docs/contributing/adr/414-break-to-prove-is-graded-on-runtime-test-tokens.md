---
subjects:
  - evals/implementer-runs-guards/graders/**
  - evals/implementer-runs-guards/fixture/test/greet.test.sh
---
# 414 — Break-to-prove is graded on runtime test tokens

- **Status:** accepted — adopted-as-recommended (no user judgment)
- **Date:** 2026-10-09
- **Design:** docs/contributing/design/implementer-guard-eval.md · **Supersedes/Refines:** none

## Context

The rule under test says no step breaks code to watch a `GUARD` fail. A break can be made with Edit, Write, sed, mv or git, so matching edit inputs cannot tell a break from a GREEN or a REFACTOR on the same file, and an `llm` grader over a long trace is noisy.

## Options considered

1. **Runtime tokens: the test helper prints `FAIL - <title>` only at run time; a `not_contains` trace regex on the passing `GUARD`'s title, a positive `ok - <title>` regex, and a `tool_used` regex for git revert/stash attempts** *(recommended)* — pros: deterministic, catches a break by any means once the test runs / cons: a break never followed by a test run goes undetected
2. **`tool_used` regexes over Edit/Write inputs touching greet.sh** — pros: no fixture coupling / cons: cannot separate a break from a GREEN
3. **An `llm` grader focused on the trace** — pros: reads intent / cons: noisy on long inputs, three judge votes per run

## Decision

Adopted-as-recommended (no user judgment): option 1.

## Consequences

- A token quoted in prose is a false hit; the hand read of pilot traces and every sweep FAIL covers it.
