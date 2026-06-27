# 161 — inferArchetype wired as a single post-reorder pass in resolve.js

- **Status:** accepted
- **Date:** 2026-06-27
- **Design:** docs/design/simpler-phase-authoring.md · **Supersedes/Refines:** none

## Context

`archetype` was the last required vocabulary word on the insert / `extends.phases`
path. Making it optional needs an inference step; it can live in one of several seams.

## Options considered

- (a) Single inference pass in `resolve.js`, after reorder, before execution resolution.
- (b) Inline inference inside both `applyInserts` and `foldRegisteredPhases`.
- (c) A default in `descriptor.js` normalization (engine-wide, base default.yml included).

## Decision

(a). One chokepoint, one record source. It is naturally "insert/extends only" because the
base `pipeline/default.yml` arrives pre-validated through `parsePipeline` (which keeps
`archetype` in `REQUIRED_FIELDS`) before the resolver runs.

## Consequences

- One place to test; base default.yml keeps `archetype` required (no engine-wide default).
- (b) would duplicate the call across two paths; (c) would violate "keep archetype
  required for base default.yml".
- The inferred-archetype record line is emitted from this same pass.
