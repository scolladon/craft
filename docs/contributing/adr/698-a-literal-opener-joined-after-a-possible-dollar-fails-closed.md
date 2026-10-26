---
subjects:
  - engine/src/guards/shell-tokeniser.js
supersedes: []
---
# 698 — A literal opener joined after a possible dollar fails closed

- **Status:** accepted — ratified by the user
- **Date:** 2026-10-26
- **Design:** docs/contributing/design/guard-arith-cleanup.md · **Supersedes/Refines:** refines ADR-695

## Context

ADR-695's word rule reads `[` then `$(`, `${` or a backtick in the word's text. Three review rounds
each found a new way to build that opener only after the tokeniser has read the word: `$'…'`
escapes, a bare `$` before an escaped `(`, then a `$` from a `${x:-$}` body, from a brace group
`{$,}` and from substitution output `$(printf '$')`. `let a[${x:-$}\(git' push -f origin'\)]`,
`let a[{$,}\(git' push -f origin'\)]` and `let a[$(printf '$')\(git' push -f origin'\)]` run git
under /bin/bash 3.2.57 and bash 5.3.20 (stub git, benign marker) while both predicates allowed
them. The fix for the bare `$` also denied ordinary `sed "s/[ ]*$/x/;s/^/${PREFIX}/" f`.

## Options considered

1. **Refuse the join** *(recommended)* — a word fails when it holds a `[` (or an escape decoding to
   one), any `$`, and a literal `(`, `{` or backtick appended right after a `$`, a `}`, a `)` or a
   backtick — pros: keyed on the text where the opener forms, so it covers every source of the `$`
   (lesson 007); census vs the previous rule: 0 / 30000 fuzz, 3 / 196 disk scripts newly denied
2. **Patch each spelling** — propagate the `$` flag out of `${ }` and `$( )` bodies, refuse a brace
   group in such a word — cons: a fourth narrowing round, the shape that leaked in the first three
3. **Ship with the spellings open** — cons: the change ships fail-opens of the class it closes

## Decision

Ratified by the user after the measured census: option 1. `append` sets `joinedOpener` when the
appended literal text starts with `(`, `{` or a backtick and the word so far ends with `$`, `}`,
`)` or a backtick; expansion text goes through `appendText`, which never sets it. The bare-`$` flag
the second review round added is removed: the join rule covers its rows, and it no longer denies a
regex end anchor before a later expansion.

## Consequences

A word with `[`, a `$` and a literal opener right after an expansion is denied, whatever reads it.
Measured cost: `eval "$t=(\"\${tags[@]}\")"`-style library idioms (bats-core) and
`printf "[%s] ${c}(%s)" a b` (forgit). The tokeniser cannot tell which words an arithmetic reader
evaluates, so those stay denied.
