# 088 — Pi PoC scope: a single construction-bearing phase end-to-end

- **Status:** accepted
- **Date:** 2026-06-20
- **Design:** docs/DESIGN-P16-provider-agnostic.md · **Supersedes/Refines:** none

## Context
The program gate is "the Pi adapter runs *a* scenario" (PRD §17 P16). The PoC must prove
portability exists, not feature-parity. Scope choice trades runtime-integration surface against
proof value.

## Options
1. **Single construction-bearing phase** (e.g. `implementation` on a tiny free-text brief) — pros: exercises the load-bearing ports together (Execution, Model, Gate, VCS), is the literal gate, needs no Pi sub-agents / cons: not a full pipeline. *(designer's recommendation, chosen)*
2. **Short multi-phase part (design→implementation)** — pros: more of the pipeline / cons: multiplies integration surface for no extra portability proof.
3. **Full default pipeline** — pros: maximal / cons: forces the sequential-fan-out story for review before it is needed; flaky external surface.

## Decision
The PoC runs **one construction-bearing phase** end-to-end through the Pi adapter, in an
isolated throwaway repo. Passing it satisfies R-pi-scenario.

## Consequences
- The PoC exercises Execution + Model + Gate + VCS together — the minimal set that proves the seam.
- Multi-phase / full-pipeline Pi runs and the sequential-fan-out review story are deferred (design Out of scope).
- The acceptance probe asserts mechanism/shape (RED→GREEN→commit, gate-green-before-commit), never LLM prose.
