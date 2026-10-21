# Design — git-show-ext-diff-default-deny

> Brief: backlog "Open — A. Git guard rules": "`git show` without `--ext-diff` is blocked though
> git runs no external diff." Every binding denies a bare `git show` because `show` sits in the
> default-deny verb list beside `diff`. Decide whether `show` stays there, for every binding that
> composes the shared ext-diff rule.
> Status: draft → self-reviewed ×3

## Context

### What exists today

- **The default-deny.** `engine/src/guards/git-argv.js:184`
  `export const DIFFING_VERBS = Object.freeze(['diff', 'show']);`.
  `engine/src/guards/git-ext-diff-predicate.js`: `DIFFING_SUBCOMMANDS = new Set(DIFFING_VERBS)`
  (L16); `diffsWithoutMarker(invocation)` (L36-47) denies a `subcommand` invocation whose verb is
  in that set when `lacksNoExtDiff(args)` (the last `--ext-diff`/`--no-ext-diff` word before `--`
  is not `--no-ext-diff`) or `dynamicAfterNoExtDiff(invocation)` (a dynamic word sits after the
  last `--no-ext-diff`), and an `indeterminate` invocation without a trailing `--no-ext-diff`.
  Reason `REASON_GIT_EXT_DIFF` (L9-10):
  `'git diff/show must carry --no-ext-diff (external diff mangles parsed output)'`.
- **The any-verb rule (ADR-660).** `enablesExtDiff(invocation)` (L22-26) denies a literal
  `--ext-diff` as the last setting before `--` on every verb, reason `REASON_EXT_DIFF_OPTION`
  (L12). `optionReasonFor` (L49-52) tries `diffsWithoutMarker` first, so `git show --ext-diff`
  carries the diff/show reason today.
- **Anchoring.** `engine/src/guards/shell-git-invocations.js:31`
  `ANCHOR_VERBS = new Set([...DESTRUCTIVE_VERBS, ...DIFFING_VERBS])`. `isAnchorToken` (L39,
  anchor verb or `--ext-diff`) drives `holdsAnchorVerb` → `patternAnchors` (`{git,show}`) and
  `isAnchorVerb` → `wrapperAnchors` (`command $G show`): both emit an `indeterminate` invocation,
  which the ext-diff rule denies without a trailing `--no-ext-diff`. `readsArguments` (L205-206)
  counts anchor-verb invocations against the 256 cap.
- **Bindings.** Through `gitExtDiffPredicate`: Claude (`hooks/git-no-ext-diff.sh` →
  `engine/bin/claude-ext-diff-verdict.js` → `engine/src/claude-ext-diff-hook-main.js:50`),
  opencode (`adapters/opencode/src/git-guard-predicate.js:2` re-export), and, through
  `engine/src/guards/tool-call-guard.js` `toolCallGuard` → `guardBashCommand` (L32-34): pi
  (`adapters/pi/src/tool-call-hook.js:3`), antigravity
  (`adapters/antigravity/src/antigravity-guard-adapter.js:18`) and cursor
  (`adapters/cursor/src/cursor-guard-adapter.js:20`). Through `plainGitCommandVerdict`
  (`engine/src/guards/git-bash-verdict.js:21`: plain gate, destructive, then `extDiffVerdictFor`):
  codex (`adapters/codex/src/git-guard-adapter.js:171`) and copilot
  (`adapters/copilot/src/git-guard-adapter.js:113`). Every hook entry point imports the shared
  engine; no binding vendors a copy. `adapters/codex/craft.rules` holds no diff/show rule.
- **The oracle.** `engine/test-helpers/git-differential-harness.js:457` `judgeArgv`:
  `const diffs = normalised.subcommand === 'diff' || normalised.subcommand === 'show';` then
  `extDiff = configured || (diffs ? last !== '--no-ext-diff' : last === '--ext-diff')`.
  Generator rows naming `show`: `VERBS` L102 `['show', '']`, `['show', '--no-ext-diff HEAD']`,
  L104 `['show', '--ext-diff --no-ext-diff']`; `SPECIALS` L183
  `fragment('echo "$HOME" show', { tags: [TAGS.dynamicBeforeVerb] })`;
  `engine/test-helpers/plain-gate-generator.js:33` `'git show'`.
- **Craft itself asks for `git show`.** `skills/implementation/SKILL.md:52` and
  `skills/planning/SKILL.md:56` tell agents to read `git show --stat`; every binding denies it
  today (Pinned V). `engine/src/lessons-hint-main.js:81` runs `git show <rev>:<path>` through
  `execFile`, not through a guarded Bash call: no change, and a blob read does not fire (Pinned S
  row `show HEAD~1:f`).

### Constraints from prior decisions

- ADR-660 (`docs/contributing/adr/660-the-ext-diff-rule-denies-ext-diff-on-any-verb-and-alias-config.md`):
  `--ext-diff` denied on every verb, `git config` alias/include keys denied. Its design left
  `git show` as an out-of-scope over-block (`docs/contributing/design/guard-fuzz-scale-ext-diff-widen.md`
  row M23 and Out of scope). Its decided residual: a dynamic word on a non-diff verb is not read
  as a possible `--ext-diff` (`X=--ext-diff; git log -p $X` allowed on the predicate bindings).
- ADR-647: the Claude hook judges the ext-diff rule only.
- Scope (`docs/contributing/specs/gate.md`): the guard protects parsed output from an external
  diff driver; it is not a sandbox. Unparseable shell fails closed.
- Lesson 003 (`docs/contributing/lessons/003-narrowing-a-guard-anchor-reopens-spellings.md`):
  narrowing an anchor set reopens dynamic, glob, brace and path spellings. Lesson 002: tests that
  spawn git pin their env. Lesson 005: README design-doc count tracks the files on disk.

### Pinned S — where an external diff fires on `show` (real git, orchestrator run)

Throwaway repo with merges, an evil merge, an annotated tag and a stash; stub external diff
printing a marker; three modes: `-c diff.external=<stub>`, repo `git config diff.external`,
`GIT_EXTERNAL_DIFF`. Git 2.50.1 (Sublime Merge bundle), 2.54.0 (Apple), 2.55.0 (local build),
2.56.0 (Homebrew): all four identical, all three modes identical.

| # | Command | Fires |
|---|---|---|
| S1 | `git show`, `show HEAD~1`, `show -p`, `show --patch-with-stat`, `show --stat` | no |
| S2 | `show -m HEAD` (merge), `show --cc`, `show --diff-merges=first-parent`, `show --diff-merges=separate`, `show --remerge-diff` | no |
| S3 | `show v1` (annotated tag), `show HEAD~1:f` (blob), `show stash@{0}`, `show --textconv`, `show --format=%H`, `git stash show -p` | no |
| S4 | `show --ext-diff`; `show --no-ext-diff --ext-diff` (last wins) | FIRES |
| S5 | `show --ext-diff --no-ext-diff` | no |
| S6 | positive control `git diff HEAD~1 HEAD` | FIRES |

Gitattributes vectors (`*.x diff=probe`), all four versions identical:

| # | Driver | Fires | No fire |
|---|---|---|---|
| S7 | `-c diff.probe.command=<stub>` | `show --ext-diff`, `diff`, `diff --no-textconv` | `show HEAD`, `show --no-ext-diff`, `log -p -1`, `diff --no-ext-diff`, `show --no-textconv` |
| S8 | `-c diff.probe.textconv=<stub>` | `show HEAD`, `show --no-ext-diff`, `show --ext-diff`, `log -p -1`, `diff`, `diff --no-ext-diff` | `diff --no-textconv`, `show --no-textconv` |

### Pinned S′ — older git and extra rows (this design)

Git 2.17.0 and 2.30.0 built from the kernel.org release tarballs in a throwaway directory
(`make NO_GETTEXT=1 NO_OPENSSL=1 NO_CURL=1 NO_EXPAT=1 NO_TCLTK=1 NO_PERL=1 NO_PYTHON=1 git`, run
with `GIT_EXEC_PATH` at the build directory), plus Homebrew 2.56.0 as control. Throwaway repo per
run, env pinned (`HOME`, `GIT_CONFIG_NOSYSTEM=1`, `GIT_CONFIG_GLOBAL`, `GIT_PAGER=cat`,
`LC_ALL=C`); the probe was a script file. The stub appends to a marker file. Tag `nm` is a
non-merge commit, `mg` an evil merge.

| # | Command (modes `-c`, repo config, env) | 2.17.0 | 2.30.0 | 2.56.0 |
|---|---|---|---|---|
| S′1 | `show nm`, `show -p nm`, `show --patch-with-stat nm`, `show --stat nm`, `show --format=%H nm`, `show --textconv nm` | no | no | no |
| S′2 | `show -m mg`, `show --cc mg`, `show v1`, `show nm:f`, `show stash@{0}`, `log -p -1 nm` | no | no | no |
| S′3 | `show --diff-merges=first-parent mg` | refused (128) | refused (128) | no |
| S′4 | `show --ext-diff nm`, `show --no-ext-diff --ext-diff nm`, `show --ext-diff -m mg` | FIRES | FIRES | FIRES |
| S′5 | `show --ext-diff --no-ext-diff nm` | no | no | no |
| S′6 | `diff nm~1 nm` (control) | FIRES | FIRES | FIRES |
| S′7 | `X=--ext-diff; git show $X` (unquoted, `-c` mode) | FIRES | FIRES | FIRES (2.54.0 too) |
| S′8 | `show --ext-diff=1` | refused (`unrecognized argument`) | refused (`takes no value`) | refused (2.54.0 too) |
| S′9 | S7 and S8 rows (`diff.probe.command`, `diff.probe.textconv`) | as S7/S8 | as S7/S8 | as S7/S8 |

So no probed version (2.17.0, 2.30.0, 2.50.1, 2.54.0, 2.55.0, 2.56.0) runs an external diff on
`show` without `--ext-diff`.
Older than 2.17.0 is not pinned (the docker daemon is down; no older git on the box).

A brace spelling whose expansion runs `git diff`, `/bin/bash` 3.2, Homebrew git, file `showff`
modified: `G=git; command $G {di,show}ff` FIRES; `{git,{di,show}ff}` FIRES.

### Pinned V — today's verdicts (in-process, this tree)

P = `gitExtDiffPredicate` (Claude, opencode, pi, antigravity, cursor); X = `plainGitCommandVerdict`
(codex, copilot).

| Command | P | X |
|---|---|---|
| `git show`, `show HEAD~1`, `show -p HEAD`, `show --stat`, `show v1`, `show HEAD:f` | DENY | DENY |
| `git show --ext-diff`, `show --no-ext-diff --ext-diff` | DENY (diff/show reason) | DENY |
| `git show --no-ext-diff HEAD`, `show --ext-diff --no-ext-diff`, `git stash show -p`, `git log -p` | allow | allow |
| `git show $REV`, `git show --no-ext-diff $X`, `X=--ext-diff; git show $X` | DENY | DENY (gate) |
| `git show "$sha" --no-ext-diff` | allow | DENY (gate) |
| `git -c diff.external=x show`, `GIT_EXTERNAL_DIFF=x git show` | DENY | DENY (gate) |
| `command $G show`, `{git,show}`, `$G show`, `/usr/bin/git show`, `git-show`, `echo git show`, `git show -- --ext-diff` | DENY | DENY |
| `G=git; command $G {di,show}ff`, `{git,{di,show}ff}` | DENY | DENY |

### Pinned Σ — the recommended shape, simulated (throwaway copy of this tree)

A full copy of the tree (no `.git`) with the Part 1 shape below applied and the oracle line
changed to `const diffs = normalised.subcommand === 'diff';` (generator unchanged):
- Guard suites (`engine/test/guards/*.test.js`, `engine/test/tool-call-guard.test.js`,
  `engine/test/claude-ext-diff-hook-main.test.js`, every `adapters/*/test/*guard*.test.js`,
  `test/hooks.test.js`, `test/git-no-ext-diff.differential.test.js`): 1587 tests, 31 failures,
  every one an expected flip of a bare-`show` deny row or of the `show --ext-diff` reason (file
  list in Test strategy). No other failure.
- Engine census, `GUARD_FUZZ_COUNT=1500`, batches 101,202,303,404,505 / 11,22,33,44,55 /
  66,77,88,99,111 / 271828,314159,161803,141421,173205: 36 pass, 0 fail per batch; no
  `unexpected`, `FALSE ALLOW` or `invalid shell` line.
- Codex and copilot arms, batch 101,202,303,404,505 at 1500: 0 fail each.

A second simulation removed `show` from `DIFFING_VERBS` outright (so from `ANCHOR_VERBS` too). It
flips `G=git; command $G {di,show}ff` (P and X) and `{git,{di,show}ff}` (P) from DENY to allow,
and both fire (Pinned S′). That is the lesson-003 reopening, so the shape below keeps `show` an
anchor verb. A first cut of the shape also flipped the dynamic head `$G show` to allow; with
`G="git diff"` and a modified file named `show` it FIRES (`/bin/bash` 3.2, Homebrew git), so the
shape keeps a dynamic-head `show` on the default-deny (the hidden `dynamicHead` flag below). An
enumerable flag broke the deep-equal in `engine/test/guards/shell-git-invocations.test.js`
("Given a dynamic head, when anchored, …"); the hidden one does not.

## Requirements

- **R1** Under the chosen DC-1 option, every row of the verdict matrix below holds on every
  binding: Claude, opencode, pi, antigravity, cursor (via `gitExtDiffPredicate`) and codex,
  copilot (via `plainGitCommandVerdict`).
- **R2** No binding regresses: every command denied today whose expansion can fire (Pinned S,
  S′) stays denied, including `X=--ext-diff; git show $X` and the brace spellings
  `G=git; command $G {di,show}ff`, `{git,{di,show}ff}`.
- **R3** Unparseable shell and `indeterminate` invocations still fail closed; the anchor set does
  not narrow; the 256-anchor cap behaviour is unchanged.
- **R4** `judgeArgv` changes in lock-step with the rule, independent of predicate code, and the
  generator emits the new allow shapes so the fuzz checks them against real bash.
- **R5** The census stays green at scale: `GUARD_FUZZ_COUNT=1500` on the 20 seeds of Pinned Σ
  for the engine suite; codex and copilot arms green on at least the first batch.
- **R6** Docs state the rule as shipped and name its residuals; the guard claims parsed-output
  protection only.
- **R7** Tests: TDD London School, Given/When/Then titles in printable ASCII, AAA bodies, a `sut`
  variable; a test that spawns git pins its env (lesson 002); no provenance references in source
  or tests.

## Design

The shape below is for DC-1 option (a), the recommendation. Under (b) nothing in `engine/src`
changes and Part 3 only records the decision. (c) has no shape here: it needs a git-version
source the text guard does not have (DC-1).

### Part 1 — rule: `show` is judged on `--ext-diff` and dynamic option words (option a)

**Context block.**
- `engine/src/guards/git-argv.js:184` `DIFFING_VERBS` (keep), add a sibling export after it.
- `engine/src/guards/git-ext-diff-predicate.js`: `REASON_GIT_EXT_DIFF` (L9-10, text unchanged),
  `DIFFING_SUBCOMMANDS` (L16), `lacksNoExtDiff(words)` (L19), `enablesExtDiff(invocation)`
  (L22-26), `dynamicAfterNoExtDiff(invocation)` (L29-32), `diffsWithoutMarker(invocation)`
  (L36-47), `optionReasonFor` (L49-52), `extDiffVerdictFor(invocation) → string|null` (L54),
  `gitExtDiffPredicate(command) → { block, reason? }` (L71), doc comment L63-66.
- `engine/src/guards/shell-git-invocations.js:31` `ANCHOR_VERBS`: untouched.
  `dynamicHeadInvocation` (L29): gains a hidden flag.
- `engine/src/guards/tool-call-guard.js:8` comment names "git diff/show without --no-ext-diff".

```js
// git-argv.js
export const DIFFING_VERBS = Object.freeze(['diff', 'show']);
// git runs diff.external without --ext-diff only for these verbs
export const DEFAULT_EXT_DIFF_VERBS = Object.freeze(['diff']);

// git-ext-diff-predicate.js
const DEFAULT_EXT_DIFF_SUBCOMMANDS = new Set(DEFAULT_EXT_DIFF_VERBS);

const diffsWithoutMarker = invocation => {
  if (invocation.kind === 'subcommand') return subcommandDiffsWithoutMarker(invocation);
  if (invocation.kind === 'indeterminate') return lacksNoExtDiff(invocation.rest);
  return false;
};

// A dynamic head may itself hold `git diff`, so its verb word is not the verb git runs.
const judgedAsDiff = invocation =>
  DEFAULT_EXT_DIFF_SUBCOMMANDS.has(invocation.subcommand) ||
  (invocation.dynamicHead === true && DIFFING_SUBCOMMANDS.has(invocation.subcommand));

// show runs no external diff by default; a dynamic option word may still expand to --ext-diff.
const subcommandDiffsWithoutMarker = invocation => {
  if (judgedAsDiff(invocation)) return lacksNoExtDiff(invocation.args) || dynamicAfterNoExtDiff(invocation);
  return DIFFING_SUBCOMMANDS.has(invocation.subcommand) && dynamicAfterNoExtDiff(invocation);
};

// shell-git-invocations.js — hidden, as dynamicArgPositions is, so invocation deep-equals hold
const dynamicHeadInvocation = words =>
  Object.defineProperty(extend(normaliseFrom(words, 1), { leadingWords: () => [] }), 'dynamicHead', { value: true, enumerable: false });
```

- `diff`: unchanged (S6, S′6).
- `show`, literal words only: allowed unless `enablesExtDiff` holds (S1-S5, S′1-S′5).
  `git show --ext-diff` and `show --no-ext-diff --ext-diff` now carry `REASON_EXT_DIFF_OPTION`
  (`optionReasonFor` falls through to `enablesExtDiff`). `git show --ext-diff=1` is allowed: git
  refuses it (S′8), as ADR-660 already allows `--ext-diff=1` on other verbs.
- `show` with a dynamic word after the last `--no-ext-diff` (or with no marker): still denied with
  `REASON_GIT_EXT_DIFF` (R2: S′7 fires). This keeps `show` stricter than `log` (ADR-660's dynamic
  residual stays a non-diff-verb residual). The compliant spelling for a dynamic revision stays
  `git show "$sha" --no-ext-diff`.
- Dynamic head (`$G show`, `$G show HEAD`): stays denied (V11). `$G HEAD` stays allowed as
  today (Out of scope).
- `indeterminate`: unchanged. `DIFFING_VERBS`, `ANCHOR_VERBS`, `holdsAnchorVerb`,
  `wrapperAnchors`, `readsArguments` unchanged (R3): `command $G show`, `{git,show}`,
  `echo "$HOME" show` stay fail-closed over-blocks.
- `REASON_GIT_EXT_DIFF` text unchanged: it still fires only on `diff`, on `show` with a dynamic
  option word, and on `indeterminate` invocations, and the hook, adapter and doc pins quote it.
- Doc comments: `gitExtDiffPredicate` (L63-66) and `tool-call-guard.js:8` say "git diff (and
  git show with a dynamic option word) without --no-ext-diff".
- Config and env channels: the predicate bindings allow `git -c diff.external=x show` and
  `GIT_EXTERNAL_DIFF=x git show` (no fire, Pinned S); the plain gate still denies them on codex
  and copilot (unsafe config, `GIT_` assignment).

### Part 2 — oracle and generator in lock-step (R4)

**Context block.** `engine/test-helpers/git-differential-harness.js`: `VERBS` (L101-107),
`SPECIALS` (`echo "$HOME" show`, L183), `lastExtDiffSetting` (L448-450), `judgeArgv`
(L452-462), `oracleVerdict`. `engine/test-helpers/plain-gate-generator.js:33`.

- `judgeArgv`: `const diffs = normalised.subcommand === 'diff';`. `show` falls into the any-verb
  branch (`last === '--ext-diff'`). The oracle judges logged argv, where a dynamic word has
  already expanded, so it needs no dynamic-word term.
- `VERBS`: keep `['show', '']`, `['show', '--no-ext-diff HEAD']`,
  `['show', '--ext-diff --no-ext-diff']`; add `['show', '--stat HEAD']`,
  `['show', '--ext-diff']`, `['show', '--no-ext-diff --ext-diff']` so both directions of the new
  `show` rule are generated.
- `SPECIALS`, untagged (the stub logs argv the oracle judges as firing, so each is an expected
  block): `fragment('X=--ext-diff; git show $X', { list: true })` (logs `show --ext-diff`, R2),
  `fragment('G=git; command $G {di,show}ff', { list: true })` (logs `diff showff`, the
  lesson-003 spelling), `fragment('G="git diff"; $G show', { list: true })` (logs `diff show`,
  V11). The existing `echo "$HOME" show` keeps its `dynamic-before-verb` tag.
- New `VERBS` and `SPECIALS` reshuffle every seed, so the census of R5 is re-run after Part 2,
  not taken from Pinned Σ (which ran the old generator).
- `plain-gate-generator.js:33`: unchanged (`git show` was an allow candidate for the gate, which
  never judged verbs).

### Part 3 — docs (documentation phase)

Files stating the bare-`show` rule today:
- `docs/contributing/specs/gate.md` L13, L47-61 (Claude hook rule and reasons), L113-114 (pi),
  L129 (opencode), L241-257 (residuals): `show` judged on `--ext-diff` and dynamic option words.
- `hooks/git-no-ext-diff.sh:2-3` header comment.
- `adapters/codex/hooks.json:2` description; `adapters/antigravity/README.md:21`;
  `adapters/cursor/README.md:16`; `adapters/aider/README.md:61` (mentions only).
- `agents/reviewer.md:15` and its synced copies `adapters/*/agents/craft-reviewer.md:15`
  ("always pass `--no-ext-diff` to `git diff`/`git show`") — still correct advice; touch only if
  the documentation phase rewords it, through `scripts/sync-adapter-agents.sh`.
- `BACKLOG.md` entry (L184-189): close it.
- A new ADR recording DC-1 that refines ADR-660 (it narrows the older diff/show default-deny that
  ADR-660 left in place; ADR-660's decision stands). The `*-poc-record.md` specs are dated
  records: unchanged.

### Verdict matrix — before → after, per binding

P = Claude, opencode, pi, antigravity, cursor (`gitExtDiffPredicate`); X = codex, copilot
(`plainGitCommandVerdict`). `*` = over-block (git does not fire). Before = Pinned V; after (a) =
Pinned Σ for the rows it ran, the Part 1 code for the rest.

| # | Command | git | before P | before X | after (a) P | after (a) X | after (b) | after (c) |
|---|---|---|---|---|---|---|---|---|
| V1 | `git show`, `show HEAD~1`, `show -p HEAD`, `show --stat`, `show v1`, `show HEAD:f`, `show -m <merge>`, `show --cc` | no | DENY* | DENY* | allow | allow | DENY* | = (a) on every pinned git; DENY* on an unpinned git |
| V2 | `git -C . show`, `git --no-pager show`, `/usr/bin/git show`, `git-show`, `echo git show`, `git show -- --ext-diff` | no | DENY* | DENY* | allow | allow | DENY* | as V1 |
| V3 | `git show --ext-diff`, `show --no-ext-diff --ext-diff` | FIRES | DENY | DENY | DENY (any-verb reason) | DENY | DENY | DENY |
| V4 | `git show --ext-diff --no-ext-diff`, `git show --no-ext-diff HEAD` | no | allow | allow | allow | allow | allow | allow |
| V5 | `git show --ext-diff=1` | refused | DENY* | DENY* | allow | allow | DENY* | as V1 |
| V6 | `X=--ext-diff; git show $X`, `git show $REV`, `git show --no-ext-diff $X` | FIRES if `--ext-diff` | DENY | DENY | DENY | DENY | DENY | DENY |
| V7 | `git show "$sha" --no-ext-diff` | no | allow | DENY (gate) | allow | DENY (gate) | same | same |
| V8 | `git -c diff.external=x show`, `GIT_EXTERNAL_DIFF=x git show` | no | DENY* | DENY (gate) | allow | DENY (gate) | DENY* | as V1 on P |
| V9 | `command $G show`, `{git,show}` (indeterminate) | no if `$G`=git | DENY* | DENY* | DENY* | DENY* | DENY* | DENY* |
| V10 | `G=git; command $G {di,show}ff`, `{git,{di,show}ff}` | FIRES | DENY | DENY | DENY | DENY | DENY | DENY |
| V11 | `$G show`, `G="git diff"; $G show` (dynamic head) | FIRES if `$G` holds `git diff` | DENY | DENY | DENY | DENY | DENY | DENY |
| V12 | `git diff`, `git diff --no-ext-diff`, `git log -p --ext-diff`, `git stash show -p` | as today | same | same | same | same | same | same |
| V13 | `git show` with a `diff.<drv>.textconv` driver | FIRES (S8) | DENY (as V1) | DENY (as V1) | allow | allow | DENY | as V1 |
| V14 | `git show --no-ext-diff` with a `diff.<drv>.textconv` driver | FIRES (S8) | allow | allow | allow | allow | allow | allow |

Notes: V13 is the only firing row (a) newly allows, and only through textconv, which V14 shows
every binding already allows today with one extra word (as it does `log -p` and
`diff --no-ext-diff`): the current `show` deny never covered textconv, it over-blocks it by
accident. Out of scope.

### Review fold — argv the guard cannot read

Three review cycles found firing `show` forms the Part 1 shape newly allowed. Each one reaches
git with a verb or option the parser never read, and real git (stub external diff, pinned env)
fired on every one. The shipped rule judges `show` like `diff` whenever `argvMayShift` holds on the
invocation. The hidden flag replaces `dynamicHead` and is set when:

| # | Command | git | main P | Part 1 P | shipped P / X |
|---|---|---|---|---|---|
| V15 | `D=". diff"; git -C $D show`, `git -c $K show`, `git --git-dir $D show`, `git -C * show` (a dynamic value inside the global-option run splits into a new verb) | FIRES | DENY | allow | DENY / DENY |
| V16 | `echo --ext-diff \| xargs git show`, `$X git show`, `$(echo xargs) git show`, `{xargs,} git show`, `parallel git show`, `xargs <exec-path>/git-show` (any word before `git` that is not a literal argv-preserving wrapper: env, command, exec, nohup, time, nice, timeout, sudo, builtin, echo, eval (its text is reparsed and judged on its own), or an option/number/`NAME=value` operand) | FIRES | DENY | allow | DENY / DENY |
| V17 | `env -S 'git show' --ext-diff`, `env -Sxargs git show`, `env -S 'git show #' --ext-diff`, `env -S '' -S 'git show' --ext-diff` | FIRES | DENY | allow | DENY (fail-closed parse) |
| V18 | `git -C "$D" show` (quoting is not tracked) | no | DENY* | allow | DENY* |
| V19 | `nice -n 19 git show`, `env git show`, `timeout 5 git show --stat`, `git show xargs`, `echo x \| xargs echo; git show` | no | DENY* | allow | allow |

`env -S`/`--split-string` followed by any later word is now unparseable for every command
(`ENV_RESPLIT`). env re-splits that string with its own rules: comments, escapes, further options,
and the later words appended. A shell reparse cannot follow those rules. This also closes the
older `env -S 'git -C' . diff` / `push --force` form, which main allowed. The plain-gate fuzz tags
`show` behind its argv-wrapper prefixes (stdbuf, doas, flock, …) as the intended false block
`unread-prefix`, and the engine fuzz tags its xargs-wrapped `show` as `argv-appender`.

## Decision candidates

| # | Choice | Alternatives (≤3) | Recommendation | Why |
|---|---|---|---|---|
| DC-1 **(user's escalation)** | Does `show` stay in the default-deny (every binding: Claude, opencode, pi, antigravity, cursor via `gitExtDiffPredicate`; codex, copilot via `plainGitCommandVerdict`)? | (a) **Drop `show` from the default-deny**: judge it on a literal `--ext-diff` (any-verb rule) and, kept for R2, on a dynamic option word after the last `--no-ext-diff`; `show` stays an anchor verb. Rows V1, V2, V5, V8 (P), V13 flip to allow; V3, V6, V10, V11 stay denied. (b) **Keep it**: no code change; `git show --stat`, which craft's own implementation and planning skills ask for, stays denied on every binding. (c) **Keep it only for older git**: the guard resolves the git version (a `git --version` spawn per Bash call, or a cached probe) and denies bare `show` below a cutoff. Before/after per binding: the verdict matrix in Design | (a) | Pinned S and S′: no probed git (2.17.0, 2.30.0, 2.50.1, 2.54.0, 2.55.0, 2.56.0), in any of three `diff.external` modes or with a `diff.<drv>.command` driver, runs an external diff on `show` without `--ext-diff`; the deny is a pure over-block (V1, V2) that blocks craft's own `git show --stat` instructions. (c) equals (a) on every pinned version, has no pinned cutoff to encode (below 2.17.0 is unprobed), and must guess which git a command runs (`/usr/bin/git`, `-C`, `GIT_EXEC_PATH`, PATH order) from a text guard. (a)'s cost: V13 (textconv on a bare `show`) loosens, a vector V14 already leaves open on every binding; every other firing row stays denied (V3, V6, V10, V11; Pinned Σ) |

Adopted as recommended, without a user decision (stated in Design, not candidates):
- `show` stays in `DIFFING_VERBS` and so in `ANCHOR_VERBS`; a new `DEFAULT_EXT_DIFF_VERBS = ['diff']`
  carries the default-deny. Removing `show` from the anchors reopens V10, which fires (Pinned Σ,
  lesson 003).
- A dynamic option word on `show` after the last `--no-ext-diff` stays denied (V6): it fires
  (S′7), and the no-regression hard line rules out moving it into ADR-660's non-diff residual.
- A dynamic-head `show` stays denied through a hidden `dynamicHead` flag (V11): it fires when the
  head holds `git diff`.
- `REASON_GIT_EXT_DIFF` keeps its text; `git show --ext-diff` moves to `REASON_EXT_DIFF_OPTION`.
- `rtk proxy` stays exempt (`COMPLIANT_MARKERS`), unchanged.
- The oracle drops `show` from `diffs`; the generator gains the `show` shapes and the three `SPECIALS`
  of Part 2.
- Textconv drivers (V13) are not designed for here.
- The decision is recorded as a new ADR that refines ADR-660, not one that supersedes it.

## Test strategy

TDD, London School, Red → Green → Refactor. Titles Given/When/Then in printable ASCII (Stryker's
tap dry run rejects NEL, U+2028 and invisible characters); AAA bodies; a `sut` variable. Heavy
runs under `nice -n 19`, one at a time.

### Part 1 — rule

Red first in `engine/test/guards/git-ext-diff-predicate.test.js`: allow rows V1, V2, V5, V8;
deny rows V3 (asserting `REASON_EXT_DIFF_OPTION`), V6 and V11 (asserting `REASON_GIT_EXT_DIFF`),
V9, V10; allow V4 and V7. In `engine/test/guards/shell-git-invocations.test.js`: a dynamic-head
invocation carries `dynamicHead === true` and the key is not enumerable (the existing deep-equal
row "Given a dynamic head, when anchored, …" stays green unchanged). V13 and V14 depend on a
gitattributes driver, not on command text: no unit row. Then flip the existing rows that pin the old verdict. Pinned Σ lists every one
(31 failing tests across 8 files):

| File | Rows to flip |
|---|---|
| `engine/test/guards/git-ext-diff-predicate.test.js` | 12: `git show HEAD` exact reason (L36-47); interposed `--git-dir=… show HEAD` (L66); `git   show HEAD` (L81); `ls && git show` (L100); `git show HEAD && true` (L116); `true\ngit show HEAD`, `git diff --no-ext-diff; git show HEAD` (L135, L138); `--git-dir='/a;b/.git' show HEAD` (L171); quoted then `; git show HEAD` (L189); `/x/git-core/git-show HEAD` (L388); `show --no-ext-diff --ext-diff` reason (L422); "Given git show … keeps the diff/show reason" (L526-529) |
| `engine/test/tool-call-guard.test.js` | 3: L37-39, L212-214, L231-234 |
| `adapters/opencode/test/git-guard-predicate.test.js` | 6: `git show`, `git show HEAD`, `git -c k=v show`, `git --work-tree=. show` (L7-14); reason row (L60-63); property lens (L83-85) |
| `adapters/codex/test/git-guard-predicate.test.js` | 3: L28, L30, L35 (`git -c k=v show`, L33, stays denied by the gate) |
| `adapters/copilot/test/git-guard-predicate.test.js` | 3: L20, L22, L27 (L25 stays denied by the gate) |
| `adapters/antigravity/test/antigravity-guard-adapter.test.js` | 1: L49-50 (`git show HEAD`) |
| `adapters/cursor/test/cursor-guard-adapter.test.js` | 1: L102 (`git show`) |
| `test/hooks.test.js` | 2: L76, L83, fed by `test/fixtures/hooks/no-ext-diff-deny-global-opts.json` (`git -C /x show abc`) |

Each flipped deny row is replaced by a deny row that still exercises the same construct with
`git diff` (separator, whitespace, interposed option, quoted metachar, dashed builtin), so no
parser path loses its pin; the `show` spelling becomes an allow row. Rename the fixture to an allow
name or re-point it at `git -C /x diff abc`.

Binding coverage through each entry point: one allow row (`git show --stat`) and one deny row
(`git show --ext-diff`) in `engine/test/claude-ext-diff-hook-main.test.js`,
`engine/test/guards/git-bash-verdict.test.js`, and the codex, copilot, opencode, antigravity,
cursor adapter tests above.

### Part 2 — oracle and generator

- `judgeArgv` rows in the harness's own suite (or the engine differential suite's structural
  tests): `['show']` → `extDiff: false`; `['show', '--ext-diff']` → true;
  `['show', '--no-ext-diff', '--ext-diff']` → true; `['diff']` → true.
- Determinism and "every tag reached" tests cover the new `SPECIALS`.
- The four differential suites at the default seed in `bash scripts/ci.sh`.
- The census by hand (R5):
  `GUARD_FUZZ_SEEDS=<batch> GUARD_FUZZ_COUNT=1500 nice -n 19 node --test engine/test/guards/shell-git-invocations.differential.test.js`
  for each of the four batches, then the codex and copilot arms on batch 101,202,303,404,505.
  Output to a file; read back only `# pass`, `# fail`, `unexpected`, `FALSE ALLOW`,
  `invalid shell` lines.

### Mutation

Stryker over `engine/src/guards/git-ext-diff-predicate.js` (and `git-argv.js` if the new export
gains logic): `--concurrency 1`, one module per run, one comma-joined `--mutate`. On a worker-exit
dry run, narrow the corpus to the module's own suites through an override config. Hand-check every
survivor against the full covering set.

### Gate

`nice -n 19 bash scripts/ci.sh` green per part (it runs `scripts/design-lint.sh` and the
readme-drift check).

## Out of scope

- Textconv drivers (`diff.<drv>.textconv`, S8): they fire on `show`, `show --no-ext-diff`,
  `log -p`, `diff` and `diff --no-ext-diff`; no guard reads `textconv` today, and every option
  keeps that residual.
- Git older than 2.17.0: not pinned on this box.
- `G=git; command $G {di,x}ff` and `{git,{di,x}ff}`: allowed today on the predicate bindings
  (in-process run on this tree) and firing when a file `xff` exists (`/bin/bash` 3.2 probe): a
  pre-existing brace residual independent of `show`.
- `G="git diff"; $G HEAD`: allowed today on the predicate bindings, fires (same probe): the
  pre-existing dynamic-head residual, independent of `show`.
- The plain gate on codex and copilot: unchanged; it keeps denying dynamic and config forms of
  `show` (V7, V8).
- Pre-existing on main, found in review, not acted on: an argv appender adding `--ext-diff`
  after a literal `--no-ext-diff` (`echo --ext-diff | xargs git diff --no-ext-diff`, same for
  `show`); `env -S` backslash escapes with no later word (`env -S 'git\_show\_--ext-diff'`);
  BSD `apply 'git show %1' --ext-diff`; abbreviated GNU `--split-string` prefixes (unproven
  on this box); `git log -p` with a glob option word; `git -C $D status` word-splitting into a
  firing verb.
