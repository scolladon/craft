# 260 — Codex `CRAFT_ROOT` self-location

- **Status:** accepted
- **Date:** 2026-07-20
- **Design:** docs/design/native-codex-binding.md · **Supersedes/Refines:** Mirrors ADR-246 (copilot craft-root self-locate) and ADR-235 (pi self-locate)

## Context

The engine addresses its own root through the `${CRAFT_ROOT:-${CLAUDE_PLUGIN_ROOT}}` shim. Row 17: Codex honours `CLAUDE_PLUGIN_ROOT`, `PLUGIN_ROOT`, `CLAUDE_PLUGIN_DATA`, `PLUGIN_DATA` in hook command templates — but these are **CONFIRMED only as matched strings in the binary**, never observed substituting live.

## Options considered

1. **Self-locate from `import.meta.url`**, mirroring pi and copilot, up-walk depth asserted by test *(chosen)* — pros: proven twice already in this tree; zero external dependency; fails loud on a wrong depth. Cons: none material.
2. **Rely on Codex's `CLAUDE_PLUGIN_ROOT`/`PLUGIN_ROOT` substitution in the hook command template** — cons: those levers are CONFIRMED only as strings in the binary and were never observed substituting live; building on them would be designing from a plausible-looking artifact, the exact failure mode this PoC discipline exists to prevent.
3. **Literal `<CRAFT_ROOT>` placeholder in `config.template.toml`, substituted by hand at install** (copilot's approach) — cons: copilot needed this only because it has *no* plugin-root variable at all; Codex plausibly does, so a manual placeholder buys nothing here.

## Decision

*Adopted as recommended (no user judgment).* Option 1. `adapters/codex/src/craft-root.js` self-locates from `import.meta.url`, up-walks a fixed number of levels, and asserts the resolved root exists **and** contains `engine/bin`, throwing on failure. The up-level count depends on final file placement and is **asserted by test, never assumed**. The existing `${CRAFT_ROOT:-${CLAUDE_PLUGIN_ROOT}}` shim stays the textual form in any authored surface, so the no-bare-`${CLAUDE_PLUGIN_ROOT}` hygiene check applies uniformly with no carve-out.

## Consequences

- `CLAUDE_PLUGIN_ROOT`/`PLUGIN_ROOT` remain an unproven convenience, documented as a candidate for a follow-up once actually exercised — not relied upon now.
- A non-`file://` module URL throws; a missing `engine/bin` throws — both fail loud rather than resolving to a wrong root.
- This is the third binding to implement the identical self-locate pattern, after pi (ADR-235) and copilot (ADR-246).
