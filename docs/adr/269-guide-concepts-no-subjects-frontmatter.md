# 269 — GUIDE-concepts carries no `subjects:` frontmatter (advisory-only corpus member)

- **Status:** accepted
- **Date:** 2026-07-24
- **Design:** docs/design/communication-revamp-four-frames.md · **Supersedes/Refines:** none

## Context

Living-corpus pages may declare `subjects:` frontmatter to become freshness-guarded by the
intention port (`assert-fresh` flags `INTENTION-DRIFT` when a covered path changes and the
page does not). GUIDE-concepts is an orientation layer over the *whole* engine — its
natural subject set is close to everything.

## Options considered

1. **No `subjects:`** — advisory-only corpus member (designer's recommendation) — pros: no
   over-flagging; `intention-lint-ci` stays green; a subjects-free corpus page is a
   documented, intended state / cons: staleness is caught by review, not mechanically.
2. **Broad `subjects:`** — cons: near-every change flags `INTENTION-DRIFT`, drowning the
   signal the port exists to provide.
3. **Narrow `subjects:` naming only itself** — cons: guards nothing real; ceremony without
   a sensor.

## Decision

**Adopted-as-recommended (no user judgment).** Option 1: GUIDE-concepts ships without
`subjects:` frontmatter. This mirrors the intention port's own start-advisory guidance.

## Consequences

The guide is enumerated (so hygiene and intention lints scan it) but never triggers
drift flags. Revisitable once the guide stabilizes — declaring `subjects:` later is a
one-file change (recorded as deferred in the design's Out of scope).
