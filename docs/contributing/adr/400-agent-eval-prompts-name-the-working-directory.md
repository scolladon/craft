---
subjects:
  - evals/reviewer-tests-findings/prompt.md
  - evals/planning-plan-lints/prompt.md
---
# 400 — Agent eval prompts name the working directory

- **Status:** accepted — adopted-as-recommended (no user judgment)
- **Date:** 2026-10-07
- **Design:** docs/contributing/design/eval-sweep-followups.md · **Supersedes/Refines:** none

## Context

A haiku reviewer `cd`'d into the plugin checkout and reviewed craft itself; a haiku planner run did the same and tried to write there. The real review phase passes the agent an absolute working directory; the eval prompts name none.

## Options considered

1. **A clause in both agent-case prompts: "the git repository in the current working directory"** *(recommended)* — pros: visible in the case, both arms get it, mirrors the phase / cons: a small prompt change for both arms
2. **`append_system_prompt`** — pros: prompt body unchanged / cons: hidden from readers; reaches the child session, not shown to reach the spawned agent
3. **A working-tree bullet in `agents/reviewer.md`** — pros: fixes it at the agent / cons: a second edit to the unit under before/after test; reviewer only

## Decision

Adopted as recommended (option 1). Both agent cases name the repository in the current working directory in their prompt body. The sweep's per-run trace check counts `left` (a `cd` or `git -C` to an absolute path outside the run's sandbox) on every run, whatever the clause achieves.

## Consequences

- A run with `left>0` is named in the matrix note.
