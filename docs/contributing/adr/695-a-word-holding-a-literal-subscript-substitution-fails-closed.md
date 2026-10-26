---
subjects:
  - engine/src/guards/shell-tokeniser.js
supersedes: []
---
# 695 — A word holding a literal subscript substitution fails closed

- **Status:** accepted — ratified by the user
- **Date:** 2026-10-26
- **Design:** docs/contributing/design/guard-arith-cleanup.md · **Supersedes/Refines:** —

## Context

bash evaluates an array subscript inside a string value as arithmetic and runs a substitution in it.
`let 'a[$(git push -f origin)]'` and `[[ 'a[$(git push -f origin)]' -eq 0 ]]` run git under
/bin/bash 3.2.57 and 5.3.20 (stub git, benign marker; design table E rows 55, 56). The command text
holds the substitution only as a quoted literal, so the tokeniser saw no expansion to scan. It has
no model of `let` or `[[ … -eq … ]]` operands.

## Options considered

1. **Word-text rule** *(recommended)* — fail closed when a word holds a literal `$` or backtick
   (quoted or escaped) and its text matches `[` then `$(`, `${` or a backtick, or holds `[` and a
   `$'…'` numeric escape decoding to `$` or a backtick — pros: no position to miss (lesson 007);
   covers `[[ … && 'a[$(…)]' -eq 0 ]]`, `declare -i`, row 57; cost 0 / 29162 fuzz, 1 / 244 disk
2. **Option 1 only when the line holds `let` or `[[`** — cons: misses row 57 and `declare -i`; needs
   a whole-source scan
3. **Grammar position: `let` arguments and `[[` arithmetic operands** — cons: misses row 87, which
   runs git in both shells, and rows 89 and 57

## Decision

Ratified by the user: option 1. `createContext` gains `literalOpener` and `escapedOpener`, set in
`onSingleQuote`, `readAnsiC` and `onBackslash`, reset in `endWord`; `endWord` checks them before the
word is built. The regex does not pair brackets, since `let 'a[b[1]+$(…)]'` runs git.

## Consequences

Rows 55, 56, 57, 82–89, 94–100, 104, 105, 107 and 109 block whatever reads the literal. A real
expansion (`'a['"$(date)"']'`) does not trip it. A single-quoted awk or perl program with a `[`
before `$(` or `${` (`awk '{ a[$1] = $(NF) }'`) is denied in both shells: accepted, because narrowing
the rule to spare it leaks row 109.
