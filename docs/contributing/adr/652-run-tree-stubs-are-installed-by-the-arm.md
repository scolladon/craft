---
subjects:
  - engine/test-helpers/plain-gate-generator.js
  - engine/test-helpers/git-differential-harness.js
supersedes: []
---
# 652 — Run-tree stubs are installed by the arm

- **Status:** accepted — adopted-as-recommended (no user judgment)
- **Date:** 2026-10-18
- **Design:** docs/contributing/design/copilot-guard-differential-fuzz-arm.md · **Supersedes/Refines:** none

## Context

Every external wrapper and string runner the generator names must be a deterministic stub; three arms already call `withTree`.

## Options considered

1. **installStubs(tree.bin)** inside the arm's `withTree` act (recommended) — touches no shared signature.
2. A `withTree(act, { stubs })` option / cons: changes a shared signature for one caller.

## Decision

Adopted as recommended: the generator module exports `installStubs(bin)`; `withTree` is unchanged. No real watch, tmux, ssh, sudo, parallel or caffeinate runs.

## Consequences

Stubs live only in the throwaway run tree.
