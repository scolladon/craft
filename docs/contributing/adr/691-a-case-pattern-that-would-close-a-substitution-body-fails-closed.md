---
subjects:
  - engine/src/guards/shell-tokeniser.js
supersedes: []
---
# 691 — A case pattern that would close a substitution body fails closed

- **Status:** accepted — ratified by the user
- **Date:** 2026-10-23
- **Design:** docs/contributing/design/arith-expansion-comsub-bypass.md · **Supersedes/Refines:** refines ADR-594

## Context

The tokeniser closes a `$( )`, `<( )` or `>( )` body at the first `)` at paren level 0, and a case
pattern written without its leading `(` ends in such a `)`. `echo "$(case x in x) git push;; esac)"`
and `echo $[ $(case x in x) git push;; esac) ]` run `git push` on bash 5.3.20 while both predicates
allow them: the words after the pattern leave the body and land in a quoted or arithmetic word.
bash 3.2.57 rejects the syntax. The `$[ ]` spelling blocked before only because `$[` was read as a
literal.

## Options considered

1. **Fail closed on `case` inside a paren-closed body** *(recommended)* — pros: small; ADR-594
   precedent
2. **Model case patterns** — cons: a new grammar subset (patterns, `;;`, `;&`, `;;&`, `esac`) and a
   new differential surface
3. **File it** — cons: leaves the regression and the quoted spelling open

## Decision

Ratified by the user: option 1, narrowed at review to the `)` that would close the body. The
tokeniser records the paren level of each open `case`. Inside a paren-closed body, a `)` that would
take the level below that mark (a pattern with no `(` of its own) makes the command unparseable. A
balanced pattern, `case x in (x) …`, still parses, because the tokeniser already models it; refusing
it would block a construct the census composes and bash 3.2 accepts.

## Consequences

`$(case … x) …)` is denied on every shell. Top-level `case` and the balanced pattern form are
unaffected.
