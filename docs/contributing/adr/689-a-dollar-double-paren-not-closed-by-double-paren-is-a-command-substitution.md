---
subjects:
  - engine/src/guards/shell-tokeniser.js
supersedes: []
---
# 689 — A `$((` not closed by `))` is a command substitution

- **Status:** accepted — ratified by the user
- **Date:** 2026-10-23
- **Design:** docs/contributing/design/arith-expansion-comsub-bypass.md · **Supersedes/Refines:** none

## Context

When the `)` that closes the inner level of `$((` is not followed by `)`, bash reads it as
`$( (subshell) )`. `echo $((git push -f origin) )` and its `;`, `|` and newline variants run git on
both shells while the guard allows them as one opaque arithmetic word.

## Options considered

1. **Re-read it as `$( … )` through the existing substitution descriptor** *(recommended)* — pros:
   bash's own rule; reuses a path that already handles the subshell
2. **Fail closed with the unterminated reason** — cons: denies legal `$( (subshell) )` spellings

## Decision

Ratified by the user: option 1.

## Consequences

The subshell's commands reach the predicates, so a git command in it blocks as it does in `$( )`.
