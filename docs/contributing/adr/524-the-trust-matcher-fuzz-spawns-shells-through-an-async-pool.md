---
subjects:
  - adapters/codex/test/hook-trust-differential.test.js
supersedes: []
---
# 524 — The trust-matcher fuzz spawns shells through an async pool

- **Status:** accepted — adopted-as-recommended (no user judgment)
- **Date:** 2026-10-13
- **Design:** docs/contributing/design/codex-trust-matcher-differential-fuzz.md · **Supersedes/Refines:** none

## Context

Each trusted command runs under four shells. `spawnSync` measured 9-14 ms per run; an async pool of 8 measured 1.5-2.8 ms.

## Options considered

1. **Async `spawn` pool of 8** *(recommended)* — pros: 5-7× faster; pool 16 is no faster / cons: a small worker-pool helper in the test
2. **`spawnSync`, as `config.test.js` does** — pros: simplest / cons: about 3 s for this file alone

## Decision

Adopted-as-recommended (no user judgment): option 1, `POOL_SIZE = 8`, each spawn bounded by `SPAWN_TIMEOUT_MS`.

## Consequences

Failure records are collected per leg and asserted once, so pool ordering never changes the verdict.
