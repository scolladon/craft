# 198 — metrics-split.js lives under observability/adapters/claude/

- **Status:** accepted
- **Date:** 2026-07-02
- **Design:** docs/DESIGN-shrink-core-prune-guardrails.md · **Supersedes/Refines:** follows ADR-190/191

## Context

metrics-split.js parses the `.claude/craft-metrics.md` line format whose fields mirror
the Claude spawn usage block — it is substrate-shaped even though its filename carries no
vendor suffix. With ADR-190 creating `engine/src/observability/adapters/claude/` and
ADR-191 keying the lint on location, its placement must be settled explicitly.

## Options considered

1. **adapters/claude/** (recommended) — pros: honest about its substrate coupling; sits
   beside the two bindings that share its data source / cons: none material.
2. **Neutral observability core** — cons: misdeclares a substrate-shaped parser as
   vendor-neutral.
3. **Inline into a binding** — cons: merges two cohesive modules to avoid a placement
   decision.

## Decision

**Adopted-as-recommended (no user judgment).** metrics-split.js moves to
`engine/src/observability/adapters/claude/` alongside telemetry-claude.js and
pricing-claude.js.

## Consequences

The neutral observability core (memory.js, usage-aggregate.js, usage-mine-main.js)
carries no substrate-shaped parsing; every Claude-coupled module shares one directory.
