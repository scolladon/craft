---
subjects:
  - engine/test/guards
  - engine/stryker.conf.json
supersedes: []
---
# 589 — The differential fuzz lives beside the guards, outside Stryker

- **Status:** accepted — adopted-as-recommended (no user judgment)
- **Date:** 2026-10-15
- **Design:** docs/contributing/design/copilot-git-argv-normalising-guard.md

## Context

The hand-rolled tokeniser and normaliser are differentially fuzzed against bash and real git.
Stryker's dry run executes every listed test file each run, so thousands of process spawns must not
join its corpus.

## Options considered

1. **`engine/test/guards/*.differential.test.js`, excluded from Stryker's test files**
   *(recommended)* — falls back to option 2 if a negated glob is refused.
2. **Under `adapters/copilot/test/`** — runs in CI, not in Stryker's list.
3. **A review-time script** — cons: no regression net.

## Decision

Adopted-as-recommended (no user judgment): option 1, with option 2 as the fallback; aligns with the
narrow-Stryker-corpus practice.

## Consequences

The plan pins whether the exclusion works before the fuzz lands.
