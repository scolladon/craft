---
subjects:
  - engine/src/observability/metrics-emit-main.js
---
# 456 — Only the run-level emit-metrics call prints the line

- **Status:** accepted
- **Date:** 2026-10-11
- **Design:** docs/contributing/design/compaction-estimate-at-done.md · **Supersedes/Refines:** none

## Context

`Done` calls emit-metrics once per run and again with `--phase X --since <iso>` for a phase that ran twice.

## Options considered

1. **Only the call without `--phase`** *(recommended)* — pros: once per run, no new surface / cons: a hand run with `--phase` never shows the line
2. **Every call** — cons: a `--since`-cut partial figure printed next to the full one
3. **A new opt-in flag** — cons: one more flag the prose must remember

## Decision

Option 1 — adopted-as-recommended (no user judgment): it matches the existing call pattern and adds no surface (YAGNI).

## Consequences

- A `--phase` call never parses the main transcript.
