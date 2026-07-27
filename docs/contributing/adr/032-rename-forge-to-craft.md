# 032 — Rename the plugin forge → craft (name + derived namespace + version bump)

- **Status:** accepted
- **Date:** 2026-06-17
- **Design:** docs/DESIGN-customizable-engine.md · **Phase:** P8.5 (non-PRD interstitial — branding/productization)

## Context

The plugin shipped under the name `forge`. P8.5 is a productization/branding interstitial
(sequenced after P8, before P9; the PRD §17 numbering is unchanged) that renames it to
`craft`. The engine core is already namespace-agnostic — ADR-025 made the walk dispatch
`phase.procedure` verbatim, so `engine/src/**` and `engine/bin/**` hardcode no namespace.
The rename is therefore DATA (`pipeline/default.yml`) + manifest (`plugin.json`,
`marketplace.json`) + skill/agent prose + tests + docs + one runtime lock — not engine logic.

Claude Code namespaces skills/agents as `<plugin-name>:<dir>`. The namespace is **derived**
from `plugin.json`'s `name`, so flipping `name: forge → craft` makes every skill `craft:<dir>`
and every agent `craft:<name>` automatically. The skill/agent directories DO NOT move (unlike
P4's concern-rename which `git mv`'d dirs) — only the hardcoded `forge:` strings that must
match the new derived namespace flip.

## Options considered

1. **Rename `name` in `plugin.json` + `marketplace.json` to `craft`, flip the hardcoded
   `forge:` strings to `craft:`, leave skill/agent dirs in place, bump version
   `0.1.1 → 0.2.0`.** *(user choice)*
2. Keep `forge` — reject the rename. Loses the productization intent.

## Decision

Rename the plugin to **`craft`**: `name: craft` in both `.claude-plugin/plugin.json` and
`.claude-plugin/marketplace.json`; flip every hardcoded `forge:` procedure/role string in
`pipeline/default.yml` (13 `procedure:` + 9 `role:`) and the test goldens/fixtures that assert
them to `craft:`; flip the npm metadata `@forge/engine → @craft/engine`
(`engine/package.json` + lockfile — metadata only, never imported by path). Skill and agent
directories stay put — the namespace re-derives from the new `name`. **Bump
`version: 0.1.1 → 0.2.0`** to signal the breaking namespace change.

## Consequences

`engine/src/**` and `engine/bin/**` show 0 diff (already namespace-agnostic — the surface
gate). Goldens are NOT byte-identical (the deliberate difference from P4): the test fixtures
flip `forge:` → `craft:` in lockstep with `default.yml` so the suite stays green by
construction. Every `/forge:run` invocation becomes `/craft:run`. A repo that pinned the old
namespace updates its `procedure:`/`role:` strings — the `0.2.0` bump is the signal. See
[033](033-no-namespace-alias.md) (no back-compat alias), [034](034-docs-sweep-everything.md)
(docs scope), [036](036-mutation-lock-rename.md) (lock rename).
