---
subjects:
  - skills/review/SKILL.md
---
# 381 — Review findings persist out of tree, one file per dimension and cycle

- **Status:** accepted
- **Date:** 2026-09-22
- **Design:** docs/contributing/design/auto-compaction-safety.md · **Supersedes/Refines:** none

## Context

The review phase normalises each reviewer's findings, then applies fixes. Between those two steps,
the normalised `Finding[]` exists only in session context, so a compaction there loses the list of
fixes still owed.

## Options considered

1. **Out-of-tree `mktemp -d`, one `<dim>.c<N>.json` per dimension and cycle, path on a
   `FINDINGS(<dim>): c<N> <path> n=<count>` ledger line** *(recommended)* — pros: follows the
   validation phase's out-of-tree precedent; no sweep risk in repos that do not ignore `.claude/` /
   cons: temp files outlive the run until the OS clears them.
2. **`<worktree>/.claude/craft-review/`** — cons: an untracked in-tree directory in consumer repos.
3. **Inline in the ledger** — cons: floods the reorient block's tail.

## Decision

Adopted-as-recommended (no user judgment): it aligns with the producer contract's throwaway
discipline and the validation precedent. The Bash call that writes a findings file also appends its
`FINDINGS` line.

## Consequences

- A rebuild reloads the current cycle's findings from the recorded paths. A dimension with no
  `FINDINGS` line for the cycle is respawned (ADR-376).
