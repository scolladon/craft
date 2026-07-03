# 195 — a docs-structure lint enforces the archive convention for closed programs

- **Status:** accepted
- **Date:** 2026-07-02
- **Design:** docs/DESIGN-shrink-core-prune-guardrails.md · **Supersedes/Refines:** extends the structure-lint family (backlog-lint/design-lint)

## Context

Without enforcement, docs/ re-accumulates closed-program artifacts and the ADR-194 sweep
decays. The repo already runs structure linters in CI (backlog-lint, design-lint), so the
archive convention has a natural home.

## Options considered

1. **docs-structure lint** (recommended) — a CI-run script fails when a dated doc whose
   P-number the backlog marks discharged still lives outside docs/archive/ — pros:
   mechanical, same family as existing lints / cons: needs a reliable discharged-marker
   to key on.
2. **Checklist prose in the closing chore** — cons: unenforced convention, exactly what
   decayed before.
3. **backlog-lint cross-check** — cons: overloads backlog-lint with a docs concern.

## Decision

**Adopted-as-recommended (no user judgment).** A new docs-structure lint, keyed on the
`-P<number>-` filename pattern against the backlog's discharged markers, runs in ci.sh
beside the existing structure linters.

## Consequences

Closing a program without archiving its dated docs turns CI red; archiving becomes part
of the closing chore commit by construction.
