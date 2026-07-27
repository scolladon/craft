# 057 — Port "adapter failure is a blocker" relies on the core.md contract line

- **Status:** accepted
- **Date:** 2026-06-18
- **Design:** docs/DESIGN-P11-backlog-port.md · **Supersedes/Refines:** none

## Context

The invariant "adapter failure is a blocker, never a silent pass" (PRD §11) must bind every
backlog `resolve`/`complete`. It is already a line in `contracts/core.md`, which the engine
injects into every spawn (P5 / ADR-017). The question is whether P11 should restate it nearer
the port.

## Options considered

1. **Rely on core.md** — the existing injected line covers it; the adapter spec references it.
   pros: one home, no duplicated-invariant drift (the P5 rule) / cons: the line is generic, not
   backlog-specific. *(designer's recommendation)*
2. **Reinforce in delivery.md** — add a backlog-specific clause to `contracts/delivery.md`.
   cons: duplicates an invariant; risks divergence from the core.md wording.
3. **Only in the adapter spec doc** — cons: the spec is not injected into spawns, so a worker
   might never see it.

## Decision

The port's failure-is-a-blocker guarantee **relies on the existing `contracts/core.md` line**;
no new or duplicated clause is added. `docs/adapters/backlog.md` *references* the invariant
(names that resolve/complete failures escalate via the blocker protocol) but never restates it.

## Consequences

- No change to `contracts/core.md` or `contracts/delivery.md`.
- The adapter spec ([[056-backlog-adapter-spec-doc]]) points at the core invariant.
- Preserves the P5 "one contract home, no duplicated invariant text" rule.
- The concrete failure surfaces (config vs runtime) are defined by
  [[058-backlog-failure-class-split]] and [[059-custom-complete-guard]].
