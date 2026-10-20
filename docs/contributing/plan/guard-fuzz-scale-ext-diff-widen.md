# Plan — guard-fuzz-scale-ext-diff-widen

> Source: design doc `docs/contributing/design/guard-fuzz-scale-ext-diff-widen.md` · ADRs `660, 661`
> (660 ratified by the user: DC-1 option (b-i), deny a literal `--ext-diff` (last ext-diff setting
> before `--`) on every git verb, and deny any `git config` invocation whose arguments name an
> `alias`/`alias.*`/`include.path`/`includeIf.*` key, reads included, value-blind; 661 adopted as
> recommended: scaled-fuzz false blocks are fixed in the generator, tagged at the construct when
> bash 3.2 itself diverges, and the predicates do not change for that entry)
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

## Plan shape (4 parts, in order)

| # | Part | src delta | Files | Design section | Size |
|---|---|---|---|---|---|
| 1 | Scaled census becomes a gate: composer fixes C2-C4, construct tags C1/C6 | none (test-infra-only) | 2 | Design Part 1, Test strategy Part 1, R1-R3 | differential-test |
| 2 | `--ext-diff` denied on every git verb; oracle `extDiff` widened in lock-step | engine/src/guards (+~25) | 6 | Design Part 2 §2a, §2c (ext-diff half), R4-R7 | pure-module |
| 3 | `git config` naming an alias/include key denied; oracle `configured` widened in lock-step | engine/src/guards (+~15) | 6 | Design Part 2 §2b, §2c (config half), R4-R7 | pure-module |
| 4 | Binding pins on the codex/copilot hook surfaces + living docs (scope, reasons, residuals) | none (docs + GUARD pins) | 6 | Design Part 2 §2d, R8 | docs-prose |

How the design lands here:

- The design's "Part 2" is split three ways because it touches 13 files: Part 2 (rule 2a), Part 3
  (rule 2b) and Part 4 (binding-surface pins and docs). Each rule part carries its own oracle
  widening and its own `VERBS` additions, so `judgeArgv` widens in the same part as the predicate
  (R5) and no part leaves the differential suites red.
- The verdict-matrix acceptance target is the design's "after (b-i)" column, rows M1-M23. Row
  ownership: M1-M12 and M22 in Part 2, M13-M21 in Part 3, M23 untouched (GUARD), every row pinned
  again at the codex/copilot hook surface in Part 4 where the design's test strategy asks for it.
- Parts 2 and 3 both edit shell-git-invocations.js, its unit suite, the harness and the Claude hook
  test (plan-lint's cognitive-locality warning): they stay separate because each lands one rule half
  with its own oracle half and its own `VERBS` rows, so each RED in the differential suite names
  exactly one rule; merged, the part would exceed both the 6-file ceiling and 5 RED cycles. Part 1
  shares the harness for the same reason: R3 forbids a src delta in the census part.
- Fresh seeds for R1, picked here and never run before (grep of the tree: no hit):
  `271828,314159,161803,141421,173205`. The Pinned F seeds: `101,202,303,404,505,11,22,33,44,55,66,77,88,99,111`.
  Each scaled run's seeds and its pass/fail line go in the part's handback, never in code.
- Untouched: BACKLOG.md (the two "Open — A" entries leave at the documentation phase, not in a
  part); engine/src/guards/git-argv.js, git-plain-command-gate.js, git-bash-verdict.js,
  git-destructive-predicate.js (it already calls `configChannelReason` first, so it inherits the
  alias-key deny with no edit); adapters/*/src (codex and copilot reach the rule through
  `plainGitCommandVerdict`, Claude/opencode/pi/antigravity/cursor through `gitExtDiffPredicate`);
  engine/test-helpers/plain-gate-generator.js (copilot's generator emits no `--ext-diff`/`config`
  shapes; its arm is green at scale with the shared oracle, design §Context).
- Mutation (design §Mutation) runs in the validation phase, not in a part gate: Stryker over
  engine/src/guards/git-ext-diff-predicate.js, then separately engine/src/guards/shell-git-invocations.js,
  `--concurrency 1`, one comma-joined `--mutate`, narrowed corpus on a worker-exit dry run.
- Public surface, decided per symbol (no barrel, facade, registry or generated API report exists
  for engine/src/guards; the only downstream surfaces are the docs Part 4 edits):
  - `CONFIG_ALIAS_WRITE_REASON` (Part 3) — PUBLIC module export of shell-git-invocations.js,
    beside `INLINE_ALIAS_REASON` and `CONFIG_CHANNEL_REASON`; consumed by engine tests. NOT
    re-exported by adapters/opencode/src/git-guard-predicate.js (it re-exports the predicate only).
    Surface gate: docs/contributing/specs/gate.md reason lists (Part 4).
  - `REASON_EXT_DIFF_OPTION` (Part 2) — INTERNAL, unexported, like `REASON_GIT_EXT_DIFF`; tests
    pin the literal string. Surface gate: gate.md reason lists (Part 4).
  - `isExtDiffSetting`, `enablesExtDiff` (Part 2), `isAnchorToken` (Part 2), `isAliasKeyText`,
    `namesAliasKey` (Part 3) — INTERNAL module functions.
  - `mentionsExtDiff` (Part 2) — INTERNAL, a non-enumerable invocation property beside
    `injectsConfig`, so every `assert.deepEqual` over `gitInvocations(...)` output stays unchanged.
  - Harness (Part 1): `SYNTAX_EXEMPT_TAGS` — PUBLIC export of the test helper (consumer: the engine
    differential suite); `TAGS.braceInProcessSubstitution`, `TAGS.quoteInHeredocBody` — new values
    of the exported `TAGS`; the "every tag reached" test is their surface gate (two new `SPECIALS`).

Pre-validated in mktemp throwaway copies of this branch (`33682b2`), with the GREEN shapes below
applied (copy A: Parts 2+3 code; copy B: Part 1 code only):

| Check | Result |
|---|---|
| Copy A: engine/test/guards/*.test.js + engine/test/claude-ext-diff-hook-main.test.js (incl. the engine differential at seed 20260/400 with the six new `VERBS`) | 967 pass / 0 fail |
| Copy A: codex git-guard suites / copilot git-guard suites / root test/git-no-ext-diff.differential.test.js | 111 / 107 / 1 pass, 0 fail |
| Copy A: matrix M1-M23 in-process (`gitExtDiffPredicate`, `plainGitCommandVerdict`, `gitDestructivePredicate`) | every row equals the design's "after (b-i)" column |
| Copy A with only the `extDiff` oracle half reverted (Part 2 RED 4) | engine differential red: 18 × "unexpected false block" |
| Copy A with only the `configured` oracle half reverted (Part 3 RED 4) | engine differential red: 17 × "unexpected false block" |
| Copy A cap pins | 300 × `git status ` parsed; 256 × `git log --ext-diff ` parsed; 257 × `git log --ext-diff ` and 257 × `git config user.name x ` too-many |
| Today's generator, Pinned F seeds × 1500 (Part 1 RED shapes) | pipe→`f() {` 22, pipe→assignment list 41, `in (x) time ` 11, `env -S 'time ` 3, `git push' \| ` 44, quoted-heredoc around an unterminated special 11 |
| Copy B, same seeds: same shapes | all 0; every brace-in-`cat <(` command outside a quoted heredoc tagged, every quoted heredoc around an unterminated special tagged |
| Copy B census, /bin/bash 3.2.57, Pinned F × 1500 in three batches of five seeds / fresh × 1500 / default seed | 26/26/26 pass, 0 fail, 0 problems / 26 pass, 0 fail, 0 problems (~21 s) / 18 pass, 0 fail; invoked 1333-1361 of 1500 per seed (floor 750); new-tag false blocks over the 20 seeds: brace-in-process-substitution 90, quote-in-heredoc-body 24 |
| Copy B census, all 15 Pinned F seeds in ONE invocation | every seed test hit the 60 s per-test timeout (the fuzz describe runs every seed concurrently, 8 shells each), 0 problems reported: run the census in batches of five seeds |
| Not pre-validated | the scaled census with Parts 1-3 combined (copy A ran the default seed only); Parts 2 and 3 run it in their gates |

## Decision candidates

One load-bearing choice surfaced during planning that the design and ADRs do not cover as measured.
Part 1 is written for the recommendation; a different pick changes only its GREEN 5 and the
`FALSE_BLOCK_TAGS` line.

| # | Choice | Alternatives (≤3) | Recommendation | Why |
|---|---|---|---|---|
| DC-P1 | Whether the new `quote-in-heredoc-body` tag also exempts false blocks (design §Part 1 says: syntax-exempt only, not in `FALSE_BLOCK_TAGS`) | (a) syntax-exempt AND false-block-exempt, exactly as `unterminated` already is. (b) As designed (syntax-exempt only), and keep the new SPECIAL out of the compose pick pool (a standalone head entry). (c) Drop the construct: the quoted-delimiter heredoc forms are not offered for an inner carrying `unterminated`; no new tag, no new SPECIAL | (a) | Measured in copy B: with the tag syntax-exempt only, 19 of the 21 census failures (Pinned F + fresh, 1500) were "unexpected false block" on commands holding the C6 construct beside a destructive leaf. bash 3.2 rejects the whole command and runs nothing, so every sibling block is a false block by construction: the same reason `unterminated` sits in both lists. (b) fixes only the SPECIAL: a generated C6 command with a destructive sibling fails the same way at some seed. (c) removes the odd-quote heredoc body from the predicate's bash-5 coverage, which the design keeps on purpose. Cost of (a): a false block elsewhere in a command holding the construct is hidden, the existing trade-off of the tag model ("a tag exempts the whole command") |

## Part 1 — Scaled census becomes a gate (generator composer fixes + construct tags)

### Context

Test-infra-only part (R3: no file under engine/src or adapters/*/src changes). Files:
`engine/test-helpers/git-differential-harness.js` and
`engine/test/guards/shell-git-invocations.differential.test.js`.

Why: at `GUARD_FUZZ_COUNT=1500` the engine census reports 16 safe-direction false blocks and 2
"invalid shell" entries (design §Pinned F). Causes and the fix rule (ADR-661: composer fix first,
construct tag second, no stderr-text exemption beyond the existing `SYNTAX_ERROR`/`SHELL_REJECTED`):

| Class | Root cause | Fix |
|---|---|---|
| C2 | `sequence` op `\|` splices a right fragment that is a command list (`… \| f() { …; }; f`, `… \| G=git; nohup $G push`): the definition/assignment lands in the pipeline subshell | `fragment` gains `list`; pipe braces a `keywordLed` or `list` right |
| C4 | a non-simple left writes to stdout before git; the reader does not read; SIGPIPE kills the writer first | pipe sends a non-`simple` left to the null device: `{ left ; } >/dev/null \| right` |
| C3 | bash 3.2 reads `time` after a case pattern as /usr/bin/time; `time`/`!` groupers spread `simple: true`, so `nestedForms` offers `env -S` | `time`/`!` groupers set `simple: false`; case grouper braces a `keywordLed` inner |
| C1 | bash 3.2 brace-expands across the whole `<( … )` word | tag `brace-in-process-substitution` set by the `cat <(` nested form |
| C6 | bash 3.2 cannot close a `$( … )` holding a heredoc whose body has an odd quote, so it runs NOTHING of that command | tag `quote-in-heredoc-body` set by the two quoted-delimiter `heredoc` forms; the tag is syntax-exempt AND false-block-exempt (Decision candidate DC-P1) |
| C5 | a leaf modelled with status 0 fails, so a following `&&` skips the right side: `ls *.md` exits 1 in the empty run dir; `bash -lc 'git status'` exits 128 on macOS (the login shell's /etc/profile path_helper puts /usr/bin first, so real git runs outside any repo) | the two SPECIALS become always-succeeding: `echo *.md`, `bash -lc 'git status \|\| true'` |

Current code (engine/test-helpers/git-differential-harness.js, line numbers at `33682b2`):

- `TAGS` L22-37 (frozen object, kebab-case values), `FALSE_BLOCK_TAGS` L38-41, `PARSE_FAILURE_TAGS` L42.
- `fragment(text, { tags = [], status = 0, simple = false, lineEnd = false, keywordLed = false } = {})` L64
  → frozen `{ text, tags, status, simple, lineEnd, keywordLed }`. Add `list = false` to both.
- `closed(inner, closer)` L71: puts the closer on a new line when `inner.lineEnd`. Use it for every
  new brace.
- `SPECIALS` L127-192. The 17 with a top-level `;` or newline get `list: true`: L128-137 (`H=--hard; …`,
  `H=--soft; …`, `D=-D; …`, `D=-d; …`, `P=push; git $P HEAD`, `D=diff; …`, `S=status; …`,
  `G=git; $G push`, `G=git; $G status`, `X=echo; $X push`), L141 `P=push; git $P`, L165
  `echo ${#x}; git push\necho }`, L166 `(( x = 1 << 2 ))\ngit push`, L172-175 (`G=git; command/exec/nohup $G push`,
  `G=git; command $G diff`). Rewrite two status-mis-modelled SPECIALS (C5): L187 `ls *.md` → `echo *.md`
  (still a non-git glob word; `echo` always exits 0, `ls` exits 1 on no match, and a status-1 model
  would mis-model every `echo $( … )` around it, whose real status is 0) and L188
  `bash -lc 'git status'` → `bash -lc 'git status || true'` (still the `-lc` cluster; reproduced:
  under `env -i PATH=<stub-bin>:/usr/bin:/bin HOME=<tmp> /bin/bash -lc`, `command -v git` prints
  /usr/bin/git and `git status` exits 128). The unit rows of the same texts in
  engine/test/guards/git-destructive-predicate.test.js L306/L309 are independent and stay.
  Append two new SPECIALS at the end (after the residual rows):
  `fragment('cat <( {git,push} origin )', { tags: [TAGS.braceInProcessSubstitution] })` and
  a fragment tagged `[TAGS.quoteInHeredocBody]` whose text is the JS template literal
  `cat <<< "$( cat <<'EOFQ'\ngit status "x\nEOFQ\n)"` (each `\n` a real newline).
- `sequence(generator, rng, depth)` L196-206: `options = { tags, status: right.status, lineEnd: right.lineEnd, keywordLed: left.keywordLed }`;
  op `&&`/`||`/`;`/newline results are lists (`{ ...options, list: true }`); op `|` (L204) today
  braces only a `keywordLed` right.
- `GROUPERS` L208-217: `!` grouper L211 and `time` grouper L212 spread `...inner`; case grouper
  L214; `f() { …; }; f` grouper L215.
- `BASHISMS` L226: its last alternative `\{[^{}\s]*(,|\.\.)[^{}\s]*\}` becomes a named
  `BRACE_EXPANSION`; rebuild `BASHISMS` from it (pre-checked: `new RegExp` with `BRACE_EXPANSION.source`
  yields a byte-identical source string).
- `nestedForms(inner)` L231-243: the `cat <( … )` form L234 passes `inner` as options.
- `nest` L245-249 builds its result with `tags: inner.tags` — switch to `nested.tags` so a form can add a tag.
- `heredoc` L251-263: the two quoted-delimiter forms L255-256 pass `{ lineEnd: true }` (no tags: the
  body is data).
- Export list L459-479: add `SYNTAX_EXEMPT_TAGS` (alphabetical slot after `SPAWN_TIMEOUT_MS`).

GREEN shapes, pre-validated in copy B (keep names, the rest is the implementer's):

~~~js
const pipedLeft = left => (left.simple ? left.text : `{ ${closed(left, '; }')} >/dev/null`);
const pipedRight = right => (right.keywordLed || right.list ? `{ ${closed(right, '; }')}` : right.text);
// sequence: '&&' / '||' / ';' / '\n' → fragment(..., { ...options, list: true }); '|' → `${pipedLeft(left)} | ${pipedRight(right)}`
// '!' grouper: { ...inner, status: flipped, keywordLed: true, simple: false, list: false }
// 'time' grouper: { ...inner, keywordLed: true, simple: false }
// case grouper: inner.keywordLed ? `case x in (x) { ${closed(inner, '; }')} ;; esac` : today's text
// f() grouper: add list: true
const processSubstitutionTags = inner =>
  BRACE_EXPANSION.test(inner.text) ? [...inner.tags, TAGS.braceInProcessSubstitution] : inner.tags;
// cat <( form: fragment(`cat <( ${closed(inner, ')')}`, { ...inner, tags: processSubstitutionTags(inner) })
const SYNTAX_EXEMPT_TAGS = Object.freeze([TAGS.unterminated, TAGS.quoteInHeredocBody]);
const quotedBodyTags = inner => (SYNTAX_EXEMPT_TAGS.some(tag => inner.tags.includes(tag)) ? [TAGS.quoteInHeredocBody] : []);
// both quoted-delimiter heredoc forms: { tags: quotedBodyTags(inner), lineEnd: true }
~~~

`quotedBodyTags` also keeps the tag when the inner is itself a quoted heredoc already carrying
`quote-in-heredoc-body` (a quoted heredoc nested in a quoted heredoc drops every other tag). The
new tag `braceInProcessSubstitution` joins `FALSE_BLOCK_TAGS`. `quoteInHeredocBody` joins `FALSE_BLOCK_TAGS`
too (DC-P1, recommended (a); the design said "not in `FALSE_BLOCK_TAGS`", but pre-validation shows
bash 3.2 then runs nothing of the whole command, so every sibling block in it is a false block:
19 of 21 census failures in copy B before this change were the new SPECIAL composed beside a
destructive leaf) and NOT `PARSE_FAILURE_TAGS` (the tokeniser parses it). The `|` composer keeps
its status model (a pipeline's status is its last element's).

engine/test/guards/shell-git-invocations.differential.test.js: imports L7-23 (add
`SYNTAX_EXEMPT_TAGS`); `SYNTAX_ERROR` L39, `SHELL_REJECTED` L42; `problemsOf` L49-62 — its L57
syntax check reads `tagged(TAGS.unterminated)`, change it to `SYNTAX_EXEMPT_TAGS.some(tagged)`.
Existing tests to keep green: the Leg B comparison table, "generated twice, identical" (L206), "every
false-block class and the residual class is reached" (L217, iterates every `TAGS` value), the per-seed
bash runs with the invoked floor `CAP / 2` (L225-242), Leg B (L244).

New structural describe (the five RED tests below) in the same file, with its own constants (they
do not read `GUARD_FUZZ_*`): `PINNED_SEEDS = [101, 202, 303, 404, 505, 11, 22, 33, 44, 55, 66, 77, 88, 99, 111]`,
`PINNED_COUNT = 1500`; generate once per test via `generateCommands` (generation only, no spawn,
milliseconds). Regexes, pre-checked against today's generator and copy B:

~~~js
const PIPE_INTO_FUNCTION = /(?:^|[^|])\| f\(\) \{/;                       // excludes '||'
const PIPE_INTO_ASSIGNMENT_LIST = /(?:^|[^|])\| [A-Za-z_]\w*=[^ ;|&]*; /;
const TIME_AFTER_CASE_PATTERN = /in \(x\) time /;
const SPLIT_TIME = /env -S 'time /;
const PIPED_SIGPIPE_WRITER = /git push' \| /;                              // the bash -c $'echo x\ngit push' special, raw-left
const FAILING_LEFT_AND = /(?:ls \*\.md|bash -lc 'git status') && /;
const QUOTED_HEREDOC = /<<['"]EOF/;
const BRACE_IN_PROCESS_SUBSTITUTION = /cat <\( (?:(?!\) )[^\n])*\{[^{}\s]*(,|\.\.)[^{}\s]*\}/;
const QUOTED_HEREDOC_AROUND_UNTERMINATED =
  /<<(['"])EOF\d+\1\n(?:(?!\n\t?EOF\d)[\s\S])*(git push 'x|git status "x|echo \$\(git push)/;
~~~

The brace check skips commands matching `QUOTED_HEREDOC`: a brace word inside a quoted heredoc body
is data and correctly carries no tag (copy B: 4 such commands).

Constraints: TDD London School; Given/When/Then titles in printable ASCII (no NEL, U+2028 or
invisible characters: Stryker's tap dry run rejects them; multi-line commands are built with `\n`
in the body and named by shape in the title); AAA bodies; a `sut` variable. No provenance
(ADR/phase/backlog numbers) in code or comments; comments say why, never what. No suppression
directives. Scaled runs only under `nice -n 19`, one at a time, never beside another heavy job;
output to a file, read back only `not ok`, `unexpected`, `FALSE ALLOW`, `invalid shell`,
`parsed:false` and the `# pass`/`# fail` lines.

Fallback (design §Part 1): a fresh-seed false block of a class not listed above is reduced, re-run
3 times unchanged to rule out a race, then fixed by the same rule (composer fix first, construct tag
second) inside this part. A FALSE ALLOW is never tagged: stop and hand back with the blocker
protocol `{ unit, reason, ≤3 options }`.

### TDD steps

1. RED — `Given the pinned seeds at scale, when generated, then no pipeline element is an unbraced function definition or assignment-led list`:
   assert no command matches `PIPE_INTO_FUNCTION` or `PIPE_INTO_ASSIGNMENT_LIST`. Fails today: 22 and
   41 commands match (`sequence` op `|` splices a list right raw).
   GREEN — `list` flag on `fragment`; `sequence` marks `&&`/`||`/`;`/newline results `list: true`;
   the 17 listed SPECIALS and the `f()` grouper set `list: true`; `pipedRight` braces a `keywordLed`
   or `list` right.
2. RED — `Given the pinned seeds at scale, when generated, then no left element can kill or skip the git on its right`:
   assert no command matches `PIPED_SIGPIPE_WRITER` and none matches
   `FAILING_LEFT_AND = /(?:ls \*\.md|bash -lc 'git status') && /`. Fails today: 44 and 3 commands (a
   non-simple left is spliced raw before `|`; two SPECIALS modelled as status 0 exit non-zero).
   GREEN — `pipedLeft`: a non-`simple` left becomes `{ left ; } >/dev/null`; the two C5 SPECIALS
   rewritten as listed in Context.
3. RED — `Given the pinned seeds at scale, when generated, then time is never led by a case pattern or split by env -S`:
   assert no command matches `TIME_AFTER_CASE_PATTERN` or `SPLIT_TIME`. Fails today: 11 and 3 (the
   case grouper splices `time …` after the pattern; the `time` grouper spreads `simple: true`).
   GREEN — `time` and `!` groupers set `simple: false` (`!` also `list: false`); the case grouper
   braces a `keywordLed` inner.
4. RED — `Given the pinned seeds at scale, when generated, then every brace word inside cat process substitution carries the brace-in-process-substitution tag`:
   for every command matching `BRACE_IN_PROCESS_SUBSTITUTION` and not `QUOTED_HEREDOC`, assert its
   tags include `'brace-in-process-substitution'`. Fails today: no such tag exists, so every match
   lacks it.
   GREEN — `TAGS.braceInProcessSubstitution`, added to `FALSE_BLOCK_TAGS`; `BRACE_EXPANSION`
   extracted and `BASHISMS` rebuilt from it; `processSubstitutionTags` on the `cat <(` form; `nest`
   merges `nested.tags`; the `cat <( {git,push} origin )` SPECIAL (keeps "every tag reached" green).
5. RED — `Given the pinned seeds at scale, when generated, then every quoted heredoc around an unterminated special carries the quote-in-heredoc-body tag`:
   for every command matching `QUOTED_HEREDOC_AROUND_UNTERMINATED`, assert its tags include
   `'quote-in-heredoc-body'`. Fails today: 11 commands, the quoted forms drop every inner tag.
   GREEN — `TAGS.quoteInHeredocBody`, added to `FALSE_BLOCK_TAGS` (DC-P1 (a)); exported `SYNTAX_EXEMPT_TAGS`; `quotedBodyTags` on both
   quoted-delimiter forms; the `cat <<< "$( cat <<'EOFQ' … )"` SPECIAL; `problemsOf` reads
   `SYNTAX_EXEMPT_TAGS.some(tagged)` for the syntax check.
6. GUARD — "generated twice, identical" and "every false-block class and the residual class is
   reached" (pass: both new tags are reached through the two new SPECIALS at seed 20260); the
   default-seed bash run with its invoked floor (re-measured: adding SPECIALS and braces reshuffles
   every seed's list, so run it, do not assume it).
7. Census (R1, by hand, not CI; `nice -n 19`, sequentially, output to files), all must report zero
   problems:
   the Pinned F seeds in three batches of five (all 15 in one invocation time out at the 60 s
   per-test limit, measured), then the fresh seeds as one batch; see Gate. Record the seeds, the
   pass/fail lines and each seed's `false blocks {…}` diagnostic in the handback.
8. REFACTOR — keep every new helper ≤20 lines, no nesting >2, named constants for the regexes;
   run `nice -n 19 bash scripts/ci.sh`.

### Gate

```bash
nice -n 19 bash scripts/ci.sh
for S in 101,202,303,404,505 11,22,33,44,55 66,77,88,99,111; do GUARD_FUZZ_SEEDS=$S GUARD_FUZZ_COUNT=1500 nice -n 19 node --test engine/test/guards/shell-git-invocations.differential.test.js > "<tmp>/census-$S.log" 2>&1 || echo "FAILED $S"; done
GUARD_FUZZ_SEEDS=271828,314159,161803,141421,173205 GUARD_FUZZ_COUNT=1500 nice -n 19 node --test engine/test/guards/shell-git-invocations.differential.test.js > <tmp>/census-fresh.log 2>&1
```

ci.sh exits 0, no `FAILED` line is printed, and the fresh run exits 0. `<tmp>` is a `mktemp -d` directory outside the worktree.

### Commit

`test(guards): make the scaled differential census a gate`

## Part 2 — `--ext-diff` denied on every git verb, oracle widened in lock-step

### Context

Files: `engine/src/guards/git-ext-diff-predicate.js`, `engine/src/guards/shell-git-invocations.js`,
`engine/test-helpers/git-differential-harness.js`, `engine/test/guards/git-ext-diff-predicate.test.js`,
`engine/test/guards/shell-git-invocations.test.js`, `engine/test/claude-ext-diff-hook-main.test.js`.

Rule (ADR-660, first half): a literal word `--ext-diff` that is the last `--ext-diff`/`--no-ext-diff`
word before `--` is denied on every git verb. `diff`/`show` keep today's stricter rule and reason
byte-for-byte; other verbs get a new reason. `rtk proxy` stays exempt. A dynamic word on a non-diff
verb is NOT read as a possible `--ext-diff` (decided residual M11: reading it would deny the heredoc
commit idiom and `git log $range` on Claude).

engine/src/guards/git-ext-diff-predicate.js (60 lines) today: `COMPLIANT_MARKERS` (exported),
`REASON_GIT_EXT_DIFF` (internal), `NO_EXT_DIFF_WORD`, `PROXY_WORDS`, `DIFFING_SUBCOMMANDS`,
`EXT_DIFF_WORD`, `lacksNoExtDiff(words)`, `dynamicAfterNoExtDiff(invocation)`, `isProxied(leadingWords)`,
`diffsWithoutMarker(invocation)`, `extDiffVerdictFor(invocation) → string|null` (exported; L43-47:
`configChannelReason` first, then `diffsWithoutMarker && !isProxied ? REASON_GIT_EXT_DIFF : null`),
`gitExtDiffPredicate(command) → { block, reason? }` (exported). `optionWords` (from git-argv.js) cuts
at the first `--`. Update the predicate's JSDoc line ("does this bash command run git diff/show
without --no-ext-diff?") to the widened rule.

GREEN shape (pre-validated in copy A):

~~~js
const REASON_EXT_DIFF_OPTION = '--ext-diff is denied on every git verb (external diff mangles parsed output)';
const isExtDiffSetting = word => word === EXT_DIFF_WORD || word === NO_EXT_DIFF_WORD;
const lacksNoExtDiff = words => optionWords(words).findLast(isExtDiffSetting) !== NO_EXT_DIFF_WORD;
const enablesExtDiff = invocation =>
  invocation.kind === 'subcommand' &&
  invocation.mentionsExtDiff === true &&
  optionWords(invocation.args).findLast(isExtDiffSetting) === EXT_DIFF_WORD;
// extDiffVerdictFor: configChannelReason → (diffsWithoutMarker ? (isProxied ? null : REASON_GIT_EXT_DIFF))
//                    → (enablesExtDiff && !isProxied ? REASON_EXT_DIFF_OPTION : null)
~~~

`isProxied` reads `leadingWords` lazily — call it only after a rule matched, as today, so a long
command does not materialise every invocation's leading words.

engine/src/guards/shell-git-invocations.js (201 lines) today: `ALIAS_KEY_PREFIX` L6,
`INLINE_ALIAS_REASON` L8 (exported), `ANCHOR_VERBS` L26 (destructive ∪ diffing), `PATTERN_DELIMITERS`
L28, `holdsAnchorVerb({ text })` L30 (pattern words), `isAnchorVerb(word)` L52 (used by
`wrapperAnchors` L58-63 for `command $G push`), `flagged(invocation, injects)` L105
(`Object.defineProperty(invocation, 'injectsConfig', { value, enumerable: false })`), `aliasDefinition`
L114-118 (calls `flagged(…, true)`), `flaggerFor(command)` L120-123, `anchoredInvocations` L125-137,
`MAX_ARGUMENT_READING_ANCHORS = 256` L139, `readsArguments(invocation)` L145-146 (counts non-`no-subcommand`
invocations whose kind is not `subcommand` or whose verb is an anchor verb), `exceedsAnchorCap` L148,
`gitInvocations` L151 (exported), `CONFIG_CHANNEL_REASON` L159 (exported), `configChannelReason` L170
(exported).

GREEN shape (pre-validated in copy A):

~~~js
const EXT_DIFF_WORD = '--ext-diff';
const isAnchorToken = text => ANCHOR_VERBS.has(text) || text === EXT_DIFF_WORD; // Part 3 adds isAliasKeyText
const holdsAnchorVerb = ({ text }) => text.split(PATTERN_DELIMITERS).some(isAnchorToken);
const isAnchorVerb = word => !word.dynamic && isAnchorToken(word.text);
// flagged takes a flags object, never a second boolean (no boolean params):
const flagged = (invocation, { injectsConfig, mentionsExtDiff }) =>
  Object.defineProperties(invocation, {
    injectsConfig: { value: injectsConfig, enumerable: false },
    mentionsExtDiff: { value: mentionsExtDiff, enumerable: false },
  });
// aliasDefinition: flagged(…, { injectsConfig: true, mentionsExtDiff: false })
// flaggerFor: computes mentionsExtDiff once per command — command.words.some(({ text }) => text === EXT_DIFF_WORD)
// readsArguments: … || ANCHOR_VERBS.has(invocation.subcommand) || invocation.mentionsExtDiff === true
~~~

Why the flag: an invocation whose command holds no `--ext-diff` word never reads its arguments
(the arguments are lazy; reading them for every git word is quadratic, which the existing "bounded
work" tests at shell-git-invocations.test.js L95-236 catch), and an invocation that does read them
counts against the 256-anchor cap.

engine/test-helpers/git-differential-harness.js: `VERBS` L94-100 gains
`['log', '-p --ext-diff'], ['log', '-p --ext-diff --no-ext-diff'], ['format-patch', '-1 --stdout --ext-diff']`.
`judgeArgv(argv)` L421-430 (the independent oracle: argv-level, no shell parsing, no predicate code)
today returns `extDiff: configured || (diffs && lastExtDiffSetting(args) !== '--no-ext-diff')`; widen it:
a non-diff verb whose `lastExtDiffSetting(args)` (L417, before `--`) is `'--ext-diff'` also sets
`extDiff`. The consumers of `judgeArgv`/`oracleVerdict`: the engine, codex and copilot differential
suites (read-only here).

Tests to extend (read their helpers first):

- engine/test/guards/git-ext-diff-predicate.test.js — `describe` blocks per behaviour; `assertBlocks(rows)`
  helper L359 (block only); `REASON_EXT_DIFF` constant L423; "accepted residuals" describe L315.
  Add a describe `gitExtDiffPredicate() — --ext-diff on any git verb` with a local
  `REASON_EXT_DIFF_OPTION` literal.
- engine/test/guards/shell-git-invocations.test.js — `gitInvocations()` table L16-56 (deepEqual: the
  hidden flag must stay non-enumerable), "bounded work" describe L95-236 with `MAX_ANCHORS = 256` and
  `TOO_MANY_REASON`, "anchor cap pins" describe L383-417 (`repeated(unit, times)`, two loops: units
  NOT counted vs units that deny).
- engine/test/claude-ext-diff-hook-main.test.js — "reason prefix" describe L99-115 (rows
  `{ label, command, reason }`; asserts the deny carries exactly one `craft: ` prefix). The hook
  prefixes an unprefixed engine reason (engine/src/claude-ext-diff-hook-main.js `prefixed`).

Acceptance rows (design verdict matrix, "after (b-i)" column; C = Claude/opencode/pi):
M1 `git log -p -1 --ext-diff`, M2 `git format-patch -1 --stdout --ext-diff`, M3 `git stash show -p --ext-diff`,
M4 `git reflog -p -1 --ext-diff` and `git whatchanged -p --ext-diff`, M5 `git diff-tree -p --ext-diff HEAD`
(and `diff-files`, `diff-index`), M6 `git log -p -1 --no-ext-diff --ext-diff`, M9 `git log -p -1 --grep --ext-diff`,
`git status --ext-diff`, `git commit -m --ext-diff`, M22 `echo git log --ext-diff` → BLOCK with
`REASON_EXT_DIFF_OPTION`; M10 `{git,log,-p,--ext-diff}` and `G=git; command $G log -p --ext-diff` →
BLOCK with today's `REASON_GIT_EXT_DIFF` (indeterminate invocation); M7 `git log -p -1 --ext-diff --no-ext-diff`,
M8 `git log -p -1 -- --ext-diff`, M11 `X=--ext-diff; git log -p $X` (residual, pinned so a change is
deliberate), M12 `rtk proxy git log -p --ext-diff`, `git commit -m "use --ext-diff"`, the heredoc
commit idiom carrying `--ext-diff` in its body → allow; M23 `git show` → BLOCK, today's reason.

Constraints: as Part 1 (TDD London School, printable-ASCII Given/When/Then titles, AAA, `sut`, no
provenance, no suppression, comments say why). The four differential suites stay green at the
default seed. Tests that spawn git pin their env (PATH plus `GIT_CONFIG_GLOBAL=/dev/null`,
`GIT_CONFIG_SYSTEM=/dev/null`, `GIT_CONFIG_NOSYSTEM=1`, never process.env passed through —
docs/contributing/lessons/002-tests-that-spawn-git-pin-their-env.md); none of this part's new tests
spawns git.

### TDD steps

1. RED — in git-ext-diff-predicate.test.js, one row each for M1-M6, M9 and M22 → `{ block: true, reason: REASON_EXT_DIFF_OPTION }`;
   in claude-ext-diff-hook-main.test.js "reason prefix", a row `git log -p -1 --ext-diff` →
   `craft: --ext-diff is denied on every git verb (external diff mangles parsed output)` (single
   prefix). All fail today: `extDiffVerdictFor` judges only `diff`/`show`, so each command returns
   `{ block: false }` (the hook writes `allow`).
   GUARD (same step, pass today and must keep passing) — M7, M8, M11, M12, `git commit -m "use --ext-diff"`,
   the heredoc commit idiom `git commit -m "$(cat <<'EOF'\nfix: x\n\nmention --ext-diff here\nEOF\n)"`
   → `{ block: false }`; M23 → today's reason.
   GREEN — `isExtDiffSetting`, `enablesExtDiff`, `REASON_EXT_DIFF_OPTION`, the new
   `extDiffVerdictFor` order; `flagged` takes `{ injectsConfig, mentionsExtDiff }` and `flaggerFor`
   computes `mentionsExtDiff` once per command. GUARD: the existing "bounded work" tests (they go
   red in time if the flag is skipped).
2. RED — `{git,log,-p,--ext-diff}` and `G=git; command $G log -p --ext-diff` (M10) → block with
   `REASON_GIT_EXT_DIFF`; plus a `gitInvocations('{git,log,--ext-diff}')` row asserting that SOME
   returned invocation has `kind: 'indeterminate'` (the dynamic pattern head also yields a
   `no-subcommand` invocation, so do not deepEqual the whole list). Fail today: no pattern token or wrapper word is an anchor
   verb, so no indeterminate invocation is produced and both are allowed.
   GREEN — `isAnchorToken` read by `holdsAnchorVerb` and `isAnchorVerb`.
3. RED — anchor cap pins: 257 × `git log --ext-diff ` → `{ parsed: false, reason: TOO_MANY_REASON }`.
   Fails today: `readsArguments` does not count a `log` invocation, so the command parses.
   GUARD — 300 × `git status ` parses (the existing "non-destructive subcommands" pin at 257 plus a
   300 row: R7).
   GREEN — `readsArguments` counts an invocation whose `mentionsExtDiff` is true.
4. RED — add the three `VERBS` rows to the harness and run the engine differential at the default
   seed: it fails with "unexpected false block (no intended-false-block class)" on commands running
   `git … log -p --ext-diff` / `format-patch … --ext-diff` (pre-validated: 18 such lines with both
   rule halves in place) because `judgeArgv` reports `extDiff: false` for a non-diff verb while the
   predicate now blocks. If seed 20260 happens not to reach one, confirm the RED with
   `GUARD_FUZZ_SEEDS=101,202 GUARD_FUZZ_COUNT=1500` instead.
   GREEN — widen `judgeArgv`: `extDiff` also holds for a non-diff subcommand whose
   `lastExtDiffSetting(args) === '--ext-diff'`. No predicate code imported into the oracle.
5. GUARD — codex differential (adapters/codex/test/git-guard.differential.test.js), copilot
   differential and test/git-no-ext-diff.differential.test.js at the default seed, through
   `nice -n 19 bash scripts/ci.sh`.
6. Scaled check (by hand, `nice -n 19`, output to files, three batches of five seeds): the engine
   arm on the Pinned F seeds at 1500 (Part 1 made it a gate; the new `VERBS` reshuffle every seed). Any new unexpected false
   block follows the Part 1 fallback; a FALSE ALLOW is a blocker. Record seeds + result in the handback.
7. REFACTOR — `extDiffVerdictFor` stays ≤20 lines with early returns; no nesting >2; run
   `nice -n 19 bash scripts/ci.sh`.

### Gate

```bash
nice -n 19 bash scripts/ci.sh
for S in 101,202,303,404,505 11,22,33,44,55 66,77,88,99,111; do GUARD_FUZZ_SEEDS=$S GUARD_FUZZ_COUNT=1500 nice -n 19 node --test engine/test/guards/shell-git-invocations.differential.test.js > "<tmp>/census-$S.log" 2>&1 || echo "FAILED $S"; done
```

ci.sh exits 0 and no `FAILED` line is printed. `<tmp>` is a `mktemp -d` directory outside the worktree.

### Commit

`feat(guards): deny --ext-diff on every git verb`

## Part 3 — `git config` naming an alias or include key denied, oracle widened in lock-step

### Context

Files: `engine/src/guards/shell-git-invocations.js`, `engine/test-helpers/git-differential-harness.js`,
`engine/test/guards/shell-git-invocations.test.js`, `engine/test/guards/git-destructive-predicate.test.js`,
`engine/test/guards/git-bash-verdict.test.js`, `engine/test/claude-ext-diff-hook-main.test.js`.

Rule (ADR-660, second half): any `git config` invocation whose arguments (ALL of them, no `--` cut:
`git config -- alias.x diff` writes) name an `alias`, `alias.*`, `include.path*` or `includeIf.*` key,
compared case-folded, is denied whatever its mode or value: writes, reads (`--get alias.x`,
`--get-regexp alias`), `--unset`, `--remove-section alias`, the rename target (`--rename-section foo alias`,
`rename-section foo alias`), 2.46+ subcommands (`set alias.x diff`, `set --append …`). It lives in
`configChannelReason`, so BOTH the ext-diff verdict and the destructive verdict deny it
(`git config alias.p push; git p` is a destructive bypass today). A partly dynamic key whose text
starts with `alias.` (`alias.$N`) is caught by text; a fully dynamic key (`"$K"`) is a residual on
Claude/opencode/pi (the plain gate blocks it on codex/copilot). `git config --edit` (a file write by
another program) is not judged (M21).

State after Part 2 (this part builds on it): shell-git-invocations.js has `EXT_DIFF_WORD`,
`isAnchorToken(text) = ANCHOR_VERBS.has(text) || text === EXT_DIFF_WORD`, `flagged(invocation, { injectsConfig, mentionsExtDiff })`,
and `readsArguments` counting anchor verbs and `mentionsExtDiff`. Unchanged since `33682b2`:
`ALIAS_KEY_PREFIX = 'alias.'` L6, `INLINE_ALIAS_REASON` L8, `CONFIG_CHANNEL_REASON` (exported),
`INCLUDE_PATH_KEY = 'include.path'`, `INCLUDE_IF_PREFIX = 'includeif.'` (both declared just above
`holdsIncludeKey`, which reads `-c` config keys only), `hasInlineAlias` (exported),
`configChannelReason(invocation)` (exported): inline alias → `INLINE_ALIAS_REASON`; `injectsConfig`
or an include key in `-c` → `CONFIG_CHANNEL_REASON`; else `null`. engine/src/guards/git-destructive-predicate.js
L110 `destructiveVerdictFor = invocation => configChannelReason(invocation) ?? judgeByKind(invocation)`
(read-only: inherits the deny).

GREEN shape (pre-validated in copy A; move the two include constants up beside `ALIAS_KEY_PREFIX`
so `isAliasKeyText` reads declared names):

~~~js
const ALIAS_SECTION = 'alias';
const CONFIG_VERB = 'config';
const isAliasKeyText = text => {
  const key = text.toLowerCase();
  return key === ALIAS_SECTION || key.startsWith(ALIAS_KEY_PREFIX) || key.startsWith(INCLUDE_PATH_KEY) || key.startsWith(INCLUDE_IF_PREFIX);
};
const isAnchorToken = text => ANCHOR_VERBS.has(text) || text === EXT_DIFF_WORD || isAliasKeyText(text);
export const CONFIG_ALIAS_WRITE_REASON =
  'craft: git config naming an alias or include key is denied — an alias can run any git verb';
const namesAliasKey = invocation =>
  invocation.kind === 'subcommand' && invocation.subcommand === CONFIG_VERB && invocation.args.some(isAliasKeyText);
// configChannelReason: inline alias → namesAliasKey → CONFIG_ALIAS_WRITE_REASON → channel/include
// readsArguments: … || invocation.subcommand === CONFIG_VERB || invocation.mentionsExtDiff === true
~~~

The reason's dash is U+2014, as in `INLINE_ALIAS_REASON` (tests write it as `—`, the
claude-ext-diff-hook-main.test.js convention). Public-surface decision: `CONFIG_ALIAS_WRITE_REASON` is
a PUBLIC module export (beside `INLINE_ALIAS_REASON`); no barrel/facade/registry exists for
engine/src/guards and adapters/opencode/src/git-guard-predicate.js must NOT re-export it; its doc
surface (gate.md reason lists) is paid in Part 4.

engine/test-helpers/git-differential-harness.js: `VERBS` gains `['config', 'alias.x diff'], ['config', '--get alias.x'], ['config', 'user.name x']`.
`CONFIG_KEY` L413 (matches `-c` keys only), `injectsConfigKey` L415. Widen `judgeArgv`: `configured`
(it feeds both `destructive` and `extDiff`) also holds for `normalised.subcommand === 'config'` with
any argument (whole args, no `--` cut) matching a new
`CONFIG_ARG_KEY = /^(alias|alias\..*|include\.path.*|includeif\..*)$/i`. Independent of predicate code.

Tests to extend:

- engine/test/guards/shell-git-invocations.test.js — imports L6 (`gitInvocations, hasInlineAlias, judgeParsed`;
  add `configChannelReason`, `CONFIG_ALIAS_WRITE_REASON`); add a `configChannelReason() — git config naming an alias or include key`
  describe that judges `gitInvocations(command).invocations[0]`; "anchor cap pins" describe (end of file).
- engine/test/guards/git-destructive-predicate.test.js — imports L4 (`gitInvocations, INLINE_ALIAS_REASON`;
  add `CONFIG_ALIAS_WRITE_REASON`); "unparseable, unclassifiable and dynamic" describe L152 holds the
  inline-alias rows to mirror.
- engine/test/guards/git-bash-verdict.test.js — 48 lines, `plainGitCommandVerdict as sut`, reason
  literals at the top, one `it` per row.
- engine/test/claude-ext-diff-hook-main.test.js — "reason prefix" describe (rows `{ label, command, reason }`).

Acceptance rows ("after (b-i)" column): M13 every G32-G36 spelling → `CONFIG_ALIAS_WRITE_REASON`:
`git config alias.x diff`, `git config ALIAS.x diff`, `git config Alias.X diff`, `git config set alias.x diff`,
`git config --add alias.x diff`, `git config --replace-all alias.x diff`, `git config --local alias.x diff`,
`git config --global alias.x diff`, `git config -f .git/config alias.x diff`, `git config --file=.git/config alias.x diff`,
`git config --type=bool --no-type alias.x diff`, `git config set --append alias.x diff`, `git config -- alias.x diff`,
`git config alias.x '!git diff'`, `git config --rename-section foo alias`, `git config rename-section foo alias`,
`git config include.path f`, `git config set includeIf.gitdir:/r/.git.path f`, `git config alias.$N diff`;
M14 `git config alias.x diff; git x`; M15 `git config alias.p push; git p` (destructive too); M16
`git config alias.x status`; M17 `git config --get alias.x`, `git config --get-regexp alias`,
`git config --unset alias.x`, `git config --remove-section alias` → all BLOCK, same reason.
M18 `git config user.name x`, `git config --list`, `git config --get user.email` → allow. M19
`git config "$K" diff` → allow on `gitExtDiffPredicate` (residual), M20 `git x` → allow, M21
`GIT_EDITOR=x git config --edit` → allow. `{git,config,alias.x,status}` and
`G=git; command $G config alias.x status` → BLOCK (indeterminate, today's ext-diff reason).

Constraints: as Part 2. No test here spawns git.

### TDD steps

1. RED — shell-git-invocations.test.js: each M13-M17 command → `configChannelReason(first invocation) === CONFIG_ALIAS_WRITE_REASON`;
   git-destructive-predicate.test.js: M15 → `{ block: true, reason: CONFIG_ALIAS_WRITE_REASON }`;
   git-bash-verdict.test.js: M13 `git config alias.x diff` and M15 → `CONFIG_ALIAS_WRITE_REASON`;
   claude-ext-diff-hook-main.test.js "reason prefix": M13 → the reason with its single `craft: `
   prefix. All fail today: `configChannelReason` never judges a `config` subcommand, so it returns
   `null` and every verdict allows. Write the reason as a local literal constant in each test file
   (`'craft: git config naming an alias or include key is denied \u2014 an alias can run any git verb'`):
   importing the not-yet-exported name would fail the whole file at ESM link time, the wrong reason.
   GUARD (same step) — M18 rows → `null`/allow; M19, M20, M21 → allow on `gitExtDiffPredicate`;
   git-bash-verdict.test.js M1 `git log -p -1 --ext-diff` → `--ext-diff is denied on every git verb (external diff mangles parsed output)`
   (landed in Part 2).
   GREEN — `isAliasKeyText`, `namesAliasKey`, exported `CONFIG_ALIAS_WRITE_REASON`, the new
   `configChannelReason` order.
2. RED — `{git,config,alias.x,status}` and `G=git; command $G config alias.x status` → block. Fail
   today: no pattern token or wrapper word is an anchor token, so both are allowed.
   GREEN — `isAnchorToken` gains `isAliasKeyText(text)`.
3. RED — anchor cap pins: 257 × `git config user.name x ` → too-many. Fails today: `readsArguments`
   does not count a `config` invocation (R7 keeps a command with no `--ext-diff` word and no
   `config` invocation unchanged: the 300 × `git status ` GUARD from Part 2 stays green).
   GREEN — `readsArguments` counts `invocation.subcommand === CONFIG_VERB`.
4. RED — add the three `config` `VERBS` rows; the engine differential at the default seed fails
   with "unexpected false block" on commands running `git … config alias.x diff` / `--get alias.x`
   (pre-validated: 17 such lines) because `judgeArgv` reports no block for them. If seed 20260 does
   not reach one, confirm with `GUARD_FUZZ_SEEDS=101,202 GUARD_FUZZ_COUNT=1500`.
   GREEN — `CONFIG_ARG_KEY` and the widened `configured` in `judgeArgv`.
5. Scaled check (R6; by hand, `nice -n 19`, sequentially, output to files, batches of five seeds):
   the engine, codex and copilot arms on the Pinned F seeds at 1500, then the engine arm on the fresh seeds
   `271828,314159,161803,141421,173205`. Zero problems on the engine arm; zero FALSE ALLOW and zero
   failing tests on codex and copilot (they report false blocks only as a diagnostic). Record seeds +
   results in the handback.
6. REFACTOR — `configChannelReason` stays a flat early-return chain; git-destructive-predicate.test.js
   imports `CONFIG_ALIAS_WRITE_REASON` instead of its literal (mirrors `REASON_ALIAS_INLINE = INLINE_ALIAS_REASON`
   at L150), so the export has a consumer; run `nice -n 19 bash scripts/ci.sh`.

### Gate

```bash
nice -n 19 bash scripts/ci.sh
for S in 101,202,303,404,505 11,22,33,44,55 66,77,88,99,111; do GUARD_FUZZ_SEEDS=$S GUARD_FUZZ_COUNT=1500 nice -n 19 node --test engine/test/guards/shell-git-invocations.differential.test.js > "<tmp>/engine-$S.log" 2>&1 || echo "FAILED engine $S"; done
for S in 101,202,303,404,505 11,22,33,44,55 66,77,88,99,111; do (cd adapters/codex && GUARD_FUZZ_SEEDS=$S GUARD_FUZZ_COUNT=1500 nice -n 19 node --test test/git-guard.differential.test.js) > "<tmp>/codex-$S.log" 2>&1 || echo "FAILED codex $S"; done
for S in 101,202,303,404,505 11,22,33,44,55 66,77,88,99,111; do (cd adapters/copilot && GUARD_FUZZ_SEEDS=$S GUARD_FUZZ_COUNT=1500 nice -n 19 node --test test/git-guard.differential.test.js) > "<tmp>/copilot-$S.log" 2>&1 || echo "FAILED copilot $S"; done
GUARD_FUZZ_SEEDS=271828,314159,161803,141421,173205 GUARD_FUZZ_COUNT=1500 nice -n 19 node --test engine/test/guards/shell-git-invocations.differential.test.js > <tmp>/engine-fresh.log 2>&1
```

ci.sh and the fresh run exit 0, no `FAILED` line is printed; everything runs one after another. `<tmp>` is a `mktemp -d` directory outside the worktree.

### Commit

`feat(guards): deny git config naming an alias or include key`

## Part 4 — Binding pins and living docs for the widened rule

### Context

Docs plus binding-surface pins, no src delta. Files: `adapters/codex/test/git-guard-adapter.test.js`,
`adapters/copilot/test/git-guard-adapter.test.js`, `docs/contributing/specs/gate.md`,
`adapters/codex/README.md`, `adapters/copilot/README.md`, `adapters/antigravity/README.md`.

The pins (design §Test strategy Part 2: one deny row each for M1 and M13 through the hook surface)
are GUARD entries: Parts 2 and 3 already made them pass. They pin the codex and copilot hook
surfaces (`decideGuard`/`codexGuard`/`copilotGuard` → `plainGitCommandVerdict`):

- adapters/codex/test/git-guard-adapter.test.js — `codexGuard() - git verdict on Bash, containment on apply_patch`
  describe L357: a `rows` table of `[label, command, expected]` judged with `bashEvent(command)` and
  `assert.deepEqual(result, expected)`; reason constants at its top (`EXT_DIFF_REASON`,
  `UNPARSEABLE_REASON`, `PUSH`, `GATE`, `ALLOW`, …). Add `['a log patch with --ext-diff', 'git log -p -1 --ext-diff', { block: true, reason: <option reason> }]`,
  `['a git config alias write', 'git config alias.x diff', { block: true, reason: <alias reason> }]`,
  `['a git config alias write used as a push', 'git config alias.p push; git p', …]`, and
  `['a plain git config write', 'git config user.name x', ALLOW]`.
- adapters/copilot/test/git-guard-adapter.test.js — `copilotGuard() — destructive git first, then the tool-call guard`
  describe L287 (`bashEvent(command)` → `{ tool: 'Bash', tool_input: { command }, working_dir }`); add
  the same four rows in its style.

Reason literals: `--ext-diff is denied on every git verb (external diff mangles parsed output)` and
`craft: git config naming an alias or include key is denied — an alias can run any git verb`.

Docs (claim parsed-output protection only, never a sandbox; name the residuals, R8):

- docs/contributing/specs/gate.md L47-60 (Claude hook bullet): the parse "judges `--no-ext-diff` and
  `rtk proxy` per invocation" — add that a literal `--ext-diff` (last setting before `--`) is denied
  on every git verb and that `git config` naming an `alias`/`include.path`/`includeIf.*` key is
  denied; the reason list at L57-59 gains `craft: --ext-diff is denied on every git verb (external diff mangles parsed output)`
  and `craft: git config naming an alias or include key is denied — an alias can run any git verb`.
- gate.md L108-110 (pi `tool_call` predicate line) and L124-125 (opencode: "the same `git diff`/`show`
  without `--no-ext-diff` predicate the Claude and Pi bindings enforce"): name the widened rule.
- gate.md "Residuals" list (L222-240) — the "Git reached through channels a static guard cannot
  follow" bullet already names "gitconfig-file aliases"; add the ext-diff rule's residuals: a
  dynamic `--ext-diff` word on a non-diff verb (`X=--ext-diff; git log -p $X`, blocked by the plain
  gate on codex/copilot only), a fully dynamic `git config` key (`git config "$K" diff`, same), an
  alias already in a gitconfig, `git config --edit` through `GIT_EDITOR`, `git clone -c alias.*`;
  and the deliberate over-blocks (`git config --get alias.x`, `git config alias.x status`,
  `echo git log --ext-diff`, `git log --grep --ext-diff`). The "Closed, no longer residuals" bullet
  (L242) gains: `--ext-diff` on non-diff verbs and `git config` alias/include writes.
- gate.md "Guard modules" paragraph (L209-214): one sentence of scope — the guard protects parsed
  output from an external diff driver by reading command text; it is not a sandbox.
- adapters/codex/README.md L178 ("then the `--no-ext-diff` rule"), adapters/copilot/README.md L63
  ("destructive verbs and the `--no-ext-diff` rule"), adapters/antigravity/README.md L21 ("denies
  `git diff`/`git show` without `--no-ext-diff` and allows everything else" — no longer true): name
  the widened rule (any-verb `--ext-diff`, `git config` alias/include keys) in one clause each.

Constraints: diff-minded edits, no full-file rewrites; no provenance numbers in test code; prose
names behaviour, not ADR numbers, except where gate.md already cites ADRs in that paragraph;
repo-relative paths only. Leave BACKLOG.md alone (the documentation phase ticks it).

### TDD steps

1. GUARD — codex rows (M1, M13, M15, M18) through `codexGuard`: pass because Parts 2 and 3 made
   `plainGitCommandVerdict` deny them and allow `git config user.name x`.
2. GUARD — the same four rows through `copilotGuard`: pass for the same reason.
3. Docs — gate.md, the three adapter READMEs as listed; re-read each edited paragraph against the
   pinned verdicts (Part 2/3 acceptance rows) so no sentence claims a block the code does not make.
4. Run `nice -n 19 bash scripts/ci.sh` (it runs the prose and intention lints over the living
   corpus and the README drift check).

### Gate

```bash
nice -n 19 bash scripts/ci.sh
```

Exits 0.

### Commit

`docs(guards): name the widened ext-diff rule and its residuals`
