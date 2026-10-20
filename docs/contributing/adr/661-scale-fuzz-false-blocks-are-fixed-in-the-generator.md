---
subjects:
  - engine/test-helpers/git-differential-harness.js
  - engine/test/guards/shell-git-invocations.differential.test.js
supersedes: []
---
# 661 — Scale-fuzz false blocks are fixed in the generator, not the predicates

- **Status:** accepted — adopted-as-recommended (no user judgment)
- **Date:** 2026-10-20
- **Design:** docs/contributing/design/guard-fuzz-scale-ext-diff-widen.md · **Supersedes/Refines:** none

## Context

At `GUARD_FUZZ_COUNT=1500` on fresh seeds, the engine fuzz reports unexpected false blocks. Each
reproduces deterministically and is safe-direction: the predicates block and bash ran no blocked
argv. The causes are generator mis-models (a definition in a pipeline element, a SIGPIPE-killed
upstream, `time` treated as simple) and two bash 3.2 behaviours (brace expansion across a whole
`<( … )` word, a heredoc body with an odd quote inside `$( )`).

## Options considered

1. **Fix the generator at the composer, tag the two shell behaviours at their construct**
   *(recommended)* — pros: the census stays a gate; an exemption cannot hide a false block from
   another construct / cons: generator code grows
2. **Exempt by stderr or command regex** — pros: small / cons: hides real false blocks that share
   the text shape
3. **Make the oracle wait for process substitutions** — pros: none here / cons: the evidence shows
   no race, so it fixes nothing

## Decision

Adopted-as-recommended (no user judgment): option 1. The predicates do not change for this entry.
The heredoc-quote tag exempts both the syntax check and the false-block check, like the
existing unterminated tag: bash 3.2 rejects the whole command and runs none of it.

## Consequences

A fresh-seed scaled run is expected green on bash 3.2. The bash ≥ 5 arm at scale is unverified on
a box without bash 5.
