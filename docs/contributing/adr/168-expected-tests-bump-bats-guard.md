# 168 — bump EXPECTED_TESTS and add an inference bats guard

- **Status:** accepted
- **Date:** 2026-06-27
- **Design:** docs/design/simpler-phase-authoring.md · **Supersedes/Refines:** none

## Context

New `node:test` cases (inference, pedagogical errors) raise the engine test count, which
`scripts/ci.sh` pins via `EXPECTED_TESTS`. The end-to-end "no-archetype insert resolves and
records the inference" invariant deserves a guard past the unit layer.

## Options considered

- (a) Bump `EXPECTED_TESTS` to the new count AND add an inference/pedagogy bats guard.
- (b) Bump the count only.
- (c) Defer both to a later increment.

## Decision

(a). The count rises mechanically; a bats guard locks the no-archetype-insert resolution +
record line end-to-end.

## Consequences

- `EXPECTED_TESTS` is updated in the same change that adds the tests (kept in lockstep).
- A bats scenario asserts a `{ id, procedure, gate, after }` insert resolves `ok: true` and
  emits the `archetype: … (inferred: …)` record line.
