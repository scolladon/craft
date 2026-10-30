---
subjects:
  - hooks/progress/bind.ts
supersedes: []
---
# 720 — A run with no pipeline list keeps the old status line

- **Status:** accepted
- **Date:** 2026-10-30
- **Design:** docs/contributing/design/progress-status-line-bar.md · **Supersedes/Refines:** none

## Context

A run opened before the `EFFECTIVE:` line existed has no pipeline list, so it has no total to
draw a bar or a `next` against.

## Options considered

1. **Today's line verbatim**: `craft <run-id> · <phase> · <done>/<total>[ · <attention>]`
   *(recommended)*
2. **Unknown total**: `craft <done>/? · ▸ <phase>[ · <attention>]` — cons: a second grammar
   for a shrinking case
3. **Seen total**: `craft <done>/<seen> · ▸ <phase>` — cons: a total that grows mid-run

## Decision

Option 1, ratified by the user.

## Consequences

Only runs predating `EFFECTIVE:` show the run-id; the set only shrinks.
