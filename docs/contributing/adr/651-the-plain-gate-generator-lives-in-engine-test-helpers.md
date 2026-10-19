---
subjects:
  - engine/test-helpers/plain-gate-generator.js
  - engine/test-helpers/git-differential-harness.js
supersedes: []
---
# 651 — The plain-gate generator lives in engine test helpers

- **Status:** accepted — adopted-as-recommended (no user judgment)
- **Date:** 2026-10-18
- **Design:** docs/contributing/design/copilot-guard-differential-fuzz-arm.md · **Supersedes/Refines:** none

## Context

The gate is engine code shared by copilot and codex, and the harness is already 479 lines.

## Options considered

1. **New engine/test-helpers/plain-gate-generator.js** importing harness primitives (recommended).
2. Extend git-differential-harness.js / cons: past 600 lines, two unrelated generators.
3. A helper under adapters/copilot/test/ / cons: hides a gate-level tool in one binding.

## Decision

Adopted as recommended: a new binding-neutral `engine/test-helpers/plain-gate-generator.js`; adapters import it like they already import the harness.

## Consequences

A codex gate arm can reuse it later without moving code.
