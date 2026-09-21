---
subjects:
  - pipeline/default.yml
  - engine/src/contract.js
---
# 365 — Turn budgets key on archetype plus executing-harness

- **Status:** accepted
- **Date:** 2026-09-20
- **Design:** docs/contributing/design/shrink-agent-context-cost.md · **Supersedes/Refines:** none

## Context

The brief named four budgets — construction 150, harness-exec 150, harness-read 60,
specification 100 — but `harness-exec` and `harness-read` are contract **bundle** names, not
archetypes: both phases carry `archetype: harness`. Three archetypes (`setup`, `refinement`,
`delivery`) got no number at all. The keying had to be settled before any number could be.

## Options considered

1. **Key on archetype plus `isExecutingHarness(descriptor)`** (recommended) — pros: the
   predicate already exists and already splits exactly the two cases the table conflates /
   cons: two keys rather than one.
2. **Archetype alone** — cons: `harness` gets one number covering a reviewer at p90 60 tool
   calls and a triager at p90 313; a single value is useless to one or punitive to the other.
3. **Key on descriptor id in the pipeline, no table** — pros: maximum control / cons: an
   inserted or third-party phase silently gets no budget.

## Decision

Budgets key on `archetype` plus `isExecutingHarness`, giving: construction 150,
harness-exec 150, harness-read 60, specification 100, refinement 130, delivery 150, setup
none (it spawns no agent).

The brief's four numbers encode **two rules**, and the gaps are filled by the rule they
imply. For a role already the right size the budget sits **at** its measured p90 and is a
no-op net — harness-read 60 against reviewer p90 60, specification 100 against planner p90
100. For the two roles that blow up it sits **well below** p90 and is meant to fire —
construction 150 against part-implementer p90 291, harness-exec 150 against triager p90 313.
Refinement 130 (refactor-executor p90 129) and delivery 150 (docs-writer p90 151) follow the
first rule: neither shows the runaway tail that earns a squeeze, and their sample sizes are
too thin to justify one.

## Consequences

- Every archetype has a budget or an explicit reason to have none.
- Two of the six budgets are deliberately non-binding today; they exist so a future
  regression in those roles is caught rather than normalised.
- The numbers are p90-derived and should be re-derived, not re-argued, when the ledger has
  post-change data.
