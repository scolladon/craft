# Plan — Hermetic test suites

> Source: design doc `docs/design/hermetic-test-suites.md` · ADRs `156, 157, 158, 159`
> The plan is the implementation script AND the knowledge handoff. Part agents start
> with zero context: whatever a part block omits is paid later as agent rediscovery.
> `plan-lint.sh` enforces the schema below — the plan phase cannot close without it.
>
> Phase-boundary gate (runs once, after all parts): `bash scripts/ci.sh`.
> Per-part gate baseline: `cd engine && node --test 'test/**/*.test.js'` (full engine
> suite from `engine/`; fast; does NOT assert the count — the count is enforced only by
> `ci.sh`). Parts 2–4 are cwd/HOME-hermeticity remedies and MUST also stay green from the
> repo-root cwd, so their gate ALSO runs `node --test 'engine/test/**/*.test.js'` from the
> repo root and asserts an identical pass (same `# tests`/`# pass`/`# fail`, exit 0).

## Sizing rules

This is a TEST-INFRA change: there is **no `src/` (production) delta**. Per
`templates/plan.md`, test-infra-only parts (a shared test helper, test-body rewrites,
a tooling-config edit, a new bats guard) ARE legitimately standalone — they have no
implementation part to fold into. Each part below is one atomic, count-aware commit.

Hard constraints baked into every part (injected contract + repo gates):

- **No provenance refs** (ADR/phase/backlog numbers) in any helper, test, `ci.sh`, or
  bats code. ADR rationale lives only in `docs/design` / `docs/adr`. Comments may say
  *why* (e.g. "neutralize ambient $HOME") but never cite an ADR/phase number.
- **No suppression directives** (`eslint-disable`, `@ts-ignore`, coverage-ignore, etc.).
- **No assertion weakened.** Each remedy preserves the exact mutant-killing coverage the
  design names (see each part).
- **State-mutating probes run in `mktemp` throwaways, never the worktree** (seeded `$HOME`,
  scratch cwd, hostile ambients).
- **One shared `EXPECTED_TESTS` constant.** It is bumped exactly once (Part 1, by the
  helper unit-test count). Parts 2–4 are count-neutral (no new `test()` calls).
- `test/source-hygiene.bats` scans a fixed allowlist (`pipeline`, `skills`, `agents`,
  `contracts`, `templates`, `engine/src`, `docs/adapters`, `docs/DOD.md`,
  `docs/GUIDE-customizing.md`, `README.md`). It does **not** scan `engine/test-helpers/`,
  `engine/test/`, `scripts/`, or `test/` — so none of this change can trip the grep-gate.
- **Production bin behaviour is frozen.** cwd-relative default resolution
  (`manifest-lint`'s `?? DEFAULT_MANIFEST`, `contracts-lint`'s `?? 'contracts'`,
  `pipeline-resolve`'s `defaultReadUserPolicy` reading `~/.claude`) stays a real consumer
  feature; only tests become hermetic.

Pinned baseline (verified in-worktree, read-only): `cd engine && node --test
'test/**/*.test.js'` → `# tests 1098 / # pass 1098 / # fail 0`. `scripts/ci.sh` line 10:
`EXPECTED_TESTS=1098`. Both the existing `cd engine` run and the repo-root run emit an
identical `# tests <n>` line (design probe table), so one constant + one
`awk '/^# tests / {print $3}'` idiom gate both runs.

## Part 1 — Shared cwd/HOME isolation helper + unit test + EXPECTED_TESTS bump

> **Amended by ADR-160 (as landed):** `with-cwd.js` shipped **cwd-only** — `withTempHome`
> and `enterTempHome` were removed as unused once A4 moved to the import-order remedy.
> `$HOME` isolation lives in a separate `engine/test-helpers/empty-home.js`. The review phase
> later added a third `with-cwd` test (two-arg seed coverage), so the helper-area tests are
> 3 `with-cwd` (restore-after-success / restore-on-throw / seed-population) + 2 `empty-home`
> (redirect-active / restore), and `EXPECTED_TESTS` landed at **1103**. The source block below
> is the original plan snapshot.

### Context

Create **`engine/test-helpers/with-cwd.js`** (new). Match the plain-ESM `export function`
style of its sibling `engine/test-helpers/capture-io.js` (named exports, no default export,
a leading `//` one-liner stating purpose). It encapsulates the create-temp →
redirect-ambient → run → restore-and-remove-in-`finally` dance currently open-coded at the
landed reference `engine/test/manifest-lint-main.test.js:39` (capture `process.cwd()`,
`mkdtempSync`, `try { chdir; run } finally { chdir back; rmSync }`).

Exact module to produce (reproduce faithfully — this is the audited single home of the
restore guarantee):

```js
// Shared cwd/HOME isolation for unit tests that exercise cwd-relative default
// resolution or ambient-$HOME reads. Each enter/with call restores in finally.
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

function restoreEnv(key, prev) {
  if (prev === undefined) delete process.env[key];
  else process.env[key] = prev;
}

// Create a scratch dir, optionally seed it, chdir in; return a restore() that
// chdirs back to the prior cwd and removes the scratch dir. Internal: withTempCwd wraps it.
function enterTempCwd(seed) {
  const prev = process.cwd();
  const dir = mkdtempSync(join(tmpdir(), 'craft-cwd-'));
  if (seed) seed(dir);
  process.chdir(dir);
  return () => {
    process.chdir(prev);
    rmSync(dir, { recursive: true, force: true });
  };
}

// Point HOME + USERPROFILE (Windows parity) at an empty scratch home; return a
// restore() that restores both env vars and removes the scratch home. Exported so a
// file-scoped before()/after() pair can enter once and leave once without duplicating
// the restore dance.
export function enterTempHome() {
  const prevHome = process.env.HOME;
  const prevProfile = process.env.USERPROFILE;
  const dir = mkdtempSync(join(tmpdir(), 'craft-home-'));
  process.env.HOME = dir;
  process.env.USERPROFILE = dir;
  return () => {
    restoreEnv('HOME', prevHome);
    restoreEnv('USERPROFILE', prevProfile);
    rmSync(dir, { recursive: true, force: true });
  };
}

// withTempCwd(fn) or withTempCwd(seed, fn): run fn in a scratch cwd; restore on return
// AND on throw. Returns fn's value. Accepts sync or async fn.
export async function withTempCwd(seedOrFn, maybeFn) {
  const seed = maybeFn ? seedOrFn : undefined;
  const fn = maybeFn ?? seedOrFn;
  const restore = enterTempCwd(seed);
  try {
    return await fn();
  } finally {
    restore();
  }
}

// withTempHome(fn): run fn under an empty scratch HOME; restore on return AND on throw.
export async function withTempHome(fn) {
  const restore = enterTempHome();
  try {
    return await fn();
  } finally {
    restore();
  }
}
```

Export rationale (avoid dead exports): `withTempCwd` is consumed by Parts 2 and 3 and the
unit test; `withTempHome` is the documented reusable per-unit wrapper exercised by the
unit test; `enterTempHome` is consumed by Part 4's file-scoped `before`/`after` (and backs
`withTempHome`). `enterTempCwd` stays internal — nothing needs a file-scoped cwd enter/leave,
so it is not exported (YAGNI).

Create the helper's unit test **`engine/test/with-cwd.test.js`** (new) — picked up by the
`test/**/*.test.js` glob. Import `{ test } from 'node:test'`, `assert from
'node:assert/strict'`, `{ existsSync } from 'node:fs'`, and the helper. Use
`Given/When/Then` titles, AAA body, `sut` variable (project methodology).

`EXPECTED_TESTS` bump target: **`scripts/ci.sh` line 10**, currently `EXPECTED_TESTS=1098`.
The four prescribed unit tests raise the `cd engine` count to **1102**. This is the SINGLE
constant; Part 5's repo-root run will reuse it unchanged.

### TDD steps

- **RED** — Write the four focused unit tests; before `with-cwd.js` exists the `import`
  throws (module not found), so the file errors. The four tests + expected post-GREEN
  behaviour:
  1. `withTempCwd` restore-after-success: capture `process.cwd()`; inside
     `await withTempCwd(() => process.cwd())` the returned value differs from the prior cwd
     and points at a real dir; after, `process.cwd()` equals the prior cwd and the scratch
     dir (captured inside) no longer exists (`existsSync` false).
  2. `withTempCwd` restore-on-throw: capture the scratch path inside a throwing fn; assert
     `await assert.rejects(() => withTempCwd(() => { const d = process.cwd(); throw new Error('boom'); }))`
     and that after rejection `process.cwd()` is restored and the scratch dir is gone.
  3. `withTempHome` restore-after-success: capture `process.env.HOME`/`USERPROFILE`; inside
     the wrapper both point at a fresh scratch home; after, both are restored to their prior
     values and the scratch home is removed.
  4. `withTempHome` restore-on-throw: a throwing fn still restores both env vars and removes
     the scratch home; the throw propagates (`assert.rejects`).
  Run `cd engine && node --test 'test/**/*.test.js'` → the new file fails (import error).
- **GREEN** — Add `engine/test-helpers/with-cwd.js` exactly as specified above. Rerun the
  engine suite → all four pass, total `# tests 1102 / # pass 1102 / # fail 0`.
- **Bump the count** — Run `cd engine && node --test 'test/**/*.test.js' 2>&1 | grep '^# tests'`,
  read `N` (expected `1102`), and set `EXPECTED_TESTS=N` in `scripts/ci.sh` line 10 in THIS
  commit. (If the structure deviates from four tests, use the printed `N` — never guess.)
- **REFACTOR** — Confirm the restore logic lives once (`restoreEnv` + the two `enter*`
  primitives; `withTempHome` delegates to `enterTempHome`). No duplication, no provenance refs.

### Gate

`cd engine && node --test 'test/**/*.test.js'` → green, `# tests 1102`.
(Optional sanity, not the part gate: `bash scripts/ci.sh` should pass with the bumped constant.)

### Commit

`test(engine): add cwd/HOME isolation test helper and bump expected count`

## Part 2 — A2: manifest-lint default-branch test made cwd-hermetic

### Context

File: **`engine/test/manifest-lint-main.test.js`**. Target the test at **line 164**, titled
`'Given no argv, when main runs with the default path absent, then stdout names the exact
default path .claude/workflow.md'`. Current body:

```js
const sut = main;
const io = makeCaptureIo();
const result = sut([], io);
assert.equal(result, 0);
assert.ok(io.stdout.joined().includes('.claude/workflow.md'),
  `stdout must include ".claude/workflow.md"; got: ${io.stdout.joined()}`);
```

Defect: `main([], io)` resolves the default `.claude/workflow.md` relative to
`process.cwd()` (production const `DEFAULT_MANIFEST = '.claude/workflow.md'` at
`engine/src/manifest-lint-main.js:10`). From `cd engine` the default is absent → absent
branch; but from the **repo root** the repo ships a valid `.claude/workflow.md` (dogfood
manifest) → the **valid** branch runs and its message `.claude/workflow.md valid.` happens
to satisfy both assertions. The test silently tests the wrong branch depending on cwd —
and under Stryker (cwd = repo root) it does not exercise the absent branch it is meant to.

Remedy: run the no-arg call inside an **empty** `withTempCwd` scratch so the default
`.claude/workflow.md` is always absent → absent branch under every cwd. Add
`import { withTempCwd } from '../test-helpers/with-cwd.js';` to the import block (alongside
the existing `makeCaptureIo` import). Make the target test `async`.

Mutant preserved (must still die): `StringLiteral('.claude/workflow.md' → "")` at
`engine/src/manifest-lint-main.js:10` — with the default literal emptied, the absent-branch
message no longer names `.claude/workflow.md`, so the `.includes('.claude/workflow.md')`
assertion fails. Final assertions stay exactly `result === 0` +
`stdout.includes('.claude/workflow.md')` (design constraint — unchanged).

DO NOT touch line 39 (the landed reference fix; stays inline). DO NOT touch the other
no-arg-adjacent tests at lines 26 (`/no/such/workflow.md`, absolute) and 67 (`__dir`,
absolute) — they are cwd-independent already.

### TDD steps

- **RED** — Prove the cwd coupling without mutating the worktree: temporarily add a
  discriminating assertion to the target test, `assert.ok(io.stdout.joined().includes('no
  manifest at'))`, then run `node --test engine/test/manifest-lint-main.test.js` from the
  **repo root** (`/Users/scolladon/workspace/perso/craft-hermetic-test-suites`). It FAILS:
  the repo's valid `.claude/workflow.md` drives the valid branch whose message is
  `.claude/workflow.md valid.` (no `no manifest at`). Failure reason: the branch under test
  is chosen by cwd, not controlled by the test.
- **GREEN** — Wrap the call: `const result = await withTempCwd(() => main([], io));`. The
  empty scratch cwd forces the absent branch under any cwd, so the discriminating marker
  passes from both cwds. Remove the temporary marker; the final assertions are exactly the
  design's pair (`result === 0` + `stdout.includes('.claude/workflow.md')`).
- **REFACTOR** — Confirm `async`/`await` is the only structural change, no new `test()`
  (count-neutral, stays 1102), import added once, no provenance refs.

### Gate

Both must pass identically (same `# tests`/`# pass`/`# fail`, exit 0):
- `cd engine && node --test 'test/**/*.test.js'`
- from repo root: `node --test 'engine/test/**/*.test.js'`

### Commit

`test(engine): make manifest-lint default-branch test cwd-hermetic`

## Part 3 — A3: contracts-lint default-branch test made cwd-hermetic

### Context

File: **`engine/test/contracts-lint-main.test.js`**. Target the test at **line 143**, titled
`'Given no dir arg, when main runs from repo root, then it defaults to the contracts/
directory and returns 0'`. Current body:

```js
const io = makeCaptureIo();
const cwd = process.cwd();
process.chdir(join(__dir, '..', '..'));
try {
  const result = main([], io);
  assert.equal(result, 0, `stderr: ${io.stderr.joined()}`);
  assert.ok(io.stdout.joined().includes('bundles OK'), `stdout: ${io.stdout.joined()}`);
} finally {
  process.chdir(cwd);
}
```

Defect: `main([])` resolves `argv[0] ?? 'contracts'` against `process.cwd()`
(`engine/src/contracts-lint-main.js:15` — `resolve(argv[0] ?? 'contracts')`). The test
`chdir`s into the **real repo root** and reads the **committed `contracts/`** dir, so its
green depends on that dir existing, being complete, non-empty, and free of the word
`retrieval` — and it mutates cwd into the live repo dir (no scratch).

Remedy: replace the manual `chdir`-to-repo-root with `withTempCwd(seed, () => main([], io))`
over a scratch cwd whose `contracts/` subdir is seeded full and clean.

CRITICAL cwd detail: `main([])` resolves `'contracts'` **relative to cwd**, i.e.
`<scratch>/contracts`. The seed MUST create `<scratch>/contracts` (a subdir) and populate
THAT — not the scratch root. Pin: `seed(scratch) => { const c = join(scratch, 'contracts');
mkdirSync(c); populateContracts(c); }`.

Reuse the file's existing population logic. Refactor the existing helper
`makeFullContractsDir()` (lines 30–36) by extracting a `populateContracts(targetDir)` that
writes one non-empty, retrieval-free file per bundle into a GIVEN dir:

```js
function populateContracts(targetDir) {
  for (const name of BUNDLE_NAMES) {
    writeFileSync(join(targetDir, `${name}.md`), `${name} content — invariants here.\n`);
  }
}
function makeFullContractsDir() {
  const dir = mkTmp();
  populateContracts(dir);
  return dir;
}
```

(`BUNDLE_NAMES = [...BUNDLE_VOCAB]` is already defined at line 20; `mkdirSync`,
`writeFileSync`, `join` are already imported.) The seed content `"${name} content —
invariants here.\n"` is non-empty and contains no `retrieval` token, so the present/clean
branch is exercised faithfully. Add `import { withTempCwd } from '../test-helpers/with-cwd.js';`.
Make the target test `async`.

Mutant preserved (must still die): `?? 'contracts'` nullish-default at
`engine/src/contracts-lint-main.js:15` — with the default removed, `main([])` resolves
`undefined` → no `contracts/` lookup → not the success path → `result === 0` +
`bundles OK` fails. Final assertions stay `result === 0` + `stdout.includes('bundles OK')`
(unchanged). DO NOT disturb the other tests (they pass explicit absolute dirs:
temp dirs or `REAL_CONTRACTS`).

### TDD steps

- **RED** — Prove the ambient-`contracts/` coupling in a worktree-safe way: temporarily
  point the existing `process.chdir(...)` at a fresh empty `mkTmp()` dir (no `contracts/`
  subdir) and run the file. `main([])` returns `2` (missing bundles) and the
  `bundles OK` assertion fails. Failure reason: the test's green depends on the ambient
  repo `contracts/` at the default cwd-relative location.
- **GREEN** — Replace the whole `chdir`/try/finally with
  `const result = await withTempCwd(seedContracts, () => main([], io));` where
  `seedContracts(scratch)` creates `<scratch>/contracts` and calls `populateContracts` on
  it; extract `populateContracts(targetDir)` and rewire `makeFullContractsDir` to use it.
  Rerun → green from any cwd. Assertions unchanged.
- **REFACTOR** — Confirm `populateContracts` is the single population path (no duplicated
  write loop), no new `test()` (count stays 1102), import added once, no provenance refs.

### Gate

Both must pass identically (same `# tests`/`# pass`/`# fail`, exit 0):
- `cd engine && node --test 'test/**/*.test.js'`
- from repo root: `node --test 'engine/test/**/*.test.js'`

### Commit

`test(engine): make contracts-lint default-branch test cwd-hermetic`

## Part 4 — A4: isolate pipeline-resolve tests from ambient $HOME

> **Amended by ADR-160 (as landed):** implemented **test-only with no production change**.
> Because `pipeline-resolve-main.js` captures `homedir()` in module-level constants, a
> `before()` hook runs too late; instead `engine/test/pipeline-resolve-main.test.js` imports
> `../test-helpers/empty-home.js` as its FIRST import (redirecting `$HOME`/`USERPROFILE` to an
> empty mktemp dir at import time, before the module under test evaluates) and tears it down in
> `after()` via `restoreEmptyHome()`. The `before`/`after` + `enterTempHome` approach described
> below is superseded; the production `homedir()`-lazy option was rejected per the non-goal.

### Context

File: **`engine/test/pipeline-resolve-main.test.js`** (flat file — all `test()` calls at
top level, NO `describe` block; 82 tests). Current imports line 1:
`import { test, after } from 'node:test';`. An existing top-level `after()` at line 22
cleans up `tmpDirs`.

Defect: ~45 of the 82 tests call `main([...], io)` **without** injecting
`{ readUserPolicy }`, so the real `defaultReadUserPolicy` reads
`~/.claude/craft-policy.md`. Empirically, seeding `$HOME` with a user policy flips 45 of 82
red; the suite is green only because the dev/CI `$HOME` happens to be clean. The tests that
DO pass `{ readUserPolicy: () => ... }` (e.g. lines 1038, 1085, 1114, 1151, 1163, 1210,
1234) inject their own reader and MUST NOT be disturbed. The anchor test at **line 1175**
(`'Given no deps (real default reader) and no ~/.claude/craft-policy.md, when main runs,
then returns 0 ... empty policy'`) deliberately exercises the REAL `defaultReadUserPolicy`
on its ENOENT → `{ok:true, policy:{}}` path — that coverage must stay live (do NOT inject a
stub reader anywhere; that would delete the no-deps `:1175` mutant coverage).

**A4 wiring choice — (b) file-scoped `before()`/`after()`** (chosen; see justification
below). Neutralize the ambient `$HOME` for the whole file via the shared helper's
`enterTempHome()` primitive, entered once before all tests and left once after:

```js
import { test, before, after } from 'node:test';
// ... existing imports ...
import { enterTempHome } from '../test-helpers/with-cwd.js';

// Neutralize the ambient $HOME so the real default policy reader hits an empty home
// (ENOENT) deterministically, independent of the developer's/CI's ~/.claude.
let restoreHome;
before(() => { restoreHome = enterTempHome(); });
after(() => { restoreHome(); });
```

Place the new `before`/`after` pair near the existing `after()` (line 22). `node:test`
runs all top-level `after()` hooks; the existing `tmpDirs` cleanup and the new HOME restore
are independent (order-agnostic). The module-scoped `let restoreHome` is the required shared
handle between the two hooks (idiomatic test setup/teardown; this is test infra).

Why (b) over (a) "wrap each affected test in `withTempHome(...)`":
- **Minimal-diff**: 3 added lines + 1 import + 1 import-symbol vs rewriting ~45 test bodies
  (and making each `async`), which also risks disturbing the inject-reader tests.
- **Count-neutral**: `before`/`after` add no `test()` — the count stays 1102 (A4 must not
  change it). Wrapping bodies is also count-neutral, but far larger.
- **Restores even on failure**: `node:test` always runs `after()` hooks, so the empty home
  is torn down and `$HOME`/`USERPROFILE` restored regardless of test outcome.
- **Keeps `:1175` real**: HOME is redirected to an EMPTY mktemp home, so
  `defaultReadUserPolicy` still runs and still hits its real ENOENT → `{ok:true,
  policy:{}}` path — the no-deps mutant coverage is preserved, no assertion weakened.
The helper owns the mktemp-home/restore logic (`enterTempHome`); `before`/`after` only
delegate to it — no duplicated restore dance (and `withTempHome` is built on the same
primitive).

Mutants preserved (must still die): the no-deps `defaultReadUserPolicy` targets exercised
by the `:1175` test stay killed, because the real reader still runs against an empty home.

### TDD steps

- **RED** — Prove the ambient-`$HOME` coupling in a `mktemp` throwaway (never the worktree):
  create a temp home, write `<temp>/.claude/craft-policy.md` with a bogus verdict
  (e.g. `---\npolicy:\n  maybe: [integrate]\n---\n`), then run
  `HOME=<temp> USERPROFILE=<temp> node --test engine/test/pipeline-resolve-main.test.js`.
  Observe the no-dep tests (incl. line 1175) flip red (~45 fail): the real reader picks up
  the bogus policy. Failure reason: the file's green depends on a clean ambient `$HOME`.
- **GREEN** — Add the `before`/`after` pair (and the `before` + `enterTempHome` imports) as
  specified. Re-run with the SAME poisoned `HOME=<temp> USERPROFILE=<temp>` → all 82 pass,
  because `before()` redirects HOME to a fresh empty mktemp home for the file's duration,
  overriding the poisoned ambient. Then run with a clean `$HOME` too → still 82/82.
- **REFACTOR** — Confirm: no `test()` added (count stays 1102); no inject-reader test was
  edited; no stub `readUserPolicy` introduced; the existing line-22 `after()` is untouched;
  no provenance refs in the added comment.

### Gate

Both must pass identically (same `# tests`/`# pass`/`# fail`, exit 0):
- `cd engine && node --test 'test/**/*.test.js'`
- from repo root: `node --test 'engine/test/**/*.test.js'`

### Commit

`test(engine): isolate pipeline-resolve tests from ambient $HOME`

## Part 5 — Durable hermeticity guard: bats smoke + ci.sh repo-root engine run

### Context

Two durable guards land here; they go LAST so the repo-root `ci.sh` run and the bats smoke
are green against already-hermetic offenders (Parts 2–4).

**(1) New bats file `test/hermetic-suite.bats`.** Match the style of existing bats files
(e.g. `test/p10-structure.bats`): `#!/usr/bin/env bats`, anchor
`ROOT="$(cd "${BATS_TEST_DIRNAME}/.." && pwd)"`, `@test` blocks using `run bash -c "..."`,
`mktemp -d "${BATS_TMPDIR}/...-XXXXXX"` for any scratch, `rm -rf` after. `bats test/`
(already in `ci.sh` line 32, whole-dir) auto-discovers the new file — no discovery edit.
Two cases:

```bash
#!/usr/bin/env bats

ROOT="$(cd "${BATS_TEST_DIRNAME}/.." && pwd)"

@test "Given the default-resolution engine tests run from repo-root cwd, then they exit 0 (cwd-hermetic)" {
  run bash -c "cd '${ROOT}' && node --test engine/test/manifest-lint-main.test.js engine/test/contracts-lint-main.test.js"
  [ "$status" -eq 0 ]
}

@test "Given a hostile seeded ambient (HOME with a user policy, cwd with an invalid default manifest), when the ambient-sensitive engine tests run, then they still exit 0 (ambient-hermetic, not merely lucky)" {
  HOSTILE_HOME="$(mktemp -d "${BATS_TMPDIR}/craft-hostile-home-XXXXXX")"
  HOSTILE_CWD="$(mktemp -d "${BATS_TMPDIR}/craft-hostile-cwd-XXXXXX")"
  mkdir -p "${HOSTILE_HOME}/.claude" "${HOSTILE_CWD}/.claude"
  printf -- '---\npolicy:\n  never: [integrate]\n---\n' > "${HOSTILE_HOME}/.claude/craft-policy.md"
  printf -- 'not a valid manifest: : :\n' > "${HOSTILE_CWD}/.claude/workflow.md"
  run bash -c "cd '${HOSTILE_CWD}' && HOME='${HOSTILE_HOME}' USERPROFILE='${HOSTILE_HOME}' node --test '${ROOT}/engine/test/manifest-lint-main.test.js' '${ROOT}/engine/test/pipeline-resolve-main.test.js'"
  rm -rf "${HOSTILE_HOME}" "${HOSTILE_CWD}"
  [ "$status" -eq 0 ]
}
```

The hostile case proves the suite is impervious, not lucky: A2 reads its own empty
`withTempCwd` scratch (never the hostile cwd's `.claude/workflow.md`); A4 redirects HOME to
its own empty mktemp home (never the hostile `craft-policy.md`). Fixtures resolve via each
test file's `__dir`, so running the files by absolute path from a hostile cwd is sound.

**(2) Second repo-root engine run in `scripts/ci.sh`.** Append, AFTER the existing
`cd engine` engine block (after line 22, before the `EXPECTED_PI_TESTS` block), a whole-suite
run from the repo root that REUSES the single `EXPECTED_TESTS` constant (already bumped to
`1102` in Part 1) and the same `awk '/^# tests / {print $3}'` idiom. Keep it
shellcheck-clean (quote expansions, `printf '%s\n'`) — `ci.sh` line 32 runs
`shellcheck scripts/*.sh`. Exact block:

```bash
root_node_output="$(node --test 'engine/test/**/*.test.js' 2>&1)" && root_node_status=0 || root_node_status=$?
echo "$root_node_output"
[ "$root_node_status" -eq 0 ] || {
  echo "ci: repo-root node --test failed (exit ${root_node_status})" >&2
  exit "$root_node_status"
}
actual_root_tests="$(printf '%s\n' "$root_node_output" | awk '/^# tests / {print $3}')"
[ "$actual_root_tests" = "$EXPECTED_TESTS" ] || {
  echo "ci: repo-root test count drift — expected ${EXPECTED_TESTS}, got ${actual_root_tests}" >&2
  exit 1
}
```

`ci.sh` already `cd`s to the repo root at line 8, so the glob `engine/test/**/*.test.js`
runs from there (design-pinned: Node 22 discovers all 1102, exit 0, identical `# tests`
line). Do NOT re-bump `EXPECTED_TESTS` here. No provenance refs anywhere.

### TDD steps

- **RED (guard self-check — proves both guards bite)** — Temporarily add a throwaway
  A1-class test into a bats-named file (`engine/test/manifest-lint-main.test.js`): a no-arg,
  no-scratch test asserting the absent branch, e.g.
  `test('guard probe', () => { const io = makeCaptureIo(); main([], io); assert.ok(io.stdout.joined().includes('no manifest at')); });`.
  From the repo root this fails (the repo's valid `.claude/workflow.md` drives the valid
  branch). Confirm BOTH new guards catch it: `bats test/hermetic-suite.bats` (case 1 runs
  that file from repo-root cwd → red) AND `node --test 'engine/test/**/*.test.js'` from repo
  root (the new `ci.sh` step → red; the count gate also fires, 1103 ≠ 1102). This proves the
  comprehensive net catches a coupling even before adding the offender to the smoke's named
  list. Then DELETE the probe (restores count to 1102, both guards green).
- **GREEN** — With the probe removed and Parts 2–4 landed: add `test/hermetic-suite.bats`
  and the `ci.sh` repo-root block. `bats test/hermetic-suite.bats` (both cases) green; the
  repo-root engine run green at `# tests 1102`.
- **REFACTOR** — Confirm the `ci.sh` block reuses the single `EXPECTED_TESTS` + the same
  `awk` idiom (no second constant, no duplicated extraction style); bats file matches sibling
  style; everything shellcheck-clean; no provenance refs.

### Gate

All green:
- `cd engine && node --test 'test/**/*.test.js'` (→ `# tests 1102`)
- from repo root: `node --test 'engine/test/**/*.test.js'` (→ `# tests 1102`, the new net)
- `bats test/hermetic-suite.bats`
- `bash scripts/ci.sh` (the phase-boundary gate — exercises both engine runs + count gate +
  `bats test/` incl. the new file + shellcheck)

### Commit

`test: add hermetic-suite guard — bats smoke + ci.sh repo-root engine run`
