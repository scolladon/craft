# 267 — opencode git-guard-predicate becomes a thin re-export of the engine module

- **Status:** accepted (adopted-as-recommended, no user judgment)
- **Date:** 2026-07-21
- **Design:** docs/design/harden-prove-codex-binding.md · **Supersedes/Refines:** none

## Context

`COMPLIANT_MARKERS`, `GIT_DIFF_SHOW_RE`, and `REASON_GIT_EXT_DIFF` are copied byte-for-byte
between `engine/src/guards/tool-call-guard.js` (private consts) and
`adapters/opencode/src/git-guard-predicate.js` (two of them exported). A1 lifts these into a
single shared engine module. The question is what becomes of the opencode file, which other
code imports (`gitGuardPredicate`, `COMPLIANT_MARKERS`, `GIT_DIFF_SHOW_RE`) and which
`engine/stryker.conf.json` names in both its `mutate` and `testFiles` lists.

## Options considered

1. **Keep `adapters/opencode/src/git-guard-predicate.js` as a thin re-export of the engine
   module** *(chosen, recommended)* — pros: preserves opencode's public import surface AND its
   Stryker mutate/testFiles pairing with zero config edits; a re-export carries no mutants of
   its own, harmlessly. Cons: one extra indirection file.
2. **Delete it and retarget `engine/stryker.conf.json` (mutate + testFiles) at the engine
   module** — cons: larger blast radius, changes the import surface consumers depend on, and
   edits the shared harness config.

## Decision

`adapters/opencode/src/git-guard-predicate.js` is retained as a thin re-export of the shared
engine module (`export { COMPLIANT_MARKERS, GIT_DIFF_SHOW_RE, gitGuardPredicate } from ...`).
The engine module is the single source of the constants and the predicate; `tool-call-guard.js`
consumes it too. No `engine/stryker.conf.json` edits.

## Consequences

- Opencode's importers and its existing `git-guard-predicate.test.js` stay green unchanged.
- The Stryker `mutate`/`testFiles` pairing for the opencode predicate is undisturbed; the real
  mutation coverage of the predicate logic now lives with the engine module (also under the
  `engine/src/**` glob).
- The three constants have exactly one definition; the residual duplication the backlog flagged
  is closed.
