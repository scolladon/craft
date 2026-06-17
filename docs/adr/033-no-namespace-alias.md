# 033 — No back-compat `forge:` namespace alias — clean break

- **Status:** accepted
- **Date:** 2026-06-17
- **Phase:** P8.5 · **Refines:** ADR-004 (alias home), ADR-013 (alias is phase-id-only), [032](032-rename-forge-to-craft.md)

## Context

P8.5 renames the plugin `forge → craft` ([032](032-rename-forge-to-craft.md)). A committed
repo manifest or muscle memory may still invoke `forge:run` or carry `procedure: forge:design`.
Should the old `forge:` namespace keep resolving (an alias), or is it a clean break?

## Options considered

1. **No alias — clean break, signalled by the version bump.** *(user choice / decided by
   architecture)*
2. Ship a `forge: → craft:` namespace alias for one release. Adds a second alias notion
   (plugin-namespace) beyond the phase-id-only `ALIAS_MAP` that DC-4/ADR-013 exist to prevent.

## Decision

There is **no back-compat `forge:` namespace alias**. A Claude Code plugin has exactly one
name, and Claude Code offers no plugin-name alias mechanism — the namespace is derived from
`plugin.json`'s `name`, full stop. The shared `ALIAS_MAP` stays deliberately **phase-id-only**
(ADR-004/013); it is not the place to alias a plugin namespace. The clean break is signalled
by `version: 0.2.0` ([032](032-rename-forge-to-craft.md)).

## Consequences

`forge:run` / `forge:<phase>` stop resolving after the rename — the user re-invokes
`craft:run`. No alias table to keep in sync, no drift surface. Consistent with the fail-loud
stance of ADR-011/013 (a stale reference fails visibly, never silently half-works). The repo
has no remote and no installed users, so no migration window is owed.
