# Design — bin-entry-symlink-guard

> Brief: every `engine/bin/*.js` guards `main()` with `process.argv[1] === fileURLToPath(import.meta.url)`;
> reached through a symlinked path the guard is false, the bin exits 0 silently, and any gate that shells
> out to it passes without running. Replace the 24 copies with ONE shared real-path entry-point predicate.
> RED first: a bin spawned through a symlinked path with bad input must not be silent.
> Status: draft → self-reviewed ×3

## Context

**The bins.** `engine/bin/` holds 24 thin shims (ADR-066: logic lives in `engine/src/<bin>-main.js`, the
bin keeps only `import { main }` + the entry-point guard + the `process.exit` dispatch, and stays outside
the Stryker `mutate` glob). Three shapes, all carrying the same guard on line 4 or 5:

| Shape | Bins | Dispatch |
|---|---|---|
| sync | adr-lint, config-resolve, contract-assemble, contracts-lint, dod-assert, hygiene-gate, init-config, init-land, intention-lint, manifest-lint, pipeline-lint, pipeline-resolve, plan-lint, promote-plan, prose-lint, readme-drift, stub-lint, tune-plan (18) | `process.exit(main(argv, { stdout, stderr }))` |
| sync + stdin | filter-findings, init-emit, normalize-findings, run-state (4) | adds `readStdin: () => readFileSync(0, 'utf8')` |
| async | metrics-emit, usage-mine (2) | `process.exit(await main(argv, { stdout, stderr }))` |

```js
#!/usr/bin/env node
import { fileURLToPath } from 'node:url';
import { main } from '../src/adr-lint-main.js';
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.exit(main(process.argv.slice(2), { stdout: process.stdout, stderr: process.stderr }));
}
```

**Who shells out to them.** `scripts/{adr-lint,manifest-lint,plan-lint,readme-drift}.sh` exec
`node "$ROOT/engine/bin/<bin>.js"` with `ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"` (the
logical `pwd` keeps the symlink); `scripts/ci.sh` L76/L102/L121/L134 and `scripts/static-lints.sh` L8-10
use cwd-relative `node engine/bin/…`; `hooks/reorient-after-compact.sh` L68 prints a
plugin-root-prefixed `run-state.js` command. Nothing imports a bin in-process (repo-wide grep for
`from '…bin/…'` / `import('…bin/…')`: zero hits) — tests import the `-main.js` modules and spawn the bins.

**The shared helper home.** `engine/src/cli-io.js` (70 lines) — ADR-487 makes it "the single home of the
shared lint predicates": `EXIT_OK`, `EXIT_ERR`, `isRegularFile`, `isDirectoryPath`, `isNonEmptyString`,
`fail(io, message)`, `findRepoRoot(startDir)`. Suite: `engine/test/cli-io.test.js` (147 lines, 12 tests,
`withTmp(fn)` fixture, already imports `symlinkSync`). It sits inside `mutate` (`engine/stryker.conf.json`
`"engine/src/**/*.js"`).

**Real-path precedent.** `engine/src/contain.js` `realExistingPrefix` (ADR-175) catches `ENOENT` only and
rethrows every other `realpathSync` error.

**Prior sightings.** `docs/contributing/design/arriving-guard-part-bound.md` L492-493 already worked
around this ("call it by its physical path, `pwd -P`, or the `argv[1]` guard skips `main` and prints
nothing") without fixing it.

**Bin-level test house style.** `engine/test/<bin>.bin.test.js` (22 of the 24 bins have one;
contract-assemble and contracts-lint do not): `BIN = join(dirname(fileURLToPath(import.meta.url)), '..',
'bin', '<bin>.js')`, `spawnSync(process.execPath, [BIN, ...args], { encoding: 'utf8' })`,
`mkdtempSync(join(tmpdir(), …))` + `try/finally rmSync`. Because `BIN` derives from the test's own
real-path `import.meta.url`, no existing test reaches a bin through a symlink — the whole suite is green
over a dead guard. CI runs `ubuntu-latest` (`.github/workflows/ci.yml`), where `tmpdir()` is not a
symlink, so even a `tmpdir()`-rooted copy would not reproduce there: the RED must build its own link.

## Requirements

- R1 — A bin spawned as `node <path>/engine/bin/<bin>.js …` runs `main` whenever `<path>` resolves to the
  real checkout, through any number of symlinked directory components, a symlink to the bin file itself,
  or under `--preserve-symlinks-main`.
- R2 — A bin imported (not executed) never runs `main`: `node -e "await import(<bin>)"`, a test file
  importing it, stdin-fed `node -`.
- R3 — The guard never throws for an absent `process.argv[1]` (`node -e`) and returns false for a
  non-existent one.
- R4 — The decision logic lives in ONE exported function under `engine/src/` (mutation-covered); every
  `engine/bin/*.js` calls it; no bin keeps a `process.argv[1] ===` comparison.
- R5 — A test proves R1 for every file in `engine/bin/` through a link the test creates itself, so it is
  red on macOS and Linux today and catches a future 25th bin that copies the old guard.
- R6 — Bin exit codes, stdout and stderr are byte-identical to today when reached by the physical path.

## Design

### Pinned behaviour (probes in a mktemp throwaway; Node from `n`, macOS)

Probe module `real/bin/probe.js` (`"type":"module"`), `dirlink → real`. Columns evaluate four guards in
the same process: `today` = current guard; `realArgv1` = `realpathSync(argv[1]) === fileURLToPath(url)`;
`realBoth` = `realpathSync(argv[1]) === realpathSync(fileURLToPath(url))`; last two columns =
`import.meta.main` per Node version. Want: true in the first three rows, false in the last two.

| Invocation | today | realArgv1 | realBoth | `import.meta.main` 18.20.8 / 20.19.5 / 20.20.2 | `import.meta.main` 22.22.3 / 24.11.0 / 25.1.0 / 26.11.0 |
|---|---|---|---|---|---|
| `node real/bin/probe.js` | true | true | true | undefined | true |
| `node $T/dirlink/bin/probe.js` | **false** | true | true | undefined | true |
| `node --preserve-symlinks-main $T/dirlink/bin/probe.js` | true | **false** | true | undefined | true |
| `node --input-type=module -e "await import(…probe.js)"` | false | false | false | undefined | false |
| `node t/x.test.mjs` (imports probe) | false | false | false | undefined | false |

`today`/`realArgv1`/`realBoth` columns are identical on all seven Node versions probed (18.20.8,
20.19.5, 20.20.2, 22.22.3, 24.11.0, 25.1.0, 26.11.0). Further pins (Node 22.22.3):

| Probe | Result |
|---|---|
| `node $T/filelink.js` (symlink to the bin file) | argv[1] = link path, url = real path → today false, realBoth true |
| `node real/bin/probe` (extension omitted) | argv[1] = extensionless path, `realpathSync` → `ENOENT`; today false, realBoth false, `import.meta.main` true |
| `echo … \| node --input-type=module -` | argv[1] = `'-'`, `realpathSync('-')` → `ENOENT` |
| `cd $T/dirlink && node bin/probe.js` | argv[1] already physical (`getcwd` is physical) → today true |
| `node $T/real/bin/../bin/probe.js` under `/var/folders/…` | argv[1] = `/var/…` (normalised, not real-pathed), url = `/private/var/…` → today false |
| `realpathSync(undefined)` / `(null)` | no `TypeError`: the value is stringified to a cwd-relative path (`lstat '<cwd>/undefined'`) → `Error` code `ENOENT`; with a file named `undefined` in cwd it **succeeds** and returns that file. Same on 18.20.8, 20.19.5, 22.22.3, 24.11.0, 25.1.0, 26.11.0 |
| `realpathSync('-')` | `ENOENT` (cwd-relative `-`) |
| `realpathSync('')` | returns cwd (no throw), all versions above |

Repo-level pins (full `rsync` copy of the worktree into a mktemp, `link → copy`, cwd = an empty mktemp,
`HOME` = an empty mktemp, stdin `/dev/null`):

- All 24 bins via `link/engine/bin/<bin>.js`: exit 0, 0 bytes — with no argv (all 24) and with
  `usage-mine --source bogus`.
- All 24 bins via the `rsync` copy's `/var/…` path (i.e. merely living under macOS `tmpdir()`): exit 0,
  0 bytes — the physical `/private/var/…` path is the only one that works.
- `link/scripts/readme-drift.sh /nonexistent` → exit 0; `<copy>/scripts/readme-drift.sh /nonexistent` via
  `/private/var` → exit 1.
- Physical path, argv `['/nonexistent']`, all 24 bins:

| Bin | exit | bytes | Bin | exit | bytes |
|---|---|---|---|---|---|
| adr-lint | 2 | 84 | manifest-lint | 0 | 86 |
| config-resolve | 1 | 88 | metrics-emit | 1 | 37 |
| contract-assemble | 2 | 104 | normalize-findings | 2 | 75 |
| contracts-lint | 2 | 444 | pipeline-lint | 2 | 70 |
| dod-assert | 1 | 75 | pipeline-resolve | 2 | 99 |
| filter-findings | 2 | 33 | plan-lint | 2 | 38 |
| hygiene-gate | 0 | 9 | promote-plan | 1 | 86 |
| init-config | 1 | 85 | prose-lint | 0 | 81 |
| init-emit | 1 | 54 | readme-drift | 1 | 103 |
| init-land | 1 | 67 | run-state | 2 | 25 |
| intention-lint | 2 | 219 | stub-lint | 0 | 81 |
| tune-plan | 1 | 79 | usage-mine | **0** | **0** (writes `report.json` + `report.md` into cwd) |

  `usage-mine --source bogus` → exit 1, `usage-mine: unknown --source 'bogus' (…)`, no files written;
  via the link → exit 0, 0 bytes. 24 physical spawns cost 0.92 s wall total.

Evidence for candidate 2: `import.meta.main` is `undefined` on Node 18 and 20, which the
`engine/package.json` `engines: ">=18"` floor admits — the guard would be falsy there and reproduce the
same silent exit 0 on every invocation. Dropping the guard entirely is excluded by ADR-066 (the bin is
"`import { main }` + the entrypoint guard") and would make an accidental import `process.exit` the
importer.

### Shape (drawn with the recommended candidates 1a + 2a + 3a)

`engine/src/cli-io.js` gains one export; the predicate stays pure of `process.*` (argv[1] is passed in) so
it is unit-testable in-process and mutation-covered:

```js
import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * True when the module at moduleUrl is the process entry script named by argv1.
 * Both sides are real-pathed: Node real-paths the main module's URL but keeps argv[1]
 * as typed, and --preserve-symlinks-main keeps the URL symlinked instead.
 * @param {string} moduleUrl - the caller's import.meta.url
 * @param {string | undefined} argv1 - process.argv[1]
 * @returns {boolean}
 */
export function isEntryPoint(moduleUrl, argv1) {
  if (!isNonEmptyString(argv1)) return false;
  return realPathOrNull(argv1) === realpathSync(fileURLToPath(moduleUrl));
}

function realPathOrNull(path) {
  try {
    return realpathSync(path);
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}
```

Every bin keeps its dispatch line and swaps only the guard (and drops its `node:url` import):

```js
#!/usr/bin/env node
import { isEntryPoint } from '../src/cli-io.js';
import { main } from '../src/adr-lint-main.js';
if (isEntryPoint(import.meta.url, process.argv[1])) {
  process.exit(main(process.argv.slice(2), { stdout: process.stdout, stderr: process.stderr }));
}
```

The stdin variant keeps `import { readFileSync } from 'node:fs'`; the async variant keeps `await main`.
`process.exit` stays in the bin (ADR-066: an in-src `process.exit` is an unkillable survivor), so a
"run-if-entry" wrapper that also owns the dispatch is not proposed.

`cli-io.js`'s file header gains "an entry-point predicate" in its list; `isNonEmptyString` is reused for
the absent-argv[1] check (R3). The string guard is load-bearing, not decorative: without it
`realpathSync(undefined)` resolves `<cwd>/undefined` (pinned), so behaviour would depend on the cwd's
contents. No `entry !== null` check: `null` never equals the module's real path, so such a check would be
an equivalent mutant.

### Edge behaviour

| Input | `isEntryPoint` | Why |
|---|---|---|
| argv1 `undefined` / `''` / non-string | false | `isNonEmptyString` short-circuit; unguarded, `realpathSync` would resolve `<cwd>/undefined` or cwd itself |
| argv1 non-existent (`'-'`, extensionless) | false | `ENOENT` → null; the extensionless case stays silent exactly as today (Out of scope) |
| argv1 path crossing a regular file (`ENOTDIR`) or a symlink loop (`ELOOP`) | throws | contain.js precedent; cannot occur for a path Node just loaded, so a throw is a real fault and surfaces as a stack + exit 1, never a silent 0 |
| moduleUrl real-path fails | throws | the module is executing, so its file exists; any failure is a real fault |
| argv1 a different existing file (test runner) | false | real paths differ (R2) |

## Decision candidates

| # | Choice | Alternatives (≤3) | Recommendation | Why |
|---|---|---|---|---|
| 1 | Helper home and shape | (a) `isEntryPoint(moduleUrl, argv1)` exported from `engine/src/cli-io.js`; (b) new `engine/src/entry-point.js` + its own suite; (c) inline the real-path comparison in each of the 24 bins | (a) | ADR-487 makes `cli-io.js` the single home of shared CLI predicates; reuses `isNonEmptyString` and the existing `withTmp`/`symlinkSync` suite; inside `mutate`. (b) adds a module + suite for one function. (c) is 24 copies outside `mutate` (ADR-066) — the copy-paste that produced this bug |
| 2 | Comparison mechanism | (a) real-path both sides; (b) real-path argv[1] only, compare to `fileURLToPath(import.meta.url)`; (c) `import.meta.main` | (a) | Pinned matrix: (a) is the only guard true in all three entry rows and false in both import rows on Node 18–26. (b) breaks under `--preserve-symlinks-main` (true today, false with (b) — a regression). (c) is `undefined` on Node 18/20, admitted by `engines: ">=18"` → the same silent exit 0 |
| 3 | Real-path error policy | (a) `ENOENT` → false, rethrow every other code; (b) catch every error → false | (a) | Matches `contain.js` `realExistingPrefix` (ADR-175) and the no-swallowed-errors rule; a non-`ENOENT` failure cannot come from a path Node just loaded, so rethrowing turns a real fault into a loud exit 1 instead of the silent exit 0 this fix removes. (b) mirrors `isRegularFile` but would re-open a silent-skip path |
| 4 | Scope | (a) `engine/bin/*.js` only; (b) also `adapters/codex/bin/trust-hook.js:54` and `adapters/pi/src/cli.js:4` (+ `adapters/pi/test/cli.test.js:49`, which pins the literal guard string) | (a) | The brief names the 24 engine bins. Both adapter entry points are proven affected (via link: exit 0, 0 bytes; physical: exit 2) — recorded in Out of scope as a follow-up. (b) is mechanically cheap (adapters already import `engine/src/`, e.g. `adapters/pi/src/run.js:5`) but widens the change to two more packages and rewrites the pi literal-string pin |
| 5 | Regression pin for future bins | (a) behavioural sweep: one test enumerates `readdirSync(engine/bin)` and spawns every bin through a test-made symlink, asserting it is loud; (b) structural text pin: every bin source contains `isEntryPoint(import.meta.url, process.argv[1])` and no `process.argv[1] ===`; (c) both | (a) | (a) proves the property itself, is red on Linux CI today, auto-enrols a 25th bin, and costs ~1 s (24 spawns pinned at 0.92 s). (b) passes for a bin that imports the helper but calls it wrongly. (c) adds a brittle text match for no property (a) misses |

## Test strategy

**Unit — `engine/test/cli-io.test.js`** (extend; import `isEntryPoint`; reuse `withTmp`, `symlinkSync`,
`writeFileSync`, `pathToFileURL` from `node:url`). Fixture: `withTmp` → `real/m.js` (empty file) +
`link → real`. `withTmp` roots in `tmpdir()`, which is itself a symlink on macOS — every assertion
compares through `isEntryPoint`, never against a hand-built path.

| # | Given / When | Then |
|---|---|---|
| U1 | moduleUrl = url of `real/m.js`, argv1 = `real/m.js` | true |
| U2 | moduleUrl = url of `real/m.js`, argv1 = `link/m.js` | true |
| U3 | moduleUrl = url of `link/m.js`, argv1 = `link/m.js` (`--preserve-symlinks-main` shape) | true |
| U4 | moduleUrl = url of `real/m.js`, argv1 = a symlink file `alias.js → real/m.js` | true |
| U5 | moduleUrl = url of `real/m.js`, argv1 = sibling existing `real/other.js` | false |
| U6 | `withTempCwd` (`engine/test-helpers/with-cwd.js`) seeded with an empty file named `undefined`; moduleUrl = url of that file, argv1 `undefined` | false — kills the string-guard mutants: unguarded, `realpathSync(undefined)` resolves to that very file and returns true |
| U7 | argv1 `''` | false, no throw |
| U8 | argv1 non-existent `real/missing.js` | false |
| U9 | argv1 `real/m.js/x` (`ENOTDIR`) | throws with `code === 'ENOTDIR'` |

**Behavioural sweep (RED) — new `engine/test/bin-entry-symlink.bin.test.js`.** `ENGINE_DIR =
join(dirname(fileURLToPath(import.meta.url)), '..')`; one `mkdtempSync` per test with
`symlinkSync(ENGINE_DIR, join(tmp, 'engine-link'))`, spawned with `cwd: tmp`, `input: ''`,
`encoding: 'utf8'`; `try/finally rmSync`.

- S0 — Given `engine/bin`, when its `*.js` are enumerated, then the set is non-empty and contains
  `adr-lint.js` (positive pin so the sweep cannot pass vacuously, `source-hygiene.test.js` pattern).
- S1 — Given each bin reached through `engine-link/bin/<bin>.js` with its loud argv, when spawned, then
  `status !== 0 || stdout + stderr !== ''`. Loud argv = `['/nonexistent']`, overridden by a named
  constant map `{ 'usage-mine.js': ['--source', 'bogus'] }` (pinned table above: the only bin silent on
  `/nonexistent`, and the override writes nothing). A new bin silent on `/nonexistent` fails S1 until its
  author adds an override — intended.
- S2 — Given `adr-lint.js` through the link with `/nonexistent`, when spawned, then exit 2 (the brief's
  focused non-zero RED, pinned value).

RED today: S1 fails for all 24 bins, S2 fails (exit 0) — on macOS and Linux, since the link is
test-made. GREEN after the 24-bin swap. Existing `*.bin.test.js` suites stay green unchanged (R6: the
physical-path branch is identical).

**Mutation.** `isEntryPoint` and `realPathOrNull` are in `mutate`. Kill map: string guard → U1 (`true`)
and U6 (`false`); `=== 'ENOENT'` → U8 (`false`) and U9 (`true`); `throw error` removed / empty catch →
U9; `'ENOENT'` → `""` → U8; `===` → `!==` in the return → U1. U2–U4 pin R1's three entry shapes rather
than a specific mutant. No equivalent mutant is expected. The bins stay outside `mutate` (ADR-066); the
sweep is their proof.

**Gate.** `bash scripts/ci.sh`.

**Part sketch (plan phase owns the final cut).** P1: `isEntryPoint` + U1–U9 in `cli-io.js` /
`cli-io.test.js`. P2: the sweep (RED) + the 24-bin guard swap (GREEN) in one part, since the sweep
cannot go green bin-by-bin without a partial-allow list.

## Out of scope

- `adapters/codex/bin/trust-hook.js:54` and `adapters/pi/src/cli.js:4` carry the same guard and are
  proven silent through a link (exit 0, 0 bytes vs exit 2 physical) — follow-up, per candidate 4.
- Extensionless invocation (`node engine/bin/adr-lint`) stays silent: argv[1] does not exist on disk
  (pinned `ENOENT`); no caller in the repo invokes a bin without `.js`.
- `scripts/*.sh` `ROOT` computation via logical `pwd`: harmless once the bins compare real paths; no
  change needed.
- Windows path-case and junction semantics: CI and the supported hosts are macOS/Linux.
- Raising `engines` to `>=22.18` to adopt `import.meta.main`: a support-floor change, not a bug fix.
