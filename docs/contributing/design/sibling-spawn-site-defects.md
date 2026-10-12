# Design — sibling-spawn-site-defects

> Brief: two test spawn sites still carry defects their siblings already had fixed. Make
> `listTrackedFiles` in `test/source-hygiene.test.js` let a git failure throw, and pin the
> environment of `test/helpers/tmp-git-repo.js` so an ambient `GIT_DIR`/`GIT_WORK_TREE` cannot
> redirect it (BACKLOG "Two spawn sites still carry the defects their siblings just had
> fixed.").
> Status: draft → self-reviewed ×3

## Context

### Defect 1 — `listTrackedFiles` swallows git failures

`test/source-hygiene.test.js:142-153`:

```js
function listTrackedFiles(paths) {
  let result;
  try {
    result = execFileSync('git', ['ls-files', '--', ...paths], { cwd: ROOT, encoding: 'utf8', stdio: [...] });
  } catch (err) {
    result = err.stdout ?? '';
  }
  return result.split('\n').filter(Boolean);
}
```

There are two callers. The scanned-path pin at :175 (`listTrackedFiles([relative])`) guards the
class-A/B greps. The class-C scan at :273 (`listTrackedFiles(SCANNED_PATHS)`) feeds
`findMisplacedVendorFiles`. When git fails, :175 still fails, but with a misleading "stale
entry?" message. :273 passes vacuously with zero offenders. The sibling
`test/architecture-boundaries.test.js:34-40` has no `try`, so its throw propagates. The
`listHomePathCandidateLines(cwd, env = process.env)` function in the same file (:93) is the
in-file precedent for a `cwd` seam that throwaway-repo tests call (:424-447).

Pinned in a mktemp throwaway (git 2.56.0, node v22.22.3), with the function body copied
verbatim:

| Failure | Caught error | Returned |
|---|---|---|
| cwd is a non-repo mkdtemp dir | `status=128`, stdout `""`, stderr `fatal: not a git repository …` | `[]` |
| cwd does not exist | `status=null`, `code=ENOENT`, stdout `undefined` | `[]` |

When the `try` is removed, the non-repo case throws with `status: 128`. The message is
`Command failed: git ls-files -- .\nfatal: not a git repository …`, and git localises that text,
so the test asserts on the status instead.

### Defect 2 — `createTmpGitRepo` inherits `process.env`

`test/helpers/tmp-git-repo.js:28-34`, `runGit = (...args) => execFileSync('git', ['-C', root,
'-c', 'user.email=…', '-c', 'user.name=…', ...args], { encoding: 'utf8' })`, has no `env`, so
every git invocation inherits `process.env`. The sibling `adapters/pi/test/cli.test.js:71-100`
builds `PINNED_ENV` from an allowlist (`PATH`, `HOME`, `GIT_CONFIG_GLOBAL=/dev/null`,
`GIT_CONFIG_SYSTEM=/dev/null`, `GIT_CONFIG_NOSYSTEM=1`) and guards it with a decoy test at
:119-140. `source-hygiene.test.js:408-410` `hermeticGitEnv()` is a second in-repo allowlist
(`PATH`, `GIT_CONFIG_GLOBAL`, `GIT_CONFIG_NOSYSTEM`, no `HOME`).

Pinned in a mktemp throwaway. The decoy is a `git init`-ed mkdtemp dir. `process.env.GIT_DIR`
and `GIT_WORK_TREE` point at it, and then `createTmpGitRepo(['docs/a.md'])` runs:

| Observation | Shipped helper | Helper with the allowlist env (no `HOME`) |
|---|---|---|
| throwaway `root/.git` exists | false | true |
| decoy `.git/index` created | true (decoy's own file staged) | false |
| decoy `.git/config` rewritten (re-init) | true | false |

`HOME` leaks too. `GIT_CONFIG_GLOBAL=/dev/null` does not stop git from reading
`$HOME/.config/git/ignore`, the default `core.excludesFile`:

| Env given to `git init` + `git add -A`, file `a.md`, `$HOME/.config/git/ignore` = `*.md` | `ls-files` |
|---|---|
| `HOME` = that home | `""` (excluded) |
| `HOME` unset, `XDG_CONFIG_HOME` unset | `a.md` |
| `HOME` = the repo root (no `.config` inside) | `a.md` |
| shipped helper, `process.env.HOME` = that home | `""` |
| allowlist helper, no `HOME`, `process.env.HOME` = that home | `docs/a.md` |

This machine has a real `~/.config/git/ignore`, so an inherited `HOME` is a live ambient
input today.

### The only consumer

`test/docs-structure-lint.test.js` calls `createTmpGitRepo` at :109, :132 and :150. It then
runs `scripts/docs-structure-lint.sh --audience` through `sut(dir, cwd)` (:91-98), which
inherits `process.env`. With the allowlist helper copied into a throwaway, the three tests
pass (`# pass 3`). The consumer's own spawn is also ambient-sensitive. Pinned: a throwaway
repo with three stray top-level dirs exits 2 with no ambient variables set, and exits 0 under
an ambient decoy `GIT_DIR`/`GIT_WORK_TREE` (`… is outside repository …`, then "audience shape
OK"). See DC-3.

### Test discovery

The repo root has no `package.json`. Pinned: `npm test` at the root walks up to `$HOME` and
fails with `ENOENT … Could not read package.json`. The root lane is `scripts/ci.sh`
`run_suite process test` (:60): `find test -name '*.test.js'` → `node --test <files>`.
`test/helpers/*.js` is never collected. `test/every-test-file-registers.test.js` requires every
collected file to register a test. The house convention for helper modules is an eponymous
suite: `test/helpers/region-slice.js` ↔ `test/region-slice.test.js`.

## Requirements

| # | Requirement | Proof |
|---|---|---|
| R1 | A failing `git ls-files` makes `listTrackedFiles` throw; nothing is swallowed. | Red test T1 fails on the shipped code (returns `[]`) and passes after. |
| R2 | An ambient `GIT_DIR` + `GIT_WORK_TREE` leaves the decoy untouched, and the throwaway gets its own `.git` tracking the requested files. | Red test T2 (shipped: no `.git`, decoy index created). |
| R3 | An ambient `HOME` (global excludes) does not change what `createTmpGitRepo` stages. Holds under DC-2 (a) or (b). | Red test T3 (shipped: `docs/a.md` not tracked). |
| R4 | Behaviour is unchanged on a clean ambient: every existing caller and consumer stays green unedited, except the two `listTrackedFiles` call sites under DC-1 (a). | `node --test test/source-hygiene.test.js test/docs-structure-lint.test.js`. |
| R5 | Tests restore `process.env` in `finally` from saved prior values (delete only keys that were absent before). | Code review of T2/T3; restoring from saved values is required because `process.env.X = undefined` stores the string `"undefined"`. |

## Design

### Fix 1 — `test/source-hygiene.test.js` (DC-1 (a))

Mirror `architecture-boundaries.test.js:34-40` and the in-file `listHomePathCandidateLines(cwd, …)`
shape:

```js
function listTrackedFiles(cwd, paths) {
  const result = execFileSync('git', ['ls-files', '--', ...paths], {
    cwd,
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  return result.split('\n').filter(Boolean);
}
```

Callers: :175 → `listTrackedFiles(ROOT, [relative])`, :273 → `listTrackedFiles(ROOT, SCANNED_PATHS)`.
`runGrep` (:124-140) is untouched.

### Fix 2 — `test/helpers/tmp-git-repo.js` (DC-2 (a))

```js
// Allowlisted, never spread from process.env: an ambient GIT_DIR/GIT_WORK_TREE would
// redirect init/add into another repo, and an inherited HOME applies the user's global
// excludes file even with GIT_CONFIG_GLOBAL pointed at /dev/null.
function pinnedGitEnv() {
  return {
    PATH: process.env.PATH,
    GIT_CONFIG_GLOBAL: '/dev/null',
    GIT_CONFIG_SYSTEM: '/dev/null',
    GIT_CONFIG_NOSYSTEM: '1',
  };
}
```

`runGit` passes `{ encoding: 'utf8', env: pinnedGitEnv() }`. `PATH` is the ambient one: pi's
synthetic bin dir exists to make `pi` absent, and this helper only needs `git`. The env is
built per call, as `hermeticGitEnv()` is, so `PATH` is read at call time. The return shape
`{ root, cleanup }`, the realpath and the `-c user.*` flags are unchanged.

## Decision candidates

| # | Choice | Alternatives (≤3) | Recommendation | Why |
|---|---|---|---|---|
| DC-1 | Seam to reach the non-exported `listTrackedFiles` | (a) **Required leading `cwd`**: `listTrackedFiles(cwd, paths)`, both callers pass `ROOT`, T1 lives in `source-hygiene.test.js`. (b) Trailing `cwd = ROOT` default; callers untouched. (c) Extract to `test/helpers/tracked-files.js` (+ `test/tracked-files.test.js`), shared with `architecture-boundaries.test.js`. | (a) | Same shape as the in-file `listHomePathCandidateLines(cwd, …)`, whose throwaway-repo tests sit beside it. The `ROOT` dependency is visible at each call. (b) is one diff line smaller, but its default hides which tree is listed. (c) is DRY on paper only: the architecture copy filters `.js` under a fixed `SCAN_ROOT`, so the shared function would need a filter parameter, and two files change for no defect. |
| DC-2 | `HOME` in the helper's pinned env | (a) **Omit `HOME`** (and so `XDG_CONFIG_HOME`), as `hermeticGitEnv()` does. (b) `HOME` = a dedicated mkdtemp sibling of `root`, the pi shape; one more dir to create and clean. (c) `HOME` = `root`. | (a) | Pinned: with no `HOME`, git reads no global excludes and prints no warning. An inherited `HOME` drops fixtures through `~/.config/git/ignore`. (b) is equally hermetic but adds lifecycle for no gain. (c) turns a fixture path `.config/git/ignore` into the global excludes file. |
| DC-3 | The consumer's `sut` spawn, which reports a false pass under an ambient decoy | (a) **Out of scope**: one line in Out of scope with the pinned probe. (b) The helper also returns its env (`{ root, env, cleanup }`) and `docs-structure-lint.test.js` `sut` passes it, with its own red test. | (a) | The backlog item names two sites that write state. This third site is read-only and is a separate spawn in a separate file. Under (b) the helper's contract changes and a third file is touched. If wanted, it is about 5 lines plus one test. |

## Test strategy

TDD: write each test RED first and confirm it fails on the shipped code for the stated reason.
Titles use Given/When/Then, bodies are AAA, and the unit under test is bound to `sut`.

**T1 — `test/source-hygiene.test.js`, after the class-C test (ends :296).** Given a mkdtemp
directory outside any git repository, when `listTrackedFiles` lists it, then it throws
`{ status: 128 }` (`assert.throws`). The dir is removed in `finally`. RED on shipped: returns
`[]`, so `assert.throws` fails ("Missing expected exception").

**T2 — new `test/tmp-git-repo.test.js` (eponymous suite).** Given a decoy GIT_DIR and
GIT_WORK_TREE on the parent process, when `createTmpGitRepo(['docs/a.md'])` runs, then the
throwaway has its own `.git` tracking `docs/a.md` and the decoy has no index.

- Seed the decoy with `git init -q <decoy>` under a test-local allowlist env before touching
  `process.env`.
- Set the ambient variables through a `withAmbientEnv(overrides, act)` helper. It saves
  `process.env[key]` for each key, assigns, runs `act` in `try`, and in `finally` restores each
  saved value, deleting the key only if it was `undefined` before.
- Assert `git -C <root> ls-files` (allowlist env) `=== 'docs/a.md\n'` and
  `!fs.existsSync(<decoy>/.git/index)`. Index absence is used rather than pi's config-mtime
  check because it does not depend on timestamp resolution.
- `cleanup()` and `rmSync(decoy)` run in `finally`.
- RED on shipped: `root/.git` is absent.

**T3 — same file (DC-2 (a)).** Given a HOME whose `.config/git/ignore` holds `*.md`, when
`createTmpGitRepo(['docs/a.md'])` runs under that ambient HOME, then `docs/a.md` is tracked.
It uses the same `withAmbientEnv`. RED on shipped: `ls-files` is `""`.

**Gates.**

- Per part: `node --test test/source-hygiene.test.js test/tmp-git-repo.test.js test/docs-structure-lint.test.js`.
- `npm --prefix engine test`.
- `bash scripts/ci.sh` exits 0. This is the real root lane; `npm test` at the root has no
  `package.json` and cannot run.
- `node engine/bin/stub-lint.js -- <file>` is silent on every touched file.

No Stryker run: `test/` is outside mutation scope.

## Out of scope

- `runGrep` (`test/source-hygiene.test.js:124-140`) treats every non-zero grep exit as no
  match, which includes exit ≥2 (a real error). It is untouched without a red test. Proof
  route: a missing scanned path makes grep exit 2 and `runGrep` returns `[]`.
- `test/docs-structure-lint.test.js` `sut` (:91-98) inherits `process.env`. Pinned: a
  stray-dir throwaway exits 0 instead of 2 under an ambient decoy `GIT_DIR`/`GIT_WORK_TREE`
  (DC-3).
- `listTrackedFiles` still inherits an ambient `GIT_DIR` at `ROOT`, like every other ROOT-reading
  git spawn in the file except class D. T1 assumes no ambient `GIT_DIR`. Pinned: with
  `GIT_DIR` set to a valid repo, the fixed function does not throw from the non-repo cwd.
