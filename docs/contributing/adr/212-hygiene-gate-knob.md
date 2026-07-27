# 212 — Shared `hygiene.gate` knob, waiver tokens, advisory default for the C gates

- **Status:** accepted
- **Date:** 2026-07-03
- **Design:** docs/design/harness-hygiene-prune-gates.md
- **Scope:** workstream C6/C7/C8

## Context

The two new C gates (stub, prose) need a promotion knob and a waiver mechanism. The
`intention.gate: advisory|blocking` manifest key is the established precedent.

## Options considered

1. **One shared `hygiene: { gate: advisory|blocking }` manifest block governing both C
   gates; `STUB-WAIVE`/`SLOP-WAIVE` prose tokens; advisory default** (recommended) —
   pros: one knob, one validated vocabulary set mirroring `INTENTION_GATES`; consistent
   token family / cons: both gates share one posture.
2. **Per-gate knobs** — pros: independent promotion / cons: two knobs, more surface, no
   current need.

## Decision

A single `hygiene.gate` manifest knob (values `advisory|blocking`, validated against a
frozen set exactly like `INTENTION_GATES`, fail-closed on an unknown value) governs both C
gates (C6). **User-ratified: both gates default advisory (C7)** — findings print to the run
record and exit 0; promotion to blocking is a manifest edit. Waivers are fixed greppable
prose tokens `STUB-WAIVE(<marker>)` / `SLOP-WAIVE(<phrase>)`, never inline suppression
directives (C8, honoring the no-suppression floor). **C6 and C8 adopted as recommended; C7
ratified by the user.**

## Consequences

Both gates ship inert-but-visible; the team tunes the marker set and ban-list before
flipping the knob. The waiver tokens are auditable in the diff and the run record. A future
split into per-gate knobs remains open if a divergent posture is ever needed.
