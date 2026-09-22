---
subjects:
  - scripts/run-ledger.sh
---
# 380 — `scripts/run-ledger.sh` is the ledger's one write and locate surface

- **Status:** accepted
- **Date:** 2026-09-22
- **Design:** docs/contributing/design/auto-compaction-safety.md · **Supersedes/Refines:** none

> **Refined by ADR-384:** the verbs are now `open`/`append`/`locate`/`close`/`dir` — `move`
> is gone, since the ledger never leaves the git common dir.

## Context

The orchestrator now writes the ledger from several places and two roots (the scratch, then the
worktree), and two hooks must find the active run. Resolving the root and the pointer in each caller
would duplicate the same lookup three times.

## Options considered

1. **One script with verbs `open`/`append`/`move`/`locate`/`close`/`dir`, shared by the skill and
   the hooks** *(recommended)* — pros: one root resolution; testable in a throwaway repo; keeps node
   out of the hooks / cons: a new script.
2. **Raw `>>` at each write point, with each hook re-implementing the lookup** — cons: duplicated
   lookup, three places to drift.
3. **A node engine bin** — cons: a node start in every hook call.

## Decision

Adopted-as-recommended (no user judgment): it follows DRY and craft's script-over-prose direction.
Every ledger write and every active-run lookup goes through `scripts/run-ledger.sh`. `append` takes
records on stdin and writes each as one `<run-id> <phase> <record>` line. A failed append is
surfaced in session and the run continues, as the spec already states.

## Consequences

- The single-writer rule holds: only the orchestrator's tool calls invoke `open`, `append`, `move`
  and `close`. The hooks call only `locate`.
- Requires git ≥ 2.31 for `--path-format`.
