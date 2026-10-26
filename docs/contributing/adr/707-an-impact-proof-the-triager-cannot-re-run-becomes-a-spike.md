---
subjects:
  - agents/impact-triager.md
supersedes: []
---
# 707 — An impact proof the triager cannot re-run becomes a spike

- **Status:** accepted — adopted-as-recommended (no user judgment)
- **Date:** 2026-10-26
- **Design:** docs/contributing/design/discovered-impacts.md · **Supersedes/Refines:** none

## Context

Some proofs come from live, paid or networked probes, or would write outside the throwaway. The triager must not run them.

## Options considered

1. **`reject`** — cons: drops real findings from the live probes this repo relies on
2. **`backlog:spike`, rationale `proof recorded, not re-run: <why>`, question = reproduce it** *(recommended)* — pros: the proof exists but is unverified, which is what a spike is for
3. **Ask the user per entry** — cons: a round trip the visible verdict table already covers

## Decision

Option 2.

## Consequences

Spike entries can carry an unverified proof, flagged as such in their rationale.
