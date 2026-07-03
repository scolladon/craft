# 189 — manifest.js splits three ways along its Set-vocabulary / harness / pipeline-edit seams

- **Status:** accepted
- **Date:** 2026-07-02
- **Design:** docs/DESIGN-shrink-core-prune-guardrails.md · **Supersedes/Refines:** none

## Context

`engine/src/manifest.js` is 667 lines, past the repo's 200–400 line norm. It has three
natural seams: the Set-vocabulary validators, the harness-knob handling, and the
pipeline-edit (insert/extends) logic. Consumers import four symbols that must not move
from the module's public surface.

## Options considered

1. **3-way split** (recommended) — pros: each module lands inside the norm; seams are the
   file's real cohesion boundaries / cons: one barrel re-export to maintain.
2. **2-way split** — pros: smaller diff / cons: the larger half likely stays >400 lines.
3. **4-way split** — pros: smallest modules / cons: over-fragmentation; pipeline-edits
   only warrants its own module if the core remains >400 lines after the 3-way cut.

## Decision

**Adopted-as-recommended (no user judgment).** Split `manifest.js` into three modules
along the Set-vocabulary / harness / pipeline-edit seams, re-exporting the four consumed
symbols through the existing module path so no consumer import changes. Escalate to a
4-way cut only if a resulting module still exceeds 400 lines.

## Consequences

Pure move; the existing test suite is the safety net and must pass unmodified except for
import paths internal to engine/src. Stryker's `engine/src/**/*.js` scope already covers
the new files.
