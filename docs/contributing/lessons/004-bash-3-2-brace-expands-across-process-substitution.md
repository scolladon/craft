---
subjects:
  - engine/test-helpers/*.js
  - engine/test/guards/*.differential.test.js
  - adapters/*/test/**/*.differential.test.js
phases: [design, implementation]
kind: trap
trigger: a differential test or generator composes a brace expansion inside a process substitution
evidence:
  - engine/test-helpers/git-differential-harness.js:218
  - engine/test/guards/shell-git-invocations.differential.test.js:285
source: { run: guard-fuzz-scale-ext-diff-widen, phase: design, date: 2026-10-20 }
status: active
supersedes: []
last-verified: 2026-10-26
---
# 004 — bash 3.2 brace-expands across a whole process-substitution word

## Context

At scale the engine fuzz reported `cat <( {git,push} origin )` as an unexpected false block, filed as a log race. Re-running each command ten times showed it deterministic: /bin/bash 3.2.57 ran `push: command not found` and the stub git logged `origin` alone.

## Lesson

bash 3.2 applies brace expansion to the whole `<( … )` word, so `cat <( {git,push} origin )` runs as `cat <(git origin) <(push origin)`. The same text at top level or inside `$( … )` runs `git push origin`. A mismatch between the guard and bash there is a shell difference, not a race and not a guard bug.

## How to apply

- Re-run a failing fuzz command 6-10 times before calling it a race.
- Tag the construct where the generator builds it (`brace-in-process-substitution`), never by a regex over stderr.
- Check the unsafe mirror (`cat <( {echo,git} push )`) still blocks before exempting.

## Evidence

`engine/test-helpers/git-differential-harness.js:218` is the special that pins the construct with its tag; `engine/test/guards/shell-git-invocations.differential.test.js:285` is the shape test that every brace word inside `cat <(` carries the tag.
