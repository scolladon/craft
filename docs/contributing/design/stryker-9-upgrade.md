# Design — stryker-9-upgrade

> Brief: Stryker is pinned to 8.7.1 for a Node floor the engine no longer declares. ADR-047 DC-2a chose
> `@stryker-mutator/core@8.7.1` because 9.x requires Node `>=20` and the engine declared `>=18`. The engine
> now declares `^22.18.0 || >=24.2.0` (ADR-564). Move off 8.7.1 with its own ADR against ADR-047 and a full
> mutation run that compares scores and timings with 8.7.1.
> Status: draft → self-reviewed ×3

## Context

**The pin today.**

- `engine/package.json` L16-19: `devDependencies` `@stryker-mutator/core: "8.7.1"` and
  `@stryker-mutator/tap-runner: "8.7.1"`, both exact. The one runtime dependency is a caret
  (`js-yaml: "^4.1.0"`). L11: `"mutation": "cd .. && stryker run engine/stryker.conf.json"`.
- `engine/package-lock.json`: lockfileVersion 3, 210 packages. npm regenerates it; nobody hand-edits it.
- `engine/stryker.conf.json`: `testRunner: tap`, `coverageAnalysis: perTest`, `tap.testFiles`
  (`engine/test/**/*.test.js` + 14 adapter test files), `mutate` (`engine/src/**/*.js` + 14 adapter src
  files, 97 files in total), `concurrency: 2`, `tempDirName: engine/.stryker-tmp`,
  `reporters: [clear-text, progress]`. It has no `tap.nodeArgs` and no `$schema` key.
- `.claude/workflow.md` L11-13: the `mutation` validation technique. Its probe is
  `npx --no-install --prefix engine stryker --version` and its run is `npm --prefix engine run mutation`.
- `.github/workflows/ci.yml` L25: `cd engine && npm ci` on `node-version: '22'`, so CI installs the
  Stryker devDependencies but never runs them (DC-2c). L44 is `npm ci --omit=dev`.
- `.gitignore` ignores `/reports/` and `/engine/.stryker-tmp/`.

**The decision being moved.** `docs/contributing/adr/047-p9-hardening-mechanical-decisions.md` consolidates
eleven decisions. Only two are in scope:

- L31 **DC-2a**: core@8.7.1, "Node `>=18`-safe; 9.x would force `>=20`".
- L32 **DC-2b**: tap-runner@8.7.1, "native `node --test`/TAP integration".

DC-2c (L33, the mutation run is on demand and never in `ci.sh`) and the other eight decisions stay.
ADR-564 L39 records that ADR-047's reason no longer holds and leaves the move out of scope.

**Supersession machinery** (`skills/decisions/SKILL.md` L54-63, `engine/src/adr-lint-main.js` L7-17):

- C1: the superseded ADR carries `- **Status:** superseded by ADR-<M>`.
- C2: the new ADR carries the line-anchored `Superseded from ADR-047` and `Carried forward from ADR-047`.
- C3: `git grep ADR-047` over the tracked tree. Every hit outside the exempt set is a finding unless a
  `DECISION-CITE-WAIVE` line covers it. Pinned on this tree, the exempt set is `docs/contributing/adr`,
  `design`, `plan`, `archive` and `prd`.
- Precedent for a partial supersession of a multi-decision ADR: ADR-348 supersedes ADR-050 with
  `scope: "dependency-cruiser as the gate, the exception home, and the report producer"`. ADR-050's
  Status flipped, and its blockquote note says which decisions stand.

**Live mentions of the pin or its rationale** (`git grep`, lockfile excluded):

| Place | Text | Tier |
|---|---|---|
| `engine/package.json` L17-18 | `"8.7.1"` ×2 | code |
| `BACKLOG.md` L202-208 | the open item; L204 and L207 cite `ADR-047` | live, swept by C3 |
| `docs/contributing/adr/047-…md` L31-32 | DC-2a/2b | exempt, edited only by the supersession |
| `docs/contributing/adr/564-…md` L39 | "ADR-047's reason for pinning Stryker 8.7.1 … no longer holds" | exempt, dated |
| `docs/contributing/design/entry-guard-symlink-swap-race.md` L285, L369, L401; `…/plan/entry-guard-symlink-swap-race.md` L144; `…/design/pin-claim-status-set-to-contract.md` L55 | dated records that name 8.7.1 | exempt, unchanged |
| `docs/contributing/archive/PLAN-P9-hardening.md` L234 | "9.x would force >=20, rejected by ADR-047" | exempt, unchanged |

`README.md`, `CONTRIBUTING.md`, `docs/guides/`, `docs/contributing/specs/`, `docs/contributing/DOD.md` and
`skills/` do not mention Stryker (`git grep -i stryker`: 0 hits).

## Requirements

- R1: `engine/package.json` pins `@stryker-mutator/core` and `@stryker-mutator/tap-runner` to the target
  version chosen in candidate 1, in the form chosen in candidate 3. npm regenerates
  `engine/package-lock.json`. `cd engine && npm ci` exits 0 on Node 22.
- R2: every key in `engine/stryker.conf.json` still validates against the target's option schemas, with
  the same meaning. The file changes only where the schema check below forces it.
- R3: a full `npm --prefix engine run mutation` on the target passes the acceptance comparison against the
  8.7.1 baseline (Test strategy). Mutation stays out of `ci.sh` (DC-2c).
- R4: on the engine's supported 24 line, the runner receives TAP from every test file. This is a defect
  of 8.7.1, pinned below.
- R5: one ADR records the move against ADR-047 DC-2a/2b, in the form chosen in candidate 2.
  `node engine/bin/adr-lint.js docs/contributing/adr` exits 0.
- R6: the BACKLOG item is closed in the house form (title suffixed "— delivered", original entry kept).
  If candidate 2 is supersession, the rewritten text no longer contains the token `ADR-047`, because C3
  would flag it.
- R7: `npm --prefix engine audit` reports fewer advisories from the Stryker tree than today's 15, measured
  on the committed lockfile.
- R8: `bash scripts/ci.sh` is green.

## Design

### Pinned: what changes between 8.7.1, 9.6.1 and 10.0.0

Method: throwaway copies of `engine/package.json` + `engine/package-lock.json` in `mktemp -d`,
`npm install --save-dev --save-exact --ignore-scripts @stryker-mutator/core@<v> @stryker-mutator/tap-runner@<v>`,
on Node 22.22.3 with npm 12.2.0. Changelogs come from `packages/{core,instrumenter,tap-runner}/CHANGELOG.md`
of `stryker-mutator/stryker-js`, fetched with `gh api`. The mutant sets come from each version's own
`Instrumenter.instrument()` run over the 97 `mutate` files, with `excludedMutations: []`. Every mutant is
keyed by file, start/end line:column, mutator and replacement, and the sorted lists are compared.

| | 8.7.1 (today) | 9.6.1 | 10.0.0 |
|---|---|---|---|
| core `engines.node` | `>=18.0.0` | `>=20.0.0` | `>=22.0.0` |
| tap-runner `engines.node` / peer | `>=14.18.0` / `core: ~8.7.0` | `>=14.18.0` / `core: 9.6.1` (exact) | `>=22.0.0` / `core: 10.0.0` (exact) |
| Breaking changes (CHANGELOG) | — | 9.0.0: drop Node 18; vitest-runner ≥ v2 (not used) | 10.0.0: drop Node 20 |
| tap-runner `dist/` vs previous column | — | default `tap.nodeArgs` gains `--test-reporter=tap`; core `testFiles` honoured in dry run; the rest is formatting | byte-identical to 9.6.1 apart from `package.json` |
| core option schema (`api/dist/schema/stryker-core.json`) vs previous | — | added top-level `testFiles` (default `[]`); `concurrency` also accepts `"50%"`; no key removed, no default changed | one description string changed |
| Mutants over our 97 files | 10141 | **10141, byte-identical set** | 10312 = the same 10141 + **171 `CallExpression`** |
| `npm audit` (whole engine tree) | 16: 5 low, 4 moderate, 7 high | 3: `qs` moderate, `typed-rest-client` moderate, `js-yaml` high | same 3 |
| …of which from the Stryker tree | 15 | 2 (`qs` via `typed-rest-client@2.3.1`) | 2 (same) |
| Locked packages | 210 | 175 | 178 |
| Lockfile diff vs today | — | +568 / −933 | +850 / −1145 |

The 171 new mutants in 10.0.0 come from the new `empty-expression-mutator` (instrumenter 10.0.0,
stryker-js #6012). It is enabled by default and replaces a call statement with `;`, for example
`clearTimeout(timer);` or `child.kill();`. Its filter keeps a mutant only when it is alone in scope. All
171 are statement removals, none is a `throw`. The largest counts are `engine/src/manifest.js` (21),
`observability/usage-aggregate.js` (12), and `run-state.js`, `plan-lint-main.js` and
`observability/usage-mine-main.js` (9 each). With `mutator.excludedMutations: ["CallExpression"]`, 10.0.0
still emits 577 `CallExpression` mutants, marked Ignored, because the filter skips mutants that carry an
ignore reason. Excluding the mutator therefore does not restore a clean count.

The js-yaml advisory is the engine's runtime dependency and is out of scope. `npm audit fix` on top of the
9.6.1 install reaches 0 advisories, but it does that by moving `js-yaml` (`4.3.2`) and downgrading
`typed-rest-client` to 2.3.0 (`qs@6.16.0`). That choice is candidate 4.

### Pinned: what the runner receives, per Node

The tap-runner spawns `node <tap.nodeArgs> <testFile>` (`tap-test-runner.js` `runFile`) with a CJS preload
`-r <tap-runner>/dist/src/setup/hook.cjs`. Each version's default `nodeArgs` (8.7.1:
`-r {{hookFile}} {{testFile}}`; 9.6.1/10.0.0: `--test-reporter=tap -r {{hookFile}} {{testFile}}`) was run
against a one-test `node:test` file in a `mktemp -d`, with stdout redirected (non-TTY,
`STRYKER_DRY_RUN=true`). The test spawns a child Node and asserts that the child's stderr is `''`.

| Node | 8.7.1 args | 9.6.1 args | 10.0.0 args |
|---|---|---|---|
| 22.22.3 | TAP (`TAP version 13`, `ok 1`), stderr 0 B | TAP, stderr 0 B | TAP, stderr 0 B |
| 24.11.0 | **spec reporter** (`✔ …`), 0 TAP lines, stderr 0 B | TAP, stderr 0 B | TAP, stderr 0 B |
| 25.1.0 | **spec reporter**, 0 TAP lines, stderr 0 B | TAP, stderr 0 B | TAP, stderr 0 B |

8.7.1's own `TapParser` was fed the spec output of a passing file. It returns
`{ ok: true, count: 0, plan.skipReason: "no tests found" }`. A failing file exits 1 with no TAP `not ok`
line, so it reaches `captureTapResult`'s "Tap process exited with code" throw
(`@stryker-mutator/tap-runner@8.7.1` `dist/src/tap-helper.js` L33-35). So on Node 24.11.0 and 25.1.0,
8.7.1 cannot score a run with today's config (R4). How Stryker classifies those mutants end to end was not
probed. A narrowed 8.7.1 run on 24.11.0 would show it, and the move does not depend on the answer. The
9.0.0 tap-runner changelog entry "provide `--test-reporter=tap` as default nodeArg" is the fix.

**Loader hooks and stderr.**

- No `module.register`, `--import`, `--loader` or `--experimental-loader` appears in the `dist/` of core,
  api, util or tap-runner for any of the three versions. Node 26's DEP0205 (`module.register`) therefore
  cannot fire from Stryker. Node 26 is not installed on this box, so that rests on the grep, not a run.
- The repo's only loader hook is `engine/test-helpers/swap-link-on-load.js` L8/L27, which uses
  `registerHooks` (not DEP0205). It is passed with `--import` by `engine/test/bin-entry-swap-race.bin.test.js`
  L50 and `adapters/codex/test/trust-hook.bin.test.js` L62.
- The runner passes its preload through argv, not `NODE_OPTIONS`, so children spawned by tests do not
  inherit it. They do inherit the `STRYKER_*` env, as on 8.7.1.
- Exact empty-stderr assertions on a spawned child exist only at `adapters/codex/test/trust-hook.bin.test.js`
  L107 and `adapters/pi/test/cli.test.js` L233 (`craft-guard-hook.test.js` L132 asserts non-empty). None of
  these files is in `tap.testFiles`. No file in the Stryker
  corpus asserts that a spawned child's stderr is `''`. The in-process `io.stderr.joined()` assertions use
  fakes, which the runner does not touch.

### Config: no forced change

| Our key | 9.6.1 / 10.0.0 schema | Effect |
|---|---|---|
| `testRunner: "tap"` | plugin name `tap` unchanged | none |
| `coverageAnalysis: "perTest"` | enum unchanged | none |
| `tap.testFiles` | unchanged (`string[]`) | none |
| `tap.nodeArgs` (absent) | default now `["--test-reporter=tap","-r","{{hookFile}}","{{testFile}}"]` | TAP on every Node (R4). Keep it absent: pinning it would freeze a default upstream owns |
| `mutate` | unchanged | none |
| `concurrency: 2` | now `number ≥1` or a percent string | `2` still valid |
| `tempDirName` | unchanged | none |
| `reporters: [clear-text, progress]` | unchanged; `clearTextReporter` defaults identical (`reportMutants: true`) | survivors and NoCoverage are still listed with location, which the comparison needs |
| not set: `incremental`, `ignoreStatic`, `checkers`, `ignorePatterns`, `testRunnerNodeArgs` | defaults unchanged 8.7.1 → 9.6.1 → 10.0.0 | none |

`engine/stryker.conf.json` stays byte-identical (R2). New capabilities, the top-level `testFiles` /
`--testFiles` (9.5.0) and percentage `concurrency` (9.6.0), are not adopted (Out of scope).

### Edits

| Place | Today | Edit |
|---|---|---|
| `engine/package.json` L17-18 | `"8.7.1"` ×2 | target per candidates 1 and 3 |
| `engine/package-lock.json` | 210 packages | `cd engine && npm install --save-dev --save-exact @stryker-mutator/core@<v> @stryker-mutator/tap-runner@<v>`, plus `npm audit fix` only if candidate 4 says so. Never hand-edited |
| `docs/contributing/adr/<M>-….md` | — | the new ADR (candidate 2). If it supersedes: frontmatter `supersedes: [{ adr: "047", scope: "<DC-2a/2b scope>" }]`, the `Superseded from ADR-047: DC-2a, DC-2b version pin` and `Carried forward from ADR-047: DC-1a…DC-9 including DC-2c, and DC-2b's runner choice (tap-runner)` anchors, a `DECISION-REVERSAL(ADR-047): <scope> -> ADR-M` ledger line |
| `docs/contributing/adr/047-….md` | `- **Status:** accepted` | supersession only: `- **Status:** superseded by ADR-<M>` plus a blockquote note naming DC-2a/2b as superseded and the other nine as standing (ADR-050 shape) |
| `BACKLOG.md` L202-208 | open item | close it in the house form ("— delivered" + outcome + original entry). Under supersession, reword the two `ADR-047` tokens (as the swap-race close did for ADR-557) |
| `README.md` corpus counts (L200-201) | 66 design docs, 65 plans, 569 ADRs | the design count moves with this doc's commit; plan and ADR counts in plan Part 1. `scripts/readme-drift.sh` checks them through `engine/test/readme-drift-main.test.js` and `test/readme-drift.test.js` inside `ci.sh`, and in the CI `readme-drift` job (`.github/workflows/ci.yml` L33-46) |
| `CHANGELOG.md` | — | none. `docs/contributing/releasing.md` L21 omits CI plumbing, and the engine package is `private` with this a devDependency |
| `engine/stryker.conf.json`, `.claude/workflow.md`, `.gitignore`, CI workflows | — | none. The probe's `stryker` bin is unchanged (`./bin/stryker.js` in 9.6.1 and 10.0.0) |

### Relationship to existing ADRs

- **ADR-047 DC-2a/2b**: refined or superseded per candidate 2. DC-2c and the other eight decisions are
  untouched.
- **ADR-564 (Node floor `^22.18.0 || >=24.2.0`)**: removes the premise. Both candidate versions' `engines`
  fall inside it (9.6.1 `>=20`, 10.0.0 `>=22`).

## Decision candidates

Already decided, not reopened: the Node floor (ADR-564) and on-demand mutation outside `ci.sh` (ADR-047
DC-2c). The schema check forces no config change.

| # | Choice | Alternatives (≤3) | Recommendation | Why |
|---|---|---|---|---|
| 1 | Target version | (a) 9.6.1; (b) 10.0.0; (c) stay on 8.7.1, set `tap.nodeArgs: ["--test-reporter=tap","-r","{{hookFile}}","{{testFile}}"]` to fix Node 24, and refresh the ADR rationale | (a) | (a) produces a byte-identical mutant set (10141, pinned), so any score or survivor delta in the comparison comes from the runner and core, which keeps the A/B clean and the brief literal. It clears 13 of the 15 Stryker-tree advisories and fixes Node 24 (R4). (b) has the same tap-runner code and the same audit result, but adds 171 `CallExpression` mutants. Their survivors need triage, and possibly new tests, which is new work beyond a tool move, and excluding the mutator leaves 577 Ignored rows. 10.0.0 is the `latest` dist-tag, so (a) postpones one more major, best done as its own item. (c) keeps 15 advisories and a version two majors behind to save one lockfile change |
| 2 | How the ADR relates to ADR-047 | (a) supersede, scoped to DC-2a/2b: flip ADR-047's Status, add a blockquote listing what stands, both anchors, `DECISION-REVERSAL`, reword the BACKLOG tokens; (b) refine: the new ADR says "refines ADR-047 DC-2a/2b", no `supersedes` frontmatter, ADR-047 untouched | (a) | The version and its rationale are replaced, not narrowed, which is the house meaning of supersession. Under (b), ADR-047 L31-32 would still state "8.7.1" as the decision while the code says otherwise, and adr-lint would not catch it. ADR-050 → ADR-348 sets the precedent for superseding part of a multi-decision ADR with a scope string. The C3 cost is small: the two `BACKLOG.md` tokens are the only non-exempt hits (pinned) |
| 3 | Pin form in `devDependencies` | (a) exact `"9.6.1"` (today's idiom for both packages); (b) caret `"^9.6.1"` on both | (a) | Minors can change the mutant set: 9.5.0 ignores signal options and 9.6.0 stops mutating dynamic-import string literals (neither changed ours, pinned). An exact pin ties every recorded score to a known instrumenter. Since 9.x the tap-runner peer is exact (`core: 9.6.1`, was `~8.7.0`), so two carets could only ever move together. The lockfile already pins installs, so (b) only changes what `npm update` does, and a silent instrumenter change is the wrong thing for that to do |
| 4 | Lockfile scope | (a) install the two packages only and accept 2 residual Stryker-tree advisories (`qs` through `typed-rest-client@2.3.1`) plus the `js-yaml` one; (b) also `npm audit fix`: 0 advisories, but it moves the runtime `js-yaml` and downgrades `typed-rest-client` to 2.3.0; (c) (a) plus a targeted `npm update qs` inside the Stryker tree | (a) | (b) changes a production dependency in a tooling change, which belongs in its own reviewed change. (c) was not probed: the `qs` that `typed-rest-client@2.3.1` accepts was not checked, so it may be a no-op. R7 holds under (a), 15 → 2 |

## Test strategy

**Gate.** `bash scripts/ci.sh` green (R8). It includes `design-lint`, `adr-lint` (R5, R6) and every
`node --test` suite. `cd engine && npm ci` exits 0 on Node 22 against the regenerated lockfile (R1).
`npm --prefix engine audit` is recorded before and after (R7).

**Acceptance: full mutation run, 8.7.1 vs target.** Local, never CI-gated. The orchestrator runs both. The
8.7.1 baseline is already running.

| Condition | Value |
|---|---|
| Node | 22.22.3, both runs. 8.7.1 cannot score on 24.x |
| Config | `engine/stryker.conf.json` unchanged, `concurrency: 2`, same machine, no other heavy load |
| Command | `npm --prefix engine run mutation`, clear-text output kept to a file per run |
| Compared | total mutants; Killed / Survived / Timeout / NoCoverage / RuntimeError / CompileError / Ignored counts; mutation score (total and covered); the per-file set of Survived + NoCoverage mutants, keyed by `file:line:col` + mutator; wall time |

Pass criteria:

- A1: **mutant total.** 8.7.1 = 10141 (instrumenter probe). If the baseline run shows another total, the
  probe's options differ from the run's, and both runs' own totals are used instead. 9.6.1 must equal the
  baseline total. 10.0.0 must equal the baseline + 171.
- A2: **no unexplained new survivor.** Every mutant that is Killed or Timeout in the baseline and is
  Survived or NoCoverage on the target is hand-verified against its full covering test set: apply the
  mutant by hand in a `mktemp -d` copy of the tree (never the worktree), run the covering files with `node --test`, and record killed or not. The tap runner can
  mis-collect a file, so a mutant that the full set kills is a runner artefact and is recorded as such.
  A mutant the full set does not kill is a real regression and a blocker. Each verdict gets one line in
  the handback.
- A3: **score.** No drop that A2 does not explain. Timeout ↔ Killed moves are timing noise: both count
  as detected, so they leave the score unchanged and need no triage.
- A4: **mutants that disappear.** Survivors present in the baseline and absent on the target are listed,
  not gated.
- A5: **wall time.** Both durations recorded and reported, never gated. One sample
  each cannot separate the tool from machine noise.
- A6: **10.0.0 only.** The 171 `CallExpression` mutants are reported apart from the shared set (killed /
  survived per file) and do not count against A2/A3.
- If a dry run dies with "Worker exited unexpectedly", narrow the test corpus per mutated file with an
  override config in a `mktemp -d`, passed as a positional argument. Do not retry.

**R4 proof (Node 24).** On the target, under Node 24.11.0, run a narrowed mutation run: an override config
in a `mktemp -d` with `mutate: ["engine/src/cli-io.js"]` and `tap.testFiles: ["engine/test/cli-io.test.js"]`.
It passes if the killed count equals the same narrowed run on 22.22.3.

**Pins to re-run if the target changes.** Each probe above is recorded by method so the plan can repeat it
for a different version: throwaway install + audit, schema diff, mutant-set diff, runner-output table.

## Out of scope

- Moving to 10.0.0 if candidate 1 lands on 9.6.1. It brings 171 new `CallExpression` mutants to triage,
  so it is its own backlog item.
- The `js-yaml` advisory: it is the engine's runtime dependency.
- Adopting `--testFiles` / top-level `testFiles` (9.5.0) for per-file narrowing, or percentage
  `concurrency` (9.6.0): new capabilities, not needed for the move.
- Gating mutation in CI: ADR-047 DC-2c stands.
- A Node 26 run: not installed here. The DEP0205 question rests on the grep (no `module.register` in any
  Stryker `dist/`).
- How 8.7.1 classifies mutants end to end on Node 24: moot once it is replaced. A narrowed 8.7.1 run on
  24.11.0 would answer it.
- `CHANGELOG.md`: `docs/contributing/releasing.md` L21 omits CI plumbing.
