# 217 — binding-neutral `CRAFT_ROOT` shim over `${CLAUDE_PLUGIN_ROOT}`

- **Status:** accepted
- **Date:** 2026-07-17
- **Design:** docs/design/opencode-adapter.md · **Supersedes/Refines:** Coupled with ADR-216

## Context

15 operational references to `${CLAUDE_PLUGIN_ROOT}` (14 `skills/<phase>/SKILL.md` + `hooks/hooks.json`) locate the engine bins/scripts; opencode sets no such env var. The engine itself never reads the token — every bin self-locates via `import.meta.url` (0 engine references). So the seam is entirely a binding-surface concern. Single-sourcing the procedure text (ADR-216) means the shared bodies must resolve an engine root under both runtimes.

## Options considered

1. **Binding-neutral `${CRAFT_ROOT:-${CLAUDE_PLUGIN_ROOT}}` across the 15 operational refs; opencode plugin exports `CRAFT_ROOT`** *(designer recommendation)* — pros: one seam both bindings; Claude behaviour preserved (shim defaults to the still-set `CLAUDE_PLUGIN_ROOT`); engine untouched. Cons: touches 15 shipped Claude skill/hook files.
2. **opencode-local resolution only** — pros: Claude surface untouched. Cons: pushes toward a re-expressed command copy (drift), contradicting ADR-216.
3. **Per-bin wrapper scripts** — cons: proliferation.

## Decision

*Ratified by the user.* Option 1. Rewrite the 15 operational references to `${CRAFT_ROOT:-${CLAUDE_PLUGIN_ROOT}}`. Under Claude, `CRAFT_ROOT` is unset and the shim defaults to `CLAUDE_PLUGIN_ROOT` (behaviour-preserving). Under opencode, the plugin exports `CRAFT_ROOT` from its `directory`/`worktree` context. This touches only the Claude binding surface (`skills/` + `hooks/`) — never `engine/`, `contracts/`, `pipeline/`, or `templates/` (R-SC2's protected set).

## Consequences

- One seam serves both bindings; the engine gains no runtime knowledge.
- The export mechanism into the `` !`cmd` `` command-injection shell (candidate: the `shell.env` hook) is a live-smoke item (design §D9 D-row 30).
- The resolver (compute an absolute, existing, contained root from the plugin context) is a pure unit-tested seam: `adapters/opencode/src/craft-root.js`.
