# 228 — the opencode live smoke drives one construction-bearing phase end-to-end

- **Status:** accepted
- **Date:** 2026-07-17
- **Design:** docs/design/opencode-adapter.md · **Supersedes/Refines:** Refines ADR-088

## Context

The on-demand live smoke (ADR-226) needs a scope. pi's ADR-088 proved one construction-bearing phase end-to-end through the adapter, exercising the load-bearing ports together.

## Options considered

1. **One construction-bearing phase end-to-end (RED→GREEN→commit)** *(designer recommendation)* — pros: proves Execution/Model/Gate/VCS together at minimum surface; matches ADR-088. Cons: does not exercise the specification/delivery phases live.
2. **A short multi-phase slice (design→implementation)** — cons: more surface, still partial.
3. **Full default pipeline** — cons: heavy, provider-cost, brittle for a smoke.

## Decision

*Adopted-as-recommended (no user judgment).* The live smoke drives one construction-bearing phase end-to-end through the opencode subagent binding in a `mktemp` throwaway repo: gate green before commit, mutations confined to the throwaway, committed artifact = handoff. Provider may be non-Anthropic.

## Consequences

- Proves the load-bearing ports (Execution/Model/Gate/VCS) at minimum surface; matches ADR-088.
- Broader live scope is out of scope until evidence forces it.
- The record is `docs/adapters/opencode-poc-record.md`, resolving the design §D9 D-rows against a pinned opencode version.
