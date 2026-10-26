---
subjects:
  - skills/run/SKILL.md
supersedes: []
---
# 700 — Policy decides fold or defer, and a fork goes to the user

- **Status:** accepted — adopted-as-recommended (no user judgment)
- **Date:** 2026-10-26
- **Design:** docs/contributing/design/discovered-impacts.md · **Supersedes/Refines:** refines ADR-608

## Context

Each impact needs a fold-or-defer verdict at the moment it surfaces. Asking the user every time turns every out-of-scope note into a round trip; never asking moves user decisions into backlog entries.

## Options considered

1. **The existing boundary rule decides; only a fix that needs a new decision goes to the user** *(recommended)* — pros: matches the decisions phase adopt-vs-escalate rule and documentation step 3.2 today / cons: none measured
2. **Every impact goes to the user** — cons: one round trip per out-of-scope note
3. **Policy only; a fork is deferred automatically** — cons: a decision the user should take becomes a backlog entry, the growth the change targets

## Decision

Option 1. The boundary rule of ADR-608 applies unchanged, with "filed" read as "deferred". A fix that needs a new decision goes to the user through the blocker protocol: fold with an ADR, or defer with reason `needs its own decision`.

## Consequences

The user sees only genuine forks mid-run. The rule itself does not change; only where it is applied does.
