---
subjects:
  - engine/src/guards/git-argv.js
  - engine/src/guards/git-ext-diff-predicate.js
  - engine/src/guards/shell-git-invocations.js
supersedes: []
---
# 662 — git show is judged on --ext-diff, not default-denied

- **Status:** accepted — ratified by the user
- **Date:** 2026-10-21
- **Design:** docs/contributing/design/git-show-ext-diff-default-deny.md · **Supersedes/Refines:** refines ADR-660

## Context

The shared ext-diff rule denies `git diff` and `git show` unless they carry `--no-ext-diff`.
Against real git 2.17.0, 2.30.0, 2.50.1, 2.54.0, 2.55.0 and 2.56.0, `git show` never runs
`diff.external` (set by `-c`, by repo config, or by `GIT_EXTERNAL_DIFF`) nor a
`diff.<driver>.command` without `--ext-diff`, across patch, stat, merge, tag, blob and stash
forms. Only `git diff` runs an external diff by default. The bare-`show` deny is an over-block on
every binding — Claude, opencode, pi, antigravity and cursor (`gitExtDiffPredicate`), codex and
copilot (`plainGitCommandVerdict`) — and it blocks the `git show --stat` that craft's own planning
and implementation skills ask agents to run.

## Options considered

1. **(a) Drop `show` from the default-deny** *(recommended)* — pros: removes a pure over-block;
   every firing form stays denied / cons: a bare `show` under a `diff.<driver>.textconv` driver
   becomes allowed (already allowed today through `show --no-ext-diff`, `log -p` and
   `diff --no-ext-diff`)
2. **(b) Keep it** — pros: no change / cons: keeps the over-block, including craft's own
   instructions
3. **(c) Keep it only for older git** — pros: hedges unprobed versions / cons: a text guard must
   resolve and guess the git version; no probed version supplies a cutoff

## Decision

The user ratified option 1, (a). `git show` leaves the default-deny: it is denied on a literal
`--ext-diff` as the last ext-diff setting (the any-verb rule, with its reason), and on a dynamic
option word after the last `--no-ext-diff`, because `X=--ext-diff; git show $X` fires. `show`
stays an anchor verb, so indeterminate and brace spellings (`{git,{di,show}ff}`,
`G=git; command $G {di,show}ff`) stay denied, and a dynamic-head `$G show` stays denied, since the
head may hold `git diff`. Only `diff` keeps the bare default-deny.

## Consequences

Bare `git show` forms, `git show --ext-diff=1` (git refuses it), and on the predicate bindings
`git -c diff.external=x show` and `GIT_EXTERNAL_DIFF=x git show` are allowed. Codex and copilot
still deny the config and env forms through the plain gate. A `diff.<driver>.textconv` driver runs
on bare `show` as it already does on `log -p`; no rule covers textconv. Versions older than 2.17.0
are unprobed. The fuzz oracle judges `show` by the any-verb rule.

Keeping every firing form denied also means judging `show` like `diff` whenever the argv git
receives may differ from the parsed words. That covers a dynamic head, a dynamic global-option
value, and any word ahead of `git` that is not a literal argv-preserving wrapper (xargs, parallel,
or an unknown or dynamic command). `env -S` followed by later words fails closed, because env
re-splits that string with rules a shell parse cannot follow. `show` behind an unlisted prefix,
or with a quoted dynamic option value, stays an over-block.
