---
subjects:
  - engine/src/hygiene-lint-core.js
---
# 481 — The core composes the anchored waiver pattern

- **Status:** accepted
- **Date:** 2026-10-11
- **Design:** docs/contributing/design/waiver-mention-not-waiver.md · **Supersedes/Refines:** refines ADR-479

## Context

The anchor and the `: <reason>` suffix can live in each gate's regex or once in the shared
core.

## Options considered

1. **`collectWaived` anchors the gate's bare pattern as `^(?:<source>):\s*\S` per unfenced line** *(recommended)* — pros: one place; gate constants, signature and call sites unchanged / cons: the core rebuilds the regex per call
2. Each gate regex becomes `^TOKEN\(([^)]+)\):\s*\S` with `m` — cons: grammar copied three times; one missing `^` reopens the hole
3. Gates pass a token name and the core builds the regex — cons: signature, three callers and tests change with no behaviour gain

## Decision

Option 1 — ratified by the user. Gates keep passing a bare token pattern with the path in
group 1; the core owns the grammar.

## Consequences

Adding a fourth waiver token needs no knowledge of the anchoring rule.
