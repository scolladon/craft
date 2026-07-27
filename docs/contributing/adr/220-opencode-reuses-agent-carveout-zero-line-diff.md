# 220 — opencode binding reuses the agent carve-out (zero-line diff)

- **Status:** accepted
- **Date:** 2026-07-17
- **Design:** docs/design/opencode-adapter.md · **Supersedes/Refines:** none

## Context

R-SC5/R-G6 require the opencode-binding assembled contract block to carry the identical core floors as the Claude binding. `engine/src/contract.js` expands `@@ARTIFACT_HANDOFF@@` / `@@MODEL_RESOLUTION@@` against `AGENT_VARIANTS` / `INLINE_VARIANTS`; both agent-variant lines are binding-neutral prose. Pi adds no variant — the substitution dimension is `{agent, inline}` (topology), never `{claude, pi}` (runtime).

## Options considered

1. **Reuse the agent variant → block byte-identical to Claude (zero-line diff); assert via `contract-equivalence.test.js`** *(designer recommendation)* — pros: matches the pi precedent (a binding adds no variant); no `contract.js` touch (R-G1); stronger fidelity than "two lines differ". Cons: none material.
2. **Add `OPENCODE_VARIANTS` + a `--binding` flag → exactly-two-line diff** — cons: touches `engine/src/contract.js` for wording that is already binding-neutral.
3. **Parameterize the carve-outs another way** — cons: complexity without benefit.

## Decision

*Adopted-as-recommended (no user judgment).* The opencode subagent binding reuses **agent-mode** assembly; the assembled block is byte-identical to the Claude-binding block for the same phase+mode. No opencode branch is added to `contract-assemble`/`contract.js`.

## Consequences

- `engine/src/contract.js` is untouched (R-G1).
- SC5's assertion becomes: the opencode binding path invokes agent-mode assembly and the two carve-out lines are the only binding-nameable slots — an extension of `contract-equivalence.test.js`.
