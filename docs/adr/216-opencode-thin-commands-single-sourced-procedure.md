# 216 — opencode commands are thin dispatchers; invariant procedure text is single-sourced

- **Status:** accepted
- **Date:** 2026-07-17
- **Design:** docs/design/opencode-adapter.md · **Supersedes/Refines:** Coupled with ADR-217

## Context

opencode commands need the phase-procedure text craft's skills carry, but R-G2 forbids a second copy of any load-bearing rule. How much the commands re-author vs. reuse is a load-bearing fork coupled to the root seam (ADR-217): single-sourcing the invariant procedure via the shared skill bodies forces a binding-neutral root token, because those bodies invoke `${CLAUDE_PLUGIN_ROOT}/engine/bin/*`.

## Options considered

1. **Native thin `commands/` entrypoints; invariant procedure text single-sourced via the shared contract + Skills surface** *(designer recommendation)* — pros: no second copy of load-bearing rules; first-class `/craft:*` discoverability. Cons: forces the `CRAFT_ROOT` shim (ADR-217) since the shared bodies reference the engine root.
2. **Fully translate each phase skill into a standalone opencode command** — pros: Claude surface untouched. Cons: a divergent second copy of the phase choreography → drift.
3. **Rely purely on `.claude/skills/` compat, no native commands** — pros: least new surface. Cons: loses first-class slash commands; disable-able via `OPENCODE_DISABLE_CLAUDE_CODE_SKILLS`.

## Decision

*Ratified by the user.* Option 1. opencode `commands/craft-<phase>.md` are thin dispatchers; the invariant procedure text is single-sourced from the shared skill/contract surface, and the invariant floors are assembled by `contract-assemble` (never re-authored). The phase choreography is not copied per binding.

## Consequences

- No second copy of load-bearing rules (R-G2 satisfied maximally).
- **Forces the `CRAFT_ROOT` shim (ADR-217)** — the shared skill bodies literally invoke the engine root, which must resolve under opencode.
- First-class `/craft:*` command discoverability is retained in the TUI.
