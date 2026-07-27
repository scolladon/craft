# 288 — live references swept; dated ledger history verbatim

- **Status:** accepted
- **Date:** 2026-07-27
- **Design:** ../design/docs-audience-split.md · **Supersedes/Refines:** none

## Context

`BACKLOG.md` carries live, actionable path references beside dated run-history entries;
`.claude/craft-memory.md` is a machine-maintained advisory ledger whose entries record
paths accurate as-of their run date.

## Options considered

1. **Rewrite live/actionable path strings; leave dated run-memory history verbatim**
   *(recommended)* — pros: live links resolve, history stays honest / cons: old paths
   remain greppable in dated entries.
2. **Rewrite all occurrences everywhere** — pros: one uniform sweep / cons: fabricates
   history in a ledger whose value is being accurate as-of-then.
3. **Leave both untouched** — pros: zero risk / cons: live backlog links dangle.

## Decision

Adopted-as-recommended (no user judgment). Open/actionable `BACKLOG.md` items get their
paths rewritten; dated run-record entries in `BACKLOG.md` and all of
`.claude/craft-memory.md`'s provenance-stamped entries stay byte-verbatim.

## Consequences

A grep for an old path may still hit dated ledger lines — expected and correct. Future
memory entries written after the move will carry new paths naturally.
