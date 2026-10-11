---
subjects:
  - skills/run/SKILL.md
  - skills/workspace/SKILL.md
---
# 451 — §0 keeps open before the collision check

- **Status:** accepted — ratified by the user
- **Date:** 2026-10-11
- **Design:** docs/contributing/design/refuse-open-on-live-run-id.md · **Supersedes/Refines:** none

## Context

`open` runs at §0 step 4, before `craft:workspace`'s branch/worktree collision STOP. With `open` refusing an open run-id (ADR-450), the question is whether §0 should also probe the tree collision first.

## Options considered

1. **Leave the order as is** *(recommended)* — `open` refuses; `workspace` step 3 still STOPs on a leftover tree / pros: one rule per surface; every live run holds a pointer from §0 to `close`, so a tree probe catches nothing the refusal misses / cons: a crashed run's leftover tree surfaces one phase later
2. **Add a type-free §0 probe** of `../<repo>-<slug>` and `refs/heads/*/<slug>` before `open` / pros: earlier signal / cons: duplicates the collision rule and still misses runs before `workspace` and after teardown
3. **Move the collision check to §0** / pros: one place / cons: needs the branch type before input classification

## Decision

Option 1, ratified by the user.

## Consequences

- `skills/workspace/SKILL.md` step 3 is unchanged.
- After a discard, a leftover worktree or branch still hits the workspace STOP.
