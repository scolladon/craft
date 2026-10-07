---
subjects:
  - evals/reviewer-tests-findings/**
  - docs/contributing/maintainer-smokes.md
---
# 399 — The sandbox-git route is picked by a paid probe

- **Status:** accepted
- **Date:** 2026-10-07
- **Design:** docs/contributing/design/eval-sweep-followups.md · **Supersedes/Refines:** refines ADR-386 when route B is taken (the scaffold also writes the range's diff)

## Context

In 51 of 52 swept runs `/usr/bin/git` failed inside the eval child: the sandbox denies reads under `/Library/Developer`, so the xcrun shim cannot reach the Command Line Tools git. `TMPDIR` and `DEVELOPER_DIR` cannot help. The child loads no project configuration and a case's `env` takes only `EVAL_*` keys; the child does inherit the operator's PATH, yet a 2026-10-06 trace shows a PATH prepend still resolving `/usr/bin/git`. Agents worked around it unevenly (Homebrew git, reading files instead of the diff, leaving the sandbox).

## Options considered

1. **Route A: an operator-side PATH precondition in the sweep procedure** — pros: no case change; measures the reviewer as it works / cons: only possible if the child honours PATH order
2. **Route B: the reviewer scaffold writes `git diff HEAD~1 HEAD` into the repository's git directory (`../.git/review-range.diff` from the eval workspace, whose repository root is the run's `HOME`); the prompt names it** — pros: works on any machine, including one with only the Xcode shim / cons: the reviewer may no longer run git; refines ADR-386
3. **Route C: documented floor** — pros: no change / cons: structured review keeps measuring the workaround

## Decision

Ratified by the user: probe P1 decides. P1 is a throwaway, never-committed plugin case (sonnet, one run, USD 1 cap) that prints the child's PATH and git resolution before and after a prepend. Outcome O3 (the child keeps the operator's PATH order and resolves a non-Xcode git that runs) → route A. Any other outcome (O1, O2, O4) → route B. A missing or truncated outcome is re-run once; a route is never inferred from it.

## Consequences

- Nothing machine-specific (`/opt/homebrew/bin`) is committed; it appears only in the throwaway probe.
- Under route A a machine whose only git is the Xcode shim has no sandbox-readable git; its cells carry a floor note.
- Under route B the scaffold reaches its 10-line limit.
