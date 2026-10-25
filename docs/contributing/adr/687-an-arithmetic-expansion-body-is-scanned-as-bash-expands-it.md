---
subjects:
  - engine/src/guards/shell-tokeniser.js
supersedes: []
---
# 687 — An arithmetic expansion body is scanned as bash expands it

- **Status:** accepted — ratified by the user
- **Date:** 2026-10-23
- **Design:** docs/contributing/design/arith-expansion-comsub-bypass.md · **Supersedes/Refines:** none

## Context

The tokeniser skips the whole body of `$(( … ))`, so a substitution nested in it never reaches a
predicate: `echo $(($(git push -f origin)))` runs `git push -f origin` under bash 3.2.57 and 5.3.20
while `gitDestructivePredicate` allows it. Backtick, `${ …; }` and `${| …; }` bodies leak the same
way.

## Options considered

1. **Scan the body with double-quote expansion semantics in a scratch context one level deeper,
   absorbing the commands of nested substitutions** *(recommended)* — pros: models bash on every
   probed row; `$(( $(cmd) + 1 ))` keeps parsing; `1 << 2` stays arithmetic
2. **Fail closed when the body holds a substitution opener** — cons: a parse failure denies every
   Bash call, so the `$(( $(cmd) + 1 ))` idiom is blocked git or not
3. **Tokenise the body as a command list, as `(( … ))` is** — cons: misses `'$(…)'`; reads `<<` as a
   heredoc and fails closed on `echo $(( 1 << 2 ))`, which a predicate test pins as passing

## Decision

Ratified by the user: option 1. The expansion word stays one dynamic word.

## Consequences

The body's nested commands reach every predicate. The scanner adds one context type to the
tokeniser and counts against the existing nesting cap.
