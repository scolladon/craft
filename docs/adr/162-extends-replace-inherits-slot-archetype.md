# 162 — extends.phases replace branch inherits the slot's archetype

- **Status:** accepted
- **Date:** 2026-06-27
- **Design:** docs/design/simpler-phase-authoring.md · **Supersedes/Refines:** none

## Context

`extends.phases` can either insert a genuinely-new phase or replace an existing default
phase's slot (id matches a default). The inference codomain is `{harness, construction}`
only (ADR-164). A default slot may be `delivery`/`specification`, which inference cannot
produce.

## Options considered

- (a) When archetype is omitted on a replace, inherit the existing slot's archetype.
- (b) Always infer, uniform with inserts.
- (c) Keep the replace branch requiring an explicit archetype.

## Decision

(a) inherit. User-ratified.

## Consequences

- A replace of a `delivery`/`specification` slot cannot be mis-typed; slot identity is
  preserved with no record noise.
- Inference applies only to genuinely-new inserts (no id match), where the codomain is
  always correct.
- (b) risks silently shifting a replaced slot's execution topology.
