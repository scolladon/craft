# 239 — pi contract-equivalence via variant reuse (zero-line diff)

- **Status:** accepted
- **Date:** 2026-07-19
- **Design:** docs/design/native-pi-binding.md · **Supersedes/Refines:** Mirrors ADR-220 (opencode reuses agent carve-out, zero-line diff)

## Context

`engine/src/contract.js` expands `@@ARTIFACT_HANDOFF@@` / `@@MODEL_RESOLUTION@@` via `applyCarveOuts` against `AGENT_VARIANTS` / `INLINE_VARIANTS`; `engine/test/contract-equivalence.test.js` proves agent vs inline differ by exactly two lines per descriptor. Both current agent variants are binding-neutral prose. pi's per-phase fresh-run handoff (commit is handoff; a dead run respawns from the artifact) and resolution order are identical to Claude's. The headless pi bin already assembles in agent mode (`run.js` → `assembleBlock`) and introduces zero carve-out variants.

## Options considered

1. **Reuse the existing agent/inline variants → the pi block is byte-identical to Claude's (zero-line diff); assert via `contract-equivalence.test.js`** *(designer recommendation)* — pros: matches the pi/opencode precedent (a runtime binding adds no variant); no `engine/src/contract.js` touch (R-1); stronger than "two lines". Cons: none material.
2. **Add `PI_VARIANTS` + a `--binding` flag → an exactly-two-line diff** — cons: touches the engine for wording that is already binding-neutral.

## Decision

*Adopted as recommended (no user judgment).* Option 1, mirroring ADR-220. The pi native binding reuses the existing `AGENT_VARIANTS`/`INLINE_VARIANTS`; its assembled block per phase+mode is byte-identical to the Claude binding's. `engine/test/contract-equivalence.test.js` is extended to assert the pi agent-mode `assembleBlock` output ⊆ Claude's + the two carve-out lines — with an actual zero-line diff. No `contract.js` change.

## Consequences

- R-6 ("differs by at most the two carve-out lines") is satisfied in its strongest form (zero-line diff).
- The engine contract seam is untouched (R-1); no binding-specific variant set exists.
- Any wording that ever needed to differ for pi would reopen this as a two-line carve-out; today none does.
