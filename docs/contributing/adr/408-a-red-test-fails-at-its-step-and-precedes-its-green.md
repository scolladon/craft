---
subjects:
  - agents/planner.md
---
# 408 — A RED test fails at its step and precedes the GREEN that satisfies it

- **Status:** accepted — adopted-as-recommended (no user judgment)
- **Date:** 2026-10-08
- **Design:** docs/contributing/design/planner-red-label-audit.md · **Supersedes/Refines:** none

## Context

The kept plans show three defect shapes: a passing test claimed to fail, a RED label on a passing test, and a test sequenced after the GREEN that already satisfies it, followed by a step that breaks code to watch it fail. A label rule alone fixes the first two but leaves a new-behaviour test with no failing run.

## Options considered

1. **Label rule plus ordering: a RED test fails against the code as it stands at its step; put a new-behaviour test before the GREEN that satisfies it; no step breaks code to watch a test fail** *(recommended)* — pros: every requirement gets a real failing test / cons: one more sentence
2. **Label rule only** — pros: shortest / cons: a test written after its GREEN never fails
3. **Ordering only** — pros: short / cons: an already-passing regression test stays mislabelled

## Decision

Adopted as recommended (option 1).

## Consequences

- A part with no failing test (refactor-only, characterisation) is allowed: every test in it is a non-RED entry (ADR-409).
- No `plan-lint` check is added: whether a test passes cannot be decided from plan text.
