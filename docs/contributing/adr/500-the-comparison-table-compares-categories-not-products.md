---
subjects:
  - README.md
---
# 500 — The comparison table compares categories, not products

- **Status:** accepted
- **Date:** 2026-10-12
- **Design:** docs/contributing/design/public-front-door-completion.md · **Supersedes/Refines:** none

## Context

The README needs an honest comparison against adjacent approaches. Nothing in the repo sources any feature claim about a named external product, and product features move faster than the README.

## Options considered

1. **Categories (plain prompting, spec-driven kits, craft); non-craft cells only by-construction or "varies by tool"; craft cells linked to repo evidence** *(recommended)* — pros: every claim is sourced / cons: less concrete for readers who think in product names
2. **Named products with cited links the maintainer verifies** — pros: concrete / cons: unsourced today; goes stale; cited links trip source-hygiene
3. **Plain prompting only** — pros: backed by the measured experiment / cons: drops the spec-driven row the brief asks for

## Decision

Option 1 — **adopted-as-recommended (no user judgment).** The table compares approach categories; a non-craft cell states only what the approach provides by construction or "varies by tool"; every craft cell links to evidence in this repo. Aligns with the principle that no claim ships without proof.

## Consequences

No named competitor appears in the README. A future product-level comparison needs cited, maintainer-verified sources first.
