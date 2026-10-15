# Plan — copilot-git-argv-normalising-guard

> Source: design doc `docs/contributing/design/copilot-git-argv-normalising-guard.md` · ADRs `578, 579, 580, 581, 582, 583, 584, 585, 586, 587, 588, 589`
> (578: the copilot `preToolUse` hook enforces, `--deny-tool` and containment stay, `toolArgs` is a
> plain object or a JSON string encoding one; 579: `gitDestructivePredicate` is a separate export
> composed only by the copilot adapter, never by `toolCallGuard`; 580: a git invocation starts at
> any non-dynamic word whose basename is `git`, or at a dynamic head; 581: `refused` and
> `indeterminate` are judged by verb sniffing (destructive blocks on a verb, ext-diff allows
> `refused`); 582: an unparseable command blocks in both predicates, nesting cap 8; 583: `push`
> always, `reset --hard`, forced `branch` delete, `clean` unless dry-run; 584: an inline `alias.*`
> key blocks in both predicates; 585: block → stdout JSON + exit 0, crash → exit 2; 586: the hook
> is renamed `craft-guard.js`; 587: `GIT_DIFF_SHOW_RE` is deleted with its opencode re-export;
> 588: no version gate; 589: the differential fuzz lives in engine/test/guards, outside Stryker).
> Every design decision candidate (DC-1 … DC-10) was settled as recommended. ADR-243 is
> superseded by 578 for the hook layer only.
> The plan is the implementation script AND the knowledge handoff. Part agents start
> with zero context: whatever a part block omits is paid later as agent rediscovery.
> `plan-lint.sh` enforces the schema below — the plan phase cannot close without it.
> Template: `templates/plan.md`.

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

## Plan shape (11 parts + one orchestrator checkpoint)

| # | Part | Size class | src delta | Files (created/edited) |
|---|---|---|---|---|
| 1 | `normaliseGitArgv`: git global options → a git invocation | src-suite | new engine module | shell-git-invocations.js + its test |
| 2 | `parseShellCommands` core: words, quotes, separators, head words, redirections | src-suite | same module | same two |
| 3 | `parseShellCommands` substitutions, dynamic words, depth cap | src-suite | same module | same two |
| 4 | `parseShellCommands` heredocs, here-strings, re-parsed `sh -c`/`eval`/`env -S` | src-suite | same module | same two |
| 5 | `gitInvocations` anchor + `gitExtDiffPredicate` rebuilt on it; regex export deleted | src-suite | engine guards, opencode surface | 5 files |
| 6 | `gitDestructivePredicate` | src-suite | new engine module | 3 files |
| 7 | Differential fuzz vs bash and real git; Stryker exclusion | test-infra (src fixes only if the fuzz surfaces a gap) | none planned | 3 files (+2 on a gap) |
| 8 | Copilot adapter: object `toolArgs`, `copilotGuard` | src-suite | copilot adapter | 3 files |
| 9 | Rename `craft-observer.js` → `craft-guard.js` (behaviour-preserving) | src-suite | copilot hook path | 6 files |
| 10 | The copilot hook enforces (JSON deny, exit-2 crash contract) | src-suite | copilot hook | 4 files |
| — | **Checkpoint: orchestrator live probe** (L1–L9) | — | — | out-of-repo results file |
| 11 | Living docs (R7) | docs-prose | none | 4 docs |

Order: strictly 1 → 11 (one shared working tree; each part builds on the previous). Part 7 lands
before the review phase (review cycle 1 relies on it). No part edits `BACKLOG.md`: the
documentation phase closes BACKLOG.md L216 and L1081.

**Why the design's Part 1 is four parts.** The design sketched one part for the whole
`engine/src/guards/shell-git-invocations.js` module. Its tokeniser table alone (design §Module) is
about 15 constructs, plus the normaliser table, the re-parse rules and the anchor: well over five
RED→GREEN cycles. Parts 1-4 cut it by seam (normaliser; tokeniser core; substitutions; heredocs
and re-parsing), and the anchor `gitInvocations` lands in Part 5 with its first consumer. Each
part edits the same two files; plan-lint's overlap warning for them is expected.

**Why the design's Part 5 (hook) is two parts.** The rename touches six files (hook, template,
three tests, one comment) and enforcement touches four more (hook, new hook test, two header
comments): ten declared files, over the ceiling of six. Part 9 renames with no behaviour change,
Part 10 makes the hook enforce.

Plan-lint warns that Parts 8 and 9 both declare adapters/copilot/test/git-guard-adapter.test.js.
That is intended: Part 8 edits its `decideGuard`/`parseToolArgs` describes (the Stryker covering
rows for the adapter source), Part 9 only its hook structure-scan block (L295-350) for the rename.
Merging them would put nine files in one part.

### Facts pinned while planning (throwaway dirs, Node 22.22.3, macOS, git 2.54.0, bash 3.2.57)

| Check | Result |
|---|---|
| Baseline `bash scripts/ci.sh` on the branch tip (`14d289d`) | exit 0; engine suite 2896 tests in about 2.4 s; codex suite (with its differential) 627 tests in about 1.0 s |
| Stryker tap-runner 10.0.0 `findTestyLookingFiles(['engine/test/**/*.test.js', '!engine/test/**/*.differential.test.js'])` | **the `!` entry is ignored**: both `a.test.js` and `b.differential.test.js` are returned |
| Same with the single pattern `engine/test/**/!(*.differential).test.js` (extglob) | returns every `*.test.js` at any depth (incl. `hook-trust-differential.test.js`, `a.b.test.js`, nested dirs) **except** `*.differential.test.js` |
| Node `path.matchesGlob` with that extglob | agrees on the same paths; no ExperimentalWarning on 22.22.3 |
| `scripts/ci.sh` engine discovery | `find engine/test -name '*.test.js'` → a new `engine/test/guards/*.differential.test.js` runs in CI with no ci.sh edit |
| engine/test/mutation-config.test.js pairing rules | apply to `adapters/` entries only; new `engine/src/guards/*.js` files are mutated by the existing `engine/src/**/*.js` glob and covered by `engine/test/**` with no pairing entry |
| `GIT_TRACE=1 git <opts> rev-parse` (empty HOME, `GIT_CONFIG_NOSYSTEM=1`, repo with one commit) | `--namespace x`, `--namespace=x`, `--attr-source HEAD`, `--config-env k.v=HOME`, `-c k.v`, `--work-tree .`, `--git-dir=`, `--git-dir=/nonexistent`, `-P`, `--bare`, `--exec-path=/x`, `--no-advice`, `--no-lazy-fetch` → `trace: built-in: git rev-parse`; `-v` → `built-in: git version rev-parse`; bare `--list-cmds` and `--super-prefix=x/` → `unknown option`; `--exec-path` and `--list-cmds=builtins` → no trace; `-C rev-parse` / `-c rev-parse` / `--git-dir rev-parse` (value consumes the sentinel) → no built-in trace |
| CI runner | `ubuntu-latest` (git version not pinned from here — see DC-P2) |

## Public-surface decision

Every new export is **internal**: engine/src/index.js exports no guard symbol, and the guards are
consumed by relative import only (adapters import `../../../engine/src/guards/*.js`). No barrel,
generated API report, registry or README lists them.

| Symbol | File | Decision | Consumers |
|---|---|---|---|
| `parseShellCommands`, `normaliseGitArgv`, `gitInvocations` | engine/src/guards/shell-git-invocations.js | internal (design's three seams) | the two predicates, the unit and differential tests |
| `hasInlineAlias`, `INLINE_ALIAS_REASON` | same | internal (shared by both predicates, ADR-584) | the two predicates and their tests |
| `gitDestructivePredicate` | engine/src/guards/git-destructive-predicate.js | internal (ADR-579) | adapters/copilot/src/git-guard-adapter.js only |
| `copilotGuard` | adapters/copilot/src/git-guard-adapter.js | internal to the binding | `decideGuard`'s default, its tests |
| `GIT_DIFF_SHOW_RE` | engine guard + opencode re-export | **deleted** (ADR-587) | none (no test imports it; grep-verified) |
| `COMPLIANT_MARKERS`, `gitExtDiffPredicate`, `toolCallGuard`, `WRITE_TOOLS` | unchanged signatures | unchanged | unchanged |

Module-private (never exported): `MAX_NESTING_DEPTH` (8), the option tables, the parse-failure
reasons, the destructive reasons map. Tests pin the literal values so a mutated constant is
killed (an exported constant read back by a test would leave the mutant alive).

The one user-facing surface change is the hook file name (`hooks/craft-guard.js`): its gates are
adapters/copilot/config.template.json + adapters/copilot/test/config.test.js (Part 9) and the
README / gate spec / PoC record / adapters index (Part 11).

## Decision candidates

New load-bearing choices the design left open. Each part below is written to the
**recommendation**; the "if not" column says exactly what changes.

| # | Choice | Alternatives (≤3) | Recommendation | Why / if not |
|---|---|---|---|---|
| DC-P1 | A dynamic word among `reset`/`branch` args (before `--`), e.g. `H=--hard; git reset $H`, `git branch "$F" x` | (a) it blocks (it may carry `--hard`/`-D`) · (b) it is ignored; documented residual "a destructive flag carried by a variable" · (c) block only an unquoted dynamic word | **(a)** | bash runs `git reset --hard` for `H=--hard; git reset $H`, and the design's verb table only sees literal words, so (b) is a bypass the design never listed. A quoted `"$F"` can equal `-D` just as well as an unquoted one, so (c) does not hold. Cost: `git branch -d "$B"` false-blocks (one re-issue; craft's routine `branch -d <literal>` still passes). `clean` already blocks without a literal dry-run, `push` always blocks, ext-diff already blocks without a literal `--no-ext-diff`. If (b): Part 1 omits `dynamicArgCount`, Part 6 cycle 5 drops the two dynamic-arg rows, the fuzz generator tags dynamic-arg fragments residual, and Part 11 lists the residual. |
| DC-P2 | Fuzz Leg B (normaliser vs real git) on a git other than the pinned 2.54.x | (a) strict equality on 2.54.x; elsewhere one-directional: fail only when git ran a subcommand and the normaliser said `refused`/`no-subcommand`/another subcommand · (b) strict everywhere · (c) skip Leg B unless git is 2.54.x | **(a)** | The option table is a git-2.54 fact (ADR-581). CI's git differs from the dev box: a git older than the pinned one can refuse a recent flag such as `--no-advice` while the table accepts it — a safe-direction mismatch (over-blocking) that would turn (b) red on CI for no defect. (c) loses CI coverage. (a) keeps the unsafe direction (normaliser more permissive than git) gated everywhere. |
| DC-P3 | How the fuzz is kept out of Stryker's corpus (ADR-589) | (a) replace `engine/test/**/*.test.js` with the single extglob `engine/test/**/!(*.differential).test.js`, pinned by a mutation-config test · (b) ADR-589's fallback: the fuzz moves under adapters/copilot/test/ · (c) a non-`.test.js` file name plus an explicit ci.sh line | **(a)** | Pinned above: the tap runner ignores a `!`-prefixed entry (it would silently keep the fuzz in the dry run) but honours the extglob, and keeps every other engine test. It is the negated glob ADR-589 intends, in the one syntax the runner accepts. (b) puts an engine-module test in a binding dir. (c) defeats ci.sh's find-based zero-file discipline. If (b): Part 7 creates adapters/copilot/test/shell-git-invocations-differential.test.js (importing the engine module) and does not touch Stryker config. |

Details the design left implicit, fixed here without a decision:

- **What "dynamic" means.** The design's typedef says "an unquoted `$…`", but its own anchor
  example `"$(which git)" push` is a double-quoted substitution that must be a dynamic head. So a
  word is dynamic when bash performs any expansion inside it: `$NAME`, `$1`/`$@`/`$?`…, `${…}`,
  `$(…)`, backticks, `$((…))`, `<(…)`/`>(…)` — bare or inside `"…"`. A `$` inside `'…'`, inside
  `$'…'`, or escaped as `\$` is literal. A dynamic word's `text` keeps each expansion's source
  text verbatim (`"$X"` → text `$X`), so verb sniffing compares whole words.
- **`leadingWords`.** The ext-diff `rtk proxy` exemption needs the words before the anchor, which
  the design's `GitInvocation` does not carry. Every invocation `gitInvocations` returns carries
  `leadingWords: string[]` (texts of the simple command's words before the anchor; `[]` for a
  dynamic head). `normaliseGitArgv` itself does not return it.
- **Parse-failure reasons** are fixed module-private strings carried verbatim in
  `{ parsed: false, reason }` and returned verbatim by both predicates:
  `craft: command not parseable (unterminated quote) — denied fail-closed`,
  `craft: command not parseable (unterminated substitution) — denied fail-closed`,
  `craft: command not parseable (nesting deeper than 8) — denied fail-closed`.
- **Emission order.** `commands` lists simple commands in completion order: a substitution's
  commands complete (and are listed) before the command that holds it; a re-parsed string
  (`sh -c`, `eval`, `env -S`) is listed right after the command that carries it. Tests compare
  whole arrays with `deepEqual`, so this order is pinned.
- **Substitution bodies are parsed by recursive descent** — the same state machine run until the
  matching close — never by pre-scanning for a `)`. This is what keeps craft's own commit idiom
  parseable: `git commit -m "$(cat <<'EOF'⏎fix: don't break⏎EOF⏎)"` holds an apostrophe inside a
  quoted heredoc inside `$(…)` inside `"…"`. Pinned as a Part 4 row and a Part 6 routine pass.
- **The `DENY_TOOL_PATTERNS` parity rows** live in adapters/copilot/test/deny-tool-args.test.js
  (the adapter test imports the engine predicate), not in an engine test importing adapter code:
  the engine stays binding-neutral.
- Dropped head words are matched on the word's text: a quoted `"FOO=1" git diff` (bash: command
  `FOO=1` not found) is read as an assignment and the `git diff` is judged — a false block, the
  safe direction.

## Part 1 — normaliseGitArgv: git global options to a git invocation

### Context

Creates `engine/src/guards/shell-git-invocations.js` and `engine/test/guards/shell-git-invocations.test.js`.

Read-only references: design docs/contributing/design/copilot-git-argv-normalising-guard.md
§Pinned C (the option table, git 2.54.0) and §Module "Normaliser"; test style in
engine/test/guards/git-ext-diff-predicate.test.js (`node:test` `describe`/`it`,
`import assert from 'node:assert/strict'`, Given/When/Then titles, `const sut = …`, AAA blocks,
table-driven `for (const … of [...])` rows).

Export added in this part (signature and JSDoc typedefs from the design, verbatim):

```js
/** @typedef {{ text: string, dynamic: boolean }} ShellWord
 *  @typedef {{ kind: 'subcommand', subcommand: string, args: string[], configKeys: string[], dynamicArgCount: number }
 *         | { kind: 'refused', option: string, rest: string[] }
 *         | { kind: 'indeterminate', rest: string[] }
 *         | { kind: 'no-subcommand' }} GitInvocation */
export function normaliseGitArgv(words) // words AFTER the git word: string[] | ShellWord[]
```

Rules (Pinned C + the probe facts above), each a frozen module-private constant:

- Strings are lifted to `{ text, dynamic: false }` by one private helper.
- Value options `-C`, `-c`, `--git-dir`, `--work-tree`, `--namespace`, `--config-env`,
  `--attr-source`: consume the next word; the long forms also accept `--opt=value`. A short
  option with an attached value (`-C.`, `-ck.v=1`) is **refused**. A value option as the last
  word → `{ kind: 'no-subcommand' }`. A dynamic value is consumed like any value.
- Flags (skipped): `--no-pager`, `-p`, `--paginate`, `-P`, `--no-optional-locks`,
  `--literal-pathspecs`, `--glob-pathspecs`, `--noglob-pathspecs`, `--icase-pathspecs`,
  `--no-replace-objects`, `--no-lazy-fetch`, `--no-advice`, `--bare`; plus `--exec-path=<p>`.
- `-v`/`--version` → subcommand `version` (remaining words are its args); `-h`/`--help` →
  subcommand `help`.
- Print-and-exit → `no-subcommand`: `--exec-path` (bare), `--html-path`, `--man-path`,
  `--info-path`, and `--list-cmds=<x>`. Bare `--list-cmds` is **refused** (pinned).
- Any other word starting with `-` → `{ kind: 'refused', option, rest }` (`rest` = texts after
  it): `--frobnicate`, `--super-prefix=x/`, `--`, `--end-of-options`, `--no-ext-diff`.
- A dynamic word where an option or the subcommand is expected →
  `{ kind: 'indeterminate', rest }`, `rest` = texts from that word onward (inclusive).
- Otherwise the word is the subcommand; `args` = texts of the words after it.
- `configKeys`: lowercased keys from `-c k=v` (text before the first `=`; `-c k` with no `=` →
  `k`) and `--config-env k=ENV` / `--config-env=k=ENV` (text before the first `=` of the value),
  in order. Present (possibly `[]`) on every `subcommand` result.
- `dynamicArgCount` (DC-P1; the one field beyond the design's typedef): the number of
  `dynamic: true` words after the subcommand and before the first `--`. Present on every
  `subcommand` result.

House rules: functions ≤20 lines (dispatch on a small table, early returns), nesting ≤2, no
boolean params, named frozen constants, no provenance refs in code or tests.

### TDD steps

1. RED — `describe('normaliseGitArgv() — value-taking global options')`: rows `['-C', '.', 'push']`,
   `['-c', 'k.v=1', 'push']`, `['--git-dir=.git', 'push']`, `['--git-dir', '.git', 'push']`,
   `['--work-tree=.', 'push']`, `['--work-tree', '.', 'push']`, `['--namespace', 'x', 'push']`,
   `['--config-env', 'k.v=HOME', 'push']`, `['--attr-source=HEAD', 'push']`,
   `['push', 'origin', 'main']` → `{ kind: 'subcommand', subcommand: 'push', args: [...], configKeys: [...], dynamicArgCount: 0 }`
   (deepEqual); configKeys: `['-c', 'Alias.P=push', 'p']` → `['alias.p']`,
   `['--config-env=Clean.RequireForce=X', '-c', 'k', 'clean']` → `['clean.requireforce', 'k']`;
   `['reset', { text: '$H', dynamic: true }, '--', { text: '$P', dynamic: true }]` →
   `dynamicArgCount: 1`. Fails: `ERR_MODULE_NOT_FOUND` for `../../src/guards/shell-git-invocations.js`.
   GREEN — create the module: value-option table, key collection, subcommand fallback.
2. RED — flag rows (each of the 13 flags, and `--exec-path=/x`, before `push`) → subcommand
   `push`. Fails: the flag is returned as the subcommand (`subcommand: '--no-pager'`).
   GREEN — flag table.
3. RED — `['-v', 'push']` → `version` with args `['push']`; `['--help', 'push']` → `help`;
   `['--exec-path', 'push']`, `['--html-path']`, `['--list-cmds=builtins', 'push']`, `['-C']`,
   `['--git-dir']`, `['-c', 'rev-parse']` (value consumes the sentinel) and `[]` →
   `{ kind: 'no-subcommand' }`. Fails: returned as subcommand `-v`/`--exec-path`…, and `['-C']`
   reads past the end. GREEN — version/help map, print-and-exit table, missing-value check.
4. RED — refused rows: `['-C.', 'push']`, `['-ck.v=1', 'push']`, `['--frobnicate', 'push']`,
   `['--super-prefix=x/', 'push']`, `['--', 'push']`, `['--end-of-options', 'push']`,
   `['--list-cmds', 'push']`, `['--no-ext-diff', 'show', 'HEAD']` →
   `{ kind: 'refused', option, rest }`. Fails: returned as a subcommand. GREEN — the `-…`
   fallthrough.
5. RED — `[{ text: '$OPTS', dynamic: true }, 'push']` → `{ kind: 'indeterminate', rest: ['$OPTS', 'push'] }`;
   `['-C', { text: '$WT', dynamic: true }, 'status']` → subcommand `status` (a dynamic value is
   consumed); `['-C', '.', { text: '$SUB', dynamic: true }]` → `indeterminate`. Fails: the
   dynamic word becomes the subcommand. GREEN — the dynamic check at option/subcommand position.
6. REFACTOR — one walk function plus per-kind handlers, each ≤20 lines; constants frozen.

### Gate

`cd engine && node --test test/guards/shell-git-invocations.test.js`, then
`log=$(mktemp) && bash scripts/ci.sh > "$log" 2>&1; echo "exit $?"; grep -E '^# (tests|fail) |^ci:' "$log"`
(exit 0, every `# fail 0`).

### Commit

`feat(guards): normalise git global options into a git invocation`

## Part 2 — parseShellCommands core: words, quotes, separators, head words, redirections

### Context

Edits `engine/src/guards/shell-git-invocations.js` and `engine/test/guards/shell-git-invocations.test.js` (Part 1 created both).

Read-only: design §Module "Tokeniser" table (rows `\x`, `'…'`, `$'…'`, `"…"`, `#`, command break,
dropped head words, redirection, unterminated quote); this plan's "Details … fixed here" (parse
failure strings, emission order).

Export added (design signature):

```js
/** @typedef {{ words: ShellWord[] }} SimpleCommand
 *  @typedef {{ parsed: true, commands: SimpleCommand[] } | { parsed: false, reason: string }} ParseResult */
export function parseShellCommands(command)
```

A character state machine (no regex splitting). This part covers:

- `\x` outside quotes → literal `x`; `\⏎` → removed (line continuation, also inside `"…"`).
- `'…'` literal; `"…"` where `\` escapes only `$`, `` ` ``, `"`, `\` and newline (any other
  `\x` keeps both chars); `$'…'` ANSI-C: `\x` literal, ends at an unescaped `'`.
- Quote removal joins adjacent pieces into one word (`git di""ff` → `diff`, `g\it` → `git`,
  `"git"` → `git`). A metachar inside quotes never splits.
- `#` at the start of a word → comment to the newline (`a#b` and `'#x'` are words).
- Command breaks: `;` `&` `|` `&&` `||` `;;` `|&` newline `(` `)`. Empty commands are not emitted.
- Dropped from the head of a simple command, repeatedly: `{` `}` `!` `time` (`time -p`) `if` `then`
  `elif` `else` `fi` `do` `done` `while` `until` `case` `esac` `coproc`, and a `NAME=value` word
  (`/^[A-Za-z_][A-Za-z0-9_]*=/`) while still in command position. `a=b` after the command word is
  an argument.
- Redirections dropped with their target: `[n]<` `>` `>>` `<&` `>&` `&>` `<>` `>|`, attached or
  spaced target (`>out`, `2>&1`, `&>/dev/null`, `> out`). `&>` and `>&` are never a `&` break.
  `<<` / `<<<` and `<(`/`>(` are NOT handled here (Parts 3 and 4).
- Unterminated `'`, `"`, `$'` → `{ parsed: false, reason: 'craft: command not parseable (unterminated quote) — denied fail-closed' }`.

All words in this part are `dynamic: false` (dynamic marking lands in Part 3). Test helper: a
local `const word = (text) => ({ text, dynamic: false })`.

### TDD steps

1. RED — `describe('parseShellCommands() — command breaks')`: `'git -C x diff; ls'`,
   `'a && b || c'`, `'a | b |& c'`, `'a & b'`, `'a\nb'`, `'(git diff)'`
   → expected `{ parsed: true, commands: [...] }`; `''` and `'  '` → `{ parsed: true, commands: [] }`.
   Fails: `SyntaxError: The requested module … does not provide an export named 'parseShellCommands'`
   (the whole file, Part 1 rows included). GREEN — the state machine skeleton: words + breaks.
2. RED — quoting/escapes: `"git -C '/a & b' diff"` → `-C` value `/a & b`; `'git -C "/a;b" diff'`;
   `'echo \\"; git diff'` → `[echo, "]`, `[git, diff]`; `"echo \\'; git diff"`;
   `"echo $'a\\'b'; git diff"` → `[echo, a'b]`, `[git, diff]`; `'"git" diff'`, `"'git' diff"`,
   `'g\\it diff'`, `'git "diff"'`, `'git di""ff'` → `[git, diff]`; `'git \\\n diff'` → `[git, diff]`;
   `'echo "a\\$b\\x"'` → `[echo, a$b\x]`. Fails: quotes kept as characters and `;` inside quotes
   splits. GREEN — quote states.
3. RED — `'git diff HEAD #--no-ext-diff'` → `[git, diff, HEAD]`; `'echo a#b'` keeps `a#b`;
   `"git -c c='#0f0' diff"` keeps `#0f0`; `'# only a comment'` → no command. Fails: `#…` kept as
   words. GREEN — comment state at word start.
4. RED — head words: `'FOO=1 git diff'`, `'FOO=1 BAR=2 git diff'`, `'! git diff'`, `'time git diff'`,
   `'time -p git diff'`, `'{ git diff; }'`, `'if true; then git diff; fi'`,
   `'while false; do git diff; done'`, `'f(){ git diff; }; f'`,
   `'case x in x) git diff;; esac'` → each `[git, diff]` command present
   with no head word; `'git -c a=b diff'` keeps `a=b`. Fails: head words kept (`[FOO=1, git, diff]`).
   GREEN — head stripper.
5. RED — redirections: `'git diff > out.txt'`, `'git diff 2>&1'`, `'git diff &>/dev/null'`,
   `'git diff >| f'`, `'git diff <> f'`, `'cat < in.txt'` → targets dropped, no extra command;
   unterminated: `'echo "x'`, `"echo 'x"`, `"echo $'x"` → the unterminated-quote result. Fails:
   targets kept as words, `&` of `&>` splits, unterminated returns `parsed: true`. GREEN —
   redirection tokens and the end-of-input quote check.
6. REFACTOR — split per-state handlers (≤20 lines each, nesting ≤2); no boolean params (pass a
   named mode constant where a handler needs one).

### Gate

`cd engine && node --test test/guards/shell-git-invocations.test.js`, then
`log=$(mktemp) && bash scripts/ci.sh > "$log" 2>&1; echo "exit $?"; grep -E '^# (tests|fail) |^ci:' "$log"`.

### Commit

`feat(guards): tokenise a bash command into simple commands`

## Part 3 — parseShellCommands substitutions, dynamic words, depth cap

### Context

Edits `engine/src/guards/shell-git-invocations.js` and `engine/test/guards/shell-git-invocations.test.js`.

Read-only: design §Module tokeniser rows `$(…)`/backtick/`<(…)`/`>(…)`, `$((…))`, `${…}`/`$NAME`,
unterminated, depth; this plan's "What dynamic means", "Emission order", "Substitution bodies are
parsed by recursive descent".

Behaviour added:

- `$(…)`, `` `…` `` (inside it `` \` `` is an escaped backtick), `<(…)`, `>(…)`: the body is parsed
  by the same machine, recursively, until the matching close; its commands are emitted before the
  enclosing command; the word holding it is `dynamic: true` and its text keeps the source
  (`$(git diff)`). Works bare and inside `"…"`.
- `${…}`: the word is dynamic; inside the braces, quotes and `$(…)`/backticks are honoured and
  parsed recursively (`echo ${x:-$(git diff)}` runs `git diff` when `x` is unset).
- `$NAME`, `$1`, `$@`, `$*`, `$#`, `$?`, `$$`, `$!`, `$-`: the word is dynamic.
- `$((…))`: skipped to its balanced close; the word is dynamic; the body is not parsed (residual).
- A `$` inside `'…'`, `$'…'`, or as `\$` is literal (not dynamic).
- Unterminated `$(`, `` ` ``, `${`, `$((`, `<(`, `>(` →
  `{ parsed: false, reason: 'craft: command not parseable (unterminated substitution) — denied fail-closed' }`.
- Depth: top level is depth 0; each `$(`, backtick, `<(`, `>(`, `${` adds one. Depth >
  `MAX_NESTING_DEPTH` (module-private, `8`) →
  `{ parsed: false, reason: 'craft: command not parseable (nesting deeper than 8) — denied fail-closed' }`
  (build the string from the constant; the test pins the literal `8`).

Test helpers: extend with `const dyn = (text) => ({ text, dynamic: true })`. Build nested inputs
with a small local function (`nest(depth)` → `echo $(echo $(… git diff …))`); a named test
constant `PINNED_NESTING_CAP = 8`.

### TDD steps

1. RED — `'echo $(git diff)'` → `[git, diff]` then `[echo, dyn('$(git diff)')]`;
   `'echo "$(git diff)"'` → same shape; `'echo $(echo $(git diff))'` → three commands, innermost
   first; `'true && echo "x$(git diff)y"'`. Fails: Part 2 reads `(`/`)` as breaks, so the word is
   `$` with `dynamic: false`. GREEN — recursive `$(` parse.
2. RED — ``'echo `git diff`'`` → `[git, diff]`, `[echo, dyn(...)]`; ``'echo $(echo `git diff`)'``
   (backtick inside `$(…)`); `'cat <(git diff)'`, `'tee >(git diff)'` → nested `[git, diff]` and
   the holder word dynamic. Fails: backtick is a plain char; `<(` read as a redirection. GREEN —
   backtick and process-substitution entry points into the same recursion.
3. RED — dynamic marking: `'$G push'` → `[dyn('$G'), push]`; `'"$(which git)" push'` →
   `[dyn('$(which git)'), push]`; `'git -C "$WT" status'` → `-C`, `dyn('$WT')`;
   `'echo ${x:-$(git diff)}'` → `[git, diff]` emitted; `'x=$((1+2)) git diff'` → `[git, diff]`;
   `'echo $((2*(3+4)))'` → `[echo, dyn(...)]`; `"echo '$(git diff)'"` → `[echo, $(git diff)]`
   not dynamic, no nested command; `'git${IFS}diff'` → `[dyn('git${IFS}diff')]`. Fails: `$NAME`
   words are `dynamic: false`; `${`/`$((` are not recognised. GREEN — expansion scanner.
4. RED — unterminated: `'echo $(git diff'`, ``'echo `git diff'``, `'echo ${x'`, `'echo $((1+2'`,
   `'cat <(git diff'` → the unterminated-substitution result; `'git push\necho "x'` → the
   unterminated-quote result. Fails: returns `parsed: true` (end of input closes nothing yet).
   GREEN — end-of-input checks for each open construct.
5. RED — depth: `nest(PINNED_NESTING_CAP)` → `parsed: true` with `[git, diff]` among the commands;
   `nest(PINNED_NESTING_CAP + 1)` → the nesting result with the literal `8` in the reason. Fails:
   no cap, depth 9 parses. GREEN — depth counter threaded through the recursion (a parameter,
   never module state).
6. REFACTOR — one `parseUntil(close, depth)` routine shared by every nested construct; each handler
   ≤20 lines.

### Gate

`cd engine && node --test test/guards/shell-git-invocations.test.js`, then
`log=$(mktemp) && bash scripts/ci.sh > "$log" 2>&1; echo "exit $?"; grep -E '^# (tests|fail) |^ci:' "$log"`.

### Commit

`feat(guards): parse substitutions and mark dynamic words`

## Part 4 — parseShellCommands heredocs, here-strings, re-parsed sh -c / eval / env -S

### Context

Edits `engine/src/guards/shell-git-invocations.js` and `engine/test/guards/shell-git-invocations.test.js`.

Read-only: design §Module tokeniser rows `<<`/`<<-`, `<<<`, and "Re-parsed string arguments";
§Pinned A rows "heredoc body read as a quote", the quoted and unterminated heredoc rows.

Behaviour added:

- `<<DELIM` / `<<-DELIM` (spaced or attached): the body is the lines after the current line up to
  a line equal to DELIM; `<<-` strips leading tabs from body lines and from the delimiter line.
  No closing line → the body runs to end of input (pinned: an unterminated body is data, not an
  error). Several heredocs on one line are read in order. The `<<` word and DELIM are dropped
  from the command's words.
- DELIM quoted in any way (`'EOF'`, `"EOF"`, `\EOF`, `E"O"F`) → the body is data. Unquoted → the
  body is scanned only for `$(…)`/backticks (parsed recursively); apostrophes and `"` in it are
  plain characters.
- A heredoc inside a substitution (`"$(cat <<'EOF'⏎…⏎EOF⏎)"`) works because the substitution body
  is parsed by recursion (Part 3), which reaches the heredoc's newline inside the body.
- `<<< word`: the word is data and dropped; substitutions inside it are parsed.
- Re-parsed strings, matched at any word position of a simple command (after Part 2's head
  strip), each parsed at depth + 1 and listed right after the carrying command:
  - a word whose basename (after the last `/`) is one of `sh` `bash` `zsh` `dash` `ksh`,
    followed by option words (`-…`) of which one is a short cluster containing `c` (`-c`, `-lc`,
    `-ec`): the next non-option word's text is parsed as a command;
  - `eval`: the texts of all following words joined with one space are parsed;
  - `env -S <s>`, `env --split-string <s>`, `env --split-string=<s>`: `<s>` is parsed.
  A dynamic string re-parses to a dynamic head with no git word (`bash -c "$CMD"`): residual,
  no special case.

### TDD steps

1. RED — `"cat <<EOF\nit's\nEOF\ngit diff"` → `[cat]`, `[git, diff]`;
   `'cat <<EOF\n$(git diff)\nEOF'` → `[git, diff]` emitted; `"cat <<'EOF'\n$(git push)\nEOF"`,
   `'cat <<"EOF"\n$(git push)\nEOF'`, `'cat <<\\EOF\n$(git push)\nEOF'` → only `[cat]`. Fails:
   `<<` is read as two redirections, the body lines are tokenised as commands and `it's` opens an
   unterminated quote. GREEN — pending-heredoc queue consumed at the next newline.
2. RED — `'cat <<-EOF\n\tbody\n\tEOF\ngit diff'` → `[cat]`, `[git, diff]`;
   `'cat <<EOF\nbody\ngit push'` (unterminated) → only `[cat]`; `'cat <<A <<B\na\nA\nb\nB\ngit diff'`
   → `[cat]`, `[git, diff]`; craft's commit idiom
   `'git commit -m "$(cat <<\'EOF\'\nfix: don\'t break (x)\nEOF\n)"'` → `parsed: true`,
   `[cat]`, `[git, commit, -m, dyn(...)]` (pinned: bash 5 runs this idiom; bash 3.2.57 rejects
   it with `unexpected EOF while looking for matching` and runs nothing, so parsing it is right
   for the newer shell and harmless for the older). Fails: tabs not stripped, the unterminated body is
   tokenised, the commit idiom returns the unterminated-quote result. GREEN — `<<-`, EOF body,
   multi-heredoc order.
3. RED — `'cat <<< "$(git diff)"'` → `[git, diff]`, `[cat]`; `"cat <<< 'git diff'"` → `[cat]`
   only. Fails: `<<<` read as a heredoc whose delimiter is `<`. GREEN — here-string token.
4. RED — `"bash -c 'git diff'"`, `'sh -lc "git diff"'`, `"/bin/zsh -ec 'git diff'"`,
   `"env bash -c 'git diff; true'"`, `"bash -x -c 'git diff'"` → `[git, diff]` listed after the
   carrying command; `'bash script.sh'` → no re-parse; `"bash -c '$(git diff)'"` → `[git, diff]`
   (single-quoted text re-parsed). Fails: the string stays one word, no nested command. GREEN —
   shell `-c` matcher.
5. RED — `'eval git diff'`, `"eval 'git diff; true'"`, `"eval echo 'a;' git diff"` (joined text
   `echo a; git diff`), `"env -S 'git diff'"`, `"env --split-string='git diff'"`,
   `"env --split-string 'git diff'"` → `[git, diff]` present; a re-parse at the cap
   (`nest(PINNED_NESTING_CAP)` wrapped in `bash -c '…'`) → the nesting result. Fails: no
   re-parse; depth not incremented. GREEN — `eval` and `env -S` matchers sharing the shell
   matcher's re-parse call.
6. REFACTOR — the three matchers are one table of `{ matches(words, i), stringAt(words, i) }`
   entries; each ≤20 lines.

### Gate

`cd engine && node --test test/guards/shell-git-invocations.test.js`, then
`log=$(mktemp) && bash scripts/ci.sh > "$log" 2>&1; echo "exit $?"; grep -E '^# (tests|fail) |^ci:' "$log"`.

### Commit

`feat(guards): parse heredocs and re-parse sh -c, eval and env -S bodies`

## Part 5 — gitInvocations anchor and gitExtDiffPredicate rebuilt on it

### Context

Edits `engine/src/guards/shell-git-invocations.js`, `engine/test/guards/shell-git-invocations.test.js`, `engine/src/guards/git-ext-diff-predicate.js`, `engine/test/guards/git-ext-diff-predicate.test.js`, `adapters/opencode/src/git-guard-predicate.js`.

Read-only regression lists that must stay green **unchanged**: engine/test/tool-call-guard.test.js
(describe "git diff/show regex pin: documented cases", L222+), adapters/copilot/test/git-guard-predicate.test.js,
adapters/codex/test/git-guard-predicate.test.js, adapters/opencode/test/git-guard-predicate.test.js
(`PASS_COMMANDS` holds `git --no-ext-diff show HEAD` — `refused` → allow — and `rtk proxy git diff`).
Design §Pinned A (the BLOCK matrix), §Predicates "gitExtDiffPredicate".

Add to shell-git-invocations.js:

```js
/** @returns {{ parsed: true, invocations: Array<GitInvocation & { leadingWords: string[] }> } | { parsed: false, reason: string }} */
export function gitInvocations(command)
export const INLINE_ALIAS_REASON = 'craft: an inline git alias (-c alias.*) is denied — it can run any git verb';
export function hasInlineAlias(invocation) // true when a 'subcommand' invocation's configKeys holds a key starting 'alias.'; false for every other kind
```

Anchor (ADR-580): for each SimpleCommand, every word with `dynamic: false` whose text after the
last `/` is exactly `git` starts an invocation `normaliseGitArgv(words after it)` with
`leadingWords` = texts before it; and when `words[0]` is dynamic, a dynamic-head invocation
`normaliseGitArgv(words.slice(1))` with `leadingWords: []`. A parse failure is returned as is.

git-ext-diff-predicate.js today (97 lines): `COMPLIANT_MARKERS` L2 (keep, same two values),
`OPTION_VALUE` L7, `GIT_DIFF_SHOW_RE` L13-15, `REASON_GIT_EXT_DIFF` L19-20 (keep, same text),
`SEGMENT_SEPARATORS` L22-27, `splitSegments` L29-59, `segmentIsCompliant` L61-72,
`gitExtDiffPredicate` L74-97. Delete everything but the two kept constants and rewrite
`gitExtDiffPredicate(command) → { block, reason? }` (same signature):

- not parsed → `{ block: true, reason: <the parse reason> }`;
- an invocation with `hasInlineAlias` → `{ block: true, reason: INLINE_ALIAS_REASON }`;
- `subcommand` `diff`/`show` whose `args` hold no word equal to `--no-ext-diff` → block with
  `REASON_GIT_EXT_DIFF`, unless `leadingWords` starts with `rtk`, `proxy` (the markers in
  `COMPLIANT_MARKERS`, now matched as words);
- `indeterminate` whose `rest` holds `diff` or `show` and no `--no-ext-diff` → block;
- `refused`, `no-subcommand`, any other subcommand → no block from this invocation.

adapters/opencode/src/git-guard-predicate.js L1 becomes `export { COMPLIANT_MARKERS } from …`
(drop `GIT_DIFF_SHOW_RE`) in the same GREEN, or the opencode suite fails to import.

### TDD steps

1. RED — `describe('gitInvocations()')` rows (deepEqual): `'git -C . push'` → one `push`
   invocation, `leadingWords: []`; `'env git diff'` → `leadingWords: ['env']`;
   `'/usr/bin/git diff'`; `'echo git push'` (any-word anchor, intended); `'git log --grep git show'`
   → two invocations (`log`, `show`); `'ls /x/git push'`; `'$G push'` → dynamic head `push`;
   `'rtk proxy git diff'` → `leadingWords: ['rtk', 'proxy']`; `'echo "x'` → the parse failure;
   `hasInlineAlias` true for `git -c alias.d=diff d`, false for `git -c core.pager=cat diff`.
   Fails: `SyntaxError … does not provide an export named 'gitInvocations'`. GREEN — anchor +
   alias helper.
2. RED — in git-ext-diff-predicate.test.js, `describe('gitExtDiffPredicate() — shell grammar no longer hides a diff/show')`,
   each `block: true` (all `false` today): `'echo \\"; git diff'`, `"echo \\'; git diff"`,
   `"echo $'a\\'b'; git diff"`, `"cat <<EOF\nit's\nEOF\ngit diff"`, `'(git diff)'`,
   `'true && (git diff)'`, `'{ git diff; }'`, `'! git diff'`, `'time git diff'`,
   `'if true; then git diff; fi'`, `'case x in x) git diff;; esac'`, `'f(){ git diff; }; f'`,
   `'FOO=1 git diff'`, `'x=$((1+2)) git diff'`, `'env git diff'`, `'command git diff'`,
   `'exec git diff'`, `'nohup git diff'`, `'echo x | xargs git diff'`, `'"git" diff'`, `"'git' diff"`,
   `'g\\it diff'`, `'git "diff"'`, `'git di""ff'`, `'/usr/bin/git diff'`, `'git --no-pager diff'`,
   `'git -p diff'`, `'git --git-dir .git diff'`, `'git --no-optional-locks diff'`, `'$(git diff)'`,
   ``'`git diff`'``, `'cat <(git diff)'`, `'cat <<EOF\n$(git diff)\nEOF'`, `"bash -c 'git diff'"`,
   `'sh -c "git diff"'`, `'eval git diff'`, `"env -S 'git diff'"`, `'G=git; $G diff'`,
   `'echo git diff'` (intended false block); plus `'cat <<EOF\nbody\ngit diff'` (unterminated
   body is data) → `block: false` — today `true`. Fails: the regex anchors only at a segment
   start after `^\s*git`. GREEN — rewrite over `gitInvocations`; delete the dead code and the
   opencode re-export.
3. RED — `'echo "x'` and `'echo $(x'` → `block: true` with the exact parse reason (today
   `false`); `'git $OPTS diff'` → block (today `false`); `'git -c alias.d=diff d'` → block with
   `INLINE_ALIAS_REASON` (today `false`). Fails as noted. GREEN — parse-failure, indeterminate
   and alias branches.
4. GUARD — `"cat <<'EOF'\n$(git diff)\nEOF"` → `false` (quoted heredoc is data; `false` today
   too); `'git${IFS}diff'` → `false` (pinned residual: a dynamic head with no further word);
   `'git --frobnicate diff'` → `false` (`refused`; `false` today). Every pre-existing row of
   git-ext-diff-predicate.test.js and the three regression lists above passes unchanged (each row
   was checked against the new rules: `#--no-ext-diff` is a comment, `git stash show` has
   subcommand `stash`, `git --no-ext-diff show HEAD` is `refused`).
5. REFACTOR — the predicate is one loop over invocations plus a per-kind verdict table; each
   function ≤20 lines; no comment explains what the code does.

### Gate

`cd engine && node --test 'test/guards/*.test.js' test/tool-call-guard.test.js`,
`cd adapters/opencode && node --test test/git-guard-predicate.test.js`, then
`log=$(mktemp) && bash scripts/ci.sh > "$log" 2>&1; echo "exit $?"; grep -E '^# (tests|fail) |^ci:' "$log"`.
If any pre-existing PASS row in any binding turns red, stop: blocker protocol (do not edit the row).

### Commit

`fix(guards): judge git diff/show on normalised git invocations`

## Part 6 — gitDestructivePredicate

### Context

Creates `engine/src/guards/git-destructive-predicate.js` and `engine/test/guards/git-destructive-predicate.test.js`; edits `adapters/copilot/test/deny-tool-args.test.js`.

Read-only: design §Pinned D and §Predicates "gitDestructivePredicate"; ADR-583 (verb set), ADR-581
(verb sniffing), DC-P1 above; adapters/copilot/src/deny-tool-args.js (`DENY_TOOL_PATTERNS`, 10
`shell(…)` literals, L28-39); engine/src/guards/shell-git-invocations.js (`gitInvocations`,
`hasInlineAlias`, `INLINE_ALIAS_REASON`).

```js
export function gitDestructivePredicate(command) // → { block: boolean, reason?: string }
```

Reasons (module-private frozen map; tests pin the literals):

- push: `craft: destructive git (push) is denied in this binding — run it outside the agent`
- reset: `craft: destructive git (reset --hard) is denied in this binding — run it outside the agent`
- clean: `craft: destructive git (clean without --dry-run) is denied in this binding — run it outside the agent`
- branch: `craft: destructive git (forced branch delete) is denied in this binding — run it outside the agent`

Rules, per invocation, on the args before the first `--`:

- not parsed → `{ block: true, reason: <parse reason> }`; `hasInlineAlias` → `INLINE_ALIAS_REASON`;
- `push` → always;
- `reset` → `--hard` present, or (DC-P1) any dynamic arg;
- `clean` → unless `-n`, `--dry-run`, or a short cluster (`/^-[A-Za-z]+$/`) holding `n`;
- `branch` → `-D` or a cluster holding `D`; or a delete (`-d`, `--delete`, cluster holding `d`)
  together with a force (`-f`, `--force`, cluster holding `f`); or (DC-P1) any dynamic arg;
- `refused` / `indeterminate` → block with that verb's reason when `rest` holds `push`, `reset`,
  `clean` or `branch` (first match);
- anything else → no block.

DC-P1 reads `invocation.dynamicArgCount` (added by Part 1's normaliser on the `subcommand`
kind): no edit to engine/src/guards/shell-git-invocations.js is needed here.

### TDD steps

1. RED — `describe('gitDestructivePredicate() — push')`: `'git push'`,
   `'git -C . push origin main'`, `'git --git-dir=.git push'`, `'git -c k=v push'`,
   `'env git push'`, `'(git push)'`, `"bash -c 'git push'"`, `'/usr/bin/git push'` → block with
   the push reason. Fails: `ERR_MODULE_NOT_FOUND`. GREEN — module with the push rule.
2. RED — reset: `'git reset --hard'`, `'git reset --hard HEAD'`, `'git reset HEAD --hard'`,
   `'git reset -q --hard'` → reset reason. Fails: no reset rule (block false). GUARD in the same
   step: `'git reset --keep'`, `'git reset --merge'`, `'git reset'`, `'git reset -- --hard'` →
   `false` (already false under GREEN 1). GREEN — reset rule with the `--` cut.
3. RED — clean: `-f`, `-fd`, `-df`, `-xdf`, `-fx`, `--force`, `-d`, `-i`,
   `'git -c clean.requireForce=false clean'` → clean reason. GUARD: `-n -f`, `-f -n`, `-nf`,
   `--dry-run` → `false` today and after. Fails: no clean rule. GREEN — clean rule.
4. RED — branch: `-D x`, `-df x`, `-fd x`, `--delete --force x`, `-d -f x`, `-Dr origin/x` →
   branch reason. GUARD: `-d x`, `--delete x`, `-f x y`, `branch`, `branch -a` → `false`.
   Fails: no branch rule. GREEN — branch rule.
5. RED — `'git push\necho "x'` → the unterminated-quote reason; `'git --frobnicate push'`,
   `'git -C. push'`, `'git $OPTS push'`, `'$G push'` → push reason; `'git -c alias.p=push p'`,
   `'git --config-env alias.x=HOME x'` → `INLINE_ALIAS_REASON`; DC-P1: `'H=--hard; git reset $H'`
   → reset reason, `'git branch "$F" x'` → branch reason Fails: these kinds fall through to no block. GREEN — the parse, alias, sniff and
   dynamic-arg branches.
6. GUARD — routine passes, each `false` (pass under the rules above): `git --version`,
   `git --no-optional-locks -C /w -c core.fsmonitor=false remote -v`,
   `git --no-optional-locks -c core.fsmonitor=false rev-parse origin/HEAD`, `git status`,
   `git add -A`, `git commit -m 'x'`, craft's heredoc commit idiom (Part 4 row 2's string),
   `git log --oneline -3`, `git diff --no-ext-diff`, `git worktree add ../w -b b`,
   `git rev-parse HEAD`, `git branch -d merged`. Intended false blocks pinned `true`:
   `'echo git push'`, `'$HOME/bin/deploy push'`.
7. GUARD — in adapters/copilot/test/deny-tool-args.test.js, a new describe
   `DENY_TOOL_PATTERNS — parity with the destructive-git predicate`: every pattern stripped of
   `shell(`…`)`, with each interposed spelling inserted after `git` (`-C .`, `--git-dir=.git`,
   `--git-dir .git`, `-c k.v=1`, `--work-tree=.`, `--no-pager`, `-p`, `-P`, `--no-optional-locks`,
   `--namespace x`, `--config-env k.v=HOME`, `--attr-source HEAD`, `--exec-path=/x`, `--bare`) and
   with none → `gitDestructivePredicate(...).block === true`. Passes because every literal's verb
   is covered by rules 1-4 and every spelling is in the normaliser table.
8. REFACTOR — a `{ verb → judge(invocation) }` table; cluster tests via one helper
   `shortClusterHolds(word, letter)`; each function ≤20 lines.

### Gate

`cd engine && node --test 'test/guards/*.test.js'`, `cd adapters/copilot && node --test test/deny-tool-args.test.js`, then
`log=$(mktemp) && bash scripts/ci.sh > "$log" 2>&1; echo "exit $?"; grep -E '^# (tests|fail) |^ci:' "$log"`.

### Commit

`feat(guards): add a destructive-git predicate over normalised invocations`

## Part 7 — Differential fuzz against bash and real git; Stryker exclusion

### Context

Creates `engine/test/guards/shell-git-invocations.differential.test.js`; edits `engine/stryker.conf.json` and `engine/test/mutation-config.test.js`.
Only if the fuzz surfaces a parser gap: also edits `engine/src/guards/shell-git-invocations.js` and `engine/test/guards/shell-git-invocations.test.js`.

Read-only: design §Test strategy "Differential fuzz (Part 6)" (generator, Leg A, Leg B,
assertions, shells); the precedent adapters/codex/test/hook-trust-differential.test.js (fixed
`SEED`, `CAP`, an accepted-count floor, a mulberry32 PRNG, `pick`, a pool of async spawns,
`realpathSync(mkdtempSync(...))` tree, PATH-first stub writing `printf '%s\0' "$#" "$@" >> argv.log`);
the planning facts table above (tap-runner glob behaviour, git trace outcomes); DC-P2, DC-P3.

CI discovery: scripts/ci.sh `run_suite engine engine/test engine` finds every *.test.js under
engine/test with `find`, so the new file runs in CI with no ci.sh change. Stryker: engine/stryker.conf.json
`tap.testFiles[0]` is `"engine/test/**/*.test.js"`; per DC-P3 it becomes
`"engine/test/**/!(*.differential).test.js"` (the runner ignores `!`-prefixed entries — pinned).
The mutation-config pairing rules only inspect adapters/ entries, so they are unaffected.

Fuzz shape (constants named and frozen):

- `SEED` fixed; `CAP` ≈ 400 generated commands for Leg A, `LEG_B_CAP` ≈ 150 sequences;
  `POOL_SIZE` 8; `SPAWN_TIMEOUT_MS` 5_000; every `it` gets `{ timeout: FUZZ_TIMEOUT_MS }` with
  `FUZZ_TIMEOUT_MS = 60_000` as the hard wall cap. Target wall time: ≤5 s for the whole file on
  the dev box (the engine suite is ~2.4 s today); tune `CAP` down if the measured time exceeds it,
  and report the measured time in the handback.
- **Generator** — mulberry32(SEED) composes, up to nesting depth 3: shell-grammar fragments from
  Pinned A (separators `;` `&&` `||` `|` newline; `( )`, `{ ; }`, `!`, `time`, if/then/fi,
  `case`, function body; `NAME=v` and `x=$((1+2))` prefixes; wrappers `env`, `command`, `exec`,
  `nohup`, `xargs` fed by `echo x |`; quote and escape styles: `"git"`, `'git'`, `g\it`,
  `git "diff"`, `di""ff`, `\"`, `\'`, `$'a\'b'`; heredocs quoted/unquoted/`<<-`; `<<<`;
  `$(…)`, backticks, `<(…)`, `bash -c`, `sh -c`, `eval`, `env -S`), the Pinned C options, and verbs
  `push`, `reset --hard`, `reset`, `clean -fd`, `clean -n`, `branch -D x`, `branch -d x`, `diff`,
  `diff --no-ext-diff`, `show`, `status`; dynamic-arg fragments (`H=--hard; git reset $H`).
  Each fragment carries a tag: `covered`, `residual`, `unterminated`, `over-nested`, or an
  intended-false-block class (`any-word-anchor`, `dynamic-head`, `refused-verb-sniff`,
  `dynamic-arg` per DC-P1, `unparseable`). Never generated (pinned by unit rows instead): a lone
  `&` (backgrounding races the log), `>(…)` (async), `|&` and `coproc` (bash ≥4 only),
  /usr/bin/git, `command -p`, `bash -l`, `sudo`, `rtk`, `-h`/`--help`.
- **Leg A (parser + anchor vs bash)** — per command: a run dir in the tree; a stub dir first on
  PATH (the original PATH after it) holding a `#!/bin/sh` `git` stub that appends `"$#" "$@"`
  NUL-separated to `argv.log` and exits 0; run `<shell> -c <cmd>` with cwd = run dir. Oracle:
  for each logged argv, `oracleBlock = gitDestructivePredicate(q) .block || gitExtDiffPredicate(q).block`
  where `q = 'git ' + argv.map(singleQuote).join(' ')` (a trivially quoted re-spelling: the
  oracle uses the verb rules with no shell grammar). Assertions:
  - no `covered` command where the oracle blocks and the predicate (same disjunction on the
    original command) allows — a false allow fails with the command printed;
  - every `parsed: false` verdict falls on an `unterminated` or `over-nested` command;
  - every false block (predicate blocks, oracle does not) carries an intended-false-block tag; a
    new class fails with the command printed;
  - an invoked floor: at least `INVOKED_FLOOR` (≈ half of CAP) commands logged ≥1 argv — a
    broken stub tree collapses the count and fails loudly.
- **Leg B (normaliser vs real git)** — `git` resolved from the PATH before the stub dir is added;
  a throwaway repo with one empty commit, `HOME` = an empty dir, `GIT_CONFIG_NOSYSTEM=1`,
  `GIT_TRACE=1`; random sequences (1-4) of Pinned C options with values from
  `. .git HEAD x k.v=1 k.v=HOME /x` plus invalid ones (`--frobnicate`, `-C.`, `--`,
  `--super-prefix=x/`, `--list-cmds`), then the sentinel `rev-parse`. Map the trace:
  `trace: built-in: git <sub>` → subcommand `<sub>`; `unknown option` → `refused`; neither →
  `no-subcommand`. Per DC-P2: strict equality of `kind`/`subcommand` when `git --version` reports
  2.54.x; on any other version, fail only when git ran a subcommand and the normaliser returned
  `refused`, `no-subcommand` or a different subcommand; log the git version with
  `t.diagnostic`.
- **Shells** — /bin/bash always; additionally the first `bash` on the original PATH whose
  realpath differs from /bin/bash's and whose `--version` is ≥5; when absent, `t.skip` with the
  reason. On ubuntu CI /bin/bash is already 5.x, so the second run is usually skipped there.

### TDD steps

1. RED — in engine/test/mutation-config.test.js:
   `Given engine/stryker.conf.json, when its tap.testFiles patterns are matched against engine/test/guards/shell-git-invocations.differential.test.js, then none matches`
   and `… against engine/test/guards/shell-git-invocations.test.js, then one matches`
   (`import { matchesGlob } from 'node:path'`). Fails: `engine/test/**/*.test.js` matches the
   differential path. GREEN — replace that `tap.testFiles` entry with the extglob.
2. GUARD — the fuzz file (Leg A per shell, Leg B). It passes when Parts 2-6 are right; it is
   written to fail loudly, not tuned to pass. Each failure it prints is either:
   - a parser gap → RED unit row in engine/test/guards/shell-git-invocations.test.js reproducing
     the printed command (fails with the wrong `commands`/`invocations`) → GREEN minimal fix in
     engine/src/guards/shell-git-invocations.js → re-run the fuzz; or
   - an oracle/generator bug → fix the test file.
   More than three distinct parser gaps → stop with the blocker protocol (the part is resized).
3. GUARD — the `t.diagnostic` counts (generated, invoked, false blocks per class, Leg B rows per
   kind) are all non-zero for the covered classes; a zero count means the generator never
   reached that class and is a generator bug to fix in this part.
4. REFACTOR — generator, runner and oracle as separate small functions; no shared mutable state
   across concurrent spawns (each run dir is its own).

### Gate

`cd engine && node --test test/guards/shell-git-invocations.differential.test.js test/mutation-config.test.js`
(report its `# duration_ms`), then
`log=$(mktemp) && bash scripts/ci.sh > "$log" 2>&1; echo "exit $?"; grep -E '^# (tests|fail|duration_ms) |^ci:' "$log"`.

### Commit

`test(guards): differentially fuzz the git invocation parser against bash and git`
(if a parser gap was fixed in this part, the same commit carries it; the message stays.)

## Part 8 — Copilot adapter: object toolArgs and copilotGuard

### Context

Edits `adapters/copilot/src/git-guard-adapter.js`, `adapters/copilot/test/git-guard-adapter.test.js`, `adapters/copilot/test/git-guard-predicate.test.js`.

Read-only: design §Copilot binding; ADR-578 (shapes), ADR-579 (composition order); live payload
shape on 1.0.92: `{"sessionId","timestamp","cwd","toolName":"bash","toolArgs":{"command":…,"description":…,"mode":"sync","initial_wait":20}}`.

adapters/copilot/src/git-guard-adapter.js today:

- header L1-6 says the layer is observational and names hooks/craft-observer.js → rewrite to
  what it does with no file name (it decides the guard verdict; the hook script turns it into
  the CLI response), so Part 9's rename does not touch it;
- `parseToolArgs(toolArgs)` L30-36: `JSON.parse(toolArgs)`, then rejects null / non-object (an
  array passes today). New: a plain object (non-null, not an array) is returned as is; a string
  is `JSON.parse`d then put through the same plain-object check; anything else throws (the throw
  becomes `decideGuard`'s fail-closed `{ block: true }`);
- `adaptCopilotEvent` JSDoc L58-63: `toolArgs: string|object`;
- `decideGuard(payload, guard = toolCallGuard)` L82: default becomes `copilotGuard`; JSDoc
  "audit verdict" → "guard verdict".

New export:

```js
import { gitDestructivePredicate } from '../../../engine/src/guards/git-destructive-predicate.js';
export function copilotGuard(event) // Bash: gitDestructivePredicate(tool_input.command ?? '') first, then toolCallGuard(event); first block wins
```

Tests: adapters/copilot/test/git-guard-adapter.test.js is the Stryker-listed covering file for
this source (engine/stryker.conf.json pairs them), so every row that kills a mutant here goes in
it. Its `payload(toolName, argsObj, cwd)` helper (L10-12) JSON-encodes; add an object-shaped twin
`objectPayload(toolName, argsObj, cwd)`. `describe('decideGuard() — fail-closed toolArgs parsing')`
(L192-232) keeps its string rows and gains the object/array rows. The structure-scan block
(L295-350) is Part 9's.
adapters/copilot/test/git-guard-predicate.test.js: `bashPayload` (L14-16), `BLOCK_COMMANDS`
(L18-28), `PASS_COMMANDS` (L30-39).

### TDD steps

1. RED — `objectPayload('bash', { command: 'ls' })` → `block: false` (today `true`: `JSON.parse`
   of an object throws); `objectPayload('bash', { command: 'git diff HEAD' })` → block whose
   reason includes `--no-ext-diff` (today block with **no** reason); `objectPayload('create',
   { path: '/repo/src/a.js', file_text: 'x' })` → `false` (today `true`). GREEN — new
   `parseToolArgs`.
2. RED — `{ toolArgs: '[]' }` and `{ toolArgs: '[{"command":"git diff"}]' }` → `block: true`
   (today `false`: an array passes the object check and `command` defaults to `''`). GUARD:
   `{ toolArgs: [] }`, `{ toolArgs: 42 }`, `{ toolArgs: true }`, `{ toolArgs: null }` → `true`
   (today `true` through a throw; stays `true`). GREEN — the array rejection.
3. RED — `copilotGuard({ tool: 'Bash', tool_input: { command: 'git -C . push' }, working_dir: '/repo' })`
   → push reason; `copilotGuard` on `'git push; git diff'` → the push reason (destructive first);
   `copilotGuard` on a `Write` out of tree → `block: true` (toolCallGuard still applies);
   `decideGuard(payload('bash', { command: 'git push' }))` → block (today `false`); in
   git-guard-predicate.test.js add `git push`, `git -C . push`, `git clean -fd`,
   `git reset --hard`, `git branch -D x` to `BLOCK_COMMANDS`, and one object-shaped
   `decideGuard` row. Fails: `SyntaxError … does not provide an export named 'copilotGuard'`.
   GREEN — `copilotGuard`, `decideGuard` default.
4. GUARD — the decoy describe (L173) and every existing row pass unchanged (the string shape is
   still accepted).
5. REFACTOR — header and JSDoc wording; `isPlainObject` helper; functions ≤20 lines.

### Gate

`cd adapters/copilot && node --test test/git-guard-adapter.test.js test/git-guard-predicate.test.js`, then
`log=$(mktemp) && bash scripts/ci.sh > "$log" 2>&1; echo "exit $?"; grep -E '^# (tests|fail) |^ci:' "$log"`.

### Commit

`feat(copilot): accept object toolArgs and compose the destructive-git predicate`

## Part 9 — Rename craft-observer.js to craft-guard.js (behaviour-preserving)

### Context

Edits (by `git mv`) `adapters/copilot/hooks/craft-guard.js` (from adapters/copilot/hooks/craft-observer.js, content unchanged), and edits `adapters/copilot/config.template.json`, `adapters/copilot/test/config.test.js`, `adapters/copilot/test/craft-root.test.js`, `adapters/copilot/src/craft-root.js`, `adapters/copilot/test/git-guard-adapter.test.js`.

Every in-tree reference to the old path outside the dated ledger (grep-verified):

| File | Line | Change here |
|---|---|---|
| adapters/copilot/config.template.json | L6 command; L2 `$comment` says "the observer command" | `node <CRAFT_ROOT>/adapters/copilot/hooks/craft-guard.js`; "the guard command" |
| adapters/copilot/test/config.test.js | L58-63 title + `/hooks\/craft-observer\.js/` | craft-guard.js |
| adapters/copilot/test/craft-root.test.js | L55 path segment | `'craft-guard.js'` |
| adapters/copilot/src/craft-root.js | L13-15 comment names the hook | new name |
| adapters/copilot/test/git-guard-adapter.test.js | L295-350: `OBSERVER_PATH`, `readObserverText`, describe/it titles | `GUARD_HOOK_PATH`, `readGuardHookText`, "hooks/craft-guard.js", "the guard hook source text" |
| adapters/codex/hooks/craft-guard.js | L7-15 comment | **Part 10** (the comment describes copilot's exit-0, which changes there) |
| docs/contributing/specs/gate.md L134, adapters/copilot/README.md L53 | prose | **Part 11** |

adapters/copilot/test/native-surface.test.js does not name the hook (grep-verified). No BACKLOG
SoT pointer names it.

### TDD steps

1. RED — config.test.js expects `/hooks\/craft-guard\.js/` (fails: the template names
   craft-observer.js); the structure scans read `hooks/craft-guard.js` (fail: `ENOENT`). GREEN —
   `git mv`, template command and `$comment`.
2. GUARD — craft-root.test.js "up-walk depth pin" with the new segment passes: `resolveCraftRoot`
   only walks up and checks engine/bin, the hook file need not exist.
3. REFACTOR — rename the test constants/helpers; craft-root.js comment.

### Gate

`cd adapters/copilot && node --test 'test/*.test.js'`, then
`log=$(mktemp) && bash scripts/ci.sh > "$log" 2>&1; echo "exit $?"; grep -E '^# (tests|fail) |^ci:' "$log"`;
`git grep -n craft-observer -- adapters engine` lists only adapters/codex/hooks/craft-guard.js
(comment) and the renamed hook's own `craft-observer:` log prefix — both rewritten in Part 10.

### Commit

`refactor(copilot): rename the preToolUse hook to craft-guard`

## Part 10 — The copilot hook enforces

### Context

Edits `adapters/copilot/hooks/craft-guard.js` (rewrite) and creates `adapters/copilot/test/craft-guard-hook.test.js`; edits the header comments of `adapters/copilot/src/deny-tool-args.js` (L1-27) and `adapters/codex/hooks/craft-guard.js` (L7-15).

Template: adapters/codex/hooks/craft-guard.js (117 lines): no static import; `DENY_EXIT_CODE = 2`,
`ALLOW_EXIT_CODE = 0`, `FAIL_CLOSED_REASON = 'denied (fail-closed)'`; `readMessage`/`reasonOf`
(never throw on a hostile thrown value); handlers registered first —
`process.on('uncaughtException', denyOnCrash)`, `('unhandledRejection', denyOnCrash)`,
`('beforeExit', denyWithoutVerdict)`; `main()` does `await import('../src/craft-root.js')` and
`await import('../src/git-guard-adapter.js')` inside `try`, sets `process.env.CRAFT_ROOT`, reads
stdin, `JSON.parse`, `decideGuard`; no `finally`.

Copilot differences (ADR-585):

- block → `process.stdout.write(JSON.stringify({ permissionDecision: 'deny', permissionDecisionReason: verdict.reason ?? FAIL_CLOSED_REASON }) + '\n', onWritten)`;
  `onWritten(err)` exits 0, or denies by exit 2 when `err` is set. Never exit before the write
  callback (on macOS a pipe write is async; an early exit truncates the JSON).
- allow → exit 0, nothing on stdout.
- crash / no verdict → `craft-guard: <reason>` on stderr, exit 2, nothing on stdout.
- both verdicts first write the audit line to stderr: `craft-guard: ${JSON.stringify(buildAuditEntry(payload, verdict))}`.
- header comment: enforcing, live-proven on copilot 1.0.92 (JSON deny, exit-2 deny, crash denies);
  a hook timeout fails open (copilot's behaviour); what fails open beyond code's reach (node
  missing, signal). No provenance refs (no ADR/part numbers).

deny-tool-args.js header L1-10 claims the hook "fires but cannot deny" → rewrite: this is the
launch-time layer and the floor on a copilot older than the hook's deny support; L14-27 keep the
prefix-matching residual and add that the `preToolUse` guard judges normalised argv. codex hook
L7-15 contrasts itself with "the Copilot observer … always-exit-0": rewrite to drop the
contrast (both bindings now enforce; codex by exit 2, copilot by JSON on stdout).

Test file shape mirrors adapters/codex/test/craft-guard-hook.test.js (190 lines): `HOOK` path,
`run(payload)` = `spawnSync(process.execPath, [HOOK], { input, encoding: 'utf8' })`,
`withGuardCopy(breakTree, nodeArgs)` copying hooks/ + src/ into a mkdtemp root,
`withoutEngineSources` (creates engine/bin only), `stubbedCraftRoot(body)` (symlinks engine,
stubs craft-root.js), the constants `STATIC_IMPORT_LINE`, `THROWING_STDIN_LISTENER`,
`UNPRINTABLE_MESSAGE_THROW`, `THROWING_MESSAGE_GETTER`, `NEVER_ENDING_STDIN`, `FLOATING_REJECTION`.
Payloads use the object shape: `JSON.stringify({ sessionId: 's', timestamp: 0, cwd: '/repo', toolName: 'bash', toolArgs: { command } })`.
The missing-module assertion matches `/^craft-guard: .*engine\/src\/guards\//m` (the adapter
imports two guard modules; which one node names first is not pinned). This file is NOT added to
Stryker's `tap.testFiles` (it spawns processes; the pairing test forbids an unpaired adapter
entry).

### TDD steps

1. RED — `describe('craft-guard hook — verdict channel')`: a `git push` payload → exit 0, stdout
   is exactly one line parsing to `{ permissionDecision: 'deny', permissionDecisionReason: <push reason> }`
   (today stdout empty); a `git diff` payload → reason includes `--no-ext-diff`; an out-of-tree
   `create` (`toolArgs: { path: '/etc/passwd', file_text: 'x' }`) → reason `denied (fail-closed)`;
   both write a `craft-guard: {` audit line on stderr (today `craft-observer:`). GUARD: a
   `git status` payload → exit 0, stdout `''` (true today).
2. RED — `describe('craft-guard hook — a crash still denies')`: `'{not json'` and `''` stdin →
   exit 2, a `craft-guard:` stderr line, empty stdout (today exit 0); source scans: no static
   import (`STATIC_IMPORT_LINE`), no `finally` (today both present); `withGuardCopy` fixtures:
   missing engine sources, throwing stdin listener, unprintable message, throwing message getter,
   floating rejection under `--unhandled-rejections=warn`, never-ending stdin → exit 2 with the
   pinned stderr line. GREEN (for 1 and 2) — rewrite the hook on the codex template with the JSON
   channel.
3. GUARD — Part 9's structure scans in git-guard-adapter.test.js still pass (dynamic
   `import('../src/git-guard-adapter.js')` matches the seam regex; the CRAFT_ROOT assignment is
   inside `try`).
4. REFACTOR — header comments of the hook, deny-tool-args.js and the codex hook; functions ≤20
   lines.

### Gate

`cd adapters/copilot && node --test 'test/*.test.js'`, `cd adapters/codex && node --test test/craft-guard-hook.test.js`, then
`log=$(mktemp) && bash scripts/ci.sh > "$log" 2>&1; echo "exit $?"; grep -E '^# (tests|fail) |^ci:' "$log"`;
`git grep -n craft-observer -- adapters engine` → no output.

### Commit

`feat(copilot): enforce the preToolUse guard verdict`

## Checkpoint — orchestrator live probe (not a part)

After Part 10's commit and before Part 11 starts, the orchestrator runs the design's live probe
(§Test strategy "Live probe", rows L1–L9: BYOK fake SSE provider, throwaway HOME / XDG_CONFIG_HOME
/ COPILOT_HOME, `env -i`, a local bare remote, mtime-find isolation proof) against the tree at
Part 10's commit, and writes the results to an out-of-repo file, `<probe-results-file>`. Part 11
is spawned only once that file exists and is handed its path. Sub-agents do not run the probe.

## Part 11 — Living docs (R7)

### Context

Edits `docs/contributing/specs/copilot-poc-record.md`, `docs/contributing/specs/gate.md`, `adapters/copilot/README.md`, `adapters/README.md`.

Input: the probe results file provided by the orchestrator, `<probe-results-file>` (path given in
the spawn brief; out of repo; never copy its absolute path into a doc). Read-only: design
§Context "Live evidence" (P1-P9), §Error semantics, §Residuals; ADR-578, 585, 586, 588;
docs/contributing/specs/codex-poc-record.md (the in-place re-probe precedent: version-tagged
rows, "was … " notes).

| Doc | Where | Change |
|---|---|---|
| docs/contributing/specs/copilot-poc-record.md | Verdict (L28-33); row 11 (L52); row 20 (L61); D5 (L71) | amend in place with version tags: row 11 and D5 `(1.0.63; superseded 1.0.92)` + the 1.0.92 facts (object `toolArgs`, JSON deny, exit-2 deny, crash denies, `{"permission":"deny"}` still ignored, timeout fails open) and the L1-L9 results; row 20 stays the shipped prefix layer, note it is now a second layer |
| docs/contributing/specs/gate.md | §Copilot binding (L122-170) | layer table: the hook row becomes enforcing (adapters/copilot/hooks/craft-guard.js, `copilotGuard` = destructive predicate then `toolCallGuard`); delete the "carve-out" paragraph (ext-diff is enforced now); deny/crash channel per ADR-585; residual list from design §Residuals (incl. the intended false blocks, and DC-P1's choice); `--deny-tool` as floor on older copilot (ADR-588) |
| adapters/copilot/README.md | §Guard (L46-55) | three layers, all enforcing on ≥1.0.92; hook path renamed; users re-merge config.template.json (ADR-586); timeout fails open |
| adapters/README.md | copilot row (L33) | "path containment + `--deny-tool` + an enforcing `preToolUse` guard" |

Constraints: no BACKLOG.md edit; the probe's results are stated as measured (a row that did not
behave as the design expected is written as observed, and reported in the handback — if L4 shows
a different `create`/`edit` `toolArgs` shape or L8 a non-`bash` shell tool, stop: blocker protocol,
because that is a code gap, not a doc fix). adapters/copilot/test/native-surface.test.js pins the
README's Load section only — leave it intact.

### TDD steps

1. GUARD — docs-only part, no `src/` delta: native-surface README pins, intention-lint (living
   corpus subjects), adr-lint (no superseded ADR-243 claim left un-propagated) and prose-lint all
   run in ci.sh and pass before and after the edit.
2. Edit each doc per the table; cross-check every stated fact against `<probe-results-file>` or
   the design's pinned tables (no fact without a source).
3. REFACTOR — `git grep -n "cannot deny\|observational\|craft-observer" -- docs/contributing/specs adapters`
   returns only historical, version-tagged sentences.

### Gate

`log=$(mktemp) && bash scripts/ci.sh > "$log" 2>&1; echo "exit $?"; grep -E '^# (tests|fail) |^ci:|intention|adr-lint|prose' "$log"`.

### Commit

`docs(copilot): record the 1.0.92 hook deny and the normalised git guard`

## Validation-phase notes

- Mutation: the new engine/src/guards files fall under `mutate`'s `engine/src/**/*.js`; their
  covering tests are engine/test/guards/*.test.js (in the dry run through the extglob);
  adapters/copilot/src/git-guard-adapter.js is covered by git-guard-adapter.test.js only. Use the
  per-hunk scope from .claude/workflow.md (ONE comma-joined `--mutate`). Hand-verify every
  survivor against its full covering set; mark a proven-equivalent one with the
  `// equivalent mutant (…)` comment convention.
- The differential fuzz is the review-cycle-1 oracle for the hand-rolled grammar: run it before
  the review and attach its diagnostics (generated / invoked / false blocks per class).
