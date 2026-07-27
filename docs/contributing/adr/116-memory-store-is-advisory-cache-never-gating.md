# 116 — The repo-local memory store is an advisory cache, never a gating source of truth

- **Status:** accepted
- **Date:** 2026-06-22
- **Design:** docs/DESIGN-P22-repo-local-craft-memory.md · **Supersedes/Refines:** none

## Context

P22 introduces persistent cross-run state, which sits in tension with craft's
mechanism-over-memory value (ADR-082, ADR-103): the engine refuses to rely on the session
*remembering* to do anything, and artifact-is-the-handoff exists so no cross-phase state lives in
agent memory. A repo-local memory must be reconciled with that value, not allowed to violate it.

## Options considered

1. **Advisory cache with provenance** *(designer recommendation)* — the store is a cache of prior
   derivations; every entry answers a question a phase would otherwise re-derive, and nothing it says
   is trusted without a cheap re-check. Pros: never gates, so deleting it changes run *cost* not
   *correctness*. Cons: requires validate-on-read discipline on every consumer.
2. **Authoritative knowledge base** — the store records conclusions craft then trusts and acts on.
   Pros: larger speedups. Cons: violates mechanism-over-memory; a poisoned entry can mislead a real
   decision.

## Decision

*Adopted as recommended (no user judgment — aligns with ADR-082/103).* The store is an **advisory
optimization cache with provenance**, never a source of truth that gates a decision. No gate, verdict,
probe-floor, or blocker is ever *made* from a store entry. On a cache miss, or an absent/empty/invalid
store, the run proceeds exactly as today (full probing). Deleting the entire store changes run
**cost**, never run **correctness**. Every other P22 decision assumes this premise.

## Consequences

- The make-or-break anti-poisoning guarantee rests here: bounded influence is the ceiling under which
  validate-on-read, confidence/decay, and the size cap operate.
- The store may be removed, hand-edited, or ignored with zero correctness risk — only a cost change.
- Forecloses any future "memory says skip the gate" fast-path (permanently out of scope).
