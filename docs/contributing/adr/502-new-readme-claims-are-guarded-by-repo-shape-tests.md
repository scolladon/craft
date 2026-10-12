---
subjects:
  - test/
  - README.md
---
# 502 — New README claims are guarded by repo-shape tests

- **Status:** accepted
- **Date:** 2026-10-12
- **Design:** docs/contributing/design/public-front-door-completion.md · **Supersedes/Refines:** none

## Context

The new README claims (version badge path, version literal, comparison table, Codespaces link) need drift guards. readme-drift recomputes claims from data; these are structural equalities and absences.

## Options considered

1. **Repo-shape `node:test` files under `test/`, one per part** *(recommended)* — pros: house convention; each part's test lands in its own commit
2. **New readme-drift sub-guards in `engine/src`** — pros: one README guard home / cons: recomputation machinery for non-computed claims; the readme-drift design scoped the comparison table out

## Decision

Option 1 — **adopted-as-recommended (no user judgment).** Each new README claim is pinned by a root `test/*.test.js` file; readme-drift is unchanged. Aligns with the readme-drift-guards design's out-of-scope line.

## Consequences

Four new root tests. readme-drift keeps guarding only recomputed claims.
