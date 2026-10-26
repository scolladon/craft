---
subjects:
  - engine/src/guards/shell-tokeniser.js
supersedes: []
---
# 694 — A quoted substitution opener in an arithmetic reach fails closed

- **Status:** accepted — ratified by the user
- **Date:** 2026-10-26
- **Design:** docs/contributing/design/guard-arith-cleanup.md · **Supersedes/Refines:** refines ADR-688 and ADR-690

## Context

Inside `(( … ))`, `for (( … ))`, an assignment subscript, a `${x:offset}` and a `${a[…]}` subscript,
bash does not treat `'…'` as quoting and still runs a substitution in it, while the tokeniser reads
the span as a quoted literal. `(( '$(git push -f origin)' ))`, `for (( i='$(…)'; … ))`,
`a['$(…)']=1` and `echo ${a['$(…)']}` run git under bash 5.3.20; `x=abc; echo ${x:'$(…)'}` runs it
under /bin/bash 3.2.57 and 5.3.20 (stub git, benign marker; design table D rows 45, 47, 49, 51, 52).
Both predicates allowed every row. `$(( ))` and `$[ ]` already refuse a `'` in their body.

## Options considered

1. **Quoted-opener check** *(recommended)* — fail closed on a `'…'` or `$'…'` span holding `$(`, a
   backtick or `${` when the context is in an arithmetic reach (`arithmeticFloor` set, a `${ }` body,
   or the piece holds an unclosed `[`) — pros: 1 predicate, 2 call sites, no new entry point or
   descriptor; false blocks only rows that run nothing (77, 79, 80); census 0 / 29162 fuzz, 0 / 244
   disk
2. **Route the bodies through the arithmetic-expansion scanner** — cons: 4 entry sites, 3 descriptors
   (one with two closers), flips row 58, misses rows 63 and 73, denies quotes that work (`'1'` in
   `(( ))` on 3.2, `m['k']`)
3. **Option 1 refusing every quote** — cons: also denies `${x:-'text'}` and associative keys

## Decision

Ratified by the user: option 1. The check runs in `onSingleQuote` and `readAnsiC` before the span is
appended. A `$'…'` span also fails when a numeric escape in it decodes to `$` or a backtick.

## Consequences

Rows 45, 47, 49, 51, 52 and their spellings in table H (61–73) and row 108 block in both
predicates. A quoted opener in any `${ }` body is denied even where bash runs nothing
(`${x:-'$(cmd)'}`): accepted, as it never costs a working command in the measured corpora.
