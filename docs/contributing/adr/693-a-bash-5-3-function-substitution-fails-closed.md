---
subjects:
  - engine/src/guards/shell-tokeniser.js
supersedes: []
---
# 693 — A bash 5.3 function substitution fails closed

- **Status:** accepted — ratified by the user
- **Date:** 2026-10-23
- **Design:** docs/contributing/design/arith-expansion-comsub-bypass.md · **Supersedes/Refines:** refines ADR-594 and ADR-684

## Context

The tokeniser modelled bash 5.3's `${ …; }` and `${| …; }` as a command list closed at the first `}`
at paren level 0. bash closes it only at a `}` where a command can start, and that rule reaches into
other grammar: a `}` argument (`echo }`), a word ending in `}`, the `}` of a `{ …; }` group, a `}`
after an assignment or `case`/`!`/`time`, an array value `x=(a) }`, a `[[ a || } ]]` operand and a
case pattern `a|})` all close the body early here and leave the commands after it in the enclosing
quoted or arithmetic word. `echo "${ echo }; git push; }"` runs `git push` on bash 5.3.20 while both
predicates allow it; the quoted spellings were open on main, and `$[ ${ … } ]` became a fail-open
once `$[ ]` bodies were scanned. Three review rounds each patched the closer rule and each found a
new spelling.

## Options considered

1. **Refuse every function substitution** *(recommended)* — pros: sound; removes the closer
   tracking; bash 3.2, the macOS `/bin/bash`, does not accept the form at all
2. **Keep modelling, failing closed on `[[`, `case` and `=(` in the body** — cons: an enumeration,
   the shape of rule that leaked in every round
3. **Model `[[ ]]`, case patterns and array values in the body** — cons: the largest grammar copy and
   the highest drift risk

## Decision

Ratified by the user: option 1. A `${` followed by a space, tab, newline or `|` makes the command
unparseable. Parameter expansion (`${x}`, `${x:-…}`, `${#x}`) is unchanged.

## Consequences

Every bash 5.3 function substitution is denied on every shell. ADR-684's heredoc rule now applies to
`$( )` and `<( )` bodies only: a `${ …; }` body is refused before its heredoc is read.
