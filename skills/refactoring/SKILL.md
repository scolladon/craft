---
name: refactoring
description: Craft phase 7 - widen the lens to the whole codebase for structural gains the diff-scoped passes cannot see; behavior-preserving; may be an honest no-op.
---

# craft:refactoring

## Preamble (always runs — non-overridable)

1. Manifest read (lint if standalone); gates as in implementation's preamble.

## Procedure (default body — a manifest `override:` replaces everything below)

1. **Judgment — session-owned, in-thread:** quick candidate scan seeded by the
   feature's diff, radiating only as far as the feature's concerns reach: duplication
   now warranting centralization, responsibilities in the wrong layer, the Nth
   consumer of a pattern that should become shared. Bounded by YAGNI/KISS — no
   speculative abstraction.
2. **Nothing clears the bar → first-class no-op.** Record
   `NO-OP(refactoring): nothing cleared the bar — <justification>` in the run record,
   the 1–3 line justification stating what was considered and why nothing changed; the
   run record is carried into the PR body (documentation phase), so the no-op is stated,
   not hidden. This is a recorded outcome symmetric with the decisions phase's
   `NO-OP(decisions):` line — same token, kept idiom — not an implicit skip. Spawning an
   agent merely to conclude no-op is forbidden waste. A silent skip is not allowed.
3. **Candidates survive → scope each into a precise spec** (what moves where, which
   symbols/files, expected mechanical test changes, blast radius), then spawn
   **craft:refactor-executor** with the specs, gates, and context files.
   Integrate-don't-defer: in-scope gains land NOW in this change; only a genuinely
   feature-sized refactor (own design + ADRs) becomes a follow-up entry.
4. **Re-review, scoped to the refactor diff only**, via craft:review's procedure
   (same dimensions, per-dimension convergence ≤3). Findings implying FURTHER
   refactoring become follow-ups, not another loop. `gates.phase` green to close.
5. Order rationale: this runs BEFORE validation so validation scores the final shape.
