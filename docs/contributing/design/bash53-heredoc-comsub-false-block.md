# Design — bash53-heredoc-comsub-false-block

> Brief: under bash 5.3.20 the scaled engine differential fuzz reports one unexpected false block
> (seed 101, bash >= 5 arm only, deterministic). Classify it at its construct as ADR-661 does, or
> remove it with a generator or guard change, then re-run the four seed batches at 1500 on both
> shells and record the outcome in the BACKLOG group C entry.
> Status: draft → self-reviewed ×3

## Context

### The failure

`GUARD_FUZZ_SEEDS=101 GUARD_FUZZ_COUNT=1500 node --test engine/test/guards/shell-git-invocations.differential.test.js`,
bash >= 5 arm (`/opt/homebrew/bin/bash`, GNU bash 5.3.20), fails 3/3:

```
unexpected false block (no intended-false-block class) :: "echo $( cat <<'EOF44'\necho x | xargs 'git' show x\nEOF44\nA=1 B=2 nohup g\"\"it --noglob-pathspecs 'show' --ext-diff \"--no-ext-diff\" && X=--ext-diff; git show $X )"
```

The generator built it as `nest(echo $( … ))` over `sequence(heredoc(quoted body), sequence(gitLeaf && SPECIAL 'X=--ext-diff; git show $X'))`.
The `heredoc` fragment is `lineEnd`, so `sequence` joins it with `\n`.
`gitExtDiffPredicate` blocks (`$X` read as `--ext-diff`). `/bin/bash` 3.2.57 runs `git show --ext-diff`,
so the oracle agrees there. bash 5.3.20 runs `git show`, so the oracle allows and the census reports a false block.

### Root cause: pinned empirically

All rows below come from a throwaway `mktemp -d` dir, with a stub `git` on PATH that echoes `GIT: $*`.
Each command ran under `bash -c` with both shells, under `nice -n 19`. `H` stands for `cat <<'E'⏎hi⏎E⏎`.

| # | Command | bash 3.2.57 | bash 5.3.20 |
|---|---|---|---|
| 1 | `echo $( H X=v; echo [$X] )` | `[v]` | `[]` |
| 2 | `echo $( H X=v && echo [$X] )` | `[v]` | `[v]` |
| 3 | `echo $( H X=v⏎echo [$X] )` | `[v]` | `[v]` |
| 4 | `echo $( H echo a; echo b )` | `a b` | `a echo b` |
| 5 | `echo $( H true; git push )` | `GIT: push` | *(git not run)* |
| 6 | `echo $( H git status; git push )` | `GIT: status` `GIT: push` | `GIT: status git push` |
| 7 | `echo $( H true; X=v; echo [$X] )` | `[v]` | `[]` (only the first `;` drops) |
| 8 | `echo $( H X=v && Y=w; echo [$X$Y] )` | `[vw]` | `[v]` |
| 9 | `echo $( H false \|\| X=v; echo [$X] )` | `[v]` | `[]` |
| 10 | `echo $( H echo a & echo b; wait )` | `b a` | `b wait a` (`&` kept, `;` dropped) |
| 11 | `echo $( H echo a \| tr a b )` / `false \|\| echo b` | same | same |
| 12 | `echo $( cat <<'E'; X=v; echo [$X]⏎hi⏎E⏎ )` | `[v]` | `[]` (heredoc mid-line) |
| 13 | `echo $( H { X=v; echo [$X]; } )` / `( X=v; echo [$X] )` | `[v]` | `[]` |
| 14 | `echo $( H if true; then X=v; echo [$X]; fi )` | `[v]` | `[v]` |
| 15 | `echo $( H echo a⏎X=v; echo [$X] )` | `[v]` | `[v]` (a newline first resets it) |
| 16 | `cat <( H X=v; echo [$X] )`, `echo x > >( … )` | `[v]` | `[]` |
| 17 | `echo "$( H X=v; echo [$X] )"`, `cat <<< "$( … )"` | `[v]` | `[]` |
| 18 | `` echo ` H X=v; echo [$X] ` `` (backticks) | `[v]` | `[v]` |
| 19 | top level / `( … )` / `{ …; }` with `H X=v; echo [$X]` | `[v]` | `[v]` |
| 20 | `echo $( echo $( H ) ; X=v; echo [$X] )` (heredoc in an inner comsub) | `[v]` | `[v]` |
| 21 | `echo $( H echo $( X=v; echo [$X] ) )` (`;` in an inner comsub) | `[v]` | `[v]` |
| 22 | `cat <<F⏎$( H X=v; echo [$X] )⏎F` (comsub in an unquoted heredoc body) | `[v]` | `[v]` |
| 23 | `echo $( X=v; H echo [$X] )`, `echo $( cat <<< hi; X=v; echo [$X] )` | `[v]` | `[v]` |
| 24 | `echo "$(cat <<'EOF'⏎msg⏎EOF⏎)"` (the commit idiom) | `msg` | `msg` |
| 25 | `echo $( H git; push origin )` | `push: command not found`, `GIT:` | `GIT: push origin` |
| 26 | `echo $( H git show; --ext-diff )` | `GIT: show` | `GIT: show --ext-diff` |
| 27 | the seed-101 command, 3 runs | `GIT: show --ext-diff` ×3 | `GIT: show` ×3 |
| 28 | `echo ${ H git; push origin; }` (space, tab or newline after `${`) | `bad substitution` | `GIT: push origin` |
| 29 | `echo ${\| H git show; --ext-diff; }` | `bad substitution` | `GIT: show --ext-diff` |
| 30 | `echo ${x:-<<E;}` (plain parameter expansion) | no command run | no command run |

Rows 28–30 were added after the review phase found the funsub fail-open, which the first probe
table did not cover.

`declare -f` makes the mechanism visible. bash 5.3.20 prints the body of `f() { echo $( H X=v; echo [$X] ); }`
as `echo $(cat <<E⏎hi⏎E⏎⏎X=v echo [$X])`. bash 5.3 re-serialises a parsed `$( … )`/`<( … )` body and
runs the printed text. When a heredoc sits in that body, the printer drops the first `;` list
connector after it, so the two neighbouring commands merge into one. An assignment-only command
becomes a prefix assignment (rows 1, 8, 9). A following command's words become arguments (rows 4, 6,
25, 26). `&&`, `||`, `|`, `&` and newline connectors are not dropped (rows 2, 3, 10, 11). A newline
before the first `;`, an `if` body, or a heredoc nested one comsub deeper avoids it (rows 14, 15, 20).

**Precise trigger:** inside a `$( … )`, `"$( … )"`, `<( … )`/`>( … )` or bash 5.3 function
substitution `${ …; }`/`${| …; }` body (rows 28, 29) whose own list holds a
heredoc, the first `;` connector printed after that heredoc, with no newline connector before it, is
dropped. Backticks, top level, subshells and groups outside a substitution, and heredoc bodies are
unaffected.

**Unsafe direction is proven.** The merge can also create an invocation:

```
$ node -e '…gitDestructivePredicate / gitExtDiffPredicate…'
mergeGitPush  echo $( H git; push origin )      destructive= false extDiff= false   # bash 5.3 runs `git push origin`
mergeShowExt  echo $( H git show; --ext-diff )  destructive= false extDiff= false   # bash 5.3 runs `git show --ext-diff`
```

The guard reads `git` and `push` as two commands, as bash 3.2 does. Lesson 004 says to check that
the unsafe mirror still blocks before exempting, and here it does not. The generator never builds
rows 25–26: every leaf is a whole command, and a merged command keeps its left verb. So the census
cannot see this fail-open. Measured reach: the rough shape regex
`/(?:\$\(|<\() [\s\S]*?\n\t?EOF\d+\n[^\n]*?(?:;|…)/` matches 6 of 400 commands at the default seed
and 249 of 30 000 across the 20 census seeds. Only the seed-101 row changes a verdict.

**Version provenance:** unverified. Only 5.3.20 is installed. bash's `CHANGES` (Homebrew
`share/doc/bash/CHANGES`) lists, in the 5.3-alpha section, *"gggg. Fix to command printing when
here-documents are attached to compound commands in lists"*. That is a plausible origin, not a
proven one. bash 5.0–5.2 are not measured.

### What exists today

- **Generator:** `engine/test-helpers/git-differential-harness.js`.
  - `TAGS` (L22–40) and `FALSE_BLOCK_TAGS` (L41–45).
  - `SYNTAX_EXEMPT_TAGS` (L47) and `PARSE_FAILURE_TAGS` (L48).
  - `fragment(text, { tags, status, simple, lineEnd, keywordLed, list })` (L70).
  - `closed(inner, closer)` (L77).
  - `SPECIALS` (L141–216), which includes `fragment('X=--ext-diff; git show $X', { list: true })` and
    `fragment('cat <( {git,push} origin )', { tags: [TAGS.braceInProcessSubstitution] })`.
  - `sequence` (L226): `op = left.lineEnd ? '\n' : pick(…)`.
  - `BRACE_EXPANSION` (L252) and `processSubstitutionTags(inner)` (L259). This is the precedent for
    a text test at the composer that writes the construct.
  - `nestedForms(inner)` (L262). It writes `echo $( ${closed(inner, ')')}` and `cat <( … )`.
  - `heredoc(generator, rng, depth)` (L285). Forms 3–5 write `$( ${closed(inner, ')')}` inside an
    unquoted heredoc body (two forms) and inside `cat <<< "$( … )"`.
  - Exports at L500.
- **Census:** `engine/test/guards/shell-git-invocations.differential.test.js`.
  - `problemsOf` (L53). An untagged false block is a problem (L62). A `parsed:false` result whose
    tags are not in `PARSE_FAILURE_TAGS` is a problem (L61).
  - The tag-reach test (L219) requires every `TAGS` value at the default seed.
  - The pinned-seed shape tests (L344–390) are test-side regexes, independent of the generator, for
    example `BRACE_IN_PROCESS_SUBSTITUTION` and `QUOTED_HEREDOC_AROUND_UNTERMINATED`.
- **Guard tokeniser:** `engine/src/guards/shell-tokeniser.js`.
  - `createContext(source, depth)` (L182) is per construct. Each `$( … )` gets a child context.
  - `SUBSTITUTION` (L417) is shared by `enterDollarParen` (L493) and `onAngle` `<(`/`>(` (L670).
  - `enterConstruct` (L442).
  - `enterBacktick` → `parseNested` (L465) is the backtick path and is not reprinted by bash.
  - `onHeredoc` (L575) records `context.heredocs`. `onNewline` (L629) reads the bodies.
  - `CHAR_HANDLERS` (L686) maps `';'` to `onBreak` (L293).
  - The fail-closed precedent is `ARITHMETIC_HEREDOC` (L8, `onHeredoc` L576), which returns
    `{ parsed: false, reason }`. Both predicates block on `parsed:false`.
- **Precedent:** ADR-661 (fix generator mis-models at the composer, tag shell behaviours at their
  construct, never exempt by stderr or command regex). Lesson 004 (re-run before calling it a race,
  tag where the generator builds it, check the unsafe mirror).

## Requirements

1. R1: at `GUARD_FUZZ_COUNT=1500` on the four batches (101,202,303,404,505 / 11,22,33,44,55 /
   66,77,88,99,111 / 271828,314159,161803,141421,173205), both arms (`/bin/bash` 3.2.57, first
   bash >= 5 on PATH = 5.3.20) report no problem.
2. R2: the seed-101 command is classified by a tag that the generator sets where it writes the
   construct. Classification never comes from stderr or from a regex over the whole command in the census.
3. R3: the tag is in `FALSE_BLOCK_TAGS` and appears in `TAGS`. The default seed reaches it, either
   generated or as a fixed special.
4. R4: a pinned-seed shape test proves that every generated command holding the construct carries
   the tag. The test uses its own regex, independent of the generator.
5. R5 (only under DC1-B or DC1-C): `echo $( H git; push origin )` and `echo $( H git show; --ext-diff )`
   block. The commit idiom (row 24) and every row the trigger excludes (2, 3, 11, 18, 19, 23) still
   parse as before.
6. R6: BACKLOG outcome rule. After the four-batch re-run on both shells, the group C entry
   "Run the engine differential fuzz at scale under bash >= 5" is closed if every arm is green, and
   the shell versions measured are recorded in the close note. If any arm is red, the entry stays open
   with its trigger narrowed to the uncovered bash-5 versions or residual constructs, and the evidence
   is quoted. Whether green also leaves a 5.0–5.2 trigger is DC3.
7. R7: no change to `/bin/bash` 3.2 verdicts outside the tagged construct.

## Design

### Tag

```js
// TAGS
heredocListInSubstitution: 'heredoc-list-in-substitution',
// FALSE_BLOCK_TAGS gains TAGS.heredocListInSubstitution
```

A comment at the tag says why: bash 5.3 reprints a `$( )`/`<( )` body and drops the first `;` after
a heredoc there. It carries no provenance reference.

### Where the tag is set (DC2-A shape)

There is one helper next to `processSubstitutionTags`. It is applied at every generator site that
writes `$( ${closed(inner, ')')}` or `<( …`:

```js
// bash 5.3 reprints a $( ) or <( ) body and drops the first ; after a heredoc in it, merging two commands.
const HEREDOC_THEN_SEMICOLON = /\n\t?EOF\d+\n[\s\S]*;/;
const reprintedBodyTags = (inner, tags = inner.tags) =>
  HEREDOC_THEN_SEMICOLON.test(inner.text) ? [...new Set([...tags, TAGS.heredocListInSubstitution])] : tags;
```

- `nestedForms`: `echo $( … )` uses `tags: reprintedBodyTags(inner)`. `cat <( … )` uses
  `reprintedBodyTags(inner, processSubstitutionTags(inner))`.
- `heredoc`: forms 3 and 4 put `$( … )` in an unquoted heredoc body. bash does not reprint those
  (row 22), so no tag is needed under DC1-A. Under DC1-B the tokeniser fail-closes there too, so
  those forms take the tag (see below). Form 5, `cat <<< "$( … )"`, takes the tag either way (row 17).
- Mid-line heredocs (`cat <<EOF1; …` on the operator line, row 12) are never generated. The
  `heredoc` composer always closes its line, so `\nEOF\d+\n` followed later by `;` is the
  generator's whole construct.
- The regex is a superset of bash's trigger. It also tags rows 14, 15 and 20/21 shapes when the
  generator builds them. Over-tagging can only exempt that one command's false block, and the
  pinned-seed test (R4) plus the census keep the predicate honest in the other direction.

### Fixed special for reach (R3)

The census at the default seed must reach the tag on both arms, and as a false block on 5.3. The
fixed entry pins the seed-101 shape:

```js
fragment("echo $( cat <<'EOFH'\nx\nEOFH\nX=--ext-diff; git show $X )", { tags: [TAGS.heredocListInSubstitution] }),
```

`/bin/bash` 3.2 runs `git show --ext-diff`, so the oracle blocks and nothing is reported. 5.3 runs
`git show`, so the false block is tagged.

### Guard change (DC1-B, recommended)

In `engine/src/guards/shell-tokeniser.js`:

```js
const HEREDOC_LIST_IN_SUBSTITUTION =
  'craft: command not parseable (a ; after a here-document inside $( ), <( ) or ${ } — bash 5.3 drops it) — denied fail-closed';

const SUBSTITUTION = Object.freeze({ …, reprinted: true });   // PARAMETER: reprinted false
// `${` followed by space, tab, newline or `|` is a function substitution: a command list,
// settled by breakCommand, `#` a comment, reprinted: true. Any other `${` stays PARAMETER (row 30).
const FUNCTION_SUBSTITUTION = Object.freeze({ openLength: 2, close: '}', settle: breakCommand, parameter: false, reprinted: true });
// createContext: heredocInBody: false ; enterConstruct copies `reprinted` to the child
// onHeredoc: if (context.reprinted) context.heredocInBody = true;
const onSemicolon = context =>
  context.heredocInBody ? fail(context, HEREDOC_LIST_IN_SUBSTITUTION) : onBreak(context);
// CHAR_HANDLERS: [';', onSemicolon]
```

- **Scope:** per child context. A heredoc in an inner `$( )` does not flag the outer body, and a `;`
  in an inner `$( )` is judged by that inner context. Both match rows 20 and 21. `( … )` and
  `{ …; }` inside the body share the context, which matches row 13.
- **Backticks** go through `parseNested`. That path creates no `reprinted` context, which matches
  row 18. Top level is not `reprinted`, which matches row 19.
- **Strings parsed again by the guard** (`bash -c '…'`, `eval '…'`) reach a `$(` through
  `SUBSTITUTION`, so they are covered. bash re-parses those strings with the same 5.3 parser.
- **Accepted over-blocks** (safe direction, all rare in agent commands):
  - the first `;` on the heredoc operator line (row 12, the `;` bash keeps);
  - `;` after a newline reset (row 15);
  - `;` inside an `if` (row 14);
  - `;;` in a `case`, and the `;` of `for ((…;…;…))`;
  - `$( … )` inside an unquoted heredoc body (row 22), because `scanExpansions` → `consumeDoubleQuoted`
    enters `SUBSTITUTION`.
- **Not flagged:** `&&`, `||`, `|`, `&`, and newline. None of them is dropped (rows 2, 3, 10, 11).
- **Census consequence:** the tag also joins `PARSE_FAILURE_TAGS`, because every tagged command now
  parses false. Under this option, heredoc forms 3 and 4 also take the tag, because the tokeniser
  fail-closes inside the unquoted-body comsub (row 22). The census's `parsed:false` check (L61) is
  the guard against a mismatch between generator and tokeniser. A `parsed:false` without the tag is
  reported loudly.
- **Bindings:** every binding consumes `parseShellCommands` through the two predicates, so no binding
  code changes. The rule is shell-agnostic: it blocks under 3.2 too, where the command is merely
  well-defined. That is the same stance as `ARITHMETIC_HEREDOC`.

### BACKLOG outcome rule

After implementation, run the four batches at 1500 on both arms under `nice -n 19`, one batch per
invocation. The result is recorded in the group C entry:

- **Green on both arms:** close the entry (move it to the closed section, per the BACKLOG
  convention). The note names bash 3.2.57 and 5.3.20, the four batches, and the new tag.
- **Red:** keep it open. Narrow the trigger to the uncovered bash-5 versions or the residual
  construct, and quote the failing line.

## Decision candidates

| # | Choice | Alternatives (≤3) | Recommendation | Why |
|---|---|---|---|---|
| DC1 | How to remove the seed-101 false block | **A.** Tag only: a new `heredoc-list-in-substitution` false-block tag set at the construct, with no guard change. **B.** Tag, plus the tokeniser fails closed on a `;` after a heredoc inside a `$( )`/`<( )` body; the tag also joins `PARSE_FAILURE_TAGS`. **C.** Tag, plus the guard models bash 5.3's merged reading as a second parse and blocks if either reading blocks. | **B** | A leaves a proven bash-5.3 fail-open (`$( H git; push origin )` runs `git push origin` and is allowed, rows 25–26), which lesson 004's mirror rule forbids exempting. C must reproduce an irregular printer bug (newline, `if` and nesting resets; rows 14, 15, 20), and any model drift fails open. B follows the `ARITHMETIC_HEREDOC` fail-closed precedent and costs nothing on the commit idiom (row 24). A generator-only fix that avoids the shape would delete coverage of a real shell divergence, so it is not offered. |
| DC2 | How the generator decides the tag | **A.** A regex over `inner.text` at each composer that writes `$( `/`<( ` (`reprintedBodyTags`, mirroring `processSubstitutionTags`). **B.** A structural fragment flag (`heredocOpen`) set by `heredoc` and propagated through `sequence` (cleared by `group`/`nest`, consumed when a `;` join follows). | **A** | A has a precedent in the same file and is a few lines. B is exact, but it adds a field and a propagation rule to every composer for a tag that may over-apply anyway. The census's `parsed:false` check (under DC1-B) and the R4 shape test catch any drift in A. |
| DC3 | BACKLOG close note when all arms are green | **A.** Close, and record 3.2.57 + 5.3.20 as measured. **B.** Close, plus a trigger-only line: "re-run on bash 5.0–5.2 when available". **C.** Keep the entry open until a 5.0–5.2 box exists. | **A** | Fold rather than file. The guard change (DC1-B) is shell-agnostic, so an older 5.x that does not drop the `;` only turns the tagged rows into tagged non-events. B or C would keep an untriggered entry alive for an unmeasured version. |

## Test strategy

- **Tokeniser unit** (`engine/test/guards/shell-tokeniser.test.js`, DC1-B). Add an `assertFails`
  block with `HEREDOC_LIST_IN_SUBSTITUTION` rows:
  - `echo $( cat <<'E'\nx\nE\nX=v; git show $X )`
  - `cat <( cat <<E\nx\nE\ntrue; git push )`
  - `echo "$( cat <<E\nx\nE\na; b )"`
  - `echo $( cat <<E\nx\nE\n( a; b ) )`
  - `bash -c 'echo $( cat <<E\nx\nE\na; b )'`

  Add `assertParses` rows for:
  - top-level `cat <<E\nx\nE\nX=v; git show $X`
  - the backtick form
  - `$( H a && b )`, `$( H a | b )`, `$( H a & b )`, `$( H a\nb )`
  - `$( X=v; H )`
  - `$( cat <<< x; a )`
  - `$( echo $( H ) ; a )`
  - the commit idiom
- **Predicate units** (`git-destructive-predicate.test.js`, `git-ext-diff-predicate.test.js`). The
  unsafe mirrors `echo $( H git; push origin )` and `echo $( H git show; --ext-diff )` block (R5).
- **Census** (`shell-git-invocations.differential.test.js`):
  - The tag-reach test (L219) picks up the new tag through the fixed special.
  - A new pinned-seed shape test, modelled on L374:
    *"Given the pinned seeds at scale, when generated, then every heredoc followed by a `;` inside `$( )` or `<( )` carries the heredoc-list-in-substitution tag"*.
    It uses its own regex: `(?:\$\(|<\()` opening before a `\n\t?EOF\d+\n` line that is followed
    by `;` before the closing `)`. It excludes `QUOTED_HEREDOC` bodies, as the brace test does.
- **Generator unit:** the fixed special appears in `generateCommands(seed, cap)` for any seed, as
  the existing "firing show and brace spellings are fixed entries" test pins.
- **Scale proof (later phase):**
  `GUARD_FUZZ_SEEDS=<batch> GUARD_FUZZ_COUNT=1500 nice -n 19 node --test engine/test/guards/shell-git-invocations.differential.test.js`
  runs four times, once per batch, each covering both arms. Output goes to a file, and only the
  summary plus any `::` line is read back. The seed-101 false block reports as the
  `heredoc-list-in-substitution` count in the bash >= 5 diagnostic line.
- **Mutation:** Stryker on `shell-tokeniser.js`, one module per run at concurrency 1, narrowed to
  `shell-tokeniser.test.js` plus the predicate suites.

## Out of scope

- bash 5.0–5.2 measurement: not installed. Provenance stays unverified (DC3).
- Reporting the printer bug upstream to bash: an external action, not a repo change.
- A generator leaf that splits a git invocation across `;` (rows 25–26 in the fuzz): the unit
  mirrors pin it, and the generator's whole-command leaves are the house model.
- zsh and dash arms: neither reprints `$( )` bodies through bash's printer, and the fuzz already
  runs `sh -c` bodies under dash on Linux CI.
