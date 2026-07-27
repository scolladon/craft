# 290 — Guide §4 numbering is the canonical example-index order

- **Status:** accepted
- **Date:** 2026-07-27
- **Design:** docs/contributing/design/examples-catalog-gap-closure.md · **Supersedes/Refines:** none

## Context

`examples/README.md` and `docs/guides/customizing.md` §4 both number the PRD §7 injection
points but diverged: README numbers `derived-plugin` as #12 and omits `dod-artifact`
entirely, while §4 numbers DoD as #12 and `derived-plugin` as #13. One ordering must be
canon before the indexes can be reconciled and guarded.

## Options considered

1. **Adopt guide §4 (DoD=#12, derived-plugin=#13), align README** — pros: §4 is the
   PRD-anchored, more complete index; least churn (README gains one row + one bump) /
   cons: README history shows a renumbered row. **(designer's recommendation)**
2. **Adopt README, align guide** — pros: no README churn / cons: canonizes the index that
   already dropped a row; guide renumbering touches more cross-references.
3. **Renumber both from scratch** — pros: clean slate / cons: maximum churn, breaks stable
   #1–#13 references for no gain.

## Decision

**Adopted-as-recommended (no user judgment).** Guide §4's numbering is canon: DoD
artifact = #12, derived-plugin = #13. `examples/README.md` is brought into line (insert
the `dod-artifact` row as #12, bump `derived-plugin` to #13).

## Consequences

Both indexes agree on #1–#13; future index additions take §4's numbering as the
reference. The README completeness guard (ADR 292) enforces presence, not numbering —
numbering parity remains a review concern.
