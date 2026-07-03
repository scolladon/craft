# 194 — docs/archive/ receives dated closed-program docs only; customizable-engine SoT stays live

- **Status:** accepted
- **Date:** 2026-07-02
- **Design:** docs/DESIGN-shrink-core-prune-guardrails.md · **Supersedes/Refines:** none

## Context

docs/ holds ~52 dated program artifacts ({DESIGN,PLAN,PR}-P*, SC5-*) for discharged
programs alongside live docs. BACKLOG.md and live docs carry source-of-truth pointers
into some of them; PRD-/DESIGN-customizable-engine are still referenced as living SoT.

## Options considered

1. **Archive P-numbered dated docs only, carve out the two customizable-engine SoT
   files** (recommended) — pros: conservative; every live pointer stays valid / cons:
   slug-named closed docs linger until their program is provably discharged.
2. **Also archive slug-named closed docs** — cons: requires per-doc discharge judgment
   now; higher pointer-breakage risk.
3. **Keep customizable-engine docs in the sweep too** — cons: breaks the live SoT
   pointers in BACKLOG.md.

## Decision

**Adopted-as-recommended (no user judgment).** Move the dated P-numbered program docs
(P0–P16 and any later discharged P-number: P27–P29 qualify) to docs/archive/, updating
every SoT pointer in BACKLOG.md, skills, and examples. PRD-customizable-engine and
DESIGN-customizable-engine remain live.

## Consequences

docs/ shrinks to live material; backlog-lint and design-lint must stay green across the
sweep. Future closed programs archive under the same key (ADR-195 enforces it).
