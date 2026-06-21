# 105 — DoD-aware verification is enabled by default

- **Status:** accepted
- **Date:** 2026-06-21
- **Design:** docs/DESIGN-P20-dod-aware-verification.md · **Supersedes/Refines:** none

## Context

The brief says *"if no DoD is set, raise a warning."* Read literally, the verification must run for every
repo so the warning can fire — i.e. default-ON. The design recommended default-OFF to keep zero-config runs
byte-identical (the `architecture`/`requirements` precedent). This is a genuine fork (DC-1b): brief wording
versus zero-config conservatism.

## Options considered

1. **Default-OFF** — verification off until a repo opts in. *(designer's recommendation)* — pros: zero-config
   runs stay byte-identical; the absence-warning, once enabled, means the actionable "you turned verify on
   but gave no DoD" / cons: does not honour the brief's literal "warn for everyone."
2. **Default-ON** *(chosen)* — verification runs by default — pros: honours the brief literally; every repo
   with no DoD gets the warning on its next run / cons: changes the default run experience (a new recorded
   outcome in every run record).

## Decision

DoD-aware verification **runs by default**. Because it folds into `validation` (ADR-104), which is already
enabled in `pipeline/default.yml`, no descriptor flag changes: the DoD check runs for every repo whose
`validation` phase runs, and the DoD-absence warning fires for every such repo that has not authored a DoD.

## Consequences

- The brief's "warn when no DoD is set" holds for every repo, not just opt-in ones.
- A repo whose `validation` phase no-ops on absent mutation tooling **still** gets the DoD check (ADR-104's
  decoupling rule) — so default-ON is meaningful even where mutation testing is unavailable.
- **This repo ships its own `docs/DOD.md`** (dogfooding + to keep its own craft runs clean), and per the
  ratifying conversation that default DoD lists **mutation testing** as a checklist line (alongside
  checks-green and the feature criteria) — the concrete instance of a DoD subsuming engineering-check (2)
  (ADR-108/109).
- The absence outcome is the recorded, non-blocking `NO-OP(verify):` (ADR-107) — default-ON adds a loud
  ledger line, never a default-run block.
