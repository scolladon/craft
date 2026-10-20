---
subjects:
  - engine/src/guards/git-ext-diff-predicate.js
  - engine/src/guards/shell-git-invocations.js
supersedes: []
---
# 660 — The ext-diff rule denies --ext-diff on any verb and git config alias keys

- **Status:** accepted — ratified by the user
- **Date:** 2026-10-20
- **Design:** docs/contributing/design/guard-fuzz-scale-ext-diff-widen.md · **Supersedes/Refines:** none

## Context

The shared ext-diff rule judges only `diff`/`show` and inline `-c alias.*`. Against real git 2.54
and 2.56, `log -p`, `format-patch`, `stash show -p`, `reflog -p` and `whatchanged -p` run the
external diff with `--ext-diff`, and the `diff-tree`/`diff-files`/`diff-index` plumbing does too
when `GIT_EXTERNAL_DIFF` is set. A diff alias written with `git config alias.x diff` then fires on
`git x`. Every binding allowed all of these. The rule is shared by Claude, opencode and pi
(`gitExtDiffPredicate`) and by codex and copilot (`plainGitCommandVerdict`), so every verdict
moves together.

## Options considered

1. **(a) `--ext-diff` on any verb** — pros: closes every pinned `--ext-diff` row / cons: the alias
   path stays open, including `git config alias.p push; git p` on codex and copilot
2. **(b-i) `--ext-diff` on any verb + any `git config` naming an `alias`, `include.path` or
   `includeIf.*` key, reads included** *(recommended)* — pros: closes both paths; mirrors the
   value-blind `-c alias.*` deny; no second argv parser / cons: over-blocks alias reads and
   harmless alias writes
3. **(b-ii) as (b-i), writes only** — pros: alias reads stay allowed / cons: a parser of both
   `git config` syntaxes whose mistakes are false allows
4. **(c) alias/include writes only** — pros: smallest change / cons: seven pinned firing rows stay
   open

## Decision

The user ratified option 2, (b-i). A literal `--ext-diff` as the last ext-diff setting before `--`
is denied on every git verb. Any `git config` invocation whose arguments name an `alias`,
`alias.*`, `include.path` or `includeIf.*` key is denied, whatever its mode or value.

## Consequences

The deny covers parsed command text only. A dynamic `--ext-diff` word on a non-diff verb, a
dynamic config key, an alias already present in a gitconfig and `git config --edit` stay outside
its reach. `git config --get alias.x`, `git config alias.x status` and `echo git log --ext-diff`
are blocked although git runs no external diff.
