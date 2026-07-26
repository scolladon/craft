# 279 — Actionable set: absent/VERIFIED/SUSPECT/PROBE; RULED-OUT is record-only

- **Status:** accepted — adopted-as-recommended (no user judgment)
- **Date:** 2026-07-25
- **Design:** docs/design/sp9-findings-adoption.md · **Supersedes/Refines:** none

## Context

With statuses in the findings list, the review skill must define which findings the
session engages (fix or investigate) and which merely enter the record — and how the
convergence stop-rule counts them.

## Options considered

1. **Actionable = status ∈ {absent, VERIFIED, SUSPECT, PROBE}; RULED-OUT record-only;
   stop-rule counts only actionable MEDIUM+** *(recommended)* — pros: preserves today's
   behaviour for the status-less common case; RULED-OUT serves its whole purpose; convergence
   can terminate when only ruled-out claims remain / cons: one behavioural subtlety in
   stop-rule accounting.
2. **Every status actionable (RULED-OUT "applied" as a no-op record)** — pros: uniform /
   cons: RULED-OUT blocks nothing yet still counts, defeating the stop-rule gain.
3. **Only VERIFIED actionable; SUSPECT/PROBE record-only pending promotion** — pros:
   conservative / cons: stalls fixes behind a promotion step the single-pass reviewer never
   performs.

## Decision

Option 1. The session engages actionable findings exactly as today; `RULED-OUT` is written
to the run record as "examined, not a defect" and dropped from the fix set. Stop-rule
accounting (`low-only`, `non-low-count<=<n>`) operates on the actionable set only.

## Consequences

Status-less reviewers see zero behaviour change. Convergence cycles stop re-litigating
ruled-out non-issues; the record shows what was examined, not only what was fixed.
