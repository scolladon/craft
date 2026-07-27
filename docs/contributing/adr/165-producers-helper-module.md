# 165 — shared producersOf helper in engine/src/producers.js

- **Status:** accepted
- **Date:** 2026-06-27
- **Design:** docs/design/simpler-phase-authoring.md · **Supersedes/Refines:** none

## Context

Pedagogical strand/graph errors must list which phases produce a given artifact. Both
`strand.js` and `graph.js` need that listing.

## Options considered

- (a) New pure `engine/src/producers.js` (`producersOf`) imported by both.
- (b) Export it from `graph.js`; `strand.js` imports from `graph.js`.
- (c) Duplicate the listing logic in each.

## Decision

(a). One owner, no cross-module coupling (`strand` → `graph`), DRY.

## Consequences

- A single pure function to unit-test; both call sites stay thin.
- (c) would drift two copies; (b) couples strand to graph for an unrelated reason.
