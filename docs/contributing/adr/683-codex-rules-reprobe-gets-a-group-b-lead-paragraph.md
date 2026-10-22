---
subjects:
  - BACKLOG.md
supersedes: []
---
# 683 — The codex rules re-probe gets its own group B lead paragraph

- **Status:** accepted — adopted-as-recommended (no user judgment)
- **Date:** 2026-10-22
- **Design:** docs/contributing/design/codex-0163-rules-reprobe.md · **Supersedes/Refines:** none

## Context

Group B records each finished run as one `Delivered <date> (<slug>)` lead paragraph; this run re-probed three rows of the open malformed-rules entry.

## Options considered

1. **A new `Delivered 2026-10-22 (codex-0163-rules-reprobe)` lead paragraph; existing leads untouched** *(recommended)*
2. **Append a dated clause to the codex-tui-malformed-rules-probe lead** — cons: edits a delivered paragraph
3. **Only the entry's dated re-probe paragraph** — cons: no group-level trace of the run

## Decision

Adopted-as-recommended (no user judgment): option 1. Aligns with group B's one-lead-per-run convention.

## Consequences

The entry stays open; its body gains a dated 0.163.0 paragraph.
