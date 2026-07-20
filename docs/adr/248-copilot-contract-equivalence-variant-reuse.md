# 248 — Copilot contract-equivalence via variant reuse (zero-line diff)

- **Status:** accepted
- **Date:** 2026-07-20
- **Design:** docs/design/native-copilot-binding.md · **Supersedes/Refines:** Mirrors ADR-220 (opencode) and ADR-239 (pi)

## Context

`engine/src/contract.js` expands `@@ARTIFACT_HANDOFF@@` / `@@MODEL_RESOLUTION@@` via `applyCarveOuts` against `AGENT_VARIANTS` / `INLINE_VARIANTS`, and `engine/test/contract-equivalence.test.js` proves agent vs inline assembly differ by exactly two lines per descriptor. Both opencode (ADR-220) and pi (ADR-239) set the precedent that a new runtime binding **reuses** the existing variant sets rather than adding a third. Copilot is agent-mode — it has real subagents (ADR-244) — so it takes the same agent-mode carve-outs as Claude and opencode. Both current agent variants are binding-neutral prose.

## Options considered

1. **Reuse the existing `AGENT_VARIANTS` → the Copilot block is byte-identical to Claude's (zero-line diff)** *(designer recommendation)* — pros: matches the ADR-220/239 precedent; no `engine/src/contract.js` touch; satisfies the requirement in its strongest form. Cons: none material.
2. **Add a copilot-specific variant set** — cons: forks the invariant contract, an explicit non-goal; breaks the "exactly two differing lines" assertion.
3. **Add a third mode** — cons: same, and with no motivating difference.

## Decision

*Adopted as recommended (no user judgment).* Option 1, mirroring ADR-220 and ADR-239. The Copilot binding reuses the existing `AGENT_VARIANTS`/`INLINE_VARIANTS`; its assembled block per phase+mode is **byte-identical** to the Claude binding's. `engine/test/contract-equivalence.test.js` is extended to assert this with an actual zero-line diff, and continues to assert exactly two differing lines between agent and inline modes. No `contract.js` change.

## Consequences

- The success criterion "differs from Claude's by at most the two carve-out lines" is satisfied in its strongest form (zero lines).
- The engine contract seam is untouched; no binding-specific variant set exists in the tree.
- Any wording that ever needed to differ for Copilot would reopen this as a two-line carve-out; today none does.
