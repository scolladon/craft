---
subjects:
  - engine/src/claude-ext-diff-hook-main.js
  - test/hooks.test.js
supersedes: []
---
# 648 — The Claude ext-diff hook denies with the engine reason

- **Status:** accepted — adopted-as-recommended (no user judgment)
- **Date:** 2026-10-18
- **Design:** docs/contributing/design/claude-ext-diff-hook-gaps.md · **Supersedes/Refines:** none

## Context

The hook's deny reason ends with "Re-issue exactly: <fixed>", a `sed` rewrite of the command. Under
ADR-646 the verdict comes from the engine parse, which keeps no source offsets, and the rewrite is wrong
on quoted text and absent on forms the regex cannot see (`sh -c`).

## Options considered

1. **Engine reason, `craft: `-prefixed** *(recommended)* — pros: one reason across bindings; correct on
   every form / cons: no ready-made corrected command
2. **Engine verdict plus the old `sed` rewrite** — cons: puts the regex back, with its wrong "exactly"
3. **Source offsets in the tokeniser for a parse-derived rewrite** — cons: a tokeniser change across
   every binding for a hint

## Decision

Adopted-as-recommended (no user judgment): option 1. The deny's `permissionDecisionReason` is the
engine reason with a `craft: ` prefix, not doubled when the reason already starts with it.

## Consequences

The hook-test assertions on the corrected command move to the engine reason. Config-channel, alias and
parse-failure denies read the same way as the plain ext-diff deny.
