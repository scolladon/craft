---
subjects:
  - docs/contributing/specs/run-record.md
  - skills/run/SKILL.md
supersedes: []
---
# 704 — Deferred and triaged impacts carry fixed ledger tokens

- **Status:** accepted — adopted-as-recommended (no user judgment)
- **Date:** 2026-10-26
- **Design:** docs/contributing/design/discovered-impacts.md · **Supersedes/Refines:** refines ADR-610

## Context

Auto-skip, resume and the PR trailer read the ledger the rebuild already trusts. `FOLDED(<file>)`/`FILED(<file>)` already let findings grep by locus across runs. `run-state` ignores tokens it does not parse.

## Options considered

1. **Keep `FOLDED`/`FILED`; add `DEFERRED(<file>): I<n> <title>` and `TRIAGED(I<n>): <verdict> — <rationale>`, all greppable only** *(recommended)* — pros: inert to `run-state`, one source for every signal / cons: four tokens to document
2. **No new tokens; the store holds everything** — cons: auto-skip and resume parse a second file
3. **Retire `FILED`** — cons: loses the shared `<file>` key with `FOLDED`

## Decision

Option 1. `DEFERRED` is written by `run-ledger.sh defer` under the capturing phase; `TRIAGED` by `run-ledger.sh verdict` under `impact-triage`. `FOLDED` is emitted by whichever phase folds, no longer documentation alone. `FILED` keeps its shape and moves to `impact-triage`, one line per entry after the BACKLOG commit.

## Consequences

Refines ADR-610: its emitter is no longer documentation alone. `run-state` needs no change; a test pins that.
