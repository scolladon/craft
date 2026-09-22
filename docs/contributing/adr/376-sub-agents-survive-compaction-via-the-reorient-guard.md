---
subjects:
  - hooks/reorient-after-compact.sh
  - skills/review/SKILL.md
---
# 376 — Sub-agents survive compaction through the reorient guard and a reviewer respawn rule

- **Status:** accepted
- **Date:** 2026-09-22
- **Design:** docs/contributing/design/auto-compaction-safety.md · **Supersedes/Refines:** none

## Context

Every spawn inherits the compaction window, so phase agents can compact mid-task. A hook payload for
a sub-agent's compaction is identical to the main session's (same session id, main transcript path,
no agent field), so no hook can tell the two apart. Every role's output is a commit or a committed
file, except a reviewer's findings, which return as a tool result.

## Options considered

1. **The reorient block's guard paragraph plus a reviewer respawn rule** *(recommended)* — pros: no
   new mechanism; the hook reaches spawns anyway / cons: Claude-binding only.
2. **Option 1 plus one `contracts/core.md` line** — pros: portable to non-Claude harnesses / cons: a
   line in every spawn and contract-test churn.
3. **A per-spawn state file** — cons: costs agent turns and adds sweep risk inside the tree.

## Decision

Ratified by the user as recommended. The reorient block leads with a guard paragraph addressed to
anyone who is not the orchestrator. A craft sub-agent reading it keeps its spawn prompt as its task,
re-derives its progress from `git status`, `git log` and the files it wrote, and never repeats a
landed commit. The review phase respawns any dimension that has no persisted findings for the
current cycle. No contract line and no per-spawn file are added.

## Consequences

- The guard paragraph is a tested string: it is the first line of the block.
- A non-Claude harness has no compaction hook here. Its survival rests on atomic commits and the
  turn-budget handback.
