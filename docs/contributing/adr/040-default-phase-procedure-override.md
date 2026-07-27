# 040 — Default-phase `procedure:` override field

- **Status:** accepted
- **Date:** 2026-06-17
- **Design:** docs/DESIGN-P9-agent-swap.md · **Supersedes/Refines:** refines ADR-025 (verbatim-procedure dispatch); pairs with ADR-037

## Context

The PRD titles P9 "Agent/skill swap". The engine models two axes separately: `role:` (which agent runs a
phase) and `procedure:` (which skill orchestrates it). Role swap on default phases shipped at the
resolution layer (S2); `procedure:` swap shipped only for *inserted* phases (ADR-025 verbatim dispatch).
A default phase's `procedure` was not overridable — `manifest.js`'s allowed override fields and
`resolve.js`'s `applyAllowedOverrides` did not include it. The design recommended keeping P9 to `role:`-
only and documenting `procedure:` as P7/§7 #9 territory. The user chose to widen P9 so a default phase's
skill can also be swapped from the manifest — making "skill swap" literally true in this phase.

## Options considered

1. **`role:`-only** — document that `procedure:` swap shipped P7 (ADR-025) and skill-body swap is the
   `override:` file point (PRD §7 #9). Tight; matches the "S2 green" gate. *(designer's recommendation)*
2. **Also tighten `override:`-file UX** — pull PRD §7 #9 forward; wider, with its own test surface.
3. **Add a default-phase `procedure:` override field** — a new overridable descriptor field so
   `phases.<id>.procedure: acme:my-skill` redirects a *default* phase's orchestration, dispatched
   verbatim by the existing walk (ADR-025). *(user choice)*

## Decision

`procedure` becomes an allowed per-phase override field on default phases. `manifest.js` accepts
`phases.<id>.procedure` (string shape-check, alongside `role`/`model`), and `resolve.js`'s
`applyAllowedOverrides` copies it onto the effective descriptor — exactly the path `role` already takes.
The walk dispatches the overridden `procedure` verbatim (ADR-025, unchanged): a swapped skill that
resolves to no installed skill STOPs loudly via the *existing* "procedure resolves to no installed skill"
row — no new walk machinery. The override is a manifest concern only; `pipeline/default.yml`'s 13
descriptors and their default `procedure` values are unchanged. The `roleExists` guard (ADR-037) is the
role-axis sibling of this skill-axis override; the procedure axis reuses the already-shipped walk STOP for
its negative path rather than an engine probe (the walk already resolves skills by dispatch).

## Consequences

`engine/src` is not 0-diff: `manifest.js` (one field in the allowed set + a shape check) and `resolve.js`
(`applyAllowedOverrides` gains `procedure`) change — the minimum to make the field first-class. The
7-export surface and `resolvePipeline`'s signature are unchanged; `pipeline/default.yml` is unchanged, so
SC1 (no-manifest resolution) is byte-identical. P9 now delivers BOTH swap axes from the manifest — agent
(`role:`) and skill (`procedure:`) — for default phases, the literal reading of the PRD title. The
negative path differs by axis by design: a missing role fails closed at resolution (ADR-037, uniform for
agent/inline), a missing procedure STOPs at the walk's dispatch step (ADR-025, the shipped idiom). This
re-opens default-phase dispatch that ADR-025 had scoped to inserted phases — accepted as a deliberate P9
scope widening, recorded here so future work reads the dispatch surface as "default phases too".
