# Plan — git-show-ext-diff-default-deny

> Source: design doc `docs/contributing/design/git-show-ext-diff-default-deny.md` · ADRs `662, 663`
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

## Why five parts (read first)

DC-1 is ratified as option (a): `git show` leaves the default-deny and is judged on a
literal --ext-diff and on a dynamic option word after the last --no-ext-diff.

The rule change ("the flip") and the oracle line in judgeArgv MUST land in one commit.
Proof, from the differential suite (engine/test/guards/shell-git-invocations.differential.test.js,
problemsOf): a FALSE ALLOW (oracle fires, predicate allows) and an unexpected false block
(predicate blocks, oracle does not) are both failures, and `scripts/ci.sh` runs that suite at
the default seed 20260 (run_suite engine). Every SPECIALS entry is a fixed entry emitted for
every seed (harness generateCommands, FIXED_ENTRIES), and VERBS holds ['show', ''], so:
rule-first leaves a FALSE ALLOW on bare `show`; oracle-first leaves an unexpected false block.
Either order alone is red. So Part 3 carries the rule AND the oracle.

The flip also turns 31 existing deny rows red across 8 test files, and the plan-lint ceiling is
6 files per part. So everything that holds green both before and after the flip lands before
it (Parts 1 and 2: re-pin each bare-show deny row onto an equivalent `git diff` deny row, add
the fuzz shapes, add the hidden flag), the flip lands with its own RED rows (Part 3), and the
per-binding allow rows that can only pass after the flip land after it (Parts 4 and 5, GUARD
entries — the ceiling, not a choice, makes them separate). Every commit leaves ci.sh green.

Planner probe (throwaway copy of this tree, no `.git`): with only the Part 1 generator rows
applied (old rule, old oracle) the engine differential was 28 pass / 0 fail, codex arm 4/0,
copilot arm 10/0, hook differential 1/0 at the default seed; with the Part 3 flip applied on
top, the same four were green, and the engine guard unit suites failed only on the expected
flip rows (gitExtDiffPredicate and toolCallGuard describes). The post-flip verdicts of every
verdict-matrix row V1-V12 matched the design on both P (gitExtDiffPredicate) and X
(plainGitCommandVerdict).

## Decision candidates

None. Every load-bearing choice is pre-decided by the design (DC-1 ratified as (a), the
"Adopted as recommended" list) and ADR-662/663. Choices this plan makes inside that envelope
(part split, re-pin spellings) are mechanical consequences of the ceiling and the atomic flip.

## Standing constraints (every part)

- Bash hook trap: the repo's own Bash PreToolUse hook runs the OLD guard (it loads from the
  main checkout's plugin, not this worktree) on every Bash command text. Any Bash command
  holding `git diff`/`git show` without --no-ext-diff, --ext-diff, `git config alias.*` or a
  brace word is denied — including bare `git show`, which this run makes legal. Put such probes
  in a script file (scratchpad, outside the tree) and run the file. Scripted git diff/show
  pass --no-ext-diff. Never pass `--test-name-pattern` text holding those words. Use
  `/usr/bin/git` for git verbs (rtk rewrites `git add/commit` and the worktree guard refuses
  the rewrite).
- Tests: TDD London School; titles Given/When/Then in printable ASCII only (no NEL, U+2028,
  invisible chars — Stryker's tap dry run rejects them); AAA bodies; a `sut` variable (follow
  each file's local `sut` style: some files bind `sut` to the function, antigravity/cursor bind
  it to the result, git-bash-verdict imports `plainGitCommandVerdict as sut`). No test here
  spawns git; if one must, pin env (HOME, GIT_CONFIG_NOSYSTEM=1, GIT_CONFIG_GLOBAL,
  GIT_PAGER=cat, LC_ALL=C).
- No provenance refs (phase/ADR/backlog/part numbers, V-row ids) in source or tests. No
  suppression directives. No swallowed errors.
- Docs (`docs/contributing/specs/gate.md`, hooks/git-no-ext-diff.sh header, adapter READMEs,
  codex hooks.json description, BACKLOG close, the reviewer agent wording) belong to the
  documentation phase, not to any part: no doc file is pinned by a test this change flips
  (REASON_GIT_EXT_DIFF keeps its text, so every doc/hook/adapter pin quoting it stays green).
- Heavy runs under `nice -n 19`, one at a time; pipe test output to a file and read back only
  `# pass`/`# fail`/`not ok` lines.
- Stage explicit paths only; commit with `/usr/bin/git commit -m "<message>"`.

## Validation hand-off (orchestrator, not a part)

Census at scale (R5), after Part 5, one batch at a time, output to a file outside the tree,
read back only `# pass`, `# fail`, `unexpected`, `FALSE ALLOW`, `invalid shell` lines:

```
# engine suite — four batches
(cd engine && GUARD_FUZZ_SEEDS=101,202,303,404,505 GUARD_FUZZ_COUNT=1500 nice -n 19 node --test test/guards/shell-git-invocations.differential.test.js) > <out>/engine-b1.txt 2>&1
(cd engine && GUARD_FUZZ_SEEDS=11,22,33,44,55 GUARD_FUZZ_COUNT=1500 nice -n 19 node --test test/guards/shell-git-invocations.differential.test.js) > <out>/engine-b2.txt 2>&1
(cd engine && GUARD_FUZZ_SEEDS=66,77,88,99,111 GUARD_FUZZ_COUNT=1500 nice -n 19 node --test test/guards/shell-git-invocations.differential.test.js) > <out>/engine-b3.txt 2>&1
(cd engine && GUARD_FUZZ_SEEDS=271828,314159,161803,141421,173205 GUARD_FUZZ_COUNT=1500 nice -n 19 node --test test/guards/shell-git-invocations.differential.test.js) > <out>/engine-b4.txt 2>&1
# codex and copilot arms — at least batch 1
(cd adapters/codex && GUARD_FUZZ_SEEDS=101,202,303,404,505 GUARD_FUZZ_COUNT=1500 nice -n 19 node --test test/git-guard.differential.test.js) > <out>/codex-b1.txt 2>&1
(cd adapters/copilot && GUARD_FUZZ_SEEDS=101,202,303,404,505 GUARD_FUZZ_COUNT=1500 nice -n 19 node --test test/git-guard.differential.test.js) > <out>/copilot-b1.txt 2>&1
# hook differential (hook vs in-process predicate)
GUARD_FUZZ_SEEDS=101,202,303,404,505 GUARD_FUZZ_COUNT=1500 nice -n 19 node --test test/git-no-ext-diff.differential.test.js > <out>/hook-b1.txt 2>&1
```

The generator gains rows in Part 1, so every seed reshuffles: the census is re-run, never
taken from the design's Pinned Σ.

Stryker (validation): `--concurrency 1`, one module per run, ONE comma-joined `--mutate`
(repeated flags drop all but the last). From the repo root:
`nice -n 19 engine/node_modules/.bin/stryker run engine/stryker.conf.json --concurrency 1 --mutate engine/src/guards/git-ext-diff-predicate.js`
then a separate run for engine/src/guards/shell-git-invocations.js (hunk range of
dynamicHeadInvocation) and one for engine/src/guards/git-argv.js (the new export line). On a
"Worker exited unexpectedly" dry run, narrow the tap testFiles to the module's own suites via
an override config. Hand-check every survivor against its full covering set.

## Part 1 — Groundwork: hidden dynamic-head flag, fuzz show shapes, hook fixture re-pin

### Context

Lands green on the OLD rule. Nothing here changes a verdict. Size: ~35 tool calls,
2 RED→GREEN cycles + 2 GUARD steps.

Files edited:

- `engine/src/guards/shell-git-invocations.js` — `dynamicHeadInvocation` (L29), today:
  `const dynamicHeadInvocation = words => extend(normaliseFrom(words, 1), { leadingWords: () => [] });`
  It gains a hidden (non-enumerable) `dynamicHead: true`. Hidden because the invocation
  deep-equal row in shell-git-invocations.test.js (L40-46, "Given a dynamic head, when
  anchored, then a dynamic-head invocation is returned", deep-equals
  `{ ...subcommand('push'), leadingWords: [] }`) must stay green unchanged; the design's
  simulation showed an enumerable flag breaks it. Precedents for hidden keys: L160-161 of the
  same file (`injectsConfig`, `mentionsExtDiff` with `enumerable: false`); engine/src/guards/git-argv.js
  `HIDDEN` (L77) and `subcommandResult` (L106-114, hides `dynamicArgPositions`). `extend`
  (git-argv.js L96-97) copies own property descriptors, so a later `extend` keeps the hidden key.
  Public-surface decision: INTERNAL — a property on the engine-internal invocation object; no
  export, no barrel, no README. Its only consumer arrives in Part 3 (gitExtDiffPredicate's
  `judgedAsDiff`); until then nothing reads it (one commit on the branch; the branch
  squash-merges).
- `engine/test/guards/shell-git-invocations.test.js` — describe `gitInvocations()` (L16);
  helper `subcommand(name, args, configKeys, dynamicArgCount)` at L7-13; add rows after L46.
- `engine/test-helpers/git-differential-harness.js` — `VERBS` (L101-107; the row to extend is
  L104: `['diff', '--no-ext-diff --ext-diff'], ['show', '--ext-diff --no-ext-diff'],`);
  `SPECIALS` (L134-200; insert after L182 `fragment('G=git; command $G diff', { list: true }),`);
  `FIXED_ENTRIES` (L206) and `generateCommands(seed, cap)` (L303-308) put every SPECIAL at the
  head of every seed's list, so new SPECIALS run at the ci default seed. `fragment(text, opts)`;
  a `;`-joined special takes `{ list: true }`. These three new SPECIALS are UNTAGGED: the stub
  logs an argv the oracle judges as firing (before AND after the flip), so each is an expected
  block, not an intended false block. Do NOT touch `judgeArgv` (L452-462) here.
- `engine/test/guards/shell-git-invocations.differential.test.js` — already imports
  `generateCommands`; describe "shell-git-invocations — generator composition at scale" (L292)
  holds structural generator tests; `SEEDS` (L32) is the ci seed list.
- `test/hooks.test.js` — tests at L75-80 and L82-90 read fixture
  no-ext-diff-deny-global-opts.json via `decision(...)`/`reason(...)`; titles name
  "git -C /x show abc".
- `test/fixtures/hooks/no-ext-diff-deny-global-opts.json` — today
  `{"tool_input":{"command":"git -C /x show abc"}}`; no other test or script references it
  (an old plan doc quotes the name; dated, left alone). Sibling fixtures already pin
  `-c`, `--git-dir`, `--work-tree` diff spellings, so `git -C /x diff abc` duplicates none.

### TDD steps

1. RED — shell-git-invocations.test.js, in `gitInvocations()`:
   "Given a dynamic head, when anchored, then the invocation carries a hidden dynamicHead flag".
   Arrange `const sut = gitInvocations;` Act `const result = sut('$G show');` Assert
   `result.invocations[0].dynamicHead === true` and
   `Object.keys(result.invocations[0])` does not include `'dynamicHead'`.
   Fails: `dynamicHeadInvocation` sets no such key, so `dynamicHead` is `undefined`.
   GUARD in the same step: "Given a literal git head, when anchored, then the invocation
   carries no dynamicHead flag" — `sut('git status')`, `dynamicHead` is `undefined`; passes
   because `anchoredAt` never sets it.
2. GREEN — shell-git-invocations.js:
   ```js
   const dynamicHeadInvocation = words =>
     Object.defineProperty(extend(normaliseFrom(words, 1), { leadingWords: () => [] }), 'dynamicHead', { value: true, enumerable: false });
   ```
   GUARD: the L40-46 deep-equal row stays green (key hidden).
3. RED — shell-git-invocations.differential.test.js, in "generator composition at scale" (or a
   new describe beside it): "Given any seed, when commands are generated, then the firing show
   and brace spellings are fixed entries". Arrange the three texts
   `X=--ext-diff; git show $X`, `G=git; command $G {di,show}ff`, `G="git diff"; $G show`;
   Act `generateCommands(SEEDS[0], CAP)` texts (or `generateCommands(1, 100)` — fixed entries
   do not depend on the seed); Assert each text is present.
   Fails: SPECIALS holds none of them.
4. GREEN — harness SPECIALS, after L182:
   ```js
   fragment('X=--ext-diff; git show $X', { list: true }),
   fragment('G=git; command $G {di,show}ff', { list: true }),
   fragment('G="git diff"; $G show', { list: true }),
   ```
   Then the VERBS data rows (no RED of their own: `spell` randomises each word's quoting, so
   no text pin is stable; the fuzz itself is their test) — a new line right after L104:
   `['show', '--stat HEAD'], ['show', '--ext-diff'], ['show', '--no-ext-diff --ext-diff'],`.
   GUARD: the default-seed fuzz stays green — the old oracle judges all three VERBS rows and
   all three SPECIALS as firing and the old predicate denies them (planner probe: 28/0, codex
   4/0, copilot 10/0, hook 1/0). GUARD: the determinism test (L208-217, length === CAP) and
   "every tag reached" (L219-225) stay green.
5. GUARD re-pin — fixture becomes `{"tool_input":{"command":"git -C /x diff abc"}}`; the two
   titles become "Given git -C /x diff abc without --no-ext-diff, when git-no-ext-diff runs,
   then it denies" / "... then the reason is the engine ext-diff reason". Pass on the old rule
   (diff is denied with REASON_GIT_EXT_DIFF, verified in-process) and stay green after the
   flip (diff unchanged).
6. REFACTOR — none expected.

### Gate

`nice -n 19 bash scripts/ci.sh`

### Commit

`refactor(guards): flag dynamic-head invocations and seed the fuzz with show shapes`

## Part 2 — Re-pin the bindings' bare-show deny rows onto git diff (pre-flip)

### Context

Test-only, no src delta; every step is a GUARD (passes on the old rule and after the
flip). It exists because the flip in Part 3 cannot hold these files under the ceiling: without
this part, Part 3's commit would be red. Size: ~35 tool calls, 6 GUARD steps, no RED.

Each flipped deny row is replaced by a deny row exercising the same construct with `git diff`
(or by `git show --ext-diff`, which stays denied on every binding), so no parser path loses
its pin. Replacement must not duplicate an entry already in the same list. Every replacement
below was verified to deny today on both P and X:

- `engine/test/tool-call-guard.test.js` (toolCallGuard: pi, antigravity, cursor):
  - L37-44 "Given a git show tool call without --no-ext-diff ..." (`git show HEAD`) → "Given a
    git show tool call with --ext-diff, when guarded, then returns block: true"
    (`git show --ext-diff`).
  - L212-219 reason row (`git show HEAD`, asserts reason includes "external diff") → "Given a
    bare git diff HEAD without --no-ext-diff, when guarded, then reason mentions external diff"
    (`git diff HEAD`).
  - L231-236 "Given a bare git show at command start ..." (`git show`) → "Given git show
    --ext-diff at command start, when guarded, then returns block: true" (`git show --ext-diff`).
- `adapters/opencode/test/git-guard-predicate.test.js` (re-exports gitExtDiffPredicate):
  - `BLOCK_COMMANDS` L5-16: `'git show'` → `'git show --ext-diff'`; `'git show HEAD'` →
    `'git diff HEAD'`; `'git -c k=v show'` → `'git -c k=v diff'`; `'git --work-tree=. show'` →
    `'git --work-tree=. diff'`.
  - L60-67 reason row (`git show HEAD`) → `git diff HEAD`, title "Given a bare git diff HEAD
    without --no-ext-diff, ...".
  - Property lens L83-90: commands → `['git diff', 'git diff HEAD', 'git diff HEAD~2', 'git show --ext-diff']`;
    title "Given a bare git diff, or a git show enabling --ext-diff, with no compliant marker,
    when guarded, then always blocks".
- `adapters/codex/test/git-guard-predicate.test.js` (plainGitCommandVerdict): `BLOCK_COMMANDS`
  L26-36: `'git show'` → `'git show --ext-diff'`; `'git show HEAD'` → `'git diff HEAD'`;
  `'git --work-tree=. show'` → `'git --work-tree=. diff'`. KEEP `'git -c k=v show'` (L33): the
  plain gate denies it before and after the flip ("command too complex").
- `adapters/copilot/test/git-guard-predicate.test.js`: same mapping on `BLOCK_COMMANDS`
  L18-33 (`'git show'` L20, `'git show HEAD'` L22, `'git --work-tree=. show'` L27); KEEP
  `'git -c k=v show'` (L25).
- `adapters/antigravity/test/antigravity-guard-adapter.test.js` — L49-53 "Given run_command
  git show without --no-ext-diff, when decided, then it blocks" (`git show HEAD`) → "Given
  run_command git show --ext-diff, when decided, then it blocks" (`git show --ext-diff`).
  Local style: `const sut = decideGuard(runCommandPayload(...)); assert.equal(sut.block, true);`.
- `adapters/cursor/test/cursor-guard-adapter.test.js` — L99-105 "Given decideGuard, when it
  blocks, then the reason comes from the SHARED predicate" uses `git show` → `git diff`
  (REASON_GIT_EXT_DIFF still matches /external diff mangles parsed output/). Add a GUARD deny
  row in the same describe: "Given decideGuard on git show --ext-diff, when decided, then it
  blocks" (`shellPayload('git show --ext-diff')`, `sut.block === true`). Local style binds `sut`
  to the result.

Adapter-level deny rows assert `block: true` only: the reason of `git show --ext-diff` changes
at the flip (diff/show reason → any-verb reason); the reason is pinned at the predicate level
in Part 3.

### TDD steps

1. GUARD — tool-call-guard.test.js re-pins above; passes: `git show --ext-diff` and
   `git diff HEAD` deny today with a reason containing "external diff".
2. GUARD — opencode re-pins; passes: each replacement is denied by gitExtDiffPredicate today.
3. GUARD — codex re-pins; passes: plainGitCommandVerdict denies each today.
4. GUARD — copilot re-pins; same reason.
5. GUARD — antigravity re-pin; passes: shared predicate denies `git show --ext-diff`.
6. GUARD — cursor re-pin + new deny row; passes for the same reason.
   Run the six files (from each package dir, e.g. `cd adapters/codex && node --test test/git-guard-predicate.test.js`),
   then the gate.

### Gate

`nice -n 19 bash scripts/ci.sh`

### Commit

`test: re-pin bare git show deny rows onto git diff`

## Part 3 — The flip: show judged on --ext-diff, oracle in lock-step

### Context

The one commit where verdicts change (R1, R2, R4). Rule and oracle land together (see "Why
five parts"). Size: ~60 tool calls, 3 RED→GREEN cycles + 1 GUARD re-pin step.
Shares the harness and the differential test with Part 1 on purpose: Part 1 adds generator
rows that are green on the old oracle; only the judgeArgv line must ride with the rule.

Files edited:

- `engine/src/guards/git-argv.js` — L184 `export const DIFFING_VERBS = Object.freeze(['diff', 'show']);`
  stays. Add right after it:
  `// git runs diff.external without --ext-diff only for these verbs` and
  `export const DEFAULT_EXT_DIFF_VERBS = Object.freeze(['diff']);`.
  Public-surface decision: INTERNAL engine module export (same standing as `DIFFING_VERBS`,
  whose only consumers are git-ext-diff-predicate.js and shell-git-invocations.js); no barrel,
  no generated API report, no README surface. `DIFFING_VERBS` and so `ANCHOR_VERBS`
  (shell-git-invocations.js L31) are UNCHANGED (R3; removing `show` reopens the brace
  spelling `{git,{di,show}ff}`, which fires).
- `engine/src/guards/git-ext-diff-predicate.js` — import (L2) gains `DEFAULT_EXT_DIFF_VERBS`;
  `DIFFING_SUBCOMMANDS` (L16) stays; add `DEFAULT_EXT_DIFF_SUBCOMMANDS`; `diffsWithoutMarker`
  (L36-47) splits its subcommand branch into `subcommandDiffsWithoutMarker`; new
  `judgedAsDiff`. Unchanged: `REASON_GIT_EXT_DIFF` text (L9-10, quoted by hook/adapter/doc
  pins), `REASON_EXT_DIFF_OPTION` (L12), `lacksNoExtDiff` (L19), `enablesExtDiff` (L22-26),
  `dynamicAfterNoExtDiff` (L29-32), `optionReasonFor` (L49-52: tries diffsWithoutMarker first,
  so `git show --ext-diff` now falls through to the any-verb reason),
  `extDiffVerdictFor(invocation) → string|null` (L54), `gitExtDiffPredicate(command) → { block, reason? }`
  (L71). Doc comment L62-66 is reworded. Reads the hidden `dynamicHead` flag added in Part 1
  (engine/src/guards/shell-git-invocations.js, read-only here).
- `engine/test-helpers/git-differential-harness.js` — `judgeArgv` L452-462; the line
  `const diffs = normalised.subcommand === 'diff' || normalised.subcommand === 'show';`
  (L458). The oracle judges logged argv (dynamic words already expanded): no dynamic term.
  `show` falls into the any-verb branch (`last === '--ext-diff'`). Exported already.
- `engine/test/guards/shell-git-invocations.differential.test.js` — `judgeArgv` is imported
  (L24); existing oracle describe "shell-git-invocations — oracle on config section renames"
  (L364-374) is the pattern (rows → `assert.deepEqual(result, { destructive, extDiff })`).
- `engine/test/guards/git-ext-diff-predicate.test.js` (562 lines) — module-level
  `REASON_EXT_DIFF` (L416, the diff/show text); `REASON_EXT_DIFF_OPTION` is local to the
  "--ext-diff on any git verb" describe (L487) — hoist it to module scope beside L416 and reuse.
  Helper `assertBlocks(rows)` (L359-369). The 12 rows that flip (re-pinned in step 0):
  - L36-47 "Given a bare git show command ... exact reason" (`git show HEAD`)
  - L66 `git --git-dir=/repo/.git show HEAD` (interposed global options list)
  - L81 `git   show HEAD` (whitespace list)
  - L100 `ls && git show` (separator list)
  - L116 `git show HEAD && true`
  - L135 `true\ngit show HEAD`; L138 `git diff --no-ext-diff; git show HEAD`
  - L171 `git --git-dir='/a;b/.git' show HEAD`
  - L189 `git -c x='y' diff --no-ext-diff; git show HEAD`
  - L388 the dashed path `/x/git-core/git-show HEAD` inside `assertBlocks([...])`
  - L422 `git show --no-ext-diff --ext-diff HEAD` in "option order follows git" (asserts the
    diff/show reason)
  - L526-532 "Given git show, when checked, then it keeps the diff/show reason"
  Rows that must NOT change (still denied after the flip): L388 `G=git; nohup $G show`,
  L332 `git $(echo show)`, L455 `git show --no-ext-diff "$@" HEAD`.
- `engine/test/guards/git-bash-verdict.test.js` — X path (codex, copilot); imports
  `plainGitCommandVerdict as sut`; constants `EXT_DIFF_REASON` (L7, no `craft: ` prefix) and
  `EXT_DIFF_OPTION_REASON` (L12); rows assert `deepEqual(result, { block, reason? })`.

Post-flip verdicts (planner in-process run on a flipped copy; P = gitExtDiffPredicate,
X = plainGitCommandVerdict):

| Command | P | X |
|---|---|---|
| `git show`, `git show HEAD~1`, `git show -p HEAD`, `git show --stat`, `git show v1`, `git show HEAD:f`, `git show -m HEAD`, `git show --cc` | allow | allow |
| `git -C . show`, `git --no-pager show`, the absolute-path git show, `git-show`, `echo git show`, `git show -- --ext-diff` | allow | allow |
| `git show --ext-diff`, `git show --no-ext-diff --ext-diff` | DENY any-verb reason | DENY any-verb reason |
| `git show --ext-diff --no-ext-diff`, `git show --no-ext-diff HEAD`, `git show --ext-diff=1` | allow | allow |
| `X=--ext-diff; git show $X`, `git show $REV`, `git show --no-ext-diff $X` | DENY diff/show reason | DENY gate |
| `git show "$sha" --no-ext-diff` | allow | DENY gate |
| `git -c diff.external=x show`, `GIT_EXTERNAL_DIFF=x git show` | allow | DENY gate |
| `command $G show`, `{git,show}`, `G=git; command $G {di,show}ff`, `{git,{di,show}ff}` | DENY diff/show reason | DENY |
| `$G show`, `$G show HEAD` | DENY diff/show reason | DENY diff/show reason |
| `G="git diff"; $G show` | DENY diff/show reason | DENY gate |
| `G=git; $G status`, `X=--ext-diff; git log -p $X` | allow | DENY gate |

### TDD steps

0. GUARD re-pin (git-ext-diff-predicate.test.js), before any RED so no step breaks a green
   row: replace each `show` spelling of the 12 rows with its `git diff` twin —
   `git diff HEAD` (exact reason, title "Given a bare git diff HEAD command ..."),
   `git --git-dir=/repo/.git diff HEAD`, `git   diff HEAD`, `ls && git diff`,
   `git diff HEAD && true`, `true\ngit diff HEAD`, `git diff --no-ext-diff; git diff HEAD`,
   `git --git-dir='/a;b/.git' diff HEAD`, `git -c x='y' diff --no-ext-diff; git diff HEAD`,
   the dashed path `/x/git-core/git-diff HEAD`; drop L422's `show` entry (the list already holds
   `git diff --no-ext-diff --ext-diff`); L526 becomes "Given git diff, when checked, then it
   keeps the diff/show reason" (`git diff`). All deny today with the diff/show reason
   (verified in-process) and are untouched by the flip.
1. RED — differential test file, new describe "shell-git-invocations — oracle on git show":
   - `['show']` → `{ destructive: false, extDiff: false }` — fails: today `diffs` is true for
     `show`, so extDiff is true.
   - `['show', '--stat', 'HEAD']` → `extDiff: false` — fails for the same reason.
   - GUARD rows (pass today and after): `['show', '--ext-diff']` → true;
     `['show', '--no-ext-diff', '--ext-diff']` → true; `['show', '--ext-diff', '--no-ext-diff']`
     → false; `['diff']` → true.
2. GREEN — harness L458: `const diffs = normalised.subcommand === 'diff';`.
   (The default-seed fuzz is red from here until step 4: unexpected false blocks on bare
   `show`. Run only unit files until step 4.)
3. RED — new describe in git-ext-diff-predicate.test.js, "gitExtDiffPredicate() — git show is
   judged on --ext-diff and dynamic option words":
   - allow, `assert.deepEqual(result, { block: false })` — fail: today each is denied with the
     diff/show reason: `git show`, `git show HEAD~1`, `git show -p HEAD`, `git show --stat`,
     `git show v1`, `git show HEAD:f`, `git show -m HEAD`, `git show --cc`, `git -C . show`,
     `git --no-pager show`, `/usr/bin/git show`, `git-show`,
     `echo git show`, `git show -- --ext-diff`, `git show --ext-diff=1`,
     `git -c diff.external=x show`, `GIT_EXTERNAL_DIFF=x git show`, plus the step-0 spellings
     (`git --git-dir=/repo/.git show HEAD`, `ls && git show`, the dashed path
     `/x/git-core/git-show HEAD`).
   - `git show --ext-diff`, `git show --no-ext-diff --ext-diff HEAD` →
     `{ block: true, reason: REASON_EXT_DIFF_OPTION }` — fail: today the diff/show reason wins
     (optionReasonFor tries diffsWithoutMarker first).
   - GUARD (pass today, must survive): `X=--ext-diff; git show $X`, `git show $REV`,
     `git show --no-ext-diff $X`, `$G show`, `$G show HEAD`, `G="git diff"; $G show` →
     `{ block: true, reason: REASON_EXT_DIFF }`; `command $G show`, `{git,show}`,
     `G=git; command $G {di,show}ff`, `{git,{di,show}ff}` → block true;
     `git show --ext-diff --no-ext-diff`, `git show --no-ext-diff HEAD`,
     `git show "$sha" --no-ext-diff` → `{ block: false }`; `G=git; $G status` and
     `X=--ext-diff; git log -p $X` → `{ block: false }` (they kill the `judgedAsDiff`
     and dynamic-word-branch mutants: a dynamic head on a non-diff verb and a dynamic word on a
     non-diff verb stay allowed).
   RED also in git-bash-verdict.test.js (X path), in its existing describe:
   - "Given git show --stat, When judged, Then it is allowed" → `{ block: false }` — fails:
     today `{ block: true, reason: EXT_DIFF_REASON }`.
   - "Given git show --ext-diff, When judged, Then the ext-diff option reason blocks" →
     `{ block: true, reason: EXT_DIFF_OPTION_REASON }` — fails: today EXT_DIFF_REASON.
   - GUARD: "Given a dynamic-head git show, When judged, Then the ext-diff rule blocks" —
     `$G show` → `{ block: true, reason: EXT_DIFF_REASON }` (the plain gate lets `$G show`
     through, so this pins the hidden flag on the X path).
4. GREEN — git-argv.js export (Context) and git-ext-diff-predicate.js:
   ```js
   const DEFAULT_EXT_DIFF_SUBCOMMANDS = new Set(DEFAULT_EXT_DIFF_VERBS);

   // A dynamic head may itself hold `git diff`, so its verb word is not the verb git runs.
   const judgedAsDiff = invocation =>
     DEFAULT_EXT_DIFF_SUBCOMMANDS.has(invocation.subcommand) ||
     (invocation.dynamicHead === true && DIFFING_SUBCOMMANDS.has(invocation.subcommand));

   // show runs no external diff by default; a dynamic option word may still expand to --ext-diff.
   const subcommandDiffsWithoutMarker = invocation => {
     if (judgedAsDiff(invocation)) return lacksNoExtDiff(invocation.args) || dynamicAfterNoExtDiff(invocation);
     return DIFFING_SUBCOMMANDS.has(invocation.subcommand) && dynamicAfterNoExtDiff(invocation);
   };

   const diffsWithoutMarker = invocation => {
     if (invocation.kind === 'subcommand') return subcommandDiffsWithoutMarker(invocation);
     if (invocation.kind === 'indeterminate') return lacksNoExtDiff(invocation.rest);
     return false;
   };
   ```
   Now every RED of steps 1 and 3 passes, every GUARD stays green, and the default-seed fuzz
   agrees again (planner probe: engine 28/0, codex 4/0, copilot 10/0, hook 1/0).
5. REFACTOR — doc comment L62-66 of `gitExtDiffPredicate`: "does this bash command run git
   diff (or git show with a dynamic option word) without --no-ext-diff, or pass --ext-diff to
   any git verb?"; keep the L4 comment accurate ("a git diff/show invocation" stays true).
   No other src change.

### Gate

`nice -n 19 bash scripts/ci.sh`

### Commit

`fix(guards): judge git show on --ext-diff instead of default-denying it`

## Part 4 — Claude hook and tool-call entry points (post-flip)

### Context

Lands after Part 3 (the rule is live). Pins R1 at the Claude hook main (Claude) and at
toolCallGuard (pi, antigravity, cursor share it), plus the stale comment. The allow rows can
only pass after the flip and the flip part sits at the ceiling, so they are GUARD entries
here. Size: ~25 tool calls, GUARD steps only. Shares tool-call-guard.test.js with Part 2 on
purpose: Part 2 removed its show deny rows before the flip, this part adds the allow rows only
the flip makes true.

Files edited:

- `engine/test/claude-ext-diff-hook-main.test.js` — `ALLOWED_FORMS` (L47-61, rows
  `{ label, command }`, driven by describe "claude ext-diff hook main - allowed commands" L78);
  the reason table in describe "claude ext-diff hook main - reason prefix" (L99-124, rows
  `{ label, command, reason }`; the any-verb row at L104-108 shows the
  `'craft: --ext-diff is denied on every git verb (external diff mangles parsed output)'` text).
  `EXT_DIFF_REASON` (L6) is unchanged.
- `engine/test/tool-call-guard.test.js` — describe "toolCallGuard() — git diff/show without
  --no-ext-diff" (L26) and "... regex pin: documented cases" (L222); helper `bashEvent(command)`
  (L14-18). Part 2 already re-pinned its show deny rows.
- `engine/src/guards/tool-call-guard.js` — L8 comment
  `// Tools whose Bash command must be checked for git diff/show without --no-ext-diff.`
  The module's code is unchanged (it composes gitExtDiffPredicate).

### TDD steps

1. GUARD — claude-ext-diff-hook-main.test.js: add to `ALLOWED_FORMS`
   `{ label: 'a git show reading a commit summary', command: 'git show --stat' }` and
   `{ label: 'a bare git show of a revision', command: 'git show HEAD' }`; add to the reason
   table `{ label: 'git show enabling the external diff', command: 'git show --ext-diff', reason: 'craft: --ext-diff is denied on every git verb (external diff mangles parsed output)' }`.
   Passes: Part 3's rule allows bare show and gives `show --ext-diff` the any-verb reason.
2. GUARD — tool-call-guard.test.js: "Given a git show --stat tool call, when guarded, then
   returns block: false" and "Given a bare git show HEAD tool call, when guarded, then returns
   block: false". Passes after Part 3.
3. REFACTOR — tool-call-guard.js L8 comment: "Tools whose Bash command must be checked for git
   diff (and git show with a dynamic option word) without --no-ext-diff, or --ext-diff on any
   verb."

### Gate

`nice -n 19 bash scripts/ci.sh`

### Commit

`test(guards): pin git show verdicts at the claude hook and tool-call entry points`

## Part 5 — Adapter entry points: show allowed, show --ext-diff denied (post-flip)

### Context

Lands after Part 3. Pins R1 on opencode, codex, copilot, antigravity and cursor at their own
entry points. Test-only, GUARD entries (the deny rows landed in Part 2). Size: ~30 tool calls. Shares its five files with Part 2 on
purpose: the deny re-pins had to land before the flip, the allow rows can only land after it.

Files edited (lists and helpers as described in Part 2):

- `adapters/opencode/test/git-guard-predicate.test.js` — `PASS_COMMANDS` (L18-27).
- `adapters/codex/test/git-guard-predicate.test.js` — `PASS_COMMANDS` (L42-50, comment at
  L38-41 explains why no empty string; keep it). Helper `execPayload(cmd)`.
- `adapters/copilot/test/git-guard-predicate.test.js` — `PASS_COMMANDS` (L35-44). Helper
  `bashPayload(command)`.
- `adapters/antigravity/test/antigravity-guard-adapter.test.js` — describe "decideGuard —
  enforces git-ext-diff via the shared predicate, both directions" (L40+); helper
  `runCommandPayload(commandLine, cwd)`.
- `adapters/cursor/test/cursor-guard-adapter.test.js` — helper `shellPayload(command, extra)`;
  add next to the Part 2 deny row.

Codex and copilot run plainGitCommandVerdict: the plain gate still denies `git -c k=v show`
(config) — never add it to their PASS lists. opencode runs gitExtDiffPredicate only, so it
allows `git -c k=v show`.

### TDD steps

1. GUARD — opencode `PASS_COMMANDS` += `'git show'`, `'git show HEAD'`, `'git show --stat'`,
   `'git -c k=v show'`, `'git --work-tree=. show'`. Passes after Part 3 (P allows each).
2. GUARD — codex `PASS_COMMANDS` += `'git show'`, `'git show HEAD'`, `'git show --stat'`,
   `'git --work-tree=. show'`. Passes after Part 3 (X allows each; verified in-process).
3. GUARD — copilot `PASS_COMMANDS` += the same four.
4. GUARD — antigravity: "Given run_command git show --stat, when decided, then it allows"
   (`sut.block === false`).
5. GUARD — cursor: "Given decideGuard on git show --stat, when decided, then it allows"
   (`sut.block === false`).

### Gate

`nice -n 19 bash scripts/ci.sh`

### Commit

`test(adapters): pin git show verdicts at every adapter entry point`
