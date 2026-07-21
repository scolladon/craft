# 256 — Lift the binding-neutral guard predicate to `engine/src/guards/`

- **Status:** accepted
- **Date:** 2026-07-20
- **Design:** docs/design/native-codex-binding.md · **Supersedes/Refines:** Supersedes ADR-223's deferral ("a shared cross-binding predicate module remains a possible future consolidation (not built now)")

## Context

`adapters/pi/src/gate.js` exports the binding-neutral `toolCallGuard` predicate plus `WRITE_TOOLS`; `adapters/copilot/src/git-guard-adapter.js` already imports it across the adapter boundary. The brief assumed codex would be the *third* importer and that opencode carries a character-for-character duplicate — both wrong. `adapters/opencode/src/git-guard-predicate.js` is **not** a duplicate of `gate.js`: it is a narrower `gitGuardPredicate(command)` with no event shape and no path-containment branch. What *is* duplicated verbatim is the trio `COMPLIANT_MARKERS` / `GIT_DIFF_SHOW_RE` / `REASON_GIT_EXT_DIFF`. Codex would be the **second** importer of `gate.js`, not the third — narrowing the drift risk the brief was reacting to, but not eliminating it. `BACKLOG.md` already parks "lift the binding-neutral guard predicate to a shared home" as a follow-up.

## Options considered

1. **Import `toolCallGuard` from `adapters/pi/src/gate.js` again, as copilot does** — codex becomes the second cross-adapter importer — pros: zero scope expansion, ships inside this change's own boundary. Cons: leaves the eventual lift undone, and a third and fourth importer would only grow the case for it.
2. **Lift to `engine/src/guards/`, repoint every binding that actually consumes it** *(chosen — ratified by the user, overriding the designer's recommendation of option 1 now / option 2 later)* — pros: reaches the right end state directly; each binding keeps only its event adapter. Cons: touches already-shipped bindings and a security-critical predicate in a change whose brief is a new binding, not a guard refactor.
3. **Duplicate the predicate into `adapters/codex/src/`** — cons: never right; reintroduces the exact drift risk ADR-223 exists to prevent.

## Decision

**Ratified by the user, overriding the design's own recommendation to defer** ("(a) now, (b) as its own scoped change"). Option 2. `toolCallGuard` (and `WRITE_TOOLS`) lifts out of `adapters/pi/src/gate.js` into a neutral `engine/src/guards/` module.

**The repoint set is pi and copilot only** — verified against the tree: `adapters/copilot/src/git-guard-adapter.js` is the sole cross-adapter importer of `gate.js`. **opencode is not repointed, because it never imported `gate.js` in the first place**; its `git-guard-predicate.js` is an independent narrower predicate. Codex then imports from the new neutral home rather than adding a second cross-adapter import.

Record honestly: this is a **deliberate scope expansion** touching an already-shipped binding and a security-critical predicate, and it **relaxes this change's own "engine untouched except telemetry" success criterion**. The user accepted that trade explicitly, knowing it going in.

## Consequences

- `engine/src/guards/` becomes a new engine-owned module; pi's and copilot's adapter sources are repointed to import from it instead of `adapters/pi/src/gate.js`. Structural assertions in `adapters/copilot/test/git-guard-predicate.test.js` that pin the old path must be retargeted in the same commit, so the lift is not suite-untouched.
- The predicate itself is not modified by this lift — behaviour stays identical across all four repointed bindings; only its module home changes.
- This is the one place in the whole change where "engine untouched except telemetry" is knowingly not true; the documentation phase states this explicitly rather than papering over it.
- The narrower opencode duplication (`COMPLIANT_MARKERS`/`GIT_DIFF_SHOW_RE`/`REASON_GIT_EXT_DIFF`) is not resolved by this lift and remains a candidate for a separate follow-up.
