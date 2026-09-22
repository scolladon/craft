---
subjects:
  - scripts/run-ledger.sh
  - docs/contributing/specs/run-record.md
supersedes:
  - adr: "377"
    scope: "the pointer's location under <main>/.claude/craft-runs/"
  - adr: "378"
    scope: "the scratch, delta and snapshot location under <main>/.claude/craft-runs/"
---
# 383 — Run state lives under the git common dir, where no commit can write

- **Status:** accepted
- **Date:** 2026-09-22
- **Design:** docs/contributing/design/auto-compaction-safety.md · **Supersedes/Refines:** supersedes ADR-377 and ADR-378 (location only)

## Context

The pointer, scratch, delta and snapshot files lived under `<main>/.claude/craft-runs/`,
inside the working tree. A cloned repository can commit files there. The first fix answered
that with a trust check that refuses git-tracked or symlinked files, but the review showed
the check is case-sensitive while macOS APFS is not. A commit carrying
`.Claude/Craft-Runs/<id>.pointer` lands in the lowercase directory on disk, looks untracked,
and binds a hostile ledger to the run. Every patch to the check leaves the same class of
attack open.

## Options considered

1. **Move the run state to `$(git rev-parse --git-common-dir)/craft-runs/`** *(recommended)* —
   pros: no commit can write inside the git directory, so the whole planted-file class is
   gone; shared by every worktree of the repository / cons: supersedes the location two
   ADRs fixed, and the spec, guide and tests move with it.
2. **Keep `.claude/craft-runs/` and check tracked-ness case-insensitively from the root** —
   pros: stays within the ADRs / cons: keeps the attack surface and depends on every check
   being right on every filesystem.

## Decision

Ratified by the user: option 1. The pointer, scratch, delta and snapshot files live under
`$(git rev-parse --path-format=absolute --git-common-dir)/craft-runs/`, and `run-ledger.sh dir`
prints that directory. The in-tree ledgers (a worktree's or the in-place
`.claude/craft-run-record.md`) stay where they are, and their tracked check becomes
root-relative and case-insensitive.

Superseded from ADR-377: the pointer's location, `<main>/.claude/craft-runs/<run-id>.pointer`.

Carried forward from ADR-377: the pointer binds a run by its run-key found in the session
transcript, and the newest bound run-key wins.

Superseded from ADR-378: the location of the scratch, delta and snapshot files under
`<main>/.claude/craft-runs/`.

Carried forward from ADR-378: a scratch ledger holds the pre-workspace lines and `move` hands
it to the worktree ledger in one call; the delta and snapshot are read at `Done`; `close`
removes the run's files.

## Consequences

- The run directory no longer touches the working tree, so a consumer repository that does
  not ignore `.claude/` sees no untracked run files, only the ledger it already saw.
- Every worktree shares one run directory, because they share one common git dir.
- The spec's "only `.claude/craft-runs/` is written in the checkout" rule becomes "nothing
  but the ledger is written in any working tree".
