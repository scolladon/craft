# 271 — README phase-guard truth source is pipeline/default.yml enabled descriptors

- **Status:** accepted
- **Date:** 2026-07-25
- **Design:** docs/design/readme-drift-guards.md · **Supersedes/Refines:** none

## Context

The README shows the pipeline twice (mermaid diagram, run timeline). The drift guard
needs one truth source to compare against. The `skills/` directory also lists phase
names but holds non-phase skills (`run`, `init`, `metrics`, `promote-config`, `prune`,
`tune`), and two descriptors ship `enabled: false`.

## Options considered

1. **pipeline/default.yml, enabled descriptors only** *(designer recommendation)* —
   pros: the real descriptor source of truth; enabled-only filter yields exactly the 11
   README phases / cons: needs an explicit enabled-filter.
2. **skills/ directory listing** — pros: filesystem-simple / cons: needs a
   hand-maintained exclude list that itself drifts.
3. **Both, cross-checked** — pros: belt-and-braces / cons: a second source to keep in
   sync for no extra signal.

## Decision

The phase-name guard derives truth from `pipeline/default.yml`: every descriptor whose
`enabled` is not explicitly `false`. No other source is consulted.

## Consequences

Renaming/adding/removing an enabled descriptor breaks CI until the README follows.
The filter must be explicit (`has enabled AND enabled == false ⇒ excluded`) — the
idiomatic `.enabled // true` treats `false` as enabled and is forbidden here; a unit
test pins the exclusion.
