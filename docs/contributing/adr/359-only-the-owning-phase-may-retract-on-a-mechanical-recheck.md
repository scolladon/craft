---
subjects:
  - skills/review/SKILL.md
  - docs/contributing/specs/memory.md
---
# 359 — Only the concern-owning phase may retract, on a mechanical re-check

- **Status:** accepted — adopted-as-recommended (no user judgment)
- **Date:** 2026-08-18
- **Design:** docs/contributing/design/decision-drift-propagation.md · **Supersedes/Refines:** none

## Context

RETRACTED evicts a stored entry immediately rather than decaying it by one step. That is a
sharper instrument than DECAY, and the store is committed, so what counts as "proven wrong"
bounds how much damage a wrong retraction can do.

## Options considered

1. **Only the phase owning that concern's write surface, and only on a mechanical re-check of
   the entry's own validated fields** — pros: the retraction is as checkable as the entry it
   kills / cons: narrow; four of five concerns keep passive decay. *(designer's recommendation)*
2. **Any phase may retract any concern on an observed contradiction** — pros: fastest
   correction / cons: lets one phase's judgment evict another's evidence with no re-check.
3. **Derived at `Done` from the ledger**, never phase-emitted — pros: tidy / cons: cannot
   express the actual trigger; a wrong `findings` entry is proven wrong by the reviewer looking.

## Decision

**adopted-as-recommended (no user judgment).** Option 1. `skills/review/SKILL.md` step 3
retracts a `findings` entry when the run re-checked that entry's own `file` + `pattern` at that
location and it is absent.

## Consequences

The content whitelist's "only mechanically-verifiable facts" bound stays intact, and retraction
never becomes an LLM judgment call laundered into a committed file. Only `findings` gains a
documented retraction surface in this change; the transition itself is generic in
`reconcileConcern`, so another concern can adopt it once a phase has a mechanical re-check worth
trusting.
