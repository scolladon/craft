---
subjects:
  - docs/contributing/specs/codex-poc-record.md
supersedes: []
---
# 681 — The stub-git bypass under a login shell is stated in the batch method, not as a general rule

- **Status:** accepted — adopted-as-recommended (no user judgment)
- **Date:** 2026-10-22
- **Design:** docs/contributing/design/codex-0163-rules-reprobe.md · **Supersedes/Refines:** none

## Context

A stub `git` first on `PATH` was skipped by the tool shell: `/bin/zsh -lc` resolves `/usr/bin/git` (macOS `/etc/zprofile` path_helper), so two TUI runs ran the real git. `VICTIM.txt` stayed the ground truth.

## Options considered

1. **In the signed-in subsection's method paragraph, as the reason `VICTIM.txt` is the ground truth** *(recommended)*
2. **Option 1 plus a general rule in the open-rows method note** — cons: a rule for every future probe from one environment's measurement
3. **Design doc only** — cons: the record's TUI row reads inconsistent without it

## Decision

Adopted-as-recommended (no user judgment): option 1. Aligns with the evidence rule: a claim sits beside the measurement that proves it, scoped to where it was measured.

## Consequences

The TUI rows' mix of stub hits and real deletions is explained where it is recorded.
