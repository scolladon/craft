---
subjects:
  - scripts/run-ledger.sh
  - docs/contributing/specs/run-record.md
supersedes: []
---
# 699 — The discovered-impacts store sits next to the run ledger

- **Status:** accepted — adopted-as-recommended (no user judgment)
- **Date:** 2026-10-26
- **Design:** docs/contributing/design/discovered-impacts.md · **Supersedes/Refines:** refines ADR-384

## Context

A run needs somewhere to keep what it found but did not do until triage at run end. A deferral carries a multi-line proof (a red test body, a command and its output); `run-ledger.sh append` writes one record per stdin line, so the ledger itself cannot hold one.

## Options considered

1. **`<git-common-dir>/craft-runs/<run-id>.impacts.md`, written only through new `run-ledger.sh defer`/`verdict` verbs** *(recommended)* — pros: never committed, outlives worktree teardown, reuses the trusted pointer and symlink refusal, `close` removes it / cons: a second run-local file
2. **Committed on the PR branch** — pros: reviewable in the diff / cons: run bookkeeping in the product tree every run, a new counted corpus, duplicates the BACKLOG commit and PR trailer
3. **No file: `DEFERRED` ledger lines are the store** — cons: a multi-line proof cannot fit one ledger record

## Decision

Option 1. `run-ledger.sh open` also creates `<run-id>.impacts.md` beside the ledger; `defer` and `verdict` are its only writers; `close` removes it with the ledger and the pointer. Only the orchestrator calls them.

## Consequences

The store is never reviewable as a file; its outcome reaches review through the triaged BACKLOG commit and the PR trailer. A standalone phase with no open run has no store and lists impacts in its own output, as today.
