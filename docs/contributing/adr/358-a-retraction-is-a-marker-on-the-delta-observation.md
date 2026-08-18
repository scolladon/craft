---
subjects:
  - engine/src/observability/memory.js
---
# 358 — A retraction is a marker on the delta observation

- **Status:** accepted — adopted-as-recommended (no user judgment)
- **Date:** 2026-08-18
- **Design:** docs/contributing/design/decision-drift-propagation.md · **Supersedes/Refines:** none

## Context

The RETRACTED transition needs a way to reach `save`. The port's write verb is
`save(repoRoot, view, delta, deps)` and `delta` is an array of `{ concern, payload }`
observations indexed by `entryKey(concern, payload)`.

## Options considered

1. **A marker field on the existing observation** — `{ concern, payload, retract: true }` —
   pros: `indexDelta`/`entryKey` untouched, so a retraction keys against the store by the same
   merge key an observation does / cons: a boolean field on a data shape.
   *(designer's recommendation)*
2. **A separate `retractions` argument to `save`** — pros: explicit / cons: widens the port's
   only write verb's arity, which every binding and the spec's prose must follow.
3. **A sentinel `confidence: FLOOR` payload** — pros: no shape change / cons: overloads a field
   the reconciler owns and the content whitelist forbids phase surfaces from writing, so a
   malformed store could forge a retraction.

## Decision

**adopted-as-recommended (no user judgment).** Option 1. No second lookup path exists, so none
can drift from the first.

## Consequences

`addedEntries` must filter retraction-marked observations out of the ADDED path, or a retraction
whose key matches nothing stored would *add* the entry it meant to kill. The branch order in
`reconcileConcern` is retraction → drop, observation → REFRESHED, neither → DECAYED, and that
order is pinned by a dedicated test rather than left to coverage incident.
