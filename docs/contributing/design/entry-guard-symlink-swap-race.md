# Design — entry-guard-symlink-swap-race

> Brief: `isEntryPoint` (`engine/src/cli-io.js`) real-paths `process.argv[1]` again after Node has already
> loaded the main module. If that symlink is repointed or unlinked in the window, the guard turns false and
> the entry exits 0 with no output. For `adapters/codex/bin/trust-hook.js --check`, exit 0 means "trusted".
> Prefer Node's own answer, `import.meta.main`, and keep the real-path comparison for Node versions that do
> not define it. RED first: a deterministic, hermetic reproduction of the swap.
> Status: draft → self-reviewed ×3 → revised against ADR-563…567. ADR-564 overrides the brief's "keep the
> real-path comparison": the fallback is deleted and the Node floor rises to `^22.18.0 || >=24.2.0`.

## Context

**The helper today.** `engine/src/cli-io.js` L73-95 (ADR-556/557/558):

```js
export function isEntryPoint(moduleUrl, argv1) {
  if (!isNonEmptyString(argv1)) return false;
  return realPathOrNull(argv1) === realpathSync(fileURLToPath(moduleUrl));
}
// realPathOrNull: ENOENT → null, every other error rethrown
```

`realpathSync` (`node:fs`, L8) and `fileURLToPath` (`node:url`, L10) have no other use in the file:
`isEntryPoint` and `realPathOrNull` are their only callers. `isNonEmptyString` stays: it is its own export,
shared with `intention.js`. The file header (L1-6) lists "an entry-point predicate for the bins".
`cli-io.js` is in Stryker `mutate` (`engine/src/**/*.js`).

**26 call sites, one identical line.** `if (isEntryPoint(import.meta.url, process.argv[1])) {` in the 24
`engine/bin/*.js`, in `adapters/codex/bin/trust-hook.js:54` and in `adapters/pi/src/cli.js:4`. No other
tracked code contains that literal (`git grep`, docs and `BACKLOG.md` excluded), and no production module
imports an entry. The bins and the adapter entries are outside `mutate` (ADR-066, ADR-315).
`engine/stryker.conf.json` `tap.testFiles` includes `engine/test/**/*.test.js`, so every engine
`*.bin.test.js` runs in each mutation dry run. Adapter bin tests do not.

**The window.** Node resolves argv[1] through the link, loads the main module, then loads the whole
static import graph, and only then evaluates the main module. The guard runs at evaluation and calls
`realpath(argv[1])` again. A link swapped while dependencies load therefore changes the guard's answer.
A swap *before* Node resolves the main module is harmless, because Node loads whatever the link points to
and the later real-path agrees.

**Existing tests.**
- `engine/test/bin-entry-symlink.bin.test.js`: sweep over every bin through a test-made `engine-link`.
  `spawnThroughLink` uses `env: { ...process.env, HOME: tmp }`, so it is not sealed.
- `adapters/codex/test/trust-hook.bin.test.js`: `withSandbox(fn)` builds a sealed env
  `{ PATH: <tmp>/bin (node only), HOME: tmp, CODEX_HOME: <tmp>/codex-home }`. `spawnNode(argv, sandbox)`.
  Three tests: link `--bogus` → 2, physical `--bogus` → 2, importer script → 0 and silent.
- `adapters/pi/test/cli.test.js`: link, npm-bin and importer-script tests under the ADR-345 `PINNED_ENV`.
- `engine/test/cli-io.test.js` L144-252: `withEntryFixture(fn)` (`real/m.js` + `link → real`), `urlOf(path)`,
  and 9 `isEntryPoint` tests (U1-U9 of the bin-entry-symlink-guard design). All of them call
  `sut(url, argv1)` and pin real-path semantics of argv1.

**Environment facts.** CI runs `setup-node` `node-version: '22'` on `ubuntu-latest`
(`.github/workflows/ci.yml` L20, L39). The runner toolcache and the nodejs.org index both resolve that to
22.23.3 today. The devcontainer image `mcr.microsoft.com/devcontainers/javascript-node:22` carries
`NODE_VERSION=22.23.3` (image created 2026-10-09). `engine/package.json` declares `engines.node: ">=18"`,
and `engine/package-lock.json` L16 echoes it. No adapter `package.json` declares `engines`. Upstream
end-of-life (nodejs/Release `schedule.json`): v18 2025-04-30, v20 2026-04-30, v23 2025-06-01,
v22 2027-04-30, v24 2028-04-30.

## Requirements

- R1 — On a supported Node (`^22.18.0 || >=24.2.0`), an entry whose argv[1] link is repointed or unlinked
  after Node loaded the main module still runs `main`. In the sealed sandbox, `trust-hook.js --check`
  exits 2 (`spawn codex ENOENT`), not 0. `adr-lint.js /nonexistent` exits 2.
- R2 — On a supported Node, an entry that is imported (importer script, `--import` preload, stdin module)
  never runs `main`.
- R3 — On a Node without `import.meta.main`, every entry fails loudly with the named floor error (exit 1,
  stderr names `^22.18.0 || >=24.2.0`) before `main` runs. No entry exits 0 there.
- R4 — The decision stays in one exported function in `engine/src/cli-io.js` (ADR-556), mutation-covered.
  Its three outcomes (`main` true, `main` false, `main` not a boolean) are unit-tested in-process with
  plain objects on any Node.
- R5 — A RED test reproduces the race deterministically: a module load hook swaps a test-made link while a
  dependency loads. It covers repoint and unlink, for `trust-hook.js --check` and for `adr-lint`
  (ADR-566). It is hermetic: sealed PATH/HOME/CODEX_HOME and a link inside a `mkdtemp`.
- R6 — On a supported Node, the three existing entry suites stay green unchanged, and physical-path exit
  codes and output are byte-identical to today.
- R7 — `engine/package.json` `engines.node` is `^22.18.0 || >=24.2.0` (ADR-564), and every other
  declaration of the contributor Node floor agrees with it.

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
triggers: trust-hook on `/src/trust-hook-main.js`, adr-lint on `/engine/src/cli-io.js`. "post" here = the
copy patched with the first draft's shape, `meta.main ?? <real-path fallback>` (superseded by ADR-564; on
capable versions it answers exactly as the adopted shape, since `main` is always a boolean there).

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

**Re-pinned on the adopted shape** (copy patched as in § Shape, 26 sites edited, 22.22.3, `registerHooks`
preload, same sealed env, swaps triggered on `trust-hook-main.js` / `adr-lint-main.js`): unpatched copy,
repoint and unlink → 0 / 0 B for both entries; patched copy, repoint and unlink `--check` → 2 with the
`spawn codex ENOENT` line, `adr-lint /nonexistent` → 2 with the usage line. The unsupported-Node cells of
the "post" column no longer apply: those versions throw (§ Unsupported Node, pinned below).

**Hook mechanism.** The table above used `module.register` (off-thread), which reproduces on every
version listed. On 26.11.1 it prints `[DEP0205] DeprecationWarning: module.register() is deprecated` to
stderr on the `--check` path (247 B instead of 56 B). `module.registerHooks` (in-thread, synchronous)
reproduces the race (today: 0 / 0 B) on 22.18.0, 22.22.3, 24.11.0 and 26.11.1, and the post-fix exit 2 on
22.18.0, 22.22.3, 24.2.0, 24.11.0, 25.1.0 and 26.11.1, with no warning. It is absent on 20.20.2 (the
preload fails with exit 1). Every version that defines `import.meta.main` has `registerHooks`, so the
ADR-567 preload loads on every supported Node. A race spawn costs about 50 ms.

### Why the fallback goes (pinned on 20.20.2)

ADR-564 deletes the real-path fallback. The evidence behind it:

- Nothing in-module closes the **repoint** variant. After the swap argv[1] names a real, different file,
  which looks exactly like the importer case. Node exposes no other record of the entry for ESM
  (`mainModule`/`require.main` undefined, pinned). Capturing `realpath(argv[1])` earlier would need a
  `--import` preload on every invocation, which shebang entries cannot carry, and the window between that
  capture and Node's own resolution would remain.
- Rethrowing `ENOENT` would close only the **unlink** variant (pinned on a patched copy: unlink → exit 1,
  repoint rows still 0 / 0 B).
- So on Node without `import.meta.main` the only fail-closed answer is to refuse to decide: throw.

### Shape (ADR-563 + ADR-564)

```js
import { statSync, existsSync } from 'node:fs';   // realpathSync dropped
import { join, dirname } from 'node:path';
// the node:url import (fileURLToPath) is dropped: no use left in the file

const SUPPORTED_NODE_RANGE = '^22.18.0 || >=24.2.0';

/**
 * True when the module described by meta is the process entry script. Node fixes
 * import.meta.main when it loads the entry, so a symlink in argv[1] repointed or removed
 * afterwards cannot change the answer. Node versions without it are refused, never guessed.
 * @param {{ main?: boolean }} meta - the caller's import.meta
 * @returns {boolean}
 * @throws {Error} when meta.main is not a boolean (Node outside SUPPORTED_NODE_RANGE)
 */
export function isEntryPoint(meta) {
  if (typeof meta.main !== 'boolean') {
    throw new Error(`craft needs Node ${SUPPORTED_NODE_RANGE} (import.meta.main); running ${process.version}`);
  }
  return meta.main;
}
```

- One export, the same name and home (ADR-556 as refined by ADR-563). `realPathOrNull` is deleted.
- `SUPPORTED_NODE_RANGE` is module-private. The unit test reads the range from `engine/package.json`
  instead of importing it (see § Test strategy for why: importing it leaves a surviving mutant).
- The message shape (with `process.version`) is decision candidate 1.
- argv[1] is never read, so the "absent argv[1] must never reach `realpathSync`" guard and comment go with
  it.

All 26 call sites become `if (isEntryPoint(import.meta)) {`. That is one mechanical `sed` over
`engine/bin` and `adapters` (`isEntryPoint(import.meta.url, process.argv[1])` → `isEntryPoint(import.meta)`),
pinned on the copy: 26 files, 1 hit each, 0 old literals left in code. The dispatch lines,
`process.exit` placement (ADR-066/315) and adapter imports (ADR-561) do not change.

**Pinned on the patched copy at 22.22.3** (helper above, 26 sites, `engines` edited, U1-U9 replaced as in
§ Test strategy):
- `bin-entry-symlink.bin.test.js` 26/26, `trust-hook.bin.test.js` 3/3, `adapters/pi/test/cli.test.js` 10/10,
  `cli-io.test.js` 15/15. Same on 25.1.0.
- Full `bash scripts/ci.sh`: engine 2889 pass and every adapter suite green. The only failures are the
  `process` suite's 8 `git log --follow` history tests, an artefact of the copy's one-commit git history.
  Before the README counts were refreshed in the copy, `readme-drift` also failed (design 65 vs 66, ADRs
  562 vs 567). That drift is already on the branch and is fixed by the docs part.
- Physical-path runs are byte-identical, unpatched vs patched (`cmp` on stdout and stderr), on 22.22.3 and
  25.1.0: `trust-hook --check` 2, `trust-hook --bogus` 2, `adr-lint /nonexistent` 2, `craft-pi --help` 2.

### Unsupported Node: how the throw surfaces (pinned, patched copy, sealed env)

The throw happens while the entry module evaluates its guard line, after the whole import graph has loaded
and before `main`. It is uncaught, so Node prints the source excerpt, the stack and its own `Node.js vX`
footer, and exits 1. Pinned on 20.20.2 (`trust-hook --bogus`):

```text
file:///<T>/copy/engine/src/cli-io.js:83
    throw new Error(`craft needs Node ${SUPPORTED_NODE_RANGE} (import.meta.main); running ${process.version}`);
          ^

Error: craft needs Node ^22.18.0 || >=24.2.0 (import.meta.main); running v20.20.2
    at isEntryPoint (file:///<T>/copy/engine/src/cli-io.js:83:11)
    at file:///<T>/copy/adapters/codex/bin/trust-hook.js:54:5
    ...

Node.js v20.20.2
```

| Entry (sealed env, stdin `/dev/null`) | 18.20.8 | 20.20.2 | 22.17.1 | 23.11.1 | 22.22.3, 24.11.0, 25.1.0 |
|---|---|---|---|---|---|
| `trust-hook.js --check` | 1, named error | 1, named error | 1, named error | 1, named error | 2, `spawn codex ENOENT` |
| `adr-lint.js /nonexistent` | 1, `SyntaxError` (`matchesGlob`, before the guard) | 1, named error | — | 1, named error | 2, usage line |
| `craft-pi --help` | 1, named error | 1, named error | — | 1, named error | 2 |

stdout is 0 B in every unsupported cell. For `trust-hook --check`, exit 1 is `EXIT_UNTRUSTED`
(`adapters/codex/src/trust-hook-main.js:26`): non-zero, so a pipeline reading only `--check`'s exit
still fails closed. On 18.20.8 the bins that import `engine/src/glob.js` die at link time with a
`SyntaxError` before the guard runs: loud, but not the named error.

### Edge behaviour (adopted shape)

| Case | Supported Node | Unsupported Node |
|---|---|---|
| direct / dir link / file link / `--preserve-symlinks-main` | true | throws the named error, exit 1 |
| importer script, `--import` preload, stdin module, `node -e` import | false | the import throws the named error (the trust-hook importer test fails on 20.20.2, pinned) |
| link repointed after load | **true** (fixed) | throws, exit 1 (never a silent 0) |
| link unlinked after load | **true** (fixed) | throws, exit 1 |
| extensionless `node engine/bin/adr-lint` | **true**: `main` now runs (was silent) | throws, exit 1 |
| `--preserve-symlinks-main` + unlink | true: argv[1] is never read | throws, exit 1 |
| argv1 crossing a regular file (`ENOTDIR`, ADR-558) | not reached: argv[1] is never read | not reached |
| 18.20.8, bins importing `glob.js` | n/a | `SyntaxError` at link time, exit 1, before the guard |
| leftover call `isEntryPoint(import.meta.url)` (a string) | throws the named error with a supported `running v22.22.3` (pinned) | same |
| call with no argument | `TypeError: Cannot read properties of undefined (reading 'main')` (pinned) | same |

### Moves with the floor (R7)

| Place | Today | Edit |
|---|---|---|
| `engine/package.json` `engines.node` | `">=18"` | `"^22.18.0 \|\| >=24.2.0"` (ADR-564) |
| `engine/package-lock.json` L16 (root `packages[""]` echo) | `">=18"` | regenerate with `npm install --package-lock-only` (npm 12.2.0): pinned one-line diff, L16 only. `npm ci` accepts the stale echo (pinned exit 0), so this is consistency, not a gate |
| `CONTRIBUTING.md:13` | "Put Node 22, `jq` and `shellcheck` on your PATH." | "Put Node 22.18 or later on the 22 line (or 24.2 or later), `jq` and `shellcheck` on your PATH." No test reads this line |
| `CHANGELOG.md` `[Unreleased]` | one `### Fixed` group | add a Fixed line for the swap race and a floor line; its group is decision candidate 2 |
| `.github/workflows/ci.yml` L20, L39 `node-version: '22'` | resolves to 22.23.3 | none. `test/devcontainer.test.js` `ciNodeMajor()` reads it with `Number(…)`, so a `'22.18'` spelling would fail the devcontainer test |
| `.devcontainer/devcontainer.json` `javascript-node:22` | `NODE_VERSION=22.23.3` | none, same major check as above |
| `adapters/*/package.json` | no `engines` | none |
| `docs/contributing/archive/*`, dated plans and designs | quote `>=18` | none: dated records |

### Relationship to existing ADRs (outcome)

- **ADR-556 (one `isEntryPoint` export in `cli-io.js`)**: refined by ADR-563. Same name and home, still one
  export, new argument `import.meta`.
- **ADR-561 (adapter entries import `isEntryPoint` directly)**: refined by ADR-563. The import path is
  unchanged; the quoted call literal becomes `isEntryPoint(import.meta)`.
- **ADR-557 (real-path both sides; `import.meta.main` rejected)**: superseded by ADR-564. Nothing carried
  forward.
- **ADR-558 (only `ENOENT` → not entry)**: superseded by ADR-564. Nothing carried forward: the helper no
  longer touches the filesystem.
- **ADR-560 (behavioural sweep), ADR-562 (per-entry pins), ADR-345 (pinned env), ADR-066/315 (thin
  shims)**: unchanged. The RED tests follow 560/562/345.
- **ADR-047 (Stryker 8.7.1 pinned for the `>=18` floor)**: its premise is void once the floor is
  `^22.18.0 || >=24.2.0`. It is not superseded here; moving Stryker is out of scope.

## Decision candidates

Decided, not reopened: API shape → ADR-563; Node floor and the throw → ADR-564; no `skip` → ADR-565;
RED placement → ADR-566; swap preload → ADR-567. The revision uncovers two new choices.

| # | Choice | Alternatives (≤3) | Recommendation | Why |
|---|---|---|---|---|
| 1 | Shape of the floor error message | (a) range + `import.meta.main` + the running version: `craft needs Node ^22.18.0 \|\| >=24.2.0 (import.meta.main); running v20.20.2`; (b) range only: `craft needs Node ^22.18.0 \|\| >=24.2.0`; (c) (a) plus a hint naming the other cause, "isEntryPoint expects the caller's import.meta" | (a) | Node's uncaught footer already prints `Node.js vX` (pinned), but a caught error (an importer, a test runner) carries only the message. The version also tells a leftover-string call site apart: on a supported Node the message reads `running v22.22.3`, which is in range, so the reader looks at the call site (pinned). (b) loses that. (c) adds wording for a mistake the 26-site `sed` and the bin tests already catch |
| 2 | How the CHANGELOG and commit record the floor raise (`docs/contributing/releasing.md` step 1: "Removed or a breaking change means major") | (a) breaking: a `### Removed` line ("Support for Node versions without `import.meta.main`: below 22.18 on the 22 line, 23, and 24.0-24.1; every entry now exits 1 there naming `^22.18.0 \|\| >=24.2.0`") and the code commit marked `!`, so the next release is 2.0.0; (b) non-breaking: a `### Changed` line, next release minor; (c) no floor line, only the Fixed line | (a) | Node 22.0-22.17 is on an LTS line supported until 2027-04-30, and on it every entry now exits 1 where it ran. Under releasing.md that is a breaking change. (b) relies on 18/20/23 being end-of-life, which does not cover 22.<18 or 24.0-24.1. (c) hides a user-visible effect, against "one line per user-visible effect" |

## Test strategy

**RED order.**

1. *Race RED tests (ADR-566 placement, ADR-567 preload).* They fail today (pinned: 0 / 0 B).
2. *Helper unit tests.* M1 and M3 fail today; M2 passes on arrival (today `sut({ main: false })` hits the
   `argv1` guard and returns false), and is kept to pin import semantics.
3. *GREEN in one commit:* the helper, the 26-site `sed`, deletion of U1-U9 and their fixtures, `engines`
   and the lockfile. The helper and the call sites cannot land apart: a string argument throws the floor
   error on every Node (pinned), so every bin test would go red.
4. *Docs part:* `CONTRIBUTING.md:13`, `CHANGELOG.md` (candidate 2), README corpus counts (`readme-drift`,
   README L200-201): 66 design docs, 65 parted plans, 567 ADRs.

**Swap preload (ADR-567), `engine/test-helpers/swap-link-on-load.js`.**

```js
// Preloaded with --import; swaps a link once, when a module whose URL ends with CRAFT_SWAP_ON is
// loaded, i.e. after Node has resolved and loaded the entry.
import { registerHooks } from 'node:module';
import { renameSync, symlinkSync, unlinkSync } from 'node:fs';
// env: CRAFT_SWAP_LINK, CRAFT_SWAP_ON, CRAFT_SWAP_MODE ('repoint' | 'unlink'), CRAFT_SWAP_TO
// repoint = symlinkSync(TO, LINK + '.next') + renameSync(…, LINK) (atomic); unlink = unlinkSync(LINK)
```

Passed as `--import <absolute path>`; an absolute path is accepted (pinned on 22.22.3). No `skip` gate
(ADR-565): `registerHooks` exists on every supported Node.

*Codex, `adapters/codex/test/trust-hook.bin.test.js`.* Extend `withSandbox`: add
`elsewhere/bin/trust-hook.js` as an empty file. **Sealing:** the env stays
`{ PATH: <tmp>/bin (node only), HOME: tmp, CODEX_HOME: <tmp>/codex-home, CRAFT_SWAP_* }`, never a spread
of `process.env`; the link lives inside the sandbox `mkdtemp`. The preload is reached as
`ADAPTER_DIR/../../engine/test-helpers/swap-link-on-load.js`. Spawn:
`[ '--import', HARNESS, <tmp>/codex-link/bin/trust-hook.js, '--check' ]`, swap on
`/adapters/codex/src/trust-hook-main.js`.

| # | Given / When | Then | Today |
|---|---|---|---|
| W1 (RED) | link repointed to `elsewhere` while `trust-hook-main.js` loads, `--check` | `error` undefined, status 2, stderr `trust-hook: app-server process error: spawn codex ENOENT\n`, stdout `''` | 0, no output |
| W2 (RED) | link unlinked at the same point, `--check` | same as W1 | 0, no output |
| W3 | preload loaded, swap suffix that never loads, `--check` | same as W1 (the preload itself does not perturb the run) | green |

*Engine, new `engine/test/bin-entry-swap-race.bin.test.js`* (house style of `bin-entry-symlink.bin.test.js`:
`ENGINE_DIR`, one `mkdtemp` per test, `try/finally rmSync`). **Sealing:** env
`{ PATH: <tmp>/bin (node only), HOME: tmp, CODEX_HOME: <tmp>/codex-home, CRAFT_SWAP_* }`, never a spread
of `process.env`; `engine-link` lives inside the test's `mkdtemp`. Swap on `/engine/src/adr-lint-main.js`.
The repoint target is `elsewhere/bin/adr-lint.js` (empty file).

| # | Given / When | Then | Today |
|---|---|---|---|
| E1 (RED) | `engine-link/bin/adr-lint.js /nonexistent`, link repointed mid-load | status 2 | 0, 0 B |
| E2 (RED) | same, link unlinked | status 2 | 0, 0 B |

**Unit, `engine/test/cli-io.test.js` (R3, R4, mutation).** In-process, no spawn, no filesystem.

- Delete U1-U9 (L160-252). All nine pin argv1 real-path semantics (`ENOENT`, `ENOTDIR`, undefined/empty
  argv1, symlinked module URL), and none of that code survives. Nothing is rewritten.
- Delete `withEntryFixture` and `urlOf`: they have no other caller. Their imports go with them:
  `pathToFileURL` (`node:url`, used only by `urlOf`) and `withTempCwd` (used only by U8; the helper itself
  stays, `contracts-lint-main` and `manifest-lint-main` tests use it). `mkdirSync`, `symlinkSync` and
  `writeFileSync` stay (used by the `isRegularFile`/`isDirectoryPath` tests). `readFileSync` is added.
- Add `ENGINE_PACKAGE = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))` and:

| # | Given / When | Then |
|---|---|---|
| M1 | `sut({ main: true, url: 'file:///x/m.js' })` | `true` |
| M2 | `sut({ main: false, url: 'file:///x/m.js' })` | `false` |
| M3 | `sut({ url: 'file:///x/m.js' })` | throws; `error.message` includes `ENGINE_PACKAGE.engines.node` |

M3 asserting against `engine/package.json` also binds the message to `engines` (R7): a later floor
change that misses one of them fails.

**Mutants (pinned: Stryker 8.7.1, `mutate` narrowed to the helper and its constant, `tap.testFiles`
narrowed to `cli-io.test.js`, constant at module scope): 8 mutants, 8 killed.**

| Mutant | Killed by | Without M3 |
|---|---|---|
| `SUPPORTED_NODE_RANGE` → `""` | M3 only | Survived |
| function body → `{}` | M1 | Killed |
| `typeof … !== 'boolean'` → `true` | M1, M2 | Killed |
| `typeof … !== 'boolean'` → `false` | M3 | Survived |
| `!==` → `===` | M1, M2, M3 | Killed |
| `'boolean'` → `""` | M1, M2 | Killed |
| `if` body `{ throw … }` → `{}` | M3 | NoCoverage |
| message template → empty template | M3 | NoCoverage |

Dropping M1 or M2 alone still kills all 8 (they overlap). With M3 asserting
`includes(SUPPORTED_NODE_RANGE)` against an exported constant instead, the `SUPPORTED_NODE_RANGE` → `""`
mutant survives (pinned), which is why the constant stays private and M3 reads `package.json`.

**Stays green unchanged on a supported Node (R2, R6).** `engine/test/bin-entry-symlink.bin.test.js`,
`adapters/codex/test/trust-hook.bin.test.js` (existing 3), `adapters/pi/test/cli.test.js`. Importer tests
stay importer *scripts*, never `node -e` (it leaves argv[1] undefined, so it would pass vacuously). Pinned
green on the patched copy at 22.22.3 and 25.1.0. On 20.20.2 they fail (bin-entry-symlink 1, trust-hook 3,
pi 4 tests), which ADR-565 accepts; `cli-io.test.js` stays 15/15 there, so the throw is pinned on any Node.

**Gate.** `bash scripts/ci.sh`.

**Part sketch (the plan phase owns the final cut).** Part 1, code: preload + W1-W3 + E1-E2 + M1-M3 (RED),
then helper + 26 sites + U1-U9 deletion + `engines` + lockfile (GREEN). Part 2, docs: `CONTRIBUTING.md:13`,
`CHANGELOG.md`, README counts.

## Out of scope

- Moving Stryker off 8.7.1. ADR-047's reason (the `>=18` floor) is void, but the move is its own change.
- The `engine/src/glob.js:6` (`path.matchesGlob`) crash on 18.20.8 is moot: 18 is below the new floor, and
  there it is a loud exit 1 before the guard (pinned).
- Swaps before Node resolves the main module: harmless, because Node loads the new target and the guard
  agrees.
- `adapters/*/hooks/*.js`: no entry guard; they run unconditionally.
- Windows junction semantics and Windows `--import` path spelling: unsupported hosts, as in the
  predecessor designs.
- Choosing the next release number: candidate 2 only fixes how the change is recorded.
