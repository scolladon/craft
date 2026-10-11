---
subjects:
  - contracts/core.md
  - templates/plan.md
---
# 468 — The core contract forbids absolute paths in committed artifacts

- **Status:** accepted — ratified by the user
- **Date:** 2026-10-11
- **Design:** docs/contributing/design/scrub-home-dir-from-docs.md · **Supersedes/Refines:** none

## Context

No template mandates an absolute path: the spawn briefs pass "the absolute working directory",
which agents need at runtime, and planners transcribe it into plan preconditions and gate
commands. Design-doc leaks were toolchain install paths, so a plan-only fix misses them.

## Options considered

1. **One `contracts/core.md` invariant + `CORE_MARKERS` pin + a `templates/plan.md` Gate note** *(recommended)* — pros: reaches every role on every binding / cons: +205 bytes per spawn
2. **Rule in 7 agent defs + regenerated adapter mirrors** — cons: ~40 files of mirror churn
3. **Template lines only** — cons: misses design-doc leaks

## Decision

Option 1, ratified by the user. `contracts/core.md` gains: committed artifacts carry
repo-relative paths, never an absolute or home-rooted one; out-of-repo locations are named by
placeholder. The `templates/plan.md` `### Gate` comment says commands run from the worktree root,
repo-relative. Spawn briefs keep passing the absolute working directory.

## Consequences

- Orchestrator-authored writes (ADRs, BACKLOG, run record) get no contract block; ADR-467 covers them.
