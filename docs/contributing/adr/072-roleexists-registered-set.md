# 072 — `roleExists` registered set = `extends.agents` ∪ registered-phase roles

- **Status:** accepted
- **Date:** 2026-06-19
- **Design:** docs/DESIGN-P14-derived-plugin-extension.md · **Supersedes/Refines:** refines ADR-037 (defines "installed" for an external ref)

## Context

`roleExists` (`pipeline-resolve-main.js:12-19`) resolves craft-native `craft:<role>` against
`agents/<role>.md` but returns `true` for **any** non-`craft:` ref (permissive, line 13). So a typo'd
`acme:plannr` and a deliberate `acme:planner` are indistinguishable — the rider parked from P9
(ADR-037), which left "what counts as installed for an external ref" to the probe the caller supplies.
P14 supplies that definition from the manifest's `extends`.

## Options considered

1. **`extends.agents` only** — pro: single declaration point; catches a phase whose `role:` typos a
   near-miss of a real agent / con: a phase declaring `role: pluginB:x` must *also* list `pluginB:x`
   under `agents:` — redundant friction.
2. **`extends.agents` ∪ every registered/inserted phase's `role:`** — pro: a phase declaring
   `role: pluginB:x` *is* registering it; no double declaration / con: a phase-role typo is silently
   accepted as its own registration. *(designer's recommendation)*
3. **Any namespaced ref present anywhere** — con: too loose; a typo anywhere passes.

## Decision

The registered set is the **union of `extends.agents` and the `role:` of every registered/inserted
phase**. An external ref in that set passes `roleExists`; one outside it fails closed (`ok:false`, exit
2). Craft-native resolution and the traversal guard are unchanged. The set is built by the bin from the
**parsed manifest's `extends`** pre-resolution — `roleExists` is injected *into* `resolvePipeline`, so
it never reads from the Resolution it helps produce.

## Consequences

- A typo'd external role now fails closed at resolution, before the walk dispatches — symmetric with
  the craft-native typo guard, uniform for agent and inline (ADR-037).
- Accepted trade-off: a phase whose `role:` is itself a typo registers that typo for the run (option 1
  would have caught it). The stricter single-declaration model is available if a future run wants it.
- SC1 byte-identical: the default pipeline carries no external ref, so the new branch is never
  consulted on the no-manifest path; the empty registered set is never built.
