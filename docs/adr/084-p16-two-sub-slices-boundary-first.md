# 084 — P16 delivered as two sub-slices: boundary first, then Pi PoC

- **Status:** accepted
- **Date:** 2026-06-20
- **Design:** docs/DESIGN-P16-provider-agnostic.md · **Supersedes/Refines:** none

## Context
P16 carries two deliverables with a hard dependency but opposite risk profiles: the
ports/adapters **boundary extraction** (near-no-op on the Claude side — doc-framing + new
port-spec docs) and the **Pi adapter PoC** (live runtime-integration). The PoC binds the
named seams, so the boundary is its precondition.

## Options
1. **Two sub-slices, boundary first** — land the boundary, then the PoC binds reviewed seams. pros: isolates the inert change from the runtime-integration risk, legible diff / cons: two phase fronts in one run. *(designer's recommendation, chosen)*
2. **One combined change** — interleave both. pros: fewer boundaries / cons: mixes inert and risky work in one diff, harder to review/bisect.
3. **Boundary now, Pi PoC deferred** — pros: smallest run / cons: leaves G13 unproven; contradicts the full-P16 scope the user chose.

## Decision
Deliver P16 as two sub-slices **within this run**, boundary-extraction slices first, then the
Pi PoC slices. The plan orders all boundary slices ahead of any Pi slice; the Pi slices
`consume` the committed port-spec docs as their pre-chewed input.

## Consequences
- The planner produces one slice list with a clean internal seam: boundary slices, then Pi slices.
- Review/validation see the boundary as already-landed when judging the PoC.
- If the Pi runtime proves un-installable at implementation, the boundary slices still ship as a
  coherent, valuable change (the PoC slices escalate as a blocker rather than sinking the run).
