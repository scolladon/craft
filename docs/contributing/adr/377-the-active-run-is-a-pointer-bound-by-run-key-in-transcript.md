---
subjects:
  - scripts/run-ledger.sh
  - hooks/reorient-after-compact.sh
---
# 377 — The active run is a pointer file bound to its session by a run-key in the transcript

- **Status:** superseded by ADR-383
- **Date:** 2026-09-22
- **Design:** docs/contributing/design/auto-compaction-safety.md · **Supersedes/Refines:** none

> **Superseded by ADR-383** for location only: the run files live under the git common dir,
> where no commit can write, not under `<main>/.claude/craft-runs/`. Everything else below stands.

## Context

The compaction hooks run with the session cwd. Under the worktree strategy that is the main
checkout, while the ledger lives in the worktree. A hook must therefore find the ledger of the run
driven by *this* session, and stay silent for a crashed run's residue or a run owned by another
session.

## Options considered

1. **A pointer `<main>/.claude/craft-runs/<run-id>.pointer` holding `<run-key> <ledger-path>`, bound
   when `<run-key>` occurs in the payload's transcript** *(recommended)* — pros: O(1) lookup; covers
   the pre-workspace window; a crashed run's key is never in another session's transcript / cons:
   relies on a Bash call's stdout being stored verbatim in the transcript (pinned, P2).
2. **Scan `git worktree list` and probe ledgers, same binding** — cons: still needs a scratch file for
   the pre-workspace window.
3. **A pointer bound by `session_id`** — cons: the orchestrator would have to learn its own session
   id, which is unpinned.

## Decision

Adopted-as-recommended (no user judgment): option 1 is the only one that covers the whole run
without an unpinned dependency. `<main>` is the directory of
`git rev-parse --path-format=absolute --git-common-dir`, which is the same from the checkout, a linked
worktree or a subdirectory. `<run-key>` is `<run-id>@<UTC ISO-8601 seconds>`, printed by `open`. When
several bound pointers match, the newest run-key wins.

## Consequences

- An on-demand live smoke confirms the key lands in a real main-session transcript.
- `open` sweeps every pointer whose ledger no longer exists.
