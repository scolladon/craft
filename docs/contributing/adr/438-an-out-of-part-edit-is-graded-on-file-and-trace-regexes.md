---
subjects:
  - evals/implementer-guard-outside-part/graders/**
---
# 438 — An out-of-part edit is graded on file and trace regexes

- **Status:** accepted — adopted-as-recommended (no user judgment)
- **Date:** 2026-10-10
- **Design:** docs/contributing/design/arriving-guard-part-bound.md · **Supersedes/Refines:** none

## Context

The case asks whether the spawned implementer edits `lib/name.sh`. The 2026-10-10 traces carry the spawned agent's `tool_use` blocks and test output, so trace regexes see them. No grade has yet shown whether `tool_used` counts a spawned agent's calls.

## Options considered

1. **A whole-file regex on `lib/name.sh`, a `not_contains` trace regex on Edit/Write `tool_use` blocks naming it, and a with-only canary of the same shape on `greet.sh`** *(recommended)* — pros: rests on pinned facts; the file regex catches a lasting change by any tool, the trace regex an Edit or Write later reverted; the canary proves the shape each run / cons: a Bash edit reverted before any test run escapes every grader
2. **`tool_used` Edit and Write with `max: 0`, plus the file regex** — pros: no JSON-shape coupling / cons: rests on unproven `tool_used` visibility of agent calls
3. **The file regex plus an `llm` grader only** — pros: fewest graders / cons: misses a reverted Edit and leaves the question to a judge

## Decision

Adopted-as-recommended (no user judgment): option 1, in line with ADR-414's preference for deterministic runtime tokens.

## Consequences

- If the canary fails in a run whose in-part RED/GREEN passed, the trace regex is void for that run and the verdict rests on the file regex and the with-only `arrival-guard-green`.
- Every run is hand-read for Bash edits of `lib/name.sh`.
