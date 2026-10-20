---
subjects:
  - engine/src/guards/**/*.js
  - engine/test/guards/**/*.test.js
phases: [review, implementation]
kind: trap
trigger: narrowing a command-text guard predicate to remove an over-block
evidence:
  - engine/test/guards/shell-git-invocations.test.js:527
  - engine/test/guards/shell-git-invocations.test.js:535
  - engine/test/guards/shell-git-invocations.test.js:564
source: { run: guard-fuzz-scale-ext-diff-widen, phase: review, date: 2026-10-20 }
status: active
supersedes: []
last-verified: 2026-10-20
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

## Evidence

`engine/test/guards/shell-git-invocations.test.js` holds the reopened spellings as blocked rows (`command $G con[f]ig alias.x st` at line 527, `{/usr/bin/g?t,config,alias.x,y}` at line 535) and the removed over-block as an allow row (`echo $X alias` at line 564). Reverting the glob-aware `holdsGitToken` in `engine/src/guards/shell-git-invocations.js` turns the line-535 row red.
