---
subjects:
  - engine/src/guards/shell-tokeniser.js
  - engine/test/guards/shell-tokeniser.test.js
  - engine/test/guards/git-destructive-predicate.test.js
  - engine/test/guards/git-ext-diff-predicate.test.js
phases: [design, review]
kind: trap
trigger: a guard rule targets how bash treats the body of one substitution form
evidence:
  - engine/src/guards/shell-tokeniser.js:510
  - engine/test/guards/shell-tokeniser.test.js:589
  - engine/test/guards/shell-tokeniser.test.js:592
  - engine/test/guards/shell-tokeniser.test.js:612
  - engine/test/guards/git-destructive-predicate.test.js:172
source: { run: bash53-heredoc-comsub-false-block, phase: review, date: 2026-10-22 }
status: active
supersedes: []
last-verified: 2026-10-23
---
# 006 — A rule about one substitution body must cover every substitution form

## Context

bash 5.3 drops the first `;` after a heredoc inside a `$( )` or `<( )` body, merging the two commands around it. The design probed 27 rows, all `$( )`, `"$( )"` and `<( )`, and the guard refused that `;` there. Two reviewers then found bash 5.3's function substitution `${ …; }` and `${| …; }` does the same: `echo ${ cat <<'E'⏎hi⏎E⏎git; push origin; }` ran `git push origin` while both predicates allowed it, because the tokeniser read every `${` as a parameter expansion.

## Lesson

bash has several substitution forms whose body is a command list: `$( )`, backticks, `<( )`, `>( )` and, from 5.3, `${ …; }` and `${| …; }`. A rule written for one form leaves the others open, and a parser that predates a new form misreads it as something harmless.

## How to apply

- List every substitution form the target shells accept, including the newest bash, before scoping the rule.
- Probe each form under the real shell with a stub git, and record which ones share the behaviour.
- Route a form the parser does not know to its own descriptor; never let it fall into a lookalike path.
- Pin each descriptor field with a row that a one-field mutant turns red (`parameter`, `settle`, the opener set).

## Evidence

`braceConstruct` at `engine/src/guards/shell-tokeniser.js:510` sends `${` followed by a space, tab, newline or `|` to the function-substitution descriptor. The refusal rows at `engine/test/guards/shell-tokeniser.test.js:589` and `:592` and the predicate mirror at `engine/test/guards/git-destructive-predicate.test.js:172` fail when it returns the parameter descriptor. The comment row at `engine/test/guards/shell-tokeniser.test.js:612` fails when the descriptor's `parameter` field is flipped to `true`.
