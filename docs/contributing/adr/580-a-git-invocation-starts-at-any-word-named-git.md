---
subjects:
  - engine/src/guards/shell-git-invocations.js
  - engine/src/guards/git-ext-diff-predicate.js
  - engine/src/guards/git-destructive-predicate.js
supersedes: []
---
# 580 — A git invocation starts at any word named git

- **Status:** accepted
- **Date:** 2026-10-15
- **Design:** docs/contributing/design/copilot-git-argv-normalising-guard.md

## Context

The ext-diff predicate anchors at `^\s*git`, so `(git diff)`, `FOO=1 git diff`, `env git diff`,
`command git diff`, `! git diff` and `time git diff` pass while bash runs the diff. Wrappers such as
`env -u N`, `xargs -I {}`, `nice -n 5`, `sudo -u x` and `find -exec` take option values a closed
prefix list would have to parse. The anchor applies to every binding that shares `toolCallGuard`.

## Options considered

1. **Any non-dynamic word whose basename is `git`, plus a dynamic head, for both predicates**
   *(recommended)* — pros: one code path, closes the wrapper class with no wrapper grammar / cons:
   intended false blocks such as `echo git push` and `git log --grep git show`.
2. **Only the command word after a closed prefix list** — cons: wrapper option grammars;
   `sudo`/`find -exec`/`timeout` left as residuals.
3. **Closed list for ext-diff, any word for destructive** — cons: splits the semantics the backlog
   asked to unify.

## Decision

**Ratified by the user.** Option 1. A git invocation starts at any word of a simple command that is
not dynamic and whose basename after the last `/` is exactly `git`, or at a dynamic head (the first
word left after the head is stripped, when that word is dynamic). Both predicates use this anchor.

## Consequences

The intended false blocks are pinned in tests and documented; each costs one re-issue.
