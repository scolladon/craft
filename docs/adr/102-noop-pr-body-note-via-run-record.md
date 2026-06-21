# 102 — A phase no-op's PR-body note is the run-record line carried into the body, not a dedicated bullet

- **Status:** accepted
- **Date:** 2026-06-21
- **Design:** docs/DESIGN-P19-noop-first-class-phase-outcome.md · **Supersedes/Refines:** none

## Context

A first-class no-op must be "recorded (run-record line) + carried (PR-body note)". The run record is
already drafted into the PR body — `skills/documentation/SKILL.md` step 3 includes "the run record" in
the body it drafts, and `skills/propose/SKILL.md` step 3 ships that body. So a run-record no-op line
already surfaces into the PR body with no new plumbing. The question is whether "PR-body note" needs a
dedicated bullet beyond that carry.

## Options considered

1. **Carried** — the existing run-record→PR-body flow suffices; no new bullet.
   *(designer's recommendation; user's choice)* — pros: zero new surface; stays inside the wording-only
   constraint / cons: no-op visibility depends on the run-record line being present.
2. **Dedicated bullet** — add an explicit "Phase no-ops:" line to the PR-body draft in
   `documentation/SKILL.md` step 3 — cons: new surface for no marginal information.
3. **Both** — cons: redundant.

## Decision

The "PR-body note" for a judgment-phase no-op **IS the run-record line**, which the documentation phase
already carries verbatim into the PR body. No dedicated PR-body bullet is added and
`skills/documentation/SKILL.md` / `skills/propose/SKILL.md` are **not** edited.

## Consequences

- The change stays confined to the two phase skills plus the orchestrator prose — no documentation/propose
  edit, honoring the wording-only constraint.
- No-op visibility in the PR body is guaranteed by the run-record line the edited skills now mandate
  (ADR-100/103), not by a separate body element.
