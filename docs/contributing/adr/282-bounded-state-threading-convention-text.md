# 282 — Bounded-state threading: convention text, behaviour-preserving

- **Status:** accepted — adopted-as-recommended (no user judgment)
- **Date:** 2026-07-25
- **Design:** docs/design/sp9-findings-adoption.md · **Supersedes/Refines:** none

## Context

The measured result behind this change (bounded-state threading matched full-transcript
threading at ~31% fewer output tokens, directional n=1) argues that multi-round intra-phase
loops should thread a bounded structured state, never an accumulated transcript. Review
convergence already behaves this way; the question is how to codify it.

## Options considered

1. **Convention text, behaviour-preserving — stated in the concepts guide (Frame 1), the
   review skill's convergence step, and the `harness-read` fix-delta clause**
   *(recommended)* — pros: codifies an existing invariant with zero behavioural risk, in
   the places where multi-round loops are actually described / cons: not mechanically
   enforced.
2. **Mechanically enforce a bounded shape/size on the threaded review state** — pros:
   policed / cons: a new enforcement surface with no current defect to fix.
3. **Text only, in a single home (concepts frame)** — pros: smallest diff / cons:
   under-specifies — the review skill is where the convention binds a real loop.

## Decision

Option 1. The convention is stated as: a multi-round intra-phase loop threads a bounded
structured state — the normalized, status-tagged `Finding[]` plus the fix diff — never an
accumulated transcript.

## Consequences

No behaviour change; the convention is documented where it binds. Mechanical enforcement
remains available as a follow-up if a real oversized-carry defect ever appears.
