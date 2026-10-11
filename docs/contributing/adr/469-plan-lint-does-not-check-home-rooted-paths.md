---
subjects:
  - engine/src/plan-lint-main.js
---
# 469 — plan-lint does not check home-rooted paths

- **Status:** accepted
- **Date:** 2026-10-11
- **Design:** docs/contributing/design/scrub-home-dir-from-docs.md · **Supersedes/Refines:** none

## Context

ADR-467 already guards every committed file in this repo. Making `plan-lint` reject home paths
would turn a repo hygiene fix into a product-wide gate in user repos.

## Options considered

1. **No plan-lint check** *(recommended)* — pros: no new user-facing behaviour
2. **Shared detector in `engine/src`, used by plan-lint and the hygiene class** — cons: unrequested product gate

## Decision

Option 1 — adopted-as-recommended (no user judgment). plan-lint is unchanged.

## Consequences

- Revisit if a user repo reports the same leak.
