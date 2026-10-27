---
subjects:
  - skills/run/SKILL.md
  - docs/contributing/specs/run-record.md
  - engine/src/run-progress.js
---
# 714 — The ledger seeds an EFFECTIVE phase list

- **Status:** accepted
- **Date:** 2026-10-27
- **Design:** docs/contributing/design/run-visibility-task-list.md · **Supersedes/Refines:** none

## Context

A run view must list pending phases, which only `Resolution.effective[]` knows. Re-deriving it from the `RESOLVE:` line means re-implementing prose-only flag parsing and the two-scope `--config` lookup (`pipeline-resolve` refuses `--config`), and it drifts when the manifest is edited mid-run. The brief allowed a ledger-format change only when proven needed.

## Options considered

1. **Seed `EFFECTIVE: <ids comma-joined>` at §0 step 4, read only by `run-progress`** *(recommended)* — pros: freezes what the run resolved; a new token, not a new line shape; `run-state` ignores it / cons: one more token in the vocabulary
2. **Re-resolve from `RESOLVE:` per refresh** — cons: duplicates step 0a/0b; two Node spawns per refresh; drift
3. **Ledger-only: list phases the ledger has named** — cons: no pending phases

## Decision

Option 1, ratified by the user. Ledgers without the line fall back to option 3.

## Consequences

The run-record token table gains an `EFFECTIVE:` row. A malformed record warns and falls back to ledger-only.
