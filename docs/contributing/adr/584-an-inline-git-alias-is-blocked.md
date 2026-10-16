---
subjects:
  - engine/src/guards/git-ext-diff-predicate.js
  - engine/src/guards/git-destructive-predicate.js
supersedes: []
---
# 584 — An inline git alias is blocked

- **Status:** accepted
- **Date:** 2026-10-15
- **Design:** docs/contributing/design/copilot-git-argv-normalising-guard.md

## Context

Pinned on git 2.54: `git -c alias.p=push p` expands to `push`, and `alias.x=!cmd` runs a program.
Agents have no routine use for an inline alias.

## Options considered

1. **Block any inline `alias.*` key** *(recommended)* — pros: closes the bypass at near-zero cost.
2. **Expand the alias and judge the expansion** — cons: more code, same outcome.
3. **Documented residual** — cons: a known bypass left open.

## Decision

**Ratified by the user.** Option 1. Any `-c alias.*` or `--config-env alias.*` key (matched
case-insensitively) blocks in both predicates.

## Consequences

Aliases defined in the user's gitconfig stay a documented residual.
