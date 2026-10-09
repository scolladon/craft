---
subjects:
  - evals/implementer-runs-guards/scaffold.sh
  - evals/implementer-runs-guards/prompt.md
---
# 415 — The implementer case delivers the assembled production contract

- **Status:** accepted — adopted-as-recommended (no user judgment)
- **Date:** 2026-10-09
- **Design:** docs/contributing/design/implementer-guard-eval.md · **Supersedes/Refines:** none

## Context

A direct `craft:part-implementer` spawn does not receive `contracts/construction.md`: the run skill prepends the output of `engine/bin/contract-assemble.js` to the spawn prompt. Without that block the rule under test is absent from the spawn.

## Options considered

1. **The scaffold runs `contract-assemble.js --descriptor-id implementation` into the git dir; the prompt has the session prepend it verbatim** *(recommended)* — pros: production bytes, core included / cons: the scaffold needs the engine's dependencies
2. **Copy only `contracts/construction.md`** — pros: no node call / cons: drops the core; not what production sends
3. **No contract** — pros: simplest / cons: measures a spawn production never makes

## Decision

Adopted-as-recommended (no user judgment): option 1.

## Consequences

- `npm ci` in `engine/` is a precondition of the case, already stated for every eval run.
