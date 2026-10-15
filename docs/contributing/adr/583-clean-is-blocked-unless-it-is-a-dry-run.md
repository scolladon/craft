---
subjects:
  - engine/src/guards/git-destructive-predicate.js
supersedes: []
---
# 583 — clean is blocked unless it is a dry run

- **Status:** accepted
- **Date:** 2026-10-15
- **Design:** docs/contributing/design/copilot-git-argv-normalising-guard.md

## Context

Pinned on git 2.54: `-c clean.requireForce=false clean` deletes untracked files with no `-f`, and
the same key in the user's gitconfig is invisible to any hook. Under the default config a
forceless `clean` refuses and deletes nothing.

## Options considered

1. **Block every `clean` without `-n`/`--dry-run`** *(recommended)* — pros: closes the gitconfig
   case at nil cost / cons: none in routine use.
2. **Block on a force flag or an inline `clean.requireForce` key** — cons: the gitconfig case stays.
3. **Option 1 plus `checkout -f`/`.`, `restore`, `branch -M`/`-C`, `update-ref -d`,
   `filter-branch`** — cons: blocks routine `restore .`; a posture change beyond the brief.

## Decision

**Ratified by the user.** Option 1. The destructive set judged on normalised argv is: `push`
always; `reset` with `--hard`; `branch` with `-D` (or a cluster holding `D`) or a delete flag
together with a force flag; `clean` unless a `-n`/`--dry-run` (or a cluster holding `n`) is present.

## Consequences

Verbs outside the set are documented residuals.
