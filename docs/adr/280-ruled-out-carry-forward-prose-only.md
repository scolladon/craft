# 280 — RULED-OUT carry-forward rides the existing prior-findings payload

- **Status:** accepted — adopted-as-recommended (no user judgment)
- **Date:** 2026-07-25
- **Design:** docs/design/sp9-findings-adoption.md · **Supersedes/Refines:** none

## Context

For ruled-out claims to stop being re-litigated, the next convergence cycle's fix-delta
reviewer must see them. The convergence loop already threads a bounded payload: the
normalized prior `Finding[]` plus the fix commits' diff.

## Options considered

1. **Prose-only: include RULED-OUT records in the existing prior-findings payload, with a
   "do not re-raise unless the fix diff reintroduces the condition" instruction**
   *(recommended)* — pros: rides the existing bounded-state channel; no new artifact or
   engine surface; the concrete instance of the bounded-state convention / cons: relies on
   instruction-following rather than mechanics.
2. **A separate carried "ruled-out ledger" artifact** — pros: explicit / cons: a second
   artifact for information the findings list already carries.
3. **Engine-mechanical: a bin computes the carried-forward set** — pros: deterministic /
   cons: new bin + tests for no behavioural gain over option 1.

## Decision

Option 1. `RULED-OUT` records travel inside the same prior-findings payload step 4 already
threads, labelled, with the standing no-re-raise instruction.

## Consequences

Minimal surface; the carry-forward is auditable in the review artifacts. If
instruction-following proves insufficient in practice, option 3 remains open as a
follow-up with a measured motivation.
