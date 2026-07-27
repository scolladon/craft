# 272 — README drift-guard logic lives in engine/src behind a thin script

- **Status:** accepted
- **Date:** 2026-07-25
- **Design:** docs/design/readme-drift-guards.md · **Supersedes/Refines:** none

## Context

The guard mixes text extraction, YAML parsing, and numeric recomputation
(median/rounding) — logic that hides bugs when untested. The repo has two homes for
tooling: bash under `scripts/` and node under `engine/`.

## Options considered

1. **Pure cores in engine/src + engine/bin shim + thin scripts/readme-drift.sh**
   *(designer recommendation)* — pros: mutation-covered pure functions, mirrors the
   usage-telemetry-miner precedent, no jq/yq dependency / cons: node startup in CI job.
2. **Fully bash** — pros: no node setup / cons: median/rounding/regex logic untested at
   unit granularity.
3. **Mixed bash + node** — pros: none decisive / cons: splits logic across two homes.

## Decision

Pure `(input) → value` cores in `engine/src` (`readme-regions`, `phase-truth`,
`telemetry-claims`, `readme-drift-main`), one `engine/bin/readme-drift.js` shim, and a
thin `scripts/readme-drift.sh` front door that is also the one-command local runner.

## Consequences

The deterministic logic sits under `node --test` and Stryker mutation coverage.
`js-yaml` (existing engine dep) parses the pipeline YAML; CI needs only node + npm ci.
