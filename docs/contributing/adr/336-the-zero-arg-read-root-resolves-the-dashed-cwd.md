# 336 — The zero-arg read root resolves the dashed cwd

- **Status:** accepted
- **Date:** 2026-08-06
- **Design:** docs/contributing/design/usage-miner-subagent-transcripts.md · **Supersedes/Refines:** none

## Context

A third defect, found while pinning the first two: `usage-mine` with no `--dir` resolves its
read root to `~/.claude/projects`, whose non-recursive listing contains zero `.jsonl` files.
Run live in a throwaway, it returns `{"note":"no .jsonl transcript files found","runs":[]}` and
exit 0. `skills/metrics/SKILL.md` claims a `cwd → dashes` mapping happens internally; no such
mapping exists anywhere in `engine/`. Every non-empty report ever produced — including the
committed baseline — came from an explicit `--dir`.

## Options considered

1. **Fix here** (designer's recommendation) — `DEFAULT_READ_ROOTS.claude` resolves
   `join(projectsDir, dashed(cwd))`, containment root stays `~/.claude/projects` — pros: makes
   the code match the contract the SKILL already documents; ~5 lines in a seam this change
   already opens / cons: grows scope past the brief.
2. **Fix the SKILL doc to require `--dir`** — pros: no code change / cons: documents the defect
   instead of fixing it.
3. **Out of scope, separate change** — cons: ships a fix nobody can observe through the
   advertised front door.

## Decision

Ratified by the user: **option 1**. Without it `/craft:metrics` keeps reporting nothing at all
and the entire measurement fix is unobservable where users actually meet it.

## Consequences

- The containment root is unchanged (`~/.claude/projects`); only the default *read* root moves
  down one level, so the fail-closed boundary is untouched.
- A repo whose transcripts live under a differently-derived slug still needs explicit `--dir`.
