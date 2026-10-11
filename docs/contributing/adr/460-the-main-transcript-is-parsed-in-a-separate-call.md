---
subjects:
  - engine/src/observability/metrics-emit-main.js
---
# 460 — The main transcript is parsed in a separate call

- **Status:** accepted
- **Date:** 2026-10-11
- **Design:** docs/contributing/design/compaction-estimate-at-done.md · **Supersedes/Refines:** none

## Context

Rows must stay byte-identical while the main transcript is read for compactions.

## Options considered

1. **A second `streamTranscriptFiles` call over the main entry only, made only when the line is wanted** *(recommended)* — pros: rows unchanged by construction; the large main transcript is read only when needed
2. **Widen the existing call's scope** — cons: row identity relies on two filters; parses the main transcript on `--phase` calls too

## Decision

Option 1 — adopted-as-recommended (no user judgment): the invariant holds by construction, not by filtering.

## Consequences

- The main entry is selected by exact `<session>.jsonl` match among discovered entries.
