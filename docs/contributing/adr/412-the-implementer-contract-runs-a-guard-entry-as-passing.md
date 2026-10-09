---
subjects:
  - contracts/construction.md
  - agents/part-implementer.md
---
# 412 — The implementer contract runs a `GUARD` entry as passing

- **Status:** accepted
- **Date:** 2026-10-08
- **Design:** docs/contributing/design/planner-red-label-audit.md · **Supersedes/Refines:** refines ADR-407

## Context

`contracts/construction.md`, injected into every part-implementer spawn, says a test written first "must fail for the stated reason", with no exception. Plans now carry `GUARD` entries that pass by design (ADR-409), including parts made only of them (ADR-408). An implementer bound by the old line can hand back a blocker, refuse the refactor, or break code to watch a `GUARD` fail, which moves the defect from the plan into the implementer. ADR-407 kept the implementer side out of scope and named only `agents/part-implementer.md`, not the contract.

## Options considered

1. **Add a `GUARD` clause to `contracts/construction.md` and a `GUARD` slot to the part-implementer handback line in this change** *(recommended)* — pros: plan and contract agree from the first plan that carries `GUARD` / cons: no eval case measures the implementer, so it ships on reasoning
2. **Record the gap and defer it to a follow-up** — pros: the change stays planner-only / cons: the contradiction is live meanwhile
3. **Planner side only** — pros: no contract change / cons: relies on plan wording to override a binding contract line

## Decision

The maintainer chose option 1. A plan `GUARD` entry is written, run, and confirmed passing for its stated reason; it owes no failure and no GREEN, and no step breaks code to watch it fail. The part-implementer reports one line per RED/GREEN cycle and per `GUARD`.

## Consequences

- ADR-407's consequence that `agents/part-implementer.md` stays unchanged no longer holds for its handback line.
- The implementer's behaviour on a `GUARD` has no behavioural eval; a reviewer or an implementation-phase observation is the only evidence until a case measures it.
- ADR-421 refines this: "confirmed passing for its stated reason" and "owes no failure and no GREEN" hold only for a `GUARD` that passes on its first run; a `GUARD` that fails on its first run is a RED.
