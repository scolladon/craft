# 304 — The boundary filter consumes canonical findings, never raw technique output

- **Status:** accepted
- **Date:** 2026-07-30
- **Design:** docs/contributing/design/orchestrator-tax-hardening.md · **Supersedes/Refines:** none

## Context

The review phase already normalizes reviewer output at the boundary before anything enters
the orchestrator's context. The validation phase has no equivalent, so the orchestrator
filters raw technique output to the changed lines in-thread. A filter bin closes that, but
its input contract decides whether the engine stays technique-agnostic.

## Options considered

1. **Canonical `Finding[]` — composes after the existing normalizer** *(recommended)* — pros: reuses `engine/src/findings.js`; keeps technique shaping in the technique's own `run`/`triage-procedure` / cons: a technique with no normalizer path needs one first.
2. **Raw technique output with per-technique parsers in `engine/src`** — pros: one hop / cons: directly forbidden — the hygiene suite bans technique names under `engine/src`, and it re-specializes the engine that was deliberately de-specialized.
3. **Raw output plus a manifest-declared per-technique regex** — pros: no engine change per technique / cons: puts a parser in YAML, untestable and ungated.

## Decision

**Adopted-as-recommended (no user judgment).** The filter bin takes a canonical `Finding[]`
and a scope spec, and returns the findings falling inside that scope. It never parses
technique-specific output; the engine stays technique-agnostic.

## Consequences

The boundary is one composable pipe: normalize, then filter. Adding a technique requires no
engine change. The bin is pure over its two inputs, so it is unit-testable with no repo.
