# 253 — Codex loads shared craft skills by reference

- **Status:** accepted
- **Date:** 2026-07-20
- **Design:** docs/design/native-codex-binding.md · **Supersedes/Refines:** Mirrors ADR-251 (copilot shared skills by reference)

## Context

ADR-251 settled that shared craft skills load **by reference**, never by copy — copying forces hygiene exemptions on exactly the files most likely to drift (provenance refs, one bare `${CLAUDE_PLUGIN_ROOT}`). Codex's plugin manifest carries a path-valued `skills` field (CONFIRMED, row 10), so by-reference loading is structurally available here too. The catch: copilot takes **repeatable** `--plugin-dir` flags, so two plugin dirs load side by side. A Codex manifest declares **one** `skills` path — the shared tree and the adapter's own surface cannot both hang off a single manifest.

## Options considered

1. **Two plugin entries in one local marketplace** — `craft` (manifest `skills` → repo-root `skills/`, by reference) + `craft-codex` (adapter-local agents/hooks/entrypoint) *(chosen)* — pros: the direct analog of copilot's two `--plugin-dir` flags; by-reference discipline holds with no copy. Cons: the launch contract needs two marketplace entries instead of one.
2. **One plugin whose `skills` points at the repo root**, with the entrypoint being the shared `run` skill invoked by its own name (no adapter-local entrypoint file at all) — cons: leaves nowhere adapter-authored to place the delegation ask required by ADR-254.
3. **`$CODEX_HOME/skills/` symlink farm** + a standalone `hooks.json`, no plugin manifest — named as the shared fallback with ADR-252's option 2, not chosen up front; only invoked if row 9a fails.

## Decision

*Adopted as recommended (no user judgment).* Option 1. Rationale mirrors ADR-251 exactly: copying shared skill bodies would force hygiene exemptions on the files most likely to drift. Because a Codex manifest's `skills` field is a single path — unlike copilot's repeatable `--plugin-dir` — one marketplace entry cannot carry both the shared tree and the adapter's own surface, hence two marketplace entries.

## Consequences

- `adapters/codex/skills/` must not exist; a test asserts this, per R-G2/ADR-251.
- The manifest filename and whether `skills` resolves relative to the manifest are open implementation details to pin before authoring — not blocking this decision.
- Option 3 stays the documented fallback shared with ADR-252, invoked only if row 9a fails to resolve end-to-end.
