# Design — copilot-git-argv-normalising-guard

> Brief: two folded backlog entries. (1) Copilot's `--deny-tool` matches destructive git by string
> prefix, so `git -C . push`, `git --git-dir=.git push`, `git -c k=v push` and reordered flags get
> through. Build a layer that normalises git's argv before the guard decides, reusing the shared
> guard family in `engine/src/guards/`. (2) `gitExtDiffPredicate` misses a `git diff`/`show` hidden
> behind a backslash escape, a subshell, a group, a prefix word or an assignment. Both need one
> shell-segment splitter, one prefix stripper and one git global-option normaliser, designed as one
> module in `engine/src/guards/`.
> Status: draft → self-reviewed ×3.

## Context

### What exists

| Surface | File | Today |
|---|---|---|
| Shared predicate | `engine/src/guards/tool-call-guard.js` (45 lines) | `toolCallGuard({ tool, tool_input, working_dir })`. `Bash` → `guardBashCommand` (L32) → `gitExtDiffPredicate`. `Write`/`Edit`/`NotebookEdit` → `guardWritePath` (L36). Exports `WRITE_TOOLS` (L6). **No destructive-git judgement.** |
| ext-diff predicate | `engine/src/guards/git-ext-diff-predicate.js` (97 lines) | Exports `COMPLIANT_MARKERS` (L2), `GIT_DIFF_SHOW_RE` (L13), `gitExtDiffPredicate` (L85). Private `splitSegments` (L35: a quote-aware splitter on `; \| & \n` with no backslash handling) and `segmentIsCompliant` (L64: a substring marker check after a comment strip). |
| Importers of `toolCallGuard` | pi `adapters/pi/src/tool-call-hook.js`, copilot `adapters/copilot/src/git-guard-adapter.js`, codex `adapters/codex/src/git-guard-adapter.js`, cursor `adapters/cursor/src/cursor-guard-adapter.js`, antigravity `adapters/antigravity/src/antigravity-guard-adapter.js` | Each re-expresses its event shape and applies the predicate unmodified (ADR-223, ADR-232, ADR-256). |
| opencode | `adapters/opencode/src/git-guard-predicate.js` (2 lines) | Re-exports `COMPLIANT_MARKERS`, `GIT_DIFF_SHOW_RE` and `gitExtDiffPredicate as gitGuardPredicate` from the engine. Not a copy, so no parity test is needed. Tests import only `gitGuardPredicate`. |
| Copilot command policy | `adapters/copilot/src/deny-tool-args.js` | `DENY_TOOL_PATTERNS` (L28, 10 literal `shell(...)` prefixes), `buildLaunchArgs({ workingDir })` (L60). |
| Copilot hook | `adapters/copilot/hooks/craft-observer.js` + `adapters/copilot/src/git-guard-adapter.js` | Audit only: always exits 0 and writes the verdict to stderr. Its header says the hook cannot deny. `parseToolArgs` (L30) runs `JSON.parse(toolArgs)`. `decideGuard` (L82) fails closed on a throw. |
| Copilot config | `adapters/copilot/config.template.json` | `hooks.preToolUse: [{ command: "node <CRAFT_ROOT>/adapters/copilot/hooks/craft-observer.js" }]`, no `timeoutSec`. |
| Codex | `adapters/codex/src/execpolicy-rules.js` | `FORBIDDEN_GIT_SUBCOMMANDS = push, clean, reset` as a `prefix_rule` over argv. Its disclosure names the same `-C`/`--git-dir`/`bash -lc` bypass. The codex hook enforces `toolCallGuard` only. |
| Claude | `hooks/git-no-ext-diff.sh` | A separate bash matcher, `GIT_RE='(^\|[;&\|]\s*)git(\s+(-C…\|-c…\|--git-dir=…\|--work-tree=…))*\s+(diff\|show)(\s\|$)'`. It does not use the JS predicate. |

### ADRs that constrain this design

- **ADR-243.** Copilot's guard has three layers: containment and `--deny-tool` enforce, the hook is
  advisory. Its last consequence: *"If Copilot later ships a working deny schema (D5), promoting the
  audit layer to enforcing is additive."* The 1.0.92 probe below is that event.
- **ADR-223, ADR-232, ADR-256.** One predicate in `engine/src/guards/`. Each binding re-expresses only
  its event adapter.
- **ADR-255.** The codex hook enforces through exit 2. **ADR-518…521**: the codex guard has no static
  import, registers its crash handlers first, denies on any crash and on no verdict, and its crash
  paths are pinned by throwaway-tree fixtures.
- **ADR-533…541.** Claude's git-hook crash contract: deny on a crash through exit 2, deny when no
  verdict is reached, and record signal deaths as a residual. This design uses the same
  vocabulary.

### Live evidence: copilot 1.0.92 (live probe 2026-10-15)

Method: a BYOK fake SSE provider, zero credentials, a throwaway HOME/XDG_CONFIG_HOME/COPILOT_HOME, a
local bare remote, and ground truth taken from the remote ref. Isolation was checked by an mtime-find
on `~/.copilot` and `~/.config`.

| # | Hook / setup | Command | Ground truth |
|---|---|---|---|
| P1 | none | `git push origin main` | ref MOVED |
| P2 | stdout `{"permissionDecision":"deny","permissionDecisionReason":"probe deny"}`, exit 0 | `git -C . push origin main` | NOT moved. The model sees `Denied by preToolUse hook: probe deny` |
| P3 | exit 2, stderr text | same | NOT moved. The error reads only `hook exited with code 2` |
| P4 | exit 1, no output (crash) | same | NOT moved. **Fails closed** |
| P5 | exit 0, no output | same | MOVED (the allow direction works) |
| P6 | P2, with the config entry in the shipped `{command}`-only template shape | same | NOT moved |
| P7 | stdout `{"permission":"deny"}` (the 1.0.63 key) | same | MOVED. The key is not honoured |
| P8 | hook hangs past `timeoutSec: 3` | same | MOVED. **A timeout fails OPEN** |
| P9 | no hook; a PATH-first `git` shim | `git -C . tag via-shim` | The shim is reached by the bash tool |

Other facts from the same probe:

- The 1.0.92 payload is
  `{"sessionId","timestamp","cwd","toolName":"bash","toolArgs":{"command":…,"description":…,"mode":"sync","initial_wait":20}}`,
  so **`toolArgs` is an object**. `parseToolArgs`' `JSON.parse(object)` throws, so `decideGuard`
  returns `{ block: true }` for every call. That is harmless only while the hook is audit-only.
- Copilot runs its own git through the same PATH: `git --version`,
  `git --no-optional-locks -C <dir> -c core.fsmonitor=false remote -v`, and
  `git --no-optional-locks -c core.fsmonitor=false rev-parse origin/HEAD`.
- PoC row 11 ("deny not achieved") and D5 are superseded on 1.0.92. Row 20 (prefix matching) was not
  re-probed and still describes the shipped layer.

## Requirements

- **R1.** One module in `engine/src/guards/` turns a bash command string into the git invocations it
  runs. It does the shell tokenising and splitting, strips command prefixes and normalises git's
  global options. Both git predicates consume it, and neither keeps its own splitter or anchor regex.
- **R2.** `gitExtDiffPredicate` blocks every non-compliant `diff`/`show` invocation in the matrix
  below (§Pinned A) whose class is not listed as a residual. It still passes every command on the
  existing PASS lists (`engine/test/tool-call-guard.test.js` L222+,
  `adapters/{copilot,codex,opencode}/test/git-guard-predicate.test.js`).
- **R3.** A new destructive-git predicate blocks every spelling in §Pinned D that real git executes
  destructively. That includes every literal in `DENY_TOOL_PATTERNS`, with any interposed global
  option from §Pinned C. It passes Copilot's own internal git calls (P9 facts) and craft's routine
  git (`status`, `add`, `commit`, `log`, `diff --no-ext-diff`, `worktree`, `rev-parse`, `branch -d`
  of a merged branch).
- **R4.** A command the module cannot tokenise is a deny, never an allow: an unterminated quote, an
  unterminated `$(`/backtick/`${`, or nesting past the depth cap. The predicates block it with a
  reason that names the parse failure (pinned: `git push\necho "x` runs the push before bash reports
  the syntax error, so a parse failure is not harmless).
- **R5.** The Copilot adapter accepts `toolArgs` as an object (1.0.92) or as a JSON-encoded string
  (1.0.63). Any other shape fails closed.
- **R6.** On Copilot the `preToolUse` hook enforces: a block verdict denies, an allow verdict
  executes, and a crash or a run with no verdict denies. `--deny-tool` and native containment stay as
  layers.
- **R7.** The living docs tell the truth after the change: `docs/contributing/specs/copilot-poc-record.md`
  rows 11, 20 and D5, the Copilot section of `docs/contributing/specs/gate.md`,
  `adapters/copilot/README.md` §Guard, `adapters/README.md` (copilot row), the header of
  `deny-tool-args.js` (L1-26), and the two `BACKLOG.md` entries (L216, L1081). Every residual in
  §Residuals is written down in them.
- **R8.** No new npm dependency (`engine/package.json` has only `js-yaml`, and there is no shell
  tokeniser in the tree).

## Design

### Pinned A — current predicate vs what bash runs (ext-diff)

Run in a mktemp throwaway. `/bin/bash -c "<cmd>"` (GNU bash 3.2.57, macOS) with a PATH-first stub
`git` that logs its argv. "Predicate" is `gitExtDiffPredicate(cmd).block` on the current tree.

| Command | bash runs `git diff`? | Predicate today | Class |
|---|---|---|---|
| `echo \"; git diff` · `echo \'; git diff` | yes | false | backslash escape (BACKLOG L216) |
| `echo $'a\'b'; git diff` | yes | false | ANSI-C quote `$'…'` |
| `cat <<EOF⏎it's⏎EOF⏎git diff` | yes | false | heredoc body read as a quote |
| `(git diff)` · `true && (git diff)` · `{ git diff; }` · `! git diff` · `time git diff` | yes | false | shell grammar before `git` |
| `if true; then git diff; fi` · `case x in x) git diff;; esac` · `f(){ git diff; }; f` | yes | false | reserved words / function body |
| `FOO=1 git diff` · `x=$((1+2)) git diff` | yes | false | assignment prefix |
| `env git diff` · `command git diff` · `exec git diff` · `nohup git diff` · `echo x \| xargs git diff` | yes | false | wrapper word |
| `"git" diff` · `'git' diff` · `g\it diff` · `git "diff"` · `git di""ff` | yes | false | quote removal |
| `/usr/bin/git diff` | yes (real git, by construction; the stub is bypassed) | false | path-qualified git |
| `git --no-pager diff` · `git -p diff` · `git --git-dir .git diff` · `git --no-optional-locks diff` | yes | false | global option missing from `GIT_DIFF_SHOW_RE` |
| `$(git diff)` · `` `git diff` `` · `cat <(git diff)` · `cat <<EOF⏎$(git diff)⏎EOF` | yes | false | substitution (documented residual today) |
| `bash -c 'git diff'` · `sh -c "git diff"` · `eval git diff` · `env -S "git diff"` | yes | false | string evaluated as a command |
| `G=git; $G diff` | yes | false | dynamic head (covered by the design) |
| `git${IFS}diff` | yes | false | word-splitting inside the command word (**residual** under this design) |
| `git -c alias.d=diff d` | yes (alias expansion, pinned below) | false | inline alias |
| `cat <<'EOF'⏎$(git push)⏎EOF` | **no** (quoted heredoc is data) | — | must stay an allow |
| `cat <<EOF⏎body⏎git push` (unterminated) | **no** (body runs to EOF) | — | must stay an allow |

`hooks/git-no-ext-diff.sh` (Claude), fed the same payloads read-only: it allows `(git diff)`,
`FOO=1 git diff`, `env/command/!/time git diff`, `{ git diff; }`, `true && (git diff)`,
`git --no-pager diff`, `git -p diff` and `git --git-dir .git diff`. It denies `echo \"; git diff`,
because `GIT_RE` anchors on `[;&|]` and tracks no quote state. Changing it is out of scope (see Out of scope).

### Pinned C — git 2.54.0 (Apple Git-157) global-option parsing

Each row ran `GIT_TRACE=1 /usr/bin/git <opts>` in a throwaway repo with an empty HOME and
`GIT_CONFIG_NOSYSTEM=1`. The "Resolves to" column is the trace's `built-in:` line.

| Spelling | Resolves to |
|---|---|
| `-C . push` · `-c k.v=1 push` · `--git-dir=.git push` · `--git-dir .git push` · `--work-tree[= ]. push` · `--namespace[= ]x push` · `--config-env[= ]k.v=HOME push` · `--attr-source[= ]HEAD push` · `--exec-path=/x push` | `git push` |
| `--no-pager` · `-p` · `--paginate` · `-P` · `--no-optional-locks` · `--literal-pathspecs` · `--glob-pathspecs` · `--noglob-pathspecs` · `--icase-pathspecs` · `--no-replace-objects` · `--no-lazy-fetch` · `--no-advice`, each `… push` | `git push` |
| `--bare push` | the bare flag is applied, then push runs (here: `not a git repository`) |
| `-C. push` · `-ck.v=1 push` · `--frobnicate push` · `--super-prefix=x/ push` · `-- push` · `--end-of-options push` | **refused** (`unknown option`), nothing runs |
| `-v push` · `--version push` | `git version push` |
| `-h push` | `git help push` |
| `--exec-path push` · `--html-path push` · `--man-path push` · `--info-path push` · `--list-cmds=builtins push` | print and exit, no subcommand |
| `-C` · `--git-dir` (value missing) | usage, nothing runs |
| `-c alias.p=push p` | `alias expansion: p => push` |
| `-c alias.p=!true p` | `run_command: true` (a shell alias runs a program) |

### Pinned D — destructive verb semantics (git 2.54.0, throwaway repo)

| Verb | Destroys | Does not destroy |
|---|---|---|
| clean (untracked file) | `-f`, `-fd`, `-df`, `-xdf`, `-fx`, `--force`, **`-c clean.requireForce=false clean`** (no `-f`), `… clean -d` | `-d` (requireForce refuses), `-n -f`, `-f -n`, `-i` (no stdin) |
| branch (unmerged `x`) | `-D`, `-df`, `-fd`, `--delete --force`, `-d -f`, `-M x y` (rename away) | `-d`, `--delete`, `-dfr`/`-Dr` (remote-tracking; no such ref here) |
| reset (dirty worktree) | `--hard`, `--hard HEAD`, `HEAD --hard`, `-q --hard` | `--keep`, `--merge`, plain `reset` |
| outside the shipped set | `checkout -f`, `checkout .`, `restore .` lose worktree edits | `stash drop` (with no stash) |

### Module: `engine/src/guards/shell-git-invocations.js`

One module with three exported seams. Each is tested directly. Every constant is named and frozen.

```js
/** @typedef {{ text: string, dynamic: boolean }} ShellWord   // text after quote removal; dynamic = an unquoted $…, ${…}, $(…) or `…` contributed to it
 *  @typedef {{ words: ShellWord[] }} SimpleCommand
 *  @typedef {{ parsed: true, commands: SimpleCommand[] } | { parsed: false, reason: string }} ParseResult */
export function parseShellCommands(command)            // tokenise + split + recurse into nested bodies → flattened SimpleCommands

/** @typedef {{ kind: 'subcommand', subcommand: string, args: string[], configKeys: string[] }
 *         | { kind: 'refused', option: string, rest: string[] }      // git itself refuses (Pinned C)
 *         | { kind: 'indeterminate', rest: string[] }                // a dynamic word where git expects an option or the subcommand
 *         | { kind: 'no-subcommand' }} GitInvocation */
export function normaliseGitArgv(words)                // words AFTER the git word; string[] or ShellWord[]

/** @returns {{ parsed: true, invocations: GitInvocation[] } | { parsed: false, reason: string }} */
export function gitInvocations(command)                // parse → anchor → normalise
```

**Tokeniser (`parseShellCommands`).** This is a character state machine. It does not split by regex.

| Construct | Rule |
|---|---|
| `\x` outside quotes | the literal `x`. `\⏎` is a line continuation and is removed |
| `'…'` | literal up to the next `'` |
| `$'…'` | ANSI-C quoting: `\x` is literal, and the quote ends at an unescaped `'` |
| `"…"` | `\` escapes only `$ \` `` ` `` `"` and newline. `$(`, backtick and `${` still nest inside |
| `#` at the start of a word | a comment up to the newline |
| `;` `&` `\|` `&&` `\|\|` `;;` `\|&` newline `(` `)` | command break |
| `{` `}` `!` `time` `time -p` `if` `then` `elif` `else` `fi` `do` `done` `while` `until` `case` `esac` `coproc`, and a `NAME=value` word in command position | dropped from the head of a simple command |
| redirection `[n]<` `>` `>>` `<&` `>&` `&>` `<>` `>\|` + target | dropped (a target may hold a substitution, which is parsed first) |
| `<<` / `<<-` DELIM | the body is the following lines up to a line equal to DELIM (`<<-` strips leading tabs), or to EOF (pinned: an unterminated body is data). A **quoted** DELIM body is data. An **unquoted** body is scanned only for `$(…)`/backticks |
| `<<<` word | data, but substitutions inside it are parsed |
| `$(…)` · `` `…` `` · `<(…)` · `>(…)` | the body is parsed recursively and its SimpleCommands are appended. The word is marked `dynamic` |
| `$((…))` | skipped (balanced parentheses). The word is marked `dynamic`. Arithmetic is not parsed for nesting (residual) |
| `${…}` · `$NAME` · `$1` · `$@` … | the word is marked `dynamic` |
| unterminated quote / `$(` / backtick / `${` | `{ parsed: false, reason }` |
| nesting depth > `MAX_NESTING_DEPTH` (named constant, 8) | `{ parsed: false, reason }` |

**Re-parsed string arguments.** These are matched at any word position, so a wrapper in front does
not hide them:

- a word whose basename is in `{sh, bash, zsh, dash, ksh}`, followed by option words of which one is
  a short cluster containing `c` (`-c`, `-lc`, `-ec`): the next non-option word is parsed as a
  command;
- `eval`: its following words, joined with a space, are parsed as a command;
- `env -S <s>` / `--split-string[=]<s>`: `<s>` is parsed as a command.

**Anchoring (`gitInvocations`).** A git invocation starts at **any** word of a simple command that is
not dynamic and whose basename after the last `/` is exactly `git`. It also starts at a **dynamic
head**: the first word left after the head is stripped, when that word is dynamic (`$G push`,
`"$(which git)" push`), and normalisation then runs on the words after it. Because the anchor is any
word, wrappers need no list (`env`, `command`, `exec`, `nohup`, `nice`, `timeout`, `xargs`, `sudo`,
`find -exec`, `/usr/bin/git`). DC-4 weighs this against a closed prefix list.

**Normaliser (`normaliseGitArgv`).** It walks the words with a table taken from §Pinned C:

- a value-taking option (`-C`, `-c`, `--git-dir`, `--work-tree`, `--namespace`, `--config-env`,
  `--attr-source`) consumes the next word, or carries its `=value`. A missing value gives
  `no-subcommand`;
- `--exec-path=<p>` is skipped;
- a flag from the flag set is skipped;
- `-v`/`--version` gives subcommand `version`, and `-h`/`--help` gives subcommand `help`;
- a print-and-exit option gives `no-subcommand`;
- any other `-…` word gives `refused`;
- a dynamic word gives `indeterminate`;
- otherwise the word is the subcommand, and the remaining words are `args`.

`configKeys` holds the lowercased keys from `-c k=v` and `--config-env k=E`, so the predicates can
see an inline `alias.*` or a `clean.requireforce`.

### Predicates

**`gitExtDiffPredicate(command)`** (same file, same export, rewritten on top of `gitInvocations`):

- not parsed → `{ block: true, reason: REASON_UNPARSEABLE }`;
- a `subcommand` invocation whose subcommand is `diff`/`show` and whose `args` contain no word equal
  to `--no-ext-diff` → block with the current `REASON_GIT_EXT_DIFF`, unless the enclosing simple
  command starts with the words `rtk proxy` (the existing marker, now matched by word);
- `indeterminate` whose `rest` contains `diff`/`show` and no `--no-ext-diff` → block;
- `refused` → allow (pinned: git runs nothing; keeps the existing PASS `git --no-ext-diff show HEAD`);
- an inline `alias.*` config key → handled per DC-3.

`COMPLIANT_MARKERS` stays exported, holding the same two values with word semantics.
`GIT_DIFF_SHOW_RE` goes, per DC-7.

**`gitDestructivePredicate(command)`** (new file `engine/src/guards/git-destructive-predicate.js`):

| Subcommand | Blocks when (option words before `--`) |
|---|---|
| `push` | always |
| `reset` | `--hard` is present |
| `clean` | per DC-5: (recommended) no `-n`/`--dry-run`, where a short cluster containing `n` counts as dry-run |
| `branch` | `-D`, or a cluster containing `D`; or (`-d`/`--delete`/a cluster containing `d`) together with (`-f`/`--force`/a cluster containing `f`) |
| `refused` / `indeterminate` | `rest` contains one of `push`, `reset`, `clean`, `branch` → block (fail-closed against a future git option, or against `$OPTS`) |
| inline `alias.*` key | block (DC-3 recommended) |
| not parsed | block, `REASON_UNPARSEABLE` |

Reasons are fixed named constants, for example
`craft: destructive git (push) is denied in this binding — run it outside the agent`.

### Copilot binding

- **`adapters/copilot/src/git-guard-adapter.js`.** `parseToolArgs` accepts a plain object (not an
  array) as is. It accepts a string by `JSON.parse` followed by the same plain-object check. Anything
  else throws, and `decideGuard` turns the throw into a fail-closed block. A new export
  `copilotGuard(event)` runs `gitDestructivePredicate(tool_input.command)` first for `Bash`, then
  `toolCallGuard(event)`, and returns the first block. `decideGuard`'s default guard becomes
  `copilotGuard`.
- **Hook (DC-1, DC-2).** `adapters/copilot/hooks/craft-guard.js` (renamed per DC-6) mirrors the
  codex guard's crash contract: no static import, handlers registered first, then
  `await import()` inside `try`, and `uncaughtException`/`unhandledRejection`/`beforeExit` all deny.
  - A block writes `{"permissionDecision":"deny","permissionDecisionReason":<reason>}` on stdout and
    exits 0 in the write callback, so a pipe can never truncate the JSON (P2/P6, and the reason
    reaches the model).
  - A crash or a run with no verdict exits 2 with a `craft-guard:` stderr line (P3/P4).
  - An allow exits 0 with nothing on stdout (P5).
  - The `buildAuditEntry` line stays on stderr for both verdicts.
- **`config.template.json`.** The command points at the renamed hook. `timeoutSec` stays unset
  unless the plan's probe (L7) pins a default short enough to matter.
- **`DENY_TOOL_PATTERNS`** stays as is, as a second layer and as the floor for a Copilot older than
  the hook's deny support (DC-8). Its header comment is rewritten so it no longer claims the hook
  cannot deny.

### Error semantics

| Situation | ext-diff | destructive | Copilot hook |
|---|---|---|---|
| unparseable command | block | block | deny (JSON) |
| `toolArgs` neither an object nor an object-encoding string | — | — | fail-closed block → deny (JSON) |
| guard throws, import fails, or the loop drains with no verdict | — | — | exit 2 + stderr |
| hook exceeds `timeoutSec` | — | — | **fails open** (P8). Residual |
| hook file missing | — | — | node exits 1 on a missing script (pinned locally, node 22.22.3), and exit 1 denies (P4). Fails closed |
| `node` missing from PATH (127), SIGKILL | — | — | unpinned. Residual until probe L6 pins them |

### Residuals (written into the docs per R7)

- Git run from a file or a tool the command names indirectly: scripts, `make`, `npm run`, a heredoc
  written to a file and run later, `watch`, `ssh host '…'`, `su -c`, `script -c`, `parallel`,
  `git rebase --exec`, and aliases from the user's gitconfig.
- State across tool calls, if Copilot's bash tool is a persistent session (a function or alias
  defined in one call and used in the next). This is unpinned. Probe L9 settles it.
- A dynamic string passed to an evaluator (`bash -c "$CMD"`, `eval "$X"`), and word-splitting inside
  the command word (`git${IFS}diff`). The text that runs is not in the command string.
- `$((…))` bodies, and other shell syntax not listed in the tokeniser table (for example `[[ … ]]`
  holding a `$(…)` is covered, but `case` patterns are only split, not understood).
- A hook timeout fails open (P8). A signal death is unpinned.
- Destructive verbs outside the shipped set (`checkout -f`/`.`, `restore`, `branch -M`,
  `update-ref -d`, `filter-branch`, `send-pack`), unless DC-5 widens the set.
- The intended false blocks (under DC-4 (a)):
  - any-word anchoring: `echo git push`, `git log --grep git show`, or a path ending `/git` followed
    by a verb word (`ls /x/git push`);
  - a dynamic head followed by a verb word: `$HOME/bin/deploy push`.

  Each costs one re-issue.

### Parts (pre-chewed context)

**Part 1. `engine/src/guards/shell-git-invocations.js` + `engine/test/guards/shell-git-invocations.test.js`.**
New files. The test style follows `engine/test/guards/git-ext-diff-predicate.test.js`:
`node:test` `describe`/`it`, Given/When/Then titles, `const sut = …`, table-driven
`for (const command of …)` cases. The fixtures are §Pinned A/C rows (as the expected
`SimpleCommand`/`GitInvocation`). Stryker picks it up automatically (`engine/src/**/*.js`,
`engine/test/**/*.test.js` in `engine/stryker.conf.json`). Keep the `// equivalent mutant (…)`
comment convention for any proven-equivalent survivor.

**Part 2. Rewrite `gitExtDiffPredicate` over Part 1.** `engine/src/guards/git-ext-diff-predicate.js`:
delete `splitSegments` (L35-58), `segmentIsCompliant` (L64-73), `SEGMENT_SEPARATORS` (L27) and
`OPTION_VALUE`/`GIT_DIFF_SHOW_RE` (L7-15, per DC-7). Keep the signature
`gitExtDiffPredicate(command) → { block, reason? }`. Update
`adapters/opencode/src/git-guard-predicate.js` L1 (drop the `GIT_DIFF_SHOW_RE` re-export). Tests:
extend `engine/test/guards/git-ext-diff-predicate.test.js` with §Pinned A as BLOCK rows. Keep the quoted-heredoc and unterminated-heredoc
rows as `block: false`. Pin `git${IFS}diff` as a residual `block: false` row. The substitution
class that the deleted L22-26 comment called a residual is now a BLOCK (no current test pins it).
The existing PASS lists in `engine/test/tool-call-guard.test.js` and
`adapters/{copilot,codex,opencode}/test/git-guard-predicate.test.js` must stay green unchanged.

**Part 3. `engine/src/guards/git-destructive-predicate.js` + `engine/test/guards/git-destructive-predicate.test.js`.**
Signature `gitDestructivePredicate(command) → { block, reason? }`. Fixtures:
- §Pinned D;
- each `DENY_TOOL_PATTERNS` literal stripped of `shell(…)`, crossed with the §Pinned C
  interposed-option spellings, to give a parity test that imports
  `adapters/copilot/src/deny-tool-args.js`;
- the P9 internal calls and craft's routine git as `block: false`.

**Part 4. The Copilot adapter.** In `adapters/copilot/src/git-guard-adapter.js`: change
`parseToolArgs` (L30-36), add `copilotGuard`, repoint `decideGuard` (L82)'s default, and update the
`adaptCopilotEvent` JSDoc type (`toolArgs: string|object`). Tests:
`adapters/copilot/test/git-guard-adapter.test.js`. The `payload()` helper (L11) gains an
object-shaped twin. The `describe('decideGuard() — fail-closed toolArgs parsing')` (L192) rows are
re-expressed for both shapes, with an array and a number added as fail-closed rows.
`adapters/copilot/test/git-guard-predicate.test.js` gains destructive BLOCK rows.

**Part 5. The Copilot enforcing hook.** Rename `adapters/copilot/hooks/craft-observer.js` to
`craft-guard.js` (DC-6). The template is `adapters/codex/hooks/craft-guard.js`, with the deny
channel changed per DC-2. Repoint:
- `adapters/copilot/config.template.json`;
- `adapters/copilot/test/config.test.js` L58-63;
- `adapters/copilot/test/craft-root.test.js` L55;
- `adapters/copilot/test/git-guard-adapter.test.js` L295-350 (the structure scans);
- the `adapters/copilot/src/craft-root.js` L14 comment.

Crash fixtures follow ADR-521 (`adapters/codex/test/craft-guard-hook.test.js`): copy `hooks/` +
`src/` into a mktemp root, break one piece, spawn under `process.execPath`, and assert exit 2 plus a
`craft-guard:` stderr line. Verdict fixtures spawn the real hook with an object-shaped payload and
assert the stdout JSON for a block and an empty stdout for an allow.

**Part 6. The differential fuzz** (Test strategy). Its location is set by DC-9.

**Part 7. Docs (R7).**
- `docs/contributing/specs/copilot-poc-record.md`: rows 11, 20, D5 and the verdict paragraph,
  amended in place with version tags (`(1.0.63; superseded 1.0.92)`), following the
  `codex-poc-record.md` re-probe precedent.
- `docs/contributing/specs/gate.md` §Copilot binding (L122-170): the layer table, the
  "carve-out" paragraph (ext-diff becomes enforced), and the residual list.
- `adapters/copilot/README.md` §Guard (L46-55) and the `adapters/README.md` copilot row (L33).
- The `adapters/copilot/src/deny-tool-args.js` header (L1-26).
- `BACKLOG.md` L216 and L1081: closed.

## Decision candidates

| # | Choice | Alternatives (≤3) | Recommendation | Why |
|---|---|---|---|---|
| DC-1 | Where Copilot enforces destructive git | (a) promote the `preToolUse` hook to enforcing; `--deny-tool` stays as a second layer · (b) a PATH-first `git` shim that judges the real argv · (c) both, layered | **(a)** | The deny is live-proven (P2-P6), and the reason reaches the model (P2). ADR-243 already names this promotion as additive. (b) sees the true argv, so it needs no shell parsing and catches scripts, `make` and cross-call state. But it is bypassed by `/usr/bin/git` (an absolute path skips PATH by construction), and by `command -p git push` and `bash -lc "git push"` (pinned: both reached the real git, not the stub). The binding has no launcher process to set PATH, so the user would add a manual step. The shim must pass Copilot's internal git calls (P9) and costs a node start on every git call, craft's own included. (c) adds the shim's install burden for the script/cross-call residual; it could follow if probe L9 shows a persistent shell. |
| DC-2 | Hook deny channel | (a) block → stdout JSON `permissionDecision:"deny"` + exit 0; crash → exit 2 · (b) exit 2 + stderr for everything · (c) JSON + exit 2 together | **(a)** | Only the JSON path surfaced the reason to the model (P2 vs P3: `hook exited with code 2`). The ext-diff deny depends on that reason so the agent re-issues with `--no-ext-diff`. Exit 2 is the crash floor that needs no stdout (P3/P4). (c) was never probed. |
| DC-3 | Inline git aliases (`-c alias.x=…`, `--config-env alias.x=…`) | (a) any inline `alias.*` key blocks in both predicates · (b) resolve the inline alias value and judge the expansion (a `!` value blocks) · (c) documented residual | **(a)** | Pinned: `-c alias.p=push p` expands to push, and `alias.p=!cmd` runs a program. Agents have no routine reason to define inline aliases, so (a) closes the bypass at near-zero false-block cost. (b) is more code for no practical gain. Aliases in the user's gitconfig stay a residual whatever is chosen. |
| DC-4 | Git anchor: where an invocation may start | (a) any non-dynamic word with basename `git`, plus a dynamic head, for both predicates · (b) only the command word after a closed prefix list (`{ ( ! time env command exec nohup xargs NAME=v` …), with `sudo`/`find -exec`/`timeout` pinned as `block:false` residuals · (c) (b) for ext-diff, (a) for destructive | **(a)** | One code path with no wrapper option grammars to model: `env -u N`, `xargs -I {}`, `nice -n 5` and `sudo -u x` each take values a closed list would have to parse. It closes the wrapper class outright. The cost is the false blocks `echo git diff` and `git log --grep git show`, which are pinned as intended. (c) keeps ext-diff narrower but splits the semantics the backlog asked to unify. |
| DC-5 | Destructive verb set and `clean` rule | (a) the shipped verbs judged on normalised argv: `push`; `reset --hard`; forced `branch` delete; `clean` blocked unless it carries `-n`/`--dry-run` · (b) (a), with `clean` blocked only on a force flag or an inline `clean.requireForce` key · (c) (a) plus `checkout -f`/`checkout .`/`restore`/`branch -M`/`-C`/`update-ref -d`/`filter-branch` | **(a)** | Pinned: `-c clean.requireForce=false clean` deletes with no `-f`, and so does the same key set in the user's gitconfig, which no hook can see. A non-dry-run `clean` without force fails harmlessly under the default config, so blocking it costs nothing. (c) blocks routine "revert my edit" operations (`checkout .`, `restore .`) that craft agents use, which changes the binding's posture beyond the brief. |
| DC-6 | Hook file name | (a) rename `craft-observer.js` → `craft-guard.js` (matches codex/cursor/antigravity) · (b) keep the name and change the contents | **(a)** | The name has to say it enforces. On 1.0.92 a stale config still pointing at the old path crashes the hook, which fails closed (P4: exit 1 denied). The break is loud and is fixed by re-merging the template. |
| DC-7 | `GIT_DIFF_SHOW_RE` export | (a) delete it from the engine and from the opencode re-export · (b) keep it exported, unused | **(a)** | Nothing in the tree reads it except the opencode re-export: no test imports it (grep). (b) is dead code. |
| DC-8 | Copilot version floor for hook enforcement | (a) no version gate. `--deny-tool` stays as the floor, and the docs say the deny is proven on 1.0.92 while 1.0.63's exit 2 did not deny · (b) the acceptance probe refuses a `copilotVersion` below 1.0.92 · (c) drop `--deny-tool` once the hook enforces | **(a)** | The versions between 1.0.63 and 1.0.92 are unpinned, so a gate at 1.0.92 would be invented precision. The prefix layer costs nothing and covers the canonical spellings on any version. (c) removes the only layer known to work on older binaries. |
| DC-9 | Where the differential fuzz lives | (a) `engine/test/guards/*.differential.test.js`, excluded from Stryker's `tap.testFiles` (the plan pins whether a negated glob works there) · (b) under `adapters/copilot/test/` (runs in CI through `scripts/ci.sh` L54 and is not in Stryker's list) · (c) a review-time script, not committed | **(a)** | It guards the shared engine module, so it belongs with it. Stryker's dry run executes every listed test file per run, so thousands of bash spawns per mutant must not join its corpus. If the negated glob is refused, fall back to (b). (c) loses the regression net that the codex trust-matcher fuzz precedent kept. |
| DC-10 | Destructive judging: shared guard or Copilot-only | (a) a separate `gitDestructivePredicate`, composed only by the Copilot adapter · (b) inside `toolCallGuard`, so pi/codex/cursor/antigravity all start denying destructive git · (c) (a), plus the codex adapter composes it too | **(a)** | Inside the brief's scope. Pi, cursor and antigravity have no destructive-git rule today and craft's `push` policy action (`engine/src/policy.js` L25) is user-configurable, so (b) changes three bindings' behaviour unasked. Codex already forbids `push`/`clean`/`reset` through a bypassable `.rules` layer, so (c) is a pure strengthening, but it is a separate change (Out of scope). |

## Test strategy

- **Unit (Parts 1-4).** These are table-driven and every row is a pinned fact.
  - Part 1 runs §Pinned A and §Pinned C to the expected `SimpleCommand`/`GitInvocation`, plus the
    tokeniser edges: `\⏎`, `$'…'`, nested `$(` inside `"…"`, a backtick inside `$(…)`, quoted vs
    unquoted heredoc delimiter, `<<-` tab stripping, an unterminated heredoc, depth cap at 8 vs 9,
    and an empty command.
  - Part 2 is the ext-diff BLOCK/PASS matrix. The existing PASS lists stay as-is (regression).
  - Part 3 is §Pinned D, the `DENY_TOOL_PATTERNS` × §Pinned C parity, and the P9 calls and craft
    routine git as passes.
  - Part 4 covers both `toolArgs` shapes, the hostile shapes, `copilotGuard` order (destructive
    reason wins), and the decoy test unchanged.
- **Hook process tests (Part 5).** Spawn the real hook under `process.execPath`:
  - a block → stdout is exactly one JSON line with `permissionDecision:"deny"` and a non-empty
    reason, exit 0;
  - an allow → empty stdout, exit 0;
  - ADR-521-style crash fixtures → exit 2 plus a `craft-guard:` stderr line, for an unresolvable
    import, a throwing stdin listener, no verdict, and a floating rejection.
- **Differential fuzz (Part 6). Mandatory at review cycle 1.** It differentially fuzzes the
  hand-rolled tokeniser and normaliser against bash itself. The shape follows
  `adapters/codex/test/hook-trust-differential.test.js` (fixed `SEED`, `CAP`, an accepted-count
  floor, `{ concurrency: true }`, a mktemp tree rooted at its realpath).
  - **Generator.** A seeded composition of: shell-grammar fragments (§Pinned A classes); separators;
    quote and escape styles; nesting (`$(…)`, backticks, `<(…)`, `bash -c`, `eval`, `env -S`) up to
    depth 3; §Pinned C global options; and verbs from §Pinned D plus `diff`/`show` with and without
    `--no-ext-diff`. Fragments are tagged residual or covered.
  - **Leg A: tokeniser and anchor vs bash.** Each command runs as `/bin/bash -c <cmd>` in a per-command run dir. A PATH-first
    stub `git` appends `printf '%s\0' "$#" "$@"` to `argv.log` and never runs real git. The ground
    truth applies `normaliseGitArgv` plus the verb rules to each logged argv, which is the argv-level
    judge with no shell parsing involved.
  - **Assertions.**
    - No covered command where the oracle saw a destructive or a non-compliant diff/show argv and
      the predicate allowed it. A false allow fails with the command printed.
    - Every `parsed:false` verdict falls on a command the generator tagged unterminated or
      over-nested. An unparseable verdict on any other shape is a tokeniser gap and fails the test.
    - False blocks are counted, and each must fall in a documented class. A new class fails.
    - Generator tags exclude the stub-blind shapes (`/usr/bin/git`, `command -p`, `bash -l`). Those
      are pinned by unit rows.
  - **Leg B: normaliser vs real git.** Leg A's ground truth reuses `normaliseGitArgv`, so it cannot
    catch a wrong option table. Leg B can. It draws random sequences of §Pinned C options, valid and
    invalid, then the harmless sentinel subcommand `rev-parse`. Each sequence runs under
    `GIT_TRACE=1 /usr/bin/git` in a throwaway repo with an empty HOME and `GIT_CONFIG_NOSYSTEM=1`.
    The test asserts that `normaliseGitArgv`'s `kind`/`subcommand` matches the trace:
    `built-in: git rev-parse` ⇒ subcommand; `unknown option` ⇒ refused; no trace ⇒ no-subcommand.
  - **Shells.** `/bin/bash` (3.2 on macOS) always. A bash ≥5 on PATH runs too when present, and is
    skipped with a logged reason when absent.
- **Live probe (specified for the plan; on demand, not CI; the user or orchestrator runs it).**
  - **Setup.** Copilot ≥ 1.0.92; a throwaway HOME, XDG_CONFIG_HOME and COPILOT_HOME; `env -i`; a BYOK
    fake SSE provider emitting one tool call per run; zero credentials. A work repo with a local bare
    remote. Ground truth comes from side effects: the remote ref, a file's presence, a tag's
    presence. Isolation is proven by an mtime-find on `~/.copilot` and `~/.config` against a
    pre-probe marker.
  - **Matrix**, each row in both directions:
    - **L1.** `git -C . push origin main` with the shipped hook: ref not moved, and the reason is
      visible.
    - **L2.** `git status`: executes.
    - **L3.** `git diff`: denied. `git diff --no-ext-diff`: executes.
    - **L4.** `create` in-tree executes and out-of-tree is denied. This pins the 1.0.92
      `create`/`edit` `toolArgs` shape.
    - **L5.** An allow with the stderr audit line executes.
    - **L6.** A broken hook copy (unresolvable import) denies, and so does a config pointing at a
      missing hook file. Pin as well what a hook command exiting 127 (`node` absent from the hook's
      PATH) does.
    - **L7.** The default hook timeout, read from a hook that sleeps past successive bounds with no
      `timeoutSec` (optional, bounded).
    - **L8.** The shell-capable tool names on 1.0.92, read off the fake provider's request tool
      list. Any non-`bash` shell tool is mapped or recorded as a residual.
    - **L9.** Cross-call state: call 1 defines `f(){ git push origin main; }`, call 2 runs `f`. The
      expected result is recorded honestly.
  - The results feed the PoC record rows.
- **Coverage / mutation.** The new engine files fall under the existing Stryker `mutate` glob. Every
  surviving mutant is checked by hand against its full covering set before a test is written.

## Out of scope

- **`hooks/git-no-ext-diff.sh` (Claude).** It shares the anchor and global-option gaps (pinned
  above), but it is a separate bash matcher on a different binding with its own crash contract
  (ADR-533…541). Proof is the Pinned A hook rows. The fix is a separate change.
- **Composing `gitDestructivePredicate` into the codex hook** (DC-10 (c)). It closes the
  `git -C . push` bypass that `execpolicy-rules.js` discloses. Proof: run
  `adapters/codex/hooks/craft-guard.js` with a `git -C . push` payload, which exits 0 today.
- **A PATH-first git shim** (DC-1 (b)/(c)). Revisit if probe L9 shows that the bash tool keeps shell
  state between calls.
- **Destructive verbs beyond the shipped set** (DC-5 (c)). That is a posture change, not part of this
  brief.
- **Aliases in the user's gitconfig, scripts, `make`, and remote `ssh` commands.** No string-level
  guard can see these. They are documented residuals.
- **Hook timeout fail-open (P8).** This is Copilot's behaviour and craft cannot change it from
  outside. It is documented.
