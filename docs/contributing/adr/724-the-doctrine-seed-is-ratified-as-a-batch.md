---
subjects:
  - docs/contributing/DOCTRINE.md
supersedes: []
---
# 724 — The doctrine seed is ratified as a batch at the decisions phase

- **Status:** accepted
- **Date:** 2026-11-05
- **Design:** docs/contributing/design/decisions-doctrine-layer.md · **Supersedes/Refines:** none

## Context

The seed clusters 168 live user-ratified ADRs into 14 entries (design §Seed). Entries become adopt authority, so who ratifies them matters.

## Options considered

1. **Ratify the §Seed table now; the part verifies each entry against its cited Decision sections and may drop or narrow, never add** *(recommended)* — pros: the user ratifies authority at the phase built for it / cons: titles drawn from ADR titles are unverified until the part reads them.
2. **Seed only entries backed by an against-recommendation ruling, plus D-1** — cons: leaves repeatedly ratified clusters uncited.
3. **The part clusters freely; review at PR** — cons: authority moves to a PR review that may be admin-merged.

## Decision

Ratified by the user: option 1. D-1 to D-14 as tabled in the design's §Seed are the seed. The implementation part reads each cited ADR's Options and Decision sections; an entry a cited Decision does not support is dropped or narrowed. Any addition goes through a later harvest.

## Consequences

- The PR states every dropped or narrowed entry.
