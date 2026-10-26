# Plan — guard-arith-cleanup

> Source: design doc `docs/contributing/design/guard-arith-cleanup.md` · ADRs `694, 695, 696, 697`
> (694, DC1-A, ratified: a `'…'` / `$'…'` span holding `$(`, a backtick or `${`, or a `$'…'`
> numeric escape decoding to `$` or a backtick, fails closed when the context is in an arithmetic
> reach: `arithmeticFloor` set, a `${ }` body, or the piece holds an unclosed `[`. 695, DC2-A,
> ratified: a word holding a literal `$` or backtick, quoted or escaped, whose text has a `[` before
> `$(`, `${` or a backtick fails closed, and so does a word holding `[` and a `$'…'` numeric escape
> decoding to an opener. 696, DC3-c, ratified: no data-flow rule; the residual is won't-do.
> 697, DC4-A, ratified: every quoting spelling of the rows is covered.)
> Row numbers (`row 55`) index the design doc's probe tables G to L.
> The plan is the implementation script AND the knowledge handoff. Part agents start
> with zero context: whatever a part block omits is paid later as agent rediscovery.
> `plan-lint.sh` enforces the schema below — the plan phase cannot close without it.

## Sizing rules

- Every part costs a full agent lifecycle (spin-up, zero-context rebuild, gate) — it
  must earn it. No standalone test-only parts for FEATURE code: coverage/interop/property
  tests fold into the implementation part whose code they exercise. EXCEPTION:
  test-infra-only and docs-only parts (tooling config, test helpers, fixtures,
  harness/ADV/property suites, docs/prose) with no `src/` delta ARE standalone — they
  have no implementation part to fold into.
- A part that would be a pure test pass over already-landed code merges into its
  neighbour.
- A part should land in ~100 tool calls. More than ~5 RED→GREEN cycles, or more than 6
  files in its `### Context` block, is two parts. What counts is a backticked path:
  backtick the files the part CREATES or EDITS, and write read-only reference paths in
  plain text.

## Plan shape (4 parts)

| # | Part | Size class | src delta | Files edited |
|---|---|---|---|---|
| 1 | A quoted substitution opener in an arithmetic reach fails closed (ADR-694, 697) | pure-module, medium (3 RED→GREEN cycles) | engine/src/guards/shell-tokeniser.js (~+30 / −8) | the tokeniser, its suite, both predicate suites |
| 2 | A word holding a literal subscript substitution fails closed (ADR-695, 696, 697) | pure-module, medium (4 cycles) | engine/src/guards/shell-tokeniser.js (~+20 / −6) | the tokeniser, its suite, both predicate suites |
| 3 | Census the new spellings in the differential fuzz | test-infra, small (2 cycles) | none | the fuzz harness, the census suite |
| 4 | Close group A in the backlog and record the residual | docs-prose, small | none | BACKLOG.md, docs/contributing/specs/gate.md |

Order is load-bearing:

- Part 2 reuses `SUBSTITUTION_OPENER`, `escapesToOpener` and the span pre-check in `readAnsiC`
  that Part 1 lands. A1 runs at span time and A2 at word end, so every row the two rules share
  (49, 52, 65, 66, 68, 70, 72, 73) keeps Part 1's reason after Part 2.
- Part 3's census entries fail closed in the tokeniser. Before Parts 1 and 2 they are false
  allows, so the census can only land green after both.
- Part 4 records what the three parts deliver and what they leave open.

Parts 1 and 2 share four files on purpose. Merged, the part would hold 7 RED→GREEN cycles, which
is past the 5-cycle limit. Split, each lands one ADR-scoped rule as its own commit, and Part 2
reads Part 1's landed code instead of rebuilding it.

### Prototype evidence

Every edit below was applied to a throwaway copy of `engine/` and `adapters/` at the branch tip
(`255cc5c`) and checked there:

| Check | Result |
|---|---|
| Parts 1 and 2 applied, every design row (44–110, both spellings) through `parseShellCommands` | A1 reason on 45, 47, 49, 51, 52, 61–73, 77, 79, 80 (first spelling), 108. A2 reason on 55–57, 80 (second spelling), 82–89, 91, 92, 94–100, 103, 104, 105, 107, 109, 110. Parsed: 44, 46, 48, 50, 54, 74–76, 90, 93, 101, 102, 106 |
| Same, `gitDestructivePredicate` / `gitExtDiffPredicate` | 45, 47, 49, 51, 52, 55, 56, 57, 87, 89 block in both (all allow on the shipped tree). 46, 48, 50, 44, 53 still block. 54 and the R5 rows with `&& git status` allow. Rows 107 and 108 block in ext-diff |
| `escapesToOpener` on the design's boundary list | true: `\x24`, `\x60`, `\44`, `\044`, `\140`, `\u24`, `\U00000024`, `\x245`; false: `\x2`, `\0044`, `\033`, `\n`, `\e`, `\c$`, plus `\\x24` and `\c\x24` (bash decodes both to text without `$`, checked with `printf` under 3.2.57 and 5.3.20) |
| Word shapes of the R5 and guard rows | byte-identical before and after (the shapes quoted in the TDD steps were read from the prototype) |
| `node --test test/guards/*.test.js` in engine, all existing tests | 1347 / 1347 pass: no existing row changes verdict |
| Part 3 applied, default census (seed 20260, 400) | 42 / 42 pass |
| Part 3 applied without the `quotedBodyTags` change, `GUARD_FUZZ_COUNT=1500`, batch 11,22,33,44,55 | 2 fail at seed 44, both shells: `parsed:false …` and `unexpected false block …` on `bash -c 'cat <<"EOF388"⏎let '\''a[$(git push origin)]'\''⏎EOF388'`. A quoted heredoc drops the inner tags, and the outer `bash -c` word trips the A2 rule (an accepted false block, design "Accepted false blocks") |
| Part 3 applied in full, `GUARD_FUZZ_COUNT=1500`, all four batches, both shells | 54 / 54 pass per batch, 0 skipped (without Part 3's two new pin `it`s, so 56 after) |
| Pinned seeds × 1500: commands holding `a[$(git push origin)]` | 204; untagged: 11 without the `quotedBodyTags` change, 0 with it |

Census fragments, probed in a `mktemp -d` dir with a stub `git` (protocol below), each as
`bash <file>`:

| Fragment | 3.2.57 | 5.3.20 |
|---|---|---|
| `let 'a[$(git push origin)]'` | runs git, exit 1, stderr empty | runs git, exit 1, stderr empty |
| `[[ 'a[$(git push origin)]' -eq 0 ]]` | runs, exit 0, empty | runs, exit 0, empty |
| `x='a[$(git push origin)]'; echo $(( x ))` | runs, exit 0, empty | runs, exit 0, empty |
| `(( '$(git push origin)' ))` | not run, exit 1, `syntax error` | runs, exit 1, `arithmetic syntax error` |
| `echo ${a['$(git push origin)']}` | not run, exit 1, `syntax error` | runs, exit 1, `arithmetic syntax error` |
| `x=abc; echo ${x:'$(git push origin)'}` | runs, exit 1, `syntax error` | runs, exit 1, `arithmetic syntax error` |
| `let 'a[1]+$(git push origin)'` | not run, exit 1, `syntax error` | not run, exit 1, `arithmetic syntax error` |

`let` exits 1 when its value is 0, so that fragment carries `status: 1`.

### Probe protocol (every probe an implementer, reviewer or triager runs)

A probe never runs a real git. Run it in a throwaway dir, never the worktree:

```bash
T=$(mktemp -d); mkdir "$T/bin"
printf '#!/bin/sh\necho "GIT: $*" >> "%s/marker"\n' "$T" > "$T/bin/git"; chmod +x "$T/bin/git"
printf '%s\n' "<command>" > "$T/s.sh"
for sh in /bin/bash <brew-prefix>/bin/bash; do
  rm -f "$T/marker"
  PATH="$T/bin:/usr/bin:/bin" nice -n 19 "$sh" "$T/s.sh"; echo "exit=$?"
  cat "$T/marker" 2>/dev/null
done
rm -rf "$T"
```

The stub appends its argv to a benign marker file and does nothing else. **runs** means the marker
holds the git argv. `/bin/bash` is 3.2.57 and `<brew-prefix>/bin/bash` is 5.3.20 on this machine.
Hand this protocol to any reviewer or triager brief that probes these rows.

## Public-surface decision

No new exported symbol. Every new name is module-private.

- Tokeniser: `SUBSTITUTION_OPENER`, `UNCLOSED_SUBSCRIPT`, `QUOTED_ARITHMETIC_SUBSTITUTION`,
  `inArithmeticReach`, `ANSI_C_ESCAPE`, `OPENER_CODES`, `escapedCode`, `escapesToOpener`,
  `ansiCOpensSubstitution`, `findUnescaped` (the renamed `findBacktickEnd`),
  `LITERAL_OPENER_CHAR`, `LITERAL_SUBSCRIPT_SUBSTITUTION`, `SUBSCRIPT_IN_STRING`,
  `holdsSubscriptSubstitution`, `resetWordFlags`, and the context fields `literalOpener` and
  `escapedOpener`. `parseShellCommands(command)` keeps its signature and its `ParseResult` shape.
  `escapesToOpener` stays private. Its boundaries are pinned through `parseShellCommands` rows
  (`(( $'<escape>' ))`), so no test reaches into the module.
- The two new reasons reach users only as a deny reason through the predicates, like
  `ARITHMETIC_SINGLE_QUOTE`. The one doc surface that lists the unparseable constructs is
  docs/contributing/specs/gate.md L67–71; Part 4 extends it.
- Harness: three new `TAGS` keys and seven fragments in module-private arrays. The exports keep
  their names; `TAGS`, `FALSE_BLOCK_TAGS`, `SYNTAX_EXEMPT_TAGS` and `PARSE_FAILURE_TAGS` are
  already exported and grow.
- Bindings: no binding code changes. Every binding that reaches the tokeniser does so through
  `gitDestructivePredicate` / `gitExtDiffPredicate`, which block on `parsed:false`
  (engine/src/guards/shell-git-invocations.js, `judgeParsed`). codex and copilot also run the
  plain-command gate (engine/src/guards/git-plain-command-gate.js). It already blocks rows 44–57
  and is unchanged.

## Decision candidates

ADR-694 to ADR-697 settle the rules. The plan meets four implementation choices that the design
left open or got wrong. Each part below is written to the recommendation. If the user picks
otherwise, the named part changes as the last column says.

| # | Choice | Alternatives (≤3) | Recommendation | Why / what changes otherwise |
|---|---|---|---|---|
| P1 | How `readAnsiC` gets the raw span for the A1 check | **A.** Pre-scan for the closing `'` before the char loop, through `findUnescaped(source, from, closer)`. This generalises the existing `findBacktickEnd(source, from)`, which `enterBacktick` keeps using. The check then runs before the append, as in `onSingleQuote`. **B.** Snapshot `inArithmeticReach` at entry, then check at the closing quote inside the loop. | **A** | One rule shape at both call sites (check, then append). It reuses the existing escape-aware scanner and passes no boolean parameter. B passes the snapshot as a boolean flag, a smell the house rules refuse. Under B, Part 1's GREEN 2 sketch changes and `findBacktickEnd` stays as it is. |
| P2 | `escapesToOpener` visibility | **A.** Module-private, with boundaries pinned through `(( $'<escape>' ))` parse rows. **B.** Exported and unit-tested directly. | **A** | No new public surface. Every boundary is reachable through `parseShellCommands`, and the decoder's kill rows sit beside the rule they serve. Under B, the tokeniser gains a second export and Part 1 adds a direct `escapesToOpener` describe. |
| P3 | Census tags for the three composable fragments | **A.** One tag, `literal-subscript-substitution`, in `PARSE_FAILURE_TAGS` and `FALSE_BLOCK_TAGS`. `quotedBodyTags` keeps it through a quoted heredoc. **B.** The design's text: no tag. **C.** Keep the fragments out of the heredoc composer. | **A** | Measured. Untagged (B), every composed run reports `parsed:false on a command that is not unterminated or over-nested`, because the tokeniser now fails closed on them. A quoted heredoc body inside `bash -c '…'` also reports an untagged false block (seed 44, 1500, both shells). C needs a new composer filter and drops coverage. |
| P4 | Keep `let` fragments out of `sh -c` | **A.** Add `\blet\b` to `BASHISMS` only. `[[` and `((` (which matches `$((`) are already there, and the four single-quoted arithmetic fragments are standalone, so they are never nested. **B.** The design's text: add `\blet\b`, `\w\[` and `\$\{\w+:`. | **A** | B's `\w\[` also matches the existing `git pus[h] origin` and `gi[t] push` specials. It would drop their `sh -c` forms and shift the generated corpus of every seed for no new coverage. dash has no `let`, so A is the one alternation the composable fragments need. Under B, Part 3's BASHISMS line takes three alternations. |

## Validation-phase notes

- Stryker: runner `tap` (engine/stryker.conf.json). One module: `engine/src/guards/shell-tokeniser.js`.
  Pass its touched hunks in ONE comma-joined `--mutate` value (`file:L1-L2,file:L3-L4`). Repeated
  `--mutate` flags drop all but the last. The hunks are the new constants and predicates,
  `createContext`, `endWord` and `resetWordFlags`, `onBackslash`, `onSingleQuote`, `readAnsiC`,
  `findUnescaped` and `enterBacktick`. Check that the instrumented mutant count is at least the
  number of hunks. Use `concurrency: 1` under `nice -n 19`. If the dry run dies, narrow the corpus
  with an override config whose `tap.testFiles` lists engine/test/guards/shell-tokeniser.test.js,
  engine/test/guards/git-destructive-predicate.test.js,
  engine/test/guards/git-ext-diff-predicate.test.js and
  engine/test/guards/shell-git-invocations.test.js. Hand-check every survivor against that full
  set on a temp-copy mutant before writing a test.
- Expected kills:
  - the `arithmeticFloor` disjunct (row 45);
  - the `parameter` disjunct (row 51);
  - `UNCLOSED_SUBSCRIPT` (row 49 asserts the A1 reason);
  - each `SUBSTITUTION_OPENER` alternative (45 backtick, 45, 67);
  - `escapesToOpener` forced false (row 72, the `(( $'\x24' ))` row);
  - each `ANSI_C_ESCAPE` branch (`\x24`, `\u24`, `\U00000024`, `\44`);
  - the `c[\s\S]` and `[\s\S]` consumers (`\c\x24`, `\\x24`);
  - `OPENER_CODES` members (`\x24`, `\x60`);
  - the radix constants (`\44` vs `\x24`);
  - each `literalOpener` set site: row 55 (`onSingleQuote`), row 82 (`onBackslash`), the
    `$'a[$(…)]'` spelling of row 83 (`readAnsiC`);
  - `escapedOpener` set (row 83's `\x24` spelling);
  - `resetWordFlags` dropped or partial (`echo '$' a[$(echo 1)]`, `echo $'\x24' a[1]`);
  - `LITERAL_SUBSCRIPT_SUBSTITUTION` alternatives (rows 55, 84 backtick, 84 `${`);
  - `includes(OPEN_BRACKET)` forced either way (`let $'a[\x24]'`, `echo $'\x24' a[1]`).
- Likely equivalent: an `index <= length` loop bound in `findUnescaped`. The existing comment on
  `findBacktickEnd` carries over. Verify it on a temp copy before keeping the comment. Do not
  pre-write any other `equivalent mutant` comment.
- The harness (engine/test-helpers) and `*.differential.test.js` are outside Stryker's scope.
- **Phase-boundary fuzz gate** (R6). Part 3 runs it from the worktree root. Each batch must
  report `# fail 0` and `# skipped 0` (56 tests per batch after Part 3). Part 4 changes no code,
  so Part 3's run is the phase evidence. Rerun all four batches at the phase boundary only if
  code or the harness changed after Part 3 (a review fix included). A skip means
  `<brew-prefix>/bin` is not on `PATH` and the second-bash arm did not run, so fix `PATH` and rerun:

  ```bash
  for batch in 101,202,303,404,505 11,22,33,44,55 66,77,88,99,111 271828,314159,161803,141421,173205; do
    (cd engine && GUARD_FUZZ_COUNT=1500 GUARD_FUZZ_SEEDS=$batch nice -n 19 node --test test/guards/shell-git-invocations.differential.test.js) > "<tmp>/fuzz-$batch.out" 2>&1
    echo "$batch"; grep '^# \(tests\|pass\|fail\|skipped\)' "<tmp>/fuzz-$batch.out"
  done
  ```

## Part 1 — A quoted substitution opener in an arithmetic reach fails closed

### Context

Files this part edits:

- `engine/src/guards/shell-tokeniser.js`
- `engine/test/guards/shell-tokeniser.test.js`
- `engine/test/guards/git-destructive-predicate.test.js`
- `engine/test/guards/git-ext-diff-predicate.test.js`

**Tokeniser today** (engine/src/guards/shell-tokeniser.js, line numbers at `255cc5c`, unchanged
since `66c1684`):

- L21 `BACKTICK = '`'`, L22 `DOLLAR = '$'`, L25 `OPEN_BRACKET = '['`, L14 `SINGLE_QUOTE`.
- L188 `NO_ARITHMETIC = -1`. L190 `createContext(source, depth)` returns a fresh context with
  `parameter: false`, `arithmeticFloor: NO_ARITHMETIC`, `piece: null` and `failure: null`.
- L218 `append(context, text)`: `context.piece = (context.piece ?? '') + text`.
- L292 `fail(context, reason)`: `context.failure ??= reason` (the first reason wins). The
  `parseShellCommands` step loop (L831) and `runBody` stop at the first failure.
- L371 `onSingleQuote(context)`:
  ```js
  const close = context.source.indexOf(SINGLE_QUOTE, context.index + 1);
  if (close === -1) return fail(context, UNTERMINATED_QUOTE);
  append(context, context.source.slice(context.index + 1, close));
  context.index = close + 1;
  ```
- L403–415 `readAnsiC(context)`, the `$'…'` reader, with its `// equivalent mutant (EqualityOperator …)`
  comment on L403. It runs `append(context, '')`, then `index += 2`, then a char loop. The loop
  returns at the closing `'` after `index += 1`. Otherwise it calls `onBackslashOrLiteral` (L418),
  and `onEscapedChar` (L423) appends the char after `\` and marks the word `dynamic` + `opaque`.
  The loop falls through to `fail(context, UNTERMINATED_QUOTE)`. It never decodes `\x24`.
  `onDollar` (L631) routes `$'` here. Inside `"…"`, `onDoubleQuotedDollar` reads `$'` as a
  literal, so a double-quoted `$'` never reaches it.
- L472–479 `findBacktickEnd(source, from)` (L473) with its L472 `// equivalent mutant (EqualityOperator index <= source.length): source[source.length] is undefined, neither a backslash nor a backtick, so the result is still -1`
  comment. It skips the char after `\` and returns the index of the closing backtick, or `-1`.
  `enterBacktick` (L481) calls `findBacktickEnd(context.source, start + 1)`.
- L432 `PARAMETER` descriptor (`parameter: true`, `settle: endWord`). `enterConstruct` (L455) sets
  `child.parameter = parameter`, so every `${ … }` body, inside `"…"` too, steps
  `CHAR_HANDLERS` in a child with `context.parameter === true`. A `'` there reaches `onSingleQuote`.
- L776 `onOpenParen`: an adjacent `((` sets `arithmeticFloor = parens - 1`, both for the command
  form and for `for ((`. L783 `onCloseParen` clears it. In `(( '$(…)' ))` the `'` reaches
  `onSingleQuote` with `arithmeticFloor === 0`.
- `a[…]=1` is NOT an assignment (`ASSIGNMENT`, L36, is `^[A-Za-z_][A-Za-z0-9_]*=`). It is a
  command word whose piece is `a[` when the `'` arrives, and `onGlob` (L316) appended the `[`.
  `declare a['…']=1` reaches the same state.
- L497 `ARITHMETIC_SINGLE_QUOTE`: the `$(( ))` / `$[ ]` scanner already refuses every `'`. Row 53
  keeps that reason. Do not touch `ARITHMETIC_HANDLERS` or `scanArithmeticBody`.

**What to add** (place the block directly above `onBackslash`, L364; constants follow the file's
style; the comment says why):

```js
const SUBSTITUTION_OPENER = /\$\(|\$\{|`/;
const UNCLOSED_SUBSCRIPT = /\[[^\]]*$/;
const QUOTED_ARITHMETIC_SUBSTITUTION =
  "craft: command not parseable (a quoted $( ), ` or ${ } inside (( )), a subscript or ${ } — bash may still run it) — denied fail-closed";

// (( )), for (( )), any ${ } body and an open [ subscript: bash expands quoted text there again (5.3 everywhere, 3.2 in some).
const inArithmeticReach = context =>
  context.arithmeticFloor !== NO_ARITHMETIC || context.parameter || UNCLOSED_SUBSCRIPT.test(context.piece ?? '');

// A $'…' numeric escape decodes before bash evaluates the text, so \x24 or \140 is a live $ or backtick there.
const ANSI_C_ESCAPE = /\\(?:x([0-9A-Fa-f]{1,2})|u([0-9A-Fa-f]{1,4})|U([0-9A-Fa-f]{1,8})|([0-7]{1,3})|c[\s\S]|[\s\S])/g;
const HEX_RADIX = 16;
const OCTAL_RADIX = 8;
const OPENER_CODES = new Set([DOLLAR.codePointAt(0), BACKTICK.codePointAt(0)]);
const escapedCode = ([, hex, short, long, octal]) =>
  octal === undefined ? Number.parseInt(hex ?? short ?? long, HEX_RADIX) : Number.parseInt(octal, OCTAL_RADIX);
const escapesToOpener = span => [...span.matchAll(ANSI_C_ESCAPE)].some(match => OPENER_CODES.has(escapedCode(match)));
const ansiCOpensSubstitution = span => SUBSTITUTION_OPENER.test(span) || escapesToOpener(span);
```

`c[\s\S]` consumes the control-char operand, and the lone `[\s\S]` consumes any other escaped
char. So `\c\x24` and `\\x24` are not decoded, which matches bash. A non-numeric escape has no
group, `parseInt(undefined)` is `NaN`, and `NaN` is not an opener code.

**Test helpers** (engine/test/guards/shell-tokeniser.test.js):

- L5 `dyn(text)` → `{ text, dynamic: true }`. L6 `word(text)`. L377 `patternWord(text)` →
  `{ text, dynamic: true, pattern: true }`. There is no module-level opaque-word helper (L331's
  `escaped` is local to its describe), so add `const opaqueWord = text => ({ text, dynamic: true, opaque: true });`.
- L128 `assertParsesWords(rows)`: each row is `[input, expectedCommands]`, a command is an array
  of strings or word objects, and it asserts `deepEqual(result, { parsed: true, commands })`.
- L379 `assertFails(rows)`: each row is `[input, reason]`, and it asserts
  `deepEqual(result, { parsed: false, reason })`.
- L618 `ARITHMETIC_SINGLE_QUOTE` and L620 `PUSH = ['git', 'push', '-f', 'origin']` already exist.
  The file ends at L825 (`describe('parseShellCommands() — bash 5.3 function substitutions are refused', …)`).
  Append the new constants and describes after it.

**Predicate suites:** in engine/test/guards/git-destructive-predicate.test.js, `assertBlocks`
(L289) and `assertPasses` (L301) check `result.block`. Add the new describe right after
`describe('gitDestructivePredicate() — dollar-bracket arithmetic', …)` (L386–390). In
engine/test/guards/git-ext-diff-predicate.test.js, `assertBlocks` is at L361. Add the new
describe right after `describe('gitExtDiffPredicate() — substitutions inside arithmetic expansion', …)`
(L377–379).

`G` below stands for `git push -f origin` and is written out in full in every test string.

### TDD steps

**Cycle 1: a `'…'` span in a reach.**

1. RED, tokeniser, new `describe('parseShellCommands() — a quoted substitution inside an arithmetic reach', …)`,
   `assertFails` with `QUOTED_ARITHMETIC_SUBSTITUTION` on these rows. Each fails today because
   `onSingleQuote` appends the span as a literal and the parse returns `{ parsed: true, … }`:
   - row 45: `"(( '$(git push -f origin)' ))"` and ``"(( '`git push -f origin`' ))"``
   - row 47: `"for (( i='$(git push -f origin)'; i<1; i++ )); do :; done"`
   - row 49: `"a['$(git push -f origin)']=1"`
   - row 51: `"x=abc; echo ${x:'$(git push -f origin)'}"`
   - row 52: `"echo ${a['$(git push -f origin)']}"`
   - row 61: `'echo "${a[\'$(git push -f origin)\']}"'`
   - row 62: `"x=abc; echo ${x:1:'$(git push -f origin)'}"`
   - row 63: `"x=abc; echo ${x: -'$(git push -f origin)'}"`
   - row 64: `"echo ${@:'$(git push -f origin)'}"`
   - row 65: `"a['$(git push -f origin)']+=1"`, `"x=(); x['$(git push -f origin)']=1"`
   - row 66: `"(( a['$(git push -f origin)'] ))"`
   - row 67: `"(( '${ git push -f origin; }' ))"`, `"(( '${x:-$(git push -f origin)}' ))"`
   - row 68: ``"a['`git push -f origin`']=1"``
   - row 73: `"declare a['$(git push -f origin)']=1"`
   - row 77 (accepted false block): `"declare -A m; m['$(git push -f origin)']=1"`,
     `"declare -A m; echo ${m['$(git push -f origin)']}"`
   - row 79 (accepted false block): `"echo ${x:-'$(git push -f origin)'}"`,
     `"echo ${x:='$(git push -f origin)'}"`, `"echo ${x/'$(git push -f origin)'/y}"`,
     `"echo ${x::'$(git push -f origin)'}"`, `"echo ${#a['$(git push -f origin)']}"`
   - row 80, first spelling (accepted false block): `'echo "${x:\'$(git push -f origin)\'}"'`
   - row 108: `"(( '$(git diff HEAD)' ))"`

   Field kills, already in the list: row 45 dies if the `arithmeticFloor` disjunct goes, row 51 if
   the `parameter` disjunct goes, row 49 if `UNCLOSED_SUBSCRIPT` goes. Without that last one, the
   word reaches Part 2's rule later, so the reason asserted here pins A1.
2. RED, git-destructive-predicate.test.js, new `describe('gitDestructivePredicate() — a quoted substitution in an arithmetic reach', …)`,
   `assertBlocks` rows 45 (both spellings), 47, 49, 51, 52. Each returns `block: false` today.
3. GUARD, same describe, `assertBlocks` rows 46 `'for (( i=$(git push -f origin); i<1; i++ )); do :; done'`,
   48 `'a[$(git push -f origin)]=1'`, 50 `'x=abc; echo ${x:$(git push -f origin)}'`, 44
   `'(( $(git push -f origin) ))'` and 53 `"echo $(( a['$(git push -f origin)'] ))"`. They block
   today: the unquoted substitution is absorbed, and row 53 hits `ARITHMETIC_SINGLE_QUOTE`.
4. RED, git-ext-diff-predicate.test.js, new `describe('gitExtDiffPredicate() — a quoted substitution in an arithmetic reach', …)`,
   `assertBlocks(["(( '$(git diff HEAD)' ))"])` (row 108). It returns `block: false` today.
5. GREEN: add `SUBSTITUTION_OPENER`, `UNCLOSED_SUBSCRIPT`, `QUOTED_ARITHMETIC_SUBSTITUTION` and
   `inArithmeticReach`. In `onSingleQuote`, bind `const span = context.source.slice(context.index + 1, close);`.
   Then, before the append:
   `if (inArithmeticReach(context) && SUBSTITUTION_OPENER.test(span)) return fail(context, QUOTED_ARITHMETIC_SUBSTITUTION);`.
   Finally `append(context, span)`.
6. GUARD, tokeniser, new `describe('parseShellCommands() — quotes that work in an arithmetic reach keep their shape', …)`,
   `assertParsesWords`. Each passes before and after, because none holds an opener:
   - `["(( '1' + 2 ))", [['1', '+', '2']]]` (row 74)
   - `["a['1']=x", [[patternWord('a[1]=x')]]]` (row 75)
   - `["declare -A m; m['k']=v", [['declare', '-A', 'm'], [patternWord('m[k]=v')]]]` (row 76)
   - `['echo "${m[\'k\']}"', [['echo', dyn("${m['k']}")]]]` (row 76)
   - `["echo ${x:-'default'}", [['echo', dyn("${x:-'default'}")]]]`
   - `["IFS=$'\\n'", []]`
   - `["echo $'\\033[1m'x", [['echo', opaqueWord('033[1mx')]]]`
   - `['echo "${v//$\'\\n\'/ }"', [['echo', dyn("${v//$'\\n'/ }")]]]`
7. GUARD, git-destructive-predicate.test.js, same new describe, `assertPasses`:
   `"(( '1' + 2 )) && git status"`, `"a['1']=x && git status"`,
   `"declare -A m; m['k']=v; [ \"${m['k']}\" = v ] && git status"`,
   `"echo ${x:-'default'} && git status"`, `"IFS=$'\\n' git status"`,
   `"echo $'\\033[1m'x && git status"`. All pass today and after.

**Cycle 2: a `$'…'` span holding a literal opener.**

8. RED, the cycle-1 `assertFails` describe, more rows with `QUOTED_ARITHMETIC_SUBSTITUTION`. Each
   parses today because `readAnsiC` never checks its span:
   - row 69: `"(( $'$(git push -f origin)' ))"`, `"for (( i=$'$(git push -f origin)'; i<1; i++ )); do :; done"`
   - row 70: `"a[$'$(git push -f origin)']=1"`, `"echo ${a[$'$(git push -f origin)']}"`
   - row 71: `"x=abc; echo ${x:$'$(git push -f origin)'}"`
9. GREEN:
   - Rename `findBacktickEnd(source, from)` to `findUnescaped(source, from, closer)`. Compare
     `source[index] === closer`, and update the equivalent-mutant comment's wording to
     "neither a backslash nor the closer".
   - `enterBacktick` calls `findUnescaped(context.source, start + 1, BACKTICK)`.
   - In `readAnsiC`, before `append(context, '')`:
     ```js
     const from = context.index + 2;
     const close = findUnescaped(context.source, from, SINGLE_QUOTE);
     if (close !== -1 && inArithmeticReach(context) && SUBSTITUTION_OPENER.test(context.source.slice(from, close)))
       return fail(context, QUOTED_ARITHMETIC_SUBSTITUTION);
     ```
     An unclosed `$'…` (`close === -1`) falls through to the char loop, which fails with
     `UNTERMINATED_QUOTE` as today. Keep the L403 comment on the loop.
10. GUARD: the existing backtick rows in the tokeniser suite (`parseShellCommands() — backtick and process substitution`,
    L152, and the backtick rows of L623) stay green, which proves the rename.

**Cycle 3: a numeric escape that decodes to an opener.**

11. RED, same `assertFails` describe, `QUOTED_ARITHMETIC_SUBSTITUTION`. Each parses today because
    the span holds no literal opener:
    - row 72: `"(( $'\\x24(git push -f origin)' ))"`, `"a[$'\\x24(git push -f origin)']=1"`
    - the decoder's true boundaries, one row each in the form `"(( $'<escape>' ))"`: `\\x24`,
      `\\x60`, `\\44`, `\\044`, `\\140`, `\\u24`, `\\U00000024`, `\\x245`
12. GREEN: add `ANSI_C_ESCAPE`, `HEX_RADIX`, `OCTAL_RADIX`, `OPENER_CODES`, `escapedCode`,
    `escapesToOpener` and `ansiCOpensSubstitution`. In `readAnsiC`'s pre-check, replace
    `SUBSTITUTION_OPENER.test(…)` with `ansiCOpensSubstitution(…)`.
13. GUARD, new `describe('parseShellCommands() — ANSI-C escapes that decode to no opener', …)`,
    `assertParsesWords`. Each parses before and after. The shapes are the prototype's:
    - `["(( $'\\x2' ))", [[opaqueWord('x2')]]]`
    - `["(( $'\\0044' ))", [[opaqueWord('0044')]]]` (octal takes 3 digits: `\004`, then `4`)
    - `["(( $'\\033' ))", [[opaqueWord('033')]]]`
    - `["(( $'\\n' ))", [[opaqueWord('n')]]]`
    - `["(( $'\\e' ))", [[opaqueWord('e')]]]`
    - `["(( $'\\c$' ))", [[opaqueWord('c$')]]]`
    - `["(( $'\\\\x24' ))", [[opaqueWord('\\x24')]]]` (an escaped backslash, then text)
    - `["(( $'\\c\\x24' ))", [[opaqueWord('cx24')]]]` (`\c` consumes the backslash)

**REFACTOR.** Check `readAnsiC`. If the pre-check pushes it past 20 lines, extract
`failsOnQuotedOpener(context, span)` (check + `fail`, no return value used) or a similar
query/command split. No nesting deeper than 2, no magic values, no provenance refs. The
only comments are the two why-comments above. Re-run the gate.

### Gate

`nice -n 19 bash scripts/ci.sh > <tmp>/ci-part1.out 2>&1; echo "exit=$?"; tail -30 <tmp>/ci-part1.out`

While iterating, run the four suites only:
`(cd engine && nice -n 19 node --test test/guards/shell-tokeniser.test.js test/guards/git-destructive-predicate.test.js test/guards/git-ext-diff-predicate.test.js) > <tmp>/p1.out 2>&1`.
Then read the `# tests` / `# pass` / `# fail` lines and any `not ok` line. Never commit on red.
If an existing row changes verdict, stop and hand back with the blocker protocol
({ unit, reason, ≤3 options }). The prototype measured none.

### Commit

`fix(guards): fail closed on a quoted substitution opener inside an arithmetic reach`

Stage the four files above by explicit path (`/usr/bin/git add <paths>`), no `-a`.

## Part 2 — A word holding a literal subscript substitution fails closed

### Context

Files this part edits:

- `engine/src/guards/shell-tokeniser.js`
- `engine/test/guards/shell-tokeniser.test.js`
- `engine/test/guards/git-destructive-predicate.test.js`
- `engine/test/guards/git-ext-diff-predicate.test.js`

**State after Part 1** (read it in place, the line numbers drift by ~+30):
`SUBSTITUTION_OPENER`, `inArithmeticReach`, `QUOTED_ARITHMETIC_SUBSTITUTION`, `escapesToOpener`
and `ansiCOpensSubstitution` sit above `onBackslash`. `onSingleQuote` binds `span` and checks A1
before `append(context, span)`. `readAnsiC` pre-scans with
`findUnescaped(context.source, from, SINGLE_QUOTE)` and checks A1 on the raw span before the
char loop.

**Tokeniser sites this part touches:**

- `createContext(source, depth)` (L190 at `255cc5c`): add `literalOpener: false` and
  `escapedOpener: false` next to `pattern: false`.
- `endWord(context)` (L238). Today it is 19 lines:
  ```js
  if (context.piece === null) return;
  const literal = LITERAL_OPERATORS.has(context.piece);
  const word = { text: context.piece, dynamic: context.dynamic && !literal, ...(context.opaque && { opaque: true }), ...(context.pattern && !literal && { pattern: true }) };
  context.piece = null; context.dynamic = false; context.opaque = false; context.pattern = false;
  if (context.redirecting) { context.redirecting = false; return; }
  pushWord(context, word);
  ```
  It is also `PARAMETER.settle`, so it ends every `${ }` body. `breakCommand` calls it, which
  covers every `$( )` / backtick child and every `bash -c` / `eval` string re-parsed by
  `parseNested`. A failure set in a child propagates through `enterConstruct` / `enterBacktick`
  / `reparse`.
- `onBackslash(context)` (L364): `next = source[index + 1]`; `undefined` → `onLiteral`; appends
  `next` unless it is a newline; `index += 2`. `consumeDoubleQuoted` (L378) routes `\$`, ``\` ``,
  `\"` and `\\` inside `"…"` here, so it is the single site for an escaped `$` or backtick.
- `onSingleQuote` and `readAnsiC` as Part 1 left them.
- `OPEN_BRACKET` (L25) already exists.

**What to add:**

```js
const LITERAL_OPENER_CHAR = /[$`]/;
const LITERAL_SUBSCRIPT_SUBSTITUTION = /\[[\s\S]*(?:\$\(|\$\{|`)/;
const SUBSCRIPT_IN_STRING =
  "craft: command not parseable (a word holding a quoted [ … $( ) — bash may evaluate it as arithmetic and run it) — denied fail-closed";

const holdsSubscriptSubstitution = context =>
  (context.literalOpener && LITERAL_SUBSCRIPT_SUBSTITUTION.test(context.piece)) ||
  (context.escapedOpener && context.piece.includes(OPEN_BRACKET));
```

The regex does not pair brackets on purpose: row 109 (`a[b[1]+$(…)]`) runs git. Add one why-comment
on `LITERAL_SUBSCRIPT_SUBSTITUTION`, for example "bash evaluates a subscript in a string as
arithmetic wherever the string is read, and a ] before the opener can close a nested subscript".

**Test helpers:** as in Part 1 (`assertFails` L379, `assertParsesWords` L128, `dyn`, `patternWord`,
and `opaqueWord`, which Part 1 added). Add the new describes at the end of the file. Predicate
suites: append to the describes Part 1 added, or add
`describe('gitDestructivePredicate() — a quoted subscript substitution in a word', …)` and
`describe('gitExtDiffPredicate() — a quoted subscript substitution in a word', …)` right after
them.

### TDD steps

**Cycle 1: a `'…'` span holding `$` or a backtick, checked at word end.**

1. RED, tokeniser, new `describe('parseShellCommands() — a quoted subscript substitution in a word', …)`,
   `assertFails` with `SUBSCRIPT_IN_STRING`. Each parses today, since nothing reads a quoted
   literal's text:
   - row 55: `"let 'a[$(git push -f origin)]'"`
   - row 56: `"[[ 'a[$(git push -f origin)]' -eq 0 ]]"`
   - row 57: `"x='a[$(git push -f origin)]'; echo $(( x ))"`
   - row 84: `"let 'x=a[$(git push -f origin)]'"`, ``"let 'a[`git push -f origin`]'"``,
     `"let 'a[${x:-$(git push -f origin)}]'"`
   - row 86: `"[[ 0 -lt 'a[$(git push -f origin)]' ]]"`
   - row 87, both spellings, which pin the word key against grammar position:
     `"[[ 1 -eq 1 && 'a[$(git push -f origin)]' -eq 0 ]]"`, `"[[ ( 'a[$(git push -f origin)]' -eq 0 ) ]]"`
   - row 89: `"declare -i x='a[$(git push -f origin)]'"`
   - row 94: `"x='a[$(git push -f origin)]'; (( x ))"`, `"x='a[$(git push -f origin)]'; [[ $x -eq 0 ]]"`,
     `"x='a[$(git push -f origin)]'; let x"`, `"x='a[$(git push -f origin)]'; echo ${y[x]}"`,
     `"x='a[$(git push -f origin)]'; echo $(( $x ))"`
   - row 97: `"x=$(printf '%s' 'a[$(git push -f origin)]'); echo $(( x ))"`,
     `"read x <<< 'a[$(git push -f origin)]'; echo $(( x ))"`
   - row 98: `"printf 'a[$(git push -f origin)]' > v; x=$(cat v); echo $(( x ))"`
   - row 99: `"X='a[$(git push -f origin)]' bash -c 'echo $(( X ))'"`
   - row 100: `"f() { echo $(( $1 )); }; f 'a[$(git push -f origin)]'"`
   - row 107: `"let 'a[$(git diff HEAD)]'"`
   - row 109: `"let 'a[b[1]+$(git push -f origin)]'"`
   - accepted false blocks, which run nothing (or run a working awk), pinned so a narrowing is
     a visible change:
     - row 80, second spelling: `"a[1]='$(git push -f origin)'"`
     - row 91: `"[ 'a[$(git push -f origin)]' -eq 0 ]"`, `"test 'a[$(git push -f origin)]' -eq 0"`,
       `"[[ 'a[$(git push -f origin)]' == 0 ]]"`
     - row 92: `"let 'a[1]+$(git push -f origin)'"`,
       `"let '1+$(git push -f origin)' 'a[$(git push -f origin)]'"`
     - row 103: `"x='a[$(git push -f origin)]'; echo \"$x\""`
     - row 110: `"awk '{ a[$1] = $(NF) } END { print 1 }' </dev/null && git push -f origin"`
2. RED, git-destructive-predicate.test.js, `assertBlocks` on rows 55, 56, 57, 87 (both spellings)
   and 89 (strings as above). Each returns `block: false` today.
3. RED, git-ext-diff-predicate.test.js, `assertBlocks(["let 'a[$(git diff HEAD)]'"])` (row 107).
   It returns `block: false` today.
4. GREEN:
   - add the two fields to `createContext`, plus `LITERAL_OPENER_CHAR`,
     `LITERAL_SUBSCRIPT_SUBSTITUTION`, `SUBSCRIPT_IN_STRING` and `holdsSubscriptSubstitution`;
   - in `onSingleQuote`, after the A1 check and before the append:
     `context.literalOpener ||= LITERAL_OPENER_CHAR.test(span);`;
   - in `endWord`, right after the `piece === null` early return:
     `if (holdsSubscriptSubstitution(context)) return fail(context, SUBSCRIPT_IN_STRING);`;
   - extract `resetWordFlags(context)`, which sets `dynamic`, `opaque`, `pattern`,
     `literalOpener` and `escapedOpener` to `false`, and call it where `endWord` resets today.
     This keeps `endWord` under 20 lines.
5. GUARD, tokeniser, new `describe('parseShellCommands() — subscripts and openers that do not form a literal subscript substitution', …)`,
   `assertParsesWords`. Each passes before and after:
   - row 54, shape unchanged (R3):
     `["let '1+$(git push -f origin)'", [['let', '1+$(git push -f origin)']]]`
   - a real expansion, where `[` comes from a quote and `$(` from a live substitution:
     `["echo 'a['\"$(echo 1)\"']'", [['echo', '1'], ['echo', dyn('a[$(echo 1)]')]]]`
   - the reset kill: `["echo '$' a[$(echo 1)]", [['echo', '1'], ['echo', '$', patternWord('a[$(echo 1)]')]]]`
   - the residual rows 101 and 102 stay parsed (ADR-696). Pin 101's shape:
     `["printf -v x 'a[%s]' '$(git push -f origin)'; echo $(( x ))", [['printf', '-v', 'x', 'a[%s]', '$(git push -f origin)'], ['echo', dyn('$(( x ))')]]]`
6. GUARD, git-destructive-predicate.test.js, `assertPasses`: `"let '1+$(git push -f origin)'"`
   (row 54, R3) and `"echo 'a['\"$(echo 1)\"']' && git status"`.

**Cycle 2: an escaped `\$` or ``\` ``.**

7. RED, the cycle-1 `assertFails` describe, `SUBSCRIPT_IN_STRING`. Each still parses after
   cycle 1, because `onBackslash` sets no flag:
   - row 82: `'let "a[\\$(git push -f origin)]"'`, ``'let "a[\\`git push -f origin\\`]"'``
   - row 85: `'let a[\\$\\(git\\ push\\ -f\\ origin\\)]'`, `'let a\\[\\$\\(git\\ push\\ -f\\ origin\\)\\]'`
   - row 88: `'[[ "a[\\$(git push -f origin)]" -eq 0 ]]'`, `'[[ a[\\$\\(git\\ push\\ -f\\ origin\\)] -eq 0 ]]'`
   - row 95, first spelling: `'x="a[\\$(git push -f origin)]"; echo $(( x ))'`
   - row 96: `'x=a[\\$\\(git\\ push\\ -f\\ origin\\)]; echo $(( x ))'`,
     `'x=a\\[\\$\\(git\\ push\\ -f\\ origin\\)\\]; echo $(( x ))'`
8. GREEN: in `onBackslash`, after the append:
   `context.literalOpener ||= next === DOLLAR || next === BACKTICK;`.
9. GUARD: the existing `parseShellCommands() — escapes and dollars` (L512) and
   `arithmetic expansion bodies bash does not run as commands` (L654) rows stay green.
   `echo $(( \\$(git push -f origin) ))` is scanned by the arithmetic scanner's `skipEscaped`,
   not by `onBackslash`, and its word holds no `[`.

**Cycle 3: a `$'…'` span holding a literal `$` or backtick.**

10. RED, same describe, `SUBSCRIPT_IN_STRING`: row 83, first spelling,
    `"let $'a[$(git push -f origin)]'"`. It parses, because `readAnsiC` sets no flag.
11. GREEN: in `readAnsiC`'s pre-check, once `close !== -1` and the A1 check has passed, bind
    `const span = context.source.slice(from, close);` once and set
    `context.literalOpener ||= LITERAL_OPENER_CHAR.test(span);`.

**Cycle 4: a `$'…'` numeric escape that decodes to an opener.**

12. RED, same describe, `SUBSCRIPT_IN_STRING`. Each parses: the raw span holds no `$`, and nothing
    reads the decoded value at word end.
    - row 83, second spelling: `"let $'a[\\x24(git push -f origin)]'"`
    - row 95, second spelling: `"x=$'a[\\x24(git push -f origin)]'; echo $(( x ))"`
    - row 104: `"let $'a[\\44(git push -f origin)]'"`, ``"let $'a[\\x60git push -f origin\\x60]'"``,
      ``"let $'a[\\140git push -f origin\\140]'"``, `"let $'a[\\x24\\x28git push -f origin)]'"`
    - row 105: `"let $'a[\\u24(git push -f origin)]'"`, `"let $'a[\\U00000024(git push -f origin)]'"`
    - `"let $'a[\\x24]'"`, the `includes(OPEN_BRACKET)` branch with no `(` after the escape
13. GREEN: next to the cycle-3 line, `context.escapedOpener ||= escapesToOpener(span);`.
14. GUARD, the cycle-1 GUARD describe, `assertParsesWords`. Each passes before and after:
    - row 106: `["let $'a[\\0044(git push -f origin)]'", [['let', opaqueWord('a[0044(git push -f origin)]')]]]`
    - `["let $'a[\\x2]'", [['let', opaqueWord('a[x2]')]]]`
    - `["let $'a[\\033]'", [['let', opaqueWord('a[033]')]]]`
    - `["let $'a[\\c$]'", [['let', opaqueWord('a[c$]')]]]`
    - the reset kill: `["echo $'\\x24' a[1]", [['echo', opaqueWord('x24'), patternWord('a[1]')]]]`
15. GUARD: every Part 1 row that both rules match (49, 52, 65, 66, 68, 70, 72, 73) still asserts
    `QUOTED_ARITHMETIC_SUBSTITUTION`. A1 fails at span time, before the word ends.

**REFACTOR.** `onSingleQuote`, `readAnsiC` and `endWord` each stay at or under 20 lines with
nesting ≤ 2. If `readAnsiC`'s pre-check grew, move the span work into one helper, for example
`inspectAnsiCSpan(context, span)`, which fails or sets flags and returns nothing. No provenance
refs, no comment that restates the code. Re-run the gate.

### Gate

`nice -n 19 bash scripts/ci.sh > <tmp>/ci-part2.out 2>&1; echo "exit=$?"; tail -30 <tmp>/ci-part2.out`

While iterating, run the same four-suite command as in Part 1, piped to a file. Never commit on
red. The default census (seed 20260) runs inside ci.sh. On the prototype it stayed green with no
harness change, because the generator emits no `[`…opener word. If it reports a new
`parsed:false` or false block, stop and hand back with the blocker protocol.

### Commit

`fix(guards): fail closed on a word holding a literal subscript substitution`

Stage the four files above by explicit path, no `-a`.

## Part 3 — Census the new spellings in the differential fuzz

### Context

Files this part edits (test-infra only, no src delta):

- `engine/test-helpers/git-differential-harness.js`
- `engine/test/guards/shell-git-invocations.differential.test.js`

**Harness today** (engine/test-helpers/git-differential-harness.js, line numbers at `255cc5c`):

- L22–42 `TAGS` (frozen object, camelCase key → kebab string). The last key is
  `caseInSubstitution: 'case-in-substitution'`.
- L43–48 `FALSE_BLOCK_TAGS`. L50 `SYNTAX_EXEMPT_TAGS = [unterminated, quoteInHeredocBody]`.
  L51 `PARSE_FAILURE_TAGS = [unterminated, overNested, opaqueString, arithmeticHeredoc, heredocListInSubstitution, caseInSubstitution]`.
- L73 `fragment(text, { tags, status, simple, lineEnd, keywordLed, list })`.
- L142–216 `SPECIALS` (composable, picked by `generator.compose`). L183 is
  `fragment('echo $((git push origin) )'),`. Insert the composable fragments right after it.
- L218–221 `STANDALONE_SPECIALS` (never composed; bash 3.2 rejects the whole text). L222
  `FIXED_ENTRIES = [...SPECIALS, ...STANDALONE_SPECIALS]`, which `generateCommands` (L334) puts at
  the head of every seed's list.
- L261 `BASHISMS`: the regex that keeps a body out of `sh -c` (dash on Linux CI). It already holds
  `\[\[` and `\(\(`.
- L304 `quotedBodyTags = inner => (SYNTAX_EXEMPT_TAGS.some(tag => inner.tags.includes(tag)) ? [TAGS.quoteInHeredocBody] : [])`.
  The two quoted-heredoc forms of `heredoc()` (L306) use it, and it drops every other inner tag.

**Census suite** (engine/test/guards/shell-git-invocations.differential.test.js):

- L51 `problemsOf(entry, run)` reports these problems:
  - `generator emitted invalid shell`, when stderr matches `/syntax error|unexpected EOF/` and no
    tag is in `SYNTAX_EXEMPT_TAGS`;
  - `parsed:false on a command that is not unterminated or over-nested`, when no tag is in
    `PARSE_FAILURE_TAGS`;
  - `unexpected false block`, when no tag is in `FALSE_BLOCK_TAGS`;
  - `FALSE ALLOW`.
- L219 the "every false-block class and the residual class is reached" test requires every `TAGS`
  value to appear in the corpus. The fixed entries satisfy it for the new tags.
- L272 `PINNED_SEEDS` (15 seeds), L273 `PINNED_COUNT = 1500`, L292 `pinnedCommands()`.
- L312–319 `it('Given any seed, when commands are generated, then the arithmetic-body substitution spellings are fixed entries', …)`
  is the model for the new fixed-entry pin. Add it right after.
- L387–396 `it('… every quoted heredoc around an unterminated special carries the quote-in-heredoc-body tag', …)`
  is the model for the new tag pin. Add it right after.

**Why the tags** (Decision candidate P3, measured):

- the three composable fragments fail closed in the tokeniser, so they need a `PARSE_FAILURE_TAGS`
  tag;
- inside a quoted heredoc nested in `bash -c '…'` they are an accepted false block, so the tag is
  also in `FALSE_BLOCK_TAGS`, and `quotedBodyTags` must keep it;
- the four single-quoted arithmetic fragments print an arithmetic `syntax error` in both shells
  (probe table above), so they are standalone and their tags sit in `SYNTAX_EXEMPT_TAGS`.

### TDD steps

**Cycle 1: the fixed entries.**

1. RED, census suite, new
   `it('Given any seed, when commands are generated, then the quoted arithmetic and subscript substitution spellings are fixed entries', …)`
   on `generateCommands(1, 100)`, expecting all seven texts below. It fails because none is
   generated today.
2. GREEN, harness:
   - `TAGS` gains `literalSubscriptSubstitution: 'literal-subscript-substitution'`,
     `quotedSubstitutionInArithmetic: 'quoted-substitution-in-arithmetic'` and
     `subscriptSubstitutionInString: 'subscript-substitution-in-string'`.
   - `PARSE_FAILURE_TAGS` gains all three. `SYNTAX_EXEMPT_TAGS` and `FALSE_BLOCK_TAGS` gain
     `quotedSubstitutionInArithmetic` and `subscriptSubstitutionInString`.
   - `SPECIALS`, after L183:
     ```js
     fragment("let 'a[$(git push origin)]'", { tags: [TAGS.literalSubscriptSubstitution], status: 1 }),
     fragment("[[ 'a[$(git push origin)]' -eq 0 ]]", { tags: [TAGS.literalSubscriptSubstitution] }),
     fragment("x='a[$(git push origin)]'; echo $(( x ))", { tags: [TAGS.literalSubscriptSubstitution], list: true }),
     ```
   - `STANDALONE_SPECIALS`, after the existing entry:
     ```js
     fragment("(( '$(git push origin)' ))", { tags: [TAGS.quotedSubstitutionInArithmetic], status: 1 }),
     fragment("echo ${a['$(git push origin)']}", { tags: [TAGS.quotedSubstitutionInArithmetic], status: 1 }),
     fragment("x=abc; echo ${x:'$(git push origin)'}", { tags: [TAGS.quotedSubstitutionInArithmetic], status: 1, list: true }),
     fragment("let 'a[1]+$(git push origin)'", { tags: [TAGS.subscriptSubstitutionInString], status: 1 }),
     ```
     Update the comment above `STANDALONE_SPECIALS` so it says why every entry is standalone: bash
     rejects the text, or prints an arithmetic syntax error, which would mask a composed
     neighbour.
   - `BASHISMS` gains a leading `\blet\b|` alternation (dash has no `let`). Extend the comment
     above it with `let`.
   - Growing `SPECIALS` shifts which special each `pick` returns at every seed. That is expected:
     the prototype ran the full census on the shifted corpora.

**Cycle 2: the tag survives a quoted heredoc.**

3. RED, census suite, new
   `it('Given the pinned seeds at scale, when generated, then every command holding a literal subscript special carries the literal-subscript-substitution tag', …)`
   with `const LITERAL_SUBSCRIPT_SPECIAL = /a\[\$\(git push origin\)\]/;` next to the other
   pinned-seed regexes (L274–290). It filters `pinnedCommands()` by the regex, keeps entries
   without the tag, and asserts `[]`. It fails with 11 texts (prototype): `quotedBodyTags` drops
   the tag around a quoted heredoc body.
4. GREEN, harness:
   - `quotedBodyTags` returns `quoteInHeredocBody` as today, plus `literalSubscriptSubstitution`
     when the inner carries it. Keep it one expression, for example two conditional spreads in an
     array literal.
   - `FALSE_BLOCK_TAGS` gains `literalSubscriptSubstitution`. The `bash -c 'cat <<"EOF…"⏎let '\''a[$(…)]'\''⏎EOF…'`
     composition is denied (ADR-695's accepted false-block class) while bash runs nothing.

**REFACTOR.** Keep each array entry on one line, as the file does. No new comment beyond the two
updated why-comments. Re-run the gate.

### Gate

`nice -n 19 bash scripts/ci.sh > <tmp>/ci-part3.out 2>&1; echo "exit=$?"; tail -30 <tmp>/ci-part3.out`

Then run the scaled census, because this part owns it: the phase-boundary fuzz command in
"Validation-phase notes", all four batches, both shell arms. Every batch must report `# fail 0`
and `# skipped 0`. If a batch reports a problem on a composed spelling, read its `::` line in the
output file. Then stop and hand back with the blocker protocol. Never retag to silence a
`FALSE ALLOW`.

### Commit

`test(guards): census the quoted arithmetic and subscript substitution spellings`

Stage the two files above by explicit path, no `-a`.

## Part 4 — Close group A in the backlog and record the residual

### Context

Files this part edits (docs only):

- `BACKLOG.md`
- `docs/contributing/specs/gate.md`

**BACKLOG.md today** (line numbers at `255cc5c`):

- L178 `### Open — A. Git guard rules (local code, runnable)`.
- L180–195: the entry **Refuse a single-quoted substitution in the other arithmetic contexts.**
  (A1), through "Filed by ADR-690 (out of that run's scope)."
- L197–209: the entry **See a substitution in a string bash evaluates as arithmetic.** (A2),
  through "Found by the design of arith-expansion-comsub-bypass; out of that run's scope."
- L211–221: the paragraph "Both earlier entries delivered 2026-10-20 (…) … Delivered 2026-10-23
  (arith-expansion-comsub-bypass): … (ADR-687 to ADR-693)."
- L1778 `### Closed — won't-do (rationale recorded)`, a bullet list running to the end of the
  file (L1842). The last bullet is the codex by-reference skills record.

**gate.md today:** docs/contributing/specs/gate.md L67–71 lists the unparseable arithmetic
constructs and ends with "… `${ …; }`/`${| …; }` function substitution (ADR-687 to ADR-693)."

Hard line from the run brief: the BACKLOG edits allowed are removing A1 and A2, the delivered
note, and the won't-do record. Nothing else: no new Open entry and no other section.

### TDD steps

1. Edit BACKLOG.md:
   - Delete the A1 and A2 entries (L180–210: both paragraphs and the blank line after each), so
     the group A heading is followed by the delivered paragraph.
   - Append to the delivered paragraph (after "(ADR-687 to ADR-693).") the sentence below. Use
     the commit date (`date +%F`) if it is not 2026-10-26:

     > Delivered 2026-10-26 (guard-arith-cleanup): a `'…'` or `$'…'` span holding `$(`, a
     > backtick or `${`, or a `$'…'` numeric escape decoding to `$` or a backtick, fails closed
     > inside `(( ))`, `for (( ))`, a `${ }` body and an open `[` subscript. A word holding a
     > literal `$` or backtick, quoted or escaped, with a `[` before a substitution opener fails
     > closed wherever it is written, so `let`, `[[ … -eq … ]]`, `declare -i` and a variable
     > read by `$(( x ))` no longer run a hidden substitution (ADR-694 to ADR-697). A value the
     > command text never holds whole in one word is closed as won't-do.

   - Append one bullet at the end of `### Closed — won't-do (rationale recorded)`:

     > - **A data-flow rule for a substitution that reaches arithmetic through a variable value**
     >   — *closed 2026-10-26 (guard-arith-cleanup, ADR-696).*
     >   `printf -v x 'a[%s]' '$(git push -f origin)'; echo $(( x ))` and
     >   `x='a['; y='$(git push -f origin)]'; echo $(( $x$y ))` run git under /bin/bash 3.2.57
     >   and bash 5.3.20 (stub git, benign marker). So does a value that an earlier Bash call put
     >   in a file, an environment variable or a function argument. Both predicates allow them,
     >   because no single word of the command holds the `[` and the opener together. The literal
     >   spellings (rows 57 and 94–100) block through the word rule (ADR-695). Closing the rest
     >   needs a refusal of every arithmetic read of a variable, which denies 34 of 210 allowed
     >   bash scripts in the measured disk corpus (16%), for example `$((OPTIND - 1))` and
     >   `[[ $# -gt 0 ]]`. Probe rows: 101, 102 and table K of
     >   docs/contributing/design/guard-arith-cleanup.md.

2. Edit gate.md: insert after the sentence ending "(ADR-687 to ADR-693)." on L71, before
   "Node prints exactly one token", which continues on the same line:

   > A `'…'` or `$'…'` span holding `$(`, a backtick or `${` (or a `$'…'` numeric escape that
   > decodes to `$` or a backtick) inside `(( ))`, `for (( ))`, a `${ }` body or an open `[`
   > subscript is unparseable. So is a word holding a literal `$` or backtick, quoted or
   > escaped, with a `[` before `$(`, `${` or a backtick (`let 'a[$(…)]'`,
   > `[[ 'a[$(…)]' -eq 0 ]]`, `x='a[$(…)]'`). bash evaluates such a subscript as arithmetic
   > wherever the string is read (ADR-694 to ADR-697).

   Re-wrap to the file's line width. Keep the rest of the paragraph byte-identical.
3. GUARD: ci.sh's prose-lint and intention-lint run on both touched docs. Fix any finding they
   raise in the edited sentences only.

### Gate

`nice -n 19 bash scripts/ci.sh > <tmp>/ci-part4.out 2>&1; echo "exit=$?"; tail -30 <tmp>/ci-part4.out`

The phase-boundary fuzz evidence is Part 3's run (Validation-phase notes).

### Commit

`docs(backlog): close the arithmetic guard entries and record the variable-value residual`

Stage `BACKLOG.md` and `docs/contributing/specs/gate.md` by explicit path, no `-a`.
