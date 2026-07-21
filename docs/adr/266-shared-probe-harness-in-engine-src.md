# 266 — The shared acceptance-probe harness lives in engine/src/probe-harness.js

- **Status:** accepted (adopted-as-recommended, no user judgment)
- **Date:** 2026-07-21
- **Design:** docs/design/harden-prove-codex-binding.md · **Supersedes/Refines:** none

## Context

`adapters/{opencode,copilot,codex,pi}/src/probe.js` are four near-verbatim copies: the
structural assertions (`assertMutationsInsideThrowaway`, `assertGateGreenBeforeCommit`,
`assertCommittedArtifact`, `evaluateTrace`) are byte-identical; `buildEvidence` and
`runAcceptanceProbe` differ only by a version key, a `portsExercised` array, and computed
extra runner args. A single shared `runProbeHarness(...)` removes the duplication; it needs
a home.

## Options considered

1. **`engine/src/probe-harness.js`** *(chosen, recommended)* — pros: mirrors the A1 lift of
   the guard predicate into `engine/src`, where the four bindings already reach for
   `guards/tool-call-guard.js`; inherits the `engine/src/**` Stryker mutate glob for free, so
   the new logic gains executed mutation coverage. Cons: none material.
2. **A new `adapters/`-level shared module** — cons: no existing adapters-shared home, and it
   would sit outside the Stryker mutate scope the harness now needs.

## Decision

The shared harness is `engine/src/probe-harness.js`, exporting
`runProbeHarness({ runner, fsOps, versionKey, portsExercised, extraRunnerArgs })`. Each
binding's `probe.js` becomes a thin wrapper preserving its exported
`runAcceptanceProbe({ <b>Runner, fsOps })` signature exactly. Adopted as the designer
recommended; aligns with ADR-262/263's engine-vs-adapter boundary and the A1 predicate lift.

## Consequences

- The four `adapters/*/test/probe.test.js` suites stay green unmodified (the wrappers preserve
  the public signature).
- `engine/test/probe-harness.test.js` (hermetic, fake runner, never spawns a CLI) kills the
  new mutants under the existing `engine/test/**` testFiles glob — the adapter probe suites are
  NOT added to Stryker testFiles (they would hang the dry run; `mutation-config.test.js` bans
  that).
- Being in `engine/src`, the harness is bound by ADR-265: it ships provenance-clean.
