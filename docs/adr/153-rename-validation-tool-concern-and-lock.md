# 153 — Rename `mutation-tool` memory concern and `.craft-mutation.lock` to technique-neutral names (breaking)

- **Status:** accepted
- **Date:** 2026-06-25
- **Design:** docs/design/despecialize-craft-sources.md · **Supersedes/Refines:** Refines ADR-036 (`.craft-mutation.lock` naming), ADR-049 (architecture no-lock)

## Context

Two technique-named identifiers live in agnostic-required sources: the `mutation-tool`
memory concern (`engine/src/memory.js`, `docs/adapters/memory.md`) and the
`.craft-mutation.lock` run-lock (`scripts/worktree-teardown.sh`, `docs/adapters/vcs.md`,
`skills/validation/SKILL.md`). Both must lose the technique name. ADR-036 named the lock;
ADR-049 chose architecture-synchronous-no-lock around the same name.

## Options considered

1. **Rename both, record breaking change** *(designer recommendation; brief default)* — `mutation-tool` → `validation-tool` (keyed on the technique `id`), `.craft-mutation.lock` → `.craft-validation.lock`. Pros: removes the technique name from `engine/src` and the port spec. Cons: store-schema break — old `mutation-tool` entries in a committed store become unrecognised and decay.
2. **Keep the names (cosmetic only)** — Cons: leaves `mutation` in `engine/src` and a port spec, violating the principle.
3. **Drop the memory concern entirely** — Cons: loses the probe-skip optimization the concern enables.

## Decision

*Adopted-as-recommended (no user judgment).* Rename the `mutation-tool` memory concern to
**`validation-tool`** (keyed on the technique `id`, mirroring the convention-discovered
harness of ADR-149) and rename the run-lock **`.craft-mutation.lock` → `.craft-validation.lock`**
across all three sites (`scripts/worktree-teardown.sh`, `docs/adapters/vcs.md`,
`skills/validation/SKILL.md`) in lockstep. The lock protocol logic is unchanged; only the
filename and its technique-named prose ("mutation run" → "validation run") change. The
teardown reads only the new name (clean rename, no old-name reader — the ADR-036 posture).

## Consequences

- **Breaking:** a committed `craft-memory.md` carrying `mutation-tool` entries loses them
  on next load (unrecognised concern → decays). Acceptable: the store is advisory and
  self-heals on the next run under the new key.
- craft's own committed store (`.claude/craft-memory.md`) migrates its `mutation-tool`
  block to `validation-tool` as part of the change.
- The frozen ADR-036 and ADR-049 keep their original `.craft-mutation.lock` text (history);
  this ADR refines them forward.
