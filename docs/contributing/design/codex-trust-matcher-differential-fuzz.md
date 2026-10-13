# Design — codex trust matcher: a committed differential fuzz

> Brief: add a seeded, bounded differential fuzz to `adapters/codex/test/`. It generates hook
> commands, keeps the ones `selectCraftHook` (`adapters/codex/src/hook-trust.js`) trusts, and runs
> each one under sh, bash, dash and zsh with a stub `node` on `PATH`. The oracle: exactly one rooted
> argv ending in the guard tail, exit 0, empty stderr. A fixed seed and an iteration cap keep it
> deterministic and fast enough for `npm --prefix adapters/codex test`. A shell missing on the
> machine skips its leg with a reason, never silently. The test does not touch `hook-trust.js`.
> Closes the BACKLOG entry "Commit a differential test for the codex trust matcher".
> Status: draft → self-reviewed ×3

## Context

### What exists

- **The matcher.** `selectCraftHook(hooks, { errors })` (`hook-trust.js:332`) keeps the hooks for
  which `isGuardHook` (L302) holds and throws `selectCraftHook: no craft hook found …`
  (`assertSingleMatch`, L247) when none does. There is no boolean API: refusal is a throw. The rule
  is an allow-list (ADR-514, ADR-515, ADR-517):
  - The command splits into one interpreter word and one operand (`GUARD_COMMAND_SHAPE`, L65). Only
    plain spaces separate or pad them.
  - The interpreter is a literal word (`LITERAL_WORD_PATTERN`, L66) that is `node` or an absolute
    path ending in `/node` (`isGuardInterpreter`, L292).
  - The operand is either bare or double-quoted. Bare, it is exactly `SHIM + TAIL` or a literal word
    (`isInertBareOperand`, L280). Quoted, it holds path characters, plain spaces and the exact shim
    only (`QUOTED_LITERAL_PATTERN`, L67; `isInertQuotedOperand`, L276).
  - The operand opens with `/` or `SHIM/` (`isRootedPath`, L284) and ends with the tail.
  - `SHIM` = `${CRAFT_ROOT:-${CLAUDE_PLUGIN_ROOT}}`. `TAIL` = `/adapters/codex/hooks/craft-guard.js`,
    derived from the exported `GUARD_SCRIPT_SEGMENTS`.
- **Example tables.** `adapters/codex/test/hook-trust.test.js` pins each known bypass as a refusal:
  - `DECOYS` (L461-503) holds the nested-assembly rows (`${y:=a[${z:-$}(touch MARK)]}$[y]`,
    `${(e)…}`), the node-option rows (`"--eval=…/TAIL"`, `--import=data:…`) and the relative
    operands.
  - `NON_WORD_COMMANDS` (L709-719) holds `X=/node`, `node =x/TAIL` and `=/opt/n/node`.

  Every row is one `selectCraftHook` call. No shell runs.
- **The runtime precedent.** `adapters/codex/test/config.test.js` runs the registered command under
  `sh -c` and `bash -c` from a spaced root (ADR-516). It builds the env from scratch and uses
  `mkdtempSync` with `try/finally`. ADR-516 refused a conditional zsh leg because zsh catches nothing
  for *that* test, and "a conditional skip sometimes says nothing".
- **The throwaway fuzz.** ADR-517's Consequences record two throwaway runs: 300 000 commands, then
  400 000 with node-option fragments and a rooted-argv oracle. Both found 0 differentials with an
  unspaced root. With a spaced root, the only residual is the bare legacy shim splitting, which is
  accepted. The prior design (`docs/contributing/design/codex-hooks-quote-plugin-root.md`, §Test
  strategy, "Property lens") describes that fuzz. None of it was committed.
- **The gate.** `adapters/codex/package.json` runs `node --test 'test/**/*.test.js'`.
  `scripts/ci.sh:55` runs `run_suite adapters/codex …`, which captures `node --test` output (TAP,
  not a TTY) and fails on a non-zero exit. CI is `ubuntu-latest`, node 22
  (`.github/workflows/ci.yml`). Measured today: 609 tests, wall time 1.04 s.

### Pinned: shells and CI image (2026-10-13)

| Host | sh | bash | dash | zsh |
|---|---|---|---|---|
| macOS dev box (measured) | `/bin/sh` = bash 3.2.57 in sh mode | `/bin/bash` 3.2.57 | `/bin/dash` | `/bin/zsh` 5.9 |
| `ubuntu-latest` (read, not run) | dash (`/bin/sh` → dash, essential package) | present | present | **absent** |

The CI row comes from the runner image's own package list
(`actions/runner-images`, `images/ubuntu/toolsets/toolset-2404.json`, read through `gh api`). Its
`vital_packages`, `common_packages` and `cmd_packages` name no `zsh`. `scripts/install-dev-tools.sh`
installs only `shellcheck jq`. No GitHub runner was booted to confirm this.

On this box `/etc/zshenv` does not exist, and zsh reads `~/.zshenv` only from `HOME`, which the
test sets to an empty throwaway directory.

### Pinned: node:test skip rendering (node v22.22.3)

`it(title, { skip: '<reason>' }, fn)` renders as follows:

- TAP, which is what `ci.sh` captures: `ok N - <title> # SKIP <reason>`, then `# skipped 1` in the
  summary. Exit 0.
- spec, on a TTY: `﹣ <title> (…) # <reason>`.

The reason is visible in both. A skip never fails the run.

### Pinned: prototype measurements (throwaway, `mktemp` scratch, not committed)

The design below was prototyped against HEAD's `hook-trust.js` (imported read-only), with
`mulberry32` and the generator, stubs and oracle described in §Design. Pool = 8 concurrent spawns.

**Spawn cost.** 100 runs of `<shell> -c 'node /x/TAIL'` with the stub `node`, in ms per command:

| Shell | `spawnSync` | async pool of 8 |
|---|---|---|
| sh | 14.3 | 1.97 |
| bash | 10.0 | 1.99 |
| dash | 9.2 | 1.48 |
| zsh | 10.2 | 2.84 |

**Acceptance and runtime, seed 1** (all four shells, wall time of the fuzz alone):

| Cap (generated) | Trusted | Shell runs | Fuzz wall | Codex gate wall, fuzz run concurrently |
|---|---|---|---|---|
| 2000 | 74 | 296 | 0.53-0.58 s (3 runs) | 1.28 s (vs 1.04 s today) |
| 3000 | 110 | 440 | 0.78-1.44 s | 1.99 s |

**No differential at HEAD.** 25 seeds × 4000 generated = 100 000 commands, 3 862 trusted, 15 448
shell runs, **0 failures**.

**Teeth: matcher mutants.** Each mutant is a copy of `hook-trust.js` with one allow-list rule
reverted. The number is the generated index of the first failing command; `MISS` means it was not
caught by the cap.

| Mutant | Rule reverted | seeds 1-8, cap 3000 |
|---|---|---|
| K1 | quoted class also admits `$ ( ) { }` and backtick | 488 885 287 259 563 35 187 577 |
| K2 | literal-word class also admits `* ? ~ [ ]` | 295 39 581 0 80 549 235 323 |
| K3 | `isRootedPath` always true | 36 73 5 120 45 4 71 98 |
| K4 | interpreter: any word whose basename is `node` | 55 128 64 27 115 170 65 155 |
| K5 | shape uses `\s`/`\S` instead of a plain space | 95 111 251 135 2 134 269 168 |
| K6 | `isInertBareOperand` always true | 65 0 43 0 9 17 130 86 |
| K7 | anything may follow the operand | 8 530 32 28 16 45 115 38 |
| K8 | `isInertQuotedOperand` always true | 204 78 287 259 28 35 187 117 |
| K9 | the interpreter's literal-word check removed | 386 39 441 563 80 82 248 87 |
| K10 | literal-word class also admits `$` | 1449 326 MISS MISS 2736 440 MISS 2110 |
| K11 | one leading `NAME=value` word allowed | 229 77 112 545 274 67 181 49 |

At seed 1 with cap 2000, all 11 are killed. The last first kill is K10 at index 1449. K10 is the
weak spot (5/8 seeds at cap 3000): it needs `$HOME` in a bare operand that still ends with the tail.

**Which oracle observable kills what (seed 1, cap 2000), as failures:**

| Mutant | full oracle | without the marker | without the `NODE_*` env check |
|---|---|---|---|
| K1 | 30 | 15 | 30 |
| K8 | 34 | 19 | 34 |
| K9 | 40 | 32 | 40 |
| K11 | 40 | 40 | **0** |

The env check is the only thing that kills K11. In K9, 8 of the 40 failures are seen only through the
marker (`<bin>/$(mark)/node …`: exit 0, one rooted argv, so only the marker shows that `mark` ran).

**Shell legs.** With bash and dash only (CI today), all 11 mutants are still killed at seed 1. K2
drops from 8 failures to 2: its operand-glob class (`zsh: no matches found`) is observed only by
zsh. K2's survivors under bash and dash are killed through a globbed *interpreter* path.

**Generator strategy (seed 1-4, cap 2000, killed mutants out of 11):**

| Strategy | Trusted (seed 1) | s1 | s2 | s3 | s4 |
|---|---|---|---|---|---|
| grammar fragments only | 75 | 10 (K10) | 11 | 10 (K10) | 10 (K10) |
| seed mutation only | 69 | 6 | 7 | 6 | 6 |
| both, 50/50 | 74 | **11** | **11** | 10 (K10) | 10 (K10) |

**Spaced plugin root.** With a spaced root, the HEAD matcher shows exactly 3 failures over 3000
generated. All three are the bare legacy shim with a root set, under sh, bash and dash (zsh does not
split). This is ADR-517's accepted residual, and it is reproduced.

**Traps the prototype hit (each would have been a false differential):**

1. Char-level mutation of an absolute interpreter yields paths such as `/va/folders/…/bin/node`. The
   matcher rightly trusts them, but the shell exits 127. The matcher cannot know whether a file
   exists, so this is not a differential. Fix: the interpreter is never mutated; it is drawn from a
   fixed table.
2. A composed interpreter `<bin>/=mark/node` is a literal path (mid-word `=` does not expand) that
   does not exist. Under HEAD it gave 48 false failures over 100 000 commands. Fix: interpreter
   fragments are either spellings of `<bin>` that exist, or shell-active. A precondition test
   enforces this (R6).

### Prior decisions this design follows

- ADR-517: the matcher is a strict allow-list. This change adds a test and changes no rule.
- ADR-516: the runtime test builds the env from scratch and uses `mkdtemp` throwaway trees.
- ADR-046: discovery is the `node --test` glob, and `ci.sh` enumerates `*.test.js`. A new
  `*.test.js` file is picked up by both with no wiring.
- ADR-505 and ADR-509: CI and the devcontainer share `scripts/install-dev-tools.sh` (relevant only
  if DC-3 (b) is chosen).

## Requirements

- **R1.** One new test file, `adapters/codex/test/hook-trust-differential.test.js`, with no change
  to `adapters/codex/src/` or `adapters/codex/hooks/`.
- **R2.** The corpus is a pure function of `(SEED, CAP)` and the fixed-case list. It is identical on
  every machine: machine paths (`«BIN»`, `«ROOT»`) enter as placeholders, filled in only at
  run time. A test pins this by generating the corpus twice and comparing.
- **R3.** Every command the matcher trusts runs under each shell leg. A command passes only if all
  of these hold:
  - exit status 0 and no signal;
  - stdout and stderr are both empty;
  - the stub `node` ran exactly once, with exactly one argument, which starts with `/` and ends with
    `TAIL`;
  - no `marker` file in the run's cwd;
  - no `NODE_*` variable in the stub's exported environment.

  The last three clauses (stdout, marker, `NODE_*`) are DC-5 (c), the recommendation; under (a)
  only exit, stderr and argv remain.
- **R4.** A shell missing from the test process's `PATH` skips that leg with
  `{ skip: '<shell> is not on PATH, so its leg did not run' }`. The skip never covers other legs.
- **R5.** At least `ACCEPTED_FLOOR` commands are trusted (anti-vacuity). A matcher that narrows, or a
  `TMPDIR` holding non-path characters, fails loudly instead of fuzzing nothing.
- **R6.** Every interpreter-table entry that the matcher trusts, once rendered, exists on disk
  (`node` excepted, which is resolved through `PATH`). A generator bug therefore fails as a bug, not
  as a false differential.
- **R7.** The prior witnesses are fixed cases at the head of the corpus, with their payload rewritten
  to the `mark` stub, and they are also mutation seeds.
- **R8.** At HEAD the test is green under every present shell. The proof of done, recorded in the PR,
  is that the chosen `(SEED, CAP)` kills K1-K11 (§Context), re-measured on the committed
  implementation. Runtime stays within DC-1's budget.
- **R9.** All filesystem effects stay in one `mkdtemp` tree per leg, removed in `finally`. Each spawn
  gets a `SPAWN_TIMEOUT_MS` timeout, so a hang fails the case instead of stalling the gate.
- **R10.** Any test failure prints each failing case: corpus index, shell, command (JSON-escaped),
  root-env keys, and the observed status, signal, stderr, invocations, marker and `NODE_*` presence.
  The same seed plus that index reproduces the case anywhere.
- **R11.** No provenance in the test file: no ADR, DC, K or backlog identifiers in names, titles or
  comments.
- **R12.** The BACKLOG entry is marked delivered, in house style.

## Design

### Part 1 — the differential test (`adapters/codex/test/hook-trust-differential.test.js`)

Context block:
- Subject: `selectCraftHook` and `GUARD_SCRIPT_SEGMENTS` from `../src/hook-trust.js`. Current
  signature: `selectCraftHook(hooks: Array<{command, sourcePath, source}>, { errors = [] } = {})`
  returns the hook or throws. Refusal message: `/no craft hook found/`. The hook fixture must carry
  `source: 'user'`: a `project` source throws a *different* error after a match.
- Registered command: read `adapters/codex/hooks.json` → `.hooks.PreToolUse[0].hooks[0].command`,
  as `hook-trust.test.js` does at L21-22. Do not retype it.
- Style references: `hook-trust.test.js` (named constants, Given/When/Then titles, AAA, `sut`) and
  `config.test.js` (`spawnSync` with an env built from scratch, `mkdtempSync` with `try/finally`,
  `withSpacedRoot(act)`). Imports: `node:test` (`describe`, `it`), `node:assert/strict`,
  `node:child_process` (`spawn`), `node:fs`, `node:os` (`tmpdir`), `node:path`
  (`join`, `delimiter`, `dirname`), `node:url`. No new dependency.
- No existing test uses `{ skip }`. This file introduces it, per R4.

**Throwaway tree, one per shell leg and one per self-check that renders paths (`withStubTree(act)`,
`try/finally` + `rmSync`):**

```
<tmp>/                     mkdtempSync(join(tmpdir(), 'craft-trust-fuzz-'))
  bin/node                 #!/bin/sh  printf '%s\0' "$#" "$@" >> argv.log ; export -p >> env.log
  bin/mark                 #!/bin/sh  : > marker
  home dir/                HOME: empty and spaced, so a wrongly trusted bare $HOME splits (DC-7)
  craft-root/              <root>: unspaced, see DC-7
  other/                   <other>: the CLAUDE_PLUGIN_ROOT that CRAFT_ROOT must win over
  runs/<n>/                one fresh cwd per shell run; the stubs write relative to it
```

The stubs bake in no absolute path: they write to their cwd. A command that changed directory before
running `node` leaves no `argv.log` in the run's cwd, so it fails the oracle (fail-closed).

**Spawn.** Each spawn is `spawn(shellPath, ['-c', command], { cwd: runDir, env, timeout:
SPAWN_TIMEOUT_MS })`, where `env = { PATH: <bin>, HOME: <home dir>, ...rootEnv }`. Nothing is
inherited. `rootEnv` is one of three:

- `{}`, where the shim expands to nothing and a `SHIM/…` operand stays rooted at `/`;
- `{ CLAUDE_PLUGIN_ROOT: <root> }`;
- `{ CRAFT_ROOT: <root>, CLAUDE_PLUGIN_ROOT: <other> }`.

The PRNG draws one per command. stdout and stderr are collected, and up to `POOL_SIZE` (8) spawns
run concurrently through an async worker pool (DC-2).

**Oracle (`judge(run)` → `null` or a failure record).** It checks R3 in this order: status and
signal, then stdout and stderr, then the `argv.log` records, then the marker, then `env.log`.

`argv.log` is a stream of NUL-separated fields: `count, arg1 … argN`, repeated once per invocation.
The parse yields one array per invocation. `env.log` passes when it has no match for `/\bNODE_\w*=/`.
`export -p` prints `export NAME=…` under dash and bash in sh mode; the regex does not depend on that
prefix. It is fail-closed: a stray match (say, a value that contains `NODE_X=`) can only turn a case
red, never hide one.

**Corpus.** A command is a list of segments: literal text, or a placeholder (`«BIN»`, `«ROOT»`)
filled in at run time. `SHIM` and `TAIL` are literal text, since the matcher sees them literally.

- **PRNG:** `mulberry32(SEED)`, inline (about 6 lines). `SEED` and `CAP` are named constants (DC-1).
- **Fixed cases first (R7).** They are filtered and judged like every other case. At HEAD only
  the first four are trusted; the rest are refused and act as mutation seeds and as regression
  anchors (if a rule change ever trusts one of them, the shells judge it). Notation: `«BIN»` and
  `«ROOT»` are placeholders, `«SHIM»` and `«TAIL»` the constants, all concatenated with no space;
  everything else is literal shell text.

  | Fixed case | Shape |
  |---|---|
  | registered command (from `hooks.json`) | `node "«SHIM»«TAIL»"` |
  | legacy bare shim | `node «SHIM»«TAIL»` |
  | absolute interpreter, bare literal operand | `«BIN»/node «ROOT»«TAIL»` |
  | absolute interpreter, quoted literal operand | `«BIN»/node "«ROOT»«TAIL»"` |
  | zsh EQUALS, operand | `node =x«TAIL»` |
  | zsh EQUALS, interpreter | `=«BIN»/node "«ROOT»«TAIL»"` |
  | env assignment as interpreter | `X=/node "«ROOT»«TAIL»"` |
  | node option, quoted | `node "--eval=process.exitCode=0/«TAIL»"` |
  | node option, bare import | `node --import=data:text/javascript,0/«TAIL»` |
  | nested assembly, recursive arithmetic subscript | `node "${y:=a[${z:-$}(mark)]}$[y]«TAIL»"` |
  | nested assembly, array subscript | `node "${y:=a[${z:-$}(mark)]}${a[y]}«TAIL»"` |
  | nested assembly, indirect expansion | `node "${y:=a[${z:-$}(mark)]}${!y}«TAIL»"` |
  | nested assembly, zsh `(e)` flag | `node "${(e)${:-${:-$}(mark)}}«TAIL»"` |

- **Then `CAP` generated commands.** Each draw is a grammar build or a seed mutation, 50/50 (DC-4).
  - *Grammar:* `LEAD + interpreter + SEP + operand + TRAIL`. The operand is
    `PREFIX + body + TAIL + optional ".bak"`, double-quoted half the time. `body` is 0-4 fragments:
    `SAFE` with probability 0.7, else one fragment from a class drawn uniformly out of
    `UNSAFE_CLASSES`. Uniform class draws raised the per-class kill rate: under a flat draw, K2 and
    K9 missed seeds.
  - *Mutation:* pick a seed `{ interpreter, rest }` from the fixed cases. Apply 1-3 char edits
    (insert, delete or replace, from `SAFE ∪ UNSAFE ∪ {n,o,d,e,", ' '}`) at random positions inside
    the literal segments of `rest` only. The interpreter and the placeholders are never edited
    (trap 1).
  - *Interpreter table*, drawn with probability 0.7 good and 0.3 bad:
    - good: `node`, `«BIN»/node`, `«BIN»//node`, `«BIN»/./node`;
    - bad: `X=/node`, `=«BIN»/node`, `./node`, `-r/node`, `"node"`, `\node`, `no""de`, `=node`,
      `nod*`, `X=«BIN»/node`, plus `«BIN»/<f>/node` for each shell-active fragment `f`, that is every
      `UNSAFE` member except `=mark` (trap 2).

    R6 checks the table: it renders each entry, forms `<entry> /x«TAIL»`, and when the matcher
    trusts that command it asserts `existsSync(<rendered entry>)` (`node` excepted).
  - *Fragment tables* (prototype values; the implementer may extend them, never shrink them):

    ```js
    const SAFE = ['a', 'b1', '.', '..', '_', '+', '@', '%', ',', ':', '=', '-', '/', ' ', SHIM, 'é', 'x/y'];
    const UNSAFE_CLASSES = [
      ['$(mark)', '`mark`', '$((1))', '$[1]'],                                         // substitution
      ['${IFS}', '$HOME', '$x', '${x}', '$1', '$@', '${x:-/}', '${CRAFT_ROOT:-/tmp}', '$'], // parameter
      ['*', '?', '[a]', '{a,b}', '~', '=mark'],                                        // glob, brace, tilde, zsh equals
      [';mark;', '&&mark', '|mark', '&', '<', '>', '(', ')', '#'],                     // operators, comment
      ['\\', "'", '"', '\n', '\t', ' ', '!'],                                     // quoting, control, history
      ['${(e)${:-${:-$}(mark)}}', '${y:=a[${z:-$}(mark)]}$[y]'],                       // assembled substitution
    ];
    // ROOT is the «ROOT» placeholder segment, not a string
    const PREFIX = ['/', '/', `${SHIM}/`, `${SHIM}/`, SHIM, '', '-', '--eval=', '=', ' ', '~', '$HOME', ROOT, [ROOT, '/']];
    const LEAD = ['', '', '', ' ', '  ', '\t', 'NODE_OPTIONS=--require=/x ', 'X=1 '];
    const SEP = [' ', ' ', ' ', '  ', '\t', ' '];
    const TRAIL = ['', '', '', '', ' ', '  ', ' --flag', ';mark', ' # c', '\n', '.bak'];
    ```
    (The comments above label the classes for this doc only. The test names the classes through
    constant names, not comments.)

**Filtering.** `isTrusted(command)` calls `selectCraftHook([{ command, source: 'user', sourcePath:
FIXTURE_SOURCE_PATH }])`. It returns `true` on a return, and `false` on an error whose message
matches `/no craft hook found/`. Any other error is rethrown: it is a test bug and is not swallowed.

**Test layout:**

```js
describe('selectCraftHook() — every command it trusts runs only the guard, under each shell', () => {
  it('Given the fixed seed, when the corpus is generated twice, then both corpora are identical', …);
  it('Given the seeded corpus, when the matcher filters it, then at least ACCEPTED_FLOOR commands are trusted', …);
  it('Given every interpreter the corpus can draw, when the matcher trusts it, then a stub exists at that path', …);
  for (const shell of SHELLS)            // ['sh', 'bash', 'dash', 'zsh']
    it(`Given every trusted command, when ${shell} -c runs it with a stub node, then each runs the stub once on one rooted guard path and nothing else`,
       { skip: skipReasonFor(shell) }, async () => { … assert.deepEqual(failures, []); });
});
```

- `findOnPath(name)` scans `process.env.PATH.split(delimiter)` with `accessSync(X_OK)`. It returns
  the absolute path or `null`. `skipReasonFor` returns `false` when the shell is found, else the R4
  string.
- The legs run one after another (the node:test default inside a `describe`). Each runs its own
  pool. `assert.deepEqual(failures, [])` shows every failure record in the diff (R10).
- `ACCEPTED_FLOOR` is about 80% of the trusted count measured on the committed implementation at the
  chosen `(SEED, CAP)` (the prototype gives 74 at 2000, so a floor near 60). It is a named constant
  with a one-line *why* comment.

**Edge behaviour:**

| Situation | Behaviour |
|---|---|
| zsh (or dash) not on `PATH` | that leg reports `# SKIP <reason>`; the others run |
| Ubuntu: `sh` and `dash` are the same binary | both legs run; duplicated cost is about 0.1 s, not worth special-casing |
| `TMPDIR` holds a space or non-path characters | `«BIN»`/`«ROOT»` render to non-literal words, the trusted count collapses, and R5 fails with the count |
| a system `zshenv` rewrites `PATH` | the stub is not reached, and the zsh leg fails loudly (zero invocations) |
| a command hangs | `SPAWN_TIMEOUT_MS` kills it; the signal fails the case |
| a mutation produces a duplicate command | it runs twice; harmless, deterministic |
| the matcher grows a rule that trusts a new shape | if the shells disagree with it, the leg goes red with the case; if they agree, the test stays green (correct) |

### Part 2 — CI zsh (only if DC-3 (b) is chosen)

Context block:
- `scripts/install-dev-tools.sh:4`: `readonly APT_PACKAGES=(shellcheck jq)`. Add `zsh`.
- `test/install-dev-tools.test.js:21`: `const APT_INSTALL = 'apt-get install -y shellcheck jq';`.
  Add ` zsh` to keep it in lockstep; it is red before the script edit.
- ADR-505 and ADR-509 own the shared tool set. The devcontainer runs the same script.

### Part 3 — BACKLOG

Mark "Commit a differential test for the codex trust matcher" (`BACKLOG.md:205`) delivered, in house
style: a bold title, `— delivered <date>` plus the branch, one paragraph with the measured numbers,
and a design link.

## Decision candidates

| # | Choice | Alternatives (≤3) | Recommendation | Why |
|---|---|---|---|---|
| DC-1 | Cap and runtime budget | (a) `CAP = 2000`, seed 1; (b) `CAP = 3000`, seed 1; (c) `CAP = 1000` | (a) | (a): 74 trusted, 296 shell runs, fuzz 0.53-0.58 s, gate wall 1.04 → 1.28 s; seed 1 kills all 11 mutants (last first kill: index 1449). (b) adds headroom (110 trusted; K1-K9 and K11 killed on 8/8 seeds) but takes the gate wall to about 2.0 s, roughly double today. (c) misses K10 at seed 1 (first kill 1449). If the committed implementation's RNG use shifts the kill indices, keep (a)'s cap and pick the smallest seed that kills K1-K11 (R8). Choosing the seed by the K-matrix makes the K-matrix a guaranteed floor, not an estimate for unknown classes; the 8-seed table gives that estimate. |
| DC-2 | Execution model | (a) async `spawn` pool of 8; (b) `spawnSync`, as `config.test.js` does | (a) | Measured 1.5-2.8 ms against 9-14 ms per run (5-7×). At cap 2000, (b) is about 3 s for this file alone. Pool 16 measured no faster than 8 (747 vs 772 ms), and pool 4 took 1197 ms. |
| DC-3 | A shell missing on the machine | (a) per-leg `{ skip: reason }` only; (b) (a), plus `zsh` added to `scripts/install-dev-tools.sh` so CI runs all four legs; (c) hard-fail unless an env allow-list names the missing shell | (b), flagged: Part 2 touches the shared dev-tool set | (a) meets the brief, but CI would skip zsh on every push, and ADR-516 already calls such a skip "a test that sometimes says nothing". zsh is the leg that found EQUALS, and it alone observes K2's operand-glob class (8 → 2 failures without it). (b) costs one apt package (CI install time not measured) and makes the skip a fallback for Linux boxes without zsh. (c) breaks the local gate on such boxes for no safety gain over (b). |
| DC-4 | Generator strategy | (a) grammar fragments plus operand-only mutation of the fixed cases, 50/50; (b) grammar only; (c) mutation only | (a) | Measured kills out of 11, seeds 1-4: (a) 11/11/10/10, (b) 10/11/10/10, (c) 6/7/6/6. (c) cannot reach new interpreters or leads (K5, K9, K11 survive). (a) is the only one where seed 1 kills all 11. A uniform alphabet search almost never yields a trusted command, so grammar is required either way. |
| DC-5 | Oracle observables beyond argv, exit and stderr | (a) the backlog's oracle only: one rooted argv ending in the tail, exit 0, empty stderr; (b) (a) plus a `mark` stub marker and empty stdout; (c) (b) plus no `NODE_*` variable reaching the stub | (c) | node has two inputs, argv *and* env, and the oracle must check every consumer. Without the env check K11 (a leading `NODE_OPTIONS=…` word) survives: 0 failures against 40. Without the marker, 8 of K9's 40 failures disappear (`<bin>/$(mark)/node`: exit 0 and a correct argv, but `mark` ran). Cost: one `export -p` per stub run, within the measured times. |
| DC-6 | The fuzz finds a real differential at HEAD | (a) stop with no commit (red gate): hand back a blocker carrying the counterexample (seed, index, shell, observed) and an uncommitted red `DECOYS`/`NON_WORD_COMMANDS` row for `hook-trust.test.js`, and the user decides between a matcher fix (its own ADR) and a ratified residual; (b) commit the fuzz with the counterexample excluded by a named predicate, pending a decision; (c) fix `hook-trust.js` in this change | (a) | The brief forbids (c), and the contract forbids committing on red. (b) commits an unratified hole. Measured: 0 differentials over 100 000 generated at HEAD, so this is contingency only. |
| DC-7 | How spaced paths enter | (a) unspaced plugin root, spaced `HOME`; (b) also a spaced plugin-root leg, with the bare legacy shim excluded by a predicate; (c) nothing spaced | (a) | A spaced root reproduces only ADR-517's accepted residual (3/3000, bare shim under sh, bash and dash), so (b) needs the test to re-encode that residual as an exclusion. A spaced `HOME` exposes the class a spaced root would catch, a wrongly trusted bare expansion splitting, without the residual: it adds a K10 kill at seed 1. (c) loses that kill. The shipped quoted command under a spaced root is already pinned by `config.test.js` (sh and bash). |
| DC-8 | Seed and cap override for deep manual runs | (a) none: named constants only; (b) env overrides (`CRAFT_TRUST_FUZZ_SEED`, `…_CAP`), validated, defaults unchanged | (a) | A deep soak is a local edit of two constants (or a throwaway loop over seeds), as the prior review cycles did. (b) adds an input the gate must validate, and a lowered cap would trip R5 or need a scaled floor. Revisit if a review cycle needs repeated soaks. |

Settled already, so not candidates:

- The matcher stays as it is (brief; ADR-517).
- The four shells and the oracle core (brief).
- Fixed witness cases (brief).
- A stub `node` with `PATH` isolation in `mkdtemp` (brief).
- An in-test PRNG, no new dependency (brief).
- One unspaced plugin root for the bare legacy shim (ADR-517 residual).

## Test strategy

The deliverable is a test, so "RED" here means a proven-capable test, not a red production change.

- **Self-checks in the file:** determinism (R2), floor (R5) and interpreter existence (R6). Each is a
  plain `it`, green at HEAD.
- **Teeth proof (manual, recorded in the PR, not committed):** for each mutant K1-K11 (§Context
  table: one rule reverted each), copy `adapters/codex/{src,test,hooks.json}` into a `mktemp`
  scratch, apply the one-rule edit to the scratch `src/hook-trust.js`, and run the scratch copy of
  the new test file there. Every
  mutant must turn at least one leg red at the committed `(SEED, CAP)`, and HEAD must stay green
  under all present shells. Record the table: mutant, first failing index, legs.
- **Robustness spot-check (manual):** 25 seeds × 4000 at HEAD, the prototype's run, must stay at
  0 failures with the committed implementation. Record the totals.
- **Gate:** `npm --prefix adapters/codex test` (expect 609 + 7 tests, wall ≤ 1.5 s on this box), then
  `bash scripts/ci.sh`. Check the TAP output: no `# SKIP` on this box, where all four shells are
  present.
- **Skip path proof:** run the file once with a `PATH` that lacks zsh, through a throwaway `PATH`
  holding symlinks to `node`, `sh`, `bash` and `dash`. Expect `# SKIP zsh is not on PATH, so its leg
  did not run`, `# skipped 1`, and exit 0.
- **Mutation testing:** `engine/stryker.conf.json` lists `testFiles` explicitly. The new file is not
  added (Out of scope). Running about 300 shells per Stryker mutant is the wrong tool; the K-matrix
  is this test's mutation proof.
- **Part 2 (if chosen):** `test/install-dev-tools.test.js`'s `APT_INSTALL` assertion goes red first,
  then green after the `APT_PACKAGES` edit.

## Out of scope

- Any change to `adapters/codex/src/hook-trust.js`: the brief's hard line. A differential found now
  follows DC-6.
- Adding the new file to `engine/stryker.conf.json` `testFiles`: the fuzz spawns about 300 shells
  per run, and its capability is proven by the K-matrix instead.
- A spaced plugin-root leg (DC-7 (b)): it only re-observes ADR-517's accepted residual.
- Canonical-path identity (`/proc/self/cwd/…`, `..`): ADR-517 bounds it. The fuzz checks that argv
  is rooted and does not check which file it names.
- Running codex itself in the loop: the matcher runs on `hooks/list` output, and the shell leg already
  models codex's `<login shell> -c <command>` (pinned in
  `docs/contributing/design/codex-hooks-quote-plugin-root.md`).
- Fuzzing the sibling guards' registrations (cursor, antigravity): no adapter besides codex has a
  trust matcher (`selectCraftHook` and `trusted_hash` appear only under `adapters/codex/`, plus
  `adapters/README.md`). To prove a need, run a per-tool argv probe from a spaced root.
