# 147 — An auto-skipped executing-harness releases its propose-gate via the recorded-no-op path

- **Status:** accepted
- **Date:** 2026-06-23
- **Design:** docs/DESIGN-P26-auto-skip-unnecessary-phases.md · **Supersedes/Refines:** none

## Context

`propose` does not start `pr create` until every executing-harness in its `awaitingHarnesses`
set (today: `validation`) has landed a run and gone green. Two release paths already exist:
the **engine skip-waiver** (the harness is absent from `effective[]` — skipped/disabled —
emitting a `WAIVER:` line, ADR-082), and the **orchestrator recorded-no-op release** (the
harness ran, found nothing, recorded `NO-OP`, and the walk treats that as a release at
gate-check time, ADR-082). An auto-skipped executing-harness (e.g. `validation`/`architecture`,
now eligible per ADR-144) is still **in** `effective[]` — it carries no engine waiver — yet it
never lands a run. Which release path applies must be settled, or `propose` would wait forever.

## Options considered

1. **Recorded-no-op release path** *(designer recommendation)* — the walk treats a recorded
   `auto-skip:` of an executing-harness as a release of its `awaitingHarnesses` entry at
   gate-check time, exactly as it treats a runtime `NO-OP`. Pros: an auto-skipped phase is in
   `effective[]` (like a no-op'd one), not absent (like a waived one), so this is the
   structurally-matching path; no `gates.js`/engine change. Cons: the release lives in
   orchestrator prose, not the engine (already true for the no-op release).
2. **Engine skip-waiver path** — emit a `waivers[]` entry for the auto-skipped harness. Cons:
   the engine emits waivers only for phases *absent* from `effective[]`; an auto-skipped phase
   is present, so this would mis-model it and require engine change.

## Decision

*Adopted-as-recommended.* An auto-skipped executing-harness releases its `awaitingHarnesses`
entry through the **same orchestrator-owned recorded-release path as a runtime no-op**
(ADR-082): the walk, at gate-check time, treats a recorded `auto-skip:` of a phase in the
`awaitingHarnesses` set as a release, so `propose` proceeds. This is **not** an engine waiver
(the engine still emits `waivers[]` only for skip/disable phases absent from `effective[]`).
No `gates.js` or engine change.

## Consequences

- `propose` is never left waiting on a harness that auto-skipped.
- The release is symmetric with the runtime-no-op release; the `skills/run/SKILL.md` cross-phase
  invariant gains one clause: a recorded `auto-skip:` of an awaited harness releases its entry,
  exactly as a recorded `NO-OP` does.
- The three engine floors — including `validation-triage-gates-propose` — are untouched: a phase
  that *does* land a run still gates `propose` until its triage is green.
