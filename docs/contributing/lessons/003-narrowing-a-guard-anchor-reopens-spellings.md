---
subjects:
  - engine/src/guards/**/*.js
  - engine/test/guards/**/*.test.js
phases: [review, implementation]
kind: trap
trigger: narrowing a command-text guard predicate to remove an over-block
evidence:
  - engine/test/guards/shell-git-invocations.test.js:546
  - engine/test/guards/shell-git-invocations.test.js:554
  - engine/test/guards/shell-git-invocations.test.js:583
  - engine/test/guards/git-ext-diff-predicate.test.js:594
  - engine/test/guards/git-ext-diff-predicate.test.js:636
  - engine/test/guards/git-ext-diff-predicate.test.js:644
  - engine/test/guards/git-ext-diff-predicate.test.js:669
source: { run: guard-fuzz-scale-ext-diff-widen, phase: review, date: 2026-10-20 }
status: active
supersedes: []
last-verified: 2026-10-23
---
# 003 — Narrowing a guard anchor reopens other spellings of the same word

## Context

A guard anchored any alias word, so `echo $X alias` blocked. Each narrowing that removed an over-block reopened a false allow on a different spelling of the same intent: a literal-`config` gate let `command $G con[f]ig alias.x` through, and a literal-`git` gate let `{/usr/bin/g?t,config,alias.x,y}` through. Three review cycles and an automated review each found the next one.

## Lesson

A token test written against the literal word (`config`, `git`) misses every shell spelling that expands to it: a dynamic word, a glob, a brace alternative, a path prefix. Removing an over-block trades it for a false allow unless the narrowed condition still covers those spellings.

## How to apply

- Before committing a narrowing, re-run every row the previous condition blocked.
- For each literal the condition keys on, add blocked rows for its dynamic (`$V`), glob (`g?t`), brace and path spellings.
- Decide by walking git's own argv where possible; a widened match (a bracket class as any char) errs on blocking.
- Pin the over-block you removed as an allow row, so the next narrowing cannot bring it back.
- If the narrowing trusts the parsed argv, deny words that change it after parsing (xargs, split values, env -S).
- Allow-list the argv-preserving wrappers; a deny-list of appender names leaks.

## Evidence

`engine/test/guards/shell-git-invocations.test.js` holds the reopened spellings as blocked rows (`command $G con[f]ig alias.x st` at line 546, `{/usr/bin/g?t,config,alias.x,y}` at line 554) and the removed over-block as an allow row (`echo $X alias` at line 583). Reverting the glob-aware `holdsGitToken` in `engine/src/guards/shell-git-invocations.js` turns the line-554 row red.

Dropping bare `git show` from the ext-diff default-deny reopened the argv the parser never reads: a split global-option value (`D=". diff"; git -C $D show`, line 636), an argv appender in any spelling (`$(echo xargs) git show`, line 644) and `env -S` re-splitting (`env -S 'git show #' --ext-diff`, line 669). A deny-list of appender names leaked twice in review. The allow-list of argv-preserving wrappers in `engine/src/guards/shell-git-invocations.js` (`PLAIN_WRAPPERS`) closed the class, and line 594 pins the over-block it removed.
