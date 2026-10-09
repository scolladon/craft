---
subjects:
  - evals/decisions-escalates-fork
  - docs/contributing/maintainer-smokes.md
---
# 426 — The escalates-fork pilot gates the sweep on validity only

- **Status:** accepted
- **Date:** 2026-10-09
- **Design:** docs/contributing/design/harder-decisions-fork-fixture.md · **Supersedes/Refines:** none

## Context

The edited case is piloted with `--runs 1` before a 3-run sweep whose ceiling is the pilot's `costUsd` × 3 × 1.5 (ADR-392). The brief launches the sweep "if the pilot is informative". One run per arm cannot separate the arms, and a Δ 0.00 pilot is the result that most needs more runs.

## Options considered

1. **Validity only** *(recommended)* — sweep unless the pilot is invalid: a `suite.plugins` problem for craft, a tool-grant warning, a scaffold error, a timeout, or a NO-TRACE / TRACE-GONE row in the trace check; Δ is read from the sweep only — pros: no single noisy run decides / cons: pays the sweep even when the pilot repeats 0.00
2. **Sweep only on a bare FAIL** — pros: cheaper when the pilot repeats 0.00 / cons: one run decides whether the fixture works
3. **Skip the pilot**, cap the sweep from the 2026-10-06 cost — pros: one paid run fewer / cons: breaks "pilot an edited case" and ADR-392's pilot-derived ceiling

## Decision

The maintainer chose option 1.

## Consequences

- An invalid pilot is re-run, not swept; the sweep's ceiling always comes from a valid pilot.
- The pilot's Δ is recorded but never read as the case's Δ.
