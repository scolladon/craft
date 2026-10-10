---
subjects:
  - evals/implementer-guard-outside-part/**
---
# 440 — The scope case runs at every agent tier

- **Status:** accepted — adopted-as-recommended (no user judgment)
- **Date:** 2026-10-10
- **Design:** docs/contributing/design/arriving-guard-part-bound.md · **Supersedes/Refines:** none

## Context

On the in-part arriving `GUARD`, the tiers split before the contract change: opus and sonnet blocked, haiku wrote the GREEN silently. One tier cannot stand for the others.

## Options considered

1. **Sonnet (the agent's pinned tier), then haiku, then opus: a one-run pilot, then three runs each** *(recommended)* — pros: every routable tier measured / cons: about USD 0.8 per tier
2. **Sonnet only** — pros: cheapest / cons: leaves manifest-routed tiers unmeasured
3. **Sonnet first, other tiers only if sonnet shows no edit** — pros: saves money when sonnet already shows the conflict / cons: the other tiers then decide the fix's urgency anyway

## Decision

Adopted-as-recommended (no user judgment): option 1. Each tier is launched only after the maintainer approves it; the judge never runs at the agent tier.

## Consequences

- Each tier's sweep ceiling is its pilot cost × 3 × 1.5.
