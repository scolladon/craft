# 293 — New example dirs use point-descriptive kebab names

- **Status:** accepted
- **Date:** 2026-07-27
- **Design:** docs/contributing/design/examples-catalog-gap-closure.md · **Supersedes/Refines:** none

## Context

The six new sample dirs need names. The existing catalog mixes point-descriptive names
(`skip-phase`, `gate-command`, `override-procedure`, `dod-artifact`) with a few
story-named dirs (`karpathy-as-context`, `everything-claude-toolkit`).

## Options considered

1. **Point-descriptive kebab** — `policy-headless-merge`, `intention-corpus`,
   `memory-cache`, `phase-required`, `hygiene-gate`, `pipeline-reorder` — pros: matches
   the dominant convention; each dir stays greppable to its manifest key / cons: less
   evocative. **(designer's recommendation)**
2. **Story-descriptive** — `auto-merge`, `living-intention`, … — pros: reads like a
   recipe / cons: breaks grep-to-key; collides with future stories on the same key.
3. **Bare-key** — `policy`, `intention`, … — pros: shortest / cons: a dir named after the
   key alone can't coexist with a second sample of the same key.

## Decision

**Adopted-as-recommended (no user judgment).** The six dirs are named
`policy-headless-merge/`, `intention-corpus/`, `memory-cache/`, `phase-required/`,
`hygiene-gate/`, `pipeline-reorder/`.

## Consequences

Grep for a manifest key finds its sample dir. Future samples follow key-first,
qualifier-second naming.
