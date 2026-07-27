# 284 — readme-drift metrics path stays a literal, updated in place

- **Status:** accepted
- **Date:** 2026-07-27
- **Design:** ../design/docs-audience-split.md · **Supersedes/Refines:** none

## Context

`engine/src/readme-drift-main.js` hardcodes `docs/metrics-baseline.report.json`, which
moves to `docs/contributing/metrics-baseline.report.json`. The guard is craft-internal
(it pins craft's own README telemetry claims), not a consumer knob.

## Options considered

1. **Update the hardcoded literal** *(recommended)* — pros: minimal, honest about the
   guard's craft-internal nature / cons: another literal to know about.
2. **Make it manifest-configurable (`paths.metrics`)** — pros: symmetry with other paths /
   cons: invents config surface for exactly one caller.
3. **Keep the file at `docs/` top level as an exception** — pros: no code change / cons:
   violates the no-stray-top-level requirement the split exists to establish.

## Decision

Adopted-as-recommended (no user judgment). The literal in `readme-drift-main.js` and the
pinned README link string move together to the new path in the same part.

## Consequences

`test/readme-drift.test.js` and `engine/test/readme-regions.test.js` pinned strings update
in lockstep. No new manifest vocabulary. A future second consumer of the metrics path would
be the trigger to revisit configurability.
