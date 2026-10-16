---
subjects:
  - engine/src/guards/git-destructive-predicate.js
  - engine/src/guards/shell-git-invocations.js
supersedes: []
---
# 590 — A dynamic reset or branch argument is blocked

- **Status:** accepted
- **Date:** 2026-10-15
- **Design:** docs/contributing/plan/copilot-git-argv-normalising-guard.md · **Supersedes/Refines:** refines ADR-583

## Context

`H=--hard; git reset $H` runs a hard reset: the predicate sees `$H`, the shell passes `--hard`.
Quoting does not help, since `"$H"` expands to the same single word. The design listed dynamic
heads and dynamic option positions (ADR-581) but not dynamic subcommand arguments.

## Options considered

1. **Block `reset`/`branch` when any dynamic argument appears before `--`** *(recommended)* —
   pros: fail-closed / cons: `git reset $SHA` and `git branch -d "$B"` need a literal re-issue.
2. **Block only unquoted dynamic words** — cons: a quoted expansion still carries a flag.
3. **Documented residual** — cons: a known bypass left open.

## Decision

**Ratified by the user.** Option 1. The normaliser reports how many dynamic arguments a subcommand
carries; the destructive predicate blocks `reset` and `branch` when that count before `--` is
non-zero. `push` already blocks always and `clean` blocks unless a literal dry-run flag is present,
so a dynamic flag there cannot unblock it.

## Consequences

The false blocks are pinned in tests and documented with the other intended false blocks.
