---
subjects:
  - engine/src/guards/shell-tokeniser.js
supersedes: []
---
# 693 — A brace inside a function substitution body fails closed

- **Status:** accepted
- **Date:** 2026-10-23
- **Design:** docs/contributing/design/arith-expansion-comsub-bypass.md · **Supersedes/Refines:** refines ADR-594

## Context

The tokeniser closes a bash 5.3 `${ …; }` or `${| …; }` body at the first `}` at paren level 0. bash
closes it only at a `}` in command-start position, so a `}` argument (`echo }`), a word ending in `}`
(`x}`) or the `}` of a `{ …; }` group or function body closes it early here. The words after it land
in the enclosing quoted or arithmetic word: `echo "${ echo }; git push; }"` and
`echo "${ { echo; }; git push; }"` run `git push` on bash 5.3.20 while both predicates allow them.
The quoted spellings were open on main; `echo $[ ${ echo }; git push; } ]` blocked on main only
because `$[` was read as a literal, so scanning `$[ ]` bodies turned it into a fail-open. Found by
the third review cycle.

## Options considered

1. **Fail closed on a `}` closer outside command-start position and on any `{` word in the body**
   *(recommended)* — pros: one descriptor field; ADR-594 precedent; the documented `${ cmd; }` form
   still parses
2. **Model brace groups and argument braces in the body** — cons: a brace-depth grammar beside the
   paren one, the class of rule the case-pattern review showed leaking

## Decision

Adopted-as-recommended (no user judgment; the user approved the fix diff): option 1, aligned with
ADR-594. `FUNCTION_SUBSTITUTION` carries `commandBrace: true`; the substitution and parameter
descriptors carry `false`.

## Consequences

`${ cmd }` without a terminating `;` or newline is refused; bash 5.3 itself rejects it (unexpected EOF
looking for the matching `}`). A `{ …; }` group or a function definition inside `${ …; }` is refused.
