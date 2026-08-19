---
subjects:
  - engine/src/observability/memory.js
  - docs/contributing/specs/run-record.md
---
# 360 — `MEMORY-RETRACT` carries a retraction across the ledger hop

- **Status:** accepted
- **Date:** 2026-08-18
- **Design:** docs/contributing/design/decision-drift-propagation.md · **Supersedes/Refines:** none

## Context

`delta` is not assembled in memory across the run — it is derived from the run-record ledger at
`skills/integrate/SKILL.md` step 3, as concern-keyed facts, at the last point the worktree is
alive. A retraction must survive that hop.

## Options considered

1. **A new fixed token `MEMORY-RETRACT(<concern>): <merge-key>`**, derived at step 3 into
   `{ …, retract: true }` — pros: greppable, attributable by the ledger's phase column, survives
   a context reset / cons: one more token. *(designer's recommendation)*
2. **A polarity marker on the phase's existing buffered `findings` line** — pros: no new token /
   cons: overloads a line whose derivation rule has one meaning today, so a mis-derivation
   silently adds the entry it meant to kill.
3. **No ledger hop — mutate the in-session `MemoryView` directly** — pros: simplest / cons:
   breaks the documented contract where `view` is the run-start view; mutating it is what makes
   non-re-observed entries vanish instead of decay.

## Decision

Option 1, **ratified by the user** as part of accepting all three new tokens. The token inherits
the ledger's path/secret scrub unmodified — a `findings` merge key is `file` + `pattern`, and
`file` is stored repo-relative.

## Consequences

The vocabulary grows from 11 tokens to 14 in this change (`DECISION-REVERSAL`,
`DECISION-CITE-WAIVE`, `MEMORY-RETRACT`) — a cost accepted deliberately rather than absorbed
silently. The single-writer rule is untouched: the phase emits, the orchestrator appends.
