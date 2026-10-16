---
subjects:
  - engine/test/guards
supersedes: []
---
# 591 — The fuzz git leg is exact only on the pinned git

- **Status:** accepted — adopted-as-recommended (no user judgment)
- **Date:** 2026-10-15
- **Design:** docs/contributing/plan/copilot-git-argv-normalising-guard.md

## Context

The differential fuzz checks the normaliser's option table against real git. The table is pinned
from git 2.54; CI's git version is not pinned, and an older git rejects newer flags the table
accepts.

## Options considered

1. **Exact match on 2.54.x; elsewhere check only the unsafe direction** *(recommended)* — a case
   where real git reaches a subcommand the normaliser did not report still fails.
2. **Exact match everywhere** — cons: fails on an older git for no real defect.
3. **Skip the leg unless git is 2.54.x** — cons: no net on other versions.

## Decision

Adopted-as-recommended (no user judgment): option 1; aligns with the no-invented-problems rule (a
version skew is not a defect, a missed subcommand is).

## Consequences

A git upgrade that changes the option table shows up as an exact-leg failure on that version.
