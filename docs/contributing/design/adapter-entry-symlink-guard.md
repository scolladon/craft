# Design — adapter-entry-symlink-guard

> Brief: `adapters/codex/bin/trust-hook.js:54` and `adapters/pi/src/cli.js:4` still guard `main` with
> `process.argv[1] === fileURLToPath(import.meta.url)`; reached through a symlinked path each exits 0
> silently. Swap both guards to the shared `isEntryPoint` from `engine/src/cli-io.js`, and replace the
> literal-string pin in `adapters/pi/test/cli.test.js:44-52` with behavioural checks.
> RED first: a symlinked-path spawn with bad input must exit non-zero.
> Status: draft → self-reviewed ×3

## Context

**The predecessor.** `docs/contributing/design/bin-entry-symlink-guard.md` fixed the 24 `engine/bin/*.js`
and listed these two adapter entries as a follow-up (its Out of scope; ADR-559; `BACKLOG.md` L180-187).
The helper exists and is settled. `isEntryPoint(moduleUrl, argv1)` is exported from `engine/src/cli-io.js`
(ADR-556). It real-paths both sides (ADR-557), maps only `ENOENT` on argv[1] to "not entry" (ADR-558), and
is mutation-covered by `engine/test/cli-io.test.js`. `engine/test/bin-entry-symlink.bin.test.js` is the
behavioural model (ADR-560). `cli-io.js` imports only `node:fs`, `node:path` and `node:url`, so it has no
npm dependency.

**Entry 1: `adapters/codex/bin/trust-hook.js`** (64 lines, ADR-315: a thin shim over the pure
`adapters/codex/src/trust-hook-main.js`). L1-53 are imports, the constant `MISSING_FILE_ERROR_CODE`, and
two function declarations, `readConfig` and `buildDependencies`. Nothing runs at import time. The import
graph (`trust-hook-main`, `config-toml-trust`, `safe-text`, `app-server-client`, `atomic-write`,
`craft-root`, `hook-trust`) has no top-level call apart from `Object.freeze` literals. The pinned
"import as module" row below shows exit 0 and 0 bytes. `fileURLToPath` (L13) is used only by the guard
(L54). Launch: `node adapters/codex/bin/trust-hook.js [--check]`, run from a checkout
(`adapters/codex/README.md` L82, L113, L130). `codex plugin add` copies only `plugins/craft-codex/` into
`$CODEX_HOME/plugins/cache/…` (README L29-33), so `bin/` never leaves the checkout. At runtime
`resolveCraftRoot(import.meta.url)` (`adapters/codex/src/craft-root.js`) already refuses unless
`engine/bin` sits three directories above the module. Exit contract (`trust-hook-main.js` L25-27):
0 trusted / 1 untrusted / 2 refusal. `parseCheckMode` runs first and throws on any argv other than `[]`
or `['--check']`, so `--bogus` gives exit 2 `trust-hook: unrecognised argument(s): --bogus`. That happens
before any spawn, read or write. trust-hook's import graph has no static `engine/src` edge today. Its
siblings do: `adapters/codex/src/git-guard-adapter.js:14` and `adapters/codex/src/probe.js:9`.

**Entry 2: `adapters/pi/src/cli.js`** (9 lines). `import { main } from './run.js'`, then a top-level
`await main(...)` inside the guard. `fileURLToPath` (L2) is used only by the guard (L4). The brief says
`adapters/pi/src` imports nothing from engine. That is wrong: `run.js:5` already statically imports
`../../../engine/src/frontmatter.js`, which needs `engine/node_modules/js-yaml`. The same is true of
`tool-call-hook.js:3` and `probe.js:8`. So `craft-pi` already requires the full checkout.
`adapters/pi/package.json` is `private: true` with no `version`, and declares `bin: { craft-pi:
src/cli.js }`. `pi install ./adapters/pi` loads the `pi` manifest resources (extensions, prompts) in
place and never runs `cli.js` (`adapters/pi/README.md`). The `craft-pi` bin is reachable only by
`node adapters/pi/src/cli.js` or by an npm folder install, which symlinks the package and its bin (pinned
below). `npm pack` refuses the package (`Invalid package, must have name and version`), so no copying
install exists.

**Existing pi tests.** `adapters/pi/test/cli.test.js` (193 lines) has a `cli.js — subprocess execution
guard` describe. Its hermetic harness follows ADR-345: `before()` builds `root = mkdtemp`, `binDir`
holding only `node` and `git` symlinks, `PINNED_ENV = {PATH: binDir, HOME: root, GIT_CONFIG_GLOBAL:
'/dev/null', GIT_CONFIG_SYSTEM: '/dev/null', GIT_CONFIG_NOSYSTEM: '1'}`, and a `git init`-ed `repoDir`.
`runCli(...args)` spawns `CLI_PATH` with `cwd: repoDir`. The test at L44-52 asserts that the source
`includes("process.argv[1] === fileURLToPath(import.meta.url)")`. It breaks on any correct fix, and it
passes over the dead guard. **No test spawns `trust-hook.js` at all.** `trust-hook-main.test.js` only
reads it as text, in its bypass-flag source scan at L691.

**Inventory: other entries with this defect.** `git ls-files` across all tracked `*.js`/`*.mjs`/`*.cjs`
outside `engine/bin/` finds `process.argv[1]`, `import.meta.main` and `require.main` guards only at
`adapters/codex/bin/trust-hook.js:54` and `adapters/pi/src/cli.js:4`. The only other match is the
`isEntryPoint` docblock in `cli-io.js`. A `pathToFileURL(process.argv…)` grep finds nothing. The
node-shebang files outside `engine/bin/` are exactly these two. The `adapters/*/hooks/*.js` guards run
unconditionally with no entry check, so they are unaffected. **Scope stays the two named entries.**

**Test wiring.** `scripts/ci.sh` L52/L55 call `run_suite` with `find <dir> -name '*.test.js'`, which also
matches `*.bin.test.js`. Both adapter `package.json` scripts run `node --test 'test/**/*.test.js'`.
`engine/stryker.conf.json` lists adapter tests explicitly in `tap.testFiles`. That list includes
`adapters/codex/test/trust-hook-main.test.js` but not `adapters/pi/test/cli.test.js`. Neither entry file is
in `mutate`. The one decision under test (`isEntryPoint`) is already mutated in `engine/src/**`, so
nothing joins `mutate`.

## Requirements

- R1 — Each entry, spawned through a path whose directory components or file are symlinks to the real
  checkout, runs `main`: codex `--bogus` → exit 2, stderr `trust-hook: unrecognised argument(s): --bogus`;
  pi with no `pi` on PATH → exit 2, stderr `{ unit: pi-run, reason: spawn pi ENOENT }`. This includes
  npm's bin shape, an extensionless file symlink `craft-pi → …/src/cli.js`.
- R2 — Each entry imported as a module (`node --input-type=module -e "await import(…)"`) does not run
  `main`: exit 0, empty stdout and stderr.
- R3 — Reached by the physical path, each entry's exit code, stdout and stderr are byte-identical to today.
- R4 — Neither entry keeps a `process.argv[1] ===` comparison. Both call
  `isEntryPoint(import.meta.url, process.argv[1])` imported from `engine/src/cli-io.js` and drop their
  `node:url` import. No entry-point logic is added outside the shared helper. `engine/stryker.conf.json`
  is unchanged.
- R5 — The R1 tests make their own links, so they are red on macOS and Linux today. They are hermetic
  (ADR-345): no real `codex` or `pi` is reachable, and `HOME`/`CODEX_HOME` are throwaways, so even a
  wrongly-true guard ends in a spawn `ENOENT`. It never touches the user's config.
- R6 — No test pins the guard's source text (ADR-560: behaviour over structure).

## Design

### Pinned behaviour (probes in a mktemp throwaway; macOS, Node 22.22.3 unless noted)

Setup: an `rsync` copy of the worktree at `<tmp>/copy` (including `engine/node_modules`). Links:
`rootlink → copy`, `codexlink → copy/adapters/codex`, `pilink → copy/adapters/pi`. Synthetic PATH = a dir
holding only `node` and `git` symlinks. `env -i` with `HOME`/`CODEX_HOME` = throwaways and git config
pinned to `/dev/null`. stdin = `/dev/null`. Pi spawns use cwd = a `git init`-ed throwaway. npm bin shape:
`npm install -g --prefix <tmp>/prefix <tmp>/copy/adapters/pi` (isolated `--cache`,
`npm_config_userconfig=/dev/null`; npm 12.2.0). It created `prefix/lib/node_modules/@craft/adapter-pi →
copy/adapters/pi` and `prefix/bin/craft-pi → ../lib/node_modules/@craft/adapter-pi/src/cli.js`, both
symlinks. "post" = the copy patched with the R4 swap (direct `../../../engine/src/cli-io.js` import).

| Invocation | today: exit / bytes | post: exit / bytes |
|---|---|---|
| `node copy/adapters/codex/bin/trust-hook.js --bogus` | 2 / 45 | 2 / 45 |
| `node rootlink/adapters/codex/bin/trust-hook.js --bogus` | **0 / 0** | 2 / 45 |
| `node codexlink/bin/trust-hook.js --bogus` | **0 / 0** | 2 / 45 |
| `node --input-type=module -e "await import(<trust-hook.js>)"` (today: physical; post: via codexlink) | 0 / 0 | 0 / 0 |
| `node copy/adapters/pi/src/cli.js` | 2 / 41 | 2 / 41 |
| `node rootlink/adapters/pi/src/cli.js` | **0 / 0** | 2 / 41 |
| `node pilink/src/cli.js` | **0 / 0** | 2 / 41 |
| `node prefix/bin/craft-pi` (npm bin symlink) | **0 / 0** | 2 / 41 |
| `craft-pi` by name with `prefix/bin` on PATH | **0 / 0** | 2 / 41 |
| `node --input-type=module -e "await import(<cli.js>)"` (today: physical; post: physical and via pilink) | 0 / 0 | 0 / 0 |

So the `craft-pi` bin is silent in every npm install today, not only through a symlinked checkout.

Post-fix matrix across Node versions (`codexlink --bogus` / codex import / `pilink` / npm bin / pi import):
18.20.8 → 2 / 0 / 1 / 1 / 0; 20.19.5, 22.22.3, 24.11.0, 25.1.0 → 2 / 0 / 2 / 2 / 0. On 18.20.8 the pi rows
exit 1 on the physical path too, with the same `{ unit: engine-bin, … engine/src/glob.js:6 }` failure. That
is a pre-existing Node 18 gap in the pi path, unrelated to this change. Link and physical still match there.

**Failure-mode shifts caused by the new static `engine/src` edge.** These are the only rows where "post"
is worse than "today". Both are loud, and both are the evidence for candidate 1.

| Invocation | today | post |
|---|---|---|
| `node --preserve-symlinks-main pilink/src/cli.js` (hand-made link to `adapters/pi` alone) | 2 / 41 (runs: `./run.js` is real-pathed, so its engine import resolves) | **1**, `ERR_MODULE_NOT_FOUND …/engine/src/cli-io.js` (the main module's relative import resolves from the link) |
| `node --preserve-symlinks-main codexlink/bin/trust-hook.js` (no args; post also with `--bogus`) | 2, `resolveCraftRoot: computed root "<tmp>" does not contain engine/bin` | **1**, `ERR_MODULE_NOT_FOUND` |
| `trust-hook.js --check` in an adapter-only copy (no `engine/` three levels up) | 2 refusal (`resolveCraftRoot` … `wrong up-walk depth`) | **1** (`ERR_MODULE_NOT_FOUND`), which a `--check` consumer reads as "untrusted" |
| `--preserve-symlinks-main` + `rootlink/…` (either entry) | 2 | 2 (unchanged) |
| `NODE_OPTIONS=--preserve-symlinks-main` + npm bin `craft-pi` | 1, `ERR_MODULE_NOT_FOUND …/prefix/bin/run.js` | 1, `ERR_MODULE_NOT_FOUND` (broken both ways) |

Hermeticity pin: `trust-hook.js` with no args, synthetic PATH without `codex`, `CODEX_HOME`=empty
throwaway gives exit 2 `trust-hook: app-server process error: spawn codex ENOENT`, and nothing is written
under `CODEX_HOME` or `HOME`. So a guard mutated to `true` in the import test stays hermetic.

### Shape (drawn with recommended candidate 1a)

```js
// adapters/codex/bin/trust-hook.js — L13 and L54 only; L1-12, L14-53, L55-63 unchanged
import { isEntryPoint } from '../../../engine/src/cli-io.js';
…
if (isEntryPoint(import.meta.url, process.argv[1])) {
```

```js
// adapters/pi/src/cli.js
#!/usr/bin/env node
import { isEntryPoint } from '../../../engine/src/cli-io.js';
import { main } from './run.js';
if (isEntryPoint(import.meta.url, process.argv[1])) {
  // (existing EQUIVALENT-MUTANT comment and dispatch unchanged)
```

The import spelling matches the adapters' existing engine imports (`git-guard-adapter.js:14`, `run.js:5`).
Node resolves the relative specifier from the main module's real path, so it works through
every link shape in the first table. `process.exit` and the `.catch` net stay in each entry (ADR-066 /
ADR-315 thin-shim shape). The trust-hook `.catch` → `EXIT_REFUSED` net is unchanged. `isEntryPoint` can
throw a non-`ENOENT` error (ADR-558: argv[1] crossing a regular file or a symlink loop, which cannot
happen for a path Node just loaded). That throw happens synchronously in the guard, before `main`, so it
surfaces as an uncaught stack and exit 1, loud by design (ADR-558). No adapter-specific handling.

### Edge behaviour

Inherited unchanged from `isEntryPoint`: absent or empty argv[1] (`node -e`) → false. A non-existent
argv[1] (extensionless spelling of a real file, `-`) → false, silent as today. Through an npm bin
symlink the extensionless argv[1] does exist, as a symlink, so it real-paths to `cli.js` → true (pinned
row). `--preserve-symlinks-main` with a link that keeps `engine/` three levels above the link
(rootlink) → true. With a link to the adapter dir alone → module-not-found, exit 1 (candidate 1).

## Decision candidates

| # | Choice | Alternatives (≤3) | Recommendation | Why |
|---|---|---|---|---|
| 1 | How each entry reaches `isEntryPoint` | (a) direct static `import … from '../../../engine/src/cli-io.js'` in both entries; (b) indirection that keeps today's failure modes: pi imports via a one-line re-export `adapters/pi/src/entry-point.js` (non-main modules are real-pathed, so `--preserve-symlinks-main` with an adapter-only link keeps working), and codex loads the helper with `await import()` inside a try that maps a load failure to `EXIT_REFUSED` (keeps `--check` exit 2 in an adapter-only copy) | (a) | (a) matches every existing adapter→engine edge (`git-guard-adapter.js:14`, `run.js:5`, `probe.js:8-9`). The only regressions it causes (pinned table) are combinations no supported install produces: an adapter-only copy (the codex marketplace never carries `bin/`, and `resolveCraftRoot` already refuses without `engine/bin`), and `--preserve-symlinks-main` through a hand-made link to the adapter dir alone (the npm bin + that flag is already broken today). Both are loud non-zero exits, never a silent 0, and `--check` still never returns 0 from an unsafe state. (b) adds a module plus error-mapping logic to files outside `mutate` to preserve behaviour in unsupported layouts |
| 2 | Regression pin for future adapter entry points (ADR-315: other bindings inherit `bin/`) | (a) per-entry behavioural tests for the two named entries only; (b) also a sweep enumerating `adapters/*/bin/*.js` (+ pi's `package.json` `bin`) spawned through a test-made link, ADR-560 style; (c) a repo-wide text pin forbidding `process.argv[1] ===` | (a) | Only two entries exist. Their loud inputs and hermetic environments differ (codex: `--bogus`, no `codex` on PATH, throwaway `CODEX_HOME`; pi: a `git init`-ed cwd, pinned git config, no `pi` on PATH, ADR-345). A sweep would need an override for 100% of its members, so auto-enrolment gains nothing and a new bin still needs a hand-written entry. (c) is the text-pin shape ADR-560 rejected |

Pre-decided, not re-opened: helper home (ADR-556), comparison (ADR-557), error policy (ADR-558),
behavioural over text pins (ADR-560), hermetic subprocess env (ADR-345), thin shim + `process.exit` in the
entry (ADR-066 / ADR-315). The scope question (other entries) has no candidate: the inventory found none.

## Test strategy

**Codex: new `adapters/codex/test/trust-hook.bin.test.js`.** It mirrors the `engine/test/<bin>.bin.test.js`
naming and is picked up by `ci.sh` `run_suite adapters/codex` and the package `test` script. It is a new
file rather than additions to `trust-hook-main.test.js`, which is in Stryker's `tap.testFiles`. Spawns
there would add subprocesses to every mutation dry run for no mutant (neither entry is in `mutate`).
Constants: `ADAPTER_DIR = join(dirname(fileURLToPath(import.meta.url)), '..')`, `BIN = join(ADAPTER_DIR,
'bin', 'trust-hook.js')`, `LOUD_ARGV = ['--bogus']`, `EXPECTED_STDERR = 'trust-hook: unrecognised
argument(s): --bogus\n'`. Fixture `withSandbox(fn)`: `mkdtempSync(join(tmpdir(), 'craft-trust-hook-'))`,
`bin/node → process.execPath`, `symlinkSync(ADAPTER_DIR, join(tmp, 'codex-link'))`, and a frozen
env `{ PATH: <tmp>/bin, HOME: tmp, CODEX_HOME: <tmp>/codex-home }`. The env is built from scratch, never
by spreading `process.env`. Spawns use `cwd: tmp`, `input: ''`, `encoding: 'utf8'`, and `try/finally
rmSync`.

| # | Given / When | Then |
|---|---|---|
| C1 (RED) | trust-hook reached through `codex-link/bin/trust-hook.js`, spawned with `--bogus` | `error` undefined, status 2, stderr `EXPECTED_STDERR`, stdout `''` |
| C2 | trust-hook by its physical path, `--bogus` | same as C1 (R3 parity; the first spawn test this bin has) |
| C3 | trust-hook imported as a module (`--input-type=module -e "await import(<pathToFileURL(BIN).href>)"`) | status 0, stdout `''`, stderr `''` (R2). With a wrongly-true guard, main runs in write mode, gets spawn `codex` `ENOENT`, and exits 2, which turns the test red |

**Pi: edit `adapters/pi/test/cli.test.js`.**

- Delete the literal-string test (L44-52, `guards on import.meta.url before calling process.exit`). Its
  intent ("importing the module does not run it") moves to P3 as a behaviour.
- In the `cli.js — subprocess execution guard` describe, add `ADAPTER_DIR = join(__dir, '..')`. In the
  existing `before()`, also create `symlinkSync(ADAPTER_DIR, join(root, 'pi-link'))` and the npm bin
  shape `mkdirSync(join(root, 'npm-bin'))` + `symlinkSync(CLI_PATH, join(root, 'npm-bin', 'craft-pi'))`.
  Generalise `runCli` to take the entry path (or add `spawnEntry(entryPath, ...args)` with
  `runCli = (...a) => spawnEntry(CLI_PATH, ...a)`), reusing `PINNED_ENV` and `cwd: repoDir`. The
  `after()` `rmSync(root)` already covers the links.

| # | Given / When | Then |
|---|---|---|
| P1 (RED) | cli.js reached through `pi-link/src/cli.js`, no `pi` on PATH | status 2, stderr trimmed `{ unit: pi-run, reason: spawn pi ENOENT }` |
| P2 (RED) | cli.js reached through the npm bin shape `npm-bin/craft-pi` (extensionless file symlink) | same as P1 |
| P3 | cli.js imported as a module under `PINNED_ENV`, `cwd: repoDir` | status 0, stdout `''`, stderr `''`. A wrongly-true guard gives exit 2 `ENOENT` → red |

The existing physical-path tests (L155-191) stay unchanged and carry R3.

RED today: C1, P1 and P2 fail with exit 0 and no output, on macOS and Linux (the links are test-made).
C2, C3 and P3 are green today and stay green: regression pins for R2/R3. GREEN after the R4 swap.

**Mutation.** No change to `engine/stryker.conf.json`. `isEntryPoint` mutants are already killed by its
suite in `engine/test/cli-io.test.js`. The entries stay outside `mutate` (thin-shim rule). The new tests
prove the wiring, not the predicate.

**Gate.** `bash scripts/ci.sh`.

**Part sketch (plan phase owns the final cut).** P1: codex: new `trust-hook.bin.test.js` (C1 red) +
the trust-hook guard swap (GREEN). P2: pi: rewrite `cli.test.js` (P1/P2 red, P3, literal test removed)
+ the cli.js guard swap (GREEN). The parts are independent and either can land first.

## Out of scope

- An adapter-only copy, or `--preserve-symlinks-main` through a link to the adapter dir alone. Both
  become loud exit 1 under candidate 1a (pinned). Neither is a supported install.
- Node 18 failing the pi path at `engine/src/glob.js` (exit 1 physical and linked alike): pre-existing,
  unrelated to the guard.
- Extensionless spelling of a real entry file (`node adapters/pi/src/cli`): silent as today, inherited
  from ADR-558.
- `BACKLOG.md` entry L180-187 status flip: integration bookkeeping, not design.
- `import.meta.main`: excluded by ADR-557 while `engines` admits Node 18/20.
- `adapters/*/hooks/*.js`: no entry guard (they run unconditionally). ADR-518's static-import discipline
  for `hooks/craft-guard.js` is untouched.
