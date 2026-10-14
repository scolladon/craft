# Design — entry-guard-symlink-swap-race

> Brief: `isEntryPoint` (`engine/src/cli-io.js`) real-paths `process.argv[1]` again after Node has already
> loaded the main module. If that symlink is repointed or unlinked in the window, the guard turns false and
> the entry exits 0 with no output. For `adapters/codex/bin/trust-hook.js --check`, exit 0 means "trusted".
> Prefer Node's own answer, `import.meta.main`, and keep the real-path comparison for Node versions that do
> not define it. RED first: a deterministic, hermetic reproduction of the swap.
> Status: draft → self-reviewed ×3

## Context

**The helper today.** `engine/src/cli-io.js` L73-95 (ADR-556/557/558):

```js
export function isEntryPoint(moduleUrl, argv1) {
  if (!isNonEmptyString(argv1)) return false;
  return realPathOrNull(argv1) === realpathSync(fileURLToPath(moduleUrl));
}
// realPathOrNull: ENOENT → null, every other error rethrown
```

The file header (L1-6) lists "an entry-point predicate for the bins". `cli-io.js` is in Stryker `mutate`
(`engine/src/**/*.js`).

**26 call sites, one identical line.** `if (isEntryPoint(import.meta.url, process.argv[1])) {` in the 24
`engine/bin/*.js`, in `adapters/codex/bin/trust-hook.js:54` and in `adapters/pi/src/cli.js:4`. No other
tracked code contains that literal (`git grep`, docs and `BACKLOG.md` excluded). The bins and the adapter
entries are outside `mutate` (ADR-066, ADR-315). `engine/stryker.conf.json` `tap.testFiles` includes
`engine/test/**/*.test.js`, so every engine `*.bin.test.js` runs in each mutation dry run. Adapter bin
tests do not.

**The window.** Node resolves argv[1] through the link, loads the main module, then loads the whole
static import graph, and only then evaluates the main module. The guard runs at evaluation and calls
`realpath(argv[1])` again. A link swapped while dependencies load therefore changes the guard's answer.
A swap *before* Node resolves the main module is harmless, because Node loads whatever the link points to
and the later real-path agrees.

**Existing tests that must stay green.**
- `engine/test/bin-entry-symlink.bin.test.js`: sweep over every bin through a test-made `engine-link`.
  `spawnThroughLink` uses `env: { ...process.env, HOME: tmp }`, so it is not sealed.
- `adapters/codex/test/trust-hook.bin.test.js`: `withSandbox(fn)` builds a sealed env
  `{ PATH: <tmp>/bin (node only), HOME: tmp, CODEX_HOME: <tmp>/codex-home }`. `spawnNode(argv, sandbox)`.
  Three tests: link `--bogus` → 2, physical `--bogus` → 2, importer script → 0 and silent.
- `adapters/pi/test/cli.test.js`: link, npm-bin and importer-script tests under the ADR-345 `PINNED_ENV`.
- `engine/test/cli-io.test.js` L144-252: `withEntryFixture(fn)` (`real/m.js` + `link → real`), `urlOf(path)`,
  and 9 `isEntryPoint` tests (U1-U9 of the bin-entry-symlink-guard design). All of them call
  `sut(url, argv1)`.

**Environment facts.** CI runs `setup-node` `node-version: '22'` (`.github/workflows/ci.yml`), which
resolves to the latest 22.x. `engine/package.json` declares `engines.node: ">=18"`. Upstream end-of-life
(nodejs/Release `schedule.json`): v18 2025-04-30, v20 2026-04-30, v23 2025-06-01, v22 2027-04-30,
v24 2028-04-30. No test in the repo uses a node:test `skip` option today.

## Requirements

- R1 — On a Node that defines `import.meta.main`, an entry whose argv[1] link is repointed or unlinked
  after Node loaded the main module still runs `main`. In the sealed sandbox, `trust-hook.js --check` exits
  2 (`spawn codex ENOENT`), not 0. `adr-lint.js /nonexistent` exits 2.
- R2 — An entry that is imported (importer script, `--import` preload, stdin module) never runs `main`, on
  every Node version.
- R3 — On a Node that does not define `import.meta.main`, behaviour is whatever candidate 3 picks, and the
  repoint race stays open there. This doc and the ADR say so; nothing claims otherwise.
- R4 — The decision stays in one exported function in `engine/src/cli-io.js` (ADR-556), mutation-covered.
  Both the `main`-defined and the `main`-undefined branches are unit-testable in-process on any Node.
- R5 — A RED test reproduces the race deterministically: a module load hook swaps a test-made link while a
  dependency loads. It covers repoint and unlink, for `trust-hook.js --check` and for one engine bin. It is
  hermetic: sealed PATH/HOME/CODEX_HOME and a link inside a `mkdtemp`.
- R6 — The three existing entry suites stay green unchanged. Physical-path exit codes and output are
  byte-identical to today.

## Design

### Pinned: `import.meta.main` vs the real-path comparison (synthetic probe, macOS, mktemp)

Probe `real/bin/probe.js` imports `../lib/dep.js` and prints `import.meta.main` and `realBoth` (today's
comparison). Links: `dirlink → real`, `filelink.js → real/bin/probe.js`. Swap rows use a hook preloaded with
`--import` that repoints `dirlink → other` (a copy of `real`) or unlinks it when `dep.js` loads.

| Invocation | `realBoth` (all versions) | `main`: 18.20.8, 20.19.5, 20.20.2, 22.17.1, 23.11.1, 24.1.0 | `main`: 22.18.0, 22.22.3, 24.2.0, 24.11.0, 25.1.0, 26.11.1 |
|---|---|---|---|
| `node real/bin/probe.js` | true | undefined | true |
| `node <T>/dirlink/bin/probe.js` | true | undefined | true |
| `node <T>/filelink.js` | true | undefined | true |
| `node --preserve-symlinks-main <T>/dirlink/bin/probe.js` | true | undefined | true |
| `node t/importer.mjs` (imports the probe) | false | undefined | false |
| `node --import ./real/bin/probe.js t/importer.mjs` (probe preloaded) | false | undefined | false |
| `echo "await import(…probe.js)" \| node --input-type=module -` | false | undefined | false |
| `node real/bin/probe` (extensionless) | false | undefined | **true** |
| `--import` hook loaded, no swap, via dirlink | true | undefined | true |
| **swap: repoint** dirlink while `dep.js` loads | **false** | undefined | **true** |
| **swap: unlink** dirlink while `dep.js` loads | **false** | undefined | **true** |
| `--preserve-symlinks-main` + unlink | throws `ENOENT` on the module side (exit 1) | undefined | true (22.22.3, 24.2.0, 26.11.1) |
| `--preserve-symlinks-main` + repoint | true (both sides resolve into `other`) | undefined | true (22.22.3, 24.2.0, 26.11.1) |

Boundaries: `import.meta.main` is defined from 22.18.0 on the 22 line and from 24.2.0 on, and is
**undefined on 23.11.1**. So `>=22.18` is not a correct floor; the capable range is
`^22.18.0 || >=24.2.0`. On every capable version the swap rows return `true`, so Node's answer does not
depend on argv[1] after the load. `process.mainModule` and `createRequire(import.meta.url).main` are
`undefined` for an ESM entry on 18.20.8, 20.20.2 and 23.11.1, so old Node offers no other in-process record
of the entry.

### Pinned: the race on the real entries (rsync copy of the worktree, sealed env)

Env: `env -i PATH=<T>/sbin` (only a `node` symlink), `HOME=<T>`, `CODEX_HOME=<T>/codex-home` (empty),
stdin `/dev/null`. Links `codex-link → copy/adapters/codex`, `engine-link → copy/engine`. The repoint
target is a sibling dir holding an empty `bin/<entry>.js`, so after the swap argv[1] real-paths to a
*different existing* file, which is the upgrade shape. The unlink target makes argv[1] `ENOENT`. Swap
triggers: trust-hook on `/src/trust-hook-main.js`, adr-lint on `/engine/src/cli-io.js`. "post" = the copy
patched with candidate 1a (all 26 call sites).

| Row | today 18.20.8 / 20.20.2 / 22.22.3 / 23.11.1 / 24.11.0 / 25.1.0 | post, same versions |
|---|---|---|
| trust-hook control `--bogus` | 2 (45 B) all | 2 all |
| trust-hook repoint `--bogus` | **0 / 0 B** all | 0, 0, **2**, 0, **2**, **2** |
| trust-hook unlink `--bogus` | **0 / 0 B** all | 0, 0, **2**, 0, **2**, **2** |
| trust-hook control `--check` | 2 (56 B, `spawn codex ENOENT`) all | 2 all |
| trust-hook repoint `--check` | **0 / 0 B** all (exit 0 = "trusted") | 0, 0, **2**, 0, **2**, **2** |
| trust-hook unlink `--check` | **0 / 0 B** all | 0, 0, **2**, 0, **2**, **2** |
| adr-lint control `/nonexistent` | 2 (83 B); 18.20.8: 1, `glob.js:6` import crash | same |
| adr-lint repoint / unlink | **0 / 0 B** (20.20.2-25.1.0); 18.20.8: 1 (glob crash) | 2 on 22.22.3, 24.11.0, 25.1.0; 0 on 20.20.2, 23.11.1; 18.20.8: 1 (glob crash) |
| trust-hook unlink, triggered on `cli-io.js` | **0 / 0 B** all | 2 on capable versions |

So the race reproduces on an engine bin too, and also with the swap triggered on a dependency the entry
shares with every other entry. Boundary versions 22.17.1 and 24.1.0 behave like "today" post-fix.
22.18.0, 24.2.0 and 26.11.1 behave like "post". Hermeticity, pinned on 22.22.3 post with `CODEX_HOME`
pointing at a path that does not exist (the `withSandbox` shape): repoint and unlink `--check` both exit 2
`spawn codex ENOENT`, `CODEX_HOME` is never created and nothing new appears under `HOME`. Triggering
the adr-lint swap on `/engine/src/adr-lint-main.js` gives the same split (today 0 / 0 B, post 2).

**Hook mechanism.** The table above used `module.register` (off-thread), which reproduces on every
version listed. On 26.11.1 it prints `[DEP0205] DeprecationWarning: module.register() is deprecated` to
stderr on the `--check` path (247 B instead of 56 B). `module.registerHooks` (in-thread, synchronous)
reproduces the race (today: 0 / 0 B) on 22.18.0, 22.22.3, 24.11.0 and 26.11.1, and the post-fix exit 2 on
22.18.0, 22.22.3, 24.2.0, 24.11.0, 25.1.0 and 26.11.1, with no warning. It is absent on 20.20.2 (the
preload fails with exit 1). Every version that defines `import.meta.main` has `registerHooks`. A race spawn
costs about 50 ms.

### Old Node: what closes the race, and what does not (pinned on 20.20.2)

- Nothing in-module closes the **repoint** variant. After the swap argv[1] names a real, different file,
  which looks exactly like the importer case. Node exposes no other record of the entry for ESM
  (`mainModule`/`require.main` undefined, pinned). Capturing `realpath(argv[1])` earlier would need a
  `--import` preload on every invocation, which shebang entries cannot carry, and the window between that
  capture and Node's own resolution would remain.
- The **unlink** variant closes if `ENOENT` on argv[1] is rethrown instead of mapped to false (candidate
  3b). Pinned on the patched copy: `trust-hook unlink --check` → exit 1 with a stack trace,
  `adr-lint unlink` → exit 1, repoint rows still 0 / 0 B. Side effects on old Node only: the extensionless
  spelling and a `node -` stdin import of an entry also throw. No tracked script or test pipes an entry into
`node -` (grep), and none invokes an entry without `.js` (bin-entry-symlink-guard design, Out of scope).
- Old Node is reached only through the fallback. On a capable Node, `meta.main` is a boolean for every
  module, so the fallback never runs.

### Shape (drawn with recommended candidates 1a + 2a + 3a)

```js
/**
 * True when the module described by meta is the process entry script.
 * Node's import.meta.main answers first: a symlink in argv[1] repointed or removed after
 * Node loaded the entry cannot change it. Node versions without it fall back to
 * real-pathing both argv[1] and the module path.
 * @param {{ url: string, main?: boolean }} meta - the caller's import.meta
 * @param {string | undefined} argv1 - process.argv[1]
 * @returns {boolean}
 */
export function isEntryPoint(meta, argv1) {
  return meta.main ?? isEntryPath(meta.url, argv1);
}

function isEntryPath(moduleUrl, argv1) {
  // today's isEntryPoint body, unchanged (string guard, realPathOrNull, module side never caught)
}
```

All 26 call sites become `if (isEntryPoint(import.meta, process.argv[1])) {`. That is one mechanical
`sed` (`import.meta.url,` → `import.meta,` inside that literal), pinned on the copy: 26 files, 1 hit each.
The dispatch lines, `process.exit` placement (ADR-066/315) and adapter imports (ADR-561) do not change.
Pinned on the patched copy at 22.22.3: `bin-entry-symlink.bin.test.js`, `trust-hook.bin.test.js` and
`adapters/pi/test/cli.test.js` all pass. The only failures are the 6 `cli-io.test.js` tests that still pass
a URL string. A leftover `import.meta.url` (string) call site fails loudly whenever argv[1] is a non-empty
string: `fileURLToPath(undefined)` → `TypeError ERR_INVALID_ARG_TYPE` (pinned). It never fails silently.

### Edge behaviour (post, shape 1a + 3a)

| Case | Capable Node | Old Node |
|---|---|---|
| direct / dir link / file link / `--preserve-symlinks-main` | true | true (unchanged) |
| importer script, `--import` preload, stdin module, `node -e` import | false | false (unchanged) |
| link repointed after load | **true** (fixed) | false: race open |
| link unlinked after load | **true** (fixed) | false: race open (3b would make it a loud throw) |
| extensionless `node engine/bin/adr-lint` | **true**: `main` now runs (was silent) | false (unchanged) |
| `--preserve-symlinks-main` + unlink | true: `main` short-circuits, so the module path is never real-pathed | throws `ENOENT` (unchanged, loud) |
| argv1 crossing a regular file (`ENOTDIR`) | not reached | throws (ADR-558, unchanged) |

### Relationship to existing ADRs

- **ADR-557 (real-path both sides; `import.meta.main` rejected)**: refined, not superseded. The comparison
  survives verbatim as the fallback, now scoped to "Node without `import.meta.main`". Its rejection of
  option 3 ("undefined on 18 and 20") is answered by the fallback, not by a floor rise. The new pins extend
  the undefined set to 22.<18, 23.x and 24.0-24.1. Its consequence "reconsider at Node 22.18+" is acted on
  now. Under 2c it would be superseded instead.
- **ADR-556 (one `isEntryPoint` export in `cli-io.js`)**: refined under 1a. Same name, same home, still one
  export. The quoted call `isEntryPoint(import.meta.url, process.argv[1])` becomes
  `isEntryPoint(import.meta, process.argv[1])`. Under 1c it gains a second export, so it is refined in
  substance.
- **ADR-561 (adapter entries import `isEntryPoint` directly)**: import path unchanged. Its quoted
  call-site literal changes as in ADR-556, so it is refined in text only.
- **ADR-558 (only `ENOENT` → not entry)**: untouched under 3a. Its scope narrows to the fallback branch.
  Superseded under 3b.
- ADR-560 (behavioural sweep), ADR-562 (per-entry pins), ADR-345 (pinned env), ADR-066/315 (thin shims):
  unchanged. The RED tests follow 560/562/345.

## Decision candidates

| # | Choice | Alternatives (≤3) | Recommendation | Why |
|---|---|---|---|---|
| 1 | API shape | (a) `isEntryPoint(meta, argv1)`: the caller passes `import.meta`, and the helper returns `meta.main ?? isEntryPath(meta.url, argv1)`; (b) keep `isEntryPoint(moduleUrl, argv1)`, and each call site becomes `import.meta.main ?? isEntryPoint(import.meta.url, process.argv[1])`; (c) a new export `isMainModule(meta, argv1)` that composes the unchanged `isEntryPoint(url, argv1)`, with call sites switched to it | (a) | One export and one name (ADR-556). Both branches are unit-testable with plain objects (`{ url }`, `{ main: true, url }`) on any Node, and the `??` is mutated. A leftover string argument fails loudly (pinned `TypeError`). (b) puts the decisive `??` in 26 copies outside `mutate`, which is the copy-paste shape ADR-556 removed. (c) keeps U1-U9 untouched but leaves a racy predicate exported for a future bin to pick. A three-primitive `(main, url, argv1)` variant is a boolean parameter, so it is not listed |
| 2 | Policy for Node without `import.meta.main` (`>=18` admits 18, 20, 22.<18, 23, 24.0-24.1) | (a) keep `engines: ">=18"` with the real-path fallback; the race stays open there and is documented; (b) declare `engines: "^22.18.0 \|\| >=24.2.0"` and keep the fallback; (c) declare that floor and make the helper throw when `meta.main` is undefined, deleting the fallback | (a) | It is the brief's fix and needs no support-policy change. It closes the race on CI's Node 22 and on every capable version (pinned). (b) changes nothing at runtime, because `engines` is advisory for a checkout-run tool. (c) is the only full closure and removes ADR-557/558 code, but it makes every entry exit 1 on the Node versions `>=18` admits today. That is a support-floor decision outside this bug fix. Context for the user: 18, 20 and 23 are past upstream end-of-life, and 5 of the 24 bins already crash on 18.20.8 at import (`path.matchesGlob`) |
| 3 | Fallback's `ENOENT` handling on argv[1] | (a) keep ADR-558: `ENOENT` → not entry; (b) rethrow `ENOENT` too (drop `realPathOrNull`), which supersedes ADR-558 | (a) | (b) closes only the unlink half on old Node (pinned: exit 1 vs 0). The repoint half, the realistic upgrade swap of a `current` link, stays open. It also turns two silent no-ops into stack traces on old Node (extensionless spelling, `node -` import). It would reverse a fresh ADR for a partial gain confined to end-of-life runtimes. (b) is defensible if the user wants every closable path closed: no tracked caller hits its side effects, and it removes a helper and its mutants |
| 4 | RED gating on a Node without `import.meta.main` | (a) the race tests carry `skip` when `typeof import.meta.main !== 'boolean'` in the test process (same binary as the spawned child), with a reason string; (b) run them unconditionally; (c) on such Node, assert today's silent exit 0 instead | (a) | On a capable Node the test process sees a boolean whether or not it is the entry. On old Node the property cannot hold under 2a, and the `registerHooks` harness itself fails to load (pinned on 20.20.2). CI (Node 22) always runs them. (b) leaves a suite that is red forever on admitted versions. (c) enshrines a security gap as expected behaviour. Note: this is the repo's first `skip` |
| 5 | RED placement | (a) `trust-hook --check` repoint + unlink in `adapters/codex/test/trust-hook.bin.test.js`, plus `adr-lint` repoint + unlink in a new `engine/test/bin-entry-swap-race.bin.test.js`; (b) a race sweep over all 26 entries; (c) trust-hook only | (a) | trust-hook `--check` is the security-relevant exit (0 = trusted), and adr-lint proves the engine side. All 26 sites call one helper with `import.meta`, so per-entry wiring is already pinned by the existing link and importer tests. (b) costs about 52 spawns (~2.6 s) in every Stryker dry run (engine tests are in `tap.testFiles`). The only property it adds is catching a future entry that hand-rolls its own real-path guard instead of calling the helper; a call site still passing `import.meta.url` already fails loudly. (c) leaves the engine bins unproven |
| 6 | Swap-hook harness home | (a) one committed preload `engine/test-helpers/swap-link-on-load.js` (`registerHooks`, configured by env vars), passed by absolute path as `--import` from both suites; (b) each suite writes the hook source into its sandbox | (a) | DRY: one ~15-line hook, and `test-helpers/` is already excluded from stub-lint. The codex suite reaches it by path (`ADAPTER_DIR/../../engine/test-helpers/…`), the same way trust-hook already reaches `engine/`. (b) duplicates the hook text in two files |

## Test strategy

**RED first: the swap race (R1, R5).** Harness sketch (candidate 6a):

```js
// engine/test-helpers/swap-link-on-load.js — preloaded with --import; swaps a link once, when a module
// whose URL ends with CRAFT_SWAP_ON is loaded, i.e. after Node has resolved and loaded the entry.
import { registerHooks } from 'node:module';
import { renameSync, symlinkSync, unlinkSync } from 'node:fs';
// env: CRAFT_SWAP_LINK, CRAFT_SWAP_ON, CRAFT_SWAP_MODE ('repoint' | 'unlink'), CRAFT_SWAP_TO
// repoint = symlinkSync(TO, LINK + '.next') + renameSync(…, LINK) (atomic); unlink = unlinkSync(LINK)
```

Gate for every test that preloads the harness, W3 included (candidate 4a): `const SWAP_IMMUNE_NODE = typeof import.meta.main === 'boolean'`,
`{ skip: !SWAP_IMMUNE_NODE && '<reason>' }`.

*Codex, `adapters/codex/test/trust-hook.bin.test.js`* (extend `withSandbox`: add `elsewhere/bin/trust-hook.js`
as an empty file; the env stays sealed as `{ PATH, HOME, CODEX_HOME, CRAFT_SWAP_* }`, never a spread of
`process.env`). Spawn: `[ '--import', HARNESS, <tmp>/codex-link/bin/trust-hook.js, '--check' ]`, swap on
`/adapters/codex/src/trust-hook-main.js`.

| # | Given / When | Then | Today |
|---|---|---|---|
| W1 (RED) | link repointed to `elsewhere` while `trust-hook-main.js` loads, `--check` | `error` undefined, status 2, stderr `trust-hook: app-server process error: spawn codex ENOENT\n`, stdout `''` | 0, no output |
| W2 (RED) | link unlinked at the same point, `--check` | same as W1 | 0, no output |
| W3 | harness preloaded, swap suffix that never loads, `--check` | same as W1 (the harness itself does not perturb the run) | green |

*Engine, new `engine/test/bin-entry-swap-race.bin.test.js`* (house style of `bin-entry-symlink.bin.test.js`:
`ENGINE_DIR`, one `mkdtemp` per test, `try/finally rmSync`). The env is sealed:
`{ PATH: <tmp>/bin (node only), HOME: tmp, CODEX_HOME: <tmp>/codex-home }`. Swap on
`/engine/src/adr-lint-main.js`. The repoint target is `elsewhere/bin/adr-lint.js` (empty file).

| # | Given / When | Then | Today |
|---|---|---|---|
| E1 (RED) | `engine-link/bin/adr-lint.js /nonexistent`, link repointed mid-load | status 2 | 0, 0 B |
| E2 (RED) | same, link unlinked | status 2 | 0, 0 B |

**Unit, `engine/test/cli-io.test.js` (R4, mutation).** Convert U1-U9 to `sut({ url: urlOf(…) }, argv1)`. The
missing `main` is the old-Node branch, so their existing kill map carries over unchanged. Add:

| # | Given / When | Then | Kills |
|---|---|---|---|
| M1 | `{ main: true, url: <real/m.js> }`, argv1 `real/missing.js` (the race shape in-process) | true | `??` → `&&` |
| M2 | `{ main: false, url: <real/m.js> }`, argv1 `real/m.js` (imported, argv1 names the module) | false | a `\|\|` rewrite; pins import semantics |

Under 3b, U8 flips from "returns false" to "throws `ENOENT`". Mutant kills are expected from M1/M2 and
U1-U9; the spawned W/E tests prove the wiring and the race, not the predicate.

**Stays green unchanged (R2, R6).** `engine/test/bin-entry-symlink.bin.test.js`,
`adapters/codex/test/trust-hook.bin.test.js` (existing 3), `adapters/pi/test/cli.test.js`. Importer tests
stay importer *scripts*, never `node -e` (it leaves argv[1] undefined, so it would pass vacuously).
Pinned green on the 1a-patched copy.

**Gate.** `bash scripts/ci.sh`. README corpus counts (`readme-drift`, README L200-201) move with this doc
(65 → 66 design docs) plus the plan (64 → 65) and the new ADR(s) (562 → 562 + n), refreshed in the same
change.

**Part sketch (plan phase owns the final cut).** One code part, because the signature change and the 26
call sites cannot land separately without a red tree: harness + W1-W3 + E1-E2 (RED), then helper + M1/M2 +
U1-U9 conversion + 26-site swap (GREEN). Docblock and README counts go with it.

## Out of scope

- The repoint race on Node without `import.meta.main`: no in-module closure exists (pinned). Closing it
  means candidate 2c, a support-floor change.
- `engines: ">=18"` is already false for 5 of the 24 bins, which crash at import on 18.20.8
  (`engine/src/glob.js:6`, `path.matchesGlob`). The probe above is the proof. This is a pre-existing gap and
  not acted on.
- Swaps before Node resolves the main module: harmless, because Node loads the new target and the guard
  agrees.
- `adapters/*/hooks/*.js`: no entry guard; they run unconditionally.
- Windows junction semantics: unsupported hosts, as in the predecessor designs.
