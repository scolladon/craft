---
subjects:
  - engine/src/observability/metrics-emit-main.js
---
# 457 — A missing --session skips the estimate with a stderr note

- **Status:** accepted — ratified by the user
- **Date:** 2026-10-11
- **Design:** docs/contributing/design/compaction-estimate-at-done.md · **Supersedes/Refines:** none

## Context

Without `--session`, discovery covers every session in the project dir, so a compaction figure would sum unrelated runs.

## Options considered

1. **Nothing on stdout, one stderr note** *(recommended)* — pros: a forgotten flag stays visible / cons: one exact-stderr test's expected string changes
2. **Silent** — cons: hides the estimate again with no sign
3. **Fold all sessions** — cons: mixes unrelated runs

## Decision

Option 1, ratified by the user: `metrics-emit: no --session, compaction estimate skipped`, on the run-level call only.

## Consequences

- Exit code stays 0; the note is advisory.
