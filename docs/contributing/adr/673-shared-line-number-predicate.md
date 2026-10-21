---
subjects:
  - engine/src/findings.js
supersedes: []
---
# 673 — Both finding shapes share one line-number predicate

- **Status:** accepted — adopted-as-recommended (no user judgment)
- **Date:** 2026-10-21
- **Design:** docs/contributing/design/per-line-over-range-line.md · **Supersedes/Refines:** none

## Context

The JSON path inlines `Number.isSafeInteger(candidate) && candidate >= 0`; the per-line path now
needs the same rule.

## Options considered

1. **Extract one predicate used by both shapes** *(recommended)* — pros: one definition of a valid
   line number (DRY) / cons: its `>= 0` term never fires on the per-line path, whose grammar admits
   no sign
2. **Inline `Number.isSafeInteger` at the per-line site** — pros: minimal / cons: two definitions
   that can drift

## Decision

Adopted-as-recommended (no user judgment): option 1. Each shape keeps its own message.

## Consequences

A future change to what a line number is lands once, for both shapes.
