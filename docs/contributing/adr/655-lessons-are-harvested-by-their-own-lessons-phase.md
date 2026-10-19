---
subjects:
  - pipeline/default.yml
  - skills/lessons/SKILL.md
  - engine/src/manifest-vocabulary.js
supersedes: []
---
# 655 — Lessons are harvested by their own `lessons` phase

- **Status:** accepted
- **Date:** 2026-10-19
- **Design:** docs/contributing/design/lessons-corpus.md · **Supersedes/Refines:** none

## Context

A run's lesson-shaped events (reset-on-red, multi-round review findings, real harness defects, decision deviations, environmental gate failures) need a step that reads the ledger, drafts evidence-backed lessons, dedupes them and records `LESSONS:` or `NO-OP(lessons):`. The step can sit inside an existing phase or be a phase of its own.

## Options considered

1. **A sub-step of `documentation` synthesis** (designer's recommendation) — pros: synthesis already reads the ledger and drafts the PR body; no new phase id, skill or descriptor / cons: the harvest cannot be turned off on its own, and `NO-OP(lessons)` names a step, not a phase.
2. **A new default-on `lessons` phase that `pipeline.skip` can turn off** — pros: a repo opts out with one manifest line; the harvest gets its own contract, gate, auto-skip signal and metrics row / cons: a descriptor, a `PHASE_NAMES` id, a skill and README pipeline edits.

## Decision

The user chose option 2. Harvesting runs in a new default-on `lessons` phase, declared in `pipeline/default.yml`, procedure `craft:lessons`, which `pipeline.skip: [lessons]` (or `--skip lessons`) turns off. `lessons` is a phase id in the manifest vocabulary, so it is valid in `pipeline.skip` and in a lesson's `phases` list. `NO-OP(lessons):` is that phase's runtime no-op under the ordinary `NO-OP(<phase>):` convention.

## Consequences

The phase never gates `propose` beyond its own lint of the drafts: skipping it waives nothing that any engine floor depends on. The pipeline diagram and phase lists in the README and guides gain the phase.
