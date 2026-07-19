# 226 — opencode proof: deterministic seams in CI + one on-demand live smoke

- **Status:** accepted
- **Date:** 2026-07-17
- **Design:** docs/design/opencode-adapter.md · **Supersedes/Refines:** Refines ADR-088, ADR-089

## Context

A new binding needs a proof strategy. pi established the pattern: deterministic adapter seams proven in CI by unit tests; the live runtime run kept on-demand, not CI-gated (ADR-088/089).

## Options considered

1. **Deterministic seams unit-tested + one on-demand live smoke recorded in `docs/adapters/opencode-poc-record.md`** *(designer recommendation)* — pros: exact pi precedent; CI stays decoupled from an opencode install + provider key. Cons: the live run is manual.
2. **CI-gated live opencode run** — cons: couples CI to an opencode install + provider key.
3. **Manual-only, no unit tests** — cons: forfeits regression cover.

## Decision

*Adopted-as-recommended (no user judgment).* The deterministic seams (git-guard predicate, tier→model map, `CRAFT_ROOT` resolver, telemetry parser, report byte-match, front-door `--source` selector, contract-equivalence extension, plugin wiring, docs structure) are unit-tested in CI. One on-demand live smoke, not CI-gated, is recorded in `docs/adapters/opencode-poc-record.md`.

## Consequences

- Mirrors pi; CI is not coupled to an opencode install.
- The live smoke record is the refreshable evidence artifact; its scope is fixed by ADR-228.
