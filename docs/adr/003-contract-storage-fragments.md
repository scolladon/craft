# 003 — Engine contract stored as composable fragments

- **Status:** accepted
- **Date:** 2026-06-15
- **Design:** docs/DESIGN-customizable-engine.md · **Supersedes/Refines:** none

## Context

P5 relocates the invariant contract out of the agent defs into an engine-owned store, injected
into every run (spawn and inline) so an agent/skill swap can never drop it (G5).

## Options considered

1. **Composable fragment files** under `contracts/`, named by the descriptor's `contract:` —
   DRY, swap-safe, testable assembly / more files. *(recommended)*
2. **One sectioned `contract.md`** — fewer files / assembly must slice sections, easier to inject
   the wrong/extra block.
3. **Leave in skill preambles** — minimal change / an agent swap can drop it (defeats G5).

## Decision

The contract is a set of **composable markdown fragments**
(`contracts/{core,producer,construction,harness-read,harness-exec,delivery}.md`). The universal
core (`core`) always applies; the descriptor's `contract:` names the bundle(s) layered on top
(ADR-006). The Node assembly (ADR-002) concatenates them into the injected block.

## Consequences

One DRY home; assembly is unit-testable (assert the universal core is always present). Agent
defs become thin (role craft only). Pairs with ADR-006 (`contract:` is a list).
