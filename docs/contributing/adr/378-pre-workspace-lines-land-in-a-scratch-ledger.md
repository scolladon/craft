---
subjects:
  - scripts/run-ledger.sh
  - docs/contributing/specs/run-record.md
---
# 378 — Pre-workspace lines land in a scratch ledger under `.claude/craft-runs/`

- **Status:** superseded by ADR-383
- **Date:** 2026-09-22
- **Design:** docs/contributing/design/auto-compaction-safety.md · **Supersedes/Refines:** refines ADR-300 and ADR-301

> **Superseded by ADR-383** for location only: the run files live under the git common dir,
> where no commit can write, not under `<main>/.claude/craft-runs/`.
>
> **Superseded by ADR-384** for the scratch ledger and the `move` hand-off: each run's ledger
> is created in the git common dir at `open` and never moves.

## Context

Flushing per line (ADR-372) needs a file before `workspace` creates the worktree. The run-record spec
said nothing is ever written to the pre-worktree checkout, so that the ledger never outlives the run,
never accumulates across runs, and never splits one run across two files. The memory delta is held
in session from integrate step 3 until `Done` across teardown (ADR-301's consequence), which exposes
it to the same compaction risk.

## Options considered

1. **`<main>/.claude/craft-runs/<run-id>.pre.md`, moved into the worktree ledger at `workspace`**
   *(recommended)* — pros: one run directory, swept by `open`; answers the three reasons one by one /
   cons: amends the spec's no-checkout-write rule.
2. **An out-of-tree mktemp file named by the pointer** — cons: extra temp-cleanup semantics, and the
   pointer already writes the checkout.
3. **No scratch file; re-run §0 after a pre-workspace compaction** — pros: cheapest, since every
   pre-workspace line is re-derivable / cons: contradicts the brief's scope item 1.

## Decision

Adopted-as-recommended (no user judgment): option 1 matches the brief, and option 3 contradicts it.
Before `workspace`, lines append to `<main>/.claude/craft-runs/<run-id>.pre.md`. The `move` verb
appends its body in order to the worktree ledger, retargets the pointer and removes the scratch, all
in one invocation. The same directory holds `<run-id>.delta.json`, the memory delta from integrate
step 3 to `Done`. `close` removes the run's files. Under the in-place strategy there is no scratch
file.

## Consequences

- The spec's rule becomes "only `.claude/craft-runs/` is written in the checkout, and `close` empties
  it for the run". The ledger itself stays in the worktree and stays gitignored (ADR-301).
- `save` at `Done` reads the delta file, never a summarised delta.
