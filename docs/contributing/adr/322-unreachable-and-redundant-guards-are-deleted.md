# 322 — Unreachable and redundant guards in the findings normalizer are deleted, not documented

- **Status:** accepted
- **Date:** 2026-07-31
- **Design:** docs/contributing/design/scheduled-backlog-sweep.md · **Supersedes/Refines:** none

## Context

A full-file mutation run over `engine/src/findings.js` left 33 unkilled mutants to triage. Nine of
them sit on three guards that are mutually redundant:

- `parseJsonShape`'s `!Array.isArray(parsed)` throw — private, and only ever called after
  `looksLikeJsonArray`, so its input always starts with `[`; `JSON.parse` of such a string either
  throws or yields an array. Probed with `'['`, `'[]x'`, `'[[]]'`, `'[1,2]'`, `'[null]'`.
- `parseLineShape`'s `nonBlank.length === 0` early return — private, and only ever called with a
  non-empty trimmed string, so it always sees at least one non-blank line.
- `normalizeFindings`'s `trimmed === ''` early return — reachable, on the public entry point, and
  the executable form of its JSDoc's "Zero findings → []".

The repo's convention offers exactly two outcomes per survivor: kill it with a real test, or
document it in place as `// equivalent mutant (<Kind>): <why no caller can observe it>`. Neither
fits a branch that cannot execute — a test cannot reach it, and an equivalent-mutant comment would
be defending code rather than explaining it. The no-dead-code guardrail says what to do instead.

## Options considered

1. **Delete only the two provably unreachable private guards; keep `normalizeFindings`'s as the executable form of its public contract, documenting its 3 mutants as equivalent** *(recommended)* — pros: the public contract stays stated rather than inferable / cons: spends three comments on a guard whose behaviour is already reproduced by the code below it.
2. **Delete all three** — pros: removes all 9 mutants, leaves `normalizeFindings` a clean two-line dispatch, and treats reachability consistently rather than making an exception for the public entry / cons: the empty-input contract becomes inferable from the code path rather than stated by a guard.
3. **Keep all three and document 9 equivalent mutants** — pros: no code deleted / cons: spends six comments defending code no caller can reach.

## Decision

**Ratified by the user, deviating from the design's recommendation.** All three guards are deleted.

Deletion is behaviour-preserving in every case, which is what makes the deviation safe rather than
merely tidier. With `normalizeFindings`'s guard gone, empty input falls through
`looksLikeJsonArray('')` (false) into `parseLineShape('')`, whose split-and-filter yields no
non-blank lines and whose loop therefore returns `[]` — the same value by the same contract.

The rule for future work: in this module, a guard whose branch no caller can execute is dead code
and is deleted. A guard that merely restates what the code below it already does is deleted too;
the contract is documented in JSDoc, not duplicated as an executable early return.

## Consequences

The instrumented mutant count drops by 9, and that drop is accounted for by deliberate deletion
rather than by weakened coverage — which is the distinction the mutation-baseline requirement
turns on. `normalizeFindings`'s JSDoc must continue to state "Zero findings → []" explicitly,
because after this change nothing in the code says it at that level; the test suite carries the
executable proof instead, and an empty-input case is therefore not optional.

This is a narrower ruling than "delete every redundant guard in the engine". It is scoped to this
module, where the reachability of all three branches was verified by probe rather than argued.
