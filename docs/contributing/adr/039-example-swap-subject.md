# 039 — Example swap subject: `implementation.role: acme:tdd-specialist`

- **Status:** accepted
- **Date:** 2026-06-17
- **Design:** docs/DESIGN-P9-agent-swap.md · **Supersedes/Refines:** none

## Context

P9 ships an `examples/` sample demonstrating a manifest role swap, mirroring `examples/lean-profile/`
(a single `workflow.md`: frontmatter manifest + prose body). Which swap it illustrates is a UX choice:
the example is the first thing a customizer copies, so its subject sets the mental model.

## Options considered

1. **`planning.role: my:domain-planner`** — matches the S2 fixture and PRD §7 #10 + §5 deep-customizer
   ("Swap the planner"); `planning` has a local default agent, so it leads with the happy local-swap
   path. *(designer's recommendation)*
2. **`review.role: my:security-reviewer`** — a harness-archetype swap; shows swap works on a harness
   role too, but drags in the harness-parallelism caveat.
3. **`implementation.role: acme:tdd-specialist`** — the code-producer, the highest-stakes swap; `acme:`
   is external (contract-only inline per ADR-020), so the example leads with the most demanding path.
   *(user choice)*

## Decision

The example swaps the **implementation** phase's role to an external `acme:tdd-specialist`. This is the
deliberate, demanding case: the highest-stakes phase (the code producer) handed to an external agent the
local repo does not define. The example's prose must therefore carry the full story — contract-survives-
swap (G5) around an external worker; the agent-vs-inline distinction (external role runs on the contract
block alone inline, per ADR-020); and that the engine `roleExists` guard (ADR-037) still requires the ref
to resolve, so `acme:tdd-specialist` is valid only when that plugin is installed (a typo still fails
closed). The example shows the swap is first-class even at the hardest point, not only for a local
agent.

## Consequences

The sample leads with the external/contract-only path rather than the gentle local swap — a deliberate
choice to demonstrate the strongest claim (a swap can't drop the contract even when the worker is
external and the repo can't see its body). The prose must explicitly flag that `acme:tdd-specialist`
presumes that plugin is installed (ADR-037 fails closed otherwise) and that inline execution of an
external role is contract-only by design (ADR-020) — so a reader does not mistake the contract-only
inline behaviour for a defect. The example is prose; no automated test asserts its content (consistent
with `lean-profile`), though its frontmatter manifest is implicitly lint-clean.
