# Design — arith-expansion-comsub-bypass

> Brief: the shell tokeniser skips the whole body of an arithmetic expansion, so a command
> substitution nested in it never reaches the predicates. `echo $(($(git push -f origin)))` runs
> `git push -f origin` under bash 3.2.57 and 5.3.20 and both predicates allow it. Make the guard see
> through `$(( … ))` (BACKLOG group A entry "See through a command substitution inside `$(( … ))`").
> Status: draft → self-reviewed ×3

## Context

### The failure

`onArithmetic` in `engine/src/guards/shell-tokeniser.js` finds the end of `$(( … ))` with a raw
paren count (`arithmeticEnd`) and marks the whole slice as one dynamic word. Nothing between `$((`
and `))` is stepped, so every substitution there is invisible:

```
$ node -e '…gitDestructivePredicate / gitExtDiffPredicate…'
echo $(($(git push -f origin)))   destructive= false   # bash runs git push -f origin
echo $(($(git diff HEAD)))        extDiff=     false   # bash runs git diff HEAD
```

### Shell behaviour: pinned empirically

All rows come from a throwaway `mktemp -d` dir. Each command was written to a script file and run
as `bash <file>` under `/bin/bash` 3.2.57 and `/opt/homebrew/bin/bash` 5.3.20, under `nice -n 19`,
with `PATH=<tmp>/bin:/usr/bin:/bin`. The stub `git` appends `GIT: $*` to a marker file and prints
nothing. **runs** = the marker holds the git argv. **Guard** = the verdict of
`gitDestructivePredicate` (or `gitExtDiffPredicate` for row 14) on main at 4399429. `⏎` is a newline.

**A. Substitutions in a `$(( … ))` body**

| # | Command | 3.2.57 | 5.3.20 | Guard |
|---|---|---|---|---|
| 1 | `echo $(($(git push -f origin)))` | runs | runs | allow |
| 2 | `echo $(( $(git push -f origin) + 1 ))` | runs | runs | allow |
| 3 | ``echo $((`git push -f origin`))`` | runs | runs | allow |
| 4 | `echo $((${ git push -f origin; }))` | bad substitution | runs | allow |
| 5 | `echo $((${\| git push -f origin; }))` | bad substitution | runs | allow |
| 6 | `echo "$(($(git push -f origin)))"` | runs | runs | allow |
| 7 | `cat <<E⏎$(($(git push -f origin)))⏎E` (unquoted heredoc body) | runs | runs | allow |
| 8 | `bash -c 'echo $(($(git push -f origin)))'` | runs | runs | allow |
| 9 | `echo $(( $(( $(git push -f origin) )) ))` | runs | runs | allow |
| 10 | `echo $(( ${x:-$(git push -f origin)} ))` | runs | runs | allow |
| 11 | `echo $(( a[$(git push -f origin)] ))` | runs | runs | allow |
| 12 | `echo $(( $(cat <(git push -f origin)) ))` | runs | runs | allow |
| 13 | `echo $(( $(cat <<E⏎x⏎E⏎git push -f origin) ))` | runs | runs | allow |
| 14 | `echo $(($(git diff HEAD)))` | runs `diff HEAD` | runs `diff HEAD` | allow (ext-diff) |

**B. Quoting, escapes and operators inside the body**

| # | Command | 3.2.57 | 5.3.20 | Guard |
|---|---|---|---|---|
| 15 | `echo $(( "$(git push -f origin)" ))` | runs, then syntax error | runs, prints `0` | allow |
| 16 | `echo $(( '$(git push -f origin)' ))` | runs, then syntax error | runs, then syntax error | allow |
| 17 | ``echo $(( '`git push -f origin`' ))`` | runs, then syntax error | runs, then syntax error | allow |
| 18 | `echo $(( '${ git push -f origin; }' ))` | bad substitution | runs, then syntax error | allow |
| 19 | `echo $(( \$(git push -f origin) ))` | not run, syntax error | not run, syntax error | allow |
| 20 | ``echo $(( \`git push -f origin\` ))`` | not run, syntax error | not run, syntax error | allow |
| 21 | `echo $(( '1' + 2 ))`, `echo $(( $'1' + 1 ))` | syntax error | syntax error | allow |
| 22 | `echo $(( ')' + 1 ))` | error token `')' + 1 ` | same | allow |
| 23 | `echo $(( ")" + 1 ))` | error token `")" + 1 ` | error token `) + 1 ` | allow |
| 24 | `echo $(( \) $(git push -f origin) ))` | runs, error token `\)  ` | same | allow |
| 25 | `echo $(( ')' $(git push -f origin) ))` | runs | runs | allow |
| 26 | `echo $(( $(echo ')' ; git push -f origin) + 1 ))` | runs | runs | allow |
| 27 | `echo $(( $(git push -f origin # )⏎) ))` | runs | runs | allow |
| 28 | `echo $(( 16#ff ))` → `255`; `echo $(( 1 << 2 ))` → `4`; `echo $(( 1 <<E ))` → `1` | same | same | allow |
| 29 | `echo $(( $(printf 3) + 1 ))` → `4` (the common idiom) | same | same | allow |
| 30 | `echo $(( "'" $(git push -f origin) ))` | runs | runs | allow |

What the rows prove:

- Every substitution form expands inside the body: `$( )`, backticks, `${ …; }` and `${| …; }`
  (5.3), `${…}` defaults, process substitution inside them, and nested `$(( ))` (rows 1–13).
- **The body is expanded like a double-quoted string.** A single quote does not stop a
  substitution (rows 16–18), a double quote does not either (row 15, 30), and a backslash does
  (rows 19, 20).
- **A single quote is never valid arithmetic** in either shell (row 21). The substitutions in it
  still run before the error (rows 16–18).
- **For finding the end, bash honours quotes and backslashes.** A `)` inside `'…'`, `"…"` or after
  `\` does not close the body (rows 22–24, read from the error token). The guard's raw paren count
  ends early on rows 24–26 and hides the git argv a second way.
- `#` and `<<` are arithmetic operators in the body, not a comment or a heredoc (row 28).

**C. `$((` that bash reads as `$( ( … ) … )`**

| # | Command | 3.2.57 | 5.3.20 | Guard |
|---|---|---|---|---|
| 31 | `echo $((git push -f origin) )` | runs | runs | allow |
| 32 | `echo $((git push -f origin); true)` | runs | runs | allow |
| 33 | `echo $((git push -f origin)\|cat)` | runs | runs | allow |
| 34 | `echo $((git push -f origin)⏎)` | runs | runs | allow |
| 35 | `echo $((git push -f origin 'x') )` | runs `push -f origin x` | same | allow |
| 36 | `echo $((git push -f origin))` | not run, arithmetic error | same | allow |
| 37 | `echo $(( (1) ) )` | `1: command not found` | same | allow |
| 38 | `echo $(((git push -f origin)) )` | not run, `((` error | same | allow |
| 39 | `echo $(( (git push -f origin) ))` | not run, arithmetic error | same | allow |

bash reads the text after `$((` as a matched pair. It is arithmetic when the `)` that closes the
second `(` is followed by `)` (rows 36, 39) **and** the body pairs every `(` and `)` outside `\x`,
`'…'` and `"…"`, counting the parens inside backtick bodies. Otherwise bash re-reads the text as a
command substitution whose body starts with a subshell (rows 31–35, 37, 38). This is a second bypass
at the same locus: `arithmeticEnd` does not check that the closer is `))`. The pairing clause and
the line-continuation spellings (`$\⏎((`, `$(\⏎(`, `)\⏎)`) were found at review: both fail closed
(ADR-692), since the scanner's pairing and bash's can disagree. Any `case` word in a `$( )` body
fails closed too (ADR-691), since a pattern `)` can close the body early.

**D. Arithmetic contexts that already block, and their single-quote mirrors**

| # | Command | 3.2.57 | 5.3.20 | Guard |
|---|---|---|---|---|
| 40 | `echo $[ $(git push -f origin) ]`, `echo $[ "$(git push -f origin)" ]` | runs | runs | block |
| 41 | `echo $[ '$(git push -f origin)' ]` | runs, then syntax error | same | **allow** |
| 42 | `echo "$[ '$(git push -f origin)' ]"` | runs | runs | block |
| 43 | `echo $[ 1 + 2 ]` → `3`; `echo $[ a[1] + $(git push -f origin) ]` runs | same | same | block on the git row |
| 44 | `(( $(git push -f origin) ))` | runs | runs | block |
| 45 | `(( '$(git push -f origin)' ))`, ``(( '`git push -f origin`' ))`` | not run | runs | **allow** |
| 46 | `for (( i=$(git push -f origin); i<1; i++ )); do :; done` | runs | runs | block |
| 47 | `for (( i='$(git push -f origin)'; i<1; i++ )); do :; done` | not run | runs | **allow** |
| 48 | `a[$(git push -f origin)]=1` | runs | runs | block |
| 49 | `a['$(git push -f origin)']=1` | not run | runs | **allow** |
| 50 | `x=abc; echo ${x:$(git push -f origin)}` | runs | runs | block |
| 51 | `x=abc; echo ${x:'$(git push -f origin)'}` | runs | runs | **allow** |
| 52 | `echo ${a['$(git push -f origin)']}` | not run | runs | **allow** |
| 53 | `echo $(( a['$(git push -f origin)'] ))` | runs | not run | allow |

The brief's "already block" holds for the unquoted spellings (rows 40, 44, 46, 48, 50). Each of
them has a single-quoted mirror that bash still expands, at least under 5.3, and that the guard
reads as a quoted literal. `$[ … ]` is the deprecated spelling of `$(( … ))` and behaves the same
in both shells (row 41). The others are command, `for`, subscript and parameter-offset contexts, a
different construct in the tokeniser (scope: DC4).

**E. A string evaluated as arithmetic (out of scope, see below)**

| # | Command | 3.2.57 | 5.3.20 | Guard |
|---|---|---|---|---|
| 54 | `let '1+$(git push -f origin)'` | not run | not run | allow |
| 55 | `let 'a[$(git push -f origin)]'` | runs | runs | allow |
| 56 | `[[ 'a[$(git push -f origin)]' -eq 0 ]]` | runs | runs | allow |
| 57 | `x='a[$(git push -f origin)]'; echo $(( x ))` | runs | runs | allow |

**F. Boundary rows for the change**

| # | Command | 3.2.57 | 5.3.20 | Guard |
|---|---|---|---|---|
| 58 | `((git push -f origin))` (command form) | not run, `((` error | same | block (read as words today) |
| 59 | `echo a$[b; git status`, `echo "a$[b"; git status` | syntax error, nothing runs | same | allow (`$[` read as a literal) |
| 60 | `echo $(( $(git push origin) + 1 ))` (no `-f`) | runs | runs | allow |

Row 58 shows the tokeniser already over-blocks a git word that bash reads as arithmetic, in the
command form. Row 59 shows an unterminated `$[` is a syntax error in both shells, so failing it
closed loses nothing. Row 60: `push` is destructive with or without `-f` (`judgePush`,
`engine/src/guards/git-destructive-predicate.js:45`), so census rows need no force flag.

### Cost of failing closed

A `{ parsed: false }` result denies the whole Bash call, git or not: `judgeParsed` returns
`{ block: true, reason }` on it (`engine/src/guards/shell-git-invocations.js:280`), and
`hooks/git-no-ext-diff.sh:87` hands every Bash command to the verdict bin with no git prefilter.
A rule that refuses any substitution in `$(( ))` therefore denies row 29 and every
`$(( $(date +%s) - start ))` an agent writes.

### What exists today

- **Tokeniser:** `engine/src/guards/shell-tokeniser.js`.
  - Constants `ARITHMETIC_OPEN_LEVEL` (L28) and `PAREN_LEVEL` (L29), used only by `arithmeticEnd`.
  - `createContext(source, depth)` (L186). `fail(context, reason)` (L285) keeps the first reason.
  - `onLiteral` (L289), `onSingleQuote` (L364), `consumeDoubleQuoted` (L371),
    `onDoubleQuote(context)` (L382): reads up to the closing `"` and expands `$`, backticks and
    escapes inside through `consumeDoubleQuoted`.
  - Descriptors `SUBSTITUTION`, `PARAMETER`, `FUNCTION_SUBSTITUTION` (L423–428) with fields
    `openLength`, `close`, `settle`, `parameter`, `reprinted`.
  - `runBody` (L431), `absorb` (L439), `markExpansion(context, start, end)` (L443),
    `isTooDeep` (L449), `enterConstruct(context, descriptor)` (L451).
  - `findBacktickEnd` / `enterBacktick` (L467–486).
  - `arithmeticEnd(source, from)` (L488) and `onArithmetic(context)` (L497):
    `const end = arithmeticEnd(context.source, context.index + 3); if (end === -1) return fail(context, UNTERMINATED_SUBSTITUTION); markExpansion(context, context.index, end);`
    No depth check.
  - `enterDollarParen(context)` (L503) routes `$((` to `onArithmetic`, else `SUBSTITUTION`.
  - `braceConstruct` (L510), `expandDollar(context)` (L512): `$(`, `${`, `$name`, else literal. A
    `$[` falls to `onLiteral`, and the `[` then reads as a glob, so `$[ … ]` is tokenised as words.
  - `onDoubleQuotedDollar` (L534), `scanExpansions` (L622, unquoted heredoc bodies),
    `onHeredoc` (L587, `ARITHMETIC_HEREDOC` inside `arithmeticFloor`), `onOpenParen` /
    `onCloseParen` (L671–683, the `(( … ))` command-form floor), `CHAR_HANDLERS` (L701),
    `parseShellCommands` (L726).
- **Tests:**
  - `engine/test/guards/shell-tokeniser.test.js`: `assertParsesWords` (L128) rows L174
    `x=$((1+2)) git diff` and L175 `echo $((2*(3+4)))` → `dyn('$((2*(3+4)))')`; the unterminated
    table (L189, row L194 `echo $((1+2`); `assertFails` (L379); `PINNED_NESTING_CAP` (L212);
    `ARITHMETIC_HEREDOC` row L476.
  - `engine/test/guards/git-destructive-predicate.test.js`: `assertBlocks` (L289),
    `assertPasses` (L301), the "parameter expansion and arithmetic" describe (L360–370).
  - `engine/test/guards/git-ext-diff-predicate.test.js`: `assertBlocks` (L361); row L246
    `x=$((1+2)) git diff`.
  - Census: `engine/test-helpers/git-differential-harness.js` `SPECIALS` (L141), its stub git
    (L53) prints nothing, so a `$(( $(git …) ))` row stays valid arithmetic.
    `engine/test/guards/shell-git-invocations.differential.test.js` `problemsOf` (L50) reports a
    `FALSE ALLOW` when bash ran a blocked argv and the predicate allowed it.
- **Precedent:** ADR-594 (an unmodelled construct is unparseable, work is bounded, nesting cap 8),
  ADR-684 (fail closed on a body construct bash mis-runs), lesson 006 (list and probe every
  substitution form; route each form to its own descriptor; pin each descriptor field).

## Requirements

1. R1: every row of tables A and C that **runs** git blocks in the predicate that judges its verb
   (rows 1–14, 24–27, 30–35). Each one blocks by seeing the git invocation or by failing closed,
   as the decisions below settle.
2. R2: rows with no substitution, or whose substitution bash does not run, keep their current
   verdict and word shape: L174, L175, row 28, row 29 (parsed, `echo` + one dynamic word),
   rows 19, 20, 36, 39.
3. R3: the git commands inside a seen-through body are absorbed into the parent's command list in
   source order, as `enterConstruct` does for `$( )`.
4. R4: each arithmetic construct counts towards the nesting cap, so `$((` nested past depth 8
   fails with the nesting reason instead of recursing without bound.
5. R5: the end of the body is found as bash finds it: quotes, backslashes and nested
   substitutions hide a `)` (rows 22–26). An unterminated body still fails with the unterminated
   reason (L194).
6. R6: rows 40–53 keep or gain a block according to DC4. No `/bin/bash` 3.2 verdict outside the
   arithmetic constructs changes.

## Design

The recommended options (DC1-A, DC2-A, DC3-A, DC4-B) shape this section.

### One scanner for arithmetic-expansion bodies

Arithmetic expansion becomes a descriptor-driven construct, next to `SUBSTITUTION`:

```js
// The body of $(( )) and $[ ] expands like a double-quoted string, and a ) or ] in quotes or after \ does not close it.
const ARITHMETIC_EXPANSION = Object.freeze({ openLength: 3, open: '(', close: ')', doubledClose: true });
const BRACKET_ARITHMETIC = Object.freeze({ openLength: 2, open: '[', close: ']', doubledClose: false });

const ARITHMETIC_SINGLE_QUOTE =
  "craft: command not parseable (a ' inside $(( )) or $[ ] — bash still runs the substitutions in it) — denied fail-closed";
const UNCLOSED = -1;
const REREAD_AS_SUBSTITUTION = -2;
```

`scanArithmeticBody(body, descriptor)` walks a scratch context from the opener, keeps a level
that starts at 1, and returns the index past the closer, `UNCLOSED`, or `REREAD_AS_SUBSTITUTION`:

| Char | Handling | Row |
|---|---|---|
| `descriptor.open` | level + 1, literal | 9, 37 |
| `descriptor.close` | level − 1. At 0: `doubledClose` and next char is `)` → end + 2; `doubledClose` and anything else → `REREAD_AS_SUBSTITUTION`; not doubled → end + 1 | 31–39 |
| `\` | skip it and the next char (no expansion, no paren count) | 19, 20, 24 |
| `"` | `onDoubleQuote(body)`: reads to the closing `"`, expanding inside | 15, 23, 30 |
| `'` | `fail(body, ARITHMETIC_SINGLE_QUOTE)` (DC2-A) | 16–18, 21, 22, 25 |
| `$` | `expandDollar(body)`: `$(`, `$((`, `${`, `${ `, `${\|`, `$[`, `$name` | 1, 2, 4–5, 9–13 |
| `` ` `` | `enterBacktick(body)` | 3 |
| anything else | `onLiteral` (`#`, `<<`, newline stay arithmetic) | 28 |

The handlers come from a `Map`, as `CHAR_HANDLERS` does, so each function stays under 20 lines and
nests at most two levels.

```js
const enterArithmetic = (context, descriptor) => {
  if (isTooDeep(context)) return fail(context, NESTING_TOO_DEEP);
  const start = context.index;
  const body = createContext(context.source, context.depth + 1);
  body.index = start + descriptor.openLength;
  const end = scanArithmeticBody(body, descriptor);
  if (body.failure !== null) return fail(context, body.failure);
  if (end === REREAD_AS_SUBSTITUTION) return enterConstruct(context, SUBSTITUTION);
  if (end === UNCLOSED) return fail(context, UNTERMINATED_SUBSTITUTION);
  absorb(context, body);
  markExpansion(context, start, end);
};

const enterDollarParen = context =>
  context.source[context.index + 2] === OPEN_PAREN
    ? enterArithmetic(context, ARITHMETIC_EXPANSION)
    : enterConstruct(context, SUBSTITUTION);
// expandDollar gains: if (next === OPEN_BRACKET) return enterArithmetic(context, BRACKET_ARITHMETIC);
```

- `arithmeticEnd`, `onArithmetic`, `ARITHMETIC_OPEN_LEVEL` and `PAREN_LEVEL` are removed, with the
  equivalent-mutant comment on `arithmeticEnd`.
- **Word shape:** the parent still gets one dynamic word holding the source slice, so L174, L175
  and row 29 keep their shape (R2). The scratch context's own `piece` and `words` are discarded.
  Only `body.commands`, filled by the nested constructs, are absorbed (R3).
- **Depth:** the scratch context is one level deeper, so `$(( $(( … )) ))` counts towards the cap
  (R4). Without it a 131072-character run of `$((` would recurse until the JS stack overflows.
- **Work:** the scanner reads each body character once. Nested constructs read their own range
  once, as today. ADR-594's linear bound holds.
- **Every entry path is covered by the one change:** bare words, `"$(( ))"` (via
  `onDoubleQuotedDollar` → `expandDollar`), unquoted heredoc bodies (via `scanExpansions`), and
  strings the guard parses again (`bash -c`, `eval`) (rows 6–8).
- **Re-read as a substitution (DC3-A):** `enterConstruct(context, SUBSTITUTION)` restarts at
  `start + 2`, so the child reads `(git push -f origin) )` as a subshell, as bash does (rows 31–35).
  A failure raised by the scan before the closer is found wins: `$((echo 'x') )` fails on the `'`.
  That over-blocks a non-git `$((cmd 'arg') )`, which is rare and denied in the safe direction
  (row 35 is a real git push).
- **`$[ … ]` (DC4-B):** it now reads as one dynamic word instead of the words `$[`, `1`, `+`, `2`,
  `]`. Rows 40 and 43 still block because the scanner sees their substitutions. Rows 41 and 42 block
  through the single-quote rule.
- **Bindings:** every binding consumes `parseShellCommands` through the two predicates, so no
  binding code changes.

### Accepted false blocks

- A `'` anywhere in a `$(( ))` or `$[ ]` body, including `$'…'`. Both shells reject it as
  arithmetic (row 21), so no working command is lost.
- A `$((cmd 'arg') )` re-read as a substitution, as above (row 35 fails on the `'`).
- `$(((cmd)) )` (row 38): the re-read child holds `((cmd))`, which the tokeniser reads as words, as
  it already does for the command form (row 58). bash does not run `cmd` there.
- An unterminated `$[` (row 59) now fails closed. bash rejects it as a syntax error in both shells.
- A git command inside the body that bash would run but whose output breaks the arithmetic is
  judged like any other git command (row 13 runs before the error). That is intended.

## Decision candidates

| # | Choice | Alternatives (≤3) | Recommendation | Why |
|---|---|---|---|---|
| DC1 | How the guard sees a substitution inside `$(( … ))` | **A.** Scan the body with double-quote expansion semantics in a scratch context one level deeper, counting bare parens for the end and absorbing the commands of nested substitutions (the scanner above). **B.** Keep skipping the body, but fail closed when it holds an unescaped `$(`, `` ` ``, `${ ` or `${\|`. **C.** Tokenise the body as a command list in a child context with `arithmeticFloor` semantics, as `(( … ))` is. | **A** | A models what bash does in every pinned row (A, B, C tables) and keeps row 29 parsing. B denies every Bash call that uses the `$(( $(cmd) + 1 ))` idiom, git or not (`shell-git-invocations.js:280`, no hook prefilter). C reads `'…'` as quoting (row 16 stays a fail-open), reads `<<` as a heredoc and fails closed on `echo $(( 1 << 2 ))`, which a predicate test pins as passing (`git-destructive-predicate.test.js:369`). |
| DC2 | A single quote inside the body | **A.** Fail closed with a new `ARITHMETIC_SINGLE_QUOTE` reason. **B.** Treat `'…'` as a span that hides `)` from the end search but whose content is still scanned for substitutions. | **A** | A single quote is never valid arithmetic in either shell (row 21), so A blocks no working command. B models rows 16–18, 22 and 25 too, but adds a second quoting mode to the scanner for commands that always fail. Precedent: ADR-594, an unmodelled construct is unparseable. |
| DC3 | `$((` whose inner `)` is not followed by `)` (rows 31–39) | **A.** Re-read it as `$( … )` through the existing `SUBSTITUTION` descriptor. **B.** Fail closed with the unterminated reason. | **A** | A is bash's own rule (rows 36–39 pin the boundary) and reuses a descriptor that already handles the subshell. B denies the whole call on every `$((cmd) )` spelling, which is legal shell for running a subshell. |
| DC4 | Scope of the sibling single-quote fail-opens (table D) | **A.** `$(( ))` only. File rows 41, 45, 47, 49, 51, 52 as a BACKLOG entry. **B.** `$(( ))` and `$[ ]`, which share the scanner (row 41 closes). File rows 45, 47, 49, 51, 52. **C.** B, plus single quotes in the `(( ))` command form, `for ((`, assignment subscripts and `${x:offset}` / `${a[…]}` subscripts. | **B** | `$[ … ]` is the same expansion under an older spelling, so lesson 006 applies: one rule, every form. It costs one descriptor. The C contexts are tokenised by other paths (`arithmeticFloor`, assignment words, `PARAMETER`), and four of their five rows run only under 5.3. That is a separate change with its own probe set. |

## Test strategy

- **Tokeniser unit** (`engine/test/guards/shell-tokeniser.test.js`).
  - `assertParsesWords` rows (new describe "arithmetic expansion bodies"). Each row expects the
    nested commands in source order (the git invocation among them), then `echo` with one dynamic word:
    - rows 1, 2, 3, 6, 9, 10, 11, 12, 13, 15, 24, 26, 27, 30
    - row 4 `${ …; }` and row 5 `${| …; }` (pins the `$` handler reaching `braceConstruct`)
    - row 7 (heredoc body) and row 8 (`bash -c`)
    - row 43 `$[ a[1] + $(git push -f origin) ]` (pins the `[` level count for `BRACKET_ARITHMETIC`)
    - rows 31–34 as `SUBSTITUTION` (git first, then `echo` with one dynamic word); row 38 as `SUBSTITUTION` holding `git push -f origin` (accepted false block)
  - Unchanged shape rows: L174, L175, row 28 (`16#ff`, `1 << 2`, `1 <<E`), row 29, rows 19, 20,
    36, 39, and `echo $[ 1 + 2 ]` as one dynamic word.
  - `assertFails` rows for `ARITHMETIC_SINGLE_QUOTE`: rows 16, 17, 18, 21, 22, 25, 35, 41, and
    `echo "$[ '$(git push -f origin)' ]"` (row 42).
  - Unterminated: `echo $((1+2` (L194 keeps), `echo $(( $(git push )`, `echo $[ 1 + 2`, and both spellings of row 59.
  - Nesting cap: `$((` nested to `PINNED_NESTING_CAP` fails with the nesting reason, and one less
    parses.
  - Descriptor-field kills (lesson 006): row 43 fails if `BRACKET_ARITHMETIC.open` is `(`; row 31
    fails if `doubledClose` is `false`; row 1 fails if the `$` handler is dropped; row 3 fails if
    the backtick handler is dropped; row 24 fails if the `\` handler is dropped; row 15 fails if the
    `"` handler is dropped.
- **Predicate units.**
  - `git-destructive-predicate.test.js`: `assertBlocks` rows 1, 3, 4, 5, 9, 25, 31, 41;
    `assertPasses` row 29 (`echo $(( $(printf 3) + 1 ))`) and row 28.
  - `git-ext-diff-predicate.test.js`: `assertBlocks` row 14 and its backtick spelling.
- **Census** (`git-differential-harness.js` `SPECIALS`): add `echo $(( $(git push origin) + 1 ))`
  and `echo $((git push origin) )` with no tag. The stub prints nothing, so both are valid shell.
  Before the fix the census reports a `FALSE ALLOW` on them, and after it they are agreeing blocks.
  The fixed-entry test pins that they appear at every seed.
- **Mutation:** Stryker on `shell-tokeniser.js`, one module per run at concurrency 1 under
  `nice -n 19`, narrowed to `shell-tokeniser.test.js` plus the two predicate suites. Every
  surviving mutant is checked by hand against the full covering set before a test is written.

## Out of scope

- Table E (rows 55–57): bash evaluates an array subscript in a string value as arithmetic and runs
  a substitution in it (`let 'a[$(…)]'`, `[[ 'a[$(…)]' -eq 0 ]]`, a variable read by `$(( x ))`).
  The command text holds the substitution only as a quoted literal or a variable value, a
  different mechanism from a parsed `$(( ))` body.
- The single-quote mirrors in other arithmetic contexts (rows 45, 47, 49, 51, 52), unless DC4-C
  is chosen.
- bash 5.0–5.2: not installed. The 5.3-only rows (4, 5, 18, 45, 47, 49, 52) are measured on 5.3.20
  only. The fix blocks them on every version, which is the safe direction.
- zsh and dash: the guard models bash, and the census keeps `$[` and `((` out of `sh -c` bodies.
