# 131 — The plan-decomposition unit "slice" is renamed "part"

- **Status:** accepted
- **Date:** 2026-06-22
- **Design:** docs/DESIGN-P24-rename-slice-vocabulary.md · **Supersedes/Refines:** none

## Context

The plan decomposes work into units of one atomic TDD commit each. craft named that unit
"slice", which reads as house jargon rather than mainstream software-engineering vocabulary.
The unit name is load-bearing: it appears as plan headings, a lint keyword, contract prose,
the per-unit worker agent's name, and a gate-granularity key. A replacement must be a single,
plain word that works equally as a heading token, an identifier stem, and running prose.

## Options considered

1. **increment** *(designer recommendation)* — pros: Scrum "potentially-shippable increment" pedigree; precise. Cons: carries shippable/integrated connotations heavier than the unit needs.
2. **work item** / **work unit** — pros: generic. Cons: two words (awkward heading token); "work item" collides with issue-tracker vocabulary, the same reason the brief rejected "task".
3. **part** *(user choice)* — pros: plain, single word, zero jargon and zero collision; reads naturally as `## Part N`, `part-implementer`, `gates.part`, "every part is one atomic commit". Cons: less SE-specific than "increment".

## Decision

The unit is a **part**. The user chose "part" over the recommended "increment": the brief's
goal was to shed jargon, and "part" is maximally plain while staying mechanically clean across
heading, identifier, and prose. Every craft-vocabulary use of "slice" meaning this unit becomes
"part".

## Consequences

- Plan headings become `## Part N`; the `plan-lint` keyword anchors `^## Part`.
- The unit name feeds the agent rename (ADR 132 → `part-implementer`) and the gate key rename
  (ADR 133 → `gates.part`).
- "slice" survives only in sense E (`Array.slice`, the English verb) and where a document is
  *naming the old term it replaced* (this ADR set and the P24 design doc).
