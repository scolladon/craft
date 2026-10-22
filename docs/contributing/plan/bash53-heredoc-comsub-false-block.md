# Plan — bash53-heredoc-comsub-false-block

> Source: design doc `docs/contributing/design/bash53-heredoc-comsub-false-block.md` · ADRs `684, 685, 686`
> (684, DC1-B, ratified: a new `heredoc-list-in-substitution` tag, and the tokeniser fails
> closed on a `;` after a heredoc inside a `$( )`/`<( )` body; the tag joins
> `PARSE_FAILURE_TAGS`. 685, DC2-A: the generator sets the tag with a text check at each
> `$( `/`<( ` writer, mirroring `processSubstitutionTags`. 686, DC3-A, ratified: when every
> arm is green, close the BACKLOG group C entry and record bash 3.2.57 + 5.3.20.)
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
| 1 | Tag the construct at the generator's substitution writers | test-infra, small (2 RED, 1 GREEN) | none | the fuzz harness, the census suite |
| 2 | Refuse a `;` after a heredoc inside a substitution body | pure-module, small (2 RED, 1 GREEN) | `engine/src/guards/shell-tokeniser.js` (~+12 / −3) | the tokeniser, its suite, both predicate suites, the harness (one line) |
| 3 | Run the scale census on both shells and close the BACKLOG entry | docs-only, small (no code) | none | BACKLOG.md |

Order is load-bearing. Part 1 lands first because it is green on its own: with the shipped
tokeniser, tagging only exempts false blocks (DC1-A state), and the seed-101 false block
is gone already. Part 2 then makes the tokeniser refuse the construct; in the same GREEN
the tag joins `PARSE_FAILURE_TAGS`, or the census at the default seed reports
`parsed:false on a command that is not unterminated or over-nested` for the fixed special
(measured: 2 failing tests, one per shell arm). Part 3 is the scale proof plus the BACKLOG
close. It edits no code.

Part 1 is standalone because it touches only engine/test-helpers and a census suite (no
`src/` delta). Folding it into Part 2 would put 6 files and 4 RED cycles in one part.

### Prototype evidence

Every edit below was applied to a throwaway `git clone` of the branch tip (`769704b`)
and checked there:

| Check | Result |
|---|---|
| Parts 1+2 applied, `npm --prefix engine test` | 4509 / 4509 pass |
| Parts 1+2 applied, `bash scripts/ci.sh` | exit 0. A first run failed once on the timing test `Given many git words before a push … in bounded time` (shell-git-invocations.test.js:115, 3380 ms against a 3000 ms cap, under `nice -n 19` load). The shipped tree varies 588–1838 ms on the same test. A second run was green. It is load, not this change. |
| Part 1 only, census `GUARD_FUZZ_SEEDS=20260,101 GUARD_FUZZ_COUNT=1500` | 40 / 40 pass, no `::` line |
| Parts 1+2, census `GUARD_FUZZ_SEEDS=101 GUARD_FUZZ_COUNT=1500` | 37 / 37 pass, 26 s wall. bash >= 5 arm: `"heredoc-list-in-substitution":2` false blocks (the fixed special plus the seed-101 command) |
| Parts 1+2, default seed bash >= 5 arm | `"heredoc-list-in-substitution":1` in the false-block diagnostic |
| Part 2 tokeniser without the `PARSE_FAILURE_TAGS` entry | census default seed: 2 fail, `parsed:false … :: "echo $( cat <<'EOFH'\nx\nEOFH\nX=--ext-diff; git show $X )"` |
| Pinned seeds (15 × 1500), Parts 1+2: tagged entries vs tokeniser refusals with the new reason | 83 tagged, 83 refused, 0 refused-but-untagged, 0 tagged-but-parsed |
| Shape regex (Part 1) on the pinned seeds | shipped harness: 3 matches, the seed-101 `EOF44` command among them, all untagged (RED). After Part 1: 65 matches (37 distinct), 0 untagged |
| Predicates on the unsafe mirrors, shipped tree | `echo $( cat <<'E'⏎hi⏎E⏎git; push origin )` and `… git show; --ext-diff )`: `{block:false}` from both predicates (RED). After Part 2: `{block:true, reason: <the new reason>}` from both |

## Public-surface decision

No new exported symbol.

- Tokeniser: `HEREDOC_LIST_IN_SUBSTITUTION`, `onSemicolon` and the context fields
  `reprinted` and `heredocInBody` are module-private. `parseShellCommands(command)` keeps its
  signature and `ParseResult` shape. The new refusal reason reaches users only as a deny
  reason through the two predicates, like `ARITHMETIC_HEREDOC`. No README, guide or adapter
  doc lists the tokeniser's refusal reasons (checked with `git grep` for the existing
  reasons and tag names: only the tokeniser, the harness, the two suites and lesson 004
  name them), so no doc surface changes.
- Harness: `HEREDOC_THEN_SEMICOLON` and `reprintedBodyTags` are module-private.
  `TAGS.heredocListInSubstitution` is a new value in the already-exported `TAGS` object
  (a test helper, consumed only by the census suite). The tag-reach test
  (`generator never reached ${tag}`) is that object's surface gate, and the fixed special
  pre-pays it in Part 1.
- Bindings: no binding code changes. Every binding consumes `parseShellCommands` through
  `gitDestructivePredicate` / `gitExtDiffPredicate`, which already block on `parsed:false`.

## Decision candidates

None. ADR-684, ADR-685 and ADR-686 settle every load-bearing choice. Details the design
left implicit are fixed here, not by a decision:

- The fixed special joins `SPECIALS` (composable), not `STANDALONE_SPECIALS`. The standalone
  list is for commands bash 3.2 rejects whole, and this one runs on both shells. Growing
  `SPECIALS` by one shifts which special each `pick` returns for every seed. The rng stream
  is unchanged (one draw per pick), so command structure is identical. The full suite and
  the seed-101 census were re-run on the shifted corpora (table above).
- `PARAMETER` gets an explicit `reprinted: false` beside `SUBSTITUTION`'s `reprinted: true`,
  and a GUARD row pins it (`echo ${x:-<<E;}` parses). Without the row, a Stryker
  `false → true` mutant there survives.
- The R4 shape regex in the census is a sound subset of the construct, not an exact model.
  It allows no paren between the opener and the heredoc operator, and none between the
  terminator and the `;`, so both sit in one substitution body. It asserts non-vacuity
  (`entries.length > 0`). It does not exclude quoted heredocs, unlike the brace test,
  because the seed-101 command itself is a quoted heredoc. Measured: 0 untagged matches
  at the pinned seeds.
- The predicate mirrors are split by predicate: `git; push origin` goes in the destructive
  suite, `git show; --ext-diff` in the ext-diff suite. Both predicates block both, because
  the refusal is a parse failure.

## Validation-phase notes

- Stryker: runner `tap` (engine/stryker.conf.json), `engine/src/**/*.js` in scope. Mutate
  only the Part 2 hunks of `engine/src/guards/shell-tokeniser.js` in ONE comma-separated
  `--mutate` value. Repeated flags drop all but the last. Check that the instrumented mutant
  count is at least the number of hunks. Narrow the corpus with an override config whose
  `tap.testFiles` lists engine/test/guards/shell-tokeniser.test.js,
  engine/test/guards/git-destructive-predicate.test.js,
  engine/test/guards/git-ext-diff-predicate.test.js and
  engine/test/guards/shell-git-invocations.test.js. Run it under `nice -n 19` at
  concurrency 1. Hand-check any survivor against that full set.
- Expected kills, each pinned by a Part 2 row: `createContext` `reprinted`/`heredocInBody`
  `false → true` (top-level and subshell GUARD rows); the `child.reprinted = reprinted`
  assignment removed (every FAIL row); `PARAMETER.reprinted` `false → true`
  (`echo ${x:-<<E;}`); `if (context.reprinted)` forced `true` (top-level row) or `false`
  (FAIL rows); the `onSemicolon` ternary forced either way (FAIL rows / the existing
  `git -C x diff; ls` row); the reason literal (exact-reason asserts). No equivalent mutant
  is expected. Do not pre-write an `equivalent mutant` comment.
- The harness (engine/test-helpers) and `*.differential.test.js` are outside Stryker's scope.
- Pre-existing and out of scope: a `case x in x) …` inside `$( … )` closes the
  substitution at the pattern's `)` in the tokeniser. This is shipped behaviour, seen while
  probing (`echo $( cat <<'E'⏎hi⏎E⏎case x in x) a;; esac )` parses). It is not a row in
  this plan.

## Part 1 — Tag the construct at the generator's substitution writers

Size class: test-infra, small. No `src/` delta.

### Context

**What changes.** The fuzz generator learns the `heredoc-list-in-substitution` tag. Every
writer of `$( … )`/`<( … )` tags its body when the body text holds a generator heredoc
terminator line followed later by a `;`. A fixed special pins the seed-101 shape, so every
seed reaches the tag. The tag is a false-block class, which removes the bash 5.3.20
seed-101 false block. Under the shipped tokeniser this part is green on its own.

**Files edited.**

- `engine/test-helpers/git-differential-harness.js` (521 lines, ESM).
  - `TAGS` (:22–40, frozen object). Add after `argvAppender: 'argv-appender',` (:39):
    `heredocListInSubstitution: 'heredoc-list-in-substitution',`.
  - `FALSE_BLOCK_TAGS` (:41–45). Append `TAGS.heredocListInSubstitution` after
    `TAGS.argvAppender,` on :44.
  - `PARSE_FAILURE_TAGS` (:48). Do NOT touch in this part (Part 2 adds the tag).
  - `SPECIALS` (:139–210). The last entry is
    `fragment('cat <( {git,push} origin )', { tags: [TAGS.braceInProcessSubstitution] }),`
    (:209). Add the fixed special after it (exact bytes below).
  - `STANDALONE_SPECIALS` (:213–215) and `FIXED_ENTRIES` (:216): untouched.
  - `processSubstitutionTags = inner => …` (:260–261). Add the helper right after it.
  - `nestedForms(inner)` (:263). Its first two forms (:265–266) write `echo $( … )` and
    `cat <( … )`.
  - `heredoc(generator, rng, depth)` (:285). Forms 3–5 (:291–293) write `$( … )` inside an
    unquoted heredoc body (`<<` and `<<-`) and inside `cat <<< "$( … )"`.
  - `fragment(text, { tags, … })` (:70) freezes `tags`. `closed(inner, closer)` (:77)
    puts a lineEnd fragment's closer on a new line. The generator's heredoc terminators are
    `EOF<n>` from `generator.nextId()`, optionally tab-led (`<<-` form).
- `engine/test/guards/shell-git-invocations.differential.test.js` (423 lines, node:test).
  - Census `problemsOf` (:53): an untagged false block is a problem (:62). An untagged
    `parsed:false` is a problem (:61).
  - Tag-reach test (:219–225) asserts every `TAGS` value occurs at the default seed. No edit.
  - `describe('shell-git-invocations — generator composition at scale')` (:292).
    - The fixed-entry test `… the firing show and brace spellings are fixed entries`
      (:293–305) has an `expected` array (:295–301) checked against
      `generateCommands(1, 100)`.
    - The shape-test constants block is :272–287. `QUOTED_HEREDOC_AROUND_UNTERMINATED` ends
      at :287, and `pinnedCommands` is :289. `offenders` is :290.
    - The model shape test is `… every quoted heredoc around an unterminated special carries
      the quote-in-heredoc-body tag` (:374–383). Insert the new test after it, before the
      `bash 3.2 rejects whole` test (:385).

**Read-only references.** The design's root-cause table (rows 1–27) and § Design. Lesson
docs/contributing/lessons/004-bash-3-2-brace-expands-across-process-substitution.md (tag
where the generator builds the construct). The precedent is `processSubstitutionTags`.

**Style.** node:test, Given/When/Then titles, AAA with blank lines between phases,
`const sut = …;` in every test. No provenance numbers (ADR, phase, backlog) in code,
comments or titles. Comments say why.

### TDD steps

1. **RED: the fixed special exists.** In the fixed-entry test's `expected` array (:295–301),
   add a last element:
   ~~~js
   "echo $( cat <<'EOFH'\nx\nEOFH\nX=--ext-diff; git show $X )",
   ~~~
   Fails today: `generateCommands(1, 100)` holds no such text, so the filtered list is
   `[ "echo $( cat <<'EOFH'…" ]`, not `[]`.

2. **RED: the construct always carries the tag (R4).** Add after
   `QUOTED_HEREDOC_AROUND_UNTERMINATED` (:286–287):
   ~~~js
   // No paren between the opener and the heredoc, nor between its terminator and the ;, so all three share one substitution body.
   const HEREDOC_LIST_IN_SUBSTITUTION = /(?:\$\(|<\() [^()\n]*?<<-?(['"]?)(EOF\w+)\1\n[\s\S]*?\n\t?\2\n[^()\n]*;/;
   ~~~
   and after the quote-in-heredoc-body test (:383):
   ~~~js

     it('Given the pinned seeds at scale, when generated, then every heredoc followed by a semicolon inside a substitution carries the heredoc-list-in-substitution tag', () => {
       const sut = pinnedCommands;

       const entries = sut().filter(entry => HEREDOC_LIST_IN_SUBSTITUTION.test(entry.text));
       const result = entries.filter(entry => !entry.tags.includes('heredoc-list-in-substitution')).map(entry => entry.text);

       assert.ok(entries.length > 0, 'the pinned seeds never built the construct');
       assert.deepEqual(result, []);
     });
   ~~~
   Fails today: the shipped generator has no such tag. The regex matches 3 commands,
   among them seed 101's `echo $( cat <<'EOF44'\necho x | xargs 'git' show x\nEOF44\nA=1 B=2 nohup …; git show $X )`,
   and all 3 are untagged.

3. **GREEN: the tag, the writers, the special.** In the harness:
   - `TAGS`: add `heredocListInSubstitution: 'heredoc-list-in-substitution',` after :39.
   - `FALSE_BLOCK_TAGS`: append `TAGS.heredocListInSubstitution` on :44.
   - `SPECIALS`: after :209 add
     ~~~js
       fragment("echo $( cat <<'EOFH'\nx\nEOFH\nX=--ext-diff; git show $X )", { tags: [TAGS.heredocListInSubstitution] }),
     ~~~
     /bin/bash 3.2 runs `git show --ext-diff`, so the oracle and the predicate agree that it
     blocks. bash 5.3.20 runs `git show`, so it is a tagged false block there.
   - After `processSubstitutionTags` (:260–261):
     ~~~js

     // bash 5.3 reprints a $( ) or <( ) body and drops the first ; after a heredoc in it, merging two commands.
     const HEREDOC_THEN_SEMICOLON = /\n\t?EOF\d+\n[\s\S]*;/;
     const reprintedBodyTags = (inner, tags = inner.tags) =>
       HEREDOC_THEN_SEMICOLON.test(inner.text) ? [...new Set([...tags, TAGS.heredocListInSubstitution])] : tags;
     ~~~
   - `nestedForms` :265–266 become
     ~~~js
         () => fragment(`echo $( ${closed(inner, ')')}`, { ...inner, status: 0, tags: reprintedBodyTags(inner) }),
         () => fragment(`cat <( ${closed(inner, ')')}`, { ...inner, status: 0, tags: reprintedBodyTags(inner, processSubstitutionTags(inner)) }),
     ~~~
   - `heredoc` forms :291–293: replace `tags: inner.tags` with `tags: reprintedBodyTags(inner)`
     in all three. Forms 3 and 4 (comsub in an unquoted heredoc body) are not reprinted by
     bash (design row 22). They take the tag because Part 2's tokeniser refuses them, as
     `scanExpansions` enters the same substitution path. Form 5 (`cat <<< "$( … )"`) is
     reprinted (row 17).
   - Leave the `bash -c`, `eval`, `sh -c`, `env -S` and backtick forms untagged. Backticks
     are not reprinted (row 18), and a quoted string carries the tag from its own inner
     writer.

   Steps 1–2 pass.

4. **GUARD: tag reach and generation stability.** The tag-reach test (:219) and
   `… generated twice, then both lists are identical` (:208) pass. The special is a fixed
   entry, so the default seed reaches the tag, and generation is still deterministic.

5. **GUARD: the census at the default seed and at seed 101.** At the default seed, both shell
   arms are green, and the bash >= 5 arm's diagnostic shows the tag as a false-block class.
   At `GUARD_FUZZ_SEEDS=101 GUARD_FUZZ_COUNT=1500` there is no `::` line (measured 40/40 with
   20260 included). These pass because the seed-101 false block is now tagged, and the
   shipped tokeniser still parses every tagged command.

No REFACTOR expected.

### Gate

```
nice -n 19 node --test engine/test/guards/shell-git-invocations.differential.test.js > <scratch>/p1-default.log 2>&1; echo exit $?
grep -E '^# (tests|pass|fail|skipped)' <scratch>/p1-default.log
GUARD_FUZZ_SEEDS=101 GUARD_FUZZ_COUNT=1500 nice -n 19 node --test engine/test/guards/shell-git-invocations.differential.test.js > <scratch>/p1-101.log 2>&1; echo exit $?
grep -E '^# (tests|pass|fail|skipped)' <scratch>/p1-101.log; grep -c ' :: ' <scratch>/p1-101.log
nice -n 19 bash scripts/ci.sh > <scratch>/p1-ci.log 2>&1; echo exit $?; tail -5 <scratch>/p1-ci.log
```

Expect exit 0 throughout, `skipped 0` (the bash >= 5 arm ran), and a `::` count of 0. If
`ci.sh` fails only on `Given many git words before a push … in bounded time`, re-run it
once. That test is load-sensitive (see Prototype evidence). Fix any other failure.

### Commit

`test(guards): tag a heredoc followed by a semicolon inside a substitution in the fuzz generator`

## Part 2 — Refuse a `;` after a heredoc inside a substitution body

Size class: pure-module, small.

### Context

**What changes.** bash 5.3.20 drops the first `;` after a heredoc inside a reprinted
`$( … )`/`<( … )`/`>( … )` body and merges the two commands around it. Off the generator's
grammar, that is a fail-open: `echo $( H git; push origin )` runs `git push origin` while
both predicates allow it. After this part, the tokeniser returns
`{ parsed: false, reason: HEREDOC_LIST_IN_SUBSTITUTION }` when a `;` follows a heredoc
operator in the same substitution-body context. Both predicates already block every
`parsed:false`. Scope is per context:

- A heredoc in an inner `$( )` does not flag the outer body, and a `;` in an inner `$( )`
  is judged by the inner context (design rows 20, 21).
- `( … )` and `{ …; }` inside the body share the body's context (row 13).
- Backticks (`parseNested`), the top level, `bash -c`/`eval` re-parses and `scanExpansions`
  scratch contexts are not reprinted, because `createContext` defaults to `false`. A `$(`
  met inside any of them still enters `SUBSTITUTION` and is reprinted.
- `&&`, `||`, `|`, `&` and newline are never refused (rows 2, 3, 10, 11).
- Accepted over-blocks: the `;` on the heredoc operator line, a `;` after a newline reset,
  a `;` inside an `if` body, and a comsub in an unquoted heredoc body (rows 12, 14, 15, 22).

**Files edited.**

- `engine/src/guards/shell-tokeniser.js` (716 lines, ESM).
  - Reason constants block :8–19. `ARITHMETIC_HEREDOC` (:8–9) is the precedent. Add after
    it:
    ~~~js
    const HEREDOC_LIST_IN_SUBSTITUTION =
      'craft: command not parseable (a ; after a here-document inside $( ) or <( ) — bash 5.3 drops it) — denied fail-closed';
    ~~~
  - `createContext(source, depth)` (:182–201). Add `reprinted: false,` and
    `heredocInBody: false,` after `heredocs: [],` (:199).
  - `SUBSTITUTION` (:417) becomes
    `Object.freeze({ openLength: 2, close: ')', settle: breakCommand, parameter: false, reprinted: true })`.
    `PARAMETER` (:419) gains `reprinted: false`.
  - `enterConstruct(context, { openLength, close, settle, parameter })` (:442). Destructure
    `reprinted` too, and add `child.reprinted = reprinted;` after `child.parameter = parameter;`.
    It is shared by `enterDollarParen` (:493, `$(`) and `onAngle` (:669, `<(`/`>(`).
    `consumeDoubleQuoted` (:365) reaches `$(` inside `"…"` and unquoted heredoc bodies
    through `onDoubleQuotedDollar` → `expandDollar`.
  - `onHeredoc` (:575–585; three `equivalent mutant` comment lines sit above it at :572–574, keep them).
    Add `if (context.reprinted) context.heredocInBody = true;` as its last line.
  - New `onSemicolon` after `onHeredoc`, with a why-comment:
    ~~~js
    // bash 5.3 reprints a substitution body and drops the first ; after a heredoc there, merging two commands.
    const onSemicolon = context =>
      context.heredocInBody ? fail(context, HEREDOC_LIST_IN_SUBSTITUTION) : onBreak(context);
    ~~~
    `fail(context, reason)` (:279) keeps the first reason. `onBreak` (:293) is the shipped
    `;` handler.
  - `CHAR_HANDLERS` (:684): `[';', onBreak]` → `[';', onSemicolon]`. `'|'` stays `onBreak`.
- `engine/test/guards/shell-tokeniser.test.js` (574 lines).
  - Helpers: `dyn`/`word`/`cmd`/`parsed` (:5–8), `assertParses(rows)` (:14, rows of
    `[input, [[words…]…]]` with static words), `cmdOf`/`assertParsesWords` (:125–138,
    mixed `'text'` / `dyn('text')` words), `assertFails(rows)` (:379, rows of
    `[input, reason]`; it is defined there, so the new block must come after :389).
  - Append the new describe block at the end of the file (after :574).
  - Existing rows that must stay green unedited: `git -C x diff; ls` (:28), the commit
    idiom test (:264–273), `cat <<EOF;git diff\nEOF\ngit log` (:561, top level),
    `true && (cat <<EOF\nx\nEOF\n)` (:544).
- `engine/test/guards/git-destructive-predicate.test.js` (570 lines). It imports
  `gitInvocations` (:4). Describe `… unparseable, unclassifiable and dynamic input` (:152)
  has the model test at :153–160 (block with `gitInvocations(cmd).reason`, `assert.match`).
  `… routine git passes` (:199) has a command list :200–214, and the commit idiom is :207.
- `engine/test/guards/git-ext-diff-predicate.test.js` (674 lines). Describe
  `… fail-closed verdicts` (:291) has a row list :292–296 of `[command, exact reason]`.
- `engine/test-helpers/git-differential-harness.js`. `PARSE_FAILURE_TAGS` (:48), one-line
  edit. Part 1 also edits this file, and the parts stay separate on purpose. Part 1 is green
  under the shipped tokeniser. This entry is the opposite: it must land in the same GREEN as
  the refusal, because the census goes red when the refusal lands without it.

**Read-only references.** The design's rows 1–27 (behaviour on 3.2.57 and 5.3.20).
engine/src/guards/git-destructive-predicate.js and engine/src/guards/git-ext-diff-predicate.js
already block on `parsed:false`, so do not edit them. The census
engine/test/guards/shell-git-invocations.differential.test.js :61 reports any untagged
`parsed:false`.

### TDD steps

1. **RED: the construct is refused.** Append to the tokeniser suite:
   ~~~js

   const HEREDOC_LIST_IN_SUBSTITUTION =
     'craft: command not parseable (a ; after a here-document inside $( ) or <( ) — bash 5.3 drops it) — denied fail-closed';

   describe('parseShellCommands() — a semicolon after a heredoc inside a substitution body', () => {
     assertFails([
       ["echo $( cat <<'E'\nx\nE\nX=v; git show $X )", HEREDOC_LIST_IN_SUBSTITUTION],
       ['cat <( cat <<E\nx\nE\ntrue; git push )', HEREDOC_LIST_IN_SUBSTITUTION],
       ['echo "$( cat <<E\nx\nE\na; b )"', HEREDOC_LIST_IN_SUBSTITUTION],
       ['echo $( cat <<E\nx\nE\n( a; b ) )', HEREDOC_LIST_IN_SUBSTITUTION],
       ["bash -c 'echo $( cat <<E\nx\nE\na; b )'", HEREDOC_LIST_IN_SUBSTITUTION],
       ['cat <<F\n$( cat <<E\nx\nE\na; b )\nF', HEREDOC_LIST_IN_SUBSTITUTION],
       ['echo $( cat <<E; a\nx\nE\n)', HEREDOC_LIST_IN_SUBSTITUTION],
       ['echo $(cat <<E\nx\nE\na\nb; c)', HEREDOC_LIST_IN_SUBSTITUTION],
     ]);
   });
   ~~~
   Fails today: every row parses (`parsed: true` with its commands).

2. **GUARD: everything outside the trigger still parses (R5, R7).** Inside the same
   describe, after the `assertFails` call:
   ~~~js
     assertParses([
       ['cat <<E\nx\nE\na; b', [['cat'], ['a'], ['b']]],
       ['(cat <<E\nx\nE\na; b)', [['cat'], ['a'], ['b']]],
     ]);

     assertParsesWords([
       ['echo `cat <<E\nx\nE\na; b`', [['cat'], ['a'], ['b'], ['echo', dyn('`cat <<E\nx\nE\na; b`')]]],
       ['echo $(cat <<E\nx\nE\na && b)', [['cat'], ['a'], ['b'], ['echo', dyn('$(cat <<E\nx\nE\na && b)')]]],
       ['echo $(cat <<E\nx\nE\na | b)', [['cat'], ['a'], ['b'], ['echo', dyn('$(cat <<E\nx\nE\na | b)')]]],
       ['echo $(cat <<E\nx\nE\na & b)', [['cat'], ['a'], ['b'], ['echo', dyn('$(cat <<E\nx\nE\na & b)')]]],
       ['echo $(a; cat <<E\nx\nE\n)', [['a'], ['cat'], ['echo', dyn('$(a; cat <<E\nx\nE\n)')]]],
       ['echo $(cat <<< x; a)', [['cat'], ['a'], ['echo', dyn('$(cat <<< x; a)')]]],
       ['echo $(echo $(cat <<E\nx\nE\n); a)', [['cat'], ['echo', dyn('$(cat <<E\nx\nE\n)')], ['a'], ['echo', dyn('$(echo $(cat <<E\nx\nE\n); a)')]]],
       ['echo $(cat <<E\nx\nE\necho $(a; b))', [['cat'], ['a'], ['b'], ['echo', dyn('$(a; b)')], ['echo', dyn('$(cat <<E\nx\nE\necho $(a; b))')]]],
       ['echo ${x:-<<E;}', [['x:-'], ['echo', dyn('${x:-<<E;}')]]],
       ['git commit -m "$(cat <<\'EOF\'\nfix: a; b\nEOF\n)"', [['cat'], ['git', 'commit', '-m', dyn('$(cat <<\'EOF\'\nfix: a; b\nEOF\n)')]]],
     ]);
   ~~~
   Every row passes today (exact outputs measured on the shipped tokeniser and on the
   prototype). They pin the GREEN's scope: top level, subshell, backticks, non-`;`
   connectors, `;` before the heredoc, here-string, inner and outer comsub scopes, a
   `${ }` body (not reprinted), and the commit idiom with a `;` in its body.

3. **RED: the unsafe mirrors block (R5).**
   - Destructive suite, inside `… unparseable, unclassifiable and dynamic input` after the
     unterminated-quote test (:160):
     ~~~js

       it('Given a heredoc then git; push inside a substitution, when checked, then blocks with the parse reason', () => {
         const sut = gitDestructivePredicate;
         const command = "echo $( cat <<'E'\nhi\nE\ngit; push origin )";

         const result = sut(command);

         assert.deepEqual(result, { block: true, reason: gitInvocations(command).reason });
         assert.match(result.reason, /here-document/);
       });
     ~~~
     Also add `'git commit -m "$(cat <<\'EOF\'\nfix: a; b\nEOF\n)"',` to the routine-passes
     list after :207. That is a GUARD: it passes today and after.
   - Ext-diff suite, `… fail-closed verdicts` rows (:292–296), add:
     ~~~js
         ["echo $( cat <<'E'\nhi\nE\ngit show; --ext-diff )", 'craft: command not parseable (a ; after a here-document inside $( ) or <( ) — bash 5.3 drops it) — denied fail-closed'],
     ~~~
   Fails today: both predicates return `{ block: false }`. The tokeniser reads `git` and
   `push` (or `--ext-diff`) as two commands, as bash 3.2 does. bash 5.3.20 runs
   `git push origin` and `git show --ext-diff`.

4. **GREEN: the refusal.** Apply the tokeniser edits listed in Context: the reason constant,
   the two `createContext` fields, `reprinted` on `SUBSTITUTION`/`PARAMETER`, the
   `enterConstruct` copy, the `onHeredoc` flag line, `onSemicolon`, and the `CHAR_HANDLERS`
   entry. In the same step, append `TAGS.heredocListInSubstitution` to `PARSE_FAILURE_TAGS`
   (harness :48). Without it the census at the default seed reports
   `parsed:false on a command that is not unterminated or over-nested` for the fixed
   special (measured, both arms). Steps 1 and 3 pass, step 2 stays green.

5. **GUARD: the census.** The default seed is green on both arms (the bash >= 5 diagnostic
   shows `"heredoc-list-in-substitution":1`). `GUARD_FUZZ_SEEDS=101 GUARD_FUZZ_COUNT=1500`
   gives 37/37 with no `::` line. At the pinned seeds, every tagged command is refused and
   every refused one is tagged (83/83). The writer regex may over-tag elsewhere, which the
   design accepts: an over-tag only exempts that one command.

No REFACTOR expected.

### Gate

```
(cd engine && node --test test/guards/shell-tokeniser.test.js test/guards/git-destructive-predicate.test.js test/guards/git-ext-diff-predicate.test.js test/guards/shell-git-invocations.test.js) > <scratch>/p2-units.log 2>&1; echo exit $?
grep -E '^# (tests|pass|fail)' <scratch>/p2-units.log
GUARD_FUZZ_SEEDS=101 GUARD_FUZZ_COUNT=1500 nice -n 19 node --test engine/test/guards/shell-git-invocations.differential.test.js > <scratch>/p2-101.log 2>&1; echo exit $?
grep -E '^# (tests|pass|fail|skipped)' <scratch>/p2-101.log; grep -c ' :: ' <scratch>/p2-101.log
nice -n 19 bash scripts/ci.sh > <scratch>/p2-ci.log 2>&1; echo exit $?; tail -5 <scratch>/p2-ci.log
```

Expect exit 0, `skipped 0`, and a `::` count of 0. The bounded-time flake rule from Part 1
applies.

### Commit

`fix(guards): fail closed on a semicolon after a heredoc inside a substitution body`

## Part 3 — Run the scale census on both shells and close the BACKLOG entry

Size class: docs-only, small. No code edit. The census run is the proof, the BACKLOG edit
the deliverable.

### Context

**What changes.** R1 and R6. The four seed batches run at `GUARD_FUZZ_COUNT=1500` on both
arms, and the group C entry is closed per ADR-686, or kept open with a narrowed trigger if
red.

**Files edited.**

- `BACKLOG.md`. Section `### Open — C. Waiting on an external trigger` (:252). The entry is
  the paragraph starting `**Run the engine differential fuzz at scale under bash >= 5.**`
  (:254–260), ending `Not folded: waits on an external trigger.`. The next entry starts
  `**Drop the \`typed-rest-client\` override …` (:262). The house close convention is in
  groups A and B (:178–205): the closed entry's paragraph is removed and replaced by a
  `Delivered <date> (<run slug>): …` paragraph at the top of the group, which cites the
  ADRs. scripts/backlog-lint.sh (run by `ci.sh` via scripts/static-lints.sh and by
  test/backlog-lint.test.js) gates the file.

**Shell arms.** `/bin/bash --version` → `GNU bash, version 3.2.57(1)-release`. The bash >= 5
arm is the first bash >= 5 on PATH (`/opt/homebrew/bin/bash` → `GNU bash, version 5.3.20(1)-release`).
Record both version strings from the box at run time. Do not copy them from here.

**Census mechanics** (engine/test/guards/shell-git-invocations.differential.test.js,
read-only).

- `GUARD_FUZZ_SEEDS` is a comma list and `GUARD_FUZZ_COUNT` the per-seed cap.
- Per seed, there are two shell tests (`/bin/bash`, `the first bash >= 5 on PATH`), each
  with a 60 s timeout, and one Leg B git test. With the generator-level tests that makes
  49 tests per 5-seed batch. Running 15 seeds in one invocation hit the 60 s per-test timeout, so run one
  batch per invocation.
- A skipped bash >= 5 arm shows as `# skipped` > 0 and does not count as green.

### TDD steps

1. **GUARD: batch 1 (101,202,303,404,505)**, `nice -n 19`, output to a file (command in
   Gate). It passes because Parts 1–2 tag and refuse the only bash 5.3 divergence seen at
   scale (seed 101 measured 37/37 after Part 2). Expect `# tests 49`, `# pass 49`,
   `# skipped 0`, no `::` line.
2. **GUARD: batch 2 (11,22,33,44,55)**, same expectation.
3. **GUARD: batch 3 (66,77,88,99,111)**, same expectation.
4. **GUARD: batch 4 (271828,314159,161803,141421,173205)**, same expectation.
   From each log keep the two `generated 1500, invoked …, false blocks {…}` diagnostic lines
   per seed, for the handback only. They are not written into BACKLOG.
   - **If a batch is red:** re-run that unchanged batch twice before judging it
     (intermittent-failure rule). If it is deterministic, do NOT close the entry. Apply
     ADR-686's red branch instead: keep the entry, narrow its **Trigger:** to the residual
     construct or the uncovered versions, quote the failing `::` line verbatim, and commit
     with the red-branch message below. Then hand back a blocker
     `{ unit: Part 3, reason: <the :: line>, options: fold a generator/guard fix in-run |
     tag it at its construct per ADR-661 | leave the narrowed entry }`. Never commit on a
     red `ci.sh`.
5. **GREEN (all four green): close the entry.** Delete the paragraph :254–260. In its place,
   as the first paragraph under `### Open — C. Waiting on an external trigger`, write
   (wrap to the file's ~100-column prose width; fill the versions from step 1's run, and
   use the run's date if it is not 2026-10-22):
   ~~~md
   Delivered 2026-10-22 (bash53-heredoc-comsub-false-block): the engine differential fuzz at
   `GUARD_FUZZ_COUNT=1500` is green on both shell arms, /bin/bash 3.2.57 and bash 5.3.20, over
   the four seed batches 101,202,303,404,505 / 11,22,33,44,55 / 66,77,88,99,111 /
   271828,314159,161803,141421,173205 (49 tests per batch, none skipped). bash 5.3 reprints a
   `$( )`/`<( )` body and drops the first `;` after a heredoc in it, merging the two commands
   around it. The guard now refuses that `;` fail-closed, and the generator tags the
   construct `heredoc-list-in-substitution` (ADR-684, ADR-685, ADR-686). bash 5.0–5.2 were not
   measured.
   ~~~
   Leave every other group C entry unchanged.

### Gate

One batch per invocation, from the worktree root. `<scratch>` is a scratch directory
outside the repo:

```
GUARD_FUZZ_SEEDS=101,202,303,404,505 GUARD_FUZZ_COUNT=1500 nice -n 19 node --test engine/test/guards/shell-git-invocations.differential.test.js > <scratch>/b1.log 2>&1; echo exit $?
GUARD_FUZZ_SEEDS=11,22,33,44,55 GUARD_FUZZ_COUNT=1500 nice -n 19 node --test engine/test/guards/shell-git-invocations.differential.test.js > <scratch>/b2.log 2>&1; echo exit $?
GUARD_FUZZ_SEEDS=66,77,88,99,111 GUARD_FUZZ_COUNT=1500 nice -n 19 node --test engine/test/guards/shell-git-invocations.differential.test.js > <scratch>/b3.log 2>&1; echo exit $?
GUARD_FUZZ_SEEDS=271828,314159,161803,141421,173205 GUARD_FUZZ_COUNT=1500 nice -n 19 node --test engine/test/guards/shell-git-invocations.differential.test.js > <scratch>/b4.log 2>&1; echo exit $?
for f in <scratch>/b[1-4].log; do echo "$f"; grep -E '^# (tests|pass|fail|skipped)' "$f"; grep -c ' :: ' "$f"; done
nice -n 19 bash scripts/ci.sh > <scratch>/p3-ci.log 2>&1; echo exit $?; tail -5 <scratch>/p3-ci.log
```

Each batch: exit 0, `tests 49`, `pass 49`, `skipped 0`, `::` count 0. Then `ci.sh` exits 0
(backlog-lint included). Give each batch command a tool timeout of at least 10 minutes.

### Commit

Green: `docs(backlog): close the bash 5 scale census entry on bash 3.2.57 and 5.3.20`

Red branch (entry kept open): `docs(backlog): narrow the bash 5 scale census trigger to the residual construct`
