# 225 — opencode reuses `.claude/` repo-local state paths verbatim

- **Status:** accepted
- **Date:** 2026-07-17
- **Design:** docs/design/opencode-adapter.md · **Supersedes/Refines:** none

## Context

`.claude/workflow.md` (manifest) and `.claude/craft-*.md` (memory, metrics, named configs) are repo-local markdown read by **engine code** via `fs`, rooted at the repo root (`skills/run/SKILL.md` step 1c-mem: "NEVER `${CLAUDE_PLUGIN_ROOT}`"). opencode also reads `.claude/`.

## Options considered

1. **Reuse `.claude/workflow.md` + `.claude/craft-*.md` verbatim** *(designer recommendation)* — pros: repo-local markdown the engine already roots at the repo root; zero divergence; no new surface. Cons: the `.claude/` name reads Claude-flavoured under opencode (cosmetic).
2. **Mirror to `.opencode/craft-*.md`** — cons: two sources of truth.
3. **Make the base path a manifest knob** — cons: new surface for no proven need.

## Decision

*Adopted-as-recommended (no user judgment).* Reuse `.claude/workflow.md` + `.claude/craft-*.md` unchanged. The engine reads them via `fs` rooted at the repo root regardless of runtime; `OPENCODE_DISABLE_CLAUDE_CODE` does not affect this (it governs opencode's own instruction/skill compat loader, not the engine's `fs` reads).

## Consequences

- Zero divergence; no second state SoT.
- The `.claude/` directory name is retained across bindings (cosmetic, not functional).
