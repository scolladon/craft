# 275 — README drift guard runs as a separate readme-drift CI job

- **Status:** accepted
- **Date:** 2026-07-25
- **Design:** docs/design/readme-drift-guards.md · **Supersedes/Refines:** none

## Context

`.github/workflows/ci.yml` has two jobs: `ci` (substrate gate) and `links` (offline
markdown link check). The drift guard needs a CI home with a clear failure signal and
a local-parity story.

## Options considered

1. **Separate `readme-drift` job running `bash scripts/readme-drift.sh`** *(designer
   recommendation)* — pros: isolated signal, parallel, one-command local parity / cons:
   duplicate checkout/setup-node/npm ci steps.
2. **Fold into scripts/ci.sh only** — pros: fewer runners / cons: drift signal mixed
   into the substrate gate; no separately-named job.
3. **Separate job, steps inlined in YAML** — pros: none decisive / cons: check-logic in
   workflow YAML breaks local parity.

## Decision

A third job `readme-drift` (checkout → setup-node 22 → `cd engine && npm ci` →
`bash scripts/readme-drift.sh`). The guard's unit tests additionally run inside the
existing `ci` job via `scripts/ci.sh` registration.

## Consequences

README drift fails CI under its own job name. The same script is the local front door,
so contributors reproduce CI verdicts with one command.
