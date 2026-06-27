# 166 — pedagogical stranded-consumer error shape

- **Status:** accepted
- **Date:** 2026-06-27
- **Design:** docs/design/simpler-phase-authoring.md · **Supersedes/Refines:** none

## Context

The stranded-consumer error today is terse. The resolver already holds every fact a useful
message needs (the artifact, the consumer, which phases produce it, their positions). The
message is a pure projection of those facts — table-testable, not prompt-driven.

## Options considered

- (a) Name the artifact + producer list (with position/enabled) + one suggested-fix line.
- (b) Minimal: artifact + producer ids only.
- (c) Verbose multi-paragraph block.

## Decision

(a). The error names the stranded artifact, lists the phases that produce it (with their
position/enabled state), and ends with one actionable line:
`Did you mean after: <producer>, or produces:[<artifact>] / self_supply: on an earlier phase?`

## Consequences

- Enough to fix without re-reading the manifest; one suggestion, no prose burial.
- Asserted by table tests (manifest fragment → expected substring), the same shape as the
  existing resolver tests.
- (b) omits the position fact that picks the fix; (c) buries the fix.
