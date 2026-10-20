---
subjects:
  - engine/src/intention.js
  - engine/src/manifest.js
  - skills/run/SKILL.md
supersedes: []
---
# 657 — `lessons.max_injected` defaults to 3, counted per phase

- **Status:** accepted
- **Date:** 2026-10-19
- **Design:** docs/contributing/design/lessons-corpus.md · **Supersedes/Refines:** none

## Context

Matched lessons are prepended into the slot-1 block, so their number bounds the prepend's size. The budget needs a default and a scope.

## Options considered

1. **3, per phase** (designer's recommendation) — pros: a pure function of phase and touched set, no cross-phase state, compaction-safe; about 60 lines at the 20-line How-to-apply cap / cons: a lesson can repeat across phases.
2. **5, per phase** — pros: more lessons reach a phase / cons: a larger prepend.
3. **3, per run** — pros: no repeats / cons: needs an injected-so-far set kept across phases, and early phases can starve later ones.

## Decision

The user chose option 1. `lessons.max_injected` defaults to 3 and is applied independently at each phase entry; `0` disables injection.

## Consequences

`sliceLessons` stays pure (phase, max) with no exclude set; the orchestrator holds no lesson state between phases.
