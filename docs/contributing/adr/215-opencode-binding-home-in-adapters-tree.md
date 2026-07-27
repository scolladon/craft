# 215 — opencode binding lives under `adapters/opencode/`

- **Status:** accepted
- **Date:** 2026-07-17
- **Design:** docs/design/opencode-adapter.md · **Supersedes/Refines:** Refines ADR-085

## Context

The opencode port is a third Execution-port binding (`{ claude, pi } → { claude, pi, opencode }`) and needs a home. ADR-085 established that adapter code lives under a top-level `adapters/<name>/` tree; `adapters/pi/` is the in-repo precedent.

## Options considered

1. **`adapters/opencode/` in-repo, opencode-native shape (agents/commands/plugins/opencode.json), copied/symlinked into a target repo's `.opencode/`** *(designer recommendation)* — pros: consistent with ADR-085, single repo, no second release surface, mirrors pi. Cons: install is a copy step, not a package manager.
2. **Separate `@craft/opencode` npm package via `plugin[]`** — pros: `opencode add` install. Cons: a second release/versioning surface to keep in lockstep with the engine.
3. **Generated into a target repo by a `craft:init`-style emitter** — pros: no committed reference tree. Cons: no reviewable canonical artifact.

## Decision

*Adopted-as-recommended (no user judgment).* The opencode binding lives at `adapters/opencode/`, opencode-native in shape (`opencode.json`, `commands/`, `agents/`, `plugins/`, `src/`, `test/`), installed into a target repo by copy/symlink into `.opencode/`. This mirrors `adapters/pi/`.

## Consequences

- Single repo, no second release surface; the binding versions with the engine.
- npm packaging (option 2) remains a documented future option, not built now.
- The telemetry `collect` binding is the one exception to the top-level rule (see ADR-227), homed under `engine/src/observability/adapters/opencode/` per the telemetry-port precedent.
