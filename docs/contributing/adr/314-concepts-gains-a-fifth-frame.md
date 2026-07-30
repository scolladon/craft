# 314 — The concepts guide gains a fifth frame

- **Status:** accepted
- **Date:** 2026-07-30
- **Design:** docs/contributing/design/orchestrator-tax-hardening.md · **Supersedes/Refines:** none

## Context

The concepts guide holds four frames and sets an explicit bar for admitting another: a frame
earns its section only if it changes what you would build next, not only what you would call
what already exists. The orchestrator-tax frame is the source of this change, and it produced
three mechanisms that did not exist before it — the on-disk ledger, the boundary digest, and
the cognitive-locality warning.

## Options considered

1. **Add it: new section, narrative plus mapping table, Rosetta row, source link, and the four-to-five count edits** *(recommended, conditionally)* — pros: meets the guide's own bar with the same kind of evidence the first frame cites for itself / cons: the guide grows, and the bar is deliberately a judgment the guide reserves.
2. **Fold the new rows into the first frame instead** — pros: no new section / cons: understates it — the claim that stale context taxes every later turn is not something that frame's rows say.
3. **Defer until the mechanisms have run in anger** — pros: safe / cons: costs a second documentation pass.

## Decision

**Ratified by the user, as recommended.** The guide gains a fifth frame covering the
orchestrator's tax, with its mapping-table rows naming only mechanisms this change ships.

## Consequences

The guide's count changes in both the guide and the readme, so any prose saying "four frames"
is now wrong and in scope. The frame's rows must name shipped mechanisms, which orders it
last in the plan: it cannot be written truthfully until the mechanisms it maps have landed.
