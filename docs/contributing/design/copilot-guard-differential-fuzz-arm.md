# Design — copilot-guard-differential-fuzz-arm

> Brief: the committed fuzz (`engine/test/guards/shell-git-invocations.differential.test.js`)
> judges the shared predicates only, never `copilotGuard` and its plain-command gate, so it could
> not find the gate's idiom-smuggling and command-position bypasses that review found by hand. Add
> a generator arm (idiom bodies, evaluator builtins, redirect/reserved-word prefixes, unlisted
> wrappers) judged through `copilotGuard`, and fold every gap it proves (BACKLOG "A copilot-level
> differential fuzz arm.").
> Status: draft → self-reviewed ×3

## Context

### What exists

```
copilot hook ─> decideGuard(payload) ─> adaptCopilotEvent ─> copilotGuard(event)
                                                     Bash ─> plainGitCommandVerdict(command)
                                                              ├─ gitPlainCommandGate      (character-level, no tokeniser)
                                                              └─ gitInvocations parse ─> destructive, then ext-diff
```

- `engine/src/guards/git-plain-command-gate.js` (184 lines). `gitPlainCommandGate(command)`: when
  the text mentions `git`, it blocks on any non-plain character outside quotes, `$`/backtick in a
  quoted word, `\`/`!` in a double-quoted word (`DOUBLE_QUOTE_FORBIDDEN` L17,
  `SINGLE_QUOTE_FORBIDDEN` L18), a `SHELL_OR_EVALUATOR_WORDS` word anywhere (L23-25), a
  `WRAPPER_WORDS` word in command position (L26-29), an unsafe `-c`/`--config-env` operand
  (`CONFIG_FLAGS` L133, `configOperands` L160-168) or a `GIT_*=` word. Command position survives
  redirects, assignments and `KEEPS_COMMAND_POSITION` words (L73).
- `engine/src/guards/git-bash-verdict.js`: `plainGitCommandVerdict` = gate, then
  `gitInvocations` → destructive → ext-diff. Codex calls the same function
  (`adapters/codex/src/git-guard-adapter.js:171`).
- `adapters/copilot/src/git-guard-adapter.js`: `copilotGuard(event)` L111, `decideGuard(payload,
  guard = copilotGuard)` L126 (never throws; JSON `toolArgs` string or object).
- `engine/test-helpers/git-differential-harness.js` (479 lines, ESM): `withTree` (stub git that
  logs NUL-separated argv to `FUZZ_LOG`, `sh` → `/bin/dash` when present), `runInShell`, `mapPool`
  (8 lanes), `mulberry32`, `pick`, `oracleVerdict(argvs)` (drops argvs holding `RESIDUAL_MARKER`,
  judges the rest with `judgeArgv`), `secondBash()` (a bash ≥ 5 on PATH, else `null`),
  `SANITY_BASH`, `SPAWN_TIMEOUT_MS`, `ORIGINAL_PATH`.
- Two arms consume `generateCommands`: the predicate arm (strict census: FALSE ALLOW,
  invalid shell, `parsed:false`, untagged false block) and the codex arm
  (`adapters/codex/test/git-guard.differential.test.js`, 102 lines, false-allow only through
  `decideGuard`, plus a real-hook parity leg). Neither reaches the gate's classes: the shared
  generator wraps git in `$`, quotes, groups and `bash -c`, so the codex arm sees 377 of 400
  commands blocked at seed 20260 (its hook-leg diagnostic, measured on this branch).
- `engine/test/guards/git-plain-command-gate.test.js`: `COMPLEX_COMMANDS` / `PLAIN_COMMANDS`
  tables, one `it` per row, `JSON.stringify(command)` in the title.
- `engine/stryker.conf.json`: `tap.testFiles` excludes `engine/test/**/*.differential.test.js` and
  lists copilot test files one by one; `mutate` covers `engine/src/**/*.js`. The test helpers
  are not mutated.
- `scripts/ci.sh` runs `run_suite adapters/copilot adapters/copilot/test adapters/copilot`
  (every `*.test.js` under it, `node --test`).
- `test/architecture-boundaries.test.js` rules R1-R3 apply to the observability import graph
  (`engine/src/observability/**`) only. An adapter test importing `engine/test-helpers/` is
  allowed, and the codex arm already does it.

### Pinned E — copilotGuard vs real shells, evaluator and prefix classes

Probes ran on `df39d88` (macOS, node 22.22.3) with throwaway scripts and a throwaway tree outside
the repo. The shells were `/bin/bash` 3.2.57, a bash 5.2.37 built from the GNU tarball inside a
`mktemp -d` throwaway, and `/bin/dash`. Each shell ran `<shell> -c <command>` with a stub `git`
first on PATH that logs its argv. Every row ran 3× per shell with the same result each time.
"Guard" means in-process `copilotGuard({tool:'Bash',tool_input:{command}})`, and "stage" means
which part blocked: the gate, or the parse after the gate allowed.

| Command | bash 3.2 ran | bash 5.2 ran | dash ran | Guard | Stage |
|---|---|---|---|---|---|
| `seq 3 \| mapfile -C 'git push'` | nothing (127) | nothing (default quantum 5000) | nothing (127) | allow | — |
| `seq 3 \| mapfile -tc1 -C 'git push'` | nothing (127) | **`push 0 1` · `push 1 2` · `push 2 3`** | nothing | **allow** | — |
| `seq 3 \| readarray -tc1 -C 'git push'` | nothing (127) | **`push 0 1` …** | nothing | **allow** | — |
| `seq 3 \| mapfile -tc1 -C git` | nothing | `0 1` … (no verb) | nothing | allow | — |
| `seq 3 \| mapfile -c 1 -C 'git push'` | nothing | **`push 0 1` …** | nothing | BLOCK | gate, but only via `-c 1` (unsafe config operand) |
| `compgen -C 'git push' x` | **`push '' x`** | **`push compgen x`** | nothing (127) | **allow** | — |
| `complete -C 'git push' x` | nothing | nothing | nothing | allow | — (registers only) |
| `bind -x 'a:git push'` | nothing (exit 1) | — | — | allow | — (interactive only) |
| `seq 2 \| caffeinate mapfile -tc1 -C 'git push'` · `caffeinate compgen -C …` | — | nothing (127, not a file) | — | allow | — |
| `trap 'git push' EXIT` | `push` | `push` | `push` | BLOCK | gate (`trap` wrapper word) |
| `coproc git push; wait` | nothing (127) | `push` | — | BLOCK | gate (`coproc`) |
| idiom `git commit -m "$(cat <<'X'⏎a)"; git push; echo "⏎X⏎)"` | **`commit -m a` + `push`** | `commit -m <whole body>` | `commit -m <whole body>` | BLOCK | gate (`$` in a double-quoted word) |
| `if git push; then :; fi` · `> out git push` · `2>/dev/null git push` | `push` | `push` | `push` | BLOCK | parse |
| `caffeinate env -S 'git push'` | `push` | — | — | BLOCK | parse |
| `watch -n1 -t 'git push'` · `tmux new -d 'git push'` (orchestrator, real tools, 3/3) | `push` | — | — | allow | — (documented residual) |

Verdict-only rows, in-process, no shell run:

| Command | Guard | Stage | Note |
|---|---|---|---|
| `time` / `nohup` / `exec` / `env` / `coproc git push`, `! git push` | BLOCK | gate | wrapper word, non-plain `!` |
| `stdbuf -o0` / `caffeinate` / `setsid` / `chrt -o 0` / `taskset 1` / `unbuffer` / `doas` / `strace` / `flock l` `git push` | BLOCK | parse | the parse anchors a git word at any position |
| `flock -c 'git push' l` · `su -c` · `script -c` · `expect -c` · `python3 -c '…'` | BLOCK | gate | **coincidental**: the `-c` operand is read as an unsafe git config key |
| `ssh host 'git push'` · `parallel ::: 'git push'` · `perl -e 'system q(git push)'` · `node -e …` · `awk 'BEGIN{system("git push")}'` | allow | — | documented residuals (a quoted string is one word, not a git word) |
| `ssh host git push` | BLOCK | parse | argv form |
| `caffeinate sudo -s 'git push'` | allow | — | unprobed (see Out of scope) |
| `git log \| mapfile -t a` · `git grep mapfile` | allow | — | bystander forms the fix must judge |
| `git commit -m 'cost $5'` · `git commit -m "stop!"` · `git commit -m "a\\b"` | BLOCK | gate | quoted-word rule; no apostrophe involved |

What the matrix proves:

1. **Two live gaps.** `mapfile`/`readarray` with `-C` and a quantum spelled without a standalone
   `-c` word (`-tc1`) run the callback as shell in bash ≥ 4 (bash 5.2: 3/3). `compgen -C` runs it in
   bash 3.2 **and** 5.2 (3/3 each), so it is the one gap exploitable on the macOS shell copilot
   runs. `copilotGuard` allows all three. They are the same class as `trap`, which is already a
   `WRAPPER_WORDS` entry.
2. **External wrappers cannot reach a builtin.** `caffeinate mapfile …` and `caffeinate compgen …`
   fail with 127 because builtins only run in command position. So the fix needs command
   position only, and the any-position `SHELL_OR_EVALUATOR_WORDS` set is not required.
3. **The `-c` coincidence hides gaps.** The gate blocks `mapfile -c 1 -C …`, `flock -c`, `su -c`
   and `script -c` only because `configOperands` reads every `-c` operand as a git config key.
   A generator that emits these spellings would credit the gate with a rule it does not have. The
   `-tc1` cluster (it does not start with `-c`, so `ATTACHED_CONFIG` misses it) is exactly the
   spelling that both executes and escapes the coincidence.
4. **Composition masks gaps.** The gate judges the whole text. `seq 3 | mapfile -tc1 -C 'git
   push'; git -c k.v=1 status` is blocked by the config rule on the other half. The shared
   generator mixes many blocked parts per command, which is why it never isolated these classes.
5. **Idiom bodies are shell-dependent.** Bash 3.2 ran the smuggled `git push`, while bash 5.2 and
   dash kept it as data. Only a run on both shells shows both outcomes.

### Doc drift found while pinning

- `adapters/copilot/README.md` "Git reached through channels…" (L113-117) omits what
  `docs/contributing/specs/gate.md` L227-233 lists: "a heredoc written to a file and run later",
  `watch`, `su -c`, `script -c`, `parallel`.
- `gate.md` "Near-git rules" says "three rules" (L195) and has no bullet for the zsh `=` prefix,
  while the README says "four rules" and has it (L101). The code has it (`isZshEqualsExpansion`,
  L83).
- Both "intended false blocks" lists say "an apostrophe plus `$` in a quoted word
  (`git commit -m "it's $HOME"`)". The real rule is any `$` or backtick in a quoted word, and any
  `\` or `!` in a double-quoted word, apostrophe or not (BACKLOG "The copilot intended false blocks
  list understates the quoted-word rule"; rows `'cost $5'`, `"stop!"`, `"a\\b"` above).
- Both pages list the command-position words; the fix adds three.

## Requirements

- **R1.** A new arm judges every generated command twice. Real `/bin/bash` (and the first
  bash ≥ 5 on PATH, when one exists) runs it against the stub git. `decideGuard` judges it
  in-process with a copilot-shaped payload, which reaches `copilotGuard`. The arm fails on any
  FALSE ALLOW: the shell ran a destructive or ext-diff argv not marked residual (`oracleVerdict`),
  and the guard allowed the command.
- **R2.** The generator reaches each class the brief names, each in isolation (no second judged
  fragment in the same command): heredoc idiom bodies (benign, break-out, odd quote), evaluator
  builtins (`trap`, `mapfile`/`readarray -tc1 -C`, `compgen -C`, `coproc`), redirect and
  reserved-word prefixes, unlisted argv wrappers, and unlisted string runners. A tag-count test
  proves each class is reached at the default seed.
- **R3.** Every external wrapper or runner the generator names is a deterministic stub in the
  run tree. No real `watch`, `tmux`, `ssh`, `sudo`, `parallel` or `caffeinate` runs.
- **R4.** No evaluator, wrapper or runner fragment carries a standalone `-c` word or a word
  starting with `-c`. A generator self-test enforces this, so a block on those classes can only
  come from the rule under test.
- **R5.** The gate blocks `mapfile`, `readarray` and `compgen` in command position when the
  command mentions git: every R2 evaluator row is blocked, and `git log | grep mapfile` and
  `git grep mapfile` still pass.
- **R6.** Strict census: every false block (guard blocked, oracle clean) carries a copilot
  intended-false-block tag, and every tag maps to one rule stated in the living docs. A shell
  syntax error counts as a failure unless the fragment is tagged as shell-dependent. A killed
  shell counts as a failure.
- **R7.** The default seed (20260, 400 commands) is green in `bash scripts/ci.sh` on macOS
  (`/bin/bash` 3.2, `sh` → `/bin/dash`) and on Linux CI (`/bin/bash` 5, dash). The arm takes less
  than 5 s per shell.
- **R8.** The living docs tell the truth after the change: the README residual list matches
  `gate.md`, the command-position lists name the three new words, `gate.md` gains the zsh `=`
  bullet, and both intended-false-block lists state the real quoted-word rule. The two BACKLOG
  entries (L319 and L351) leave the Open list, and no new entry is filed.

## Design

```
engine/test-helpers/plain-gate-generator.js   (new, ESM, binding-neutral)
  generatePlainGateCommands(seed, cap) ─> frozen [{ text, tags, status? }]
  PLAIN_GATE_TAGS, PLAIN_GATE_FALSE_BLOCK_TAGS, SHELL_DEPENDENT_TAGS
  STUBS  { name: script }   +  installStubs(binDir)
  uses harness: mulberry32, pick, RESIDUAL_MARKER

adapters/copilot/test/git-guard.differential.test.js   (new)
  withTree(tree => installStubs(tree.bin); mapPool(commands, runInShell(shell, …)))
  verdict = decideGuard(payload('bash', { command })).block      (in-process)
  oracle  = oracleVerdict(run.argvs)                             (harness, unchanged)

engine/src/guards/git-plain-command-gate.js
  WRAPPER_WORDS += 'mapfile', 'readarray', 'compgen'
```

### Part 1 — gate fix (`engine/src/guards/git-plain-command-gate.js`)

Add `'mapfile', 'readarray', 'compgen'` to `WRAPPER_WORDS` (DC-2 a). Command position is enough
(Pinned E point 2). `isWrapperWord` already applies `baseName`, which handles `/x/compgen` and a
case-folded spelling. No other code changes. Unit rows in
`engine/test/guards/git-plain-command-gate.test.js`:

- `COMPLEX_COMMANDS` += `"seq 3 | mapfile -tc1 -C 'git push'"`,
  `"seq 3 | readarray -tc1 -C 'git push'"`, `"compgen -C 'git push' x"`,
  `"git status; compgen -C x y"`, and `"if true; then mapfile -tC 'git push'; fi"`. Every row is
  free of any `-c` word, so the block cannot come from `configOperands`.
- `PLAIN_COMMANDS` += `'git log | grep mapfile'`, `'git grep mapfile'`, `'git add compgen.md'`
  (not in command position).
- Stryker: each new `StringLiteral` mutant (`""` for each word) is killed by its own row.

### Part 2 — generator (`engine/test-helpers/plain-gate-generator.js`)

A separate module, not more lines in the 479-line harness (DC-3 a). It imports `mulberry32`,
`pick` and `RESIDUAL_MARKER` from the harness. Each command is one **core** fragment, plus an
optional **filler** before it and one after it. A filler is always gate-plain, parse-allowed and
exits 0: `ls`, `echo ok`, `true`, `git status`, `git log -1`. Fillers are joined with `;`, `&&`,
`|` (core on the right only) or a newline. One judged fragment per command keeps a gap from being
masked (Pinned E point 4). The plain git invocation `G` is drawn from a plain verb table, and a prefix (below) may wrap a simple-command core, since a modifier is not a second judged fragment: `push`,
`push origin main`, `reset --hard`, `reset --soft`, `clean -fd`, `clean -n`, `branch -D x`,
`branch -d x`, `diff`, `diff --no-ext-diff`, `show`, `status`, `log -1`. The spelling is plain
`git`, with no global options.

| Class (tag) | Core shapes (`G` = plain git invocation) | Expected guard | Oracle-clean case is tagged |
|---|---|---|---|
| control (`plain`) | `G` | parse verdict | never tagged (R6 note) |
| prefix (`prefix`, a modifier) | `> o C` · `>>o C` · `2>/dev/null C` · `2>&1 C` · `>\|o C` · `A=1 C` · `if C; then :; fi` · `while C; do break; done` · `until C; do :; done` · `if true; then C; fi` · `true && C` · `false \|\| C` · `echo x \| C` · `C \| cat`, where `C` is `G` or a listed-wrapper, evaluator, argv-wrapper or runner core below. On a pipeline core (`seq 2 \| mapfile …`), redirect and assignment prefixes go on its last element. `until` wraps `G` only, because a core that exits non-zero (`compgen` exits 1) would loop until the spawn timeout. `coproc G; wait` takes no prefix | the core's verdict: this is the command-position bypass class | the core's tag |
| reserved / non-plain (`unplain-character`) | `! G` · `{ G; }` · `( G )` · `G # c` · `G < /dev/null` · `case x in x) G;; esac` | BLOCK (gate) | `unplain-character` |
| listed wrapper (`evaluator-word`) | `env G` · `command G` · `nohup G` · `nice G` · `exec G` · `time G` · `sudo G` · `timeout 5 G` | BLOCK (gate) | `evaluator-word` |
| evaluator builtin (`evaluator-word`) | `trap 'G' EXIT` · `seq 2 \| mapfile -tc1 -C 'G'` · `seq 2 \| readarray -tc1 -C 'G'` · `compgen -C 'G' x` · `coproc G; wait` · `git log \| mapfile -t a` | BLOCK (gate) | `evaluator-word` (bash 3.2 has no `mapfile`/`readarray`/`coproc`, so nothing runs there) |
| unlisted argv wrapper (`argv-wrapper`) | `stdbuf -o0 G` · `caffeinate G` · `setsid G` · `chrt -o 0 G` · `taskset 1 G` · `unbuffer G` · `doas G` · `strace -f G` · `flock o G` · `xcrun G` · `arch -arm64 G` · `ssh host G` | parse verdict | — |
| string runner, residual (`residual`) | `watch -n1 -t 'G residual-marker'` · `tmux new -d 'G residual-marker'` · `ssh host 'G residual-marker'` · `parallel ::: 'G residual-marker'` | allow today; BLOCK accepted | `residual` |
| idiom body (`quoted-expansion`) | `git commit -m "$(cat <<'EOF'⏎<body>⏎EOF⏎)"`, where `<body>` is `msg` · `x)"; G; echo "` · `` a`b `` · `don't` | BLOCK (gate) | `quoted-expansion`; odd-quote and odd-backtick bodies also carry `shell-dependent` |
| quoted word (`quoted-expansion`) | `git commit -m 'cost $5'` · `git commit -m "stop!"` · `git commit -m "a\\b"` · `` git log --format='%H `x`' `` | BLOCK (gate) | `quoted-expansion` |
| unsafe config (`unsafe-config`) | `git -c core.pager=cat log -1` · `GIT_PAGER=cat git log -1` · `git -c alias.p=push p` | BLOCK | `unsafe-config` |
| any-word anchor (`any-word-anchor`) | `echo G` | BLOCK (parse) | `any-word-anchor` |
| unreached (`control-flow-unreached`) | `false && G` | BLOCK when `G` is destructive or diffing | `control-flow-unreached` |

R6 note on `plain`, on `prefix` over `G`, and on `argv-wrapper`: the guard blocks only when the parse sees a
destructive or ext-diff verb, and the stub then logs exactly that argv. So an oracle-clean block
in these classes is a real disagreement and is never tagged. One exception surfaced while
designing: `until G; do :; done` with a failing `G` would loop. The stub git exits 0, so `until`
ends after one call.

**Stubs** (`STUBS`, installed by `installStubs(tree.bin)`, mode 0755, each 2-3 lines of
`/bin/sh`). The test calls it at the start of its own `withTree` act, so `withTree` is
unchanged (DC-4 a):

```sh
# argv wrapper, N = option words the generator always emits for that name
#!/bin/sh
shift N
exec "$@"
# string runner (watch, tmux, parallel): the last argument is the shell string
#!/bin/sh
for last; do :; done
exec /bin/sh -c "$last"
# ssh: drop the host, join the rest (argv and quoted forms alike, as ssh does)
#!/bin/sh
shift 1
exec /bin/sh -c "$*"
```

Stubbed names: `stdbuf caffeinate setsid chrt taskset unbuffer doas strace flock xcrun arch
sudo timeout nice nohup ssh watch tmux parallel`. `env`, `command`, `exec`, `time`, `trap`, `seq`,
`echo`, `cat` and `ls` stay real. Each stub is first on PATH, so the shadowed real tool never runs
(R3). Stubbing `nice`, `nohup` and `timeout` removes platform drift: macOS has no `timeout`.

**Coincidence guard (R4).** The module exports `CORE_SHAPES` (the class table). The self-test asserts
that no fragment of class `evaluator-word`, `argv-wrapper` or `residual` holds a word matching
`/^-c/` or equal to `--config-env`. The `-tc1` spelling is deliberate: it passes this check and
still executes (Pinned E).

**Seeding.** `generatePlainGateCommands(seed, cap)` returns a fixed **anchor list** first: one
row per core shape, with `G = git push` where the shape takes one, no prefix and no filler, so each class is reached at any cap ≥
anchor length. That mirrors `SPECIALS` in the harness. Then come `cap − anchors` random
compositions. The output is frozen and deterministic per seed.

### Part 3 — copilot arm (`adapters/copilot/test/git-guard.differential.test.js`)

It has the same shape as the codex arm, with the predicate arm's census (DC-1 a). It does not
spawn the hook process (DC-5 a).

```js
const blocks = command => decideGuard(bashPayload(command)).block;   // toolArgs as a JSON string
function problemsOf(entry, run) {
  // shell killed                      → problem
  // syntax error && !shell-dependent  → 'generator emitted invalid shell'
  // oracle blocks && !blocks          → 'FALSE ALLOW'
  // blocks && !oracle && !tagged(PLAIN_GATE_FALSE_BLOCK_TAGS ∪ residual) → 'unexpected false block'
}
```

- Shells: `SANITY_BASH`, plus `secondBash()` (skipped when `null`). Not zsh (copilot runs
  `/bin/bash`) and not dash directly (`sh` inside a command is already dash in the tree).
- Knobs: the same `GUARD_FUZZ_SEEDS` / `GUARD_FUZZ_COUNT` with the same defaults (`[20260]`, 400),
  so one maintainer interface drives all arms. The census stays strict at scale. The arm generates
  none of the three classes that turn the predicate arm red at scale (a short-circuited `&&`
  with an untagged left side, a function defined in a pipeline subshell, `cat <(…)`). `false &&
  G` is tagged. So the scale knob is expected green here. The implementation runs it once (5
  seeds × 2000) and folds every finding into this change.
- Floor: `invoked ≥` a named constant, set from the lower of the two platforms' measured
  default-seed counts, minus a margin.
- Diagnostics: `generated / invoked / false blocks by tag`, as the predicate arm prints them.
- Generated commands never appear in test titles. Titles are printable ASCII.

### Part 4 — living docs

- `docs/contributing/specs/gate.md` (copilot binding) and `adapters/copilot/README.md` (gate
  section):
  - The command-position list gains `mapfile readarray compgen`, with the reason in one clause:
    their `-C` callback is shell text.
  - The README's "Git reached through channels…" bullet gains the `gate.md` items it lacks
    ("a heredoc written to a file and run later", `watch`, `su -c`, `script -c`, `parallel`).
  - Both "intended false blocks" lists replace "an apostrophe plus `$` in a quoted word
    (`git commit -m "it's $HOME"`)" with the rule: "a `$` or backtick in any quoted word, or a `\`
    or `!` in a double-quoted one (`git commit -m 'cost $5'`, `git commit -m "stop!"`)".
  - `gate.md` "Near-git rules" gains the zsh `=` bullet and says "four rules", matching the README
    and the code.
- `BACKLOG.md`: delete "A copilot-level differential fuzz arm." and "The copilot intended false
  blocks list understates the quoted-word rule." from the Open list. Nothing is added.
- ADR (orchestrator's numbering) recording DC-1 and DC-2.

### Edge behaviour (deliberate changes)

- Newly blocked: `mapfile`, `readarray` or `compgen` in command position in any command that
  mentions git. Example: `git log --format=%s | mapfile -t lines` is now a false block (the
  array is lost after the pipe in bash anyway, because the right side of a pipe runs in a
  subshell). The remedy is the usual one: re-issue git on its own.
- Unchanged: `complete -C` and `bind -x` (they register a hook that never fires in a
  non-interactive `-c` shell; Pinned E), and string runners and interpreter literals (documented
  residuals).

## Decision candidates

| # | Choice | Alternatives (≤3) | Recommendation | Why |
|---|---|---|---|---|
| DC-1 **(user's decision)** | The copilot arm's oracle: what is a FALSE ALLOW, what is an intended false block, and how documented residuals are kept out | (a) **Strict two-sided census.** FALSE ALLOW = the shell ran a destructive or ext-diff argv without `RESIDUAL_MARKER` and `decideGuard` allowed. Every oracle-clean block must carry a copilot intended-false-block tag (`quoted-expansion`, `unplain-character`, `evaluator-word`, `unsafe-config`, `any-word-anchor`, `control-flow-unreached`), each mapped to one rule in the living docs. String runners are generated with the marker inside their string and tagged `residual`; either verdict is accepted for them. (b) **False-allow only**, as in the codex arm: false blocks are printed as a diagnostic and never asserted. (c) **Strict census, residuals not generated**: runner and interpreter strings never appear, so every oracle-clean block needs a class tag and every run argv counts | (a) | (b) cannot pin the intended-false-block list the docs promise. The quoted-word restatement (R8) and the new `mapfile` false block would go unchecked, and an over-broad future gate change would pass silently. (c) loses the residual-as-noise coverage: a marker-carrying runner next to a filler shows the residual does not hide or excuse a real git argv. (a) reuses the harness marker and the predicate arm's census shape, so it adds no new oracle code. The cost is a tag on each core shape and a doc line per tag. Accepting a block on `residual` keeps a future hardening (blocking `watch`) from failing the arm, while the doc update stays a review item |
| DC-2 | How the gate closes `mapfile`/`readarray`/`compgen -C` | (a) **Add them to `WRAPPER_WORDS`** (command position), like `trap`. (b) Add them to `SHELL_OR_EVALUATOR_WORDS` (any word position). (c) A flag-aware rule: block only when a `-C` callback is present | (a) | Builtins never run outside command position: `caffeinate mapfile …` and `caffeinate compgen …` exit 127 (Pinned E). So (b) only adds false blocks such as `git grep mapfile` or `git add compgen.md`. (c) needs option parsing for clustered (`-tC`), attached (`-Cx`) and long forms, which is the tokeniser work the gate exists to avoid. It also leaves `compgen -F`/`-W` to reason about. (a) is three strings and three unit rows |
| DC-3 | Where the generator lives | (a) **New `engine/test-helpers/plain-gate-generator.js`**, binding-neutral, importing the harness primitives. (b) Extend `git-differential-harness.js` (479 lines). (c) A helper under `adapters/copilot/test/` | (a) | The gate is engine code shared with codex, so a generator for its classes belongs beside the harness, not inside one binding. (b) pushes a single file past 600 lines with two unrelated generators. (c) hides a gate-level tool in an adapter. Adapters already import `engine/test-helpers/` (codex arm, `test/git-no-ext-diff.differential.test.js`), and `test/architecture-boundaries.test.js` does not police it |
| DC-4 | How stubs reach the run tree | (a) **`installStubs(tree.bin)`** called inside the arm's `withTree` act; `withTree` is unchanged. (b) A `withTree(act, { stubs })` option | (a) | `tree.bin` is already exposed, and three arms call `withTree`. (a) touches none of them. (b) changes a shared signature for one caller |
| DC-5 | Copilot hook-process leg | (a) **In-process `decideGuard` only**, with a JSON-string `toolArgs` payload. (b) Also spawn `adapters/copilot/hooks/craft-guard.js` per command, like the codex arm's parity leg | (a) | The brief asks for the verdict judged through `copilotGuard`. `decideGuard` reaches it through the payload decode at no cost. Hook-process parity (exit, stdout, worker deadline) is owned by `adapters/copilot/test/craft-guard-hook.test.js`. (b) adds about 6 s per seed (the codex leg measured 6.0 s for 400 commands) for transport coverage that already exists |
| DC-6 | Doc folds in this change | (a) **Fold all four**: README residual sync, command-position lists, the `gate.md` zsh `=` bullet, and the quoted-word restatement. Delete both BACKLOG entries. (b) Fold the first three and leave the quoted-word entry open | (a) | The arm's census tags encode the real quoted-word rule (R6), so the restatement is what keeps the docs and the tags in agreement, which is the point of (a) in DC-1. User policy is fold, not file. The zsh bullet is in the same bullet list this change already edits |

Adopted as recommended, without a user decision: one judged fragment per command (Pinned E point
4); the `-tc1` spelling and the R4 self-test against the `-c` coincidence; shared seed/count
knobs and a strict census at scale; bash only (no zsh); stubbing `nice`, `nohup` and `timeout`
for platform parity.

## Test strategy

TDD, London School. Red → Green → Refactor per part. Titles are Given/When/Then and bodies are AAA
with a `sut` variable. Titles stay printable ASCII (no `⏎`, NEL, U+2028 or invisible
characters; Stryker's tap dry run rejects them). Multi-line commands are built with `\n` in the
body. No provenance references (phase, ADR or backlog numbers) in source or test code.

### Order

1. **Red first, through the arm.** Land the generator (Part 2) and the arm (Part 3) before the
   gate fix. On Linux CI (bash 5) the arm must go red on FALSE ALLOW for the `mapfile`/`readarray`
   anchors. On macOS it must go red for `compgen -C 'git push' x` (bash 3.2 runs it, Pinned E).
   Record both outputs in the part handback. The `mapfile` red is CI-only on a box without
   bash ≥ 5, and a local bash ≥ 5 on PATH (`secondBash()`) shows it locally.
2. **Red, unit.** Add the Part 1 `COMPLEX_COMMANDS` rows, which fail before the word-list change.
3. **Green.** Change `WRAPPER_WORDS`. The unit rows and both shells' arm runs pass.
4. **Docs** (Part 4), then the BACKLOG deletions.

### Generator self-tests (in the arm file, deterministic, no shell)

- Given the fixed seed, when generated twice, then both lists are identical and of length `CAP`.
- Given the generated commands, when tags are counted, then every class tag in `PLAIN_GATE_TAGS`
  is reached.
- Given the evaluator, wrapper and runner fragments, when their words are scanned, then none is
  `-c`-led or `--config-env` (R4).
- Given every core shape, when generated with no filler, then the anchor list holds it once.
- Given the stubs, when installed into a temp bin and run with a probe argv, then the argv
  wrapper execs the remainder and the string runner runs its last argument (one row per stub
  kind, in a `mktemp` tree).

### Census (shell runs)

One `it` per (seed, shell): `/bin/bash`, then the first bash ≥ 5 on PATH (skipped when there is
none). Timeout is 60 s and the expected wall time is under 2 s per shell (400 spawns over 8 lanes,
the same as the predicate arm's measured 1.4 s for its two legs).

### Mutation

Stryker over `engine/src/guards/git-plain-command-gate.js`, with one comma-separated `--mutate`
(repeated flags keep only the last). The three new `StringLiteral` mutants must be killed by the
unit rows. The differential files are not in `tap.testFiles` (by glob exclusion for the engine,
and by omission for adapters). Survivors are hand-checked against the full covering set before a
test is written.

### Gate

`bash scripts/ci.sh` is green per part. That covers `design-lint`, `readme-drift` (README design
count), the backlog lint and every suite on macOS. Linux CI covers bash 5 and dash.

## Out of scope

- The predicate arm's scale-knob red (BACKLOG "The fuzz goes red at scale on unclassified
  safe-direction false blocks"): owned there. This arm does not generate those classes.
- Running the new generator through the codex arm. Codex calls the same `plainGitCommandVerdict`,
  so the gate fix closes codex too, and a second arm would judge identical code.
- String runners, interpreter literals and `-c`-string tools (`su -c`, `script -c`) as
  enforcement targets: documented residuals, unchanged.
- `complete -C` and `bind -x`: they register only and never run in a non-interactive shell
  (Pinned E).
- `caffeinate sudo -s 'git push'` (allowed; `sudo -s` hands the string to `$SHELL -c`). Unprobed:
  it needs a sudo credential. To prove it, run it under a NOPASSWD sudoers entry in a throwaway
  VM with a stub git on PATH.
