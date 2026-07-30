# 302 — The orchestrator is the ledger's only writer, one append per phase boundary

- **Status:** accepted
- **Date:** 2026-07-30
- **Design:** docs/contributing/design/orchestrator-tax-hardening.md · **Supersedes/Refines:** refines 300

## Context

Once the ledger is a file, something has to write it, and the same change adds a core
contract line forbidding agents from touching repo-wide git state because concurrent writers
share one tree. A ledger written by many agents would re-create, in the file that records the
hazard, exactly the hazard being closed.

## Options considered

1. **Orchestrator only, one append at each phase boundary plus open and `Done`** *(recommended)* — pros: single writer; boundary is already a defined point in the walk / cons: coarser resume granularity than per-event.
2. **Orchestrator, additionally on every blocker and gate result within a phase** — pros: finer resume granularity / cons: many small writes; "what counts as an event" is undefined.
3. **Each role agent appends its own outcome lines** — pros: no orchestrator bookkeeping / cons: concurrent writers on one file; refused outright.

## Decision

**Adopted-as-recommended (no user judgment).** Only the orchestrator writes the ledger, with
one append at each phase boundary (walk step 7), plus one at open and one at `Done`. Role
agents never write it.

## Consequences

Resume granularity is the phase, not the event: a reset mid-phase recovers everything up to
that phase's start. Agent contracts need no ledger clause, since agents never touch the file.
