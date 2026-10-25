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

Ratified by the user: option 1, a `case` word anywhere in a `$( )`, `<( )` or `>( )` body makes the
command unparseable. Two narrower rules were tried at review and both leaked under bash 5.3: a rule
keyed on the pattern `)` (an `esac` used as a pattern, `x|esac)`, `(esac)`, `"esac")`, popped the
tracked level), and a rule keyed on the keyword position (`function f case …`, `function f { case …`,
`coproc f { case …` put `case` where the tokeniser does not see a command head). bash only reads an
unquoted literal `case` as the keyword, so refusing the word covers every keyword spelling. The
differential census tags a composed body holding `case` as `case-in-substitution`.

## Consequences

Any `$( … case … )` is denied on every shell, including `$(grep case f)` and the balanced pattern
form `$(case x in (x) …)`. A top-level `case`, and one inside `${ …; }` or a re-parsed `bash -c`
string, is unaffected.
