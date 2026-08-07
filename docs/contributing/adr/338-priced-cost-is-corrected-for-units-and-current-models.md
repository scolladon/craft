# 338 — Priced cost is corrected for units and current models

- **Status:** accepted
- **Date:** 2026-08-06
- **Design:** docs/contributing/design/usage-miner-subagent-transcripts.md · **Supersedes/Refines:** none

## Context

Two independent defects keep `cost.priced` from meaning anything. `DEFAULT_PRICES` documents
its entries as *"per-MTok USD rates"*, but `computePricedCost` multiplies raw token counts by
those rates with no `1e6` divisor — the committed baseline's `priced` values sum to
**$31,171,735.70** for 39.7M tokens. Separately, `DEFAULT_PRICES` has no `claude-opus-5` and no
`claude-sonnet-5`, so every group this change corrects would price `null` anyway.

The design recommended deferring both, honoring the brief's stated out-of-scope line on
pricing. The user overrode that line.

## Options considered

1. **Tokens only; document the dollar gap; file follow-ups** (designer's recommendation) —
   pros: honors the brief's scope line / cons: leaves a 10⁶× error in a published field.
2. **Add `claude-opus-5`/`claude-sonnet-5` only** — cons: strictly worse; publishes dollar
   figures 10⁶× too large where `null` at least signalled "unknown".
3. **Add the models AND fix the missing `1e6` divisor** — pros: the only option that makes
   `cost.priced` mean dollars, and the only one that reproduces the published `$297.55` /
   cons: changes every historical `priced` value.

## Decision

Ratified by the user, **deviating from the design's recommendation**: **option 3**. Both the
per-MTok divisor and the two missing model entries land in this change.

Option 2 is explicitly foreclosed as a partial step — adding models without the divisor
publishes confidently wrong dollars, which is worse than the current `null`.

## Consequences

- `$297.55` becomes a **verifiable claim** rather than a documented gap: the fixed miner is
  expected to reproduce both the published token figure and the published dollar figure, and
  the test strategy must assert it. If it does not reproduce, that is a finding to investigate
  before assuming the docs are wrong.
- Every historical `priced` value changes, including in the regenerated baseline (ADR-332) —
  which is why regeneration must happen *after* this correction lands.
- This decision deviates from the design's recommendation, so the design doc is revised against
  these ADRs before planning (the scope-fold rule).
- `pricing.js` sits inside `adapters/claude/`, but `usage-aggregate.js` is the pure core —
  editing it is authorized by this decision, not by the brief.
