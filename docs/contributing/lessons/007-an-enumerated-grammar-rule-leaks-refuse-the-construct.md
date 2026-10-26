---
subjects:
  - engine/src/guards/shell-tokeniser.js
  - engine/test/guards/shell-tokeniser.test.js
phases: [design, review]
kind: trap
trigger: a guard fix narrows a refusal to the positions where bash treats a token specially
evidence:
  - engine/src/guards/shell-tokeniser.js:264
  - engine/src/guards/shell-tokeniser.js:659
  - engine/src/guards/shell-tokeniser.js:717
  - engine/test/guards/shell-tokeniser.test.js:826
  - engine/test/guards/shell-tokeniser.test.js:797
  - engine/test/guards/shell-tokeniser.test.js:851
  - engine/test/guards/shell-tokeniser.test.js:852
  - engine/src/guards/shell-tokeniser.js:251
  - engine/test/guards/shell-tokeniser.test.js:1027
source: { run: arith-expansion-comsub-bypass, phase: review, date: 2026-10-23 }
status: active
supersedes: []
last-verified: 2026-10-26
---
# 007 — A guard rule that enumerates bash's positions leaks; refuse the construct

## Context

Three review fixes tried to refuse only the spellings bash treats specially, and each was broken by the
next review round under bash 5.3. A case-pattern `)` rule leaked through `x|esac)`, `(esac)` and
`function f case`. A raw paren-pairing count re-read bodies that bash keeps arithmetic. A `${ …; }`
closer rule leaked through head words, then through `x=(a) }`, `[[ a || } ]]` and case pattern lists.
Each leak ran `git push` while both predicates allowed it.

## Lesson

A tokeniser that copies part of bash's grammar to decide where a body ends inherits every position the
copy misses. When the refusal is keyed on the token's text or on the construct itself, no position
can be missed: bash only reads an unquoted literal `case` as the keyword, and every function
substitution opens with `${` plus a blank or `|`.

## How to apply

- When a fix must say where bash treats a token specially, first ask whether refusing the token or the whole construct costs a working command.
- Prefer a rule keyed on token text or on the opener over one keyed on grammar position.
- Where two readings can disagree (the scanner's and bash's), fail closed rather than pick one.
- After one review round breaks a narrowed rule, stop narrowing: escalate the broad refusal.

## Evidence

`pushWord` at `engine/src/guards/shell-tokeniser.js:264` refuses any `case` word in a paren-closed
body; `engine/test/guards/shell-tokeniser.test.js:826` (`x|esac)`) passed the narrowed rule.
`closerEnd` at `:659` fails closed on an unpaired body; `engine/test/guards/shell-tokeniser.test.js:797`
pins it. `enterBrace` at `:717` refuses every function substitution;
`engine/test/guards/shell-tokeniser.test.js:851` and `:852` passed the command-start rule.

A later run repeated the pattern on a word rule: escapes, a bare `$`, a `${x:-$}` body, a brace group and substitution output each built `$(` after the scan, one per review round. Refusing the join itself, `append` at `engine/src/guards/shell-tokeniser.js:251`, closed them all; `engine/test/guards/shell-tokeniser.test.js:1027` is the first row it caught.
