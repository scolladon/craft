# 037 — Negative-path: engine-level `roleExists` probe

- **Status:** accepted
- **Date:** 2026-06-17
- **Design:** docs/DESIGN-P9-agent-swap.md · **Supersedes/Refines:** refines ADR-020 (inline role-craft sourcing); pairs with ADR-040

## Context

`phases.<id>.role` is a free string. No role-existence check exists anywhere — `manifest.js` only
string-shape-checks it, `resolve.js` copies it onto the descriptor, `contract-assemble.js` keys on
`id`. So a typo'd or uninstalled swap (`role: my:plannr`) passes lint and resolution, then in agent
mode fails only at Task-spawn time and in inline mode *silently* falls into the ADR-020 "non-local
role → contract-only" path — indistinguishable from a deliberate `acme:planner`. The design framed
the loud surface as a load-bearing choice (DC-A) between a walk-level STOP (0-diff) and engine-level
detection. ADR-040 independently puts `engine/src` in play (a new `procedure` override field), so the
0-diff rationale that favoured the walk-level option no longer holds.

## Options considered

1. **Walk-level STOP** — a Walk error-paths row symmetric with ADR-025's "procedure resolves to no
   installed skill"; agent mode already loud at spawn, inline mode STOPs-and-asks. Keeps `engine/src`
   0-diff. *(designer's recommendation, under the now-moot 0-diff assumption)*
2. **Engine resolution-layer detection** — `resolvePipeline` gains an injected `roleExists` predicate
   (mirroring the `fileExists` injection already used for manifest validation); a missing role makes
   the resolution `ok: false`. Caught before any walk step, uniformly for agent and inline; no weak
   inline "ask". *(user choice — chosen once ADR-040 made the engine delta unavoidable)*
3. **New `engine/bin/role-resolve.js`** the walk calls per phase — loud and isolated-testable, but a
   whole new bin plus the unsettled "what counts as installed" registration question (P14).

## Decision

The role-existence guard lives in the engine, at resolution. `resolvePipeline` accepts an injected
`roleExists(ref) → boolean` predicate (I/O-free core; the caller supplies the probe, exactly as
`validateManifest` takes `fileExists`). When a phase carries a swapped `role` whose ref the predicate
rejects, resolution returns `ok: false` with a role-not-found error naming the phase and the ref. A
craft-native default role (`craft:<role>`) and a resolvable external ref pass; a typo or uninstalled
ref fails closed. The same uniform guard covers agent and inline — there is no inline-only "ask", and
no walk-level STOP row for the role case. The predicate is injected, never called from the pure core,
so `resolvePipeline` stays I/O-free and the 7-export surface is unchanged.

## Consequences

`engine/src` is not 0-diff (accepted — ADR-040 already commits to an engine delta; the surface gate
becomes "7-export surface unchanged + minimal tested engine delta + SC1 record byte-identical", not
"`engine/src` 0-diff"). A swap to a non-existent role is caught at the earliest possible point, before
the walk dispatches anything, identically for both execution modes — the silent inline degradation is
closed. A deliberate external role stays valid as long as the injected probe says it resolves; the
"what counts as installed" definition rides with the probe the caller supplies (the walk's resolver),
keeping the P14 registration question out of the core. SC1 is unaffected: no-manifest resolution never
carries a swapped role, so `roleExists` is never consulted on the default path and the record stays
byte-identical.
