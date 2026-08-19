---
subjects:
  - engine/src/adr-lint-main.js
---
# 356 — The citation-sweep exempt set derives from resolved manifest paths

- **Status:** accepted — adopted-as-recommended (no user judgment)
- **Date:** 2026-08-18
- **Design:** docs/contributing/design/decision-drift-propagation.md · **Supersedes/Refines:** none

## Context

The citation sweep must never flag a dated-ledger path. Of 123 files citing `ADR-NNN` outside
the ADR directory, 96 sit in the frozen tier — per-run design docs, plans, PRDs, archived
program docs — which are records of what was true on their date.

## Options considered

1. **A fixed prefix list in the lint** — pros: trivial / cons: hardcodes craft's own layout into
   engine code.
2. **Derived from resolved `paths.adr`/`paths.design`/`paths.plan`** plus the archive/PRD
   siblings, with an optional `adr.frozen: [<globs>]` override — pros: honest for any consumer
   layout / cons: needs the manifest at lint time. *(designer's recommendation)*
3. **Inverted — an explicit live allowlist** — pros: explicit / cons: fails closed in the wrong
   direction; a surface nobody listed silently stops being swept.

## Decision

**adopted-as-recommended (no user judgment).** Option 2. Nothing hardcodes a
`docs/contributing/…` literal. Exempting `paths.adr` also covers the superseding ADR and its
target, so no separate self-flagging rule is needed — a decision record citing another decision
record is a historical statement, on the same footing as a dated plan.

## Consequences

Defaults to today's layout for craft with zero configuration and stays correct for a consumer
whose layout differs. A consumer with an unusual frozen tier reaches for `adr.frozen` rather
than patching engine code.
