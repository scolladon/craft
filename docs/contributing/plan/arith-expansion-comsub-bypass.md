# Plan — arith-expansion-comsub-bypass

> Source: design doc `docs/contributing/design/arith-expansion-comsub-bypass.md` · ADRs `687, 688, 689, 690`
> (687, DC1-A, ratified: scan a `$(( … ))` body with double-quote expansion semantics in a
> scratch context one level deeper and absorb its nested commands; the word stays one dynamic
> word. 688, DC2-A: a `'` in that body fails closed with a new `ARITHMETIC_SINGLE_QUOTE`
> reason. 689, DC3-A, ratified: a `$((` whose inner `)` is not followed by `)` is re-read
> through the `SUBSTITUTION` descriptor. 690, DC4-B, ratified: `$[ … ]` shares the scanner and
> the refusal; the other single-quote arithmetic contexts are filed in the backlog.)
> Row numbers (`row 31`) index the design doc's probe tables.
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

## Plan shape (3 parts)

| # | Part | Size class | src delta | Files edited |
|---|---|---|---|---|
| 1 | Scan `$(( … ))` bodies (ADR-687, 688, 689) | pure-module, medium (4 RED→GREEN cycles) | engine/src/guards/shell-tokeniser.js (~+45 / −20) | the tokeniser, its suite, both predicate suites, the fuzz harness, the census suite |
| 2 | Scan `$[ … ]` bodies with the same scanner (ADR-690) | pure-module, small (1 cycle) | engine/src/guards/shell-tokeniser.js (~+4) | the tokeniser, its suite, the destructive predicate suite |
| 3 | File the sibling single-quote leaks and table E in the backlog | docs-only, small | none | BACKLOG.md |

Order is load-bearing. Part 2 reuses `enterArithmetic`, `scanArithmeticBody` and the
`ARITHMETIC_SINGLE_QUOTE` refusal that Part 1 lands. Part 3 records the verdicts the two
fixes leave open, so it runs last on the fixed tree.

Part 1 holds the re-read rule (ADR-689) and the scanner together because the scanner's closer
must decide what a level-0 `)` not followed by `)` means: without the re-read there is no
correct return value for it. The census rows sit in Part 1 because they are RED until the
scanner lands.

Parts 1 and 2 share the tokeniser, its suite and the destructive suite on purpose (plan-lint
flags the overlap). Merged, the part would hold 5 RED→GREEN cycles and ~60 test rows over 6
files; split, each lands one ADR-scoped behaviour as its own atomic commit (`$((` under
ADR-687/688/689, `$[` under ADR-690), and Part 2 reads Part 1's landed code instead of
rebuilding it.

Closing the existing group A entry ("See through a command substitution inside `$(( … ))`")
is NOT a part. The repo convention (guard-fuzz-scale-ext-diff-widen, git-show-ext-diff-default-deny)
leaves the tick to the documentation phase: it removes the entry and adds a
`Delivered 2026-10-23 (arith-expansion-comsub-bypass): …` sentence to the "Both earlier entries
delivered" paragraph under `### Open — A`. That phase also corrects the entry's stale claim
that `$[ … ]` already blocks (row 41 did not).

### Prototype evidence

Every edit below was applied to a throwaway `git clone` of the branch tip (`6ffddf9`) and
checked there:

| Check | Result |
|---|---|
| Parts 1+2 applied (tokeniser, all test rows below, two SPECIALS), full `node --test 'test/**/*.test.js'` in engine | 4545 / 4545 pass |
| Same, the four touched suites only | 818 / 818 pass |
| All new test rows against the shipped tokeniser | 55 fail (every row listed RED below), every row listed GUARD passes |
| Census with the two new SPECIALS on the shipped tokeniser | 2 fail: `FALSE ALLOW (destructive) … :: "echo $(( $(git push origin) + 1 ))"` and `… :: "echo $((git push origin) )"` (plus composed spellings) |
| Scanner without the `"` handler | row 23 parses with two extra commands (`["\""]`, `["\"","+","1"]`); row 30 fails with the single-quote reason; row 15 unchanged |
| Scanner without the `'` handler | rows 16–18, 25, 35 parse and list git; rows 21, 22 parse |
| Scanner without the `\` handler | row 19 lists git, row 20 fails unterminated, row 24 gains a `[")", "$(git push -f origin)"]` command |
| `echo $[1<<2]⏎git push origin main` on the shipped tree | `gitDestructivePredicate` allows: the tokeniser reads `$[1` as a word and `<<2]` as a heredoc that swallows the git line. Probed in a `mktemp -d` dir, stub git, `bash <file>`: 3.2.57 and 5.3.20 both print `4` and run `git push origin main`. Part 2 blocks it. |
| `$((` nested 8 deep / 9 deep, prototype | parses / fails with the nesting reason (the same count as the existing `nest()` rows) |

## Public-surface decision

No new exported symbol.

- Tokeniser: `ARITHMETIC_EXPANSION`, `BRACKET_ARITHMETIC`, `ARITHMETIC_SINGLE_QUOTE`,
  `UNCLOSED`, `REREAD_AS_SUBSTITUTION`, `BODY_OPEN_LEVEL`, `OPEN_BRACKET`,
  `ARITHMETIC_HANDLERS`, `skipEscaped`, `failArithmeticQuote`, `levelChange`, `closerEnd`,
  `scanArithmeticBody` and `enterArithmetic` are module-private. `parseShellCommands(command)`
  keeps its signature and `ParseResult` shape. The new reason reaches users only as a deny
  reason through the two predicates, like `ARITHMETIC_HEREDOC`. No README, guide or adapter
  doc lists the tokeniser's refusal reasons, so no doc surface changes.
- Harness: two new entries in the module-private `SPECIALS` array; `generateCommands` keeps
  its signature.
- Bindings: no binding code changes. Every binding consumes `parseShellCommands` through
  `gitDestructivePredicate` / `gitExtDiffPredicate`, which already block on `parsed:false`
  (engine/src/guards/shell-git-invocations.js:280).

## Decision candidates

None. ADR-687 to ADR-690 settle every load-bearing choice. Details the design left implicit or
stated loosely are fixed here, each measured on the prototype:

- **Nesting count.** The design's test line says "nested to `PINNED_NESTING_CAP` fails, one
  less parses". `isTooDeep(context)` is `context.depth >= 8` and the top level is depth 0, so
  8 nested `$((` parse and 9 fail, the same count as the existing `nest()` rows. The tests pin
  8 parses / 9 fails.
- **Which row kills the `"` handler.** The design names row 15. Row 15 passes with or without
  the handler (the `"` is a literal and the `$(` inside is still expanded). Rows 23 and 30 are
  the kills (prototype table above).
- **Row 29's command list.** R2 keeps row 29's word shape (`echo` + one dynamic word). R3 adds
  the nested `printf 3` command before it. The row expects `[['printf', '3'], ['echo', dyn(…)]]`.
- **The reason text.** Part 1 lands `ARITHMETIC_SINGLE_QUOTE` with the final ADR-688 text,
  which names `$[ ]` too, so Part 2 does not rewrite a pinned string. Between the two commits
  the reason names a spelling the scanner does not yet see; no behaviour depends on it.
- **Census placement.** The two new fragments join `SPECIALS` (composable), not
  `STANDALONE_SPECIALS`: bash 3.2 runs both. Growing `SPECIALS` shifts which special each
  `pick` returns for every seed; the full suite passed on the shifted corpora.

## Validation-phase notes

- Stryker: runner `tap` (engine/stryker.conf.json). One module per run:
  `engine/src/guards/shell-tokeniser.js`, its touched hunks in ONE comma-joined `--mutate`
  value (`file:L1-L2,file:L3-L4`; repeated `--mutate` flags drop all but the last). Check the
  instrumented mutant count is at least the number of hunks. Narrow the corpus with an
  override config whose `tap.testFiles` lists engine/test/guards/shell-tokeniser.test.js,
  engine/test/guards/git-destructive-predicate.test.js,
  engine/test/guards/git-ext-diff-predicate.test.js and
  engine/test/guards/shell-git-invocations.test.js. `concurrency: 1`, under `nice -n 19`.
  Hand-check every survivor against that full set on a temp-copy mutant before writing a test.
- Expected kills: each `ARITHMETIC_HANDLERS` entry removed (`$`: row 1; backtick: row 3;
  `\`: rows 19, 20, 24; `"`: rows 23, 30; `'`: rows 16–18); `BODY_OPEN_LEVEL` changed (row 1,
  L175); `closerEnd` `doubledClose` forced either way (rows 31, `$[ 1 + 2 ]`); the
  `REREAD_AS_SUBSTITUTION` branch removed (rows 31–34); the `UNCLOSED` branch removed
  (`echo $((1+2`); `isTooDeep` removed or forced (nesting rows); `depth + 1` → `depth - 1`
  (nesting row); `absorb` removed (row 1); `BRACKET_ARITHMETIC.open` → `(` (the `a[1]` row);
  the `OPEN_BRACKET` branch in `expandDollar` removed (every `$[` row); exact reason literals.
- Likely equivalent, verify before commenting: `body.index < body.source.length` → `<=` (the
  extra pass reads `undefined`, a literal, and the result is still `UNCLOSED`); the loop's
  `body.failure === null` forced `true` (enterArithmetic checks the failure first). Do not
  pre-write an `equivalent mutant` comment; add one only for a survivor proven equivalent.
- The harness (engine/test-helpers) and `*.differential.test.js` are outside Stryker's scope.

## Part 1 — Scan `$(( … ))` bodies for nested substitutions

### Context

Files this part edits:

- `engine/src/guards/shell-tokeniser.js`
- `engine/test/guards/shell-tokeniser.test.js`
- `engine/test/guards/git-destructive-predicate.test.js`
- `engine/test/guards/git-ext-diff-predicate.test.js`
- `engine/test-helpers/git-differential-harness.js`
- `engine/test/guards/shell-git-invocations.differential.test.js`

**Tokeniser today** (engine/src/guards/shell-tokeniser.js, line numbers at `6ffddf9`):

- L28–32: `ARITHMETIC_OPEN_LEVEL = 2` and `PAREN_LEVEL` (a `Map` of `(` → 1, `)` → −1). Used
  only by `arithmeticEnd`. **Delete both.**
- L186 `createContext(source, depth)`: fresh context, `index: 0`, `commands: []`,
  `failure: null`, `parameter: false`, `reprinted: false`, `arithmeticFloor: NO_ARITHMETIC`.
- L285 `fail(context, reason)`: `context.failure ??= reason` (first reason wins).
- L289 `onLiteral(context)`: appends the char, `index += 1`.
- L382 `onDoubleQuote(context)`: reads to the closing `"`, expanding `$`, backticks and
  escapes via `consumeDoubleQuoted`; fails `UNTERMINATED_QUOTE` when unclosed.
- L423 `SUBSTITUTION = Object.freeze({ openLength: 2, close: ')', settle: breakCommand, parameter: false, reprinted: true })`.
- L431 `runBody`, L439 `absorb(context, child)` (pushes `child.commands`),
  L443 `markExpansion(context, start, end)` (appends the source slice as the piece, sets
  `index = end`, `dynamic = true`), L449 `isTooDeep(context)` (`depth >= MAX_NESTING_DEPTH`, 8).
- L451 `enterConstruct(context, descriptor)`: the descriptor-driven child for `$( )`, `${ }`,
  `<( )`. Restarts at `context.index + openLength`.
- L475 `enterBacktick(context)`: depth-checked, finds the closing backtick honouring `\`.
- L487–501: the `// equivalent mutant (EqualityOperator index <= source.length): source[source.length] adds 0 …`
  comment, `arithmeticEnd(source, from)` and `onArithmetic(context)` (no depth check, no body
  scan). **Delete all three** (comment included).
- L503 `enterDollarParen = context => context.source[context.index + 2] === OPEN_PAREN ? onArithmetic(context) : enterConstruct(context, SUBSTITUTION);`
- L512 `expandDollar(context)`: `$(` → `enterDollarParen`, `${` → `enterConstruct(braceConstruct(…))`,
  `$name` → `onVariable`, else `onLiteral`. Every `$` path reaches it: bare words via
  `onDollar` (L526), `"…"` via `onDoubleQuotedDollar` (L534), unquoted heredoc bodies via
  `scanExpansions` (L622), and `bash -c` / `eval` strings via `reparse`. So rewiring
  `enterDollarParen` covers rows 6, 7 and 8 with no other edit.

**Target code** (measured on the prototype; place it where `arithmeticEnd`/`onArithmetic`
stood, except `ARITHMETIC_HANDLERS`, see the TDZ note):

```js
// The body of $(( )) and $[ ] expands like a double-quoted string, and a ) or ] in quotes or after \ does not close it.
const ARITHMETIC_EXPANSION = Object.freeze({ openLength: 3, open: '(', close: ')', doubledClose: true });

const ARITHMETIC_SINGLE_QUOTE =
  "craft: command not parseable (a ' inside $(( )) or $[ ] — bash still runs the substitutions in it) — denied fail-closed";
const BODY_OPEN_LEVEL = 1;
const UNCLOSED = -1;
const REREAD_AS_SUBSTITUTION = -2;

const skipEscaped = body => {
  body.index += 2;
};

const failArithmeticQuote = body => fail(body, ARITHMETIC_SINGLE_QUOTE);

const levelChange = (char, { open, close }) => {
  if (char === open) return 1;
  if (char === close) return -1;
  return 0;
};

const closerEnd = (body, { close, doubledClose }) => {
  if (!doubledClose) return body.index + 1;
  return body.source[body.index + 1] === close ? body.index + 2 : REREAD_AS_SUBSTITUTION;
};

const scanArithmeticBody = (body, descriptor) => {
  let level = BODY_OPEN_LEVEL;
  while (body.index < body.source.length && body.failure === null) {
    level += levelChange(body.source[body.index], descriptor);
    if (level === 0) return closerEnd(body, descriptor);
    (ARITHMETIC_HANDLERS.get(body.source[body.index]) ?? onLiteral)(body);
  }
  return UNCLOSED;
};

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

// directly after expandDollar:
const ARITHMETIC_HANDLERS = new Map([
  [BACKSLASH, skipEscaped],
  [DOUBLE_QUOTE, onDoubleQuote],
  [SINGLE_QUOTE, failArithmeticQuote],
  [DOLLAR, expandDollar],
  [BACKTICK, enterBacktick],
]);
```

- **TDZ:** `expandDollar` is a `const` declared after `enterDollarParen`. A `Map` literal
  holding `expandDollar` evaluates it at module load, so `ARITHMETIC_HANDLERS` must be
  declared after `expandDollar` (the functions that read the map run later and may sit
  above it). `onDoubleQuote` and `enterBacktick` are declared earlier.
- The scratch context's `piece` and `words` are discarded; only `body.commands` are
  absorbed (R3). The parent gets one dynamic word holding the source slice (R2).
- `#`, `<<`, newline, `[`, `{`, `;` are plain literals in the body: the scanner never consults
  `CHAR_HANDLERS`, so `16#ff`, `1 << 2`, `1 <<E` stay arithmetic (row 28).
- Re-read (row 31): `enterConstruct(context, SUBSTITUTION)` restarts at `start + 2`, so the
  child reads `(git push -f origin) )`. Its `onOpenParen` sees `((` at `index - 1` but sets
  the floor to `parens - 1 = -1 = NO_ARITHMETIC`, so no arithmetic floor leaks. A scan failure
  before the closer wins: `$((git push -f origin 'x') )` (row 35) fails on the `'`.
- Style: each function ≤ 20 lines, nesting ≤ 2, no nested ternary.

**Tokeniser suite** (engine/test/guards/shell-tokeniser.test.js, 616 lines): helpers at the
top: `dyn(text)` → `{ text, dynamic: true }`, `word`, `cmd`, `parsed`, `UNTERMINATED_QUOTE`
(L9). `assertParsesWords(rows)` (L128, rows `[input, [[word|dyn, …], …]]`, deepEqual on the
whole result). `UNTERMINATED_SUBSTITUTION` (L186), `PINNED_NESTING_CAP = 8` and
`NESTING_TOO_DEEP` (L212–213), `assertFails(rows)` (L379, rows `[input, reason]`). These are
`const`s, so **append every new describe at the end of the file** (after L616), where all are
initialised. Existing rows L174 `x=$((1+2)) git diff`, L175 `echo $((2*(3+4)))`, L194
`echo $((1+2` stay untouched and must stay green. Titles follow the file's
`Given … When … Then …` idiom; every `it` uses `const sut = parseShellCommands;`.

**Predicate suites:** engine/test/guards/git-destructive-predicate.test.js: `assertBlocks`
(L289) / `assertPasses` (L301) check `result.block`; append the new describe right after
`describe('gitDestructivePredicate() — parameter expansion and arithmetic', …)` (ends L370).
engine/test/guards/git-ext-diff-predicate.test.js: `assertBlocks` (L361); append the new
describe right after `describe('gitExtDiffPredicate() — unmodelled constructs', …)` (L373–375).

**Census:** engine/test-helpers/git-differential-harness.js `SPECIALS` (L141–212, frozen
array of `fragment(text, options)`). Insert the two fragments directly after
`fragment('(( x = 1 << 2 ))\ngit push', { tags: [TAGS.arithmeticHeredoc], list: true }),`
(L180). No tag: both run on bash 3.2 and 5.3 (the stub git prints nothing, so the
arithmetic stays valid), and `BASHISMS` (L258) already keeps `((` out of `sh -c` bodies.
engine/test/guards/shell-git-invocations.differential.test.js: the fixed-entry test
`it('Given any seed, when commands are generated, then the firing show and brace spellings are fixed entries', …)`
(L295–308) is the model; add the new `it` right after it, inside the same describe.
`problemsOf` (L51) reports `FALSE ALLOW` when bash ran a blocked argv and the predicate allowed.

Shared test constants for the new tokeniser describes (append once, at the top of the
appended block):

```js
const ARITHMETIC_SINGLE_QUOTE =
  "craft: command not parseable (a ' inside $(( )) or $[ ] — bash still runs the substitutions in it) — denied fail-closed";
const PUSH = ['git', 'push', '-f', 'origin'];
const nestArithmetic = depth => `echo ${'$(( '.repeat(depth)}1${' ))'.repeat(depth)}`;
```

### TDD steps

**Cycle 1 — the census pins the two spellings.**

1. RED: in the differential suite, after the fixed-entry test:

   ```js
   it('Given any seed, when commands are generated, then the arithmetic-body substitution spellings are fixed entries', () => {
     const sut = generateCommands;
     const expected = ['echo $(( $(git push origin) + 1 ))', 'echo $((git push origin) )'];

     const result = sut(1, 100).map(entry => entry.text);

     assert.deepEqual(expected.filter(text => !result.includes(text)), []);
   });
   ```

   Fails: neither text is in `SPECIALS`, so the filter returns both.
2. GREEN: add `fragment('echo $(( $(git push origin) + 1 ))'),` and
   `fragment('echo $((git push origin) )'),` to `SPECIALS` (placement above). The pin passes,
   and the census `it`s now fail with `FALSE ALLOW (destructive) … :: "echo $(( $(git push origin) + 1 ))"`
   and `… "echo $((git push origin) )"` (measured: 2 failing tests). They stay RED until cycle 2.

**Cycle 2 — the scanner core: substitutions, escapes, the closer and the re-read.**

3. RED, tokeniser, `describe('parseShellCommands() — substitutions inside an arithmetic expansion body', …)`
   with `assertParsesWords`. Each fails today because the body is skipped: the result holds
   only the `echo` command (row 7: only `cat`; row 8: no `git` after `bash -c`):

   ```js
   ['echo $(($(git push -f origin)))', [PUSH, ['echo', dyn('$(($(git push -f origin)))')]]],
   ['echo $(( $(git push -f origin) + 1 ))', [PUSH, ['echo', dyn('$(( $(git push -f origin) + 1 ))')]]],
   ['echo $((`git push -f origin`))', [PUSH, ['echo', dyn('$((`git push -f origin`))')]]],
   ['echo $((${ git push -f origin; }))', [PUSH, ['echo', dyn('$((${ git push -f origin; }))')]]],
   ['echo $((${| git push -f origin; }))', [PUSH, ['echo', dyn('$((${| git push -f origin; }))')]]],
   ['echo "$(($(git push -f origin)))"', [PUSH, ['echo', dyn('$(($(git push -f origin)))')]]],
   ['cat <<E\n$(($(git push -f origin)))\nE', [PUSH, ['cat']]],
   ["bash -c 'echo $(($(git push -f origin)))'", [['bash', '-c', 'echo $(($(git push -f origin)))'], PUSH, ['echo', dyn('$(($(git push -f origin)))')]]],
   ['echo $(( $(( $(git push -f origin) )) ))', [PUSH, ['echo', dyn('$(( $(( $(git push -f origin) )) ))')]]],
   ['echo $(( ${x:-$(git push -f origin)} ))', [PUSH, ['echo', dyn('$(( ${x:-$(git push -f origin)} ))')]]],
   ['echo $(( a[$(git push -f origin)] ))', [PUSH, ['echo', dyn('$(( a[$(git push -f origin)] ))')]]],
   ['echo $(( $(cat <(git push -f origin)) ))', [PUSH, ['cat', dyn('<(git push -f origin)')], ['echo', dyn('$(( $(cat <(git push -f origin)) ))')]]],
   ['echo $(( $(cat <<E\nx\nE\ngit push -f origin) ))', [['cat'], PUSH, ['echo', dyn('$(( $(cat <<E\nx\nE\ngit push -f origin) ))')]]],
   ['echo $(( "$(git push -f origin)" ))', [PUSH, ['echo', dyn('$(( "$(git push -f origin)" ))')]]],
   ['echo $(( \\) $(git push -f origin) ))', [PUSH, ['echo', dyn('$(( \\) $(git push -f origin) ))')]]],
   ["echo $(( $(echo ')' ; git push -f origin) + 1 ))", [['echo', ')'], PUSH, ['echo', dyn("$(( $(echo ')' ; git push -f origin) + 1 ))")]]],
   ['echo $(( $(git push -f origin # )\n) ))', [PUSH, ['echo', dyn('$(( $(git push -f origin # )\n) ))')]]],
   ['echo $(( $(printf 3) + 1 ))', [['printf', '3'], ['echo', dyn('$(( $(printf 3) + 1 ))')]]],
   ['echo $(( "\'" $(git push -f origin) ))', [PUSH, ['echo', dyn('$(( "\'" $(git push -f origin) ))')]]],
   ```

   Rows 24, 26, 27 also fail on the word text: the raw paren count ends the word early.
4. RED, tokeniser, `describe('parseShellCommands() — a $(( whose inner ) is not followed by ) is a command substitution', …)`,
   `assertParsesWords`. Fail today: one opaque arithmetic word, no `git` command:

   ```js
   ['echo $((git push -f origin) )', [PUSH, ['echo', dyn('$((git push -f origin) )')]]],
   ['echo $((git push -f origin); true)', [PUSH, ['true'], ['echo', dyn('$((git push -f origin); true)')]]],
   ['echo $((git push -f origin)|cat)', [PUSH, ['cat'], ['echo', dyn('$((git push -f origin)|cat)')]]],
   ['echo $((git push -f origin)\n)', [PUSH, ['echo', dyn('$((git push -f origin)\n)')]]],
   ['echo $(((git push -f origin)) )', [PUSH, ['echo', dyn('$(((git push -f origin)) )')]]],
   ```

5. RED, predicates. Destructive, `describe('gitDestructivePredicate() — substitutions inside arithmetic expansion', …)`:
   `assertBlocks` on `'echo $(($(git push -f origin)))'`, ``'echo $((`git push -f origin`))'``,
   `'echo $((${ git push -f origin; }))'`, `'echo $((${| git push -f origin; }))'`,
   `'echo $(( $(( $(git push -f origin) )) ))'`, `"echo $(( ')' $(git push -f origin) ))"`,
   `'echo $((git push -f origin) )'`. Each returns `block: false` today. Ext-diff,
   `describe('gitExtDiffPredicate() — substitutions inside arithmetic expansion', …)`:
   ``assertBlocks(['echo $(($(git diff HEAD)))', 'echo $((`git diff HEAD`))'])``, `block: false`
   today.
6. GUARD, tokeniser, `describe('parseShellCommands() — arithmetic expansion bodies bash does not run as commands', …)`,
   `assertParsesWords`. Each passes today because the body is one skipped word; the GREEN must
   keep them (the `\` handler keeps 19 and 20, the doubled closer keeps 36 and 39):

   ```js
   ['echo $(( 16#ff ))', [['echo', dyn('$(( 16#ff ))')]]],
   ['echo $(( 1 << 2 ))', [['echo', dyn('$(( 1 << 2 ))')]]],
   ['echo $(( 1 <<E ))', [['echo', dyn('$(( 1 <<E ))')]]],
   ['echo $(( \\$(git push -f origin) ))', [['echo', dyn('$(( \\$(git push -f origin) ))')]]],
   ['echo $(( \\`git push -f origin\\` ))', [['echo', dyn('$(( \\`git push -f origin\\` ))')]]],
   ['echo $((git push -f origin))', [['echo', dyn('$((git push -f origin))')]]],
   ['echo $(( (git push -f origin) ))', [['echo', dyn('$(( (git push -f origin) ))')]]],
   ```

   GUARD, destructive: `assertPasses(['echo $(( $(printf 3) + 1 ))', 'echo $(( 16#ff ))', 'echo $(( 1 <<E ))'])`
   (no git anywhere). GUARD, the existing L174, L175, L194 rows and
   `'echo $(( 1 << 2 )); git push'` / `'echo $(( 1 << 2 ))'` (destructive L366, L369).
7. GREEN: the target code minus the `DOUBLE_QUOTE` and `SINGLE_QUOTE` map entries, minus
   `failArithmeticQuote` and `ARITHMETIC_SINGLE_QUOTE`, and minus the `isTooDeep` line.
   Delete `ARITHMETIC_OPEN_LEVEL`, `PAREN_LEVEL`, `arithmeticEnd` (with its comment) and
   `onArithmetic`. Steps 3–5 pass, step 6 stays green, the two census `it`s from step 2 pass.

**Cycle 3 — quotes in the body.**

8. RED, tokeniser, `describe('parseShellCommands() — quotes inside an arithmetic expansion body', …)`:
   `assertParsesWords([['echo $(( ")" + 1 ))', [['echo', dyn('$(( ")" + 1 ))')]]]])`. Fails:
   the `"` is a literal, so its `)` closes the body, the next char is `"`, and the re-read adds
   the commands `['"']` and `['"', '+', '1']`.
   Same describe, `assertFails`, all with `ARITHMETIC_SINGLE_QUOTE`. Each parses today (the
   `'` is a literal; rows 16–18, 25, 35 list git):

   ```js
   ["echo $(( '$(git push -f origin)' ))", ARITHMETIC_SINGLE_QUOTE],
   ["echo $(( '`git push -f origin`' ))", ARITHMETIC_SINGLE_QUOTE],
   ["echo $(( '${ git push -f origin; }' ))", ARITHMETIC_SINGLE_QUOTE],
   ["echo $(( '1' + 2 ))", ARITHMETIC_SINGLE_QUOTE],
   ["echo $(( $'1' + 1 ))", ARITHMETIC_SINGLE_QUOTE],
   ["echo $(( ')' + 1 ))", ARITHMETIC_SINGLE_QUOTE],
   ["echo $(( ')' $(git push -f origin) ))", ARITHMETIC_SINGLE_QUOTE],
   ["echo $((git push -f origin 'x') )", ARITHMETIC_SINGLE_QUOTE],
   ```

9. GUARD, same `assertFails`: `['echo $(( $(git push )', UNTERMINATED_SUBSTITUTION]` (the
   nested `$(` closes, the body never does). GUARD: row 30 (`"'"`) from step 3 stays green
   only because the `"` entry lands with the `'` entry in this GREEN; with the `'` refusal
   alone it would fail on the `'` inside the string.
10. GREEN: add `ARITHMETIC_SINGLE_QUOTE`, `failArithmeticQuote`, and the `DOUBLE_QUOTE` and
    `SINGLE_QUOTE` entries of `ARITHMETIC_HANDLERS`.

**Cycle 4 — the nesting cap.**

11. GUARD, tokeniser, `describe('parseShellCommands() — arithmetic expansion nesting depth', …)`:
    `it('Given arithmetic expansions nested at the cap, When parsed, Then it is parsed', …)`
    on `nestArithmetic(PINNED_NESTING_CAP)`, `assert.equal(result.parsed, true)`. Passes: no
    depth check yet, and 8 levels parse either way.
12. RED, same describe: `it('Given arithmetic expansions nested one past the cap, When parsed, Then it is not parseable', …)`
    on `nestArithmetic(PINNED_NESTING_CAP + 1)`, `assert.deepEqual(result, { parsed: false, reason: NESTING_TOO_DEEP })`.
    Fails: `enterArithmetic` has no depth check, so 9 levels parse.
13. GREEN: add `if (isTooDeep(context)) return fail(context, NESTING_TOO_DEEP);` as the first
    line of `enterArithmetic`.

**REFACTOR.** Read the new block once against the style rules (≤ 20 lines, nesting ≤ 2, no
magic values beyond the ±1 level steps, no provenance refs in source or tests). No comment
other than the descriptor's why-comment. Re-run the gate.

### Gate

`cd engine && nice -n 19 node --test test/guards/shell-tokeniser.test.js test/guards/git-destructive-predicate.test.js test/guards/git-ext-diff-predicate.test.js test/guards/shell-git-invocations.differential.test.js`

Pipe the output to a file and read back the `# tests` / `# pass` / `# fail` lines and any
`not ok` line. Never commit on red. If the census reports a composed spelling of the new
fragments as a false allow or a syntax failure, stop and hand back with the blocker protocol
({ unit, reason, ≤3 options }); the prototype measured none.

### Commit

`fix(guards): see through command substitutions inside arithmetic expansion`

Stage the six files above by explicit path (`/usr/bin/git add <paths>`), no `-a`.

## Part 2 — Scan `$[ … ]` bodies with the arithmetic scanner

### Context

Files this part edits:

- `engine/src/guards/shell-tokeniser.js`
- `engine/test/guards/shell-tokeniser.test.js`
- `engine/test/guards/git-destructive-predicate.test.js`

**State after Part 1:** `enterArithmetic(context, descriptor)`, `scanArithmeticBody`,
`closerEnd` (returns `body.index + 1` when `doubledClose` is false), `ARITHMETIC_HANDLERS`,
and `ARITHMETIC_SINGLE_QUOTE` exist in engine/src/guards/shell-tokeniser.js, next to
`enterDollarParen`. The descriptor comment already names `$[ ]`.

**Today a `$[` is not a construct.** `expandDollar(context)` (after `enterDollarParen`) reads
`$(`, `${`, `$name`, else `onLiteral`; the `[` that follows then goes through
`CHAR_HANDLERS` (`onGlob`). So `echo $[ 1 + 2 ]` tokenises as `~$[`, `1`, `+`, `2`, `]`, and
`echo $[1<<2]⏎git push origin main` reads `<<2]` as a heredoc whose body swallows the git
line (a live bypass on 3.2.57 and 5.3.20, see the prototype table).

**Target code:**

```js
const OPEN_BRACKET = '[';   // beside OPEN_PAREN / OPEN_BRACE at the top of the file

const BRACKET_ARITHMETIC = Object.freeze({ openLength: 2, open: OPEN_BRACKET, close: ']', doubledClose: false });
// beside ARITHMETIC_EXPANSION, under the same comment

// in expandDollar, after the OPEN_BRACE line:
if (next === OPEN_BRACKET) return enterArithmetic(context, BRACKET_ARITHMETIC);
```

- Inside a `$[` body `(` and `)` are literals and `[`/`]` count levels (`a[1]` in row 43).
  Inside a `$((` body `[`/`]` stay literals (row 11 is unaffected).
- `"$[ … ]"` reaches the branch through `onDoubleQuotedDollar` → `expandDollar`, heredoc
  bodies through `scanExpansions`. No other entry path exists.
- An unterminated `$[` now fails closed (row 59): bash rejects it as a syntax error in both
  shells. Inside `"…"` the scanner's own `"` handler opens a nested string that never closes,
  so `echo "a$[b"; git status` fails with `UNTERMINATED_QUOTE`, not the substitution reason.

Tests: append one describe per suite at the end of the files, reusing Part 1's
`ARITHMETIC_SINGLE_QUOTE` and `PUSH` constants (tokeniser) and the local `assertBlocks` /
`assertPasses` (destructive). engine/test/guards/git-plain-command-gate.test.js:13 also holds
`echo $[1<<2]⏎git push origin main`; that gate is character-level and imports no tokeniser,
so it does not move.

### TDD steps

1. RED, tokeniser, `describe('parseShellCommands() — dollar-bracket arithmetic bodies', …)`,
   `assertParsesWords`. Each fails today on the word split described above:

   ```js
   ['echo $[ 1 + 2 ]', [['echo', dyn('$[ 1 + 2 ]')]]],
   ['echo $[ a[1] + $(git push -f origin) ]', [PUSH, ['echo', dyn('$[ a[1] + $(git push -f origin) ]')]]],
   ['echo $[ $(git push -f origin) ]', [PUSH, ['echo', dyn('$[ $(git push -f origin) ]')]]],
   ['echo $[ "$(git push -f origin)" ]', [PUSH, ['echo', dyn('$[ "$(git push -f origin)" ]')]]],
   ['echo $[1<<2]\ngit push origin main', [['echo', dyn('$[1<<2]')], ['git', 'push', 'origin', 'main']]],
   ```

   The last row fails with `[['echo', dyn('$[1')]]`: the git line is read as heredoc body.
2. RED, same describe, `assertFails`. Each parses today (`$[` is a literal; the two quote rows
   read `'…'` as a quoted literal, the `"…"` one even lists git):

   ```js
   ["echo $[ '$(git push -f origin)' ]", ARITHMETIC_SINGLE_QUOTE],
   ["echo \"$[ '$(git push -f origin)' ]\"", ARITHMETIC_SINGLE_QUOTE],
   ['echo $[ 1 + 2', UNTERMINATED_SUBSTITUTION],
   ['echo a$[b; git status', UNTERMINATED_SUBSTITUTION],
   ['echo "a$[b"; git status', UNTERMINATED_QUOTE],
   ```

3. RED, destructive, `describe('gitDestructivePredicate() — dollar-bracket arithmetic', …)`:
   `assertBlocks(["echo $[ '$(git push -f origin)' ]", 'echo $[1<<2]\ngit push origin main'])`.
   Both return `block: false` today (row 41; the swallowed git line).
   GUARD, same describe: `assertPasses(['echo $[ 1 + 2 ]', 'echo $[1<<2]'])`: no git, parsed
   before and after.
4. GREEN: the target code. Steps 1–3 pass; Part 1's rows stay green.
5. REFACTOR: none expected. Confirm `BRACKET_ARITHMETIC` sits beside `ARITHMETIC_EXPANSION`
   under the one comment, and re-run the gate.

### Gate

`cd engine && nice -n 19 node --test test/guards/shell-tokeniser.test.js test/guards/git-destructive-predicate.test.js test/guards/git-ext-diff-predicate.test.js test/guards/git-plain-command-gate.test.js`

Output to a file; read back the summary lines and any `not ok`. Never commit on red.

### Commit

`fix(guards): scan dollar-bracket arithmetic bodies like arithmetic expansion`

Stage the three files above by explicit path.

## Part 3 — File the sibling single-quote leaks and table E in the backlog

### Context

Files this part edits:

- `BACKLOG.md`

Docs-only, no `src/` delta. ADR-690 files the single-quote mirrors outside `$(( ))`/`$[ ]`
(design table D rows 45, 47, 49, 51, 52), and the design's out-of-scope section leaves table E
(rows 55–57). Both become group A entries.

- **Where:** `BACKLOG.md`, section `### Open — A. Git guard rules (local code, runnable)`
  (L178). Insert the two entries after the existing "See through a command substitution
  inside `$(( … ))`" paragraph (ends L190, "…present before it).") and before the paragraph
  that starts "Both earlier entries delivered 2026-10-20". One blank line between paragraphs.
  Leave the existing entry as it is: the documentation phase closes it. The entry drafts sit
  in TDD step 2.
- **Style** (match the existing entry): a bold one-sentence title, the failure with its
  measured commands and shells ("stub git, benign marker"), the predicate verdict, "Fix
  candidates:", "Locus:", then where it was found. Wrap at ~100 columns. Repo-relative paths
  only.
- **Re-check the verdicts on the fixed tree before writing** (read-only, no repo write):

  ```sh
  cd engine && node --input-type=module -e "
  import { gitDestructivePredicate as p } from './src/guards/git-destructive-predicate.js';
  for (const c of [
    \"(( '\$(git push -f origin)' ))\",
    \"for (( i='\$(git push -f origin)'; i<1; i++ )); do :; done\",
    \"a['\$(git push -f origin)']=1\",
    \"x=abc; echo \${x:'\$(git push -f origin)'}\",
    \"echo \${a['\$(git push -f origin)']}\",
    \"let 'a[\$(git push -f origin)]'\",
    \"[[ 'a[\$(git push -f origin)]' -eq 0 ]]\",
    \"x='a[\$(git push -f origin)]'; echo \$(( x ))\",
  ]) console.log(p(c).block, c);"
  ```

  Every line must print `false`. If one prints `true`, the fix closed it: drop that command
  from the entry and say so in the handback. The bash rows are the design's measurements
  (3.2.57 and 5.3.20, 2026-10-23); re-probing them is optional and, if done, runs in a
  `mktemp -d` dir with a stub git, never in the worktree.

### TDD steps

Docs-only part: no RED/GREEN cycle.

1. GUARD: run the read-only verdict re-check above on the tree Parts 1–2 left. Every command
   prints `false` (the fix does not touch these contexts).
2. Edit: insert the two entries at the location above. Drafts (adjust only what the
   re-check changes):

   > **Refuse a single-quoted substitution in the other arithmetic contexts.** Inside `(( … ))`,
   > `for (( … ))`, an assignment subscript, a `${x:offset}` and a `${a[…]}` subscript, bash does
   > not read `'…'` as quoting and still runs a substitution in it, while the tokeniser reads the
   > span as a quoted literal. Measured (stub git, benign marker): `(( '$(git push -f origin)' ))`
   > and ``(( '`git push -f origin`' ))``, `for (( i='$(git push -f origin)'; i<1; i++ )); do :; done`,
   > `a['$(git push -f origin)']=1` and `echo ${a['$(git push -f origin)']}` run git under bash
   > 5.3.20 only; `x=abc; echo ${x:'$(git push -f origin)'}` runs it under /bin/bash 3.2.57 and
   > 5.3.20. `gitDestructivePredicate` returns `{block:false}` on each; the unquoted spellings
   > already block. `$(( … ))` and `$[ … ]` fail closed on a `'` in their body since
   > arith-expansion-comsub-bypass (ADR-688, ADR-690); these contexts go through other tokeniser
   > paths. Fix candidates: apply the same single-quote refusal inside the `(( … ))` command
   > floor, an assignment subscript and a `PARAMETER` body after `:` or `[`, or scan those bodies
   > with the arithmetic-expansion scanner. Locus: `onOpenParen` / `arithmeticFloor`, the
   > assignment path and `PARAMETER` in `engine/src/guards/shell-tokeniser.js`. Probe rows:
   > table D rows 45, 47, 49, 51, 52 of docs/contributing/design/arith-expansion-comsub-bypass.md.
   > Filed by ADR-690 (out of that run's scope).

   > **See a substitution in a string bash evaluates as arithmetic.** bash evaluates an array
   > subscript inside a string value as arithmetic and runs a substitution in it.
   > `let 'a[$(git push -f origin)]'`, `[[ 'a[$(git push -f origin)]' -eq 0 ]]` and
   > `x='a[$(git push -f origin)]'; echo $(( x ))` run `git push -f origin` under /bin/bash
   > 3.2.57 and bash 5.3.20 (stub git, benign marker), and `gitDestructivePredicate` returns
   > `{block:false}` on each. `let '1+$(git push -f origin)'` runs nothing on either shell (no
   > subscript). The command text holds the substitution only as a quoted literal or a variable
   > value, so there is no expansion for the tokeniser to scan. Fix candidates: fail closed on a
   > `$(`, backtick or `${ ` inside a subscript of a quoted `let` argument or `[[` arithmetic
   > operand; the variable form needs a data-flow rule (a variable assigned such a string and
   > read in an arithmetic context), so scope it with its own probe set first. Locus:
   > `engine/src/guards/shell-tokeniser.js` (no model of `let` or `[[ … -eq … ]]` operands).
   > Probe rows: table E rows 55–57 of docs/contributing/design/arith-expansion-comsub-bypass.md.
   > Found by the design of arith-expansion-comsub-bypass; out of that run's scope.

3. GUARD: `bash scripts/backlog-lint.sh BACKLOG.md` exits 0 (the required section headings are
   untouched).

### Gate

`bash scripts/backlog-lint.sh BACKLOG.md && nice -n 19 bash scripts/ci.sh` (ci.sh runs the
prose lint on touched docs; ~10 s). Output to a file; read back the failing lines only.

### Commit

`docs(backlog): file the single-quote arithmetic leaks and string-evaluated subscripts`

Stage `BACKLOG.md` only.
