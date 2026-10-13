---
subjects:
  - adapters/codex/test/hook-trust-differential.test.js
supersedes: []
---
# 530 — The fuzz seed and cap are constants, not env overrides

- **Status:** accepted — adopted-as-recommended (no user judgment)
- **Date:** 2026-10-13
- **Design:** docs/contributing/design/codex-trust-matcher-differential-fuzz.md · **Supersedes/Refines:** none

## Context

Deep soaks over many seeds were useful during review cycles, but the gate must stay deterministic.

## Options considered

1. **Named constants only** *(recommended)* — pros: no input to validate / cons: a soak is a local edit
2. **Validated env overrides** — cons: a lowered cap trips the trusted-count floor or needs a scaled floor

## Decision

Adopted-as-recommended (no user judgment): option 1 (YAGNI).

## Consequences

Revisit if repeated soaks become routine.
