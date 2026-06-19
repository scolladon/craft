# 074 — S7 proof: CI engine fixture + on-demand `--plugin-dir` smoke

- **Status:** accepted
- **Date:** 2026-06-19
- **Design:** docs/DESIGN-P14-derived-plugin-extension.md · **Supersedes/Refines:** none (DC-6 as recommended); follows the ADR-068 CI-deterministic + on-demand-live split

## Context

S7/SC9/G8 require proof that a registered phase runs end-to-end under the invariant core. A real
second-marketplace install in CI is slow, network-bound, and flaky; SP2 already pinned cross-plugin
dispatch GREEN empirically. The deterministic scenario suite asserts resolution + gate decisions, never
LLM behavior — so a full cross-plugin run cannot be the CI gate.

## Options considered

1. **Pure-manifest engine fixture only (CI)** — pro: deterministic, no install / con: never drives a
   real `--plugin-dir` run; leans entirely on SP2's prior proof.
2. **Engine fixture (CI) + documented manual `--plugin-dir` smoke** — pro: every engine invariant is
   CI-gated AND a runtime cross-plugin smoke adds fidelity without coupling CI to an install / con:
   the smoke is on-demand, not gated. *(designer's recommendation)*
3. **Real second-plugin install in CI** — con: high-cost/flaky for marginal gain; SP2 already proved
   dispatch.

## Decision

Two halves, mirroring ADR-068. **Primary (CI-gated):** a pure-manifest engine fixture extends
`S7/manifest.yml` to a full `extends:` block and asserts, through the *real* engine entry points
(`validateManifest`, `resolvePipeline`, the `roleExists` bin probe, `contract-assemble --descriptor-json`):
the registered phase lands in `effective[]` with its bundle + gate; a registered external role passes
while an unregistered sibling fails closed; the registered descriptor assembles core + declared bundle.
**Secondary (on-demand, not CI-gated):** a documented manual smoke — a throwaway two-plugin fixture
driven by `claude -p --plugin-dir craft --plugin-dir pluginB` (SP2's shape) — recorded like the existing
inline-fidelity and model-class checks in `run/SKILL.md`.

## Consequences

- SC9's "runs under the invariant core" is discharged deterministically at the engine layer; no live
  spend gates the pipeline.
- The manual smoke is the durable home for real cross-plugin dispatch fidelity, refreshed on demand by
  a maintainer; its procedure lands in `run/SKILL.md` alongside the other on-demand checks.
- The Tier-2 docs (ADR-062 gate) may be written once the CI fixture is green — the catalog advertises a
  now-proven surface.
