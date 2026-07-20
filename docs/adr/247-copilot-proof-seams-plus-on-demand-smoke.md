# 247 — Copilot proof strategy: deterministic seams plus an on-demand smoke

- **Status:** accepted
- **Date:** 2026-07-20
- **Design:** docs/design/native-copilot-binding.md · **Supersedes/Refines:** Mirrors ADR-236 (pi proof strategy)

## Context

CI-gating a live Copilot run is an explicit non-goal: it costs paid `premiumRequests` quota and is flaky. The pi and opencode bindings both settled on deterministic unit-tested seams plus one on-demand live smoke recorded in a POC record.

The Copilot probe surfaced something stronger than either sibling had. `COPILOT_PROVIDER_BASE_URL` (BYOK) **bypasses GitHub authentication entirely**, so a local fake OpenAI-compatible **SSE** provider can drive real tool calls end-to-end with zero credentials, zero AI credits, and no network. That harness is what made the tool-call, hook, containment, and deny rows CONFIRMED rather than deferred. (The provider must emit SSE chunks; a plain-JSON body fails with `request ended without sending any chunks`.)

## Options considered

1. **Deterministic unit-tested seams + one on-demand live smoke** *(designer recommendation)* — pros: matches the pi/opencode precedent and the stated non-goals; the BYOK harness makes far more CI-provable here than for the siblings. Cons: real model ids and real-provider OTel shape stay deferred.
2. **Add a CI-gated live run** — cons: explicit non-goal; cost and flakiness.
3. **Deterministic seams only, no smoke** — cons: leaves the auth-dependent rows permanently unpinned.

## Decision

*Adopted as recommended (no user judgment).* Option 1. Proof is deterministic seams green in `scripts/ci.sh` — guard adapter, deny-tool pattern set, tier map, telemetry parser, read-root thunk, CRAFT_ROOT resolver, native-surface single-sourcing, contract-equivalence — plus **one on-demand live smoke** recorded in `docs/adapters/copilot-poc-record.md` with an explicit CONFIRMED / DEFERRED matrix. The BYOK fake-provider harness may be committed as a developer-run integration probe, giving a zero-cost end-to-end check of guard enforcement; it is **not** CI-gated.

Any test that spawns the real `copilot` binary must assume CI **absence** and exit fast. Because `copilot` **is** installed on developer machines, such a test will otherwise hang the suite doing real provider work — so the suite prepends a fast-failing `copilot` stub to `PATH` to reproduce CI conditions.

## Consequences

- CI stays hermetic, free, and offline.
- The deferred rows (D1–D7) are named in the record rather than guessed; the tier map ships the ids the smoke pins.
- The `PATH`-stub discipline is mandatory for any real-binary test, per prior experience where an installed binary hung the full suite.
