---
subjects:
  - BACKLOG.md
  - adapters/codex/README.md
  - docs/contributing/specs/codex-poc-record.md
supersedes: []
---
# 674 — By-reference shared-skill loading on codex is closed as a standing limitation

- **Status:** accepted
- **Date:** 2026-10-22
- **Design:** docs/contributing/design/codex-0163-reprobe.md · **Supersedes/Refines:** none

## Context

The BACKLOG entry "Prove craft's shared skills load by reference on codex" stayed OPEN with the
rule "re-check on the next minor version". Four codex versions measured the same result: 0.144.6,
0.145.0, 0.162.1 and 0.163.0. On 0.163.0, `skills/list` (`forceReload: true`) lists 0 of 20 shared
skills by reference and 20 of 20 through the `$CODEX_HOME/skills` symlinks, 3/3 each, and the
cached `.codex-plugin/plugin.json` still drops `skills` and `hooks`.

## Options considered

1. **Stays OPEN, re-pinned to 0.163.0, re-check on the next minor** *(design recommendation)* —
   pros: the existing rule / cons: a fifth identical probe per minor, with no signal it will change
2. **Close it as a standing codex limitation** — pros: stops a per-minor probe that has returned
   the same answer four times / cons: a codex change that keeps the reference goes unnoticed until
   someone looks
3. **Stays OPEN with a narrower trigger** (release notes touching plugin `skills` or out-of-tree
   paths) — pros: cheaper / cons: depends on release-note wording

## Decision

The user chose option 2. The entry closes as a standing codex limitation, with the 0.163.0
measurement as its last record. The symlink route stays required, not optional, and the install
instructions do not change. No per-minor re-probe is scheduled.

## Consequences

- The BACKLOG entry is ticked closed, with a dated "Re-probe on 0.163.0" paragraph naming it a
  standing limitation.
- The adapter README drops any "re-check on the next minor version" wording for this row.
- Re-measuring stays possible through the throwaway-entry route the marketplace decision describes;
  it is no longer a scheduled task.
