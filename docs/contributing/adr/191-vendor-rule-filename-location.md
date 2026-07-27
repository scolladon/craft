# 191 — the vendor-boundary rule is a filename/location check, lint-enforced

- **Status:** accepted
- **Date:** 2026-07-02
- **Design:** docs/DESIGN-shrink-core-prune-guardrails.md · **Supersedes/Refines:** refines the P27 de-specialization rule

## Context

P27 established "no vendor name in plugin sources", yet engine/src carries
telemetry-claude.js and pricing-claude.js. The design's empirical pin: ~137 legitimate
content-level `claude`/`anthropic` sites exist (model-class matrix, adapter docs, binding
literals P29 explicitly allowed), versus exactly 2 vendor-suffixed filenames. A
content-token ban is intractable; the enforceable invariant is *where vendor-named files
may live*.

## Options considered

1. **Filename/location rule** (recommended) — `*-<vendor>.js` (and vendor-named files
   generally) are legal only under an `adapters/<vendor>/` directory — pros: crisp,
   greppable, zero false positives / cons: does not police vendor tokens inside
   neutrally-named files (P29 already accepted that for bindings).
2. **Content token ban with allowlist** — cons: 137-site allowlist, permanent churn.
3. **Committed allowlist of exempt files** — cons: same drift problem as any pinned list.

## Decision

**Adopted-as-recommended (no user judgment).** source-hygiene lint gains a rule:
vendor-suffixed/vendor-named source files are permitted only under an
`adapters/<vendor>/` path segment. telemetry-claude.js, pricing-claude.js and
metrics-split.js therefore relocate to `engine/src/observability/adapters/claude/`
(ADR-190, ADR-198).

## Consequences

The P27 rule's enforceable core becomes location-based; content-level vendor mentions in
bindings and docs remain governed by the P29 precedent. A future vendor binding gets a
home for free (`adapters/<vendor>/`).
