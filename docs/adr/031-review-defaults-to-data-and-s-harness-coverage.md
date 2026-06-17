# 031 — Review defaults relocate to data; S-harness scenario coverage

- **Status:** accepted
- **Date:** 2026-06-17
- **Design:** docs/DESIGN-P8-harness-config.md · **Supersedes/Refines:** none

## Context

`review`'s harness knobs (`dimensions = code, security, tests, perf`, "≤3 cycles", "LOW-only
convergence") are hardcoded in `skills/review/SKILL.md` prose; `review` has no `harness:` block in
`pipeline/default.yml` (unlike `validation`/`architecture`). For the walk to honor a manifest
override against a known baseline, the baseline must live somewhere the walk reads. The P8 gate is
"review/validation knobs honored", proven by a scenario golden — but two framings of the coverage
exist (one composed fixture vs. split per-harness), and the bad-shape case is a `validateManifest`
concern, not a `resolvePipeline` one.

## Options considered

1. **Keep defaults in prose; harness block only overrides** — two homes for the same numbers (prose
   default + data override); the walk can't read a baseline from data.
2. **Relocate review's four knobs into `review.harness` in `pipeline/default.yml`** — data is the
   SoT; the walk reads them with strong code-level fallbacks; golden-safe. *(user choice)*

For coverage: **(a)** one composed S-harness fixture vs **(b)** split review + validation fixtures
plus an inline bad-shape negative.

## Decision

`review`'s four knobs move into `review.harness` in `pipeline/default.yml`
(`dimensions: [code, security, tests, perf]`, `passes: 1`, `max_cycles: 3`, `convergence: low-only`);
the walk reads them from the resolved descriptor, falling back to the same strong defaults in code
when a knob is absent. This is **golden-safe** — no scenario or contract-equivalence test asserts a
descriptor's `harness` value (verified), exactly the precedent P5 set adding `refactoring.contract`.
Coverage is **split (option b)**: `S-harness-review` (partial `{max_cycles: 2}` override → the merged
descriptor keeps default `dimensions`), `S-harness-validation` (partial `{scope: per-file}` override →
keeps default `tool: stryker`), plus an **inline bad-harness-shape negative** in `manifest.test.js`
(a `validateManifest` ok:false). Split isolates which merge regressed; the negative proves the
ADR-030 validator at the scenario layer.

## Consequences

`pipeline/default.yml` changes (the `review.harness` add) — permitted under the P8 surface gate
precisely because no test asserts a descriptor's harness value (the same exception P5 used). The two
S-harness fixtures pin the deep-merge guarantee (override wins, default survives) at the resolution
layer; the inline negative pins the validator. The walk's `passes > 1` fan-out and arbitrary numeric
`convergence` enforcement are documented as parked (no silent cap) — the data and validator accept
them, the engine does not yet enforce the multi-reviewer parallelism.
