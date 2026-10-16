---
subjects:
  - engine/src/guards/shell-git-invocations.js
  - engine/src/guards/git-ext-diff-predicate.js
  - engine/src/guards/git-destructive-predicate.js
supersedes: []
---
# 582 — An unparseable command is denied

- **Status:** accepted
- **Date:** 2026-10-15
- **Design:** docs/contributing/design/copilot-git-argv-normalising-guard.md

## Context

The tokeniser cannot judge an unterminated quote, `$(`, backtick or `${`, or nesting past its
depth cap. Pinned: for `git push` followed by a line `echo "x`, bash runs the push before it
reports the syntax error, so a parse failure is not harmless. The ext-diff predicate runs on every
binding sharing `toolCallGuard`.

## Options considered

1. **Deny always** *(recommended)* — both predicates block with a reason naming the parse failure /
   pros: a tokeniser gap shows as a false block, never a bypass / cons: blast radius on all bindings.
2. **Deny only when the text looks like git** — cons: a dynamic head inside broken text slips.

## Decision

**Ratified by the user.** Option 1. A command the module cannot tokenise is a block in both
predicates, with a fixed reason constant naming the parse failure. The nesting cap is a named
constant (8).

## Consequences

The differential test fails when an unparseable verdict lands on a command the generator did not tag
unterminated or over-nested.
