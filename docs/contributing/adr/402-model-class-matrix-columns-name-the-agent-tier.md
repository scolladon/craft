---
subjects:
  - docs/guides/model-class-matrix.md
  - docs/contributing/maintainer-smokes.md
---
# 402 — Model-class matrix columns name the agent tier

- **Status:** accepted — adopted-as-recommended (no user judgment)
- **Date:** 2026-10-07
- **Design:** docs/contributing/design/eval-sweep-followups.md · **Supersedes/Refines:** none

## Context

With a haiku session unsupported (ADR-396), a column that means "session and agents at this tier" cannot be filled for haiku. The eval rows already hold the session at sonnet (ADR-398); the full-pipeline rows have not been run yet.

## Options considered

1. **Every column names the agent tier, the session held at a supported tier; both procedures say so** *(recommended)* — pros: one meaning per column / cons: the full-pipeline procedure changes before its first run
2. **Eval rows by agent tier; full-pipeline haiku cells "n/a"** — pros: no full-pipeline change / cons: one column, two meanings
3. **Define the eval rows only** — pros: smallest change / cons: the next full-pipeline run starts without a definition

## Decision

Adopted as recommended (option 1). A matrix column names the tier the craft agents run at. The session runs at opus or sonnet. The haiku column routes agents to haiku via `models.*` or the sub-agent override.

## Consequences

- If probe P2 re-opens ADR-398, this decision is re-opened with it.
