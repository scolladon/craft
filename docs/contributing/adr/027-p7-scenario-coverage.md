# 027 — P7 scenario coverage: composed SC3 + S-reorder + reorder-refused

- **Status:** accepted
- **Date:** 2026-06-17
- **Design:** docs/DESIGN-P7-pipeline-editing.md · **Supersedes/Refines:** none

## Context

The P7 gate (PRD §17) is "S3, SC3 green". Two framings of **SC3** coexist: PRD §18 defines it as
"a skip that strands a consumer-without-fallback is refused/flagged" (a negative criterion), while
the P7 brief calls SC3 "the pipeline-editing characterization golden — skip + insert + reorder
composed → effective order + record[] + gateDecisions" (a positive golden). No `scenarios/SC3/`
fixture exists yet. The scenario suite (`scenarios.test.js`) runs `resolvePipeline` against a
fixture manifest and asserts slices of the Resolution; a refused case (`ok:false`,
`effective:[]`) fits an inline negative test, not a fixture-dir golden.

## Options considered

1. **Composed SC3 + S-reorder + refused-negative** — SC3 = the composed positive golden; a focused
   positive `S-reorder`; a consumer-before-producer reorder-refused negative. *(user choice)*
2. **Composed SC3 only** — reorder positive/negative live as `applyReorder` unit tests. A
   composed-only golden can mask which edit regressed.
3. **SC3 = §18 literal + standalone S-reorder** — keeps SC3 narrowly the stranding criterion
   (largely relabels existing strand tests) but drops the composed golden the brief asks for.

## Decision

P7 authors three scenario-level checks, reconciling both framings of SC3:

- **SC3 (composed golden)** — `scenarios/SC3/manifest.yml` does skip + insert + reorder together
  (skip `refactoring`; insert `bench` after `validation`; `reorder: [validation, review]`). The
  golden pins the composed `effective[]` id-order, the four `record[]` lines (skip · insert · two
  reorder), and `gateDecisions` (bench has a gate; `propose.awaitingHarnesses` ⊇ {validation,
  bench}; refactoring absent). This carries the §18 spirit too — the composition is only valid
  because no edit strands.
- **S-reorder (positive)** — `scenarios/S-reorder/manifest.yml` reorders alone
  (`reorder: [validation, review]`), isolating reorder from the composition.
- **reorder-refused (negative)** — inline (no fixture dir), `reorder: [validation, implementation]`
  places `validation` before its `change` producer → `ok:false` with the graph's
  consumer-before-producer message. This is the literal §18 refusal guarantee, applied to reorder.

S3 (insert bench) stays untouched and green. `applyReorder` / `checkReorderApplicability` /
`validateReorder` also carry focused **unit** tests (edge cases: empty list, unknown id,
non-enabled id, duplicate, alias-resolved ids, inserted-phase id).

## Consequences

A regression in any single edit applicator surfaces against the isolated scenario (S-reorder /
S3) before the composed SC3, so the failure is legible. The negative proves the ADR-026 "same
machinery" refusal at the scenario layer. Fixture count grows by two dirs (`SC3`, `S-reorder`)
plus inline negatives — matching the P6 cadence (S-lean/S-full + unit, ADR-023).
