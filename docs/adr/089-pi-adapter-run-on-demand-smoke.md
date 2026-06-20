# 089 — Pi adapter run is an on-demand smoke, not CI-gated

- **Status:** accepted
- **Date:** 2026-06-20
- **Design:** docs/DESIGN-P16-provider-agnostic.md · **Supersedes/Refines:** none

## Context
The Pi PoC is a live run against an external provider (keys, network, a third-party agent
runtime). The repo already keeps every runtime-fidelity proof (SC5 second-instantiation,
model-class matrix, registered-phase dispatch) as on-demand smokes recorded in evidence docs,
not CI jobs — the engine paths they exercise are CI-proven by fixtures.

## Options
1. **On-demand smoke only** — record in an evidence doc; the engine path is fixture-proven in CI. pros: consistent with SC5 / model-class / registered-phase smokes, no external flakiness in CI / cons: the live Pi run is not gated automatically. *(designer's recommendation, chosen)*
2. **Hard CI job that installs Pi and runs the scenario** — pros: always green-checked / cons: flaky, key-dependent, couples CI to an external install.
3. **Recorded-transcript fixture asserted in CI; live run on-demand** — pros: a frozen check / cons: transcript rot; still needs the live run for truth.

## Decision
The Pi PoC is an **on-demand smoke**. Its outcome is recorded in
`docs/adapters/pi-poc-record.md` (Pi version, model, ports exercised, per-phase outcome),
mirroring `docs/SC5-second-instantiation-record.md` and ADR-080. CI is not coupled to a Pi install.

## Consequences
- The deterministically-testable seams (e.g. the `tool_call` block predicate) are unit-tested in
  CI; the live Pi run is not.
- No external keys/network enter CI.
- The PoC's truth lives in a diffable evidence doc, refreshed when the smoke is re-run.
