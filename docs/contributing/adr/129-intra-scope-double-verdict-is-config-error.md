# 129 — An intra-scope double-verdict is a config error caught at lint

- **Status:** accepted
- **Date:** 2026-06-22
- **Design:** docs/DESIGN-P23-configurable-policy-hooks.md · **Supersedes/Refines:** none

## Context

A single scope could list the same action under two verdicts (`ask: [integrate]` and
`never: [integrate]` in one file). This is a misconfiguration, not a meaningful state. craft can
either error loudly or silently reconcile it. Cross-scope conflicts (user vs project) are a different
case — those resolve by precedence (ADR-022 direction) and are not errors.

## Options considered

1. **Config error, fail at lint** *(designer recommendation)* — pros: loud; matches `manifest-lint`'s refuse-a-misconfigured-declination stance. Cons: none material.
2. **Strictness ordering `never > ask > always`** — pros: never fails. Cons: silently reconciles a mistake.
3. **Last-listed-wins** — pros: simple. Cons: order-dependent and silent.

## Decision

*Adopted-as-recommended (no user judgment).* A single scope assigning one action to more than one
verdict is a **config error caught by `validatePolicy` at lint/resolve time → non-zero exit before
any phase runs**, consistent with `validateBacklog`/`validateMemory` and `manifest-lint`'s loudness
stance. Cross-scope conflicts are **not** errors — they resolve by precedence
(per-invocation > project > user).

## Consequences

- Misconfigured policy fails fast and visibly, never silently reconciled.
- Cross-scope precedence is the only verdict-merging path; intra-scope is single-verdict-per-action.
- Mirrors the existing validator test surface (`engine/test/manifest.test.js`).
