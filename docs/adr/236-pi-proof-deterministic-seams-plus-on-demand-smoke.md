# 236 — pi proof is deterministic unit-tested seams + one on-demand live smoke

- **Status:** accepted
- **Date:** 2026-07-19
- **Design:** docs/design/native-pi-binding.md · **Supersedes/Refines:** Mirrors ADR-226/228, ADR-088/089

## Context

The pi binding adds code seams (git-guard event adapter, tier map, CRAFT_ROOT resolver, telemetry parser, contract-equivalence) plus a discoverable surface whose full behaviour only manifests under a real `pi install`. The existing pi and opencode precedents (ADR-088/089, ADR-226/228) prove seams deterministically in CI and record a single on-demand live smoke, never CI-gating a live provider run.

## Options considered

1. **Deterministic seams unit-tested (`adapters/pi/test/` + telemetry in `engine/test/`) + one on-demand live smoke recorded in `docs/adapters/pi-poc-record.md`** *(designer recommendation)* — pros: exact pi/opencode precedent; CI stays hermetic. Cons: the live surface is proven on-demand, not in CI.
2. **CI-gate a live pi run** — cons: couples CI to a pi install + provider key.
3. **Manual-only** — cons: forfeits regression cover.

## Decision

*Adopted as recommended (no user judgment).* Option 1, mirroring ADR-226/228. Every code seam has `node --test` coverage with no new engine-level runtime dependency; the interactive/native surface is proven by one on-demand live smoke recorded by extending `docs/adapters/pi-poc-record.md`. CI is never coupled to a live pi install or a provider key.

## Consequences

- CI proves: git-guard predicate + pi event adapter, tier→model map, CRAFT_ROOT resolver, telemetry parser + `report.json` byte-parity, front-door `--source pi` dispatch, contract-equivalence.
- The DEFERRED rows (design §D2 rows 23–28) are the live-smoke agenda, pinned to an exact pi version at smoke time.
- The acceptance-probe structural assertions reuse `adapters/pi/src/probe.js#runAcceptanceProbe` (injected `piRunner`/`fsOps`), so they are unit-testable without a live pi.
