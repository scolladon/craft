# 084 — P16 delivered as two sub-parts: boundary first, then Pi PoC

- **Status:** accepted
- **Date:** 2026-06-20
- **Design:** docs/DESIGN-P16-provider-agnostic.md · **Supersedes/Refines:** none

## Context
P16 carries two deliverables with a hard dependency but opposite risk profiles: the
ports/adapters **boundary extraction** (near-no-op on the Claude side — doc-framing + new
port-spec docs) and the **Pi adapter PoC** (live runtime-integration). The PoC binds the
named seams, so the boundary is its precondition.

## Options
1. **Two sub-parts, boundary first** — land the boundary, then the PoC binds reviewed seams. pros: isolates the inert change from the runtime-integration risk, legible diff / cons: two phase fronts in one run. *(designer's recommendation, chosen)*
2. **One combined change** — interleave both. pros: fewer boundaries / cons: mixes inert and risky work in one diff, harder to review/bisect.
3. **Boundary now, Pi PoC deferred** — pros: smallest run / cons: leaves G13 unproven; contradicts the full-P16 scope the user chose.

## Decision
Deliver P16 as two sub-parts **within this run**, boundary-extraction parts first, then the
Pi PoC parts. The plan orders all boundary parts ahead of any Pi part; the Pi parts
`consume` the committed port-spec docs as their pre-chewed input.

## Consequences
- The planner produces one part list with a clean internal seam: boundary parts, then Pi parts.
- Review/validation see the boundary as already-landed when judging the PoC.
- If the Pi runtime proves un-installable at implementation, the boundary parts still ship as a
  coherent, valuable change (the PoC parts escalate as a blocker rather than sinking the run).
