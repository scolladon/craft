# 178 — DoD auto-criteria assert against recorded per-phase gate evidence

- **Status:** accepted
- **Date:** 2026-06-28
- **Design:** docs/design/activate-dod-and-live-doc-lints.md · **Supersedes/Refines:** refines 174, 109

## Context

The structured-DoD sidecar (parse/validate/`assertDodCriteria`) is built and unit-tested,
but nothing invokes the assertion at runtime — the `validation` phase's DoD sub-concern
records `NO-OP(verify)` even when a structured DoD declares mechanically-checkable criteria.
A `kind: auto` criterion with `assert.gate: <phase-id>` must be evidenced by the recorded
result of that phase's gate. Today the run record holds gate outcomes only as free prose,
with no machine-readable per-phase signal to map onto.

## Options considered

1. **Per-phase gate token** — the run record emits a fixed `GATE(<phase-id>): green|red`
   per phase-boundary gate; `assert.gate` maps onto it. Pros: per-phase granularity exactly
   matches what a criterion names; a red/absent gate cannot be read as green; aligns with the
   fixed-greppable-token convention. Cons: one new recorded token. **(recommended)**
2. **Coarse "ci passed" boolean** — a single did-the-suite-pass signal. Pros: trivial. Cons:
   loses per-phase granularity — cannot tell which gate a criterion names, so an unrelated
   green could satisfy `assert.gate: architecture`.

## Decision

The `validation` phase asserts `kind: auto` criteria by mapping `assert.gate: <phase-id>`
onto the run record's per-phase `GATE(<phase-id>): green|red` tokens. The run skill emits one
such token at each phase-boundary gate; the DoD sub-concern collects the green phase-ids and
passes them as the gate evidence to `assertDodCriteria`. A gate recorded red — or not recorded
at all — yields `gateGreen ≠ true`, so the criterion resolves `unmet`. A contributor editing
the DoD cannot flip a red gate green: the engine asserts against the gate it actually ran,
identified by phase-id, never a command string (the 174 security crux holds).

## Consequences

`skills/run/SKILL.md` records the fixed `GATE(...)` token; `skills/validation/SKILL.md`'s
structured-sidecar branch invokes a thin engine bin that builds the evidence and calls
`assertDodCriteria`. `kind: judgment` criteria stay human-asserted; the non-blocking
`NO-OP(verify): no DoD declared` path is unchanged. Evidence is whatever `GATE(...): green`
lines exist in the in-session run record at assertion time — a criterion naming a not-yet-run
or skipped gate resolves fail-closed `unmet`.
