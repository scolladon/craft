# Design — Hermetic test suites

> Brief: Make the test suites hermetic — no test may depend on the process cwd or on ambient repo files; a test must be deterministic regardless of the cwd it is invoked from and regardless of which config files the repo itself ships.
> Status: accepted → revised against ADRs 156–160 (self-reviewed ×1 on the A4 fold-back)

## Context

craft has two test suites:

- **engine `node:test`** — 37 files under `engine/test/**`, **1098 tests**. Run by `scripts/ci.sh` as `cd engine && node --test 'test/**/*.test.js'`. The CI substrate asserts a fixed `EXPECTED_TESTS=1098` count (drift fails the build). Mutation (validation phase) runs the same files via `engine/stryker.conf.json`, whose `testFiles: ["engine/test/**/*.test.js"]` and `tempDirName: "engine/.stryker-tmp"` mean **Stryker's cwd is the repo root**, not `engine/`.
- **bats** — 10 `.bats` files + `test/helpers/*.bash` + `test/fixtures/**`. Run by `scripts/ci.sh` as `bats test/` (no count gate).

The suites exercise the engine bins through two seams already in place:

- an **io capture seam** (`engine/test-helpers/capture-io.js` `makeCaptureIo()`) so `main(argv, io)` can be driven in-process;
- **dependency injection** on the policy reader (`main(argv, io, { readUserPolicy })`) and the manifest file-existence check (`{ fileExists }`).

Fixtures are anchored to the test file's own location: engine tests derive paths from `__dir = dirname(fileURLToPath(import.meta.url))`; bats files derive every anchor (`ROOT`, `FIXTURES`, `EXAMPLES`, `SCRIPTS_DIR`, `HOOKS_DIR`) from `$BATS_TEST_DIRNAME` and every throwaway from `mktemp -d "${BATS_TMPDIR}/…"`. Both `$BATS_TEST_DIRNAME` and `$BATS_TMPDIR` are cwd-independent.

**The reference remedy already landed.** `engine/test/manifest-lint-main.test.js:39` (the first no-argv test) was previously cwd-fragile: it asserted `stdout.includes('no manifest at')` for the default manifest path, which is resolved relative to `process.cwd()`. It passed under `cd engine && node --test` (no `.claude/workflow.md` in `engine/`) but failed under Stryker's repo-root cwd once craft committed its own `.claude/workflow.md` for dogfood. The landed fix wraps the call in `mkdtempSync` + `process.chdir(scratch)` + `try/finally` restore + `rmSync` (lines 46–55). That **mkdtemp+chdir+finally** dance — or passing an explicit absolute path, or seeding the ambient file inside a throwaway dir — is the canonical remedy. The remediated sites in this change do **not** open-code it: they call a shared helper (`engine/test-helpers/with-cwd.js`, ADR-158) that encapsulates exactly this dance. This design does **not** re-touch the landed reference at line 39 (it stays inline); it is the pattern the rest of the audit applies.

Constraints that bind this change (from the injected contract and repo gates):

- **No provenance refs** (phase/ADR/backlog numbers) and **no suppression directives** in any test code touched.
- **`test/source-hygiene.bats`** grep-gate scans a fixed allowlist (`pipeline`, `skills`, `agents`, `contracts`, `templates`, `engine/src`, `docs/adapters`, `docs/DOD.md`, `docs/GUIDE-customizing.md`, `README.md`) and **explicitly never scans `engine/test/` or `test/`**. New/edited test code therefore cannot trip Class-A/B grep, but the no-provenance rule still applies by contract.
- **Production bin behaviour is frozen.** cwd-relative default resolution is a real consumer feature — only the tests change.

### Empirically pinned facts (run against the live engine in this worktree)

State-mutating probes (seeding a `$HOME`, a scratch cwd) were run in `mktemp` throwaways, never the worktree. The `node --test` probes below are read-only against the repo.

| Probe | Result | Consequence |
|---|---|---|
| `.claude/workflow.md` present in worktree? | **yes**, 850 B, lints **valid** | The repo ships a valid dogfood manifest at the default path — the exact ambient file that breaks cwd-relative default tests from repo root. |
| `node engine/bin/manifest-lint.js` (no arg) **from repo root** | `…/.claude/workflow.md valid.` exit 0 | The no-arg bin resolves the default against cwd and finds the dogfood manifest → exercises the **valid** branch. |
| `node bin/manifest-lint.js` (no arg) **from `engine/`** | `no manifest at .claude/workflow.md …` exit 0 | Same invocation, different cwd → exercises the **absent** branch. The branch under test is chosen by cwd. |
| `node --test engine/test/manifest-lint-main.test.js` from repo root vs `engine/` | both 11/11 pass | A2 passes from both **today** — by luck (dogfood manifest happens to be present + valid); it is latently fragile, not yet red. |
| `node --test engine/test/contracts-lint-main.test.js` from repo root | 8/8 pass | A3 passes today — relies on the committed `contracts/` being present, complete, non-empty, and free of the word `retrieval`. |
| `pipeline-resolve-main.test.js` with **seeded `$HOME/.claude/craft-policy.md`** (one bogus verdict) | **45 of 82 FAIL** | A swathe of tests call `main` without injecting `readUserPolicy`; the real `defaultReadUserPolicy` reads the ambient `~/.claude/craft-policy.md`. |
| same file with the **real (clean) `$HOME`** | 82/82 pass | The 45 reds are caused purely by ambient `$HOME` state — a developer or consumer with a user policy file gets a red suite. |
| repo-root `node --test 'engine/test/**/*.test.js'` (Node 22.22.3) | **1098/1098 pass** | The repo-root glob invocation works on Node 22 — this is the acceptance command for cwd (2) and the new `ci.sh` repo-root step (ADR-156). |
| repo-root run summary line + exit vs the `cd engine` run | both emit `# tests 1098`, exit 0 — **identical** count line | Both `ci.sh` engine runs (the existing `cd engine` run and the new repo-root step) produce the same `# tests <n>` line, so the **single** `EXPECTED_TESTS` constant + the same `awk '/^# tests / {print $3}'` extraction gate **both** runs. The constant is later bumped once by the new helper-area unit tests (`with-cwd.js` plus `empty-home.js`, +5 → 1103); both runs then assert that bumped value. |
| `bats test/` anchors | every anchor is `$BATS_TEST_DIRNAME`/`$BATS_TMPDIR`-derived | The bats suite is already hermetic on the cwd axis — **0 offenders**. |

## Requirements

When this ships, all are true:

1. The full engine suite passes **identically** from three cwds: (1) `cd engine && node --test 'test/**/*.test.js'`; (2) repo-root `node --test 'engine/test/**/*.test.js'`; (3) an arbitrary cwd (e.g. `cd /tmp && node --test '<abs>/engine/test/**/*.test.js'`). The Stryker repo-root run (validation phase) sees the same green.
2. The bats suite passes identically from repo root and from an arbitrary cwd.
3. No test's pass/fail depends on the repo's **own** committed `.claude/workflow.md`, `.claude/craft-memory.md`, `.claude/craft-metrics.md`, on `docs/DOD.md`, on cwd-relative discovery of `pipeline/default.yml`, on ambient lockfiles, **or on a file under the user's home dir** (`~/.claude/craft-policy.md`). Tests exercising a "file present" or "file absent" branch **make that state deterministic before the production code reads it**: cwd offenders seed or clear a throwaway dir (via `withTempCwd`); the `$HOME` offender (A4) redirects `$HOME` to an empty scratch dir **at import time** (via `engine/test-helpers/empty-home.js`), before the module under test captures `homedir()`.
4. Every remedied test still **kills the same mutant(s)** it killed before — no assertion is weakened; the remedy only makes the ambient state deterministic.
5. **No production bin behaviour changes** — the cwd-relative default-resolution features stay.
6. A **durable two-part guard** (ADR-156) makes the invariant stick, both run by `scripts/ci.sh` and green at every commit: (i) `test/hermetic-suite.bats`, a repo-root smoke over the representative default-resolution files; and (ii) a second whole-suite repo-root `node --test 'engine/test/**/*.test.js'` step in `scripts/ci.sh`, **in addition to** the existing `cd engine` run.
7. The engine `node:test` count gate stays correct: `EXPECTED_TESTS` is bumped by exactly the new helper-area unit tests (`with-cwd.js` plus `empty-home.js`, +5 → 1103; the A2/A3/A4 remedy edits are themselves count-neutral), and **both** `ci.sh` engine runs assert that one shared value. The `source-hygiene` gate stays green; no provenance refs or suppression directives enter touched test code.

## Design

### Two fragility shapes (the audit lens)

- **(a) cwd-relative path resolution** — a test calls a `bin`/`main` with **no path** (or a relative path) and relies on `process.cwd()` to resolve a default.
- **(b) ambient-file dependence** — a test's pass/fail depends on a **repo file** existing (or not) at a default location.

A third shape surfaced during the audit — the same disease on a different vector, now **ratified into scope** (ADR-159):

- **(c) ambient `$HOME` dependence** — a test's pass/fail depends on a file under the user's home dir (`~/.claude/craft-policy.md`). Remediated alongside (a)/(b).

### Offender inventory

Line numbers are current as of this worktree.

| file:line | shape | depends on | prescribed remedy | why that remedy |
|---|---|---|---|---|
| **A2** · `engine/test/manifest-lint-main.test.js:164` (`…names the exact default path .claude/workflow.md`) | a + b | `main([], io)` with no chdir → default `.claude/workflow.md` resolved against cwd. From repo root the committed dogfood manifest is **present + valid**, so the test silently exercises the `valid.` branch and its green is contingent on that file staying present and valid (one bad dogfood edit → exit 2 → red; and under Stryker it tests the wrong branch). | **`withTempCwd(fn)`** (shared helper, ADR-158) over an **empty** scratch cwd — the helper `mkdtempSync`es, `chdir`s in, runs `main([], io)`, then restores cwd and `rmSync`s in `finally` (even on throw). Same dance as the landed fix at line 39, now factored. | The branch under test is the **no-arg default-absent** message; only an empty cwd exercises it deterministically. The bin has **no path-arg seam for the default branch** — an explicit path would delete the very coverage. Assertions (`result===0`, `stdout.includes('.claude/workflow.md')`) are unchanged. |
| **A3** · `engine/test/contracts-lint-main.test.js:143` (`…defaults to the contracts/ directory`) | a + b | `process.chdir(join(__dir,'..','..'))` to the **real repo root** (try/finally restore but **no mkdtemp scratch**), then `main([])` resolves `?? 'contracts'` against cwd and reads the **committed `contracts/`** — relies on it being present, complete, non-empty, and free of the word `retrieval`. | **`withTempCwd(seed, fn)`** (shared helper, ADR-158) where `seed` writes a full, clean contracts tree into the scratch dir (the file's existing `makeFullContractsDir` population, adapted to seed the provided dir), then `main([])` asserts `0` + `bundles OK`; the helper restores cwd and `rmSync`s in `finally`. | The `?? 'contracts'` default resolves against cwd with no path-arg seam, so the test must control cwd; seeding a full, clean contracts dir in temp tests the default faithfully without coupling to the shipped `contracts/` content or mutating cwd into a live repo dir. Assertions unchanged. |
| **A4** · `engine/test/pipeline-resolve-main.test.js` (45 of 82 tests; the no-deps test at **:1175** is the intentional anchor) | **c** (ratified in scope, ADR-159; mechanism refined by ADR-160) | Tests call `main([pipelinePath], io)` **without** injecting `readUserPolicy`; the real `defaultReadUserPolicy` reads `~/.claude/craft-policy.md`. Green depends on the developer's/CI's `$HOME` not shipping a user policy. | **Test-only import-order `$HOME` redirect (ADR-160) — no production change.** A side-effecting helper, `engine/test-helpers/empty-home.js`, `mkdtemp`s an empty home and points `process.env.HOME` (and `process.env.USERPROFILE` for Windows parity) at it **at import time**, exporting `restoreEmptyHome()`. The test file imports it as its **first** import — before `../src/pipeline-resolve-main.js`, whose module-level `USER_POLICY_ROOT`/`USER_POLICY_PATH` constants capture `homedir()` at evaluation — so the production module captures the empty home; an `after()` calls `restoreEmptyHome()` (restores both env vars + `rmSync`). No `test()` entry is added. (A file-scoped `before()`/`after()` wrap cannot work here: those constants are already fixed by the time `before()` runs — see ADR-160.) | `os.homedir()` honours `process.env.HOME` on POSIX (confirmed: seeding `$HOME` flipped 45 tests). Redirecting `$HOME` to an empty dir **before the module evaluates** makes the absent-state deterministic **while still exercising the real `defaultReadUserPolicy`** (ENOENT → catch → `{ok:true, policy:{}}`), so the no-coverage mutants the :1175 test targets stay killed — no assertion weakened, no stub reader injected. The import + `after()` add no `test()` entry → the A4 edit is count-neutral. In scope (ADR-159), fixed test-only (ADR-160). |

**Engine offender count: 3** — A2, A3 (the brief's named (a)/(b) cwd+repo axis) and A4 (shape (c), ambient `$HOME`, ratified into scope by ADR-159).
**Bats offender count: 0.**

### Audited clean (suspicious-but-safe — do not re-flag)

- `engine/test/manifest-lint-main.test.js:39` — **already remediated** (the reference pattern); not re-touched.
- `engine/test/manifest-lint-main.test.js:30,67` — pass **absolute** paths (`/no/such/workflow.md`, `__dir`); cwd-independent.
- `engine/test/init-config-main.test.js` (`main(['ci'], io)` uses `process.cwd()` as repoRoot) — **safe**: the bin prints `relative(repoRoot, join(repoRoot, '.claude/craft-ci.md'))`; both sides derive from the same cwd, so the printed relative path is invariably `.claude/craft-ci.md`. The cwd cancels out; assertions are on the relative string only.
- `engine/test/init-config.bin.test.js` — **safe**: `spawnSync(..., { cwd: '/tmp' })` is explicit and the relative output is constant.
- `engine/test/manifest-lint.bin.test.js`, `engine/test/pipeline-resolve.bin.test.js` — **safe**: every invocation passes an absolute `__dir`-derived path; no default discovery.
- Golden-file readers of `pipeline/default.yml` and `contracts/` via `__dir`-derived **absolute** paths — `descriptor.test.js`, `resolve.test.js`, `scenarios.test.js`, `graph.test.js`, `contract.test.js`, `model-class-shape.test.js`, `autoskip.test.js`, `contract-assemble.test.js`, `contract-assemble-main.test.js` — **safe**: the artifact is the subject under test (golden coupling), read by an absolute path, deterministic across cwds. This is **not** "default discovery" (shape b is specifically cwd-relative discovery; `contract-assemble-main` resolves its defaults from a `REPO_ROOT` derived from `__dir`, never from cwd — that is why it is clean while `contracts-lint-main`'s `?? 'contracts'` cwd default is A3).
- `engine/test/manifest.test.js` dod/`fileExists` cases — **safe**: inject `fileExists` (`ALWAYS_EXISTS`/`NEVER_EXISTS`); no real I/O.
- `engine/test/policy.test.js` `containUserPolicyPath` cases using `join(homedir(),'.claude')` — **safe**: pure path-string predicate, no file I/O.
- `engine/test/init-emit-main.test.js` / `engine/test/init-emit.bin.test.js` — **safe**: every `main` out-path and answers-path is **absolute** (`/tmp/out.md`, `/no/such/dir/out.md`) or `mkdtemp`-derived (`join(dir, …)`); `.claude` writes land under an mktemp `join(dir, '.claude')`. No cwd-relative read or write.
- `engine/test/normalize-findings-main.test.js` / `engine/test/normalize-findings-bin.test.js` — **safe**: the ENOENT-propagation test passes an **absolute** nonexistent path (`/no/such/normalize-findings/specific-file-123.json`); the empty-`argv[0]` test routes to `readStdin` (no path). Cwd-independent.
- **All bats files** — **safe**: anchors are `$BATS_TEST_DIRNAME`-derived; throwaways are `mktemp -d "${BATS_TMPDIR}/…"`; `detect-ecosystem.bats` touches lockfiles **inside** its mktemp dir, never the repo's. The repo files bats reads (`docs/DOD.md`, `.gitignore`, `agents/`, `skills/`, `examples/`) are the artifacts under test, read by absolute paths — deterministic across cwds.

### Remedy patterns (reused, not invented)

The cwd offenders (A2, A3) route through one shared helper, **`engine/test-helpers/with-cwd.js`** (ADR-158); the `$HOME` offender (A4) uses a separate import-time redirect, **`engine/test-helpers/empty-home.js`** (ADR-160). Both sit alongside the existing `capture-io.js` and match its plain-ESM `export function` style.

- **`engine/test-helpers/with-cwd.js`** — **cwd-only**. Exports **`withTempCwd(fn)`** / **`withTempCwd(seed, fn)`** — `mkdtemp` a scratch dir (optionally populated by a `seed(dir)` callback), `process.chdir` into it, run `fn` (sync **or** async), then restore the prior cwd and `rmSync` the scratch in `finally` (restore **even on throw**). (ADR-158 originally also specified `withTempHome`/`enterTempHome`; ADR-160 removed both as unused — `$HOME` isolation moved to `empty-home.js`.)
- **`engine/test-helpers/empty-home.js`** — `$HOME` isolation by an **import-time side effect**, not a per-call wrap. On import it `mkdtemp`s an empty home and points `process.env.HOME` **and** `process.env.USERPROFILE` (Windows parity) at it, exporting **`restoreEmptyHome()`** which restores both env vars and `rmSync`s the dir. A test imports it **first** (before any module that captures `homedir()` at evaluation) and calls `restoreEmptyHome()` from an `after()`.

The underlying patterns:

1. **explicit-path** — pass an absolute path where the bin accepts a path arg (no cwd mutation). Preferred in general; **not applicable to A2/A3** because both test the *no-arg default-resolution branch*, which has no path-arg seam.
2. **mkdtemp+chdir+finally** (via `withTempCwd`) — for default-path tests with no seam: an empty (A2) or seeded (A3) scratch cwd, restored in `finally`. Mirrors the landed reference.
3. **seed-in-temp** (via `withTempCwd(seed, …)`) — write the "present" state into a throwaway cwd so the test controls it (A3 contracts).
4. **import-order `$HOME` redirect** (via `empty-home.js`) — redirect `$HOME`/`USERPROFILE` to an empty dir **at import time**, before the module under test captures `homedir()`, restored in an `after()`. This is **not** a per-call seed; it is a module-load side effect (A4 `$HOME`).

### Durable guard (two parts, ADR-156)

The invariant is defended by **two** complementary guards, both run by `scripts/ci.sh` (hence by `.github/workflows/ci.yml`):

**(1) `test/hermetic-suite.bats`** — the fast, named, intent-revealing tripwire (under the existing `bats test/`; no bats count gate). From repo root — where the ambient `.claude/workflow.md` and `contracts/` are present — it runs the representative default-resolution engine files and asserts exit 0:

```bash
ROOT="$(cd "${BATS_TEST_DIRNAME}/.." && pwd)"
@test "default-resolution engine tests pass from repo-root cwd (ambient .claude/workflow.md present)" {
  run bash -c "cd '${ROOT}' && node --test engine/test/manifest-lint-main.test.js engine/test/contracts-lint-main.test.js"
  [ "$status" -eq 0 ]
}
```

A second case runs a representative file under a deliberately hostile seeded ambient (a temp `$HOME` carrying a `craft-policy.md`, and/or a temp cwd carrying an invalid `.claude/workflow.md`) and still asserts exit 0 — proving the suite is impervious, not merely lucky.

**(2) a second repo-root step in `scripts/ci.sh`** — the comprehensive net. In **addition** to the existing `cd engine && node --test 'test/**/*.test.js'` run, `ci.sh` runs the **whole** engine suite from the repo root:

```bash
node --test 'engine/test/**/*.test.js'
```

so any future cwd-coupled test, in **any** file, fails CI from repo-root cwd — not only the files the bats smoke names.

**`EXPECTED_TESTS` ↔ the two runs (pinned).** Both runs execute the identical `engine/test/**` files, so both emit the same `# tests <n>` summary line (pinned today: `# tests 1098`, exit 0, identical from `engine/` and from repo root). The new repo-root step reuses the **single** `EXPECTED_TESTS` constant and the **same** `awk '/^# tests / {print $3}'` extraction-and-assert idiom as the existing engine run — there is no second constant. The count gate therefore applies to **both** runs: asserting it on the repo-root run additionally proves the repo-root glob `engine/test/**/*.test.js` discovers all the tests (an under-matching glob would otherwise pass as a silent green). `EXPECTED_TESTS` is bumped **once**, by the new `with-cwd.js` helper unit-test count, and both runs assert that one bumped value.

A future A1-class regression (a no-arg test asserting the absent branch without controlling cwd) goes **red from repo root** in both guards while still green from `engine/` — exactly the divergence they assert against.

### CI-gate impact

- `EXPECTED_TESTS` — **bumped once**, by exactly the new helper-area unit tests: 3 in `with-cwd.js` (cwd restore-after-success + restore-on-throw + seed-population) and 2 in `empty-home.js` (redirect-active + restore), **+5 net → 1103**. The A2/A3 body rewrites and the A4 `empty-home.js` import + `after()` add/remove **no** `test()` entry, so they contribute 0 to the bump. Both `ci.sh` engine runs (the `cd engine` run and the new repo-root run) assert the same bumped constant (**1103**).
- `scripts/ci.sh` now runs the engine suite **twice** (from `engine/` and from repo root); the full-engine runtime roughly doubles per CI — accepted (ADR-156) for the cwd-invariance guarantee.
- `bats test/` — no count assertion → the new `test/hermetic-suite.bats` guard file is free.
- `source-hygiene` — does not scan `engine/test/` or `test/`; touched test code keeps no provenance refs / suppression directives regardless.
- `.github/workflows/ci.yml` runs `bash scripts/ci.sh`, so both the bats guard and the repo-root step run in CI automatically.

## Decision candidates

All four forks are **settled** by ADRs 156–159 and are recorded here for traceability only — not re-opened. Where the ratified choice deviates from the prior designer recommendation, the Resolution column says so.

| # | Choice | Alternatives (≤3) | Recommendation (prior) | Resolution (settled) |
|---|---|---|---|---|
| 1 | Durable guard mechanism | (a) `test/hermetic-suite.bats` repo-root smoke over representative files; (b) a second `node --test 'engine/test/**/*.test.js'` step appended to `scripts/ci.sh` (whole suite from repo root); (c) both | (a) | **RESOLVED — ADR-156: (c) both** (deviates from (a)). The bats smoke is the cheap, named tripwire **and** a whole-suite repo-root step in `ci.sh` is the comprehensive net for files the smoke does not name. |
| 2 | Remedy for the two default-branch offenders (A2, A3) | (a) mkdtemp+chdir+finally; (b) explicit-path injection | (a) | **RESOLVED — ADR-157: (a) mkdtemp+chdir+finally** (as recommended), now expressed via the shared `withTempCwd`. Explicit-path stays the default for any future seam'd offender (this audit found none). |
| 3 | Factor the mkdtemp/HOME dance | (a) inline per test (mirror the landed reference); (b) shared `engine/test-helpers/with-cwd.js` (`withTempCwd`, `withTempHome`) | (a) | **RESOLVED — ADR-158: (b) shared helper** (deviates from (a)). The cwd-remedied sites call `withTempCwd`; the helper carries its own focused unit test. **Refined by ADR-160** — A4 fixed test-only via import-order `empty-home.js`; `with-cwd.js` scoped to cwd-only (`withTempHome`/`enterTempHome` removed). |
| 4 | Scope of the `$HOME` finding (A4) | (a) include now (file-scoped HOME-redirect in `pipeline-resolve-main.test.js`); (b) defer to a dedicated follow-up; (c) leave out of scope permanently | (a) | **RESOLVED — ADR-159: (a) include now** (as recommended; ratified scope expansion) — a committed deliverable, not gated. **Refined by ADR-160** — A4 fixed test-only via import-order `empty-home.js` (no production change); `with-cwd.js` scoped to cwd-only (`withTempHome`/`enterTempHome` removed). |

## Test strategy

- **Surface added:** two test helpers — `engine/test-helpers/with-cwd.js` (cwd) and `engine/test-helpers/empty-home.js` (`$HOME`) — each with its own focused unit test; otherwise test-only edits to A2/A3/A4 and the two-part durable guard. The proof is the cross-cwd acceptance run and the guards.
- **Helper-area unit tests** — two files, five tests, the whole `EXPECTED_TESTS` bump (+5 → 1103):
  - `with-cwd.test.js` (ADR-158) exercises `withTempCwd` for (i) **restore-after-success** — the prior cwd is restored and the scratch is `rmSync`ed after `fn` returns; (ii) **restore-on-throw** — when the wrapped `fn` throws, the helper still restores the cwd and removes the scratch, and the throw propagates; (iii) **seed-population** — `withTempCwd(seed, fn)` runs the seed callback in the scratch cwd and `fn` reads back the seeded file (the two-arg overload).
  - `empty-home.test.js` (ADR-160) verifies the import-time redirect: (i) **redirect-active** — after import, `process.env.HOME` and `USERPROFILE` point at the created empty scratch home, which exists; (ii) **restore** — `restoreEmptyHome()` moves `$HOME` away from the scratch and removes the dir.
- **Per-offender, assert the mutant still dies** (no weakened assertions):
  - A2 — the `DEFAULT_MANIFEST` string-literal mutant at `engine/src/manifest-lint-main.js`: with the empty `withTempCwd` scratch, the absent-branch message must still name `.claude/workflow.md`.
  - A3 — the `?? 'contracts'` nullish-default mutant at `engine/src/contracts-lint-main.js`: with the seeded full contracts dir as cwd, `main([])` must still return `0` + `bundles OK`.
  - A4 — the policy.js no-coverage mutants the :1175 test targets: with `$HOME` redirected to an empty dir by `empty-home.js` (imported first), the real `defaultReadUserPolicy` must still run and yield `{ok:true, policy:{}}`.
- **Acceptance matrix** (run by the implementer; Stryker itself is the validation phase's job, not run here). Each run expects the bumped `EXPECTED_TESTS` (= 1098 + 5 helper-area tests = **1103**):
  1. `cd engine && node --test 'test/**/*.test.js'` → green at the pinned count.
  2. repo-root `node --test 'engine/test/**/*.test.js'` → green at the **same** pinned count (now also a permanent `ci.sh` step, ADR-156).
  3. arbitrary cwd `cd /tmp && node --test '<abs>/engine/test/**/*.test.js'` → green at the same count.
  4. `bats test/` from repo root and from `/tmp` → identical green (includes `test/hermetic-suite.bats`).
- **Hostile-ambient regression probes (in mktemp throwaways)** proving the remedies bite:
  - re-run the seeded-`$HOME` experiment (a `craft-policy.md` with a bogus verdict) → expect **0** fail after A4 (was 45).
  - seed an invalid `.claude/workflow.md` in a temp cwd and run A2 → expect green, because A2 now uses its own empty `withTempCwd` scratch and never reads the ambient file.
- **Guard self-check**: temporarily introduce a throwaway A1-class test (no-arg, asserts the absent branch, no scratch) and confirm **both** guards go red from repo root — `test/hermetic-suite.bats` and the new `ci.sh` repo-root step; then remove it.

## Out of scope

- **No change to production bin behaviour.** cwd-relative default resolution — `manifest-lint`'s `?? DEFAULT_MANIFEST`, `contracts-lint`'s `?? 'contracts'`, `init-config`'s `process.cwd()`-as-repoRoot, and `pipeline-resolve`'s `defaultReadUserPolicy` reading `~/.claude` — is a real consumer feature; only the tests become hermetic.
- **A4 took no production change.** `engine/src/pipeline-resolve-main.js` is **untouched** — it still captures `homedir()` in module-level constants. The lazy-homedir refactor (compute the policy path on each call so a `before()`/`after()` could redirect `$HOME`) was **rejected** as out of bounds for the brief's "only make TESTS hermetic" non-goal (ADR-160); A4 is fixed test-only via the import-order `empty-home.js` redirect.
- **Frozen history untouched** — ADRs, dated `DESIGN-*`/`PLAN-*` docs, `BACKLOG.md`, the `SC5` record.
- **The reference fix (`manifest-lint-main.test.js:39`) is not re-touched** — it stays inline and already hermetic; only the new sites adopt the shared helper.
- **`EXPECTED_TESTS` changes by exactly one delta** — the new helper-area unit tests (`with-cwd.js` + `empty-home.js`, +5 → 1103); the A2/A3/A4 remedy edits stay count-neutral. **No new bats count gate** is added.
- **No re-architecture of the io/dependency-injection seams** — remedies reuse the existing `makeCaptureIo` and `{ readUserPolicy }`/`{ fileExists }` seams; the new `with-cwd.js` is additive test tooling, not a seam change.
- **The `adapters/pi` suite is not audited here** — the brief scopes to `engine/test/**` and `test/**`; pi hermeticity, if needed, is a separate change.
