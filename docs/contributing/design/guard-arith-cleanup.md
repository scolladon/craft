# Design — guard-arith-cleanup

> Brief: close the two open BACKLOG group A entries. A1: inside `(( … ))`, `for (( … ))`, an
> assignment subscript and a `${x:offset}` / `${a[…]}` body, bash still runs a substitution written in
> single quotes, and the tokeniser reads it as a quoted literal. A2: bash evaluates an array subscript
> inside a string as arithmetic (`let`, `[[ … -eq … ]]`, a variable read by `$(( x ))`) and runs a
> substitution in it. Make `gitDestructivePredicate` and `gitExtDiffPredicate` block rows 45, 47, 49,
> 51, 52, 55, 56 and 57. Rows 46, 48, 50 (block) and 54 (allow) keep their verdict.
> Status: draft → self-reviewed ×3

## Context

### The failure

`onSingleQuote` (`engine/src/guards/shell-tokeniser.js:371`) appends the quoted text to the word and
moves on. It does not check where it is. Inside an arithmetic context, bash 5.3 expands that text
again, so a `$( )` in it runs. In a string that bash later evaluates as arithmetic, a subscript
`a[…]` is expanded too. The tokeniser has no model of `let` or `[[` operands, and none of variable
values.

```
$ node -e '…gitDestructivePredicate…'
(( '$(git push -f origin)' ))                  block= false   # bash 5.3 runs git push -f origin
let 'a[$(git push -f origin)]'                 block= false   # bash 3.2 and 5.3 run it
x='a[$(git push -f origin)]'; echo $(( x ))    block= false   # bash 3.2 and 5.3 run it
```

Which bindings this reaches: codex and copilot run `plainGitCommandVerdict`
(`engine/src/guards/git-bash-verdict.js`). Its plain-command gate already refuses a `$` or backtick in
single quotes near git, so it blocks all of rows 44–57 (measured). The Claude hook
(`engine/src/claude-ext-diff-hook-main.js:50`), pi (`engine/src/guards/tool-call-guard.js`) and
opencode (`adapters/opencode/src/git-guard-predicate.js`) call the tokeniser predicates directly, and
they allow the rows.

### Shell behaviour: pinned empirically

Every row was run on 2026-10-26 in a throwaway `mktemp -d` dir. Each command was written to a script
file and run as `bash <file>` under `/bin/bash` 3.2.57 and `<brew-prefix>/bin/bash` 5.3.20, under
`nice -n 19`, with `PATH=<tmp>/bin:/usr/bin:/bin`. The stub `git` appends `GIT: $*` to a marker file
and does nothing else. **runs** = the marker holds the git argv. **Guard** = the verdict of
`gitDestructivePredicate` on main at 66c1684. Rows 44–60 keep the numbers of
`docs/contributing/design/arith-expansion-comsub-bypass.md`. Rows 61 and up are new.

**G. Tables D/E re-measured** (each one matches the earlier table)

| # | Command | 3.2.57 | 5.3.20 | Guard |
|---|---|---|---|---|
| 44 | `(( $(git push -f origin) ))` | runs | runs | block |
| 45 | `(( '$(git push -f origin)' ))`, ``(( '`git push -f origin`' ))`` | not run | runs | **allow** |
| 46 | `for (( i=$(git push -f origin); i<1; i++ )); do :; done` | runs | runs | block |
| 47 | `for (( i='$(git push -f origin)'; i<1; i++ )); do :; done` | not run | runs | **allow** |
| 48 | `a[$(git push -f origin)]=1` | runs | runs | block |
| 49 | `a['$(git push -f origin)']=1` | not run | runs | **allow** |
| 50 | `x=abc; echo ${x:$(git push -f origin)}` | runs | runs | block |
| 51 | `x=abc; echo ${x:'$(git push -f origin)'}` | runs | runs | **allow** |
| 52 | `echo ${a['$(git push -f origin)']}` | not run | runs | **allow** |
| 53 | `echo $(( a['$(git push -f origin)'] ))` | runs | not run | block (fails closed) |
| 54 | `let '1+$(git push -f origin)'` | not run | not run | allow |
| 55 | `let 'a[$(git push -f origin)]'` | runs | runs | **allow** |
| 56 | `[[ 'a[$(git push -f origin)]' -eq 0 ]]` | runs | runs | **allow** |
| 57 | `x='a[$(git push -f origin)]'; echo $(( x ))` | runs | runs | **allow** |

**H. The A1 contexts in other spellings** (lesson 006: every form of the same construct)

| # | Command | 3.2.57 | 5.3.20 | Guard |
|---|---|---|---|---|
| 61 | `echo "${a['$(git push -f origin)']}"` | not run | runs | allow |
| 62 | `x=abc; echo ${x:1:'$(git push -f origin)'}` (length) | runs | runs | allow |
| 63 | `x=abc; echo ${x: -'$(git push -f origin)'}` | runs | runs | allow |
| 64 | `echo ${@:'$(git push -f origin)'}` | not run | runs | allow |
| 65 | `a['$(git push -f origin)']+=1`, `x=(); x['$(git push -f origin)']=1` | not run | runs | allow |
| 66 | `(( a['$(git push -f origin)'] ))` | runs | not run | allow |
| 67 | `(( '${ git push -f origin; }' ))`, `(( '${x:-$(git push -f origin)}' ))` | not run | runs | allow |
| 68 | ``a['`git push -f origin`']=1`` | not run | runs | allow |
| 69 | `(( $'$(git push -f origin)' ))`, `for (( i=$'$(git push -f origin)'; i<1; i++ )); do :; done` | not run | runs | allow |
| 70 | `a[$'$(git push -f origin)']=1`, `echo ${a[$'$(git push -f origin)']}` | not run | runs | allow |
| 71 | `x=abc; echo ${x:$'$(git push -f origin)'}` | runs | runs | allow |
| 72 | `(( $'\x24(git push -f origin)' ))`, `a[$'\x24(git push -f origin)']=1` | not run | runs | allow |
| 73 | `declare a['$(git push -f origin)']=1` | runs | runs | allow |

**I. A1 boundary rows: what a refusal would cost**

| # | Command | 3.2.57 | 5.3.20 |
|---|---|---|---|
| 74 | `(( '1' + 2 )) && git push -f origin`, `for (( i='0'; i<1; i++ )); do git push -f origin; done` | runs (quote accepted) | not run (error) |
| 75 | `a['1']=x && git push -f origin` | runs | not run |
| 76 | `declare -A m; m['k']=v; [ "${m['k']}" = v ] && git push -f origin` | runs | runs |
| 77 | `declare -A m; m['$(git push -f origin)']=1`, `declare -A m; echo ${m['$(git push -f origin)']}` | not run | not run |
| 78 | `x=abc; [ "${x:'1'}" = bc ] && git push -f origin` | not run | not run |
| 79 | `echo ${x:-'$(git push -f origin)'}`, `${x:='…'}`, `${x/'…'/y}`, `${x::'…'}`, `${#a['…']}` | not run | not run |
| 80 | `echo "${x:'$(git push -f origin)'}"`, `a[1]='$(git push -f origin)'` | not run | not run |
| 81 | `(( "\$(git push -f origin)" ))`, `a["\$(git push -f origin)"]=1`, `${x:"\$(…)"}`, `${a["\$(…)"]}`, `(( \$(…) ))` | not run | not run |

**J. A2: a subscript in a string evaluated as arithmetic**

| # | Command | 3.2.57 | 5.3.20 | Guard |
|---|---|---|---|---|
| 82 | `let "a[\$(git push -f origin)]"`, ``let "a[\`git push -f origin\`]"`` | runs | runs | allow |
| 83 | `let $'a[$(git push -f origin)]'`, `let $'a[\x24(git push -f origin)]'` | runs | runs | allow |
| 84 | `let 'x=a[$(git push -f origin)]'`, ``let 'a[`git push -f origin`]'``, `let 'a[${x:-$(git push -f origin)}]'` | runs | runs | allow |
| 85 | `let a[\$\(git\ push\ -f\ origin\)]`, `let a\[\$\(git\ push\ -f\ origin\)\]` | runs | runs | allow |
| 86 | `[[ 0 -lt 'a[$(git push -f origin)]' ]]` | runs | runs | allow |
| 87 | `[[ 1 -eq 1 && 'a[$(git push -f origin)]' -eq 0 ]]`, `[[ ( 'a[$(git push -f origin)]' -eq 0 ) ]]` | runs | runs | allow |
| 88 | `[[ "a[\$(git push -f origin)]" -eq 0 ]]`, `[[ a[\$\(git\ push\ -f\ origin\)] -eq 0 ]]` | runs | not run | allow |
| 89 | `declare -i x='a[$(git push -f origin)]'` | runs | runs | allow |
| 90 | `let a[\$(git push -f origin)]` (syntax error) | not run | not run | block |
| 91 | `[ 'a[$(…)]' -eq 0 ]`, `test 'a[$(…)]' -eq 0`, `[[ 'a[$(…)]' == 0 ]]` | not run | not run | allow |
| 92 | `let 'a[1]+$(git push -f origin)'`, `let '1+$(…)' 'a[$(…)]'` | not run | not run | allow |
| 93 | `[[ 'a[1]' -eq 0 ]] && git push -f origin`, `let 'b=a[1]' && git push -f origin` | runs | runs | block |

**K. A2: the variable form (row 57) and where the value can come from**

| # | Command | 3.2.57 | 5.3.20 | Guard |
|---|---|---|---|---|
| 94 | `x='a[$(…)]'; (( x ))`, `…; [[ $x -eq 0 ]]`, `…; let x`, `…; echo ${y[x]}`, `…; echo $(( $x ))` | runs | runs | allow |
| 95 | `x="a[\$(git push -f origin)]"; echo $(( x ))`, `x=$'a[\x24(git push -f origin)]'; echo $(( x ))` | runs | runs | allow |
| 96 | `x=a[\$\(git\ push\ -f\ origin\)]; echo $(( x ))`, `x=a\[\$\(…\)\]; echo $(( x ))` | runs | runs | allow |
| 97 | `x=$(printf '%s' 'a[$(…)]'); echo $(( x ))`, `read x <<< 'a[$(…)]'; echo $(( x ))` | runs | runs | allow |
| 98 | `printf 'a[$(…)]' > v; x=$(cat v); echo $(( x ))` (value read from a file) | runs | runs | allow |
| 99 | `X='a[$(git push -f origin)]' bash -c 'echo $(( X ))'` (value in the environment) | runs | runs | allow |
| 100 | `f() { echo $(( $1 )); }; f 'a[$(git push -f origin)]'` | runs | runs | allow |
| 101 | `printf -v x 'a[%s]' '$(git push -f origin)'; echo $(( x ))` | runs | runs | allow |
| 102 | `x='a['; y='$(git push -f origin)]'; echo $(( $x$y ))` | runs | runs | allow |
| 103 | `x='a[$(git push -f origin)]'; echo "$x"` (no arithmetic read) | not run | not run | allow |

**L. Numeric `$'…'` escapes, the ext-diff counterpart, and the subscript boundary**

| # | Command | 3.2.57 | 5.3.20 | Guard |
|---|---|---|---|---|
| 104 | `let $'a[\44(git push -f origin)]'`, ``let $'a[\x60git push -f origin\x60]'``, ``let $'a[\140git push -f origin\140]'``, `let $'a[\x24\x28git push -f origin)]'` | runs | runs | allow |
| 105 | `let $'a[\u24(git push -f origin)]'`, `let $'a[\U00000024(git push -f origin)]'` | not run | runs | allow |
| 106 | `let $'a[\0044(git push -f origin)]'` (octal takes 3 digits: `\004` then `4`) | not run | not run | allow |
| 107 | `let 'a[$(git diff HEAD)]'` | runs `diff HEAD` | runs `diff HEAD` | allow (ext-diff) |
| 108 | `(( '$(git diff HEAD)' ))` | not run | runs `diff HEAD` | allow (ext-diff) |
| 109 | `let 'a[b[1]+$(git push -f origin)]'` (a `]` between `[` and the opener) | runs | runs | allow |
| 110 | `awk '{ a[$1] = $(NF) } END { print 1 }' </dev/null && git push -f origin` (a working awk program) | runs | runs | block |

`…` stands for `git push -f origin`.

What the rows prove:

- **A1 is a 5.3 behaviour in four of five contexts.** bash 5.3 expands quoted text again in `(( ))`,
  `for (( ))`, assignment subscripts and `${a[…]}`. bash 3.2 does it only in `${x:offset}` and its
  length (rows 51, 62, 63, 71), and in `(( a['…'] ))` (row 66). Every quoting form is affected:
  `'…'`, `$'…'` with a literal or numerically escaped `$` (rows 69–72). An escaped `\$` in `"…"` is not
  (row 81).
- **A1's bodies hold working quotes.** bash 3.2 accepts `'1'` in `(( ))` and in an assignment subscript
  (rows 74, 75). Associative-array keys are quoted in both shells (row 76), and a quoted `$(` in such
  a key does not run (row 77). A quoted default `${x:-'…'}` does not run its text (row 79).
- **A2 needs a subscript.** With no `[ … ]` around the substitution, nothing runs (rows 54, 92). Every
  quoting form runs it, including escapes outside quotes (rows 82–85). `[` and `test` do not evaluate
  their operands, and `==` does not (row 91). `declare -i` does (row 89).
- **A `[[` operand is not a unit the tokeniser sees.** `&&` and `(` split the `[[ … ]]` command into
  several tokeniser commands (row 87). A rule keyed on "the head word is `[[`" misses them.
- **The value in row 57 can come from anywhere.** That includes a file (row 98), the environment
  (row 99), a function argument (row 100), `printf -v` (row 101) and two concatenated halves
  (row 102). Every row of table K except 101 and 102 holds `[`…`$(` as a literal inside one word
  of the command text. Rows 98–100 would not if the file, the environment or the call site came
  from outside the command.
- **"The opener sits inside an unclosed `[`" is not bash's rule.** Row 109 runs with a `]` between
  them (a nested subscript), so a rule keyed on bracket pairing leaks. A rule keyed on "a `[`
  anywhere before the opener" also fires on a working awk program (row 110).
- **A numeric `$'…'` escape decodes before the evaluation.** `\44`, `\x60` and `\140` give `$` and a
  backtick in both shells. `\u` / `\U` do so in 5.3 only (rows 104–106).

### Cost of failing closed

A `{ parsed: false }` result denies the whole Bash call, git or not (`judgeParsed`,
`engine/src/guards/shell-git-invocations.js:280`). Each option below was measured with a prototype
predicate: a throwaway copy of `shell-tokeniser.js` that records every quoted span and word, with its
context. It was never committed. Two corpora were used:

- **fuzz**: `generateCommands(seed, 1500)` over the 20 seeds of the four BACKLOG group C batches. That
  gives 30000 commands: 29162 parse today, 11026 of those are allowed by both predicates, 838 already
  fail closed.
- **disk**: the 247 distinct bash scripts on this machine under `<brew-prefix>` (`*.sh` under 120 KB,
  plus `etc/bash_completion.d/*`). Each file is judged as one command: 244 parse today, 210 are
  allowed. This corpus has real arrays, `$(( ))` and `[[ … -eq … ]]`. The fuzz generator emits none.

A census over agent transcripts was not run (the permission layer denied reading them).

| Rule (prototype) | fuzz: newly fail closed / 29162 parsed | of them allowed today / 11026 | disk: newly fail closed / 244 | of them allowed today / 210 |
|---|---|---|---|---|
| DC1-A: quoted opener in `(( ))` / `${ }` / an unclosed `[` | 0 | 0 | 0 | 0 |
| DC1-B proxy: any `'` in an arithmetic body | 0 | 0 | 0 | 0 |
| DC2-A: word with a literal `$`/backtick and `[`…opener | 0 | 0 | 1 | 1 |
| DC2-A with the broad escape clause (`$'…\…'` + `[`) | 0 | 0 | 3 | 1 |
| DC2-B: DC2-A spans, line also holds `let` or `[[` | 0 | 0 | 1 | 1 |
| DC3-(a) bounded: literal assigned, then read in arithmetic | 0 | 0 | 0 | 0 |
| Full closure: refuse every arithmetic read of a variable | — | 0 real reads | — | 34 |

- The single DC2-A disk hit is `<brew-prefix>/Library/Homebrew/cmd/shellenv.sh:53`. It is an `echo "…[System.Environment]…\$('…')…"`
  that prints PowerShell text: a literal `[` and then an escaped `\$(` in one word.
- The two extra hits of the broad escape clause are completion scripts with `$'\n'` / `$'\t'` and a `[`
  in the same word. A clause that decodes only numeric escapes to `$` or a backtick does not fire on
  them (Design, A2).
- Full closure: the regex counts `$((`, `((`, `$[` or `let` with an identifier, and `[[ … -eq|-ne|-lt|-le|-gt|-ge`.
  On fuzz it has 9 raw hits and 0 real reads: 6 in quoted heredoc bodies, 3 `$((cmd) )` subshells. On
  disk it matches 34 of 210 allowed scripts (16%), e.g. `$((OPTIND - 1))`, `[[ $# -gt 0 ]]`,
  `$((${#words[@]} - 1))`.
- The fuzz zeros carry little weight for A2/DC3. The generator never emits a subscript or an
  arithmetic read, so the disk column is the informative one. Both corpora are small next to real
  agent traffic.

### What exists today

- **Tokeniser** `engine/src/guards/shell-tokeniser.js` (line numbers at 66c1684):
  - `NO_ARITHMETIC` (L188); `createContext(source, depth)` (L190), fields `parameter`, `arithmeticFloor`,
    `opaque`, `piece`; `fail(context, reason)` (L292) keeps the first reason.
  - `endWord(context)` (L238): builds `{ text, dynamic, opaque?, pattern? }`, resets the flags, drops a
    redirect target, then `pushWord`. It is also `PARAMETER.settle`, so it runs at the end of every
    `${ }` body.
  - `onBackslash(context)` (L364): appends the escaped char. `consumeDoubleQuoted` (L378) routes `\$`,
    `` \` ``, `\"`, `\\` inside `"…"` to it, so it is the single site for an escaped `$` or backtick.
  - `onSingleQuote(context)` (L371): `indexOf("'")`, then `append(context, source.slice(index + 1, close))`.
  - `readAnsiC(context)` (L404): `$'…'`, char by char through `onBackslashOrLiteral` (L418) /
    `onEscapedChar` (L423). An escape appends the char after `\` and marks the word
    `dynamic` + `opaque`. It does not decode `\x24`.
  - `PARAMETER` descriptor (L432, `parameter: true`); `enterConstruct` (L455) sets `child.parameter`.
    The `${ }` body is stepped by `CHAR_HANDLERS` in a child context, so a `'` there reaches
    `onSingleQuote` with `context.parameter === true`.
  - `ARITHMETIC_SINGLE_QUOTE` (L497) and `failArithmeticQuote` (L518): the `$(( ))` / `$[ ]` scanner
    already refuses every `'` (ADR-688, ADR-690). This is why row 53 blocks.
  - `onOpenParen` (L776): an adjacent `((` sets `arithmeticFloor` (the command form and `for ((`).
    `onCloseParen` (L783) clears it. Today it is used only by `onHeredoc` (`ARITHMETIC_HEREDOC`).
  - `ASSIGNMENT` (L36) is `^[A-Za-z_][A-Za-z0-9_]*=`, so `a[…]=1` is read as a command word, not an
    assignment.
- **Tests:**
  - `engine/test/guards/shell-tokeniser.test.js`: `dyn` (L5), `assertParsesWords` (L128),
    `assertFails` (L379), `ARITHMETIC_SINGLE_QUOTE` / `PUSH` (L618–620), describe "quotes inside an
    arithmetic expansion body" (L666).
  - `engine/test/guards/git-destructive-predicate.test.js`: `assertBlocks` (L289), `assertPasses`
    (L301), describe "parameter expansion and arithmetic" (L360).
  - `engine/test/guards/git-ext-diff-predicate.test.js`: `assertBlocks` (L361).
  - `engine/test/guards/git-plain-command-gate.test.js:52–54` already pins the gate's refusal of
    `declare -i n='a[$(git push)]'`, `typeset -i …` and `let 'x=a[$(git push)]'`. That is prior art
    for a token-text rule (`SINGLE_QUOTE_FORBIDDEN`, `engine/src/guards/git-plain-command-gate.js:18`).
- **Census:** `engine/test-helpers/git-differential-harness.js`: `TAGS` (L22), `FALSE_BLOCK_TAGS`
  (L43), `PARSE_FAILURE_TAGS` (L51), `SPECIALS` (L142), `BASHISMS` (L261), `nestedForms` (L284).
  `engine/test/guards/shell-git-invocations.differential.test.js`: `problemsOf` (L50),
  `GUARD_FUZZ_SEEDS` / `GUARD_FUZZ_COUNT` (L32–33), and the fixed-entry pins (L296, L312).
- **Precedent:** ADR-594 (an unmodelled construct is unparseable), ADR-688/690 (a `'` in `$(( ))` /
  `$[ ]` fails closed), lesson 006 (every substitution form), lesson 007 (key on token text, not
  grammar position; refuse the construct).

## Requirements

1. R1: rows 45, 47, 49, 51, 52 (A1) and 55, 56 (A2) block in both predicates. Each fails closed with a
   reason that names the construct.
2. R2: row 57 blocks, or it is closed as won't-do under `### Closed — won't-do` with its rationale and
   rows 94–102, as DC3 settles.
3. R3: rows 46, 48, 50 keep `block`. Row 54 keeps `allow` and its shape: parsed, `let` plus one word.
   Rows 44 and 53 keep `block`.
4. R4: the spellings of the same rows in tables H (61–73), J (82–89) and L (104, 105, 107–109)
   block, as DC4 settles. When DC4 leaves them out, each goes to `## Out of scope` with its row
   number.
5. R5: a command with no quoted or escaped substitution opener keeps its verdict and word shape. That
   covers rows 74–76 (quotes in arithmetic bodies that work), `${x:-'default'}`, `IFS=$'\n'`, and
   `echo $'\033[1m'x`.
6. R6: the fuzz census stays green at `GUARD_FUZZ_COUNT=1500` on both shell arms over the four seed
   batches. Any new construct is tagged in the generator.

## Design

The recommended options (DC1-A, DC2-A, DC3-c, DC4-A) shape this section. Two token-text rules, each
one check, no new entry point and no new descriptor.

### A1: a quoted substitution opener inside an arithmetic reach

```js
const SUBSTITUTION_OPENER = /\$\(|\$\{|`/;
const UNCLOSED_SUBSCRIPT = /\[[^\]]*$/;
const QUOTED_ARITHMETIC_SUBSTITUTION =
  "craft: command not parseable (a quoted $( ), ` or ${ } inside (( )), a subscript or ${ } — bash may still run it) — denied fail-closed";

// (( )), for (( )), any ${ } body and an open [ subscript: bash expands quoted text there again (5.3 everywhere, 3.2 in some).
const inArithmeticReach = context =>
  context.arithmeticFloor !== NO_ARITHMETIC || context.parameter || UNCLOSED_SUBSCRIPT.test(context.piece ?? '');
```

- `onSingleQuote`: before the append,
  `if (inArithmeticReach(context) && SUBSTITUTION_OPENER.test(span)) return fail(context, QUOTED_ARITHMETIC_SUBSTITUTION);`.
- `readAnsiC`: the same check on the raw span between `$'` and its closing `'`. The span also fails
  when it holds a numeric escape that decodes to `$` or a backtick (`escapesToOpener`, below; row 72).
  `$'\n'` and `$'\t'` do not fail.
- **Paths added:** one predicate, two call sites, one reason. Nothing is routed anew. The `(( ))` word
  shape, `arithmeticFloor`, the `PARAMETER` descriptor and the assignment path stay as they are.
- **Why key on the context and the text, not on where in `${ }` the quote sits:** the `${ }` body
  splits at a space (row 63, `${x: -'…'}`), so a rule keyed on "right after `:`" misses it
  (lesson 007). Refusing every `${ }` body with a quoted opener costs rows 79–80, which run nothing.
- Rows covered: 45, 47, 49, 51, 52, 61–73 and 108. Row 73 (`declare a['…']=1`) is covered by
  construction, because its piece holds an open `[`. Rows 74–76 do not fail: they hold no opener.

### A2: a word holding a literal substitution inside a subscript

```js
const LITERAL_SUBSCRIPT_SUBSTITUTION = /\[[\s\S]*(?:\$\(|\$\{|`)/;
const SUBSCRIPT_IN_STRING =
  "craft: command not parseable (a word holding a quoted [ … $( ) — bash may evaluate it as arithmetic and run it) — denied fail-closed";
```

- `createContext` gains two booleans, `literalOpener` and `escapedOpener`. Both are reset in `endWord`.
  - `literalOpener` is set when the word takes a `$` or backtick that bash will not expand at this
    point: a `'…'` span holding one (`onSingleQuote`), a `$'…'` span holding one (`readAnsiC`), or an
    escaped `\$` / `` \` `` (`onBackslash`, which also serves `"…"` through `consumeDoubleQuoted`).
  - `escapedOpener` is set by `readAnsiC` when a numeric escape in the span decodes to `$` or a
    backtick. That is `escapesToOpener(span)`: `\xHH` (1–2 hex), `\NNN` (1–3 octal), `\uHHHH` (1–4 hex)
    or `\UHHHHHHHH` (1–8 hex) whose value is `0x24` or `0x60`. `\n`, `\t`, `\e` and `\033` never match.
- `endWord`, before the word is built:
  `if ((context.literalOpener && LITERAL_SUBSCRIPT_SUBSTITUTION.test(piece)) || (context.escapedOpener && piece.includes('['))) return fail(context, SUBSCRIPT_IN_STRING);`
- **The rule is keyed on the word, not on `let` or `[[`.** So `[[ … && 'a[$(…)]' -eq 0 ]]` (row 87),
  `declare -i` (row 89), a `bash -c` / `eval` string (re-parsed by `parseNested`) and a `${ }` body
  (whose `settle` is `endWord`) are all covered by the one check.
- **A real expansion does not trip it.** `'a['"$(date)"']'` takes `[` from a quote and `$(` from a
  real substitution. The `'a['` span holds no `$`, so `literalOpener` stays false.
- **Paths added:** two context fields, three set sites (`onSingleQuote`, `readAnsiC`, `onBackslash`),
  one check, one reason, one pure decoder.
- Rows covered: 55, 56, 57, 82–89, 94–100, 104, 105, 107 and 109, whatever reads the literal.
  It overlaps A1 on rows 49, 52, 65, 66, 68, 70, 72, 73.

### Row 57 and the non-literal residual (DC3-c)

There is no data-flow rule. The A2 word rule refuses the literal `a[$(` wherever it is written, so
row 57 and rows 94–100 block whatever arithmetic context reads the variable. What stays open is a
value the command text never holds whole in one word:

- `printf -v` formatting (row 101) and concatenation (row 102);
- a file, environment variable or function argument set by an earlier Bash call.

Only refusing every arithmetic read of a variable closes these, and that denies 34 of the 210
allowed disk scripts. They are recorded under
`### Closed — won't-do (rationale recorded)` in BACKLOG.md.

### Accepted false blocks

The first three classes run nothing in either shell:

- A quoted opener in any `${ }` body: `${x:-'$(cmd)'}`, `${x/'$(cmd)'/y}` (row 79), and
  `"${x:'$(cmd)'}"` (row 80).
- An associative-array key holding a literal opener, `m['$(x)']` (row 77).
- A word with a literal `[` and then a literal opener, with no arithmetic reader. Examples:
  `a[1]='$(x)'` (row 80), `echo 'a[$(x)]'`, `[ 'a[$(x)]' -eq 0 ]` (row 91), `let 'a[1]+$(x)'`
  (row 92), `x='a[$(x)]'; echo "$x"` (row 103).
- **One working class:** a single-quoted awk or perl program with a `[` before `$(` or `${`, for
  example `awk '{ a[$1] = $(NF) }'` (row 110). It is denied in both shells. Narrowing to "the opener
  inside an unclosed `[`" would let it pass, but it leaks row 109.
- Measured cost: 0 of 29162 parsed fuzz commands. On disk, 1 of 244 parsed scripts (the shellenv
  PowerShell `echo`).

## Decision candidates

| # | Choice | Alternatives (≤3) | Recommendation | Why |
|---|---|---|---|---|
| DC1 | A1 mechanism: rows 45, 47, 49, 51, 52 | **A.** Fail closed on a `'…'` / `$'…'` span that holds `$(`, `` ` `` or `${` (or a numeric escape decoding to `$`/backtick) when the context is in an arithmetic reach: `arithmeticFloor` set, a `${ }` body, or the piece holds an unclosed `[`. **B.** Route the bodies through the arithmetic-expansion scanner (`scanArithmeticBody`), which refuses every `'`. **C.** A with every `'` refused, not only one holding an opener. | **A** | Paths counted. A adds 1 predicate and 2 call sites (`onSingleQuote`, `readAnsiC`), with 0 new entry points or descriptors. B adds 4 entry sites: the `((` command form in `onOpenParen` (`for ((` shares it), the assignment subscript in `onGlob`, `${name[` and `${x:` in the `PARAMETER` body. It also needs 3 descriptors (one with two closers, `:` and `}`, which `closerEnd` cannot express) and a re-read as a subshell for `((cmd) )`. B changes the `(( ))` word shape: row 58 flips to allow. It misses row 63 (the body splits at the space) and row 73 (`declare`). C and B both deny rows 74–76, which work: `'1'` in `(( ))` under 3.2 and associative keys in both shells. C also denies every quoted default such as `${x:-'text'}`, because any `${ }` body is in reach. A denies only rows 77, 79 and 80, which run nothing. Measured 0 / 29162 fuzz and 0 / 244 disk. |
| DC2 | A2 static forms: rows 55, 56 | **A.** Word rule: fail closed when a word holds a literal `$`/backtick (quoted or escaped) and its text matches `\[…($(\|`\|${)`, or holds `[` and a numeric `$'…'` escape decoding to `$`/backtick. Keyed on token text, anywhere. **B.** A, only when the command line holds a `let` or `[[` word. **C.** Grammar position: the arguments of a `let` command and the operands next to `-eq`…`-ge` in a `[[` command. | **A** | Lesson 007: A has no position to miss, and its regex does not pair brackets, since row 109 runs with a `]` before the opener. C misses row 87: `&&` and `(` split `[[ … ]]` into separate tokeniser commands, and both shells run git there. C also misses rows 89 (`declare -i`) and 57. B misses rows 57 and 89, and every table K row with no `let` or `[[` word. It also needs a whole-source scan that the per-context tokeniser does not have today. Cost of A: 0 / 29162 fuzz, 1 / 244 disk (a PowerShell `echo` string). B costs the same 1 on disk, because that file also holds `[[`. |
| DC3 | A2 variable form: row 57 | **(a)** Bounded data-flow rule: a variable assigned a quoted string holding `[`…opener, then read in an arithmetic context (`$(( ))`, `(( ))`, `$[ ]`, `let`, `[[ -op ]]`, a subscript, `${y:x}`) in the same command line. **(b)** Won't-do: close row 57 under `### Closed — won't-do` citing rows 57, 94–102. **(c)** No data-flow rule. DC2-A's word rule already refuses the literal whatever reads it, and the residual (rows 101, 102 and values set by an earlier call) is closed as won't-do. | **(c)** if DC2-A, else **(b)** | Measured: (a) newly blocks 0 / 11026 allowed fuzz commands and 0 / 210 allowed disk scripts. It covers rows 57, 94, 95 (first spelling) and 99, but it re-enumerates arithmetic sink positions (lesson 007). It misses 95 (escape spelling), 96, 97, 98, 100, 101 and 102, all of which run under both shells. (c) blocks 57 and 94–100 at DC2-A's cost (0 fuzz, 1 disk) with no sink list. It leaves 101, 102 and values set by an earlier call. Closing the residual needs a refusal of every arithmetic variable read: 34 / 210 allowed disk scripts (16%). Under DC2-B or C, row 57 stays open, so only (a) or (b) remain. |
| DC4 | Scope of the sibling spellings (tables H and J) | **A.** Cover every quoting form of the same rows: `'…'`, `$'…'` with a literal or numeric-escape `$`, `"…\$…"`, bare `\$` (rows 61–73, 82–89). **B.** Cover only the `'…'` spelling of the eight rows. Rows 69–72, 82, 83, 85, 88, 104 and 105 go to Out of scope with their proof. | **A** | Lesson 006: one rule, every form. Under DC1-A / DC2-A it costs one more call site (`readAnsiC`), one more flag site (`onBackslash`) and the escape decoder. The brief's hard line names eight rows. These are the same rows in another spelling, the same behaviour and the same handlers, so the fold rule applies. The user decides whether "only the eight rows" excludes them. |

## Test strategy

Every red row is written as a failing test before the fix.

- **Tokeniser unit** (`engine/test/guards/shell-tokeniser.test.js`). Each describe below is new.
  - "a quoted substitution inside an arithmetic reach": `assertFails` rows with
    `QUOTED_ARITHMETIC_SUBSTITUTION`. They cover rows 45 (both spellings), 47, 49, 51, 52, 61–72, 79,
    the first spelling of row 80, and 108. A1 checks the span before A2 checks the word, so each row
    the two rules share (49, 52, 65, 66, 68, 70, 72, 73) is pinned with the A1 reason.
  - "a quoted subscript substitution in a word": `assertFails` rows with `SUBSCRIPT_IN_STRING`. They
    cover rows 55, 56, 57, 82–89 (both spellings of 87 pin the word key against position), 94–100,
    104, 105, 107, 109, 91, 92, 103, 110 (an accepted false block) and the second spelling of
    row 80 (`a[1]='$(…)'`).
  - Field kills (lesson 006):
    - row 45 fails if the `arithmeticFloor` disjunct is dropped;
    - row 51 if the `parameter` disjunct is dropped;
    - row 49 under A1 only if `UNCLOSED_SUBSCRIPT` is dropped (assert the A1 reason);
    - row 83's `\x24` spelling if `escapesToOpener` returns false;
    - row 82 if `onBackslash` stops setting `literalOpener`;
    - row 55 if `onSingleQuote` stops setting it;
    - the `$'a[$(…)]'` spelling of row 83 if `readAnsiC` stops setting it;
    - `echo '$' a[$(echo 1)]` and `echo $'\x24' a[1]`, which parse, if `endWord` stops resetting the
      flags.
  - `escapesToOpener` boundaries, from rows 104–106:
    - true: `\x24`, `\x60`, `\44`, `\044`, `\140`, `\u24`, `\U00000024`, and `\x245` (which decodes
      to `$` then `5`);
    - false: `\x2`, `\0044` (`\004` then `4`), `\033`, `\n`, `\e`, `\c$`.
  - Unchanged shape (`assertParsesWords`): row 54 (`let` + one word), `(( '1' + 2 ))`, `a['1']=x`,
    `declare -A m; m['k']=v`, `echo "${m['k']}"`, `${x:-'default'}`, `IFS=$'\n'`, `echo $'\033[1m'x`,
    `"${v//$'\n'/ }"`, and `'a['"$(echo 1)"']'` (a real expansion: `echo 1` is absorbed, no failure).
- **Predicate units.**
  - `git-destructive-predicate.test.js`: `assertBlocks` rows 45, 47, 49, 51, 52, 55, 56, 57, 87, 89.
    `assertPasses` row 54 and the R5 rows. Rows 46, 48 and 50 stay in `assertBlocks` (already pinned
    or added).
  - `git-ext-diff-predicate.test.js`: `assertBlocks` rows 107 and 108. The Claude hook judges only
    ext-diff.
- **Census** (`git-differential-harness.js`).
  - `SPECIALS`, composable, with no tag. Both shells run them with an empty stderr (measured with
    the stub), so the census sees agreeing blocks:
    - `let 'a[$(git push origin)]'`
    - `[[ 'a[$(git push origin)]' -eq 0 ]]`
    - `x='a[$(git push origin)]'; echo $(( x ))`, with `list: true`, under DC2-A
  - Every single-quoted arithmetic body ends in an arithmetic `syntax error` on stderr after the
    substitution has run, or instead of it. That trips `problemsOf`'s invalid-shell check. So these go
    in `STANDALONE_SPECIALS` (never composed), with their tag also in `SYNTAX_EXEMPT_TAGS`:
    - tag `quoted-substitution-in-arithmetic` (in `FALSE_BLOCK_TAGS` and `PARSE_FAILURE_TAGS`):
      `(( '$(git push origin)' ))` and `echo ${a['$(git push origin)']}`, which bash 3.2 does not
      run, and `x=abc; echo ${x:'$(git push origin)'}`, which both shells run;
    - tag `subscript-substitution-in-string` (same three lists): `let 'a[1]+$(git push origin)'`,
      which runs nothing.
  - `nestedForms` must not hand any of these to `sh -c`, because dash has no `let`, `[[`, arrays or
    `${x:offset}`. Extend `BASHISMS` with `\blet\b`, `\w\[` and `\$\{\w+:`, or exclude fragments that
    carry the new tags.
  - A fixed-entry pin, as at L312, keeps them present at every seed.
  - Gate: `GUARD_FUZZ_COUNT=1500` with `GUARD_FUZZ_SEEDS` set to each of the four BACKLOG group C
    batches, on both shell arms (`/bin/bash` 3.2.57 and bash 5.3.20). It must be green, with none
    skipped.
- **Mutation:** Stryker on `engine/src/guards/shell-tokeniser.js`, one run, concurrency 1, under
  `nice -n 19`. Pass one comma-separated `--mutate` holding the touched ranges (`onSingleQuote`,
  `readAnsiC`, `onBackslash`, `endWord`, `createContext`, the new predicate and decoder). If the
  dry run dies, narrow the tap `testFiles` to `shell-tokeniser.test.js` plus the two predicate suites.
  Hand-verify every survivor against the full covering set before writing a test.

## Out of scope

- bash 5.0–5.2: not installed. The 5.3-only rows (45, 47, 49, 52, 61, 64, 65, 67–70, 72) are measured
  on 5.3.20 only. The fix blocks them on every version, which is the safe direction.
- Values the command text never holds whole in one word: rows 101 and 102, and a file, environment
  variable or argument set by an earlier call. Closed by DC3, not built.
- zsh and dash: the guard models bash.
- The plain-command gate (`git-plain-command-gate.js`): unchanged. It already blocks rows 44–57
  (measured), so codex and copilot are not affected.
