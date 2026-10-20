# Design — guard-fuzz-scale-ext-diff-widen

> Brief: two backlog entries from "Open — A. Git guard rules". (1) The engine differential fuzz
> goes red at `GUARD_FUZZ_COUNT=1500` on fresh seeds with unclassified safe-direction false blocks;
> make the scale knob usable as a gate. (2) The shared ext-diff rule allows `--ext-diff` on a
> non-diff verb (`git log -p --ext-diff`) and a config-defined diff alias
> (`git config alias.x diff; git x`); decide how far to widen it, for every binding that composes it.
> Status: draft → self-reviewed ×3

## Context

### What exists today

- **The ext-diff rule.** `engine/src/guards/git-ext-diff-predicate.js` `extDiffVerdictFor` returns
  `configChannelReason(invocation)` first, then `REASON_GIT_EXT_DIFF` when `diffsWithoutMarker`
  holds: a `subcommand` invocation whose verb is in `DIFFING_VERBS = ['diff', 'show']`
  (`engine/src/guards/git-argv.js`) and whose last `--ext-diff`/`--no-ext-diff` word before `--`
  is not `--no-ext-diff` (or a dynamic word follows it), or an `indeterminate` invocation without
  a trailing `--no-ext-diff`. `rtk proxy` invocations are exempt (`COMPLIANT_MARKERS`).
- **The config channel.** `engine/src/guards/shell-git-invocations.js` `configChannelReason` is
  shared by the ext-diff and destructive verdicts: `-c alias.*` → `INLINE_ALIAS_REASON` ("it can
  run any git verb"), a `GIT_CONFIG_*` assignment or `-c include.path`/`includeIf.*` →
  `CONFIG_CHANNEL_REASON`. A `git config` invocation is never judged.
- **Anchoring.** `ANCHOR_VERBS` = destructive ∪ diffing. It decides which pattern words
  (`holdsAnchorVerb`, `{git,diff}`) and which dynamic-head wrappers (`wrapperAnchors`,
  `command $G push`) become `indeterminate` invocations, and which invocations count against the
  256-anchor cap (`readsArguments`, "a verb the judges inspect hands them every later word").
- **Bindings.** Claude (`hooks/git-no-ext-diff.sh` → `engine/src/claude-ext-diff-hook-main.js` →
  `gitExtDiffPredicate`, ADR-647), pi (`engine/src/guards/tool-call-guard.js`) and opencode
  (`adapters/opencode/src/git-guard-predicate.js` re-exports `gitExtDiffPredicate`) run the
  ext-diff rule alone. Codex and copilot run `plainGitCommandVerdict`
  (`engine/src/guards/git-bash-verdict.js`): plain-command gate, then destructive, then ext-diff.
- **The differential harness.** `engine/test-helpers/git-differential-harness.js` generates shell
  commands (`generateCommands`: `SPECIALS` leaves, `gitLeaf`, composers `sequence`/`group`/`nest`/
  `heredoc`), runs them in bash against a stub git that logs argv, and judges the logged argv with
  an independent oracle (`judgeArgv`). Consumers:

  | Suite | Generator | Census on false blocks |
  |---|---|---|
  | `engine/test/guards/shell-git-invocations.differential.test.js` | `generateCommands` | fails on an untagged false block (`FALSE_BLOCK_TAGS`) and on a syntax error not tagged `unterminated` |
  | `adapters/codex/test/git-guard.differential.test.js` | `generateCommands` | counts false blocks in a diagnostic, fails only on false allows |
  | `adapters/copilot/test/git-guard.differential.test.js` | own `plain-gate-generator.js`, shared `oracleVerdict` | own `ACCEPTED_BLOCK_TAGS` |
  | `test/git-no-ext-diff.differential.test.js` | `generateCommands` (texts only) | none: real hook vs in-process verdict |

  So only the engine suite needs the new census tags. Measured: the copilot arm is green at
  `GUARD_FUZZ_SEEDS=101,202,303,404,505,11,22,33,44,55 GUARD_FUZZ_COUNT=1500` (19 pass, 0 fail,
  /bin/bash 3.2; about 26 s per seed).

### Constraints from prior decisions

- ADR-647: the Claude hook judges the ext-diff rule only (no plain gate, no destructive verdict).
  A widened ext-diff rule reaches Claude through `gitExtDiffPredicate` unchanged in shape.
- `docs/contributing/design/copilot-guard-differential-fuzz-arm.md` and
  `docs/contributing/design/claude-ext-diff-hook-gaps.md`: tags are keyed to the generating
  construct; the oracle stays a minimal argv-level judge with no shell parsing and no predicate code.
- Scope claim (`docs/contributing/specs/gate.md`): the guard protects parsed output from an
  external diff driver. It is not a sandbox. An alias already in the user's gitconfig, an alias
  written by a file edit (`Write` on `.git/config`, `echo >> ~/.gitconfig`, `git config --edit`
  through `GIT_EDITOR`) or a fully dynamic key (`git config "$K" diff`) is invisible to a guard
  that reads command text, and this design makes no claim about them.
- Lesson 002 (`docs/contributing/lessons/002-tests-that-spawn-git-pin-their-env.md`): any test that
  spawns git pins `HOME`, `GIT_CONFIG_NOSYSTEM`, `GIT_CONFIG_GLOBAL` and `PATH`.

### Pinned G — where an external diff fires (real git)

Throwaway repo, stub external diff printing a marker, `diff.external` set by config and, in a
separate run, by `GIT_EXTERNAL_DIFF`. Apple git 2.54.0 and Homebrew git 2.56.0 agree on every row.
Rows G1-G18 come from the orchestrator's pin (G19-G20 unused); G21-G38 were pinned for this design with a
pinned env (`HOME`, `GIT_CONFIG_NOSYSTEM=1`, `GIT_CONFIG_GLOBAL`, `GIT_PAGER=cat`, `LC_ALL=C`).

| # | Command | config | env |
|---|---|---|---|
| G1 | `git diff` | FIRES | FIRES |
| G2 | `git diff --no-ext-diff` | no | no |
| G3 | `git show` | no | no |
| G4 | `git show --ext-diff` | FIRES | FIRES |
| G5 | `git show --ext-diff --no-ext-diff` | no | no |
| G6 | `git log -p -1` | no | no |
| G7 | `git log -p -1 --ext-diff` | FIRES | FIRES |
| G8 | `git log -1 --ext-diff` (no patch) | no | no |
| G9 | `git format-patch -1 --stdout --ext-diff` | FIRES | FIRES |
| G10 | `git stash show -p --ext-diff` | FIRES | FIRES |
| G11 | `git diff-tree -p --ext-diff HEAD`, `diff-files -p --ext-diff`, `diff-index -p --ext-diff HEAD` | no | FIRES |
| G12 | the same plumbing without `--ext-diff` | no | no |
| G13 | `whatchanged -p`, `reflog -p`, `range-diff`, `blame`, `status -v`, `commit --dry-run -v` | no | no |
| G14 | alias `x=diff`: `git x` | FIRES | FIRES |
| G15 | `git x --no-ext-diff` | no | no |
| G16 | alias `lp="log -p"`: `git lp -1` | no | no |
| G17 | alias `sx="!git diff"`: `git sx` | FIRES | FIRES |
| G18 | `git -c diff.external= diff` | no | FIRES |
| G21 | `git diff --no-ext-diff --ext-dif` / `--ext-d`; `git diff --no-ext-dif`; `git log -p --ext-dif`; `git show --ext-dif` | no: `invalid option` / `unrecognized argument` (no long-option abbreviation) | — |
| G22 | `git diff --no-ext-diff --ext-diff=1` | no: `takes no value` | — |
| G23 | `git log -p -1 --no-ext-diff --ext-diff` | FIRES (last wins) | — |
| G24 | `git log -p -1 --ext-diff --no-ext-diff` | no | — |
| G25 | `git whatchanged -p -1 --ext-diff --i-still-use-this` | FIRES | — |
| G26 | `git reflog -p -1 --ext-diff` | FIRES | — |
| G27 | `git status -v --ext-diff`, `git commit --dry-run -v --ext-diff`, `git add -p --ext-diff` | no: `unknown option` | — |
| G28 | `git range-diff --ext-diff A B C` | no | — |
| G29 | `git log -1 -- --ext-diff` (pathspec) | no | — |
| G30 | `git log -p -1 --grep --ext-diff` (option value) | no | — |
| G31 | `git log -p -1 --end-of-options --ext-diff` | no: git refuses | — |

Alias writes, each from a clean alias state, then `git x` (config `diff.external` set):

| # | Write | `git x` |
|---|---|---|
| G32 | `git config alias.x diff`; `ALIAS.x`; `Alias.X`; `set alias.x`; `--add`; `--replace-all`; `--local`; `--global`; `-f .git/config`; `--file=.git/config`; `--type=bool --no-type`; `set --append` | FIRES |
| G33 | `git config -- alias.x diff` (`--` does not end the key) | FIRES |
| G34 | `git config alias.x '!git diff'`; `git config alias.x 'log -p -1 --ext-diff'` | FIRES |
| G35 | `git config --rename-section foo alias`; `git config rename-section foo alias` (section `foo` holds `x = diff`) | FIRES |
| G36 | `git config include.path <file>`; `git config set includeIf.gitdir:<repo>/.git.path <file>` (file holds `[alias] x = diff`) | FIRES |
| G37 | `git config set includeIf.onbranch:<branch>.path <file>` | no: not evaluated at alias lookup |
| G38 | `GIT_EDITOR=<script appending the alias> git config --edit` | FIRES |
| — | `git config --get alias.x`; `git config --global --get-regexp alias` (reads) | no |

### Pinned V — today's verdicts (in-process, this tree)

`gitExtDiffPredicate` (Claude, opencode, pi) and `plainGitCommandVerdict` (codex, copilot) both
**allow** every FIRES row G7, G9, G10, G11, G23, G25, G26 and every alias write G32-G36, and the
alias write followed by its use (`git config alias.x diff; git x`). The destructive predicate also
allows `git config alias.p push; git p`, so the alias-write gap is a destructive bypass on codex
and copilot too. Both block `git diff`, `git show`, `git show --ext-diff` and
`git -c alias.x=diff x`. The plain gate already blocks the wrapper, pattern and dynamic forms on
codex and copilot (`G=git; command $G log -p --ext-diff`, `{git,log,-p,--ext-diff}`,
`X=--ext-diff; git log -p $X`, `git config alias.$N diff`, `git config $K diff`); the ext-diff
rule alone allows all five.

### Pinned F — the scaled census (engine suite, /bin/bash 3.2.57)

Orchestrator run: seeds 101,202,303,404,505 → 8 unexpected false blocks; seeds 11,22,…,99,111 →
8 more plus 2 "generator emitted invalid shell". Leg B clean. Each command re-run 6-10 times: the
outcome is deterministic and every false block is safe-direction (the predicates block, bash ran
no blocked argv). This design re-ran the census on the same 15 seeds (blocked, untagged commands
only): the same 16 false blocks, classified below.

| Class | Count | Root cause | Example (seed) |
|---|---|---|---|
| C1 brace word in `<( … )` | 6 | bash 3.2 brace-expands across the whole process-substitution word: `cat <( {git,push} origin )` runs `cat <(git origin) <(push origin)`. `$( … )` and top level expand normally. The unsafe mirrors (`cat <( {echo,git} push )`, `cat <( {x,git} diff )`, `cat <( g{,}it push )`) are blocked: no unsafe gap | `cat <( {git,push} origin ) ; false \|\| g""it "status" -q` (303), `cat <( cat <( {git,diff} ) )` (77) |
| C2 state set in a pipeline element | 7 | `sequence` with op `\|` splices a right fragment that is a command list: `… \| f() { … }; f` defines `f` in the pipeline subshell, the parent's `f` is undefined; `… \| G=git; nohup $G push` assigns in the subshell | `A=1 B=2 env git clean $'--dry' \| f() { … }; f` (11), `! { git diff \--no-ext-diff \| G=git; nohup $G push ; }` (303) |
| C3 `time` read as /usr/bin/time | 2 | bash 3.2 does not reserve `time` right after a case pattern (pinned below); and the `time` grouper spreads `...inner`, so `simple: true` leaks and `nestedForms` offers `env -S` to a keyword-led text | `case x in (x) time NAME=v nohup g\it … diff …` (111), `echo $( env -S 'time NAME=v command git …' )` (22) |
| C4 SIGPIPE upstream | 1 | the left element of a `\|` writes to stdout before running git; the reader (`echo x \| xargs …`) does not read, so the writer dies of SIGPIPE before git | `` echo `bash -c $'echo x\ngit push' \| echo x \| xargs git … ` `` (77) |
| C5 short-circuited `&&` | 0 standalone | always downstream of C2-C4: a left side modelled as status 0 that fails (`… \| f() { … }; f && …`, seed 66, counted under C2) | — |
| C6 invalid shell | 2 (syntax, not false block) | bash 3.2 cannot close a `$( … )` holding a heredoc whose body has an odd quote; the quoted-delimiter heredoc forms drop the inner `unterminated` tag. Same root cause as the existing `SHELL_REJECTED` (`bad substitution`) exemption | `cat <<< "$( cat <<"EOF244"\ngit status "x\nEOF244\n)"` |

`time` keyword recognition in bash 3.2.57 (`time NAME=v true`; BINARY = /usr/bin/time ran):
KEYWORD at top level, after `;`, `&&`, `||`, newline, `(`, `{`, `then`, `do`, `f() {`, `$(`,
`<(`, backticks, `eval`, `| {` and `! {`. BINARY after a case pattern, `(x)` or `x)`. KEYWORD for
`case x in (x) { time NAME=v true; } ;; esac`. `!` after a case pattern is reserved (status 0
for `case x in (x) ! false ;; esac`). No bash ≥ 5 exists on this box, so the bash-5 arm was not
run at scale; Linux CI runs the default seed under bash 5.

The backlog's "`cat <(…)` log race" diagnosis is wrong: C1 is deterministic brace expansion.

## Requirements

- **R1** The engine differential suite is green with `GUARD_FUZZ_COUNT=1500` on the 15 seeds of
  Pinned F and on five seeds never run before (picked and recorded in the plan), under /bin/bash
  3.2, with zero problems. The default seed (20260, 400) stays green, including the invoked floor
  and the "every tag reached" test.
- **R2** Generator mis-models (C2, C3, C4) are fixed at the composer, not exempted. A shell
  divergence the generator cannot avoid without dropping a construct (C1, C6) gets a tag set by
  the composer that builds that construct. No exemption reads stderr text beyond the existing
  `SYNTAX_ERROR`/`SHELL_REJECTED` patterns.
- **R3** Part 1 changes no file under `engine/src/` or `adapters/*/src/`.
- **R4** After Part 2, every FIRES row inside the chosen scope (DC-1) blocks on every binding, the
  no-fire rows G24 and G29 still allow, and the before/after matrix below holds row
  for row.
- **R5** `judgeArgv` widens in lock-step with the chosen rule, and the generator emits the new
  shapes, so the fuzz checks the new rule against real bash.
- **R6** No binding regresses: the four differential suites are green at the default seed, and the
  engine, codex and copilot arms are green on the Pinned F seeds at 1500.
- **R7** Unparseable shell still fails closed. A command with no `--ext-diff` word and no `config`
  invocation keeps today's anchor cap behaviour (300 × `git status` stays allowed).
- **R8** Docs claim parsed-output protection only and name the residuals of the chosen option.
- **R9** Tests: TDD London School, Given/When/Then titles in printable ASCII, AAA bodies, a `sut`
  variable. A test that spawns git pins its env (lesson 002). No provenance references in source or
  tests.

## Design

Two parts, shipped in order. Part 1 is independent of DC-1; Part 2 is shaped by it. The shape
below is the recommended option (b-i); the sub-sections note what (a) or (c) drops.

### Part 1 — make the scaled census a gate (test helpers only)

Decided (not escalated): fix the generator where it mis-models bash, tag where bash 3.2 diverges,
leave the predicates alone (all 16 are safe-direction).

**Context block.**
- `engine/test-helpers/git-differential-harness.js`: `TAGS` (L22), `FALSE_BLOCK_TAGS` (L38),
  `PARSE_FAILURE_TAGS` (L42), `fragment` (L64,
  `(text, { tags, status, simple, lineEnd, keywordLed })`), `SPECIALS` (L127), `sequence` (L196),
  `GROUPERS` (L208), `nestedForms` (L231), `nest` (L245), `heredoc` (L251), the export list (L459).
- `engine/test/guards/shell-git-invocations.differential.test.js`: `SYNTAX_ERROR` (L39),
  `SHELL_REJECTED` (L42), `problemsOf` (L49: the syntax check reads `tagged(TAGS.unterminated)`).

**Fixes, one per class.**

| Class | Change | Kind |
|---|---|---|
| C2 | `fragment` gains a `list` flag (a top-level command list). `sequence` sets it for ops `;`, `&&`, `\|\|`, newline; the `f() { … }; f` grouper sets it; the 17 `SPECIALS` with a top-level `;` or newline set it (`H=…; git reset $H` ×2, `D=…; git branch $D x` ×2, `P=push; git $P HEAD`, `D=diff; …`, `S=status; …`, `G=git; $G push`, `G=git; $G status`, `X=echo; $X push`, `P=push; git $P`, `echo ${#x}; git push\necho }`, `(( x = 1 << 2 ))\ngit push`, `G=git; command/exec/nohup $G push`, `G=git; command $G diff`). `sequence` with op `\|` braces a right fragment that is `keywordLed` **or** `list`: `left \| { right; }` | root fix |
| C4 | `sequence` with op `\|` sends a non-`simple` left to `/dev/null`: `{ left ; } >/dev/null \| right`. A `simple` left is a lone git leaf whose stub writes nothing to stdout, so it stays raw and the raw-left pipeline shape keeps its coverage. Status modelling is unchanged (a pipeline's status is its last element's) | root fix |
| C3 | The `time` and `!` groupers set `simple: false` (a grouped text is never a simple command), so `nestedForms` stops offering `env -S`/unquoted `eval`. The case grouper braces a `keywordLed` inner: `case x in (x) { inner; } ;; esac` | root fix |
| C5 | none: disappears with C2-C4 (Pinned F has no standalone entry) | — |
| C1 | new tag `TAGS.braceInProcessSubstitution` (`'brace-in-process-substitution'`), in `FALSE_BLOCK_TAGS`. Set by the `cat <( … )` form of `nestedForms` when the inner text holds a brace expansion (the brace alternative of `BASHISMS`, extracted as a named `BRACE_EXPANSION`). `nest` merges `nested.tags` instead of `inner.tags` so a form can add a tag | tag at the construct |
| C6 | new tag `TAGS.quoteInHeredocBody` (`'quote-in-heredoc-body'`), in a new exported `SYNTAX_EXEMPT_TAGS = [unterminated, quoteInHeredocBody]` and in `FALSE_BLOCK_TAGS` (bash 3.2 runs nothing of the command, so any block in it is a false block, as for `unterminated`), **not** in `PARSE_FAILURE_TAGS`. Set by the two quoted-delimiter `heredoc` forms when the inner carries `unterminated`. `problemsOf` reads `SYNTAX_EXEMPT_TAGS.some(tagged)` for the syntax check | tag at the construct |

Two new `SPECIALS` guarantee the new tags are reached at the default seed:
`cat <( {git,push} origin )` (`braceInProcessSubstitution`) and
`cat <<< "$( cat <<'EOFQ'\ngit status "x\nEOFQ\n)"` (`quoteInHeredocBody`). Adding `SPECIALS`,
the `list` flag and the braces reshuffles every seed's command list, so the default seed is
re-measured (invoked floor, census) inside Part 1, not assumed.

Why C1 is tagged, not avoided: under bash ≥ 5 the same command runs `git push`, a real
false-allow probe worth keeping. Why C6 is tagged: the construct is valid shell under bash ≥ 5,
and it already has a sibling exemption for the same bash-3.2 root cause.

Granularity: a tag exempts the whole command, the existing tag model. The new tags are set only
when the generating construct is present, so a false block anywhere else still fails.

Fallback if a fresh seed turns up a class not in Pinned F: reduce it, re-run it 3 times to rule
out a race, then apply the same rule (composer fix first, construct tag second) in Part 1.

### Part 2 — widen the ext-diff rule (shape for (b-i))

**Context block.**
- `engine/src/guards/git-ext-diff-predicate.js`: `COMPLIANT_MARKERS`, `REASON_GIT_EXT_DIFF`,
  `lacksNoExtDiff(words)`, `dynamicAfterNoExtDiff(invocation)`, `diffsWithoutMarker(invocation)`,
  `extDiffVerdictFor(invocation) → string|null`, `gitExtDiffPredicate(command) → { block, reason? }`.
- `engine/src/guards/shell-git-invocations.js`: `ANCHOR_VERBS` (L26), `holdsAnchorVerb` (L30),
  `isAnchorVerb` (L52), `wrapperAnchors` (L58), `flagged` (L105), `anchoredInvocations` (L125),
  `readsArguments` (L145), `hasInlineAlias` (L167), `configChannelReason` (L170),
  `INLINE_ALIAS_REASON` (L8), `CONFIG_CHANNEL_REASON`.
- `engine/src/guards/git-argv.js`: `optionWords` (cuts at `--`), `DIFFING_VERBS`.
- `engine/test-helpers/git-differential-harness.js`: `VERBS` (L94), `CONFIG_KEY` (L413),
  `injectsConfigKey`, `lastExtDiffSetting`, `judgeArgv` (L421).

**2a — `--ext-diff` on any verb** (options a and b).

```js
// git-ext-diff-predicate.js
const REASON_EXT_DIFF_OPTION = '--ext-diff is denied on every git verb (external diff mangles parsed output)';

const enablesExtDiff = invocation =>
  invocation.mentionsExtDiff === true &&
  optionWords(invocation.args).findLast(isExtDiffSetting) === EXT_DIFF_WORD;

// extDiffVerdictFor: configChannelReason → diff/show rule (unchanged) → for any other
// subcommand, enablesExtDiff → REASON_EXT_DIFF_OPTION; rtk proxy stays exempt for both.
```

- Matching is on the exact word `--ext-diff` before `--`, last setting wins (G21-G24, G29).
  `diff`/`show` keep today's stricter rule and reason, so no existing reason string changes.
- `mentionsExtDiff` is a hidden per-command flag set in `anchoredInvocations`, as `injectsConfig`
  is (`flagged` grows to set both): true when any word's text is `--ext-diff`. It keeps the cost
  bounded: an invocation whose command holds no `--ext-diff` word never reads its arguments, and
  `readsArguments` counts an invocation as argument-reading when its verb is an anchor verb,
  `config` (options b and c), or the flag is set. 300 × `git status` stays allowed (R7).
- Anchoring: `holdsAnchorVerb` and `isAnchorVerb` read one predicate,
  `isAnchorToken(text) = ANCHOR_VERBS.has(text) || text === '--ext-diff' || isAliasKeyText(text)`
  (the last term only under b). `{git,log,-p,--ext-diff}` and `G=git; command $G log --ext-diff`
  become `indeterminate` and block, as `{git,diff}` does today.
- Decided residual: a dynamic word on a non-diff verb is not read as a possible `--ext-diff`.
  Treating it so would deny `git commit -m "$(cat <<'EOF' … EOF)"` (the heredoc commit idiom,
  ADR-606) and `git log $range` on Claude. `X=--ext-diff; git log -p $X` stays allowed on Claude,
  opencode and pi; codex and copilot already block it in the plain gate (Pinned V).

**2b — alias and include writes** (options b and c).

```js
// shell-git-invocations.js
export const CONFIG_ALIAS_WRITE_REASON =
  'craft: git config naming an alias or include key is denied — an alias can run any git verb';
const ALIAS_SECTION = 'alias';
const isAliasKeyText = text => {
  const key = text.toLowerCase();
  return key === ALIAS_SECTION || key.startsWith(ALIAS_KEY_PREFIX)
    || key.startsWith(INCLUDE_PATH_KEY) || key.startsWith(INCLUDE_IF_PREFIX);
};
const namesAliasKey = invocation =>
  invocation.kind === 'subcommand' && invocation.subcommand === 'config' && invocation.args.some(isAliasKeyText);
// configChannelReason: inline alias → alias/include key in git config → channel/include
```

- It lives in `configChannelReason`, beside `INLINE_ALIAS_REASON`, so both the ext-diff and the
  destructive verdicts deny it: `git config alias.p push; git p` is a destructive bypass today
  (Pinned V).
- All arguments are read, not `optionWords`: `git config -- alias.x diff` writes (G33).
- Word text, case-folded: `ALIAS.x` (G32), the rename target `alias` (G35), `alias.$N` (a
  dynamic word whose text starts with `alias.`). A fully dynamic key (`"$K"`) is a residual on
  Claude, opencode and pi; the plain gate blocks it on codex and copilot.
- No mode parse: reads that name an alias or include key (`--get alias.x`,
  `--get-regexp alias`, `--unset alias.x`, `--remove-section alias`) are denied too. Safe
  direction. `git config --list` and `git config --get user.email` are unaffected.
- Not covered (file writes, out of a command-text parse): `git config --edit` through
  `GIT_EDITOR` (G38), `Write` on `.git/config`, shell appends to a gitconfig,
  `git clone -c alias.x=diff`, and any alias that already exists.

**2b′ — revised in review.** Three review cycles replaced the 2a/2b anchoring of alias and
include words, each change proven by a red test first:
- `isAliasKeyText` also takes the bare section words `include` and `includeif`:
  `git config rename-section x include` turns an allowed `x.path` into `include.path` (live-proven
  on git 2.54). The oracle's key table moved with it.
- `isAnchorToken` no longer holds alias or include words, which had made `echo $X alias` block on
  every binding. Instead: behind a wrapper's dynamic word, `runsConfigOnAlias` walks git's own
  argv and arms an alias or include word only when the verb is `config` or unreadable (dynamic or
  pattern) — `command $G $C alias.x v` and `command $G conf[i]g alias.x v` block; a pattern word
  holding a `git` token arms any alias, include or `--ext-diff` word at or after it —
  `{git,log,-p} --ext-diff` and `{git,confi?} alias.x st` block, `mkdir -p {config,include}` does
  not; and `namesAliasKey` counts an indeterminate invocation's words, closing
  `git $C alias.x … --no-ext-diff` on Claude, opencode and pi.
- Accepted over-block of the dynamic-before-verb class: `grep -rn "$PAT" config include` and
  `grep "$a" "$b" alias` read as `command $G config include` and must block (gate.md lists them).

**2c — oracle and generator in lock-step** (R5).

- `judgeArgv`: `configured` also holds for `subcommand === 'config'` with any argument matching
  `/^(alias|alias\..*|include\.path.*|includeif\..*)$/i` (whole args, no `--` cut). `extDiff`
  also holds for any other verb whose `lastExtDiffSetting` is `--ext-diff`. Both stay
  independent of predicate code.
- `VERBS` gains `['log', '-p --ext-diff']`, `['log', '-p --ext-diff --no-ext-diff']`,
  `['format-patch', '-1 --stdout --ext-diff']`, `['config', 'alias.x diff']`,
  `['config', '--get alias.x']`, `['config', 'user.name x']` (under a: only the first three;
  under c: only the last three).

**2d — docs.** `docs/contributing/specs/gate.md`: the Claude reason list (L56-58), the pi
predicate line (L108-110) and the opencode predicate line (L124-125) name the widened rule, its
two new reasons and the residuals of the chosen option.

### Verdict matrix — before → after, per binding

C = Claude, O = opencode and pi (ext-diff rule alone); X = codex and copilot (plain gate,
destructive, ext-diff). "same" = no binding differs. `*` marks a deliberate over-block (git does
not fire).

| # | Command | git (Pinned G) | before C/O | before X | after (a) | after (b-i) | after (c) |
|---|---|---|---|---|---|---|---|
| M1 | `git log -p -1 --ext-diff` | FIRES | allow | allow | BLOCK | BLOCK | allow |
| M2 | `git format-patch -1 --stdout --ext-diff` | FIRES | allow | allow | BLOCK | BLOCK | allow |
| M3 | `git stash show -p --ext-diff` | FIRES | allow | allow | BLOCK | BLOCK | allow |
| M4 | `git reflog -p -1 --ext-diff`, `git whatchanged -p --ext-diff` | FIRES | allow | allow | BLOCK | BLOCK | allow |
| M5 | `git diff-tree -p --ext-diff HEAD` (and diff-files, diff-index) | env only | allow | allow | BLOCK | BLOCK | allow |
| M6 | `git log -p -1 --no-ext-diff --ext-diff` | FIRES | allow | allow | BLOCK | BLOCK | allow |
| M7 | `git log -p -1 --ext-diff --no-ext-diff` | no | allow | allow | allow | allow | allow |
| M8 | `git log -p -1 -- --ext-diff` | no | allow | allow | allow | allow | allow |
| M9 | `git log -p -1 --grep --ext-diff`, `git status --ext-diff`, `git commit -m --ext-diff` | no | allow | allow | BLOCK* | BLOCK* | allow |
| M10 | `G=git; command $G log -p --ext-diff`, `{git,log,-p,--ext-diff}` | FIRES | allow | BLOCK | BLOCK | BLOCK | C/O allow, X BLOCK |
| M11 | `X=--ext-diff; git log -p $X` | FIRES | allow | BLOCK | C/O allow, X BLOCK | same as (a) | same as (a) |
| M12 | `rtk proxy git log -p --ext-diff` | — | allow | allow | allow | allow | allow |
| M13 | `git config alias.x diff` (and every G32-G36 write) | FIRES on `git x` | allow | allow | allow | BLOCK | BLOCK |
| M14 | `git config alias.x diff; git x` | FIRES | allow | allow | allow | BLOCK | BLOCK |
| M15 | `git config alias.p push; git p` | runs push | allow | allow | allow | BLOCK | BLOCK |
| M16 | `git config alias.x status` | no | allow | allow | allow | BLOCK* | BLOCK* |
| M17 | `git config --get alias.x` | no | allow | allow | allow | BLOCK* | BLOCK* |
| M18 | `git config user.name x`, `git config --list` | no | allow | allow | allow | allow | allow |
| M19 | `git config "$K" diff` | FIRES if K=alias.x | allow | BLOCK | C/O allow, X BLOCK | same | same |
| M20 | `git x` (alias already in a gitconfig) | FIRES | allow | allow | allow | allow | allow |
| M21 | `git config --edit` with a scripted `GIT_EDITOR` | FIRES | allow | allow | allow | allow | allow |
| M22 | `echo git log --ext-diff` | no | allow | allow | BLOCK* (any-word anchor, accepted class) | BLOCK* | allow |
| M23 | `git show` | no | BLOCK* | BLOCK* | BLOCK* | BLOCK* | BLOCK* |

Reasons after (b-i): M1-M6, M9, M22 → `REASON_EXT_DIFF_OPTION` (Claude prefixes `craft: `);
M10 → today's ext-diff reason (indeterminate) on C/O, the gate reason on X; M13-M17 →
`CONFIG_ALIAS_WRITE_REASON`. Rows M11, M19, M20, M21 are the residuals every option keeps.

## Decision candidates

| # | Choice | Alternatives (≤3) | Recommendation | Why |
|---|---|---|---|---|
| DC-1 **(user's escalation)** | How far to widen the shared ext-diff rule (every binding: Claude, opencode, pi via `gitExtDiffPredicate`; codex, copilot via `plainGitCommandVerdict`) | (a) **Any verb**: deny a literal `--ext-diff` (last setting, before `--`) on every git verb; alias writes stay allowed. Closes M1-M6, M10. (b) **Any verb + alias/include writes in `git config`**, with the write scope as a sub-option: (b-i) any `git config` invocation whose arguments name an `alias`/`alias.*`/`include.path`/`includeIf.*` key, reads included, no mode parse; (b-ii) the same keys, writes only, via a parse of both `git config` syntaxes (legacy `--get`/`--unset`/… flags and 2.46+ `get`/`set`/`unset`/`rename-section`/…) and their value-taking options; (b-iii) writes only, judged by the alias value (deny when it runs `diff`/`show` or carries `--ext-diff`). Closes M1-M6, M10, M13-M15. (c) **Alias/include writes only** (with the same sub-options); `--ext-diff` on non-diff verbs stays allowed. Closes M13-M15. Before/after per binding: the verdict matrix in Design | (b) with (b-i) | (a) leaves the alias path open: `git config alias.x diff; git x` fires (G14, G32) and `git config alias.p push; git p` is a destructive bypass on codex and copilot (Pinned V). (c) leaves seven pinned FIRES rows open (G7, G9, G10, G11-env, G23, G25, G26). (b-i) mirrors the existing `-c alias.*` deny, which is value-blind for the same reason ("it can run any git verb"). (b-ii) adds a second argv parser whose mistakes are false allows; its gain is allowing alias reads, which agents rarely need. (b-iii) misses an alias that takes its verb from the call (`alias.x = "!f() { git \"$@\"; }; f"`, then `git x diff`) and needs a shell parse of `!` values. Cost of (b-i): deliberate over-blocks M9, M16, M17, M22 (git refuses M9's `status`/`commit` forms anyway). All options keep residuals M11, M19, M20, M21, which a command-text guard cannot see |

Adopted as recommended, without a user decision (stated in Design, not candidates):
- Part 1 fixes the generator at the composer for C2-C4, tags C1 and C6 at the construct, and
  leaves the predicates unchanged.
- `diff`/`show` keep their rule and reason. Other verbs get a new reason; alias writes get a new
  reason in `configChannelReason`, shared with the destructive verdict.
- Dynamic words on a non-diff verb are not read as `--ext-diff` (M11 residual).
- `rtk proxy` stays exempt for the widened verbs, consistent with `COMPLIANT_MARKERS`.
- `git config --edit` is not judged (a file write by another program, M21).

## Test strategy

TDD, London School, Red → Green → Refactor per part. Titles Given/When/Then in printable ASCII
(no NEL, U+2028 or invisible characters: Stryker's tap dry run rejects them); multi-line commands
are built with `\n` in the body and named by shape in the title. AAA bodies, a `sut` variable.
Heavy runs under `nice -n 19`, one at a time.

### Part 1 — generator (in `engine/test/guards/shell-git-invocations.differential.test.js`)

Structural tests over `generateCommands`, which only generates (no spawn, milliseconds), each Red
first on a Pinned F seed that holds the shape:
- Given the Pinned F seeds at 1500, when generated, then no command holds a `|` followed by an
  unbraced `f() {` or by an unbraced assignment-led list (`| NAME=…;`).
- Given the same seeds, then no command holds `in (x) time` or `env -S 'time`.
- Given the same seeds, then no command holds the C4 writer `bash -c $'echo x\ngit push'`
  directly before ` | ` (seed 77 holds it today). Pipes in general cannot be checked by text,
  because leaf pipes (`echo x | xargs …`) look the same; the census is C4's proof.
- Given the same seeds, then every command holding `cat <(` around a brace expansion carries
  `brace-in-process-substitution`, and every quoted-delimiter heredoc around an `unterminated`
  inner carries `quote-in-heredoc-body`.
- The existing determinism and "every tag reached" tests cover the new `TAGS` values through the
  two new `SPECIALS`.

Then the census itself (R1), run by hand in the implementation, not in CI:
`GUARD_FUZZ_SEEDS=101,202,303,404,505,11,22,33,44,55,66,77,88,99,111 GUARD_FUZZ_COUNT=1500 nice -n 19 node --test engine/test/guards/shell-git-invocations.differential.test.js`,
then the five fresh seeds. Output goes to a file; only `not ok`, `unexpected`, `FALSE ALLOW` and
`invalid shell` lines are read back. The run's tag counts go in the plan's evidence.

### Part 2 — rule (Stryker-visible unit suites)

- `engine/test/guards/git-ext-diff-predicate.test.js`: one Red row per M1-M6 and M9 (block, new
  reason), M7, M8, M12 (allow), M10 pattern and wrapper (block), M11 (allow, residual pinned as a
  test so a change is deliberate), `git commit -m "use --ext-diff"` and the heredoc commit idiom
  mentioning `--ext-diff` (allow).
- `engine/test/guards/shell-git-invocations.test.js`: `configChannelReason` rows M13 (each G32-G36
  spelling, `--` form, `ALIAS.x`, rename target, `alias.$N`), M16, M17 (block), M18 (allow);
  `isAnchorToken` through `gitInvocations` (`{git,log,--ext-diff}` → indeterminate); cap: 300 ×
  `git status` parsed, 257 × `git log --ext-diff` → too-many reason.
- `engine/test/guards/git-destructive-predicate.test.js`: M15 → `CONFIG_ALIAS_WRITE_REASON`.
- `engine/test/guards/git-bash-verdict.test.js`: one row per new reason through
  `plainGitCommandVerdict`.
- `engine/test/claude-ext-diff-hook-main.test.js`: M1 and M13 deny with a single `craft: `
  prefix.
- `adapters/codex/test/git-guard-adapter.test.js` and `adapters/copilot/test/git-guard-adapter.test.js`:
  one deny row each for M1 and M13 through `decideGuard`.
- The four differential suites, default seed, in `bash scripts/ci.sh`; the engine, codex and copilot
  arms on the Pinned F seeds at 1500 by hand (R6). The widened oracle plus the new `VERBS` make
  any false allow of the new rule visible against real bash.

### Mutation

Stryker over `engine/src/guards/git-ext-diff-predicate.js`, then separately
`engine/src/guards/shell-git-invocations.js`: `--concurrency 1`, one module per run, one
comma-joined `--mutate`. If the dry run dies with a worker exit, narrow the corpus to the
module's own suites through an override config. Survivors are hand-checked against the full
covering set before a test is written.

### Gate

`bash scripts/ci.sh` green per part (it runs `scripts/design-lint.sh` on this doc).

## Out of scope

- `git show` without `--ext-diff` is blocked though git does not fire (G3, M23): a safe-direction
  over-block of the existing rule.
- An alias already in a gitconfig, an alias written by a file edit or `git config --edit`, and
  `git clone -c alias.*`: invisible to a guard that reads command text.
- Reading dynamic words as `--ext-diff` on non-diff verbs: denies the heredoc commit idiom on
  Claude; codex and copilot already block these forms in the plain gate.
- Running the bash ≥ 5 arm at scale: no bash ≥ 5 on this box; Linux CI runs the default seed
  under bash 5.
- Copilot's own generator: green at scale (10 seeds × 1500), no tags needed.
- Plain-command gate changes: it already blocks the dynamic and wrapper forms on codex and copilot.
