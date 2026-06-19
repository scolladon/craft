# 082 — Propose-gate releases on a recorded executing-harness runtime no-op

- **Status:** accepted
- **Date:** 2026-06-19
- **Design:** docs/DESIGN-P15-second-instantiation.md · **Supersedes/Refines:** none (DC-7 as recommended); refines the propose-gate invariant in `skills/run/SKILL.md`

## Context

The orchestrator's propose-gate invariant holds `propose` until every id in
`propose.awaitingHarnesses` "has landed its run and its gate is green" (`skills/run/SKILL.md`;
`skills/propose/SKILL.md`). The engine emits a waiver — releasing the wait — **only** when a phase is
skipped or explicitly disabled and is absent from `effective[]` (`engine/src/gates.js`,
`WAIVABLE_PHASE_IDS`). On a non-tsgit repo, `validation` is *enabled* and *in* `effective[]` (so it gets
no waiver and **is** in `awaitingHarnesses`), but its tool-agnostic mutation probe finds no mutation
config and the phase ends with a recorded no-op — it never "lands a run." No clause says a recorded
runtime no-op releases the propose wait, so `propose` could wait forever. This is the one place a
zero-config non-tsgit run can deadlock the orchestrator.

## Options considered

1. **Fix in P15** — add a one-clause orchestrator rule: a *recorded* executing-harness runtime no-op
   releases its `propose` wait, symmetric to a skip-waiver — pro: closes the only zero-config deadlock at
   the ship gate; mechanism over memory; SC1-neutral (fires only on a runtime no-op, never on the tsgit
   Stryker-present path) / con: a small orchestrator-prose edit. *(designer's recommendation)*
2. **Declare it already-intended**, document only — con: the release would rely on the session
   *remembering* to treat a no-op like a waiver; violates craft's mechanism-over-memory principle.
3. **Defer to a follow-up backlog item** — con: ships a known potential hang at the ship gate.

## Decision

Add a bounded clause to the orchestrator's propose-gate invariant: an executing-harness in
`awaitingHarnesses` that, at runtime, **records a no-op** (its tool probe finds nothing and the phase ends
with a note) **releases its propose-gate entry**, symmetric to a skip/disable waiver. A matching one-line
note in `skills/propose/SKILL.md`'s preamble: the awaited validation run has "landed **or** recorded a
no-op." This is orchestrator/skill prose, not engine code — the engine waiver path
(`gates.js`) still covers skip/disable only; no engine surface for "runtime no-op" is added in P15.

## Consequences

- A zero-config run on a non-tsgit repo (no mutation tool) reaches `documentation`/`propose` without
  deadlocking on the no-op'd validation — observed live in the SC5 smoke (ADR-080).
- SC1 stays byte-identical and G9 is preserved: the clause fires only on a runtime no-op, which the tsgit
  default path (Stryker present) never reaches, so default tsgit behaviour is unchanged.
- This is the **sole** behaviour-touching edit P15 makes (ADR-081); it has no `node --test` surface (it is
  orchestrator prose) — its guard is the SC5 smoke reaching `propose`. A future engine-level
  "executing-harness no-op" surface is explicitly out of P15 scope.
