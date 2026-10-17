---
subjects:
  - skills/run/SKILL.md
  - engine/src/driver-state.js
---
# 626 — A driven run that did not merge reports BLOCKED integrate: not merged

- **Status:** accepted
- **Date:** 2026-10-17
- **Design:** docs/contributing/design/driver-contract-in-craft-run.md · **Supersedes/Refines:** none

## Context

The spike driver already treats `FINISHED` on an unmerged PR as an error (exit 6). The next entry would branch from a main without this change.

## Options considered

1. **`BLOCKED integrate: not merged <pr-or-branch>`** *(recommended)* — keeps two verbs and `FINISHED` = merged
2. **`FINISHED <pr>` regardless** — cons: the driver must re-check
3. **A third verb `PROPOSED`** — cons: breaks two-verb drivers

## Decision

**adopted-as-recommended (no user judgment)** — option 1. `FINISHED <url>` means merged. Any run reaching §Done without a merge closes its ledger as before and writes `BLOCKED integrate: not merged <pr-or-branch>` with no election.

## Consequences

- None beyond the decision.
