---
subjects:
  - pipeline/default.yml
  - skills/impact-triage/SKILL.md
  - engine/src/manifest-vocabulary.js
supersedes: []
---
# 703 — Impact triage is a phase after lessons and before propose

- **Status:** accepted — ratified by the user
- **Date:** 2026-10-26
- **Design:** docs/contributing/design/discovered-impacts.md · **Supersedes/Refines:** none

## Context

Triage must see every deferral, including late harness ones and lessons-phase observations, and must run before the PR body is final.

## Options considered

1. **New phase `impact-triage` after `lessons`, before `propose`** *(recommended)* — pros: zero engine logic change, auto-skip and `pipeline.skip` work as-is, own model pin and resume row / cons: descriptor count and golden fallout
2. **New phase right after `documentation`** — cons: a lessons-phase deferral misses triage
3. **A documentation sub-step** — cons: runs under docs-writer (sonnet) and may race the background harness

## Decision

Ratified by the user: option 1. Descriptor `impact-triage`, archetype `delivery`, contract `delivery`, procedure `craft:impact-triage`, role `craft:impact-triager`, model opus. It waits for `awaitingHarnesses` like `lessons`, is never itself awaited, and auto-skips when the run holds no `DEFERRED(` line.

## Consequences

Every pipeline count, golden and role list grows by one phase. Skipping the phase leaves deferrals in the store until `close`, with the PR trailer reading "triage pending".
