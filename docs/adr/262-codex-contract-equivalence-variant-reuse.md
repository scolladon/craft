# 262 — Codex contract equivalence via variant reuse

- **Status:** accepted
- **Date:** 2026-07-20
- **Design:** docs/design/native-codex-binding.md · **Supersedes/Refines:** Mirrors ADR-248 (copilot), ADR-239 (pi), and ADR-220 (opencode)

## Context

`engine/src/contract.js` expands `@@ARTIFACT_HANDOFF@@`/`@@MODEL_RESOLUTION@@` through `AGENT_VARIANTS`/`INLINE_VARIANTS`, and `engine/test/contract-equivalence.test.js` proves agent vs inline assembly differ by exactly two lines per descriptor. Codex is agent-mode — it has real subagents (ADR-254) — so it takes the same agent-mode carve-outs as Claude, opencode, and copilot. ADR-220/239/248 already set the precedent that a new binding reuses the existing variant sets rather than adding a third.

## Options considered

1. **Reuse the existing `AGENT_VARIANTS`/`INLINE_VARIANTS`** → the Codex block is byte-identical to Claude's (zero-line diff); add a fourth binding-fidelity test asserting a `codex` hint is ignored *(chosen)* — pros: matches the established precedent; no `contract.js` touch; `contracts/**` stays byte-unchanged. Cons: none material.
2. **Add a codex-specific variant set** — cons: forks the invariant contract (an explicit non-goal) and breaks the "exactly two differing lines" assertion the test suite exists to defend.
3. **Reuse the variants but add no new test** — cons: saves ~15 lines and forfeits the assertion that a future change never keys a variant off the binding name — the exact regression the existing three tests guard against.

## Decision

*Adopted as recommended (no user judgment).* Option 1, mirroring ADR-220, ADR-239, and ADR-248 with a **zero-line diff**. `engine/test/contract-equivalence.test.js` gains a fourth near-identical binding-fidelity test for `codex`, one more instance of an established pattern; `contracts/**` and `engine/src/contract.js` stay byte-unchanged.

## Consequences

- This is a zero-line diff in `engine/src/contract.js` — the fourth binding to establish this precedent without forking the invariant contract.
- The engine contract seam stays untouched; no binding-specific variant set exists anywhere in the tree.
- The existing assertion (agent vs inline differ by exactly two lines) continues to hold unmodified.
