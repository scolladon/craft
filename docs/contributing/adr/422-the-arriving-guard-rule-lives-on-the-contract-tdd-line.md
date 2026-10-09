---
subjects:
  - contracts/construction.md
  - agents/part-implementer.md
---
# 422 — The arriving-`GUARD` rule lives on the contract's TDD line

- **Status:** accepted — adopted-as-recommended (no user judgment)
- **Date:** 2026-10-09
- **Design:** docs/contributing/design/arriving-guard-contract-rule.md · **Supersedes/Refines:** none

## Context

The rule for a `GUARD` failing on its first run (ADR-421) needs a home that every part-implementer spawn receives. `contracts/construction.md` is injected into every spawn; `agents/part-implementer.md` is the agent body and has six adapter mirrors.

## Options considered

1. **Line 1 of `contracts/construction.md`, after the `GUARD` sentence** *(recommended)* — pros: reads next to "it must fail" and the `GUARD` exemption it qualifies / cons: line 1 grows
2. **A new line 2 in `contracts/construction.md`** — pros: shorter lines / cons: separates the exemption from its exception
3. **A contract bullet in `agents/part-implementer.md`** — pros: none measured / cons: outside ADR-412's subject; forces regenerating six mirrors

## Decision

Adopted-as-recommended (no user judgment): option 1. The rule is a clause of line 1 of `contracts/construction.md`; no adapter mirror carries it.

## Consequences

- `contracts/` has no adapter mirror and no drift baseline, so the edit regenerates nothing.
