# 163 — resolution record token for an inferred archetype

- **Status:** accepted
- **Date:** 2026-06-27
- **Design:** docs/design/simpler-phase-authoring.md · **Supersedes/Refines:** none

## Context

Inference must be visible, never silent (the engine's "show your work" ethos). It needs a
greppable record line in the existing `record[]` stream.

## Options considered

- (a) `archetype: <id> → <archetype> (inferred: <reason>)`.
- (b) `infer: archetype <id>=<archetype> (<reason>)`.
- (c) Fold the reason into the existing `insert:` record line.

## Decision

(a). It mirrors the existing `execution: <id> → <mode> (<reason>)` line verbatim and gives
a fixed greppable token `archetype:`.

## Consequences

- Consistent with the existing record vocabulary; one orthogonal fact per line.
- (c) would couple two independent decisions (the insert and its inferred archetype) in a
  single line.
