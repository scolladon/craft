# Design — ci-lint-chain-fail-closed

> Brief: every lint in the `scripts/ci.sh` lint block (L80–86) must fail `ci.sh` when it
> fails; today seven of the ten lint invocations are fail-open because they sit in a non-final
> position of one `a && b && …` list. RED-first: a test proves a failing lint fails the block.
> Status: draft → self-reviewed ×3 → accepted

## Context

`scripts/ci.sh` is the substrate gate CI (`.github/workflows/ci.yml`, `ubuntu-latest`,
`run: bash scripts/ci.sh`) and the local gate both run. It declares `set -euo pipefail`
(L5), then runs, in order: nine `run_suite` calls (L47–60), `run_intention_lint` (L78),
the **lint block** (L80–86), and the hygiene block (`run_stub_lint`, `run_prose_lint`,
`run_adr_lint`, L171–173). Every other step is a bare statement; the lint block alone is one
AND-list:

```bash
shellcheck scripts/*.sh hooks/*.sh && node engine/bin/pipeline-lint.js pipeline/default.yml && node engine/bin/pipeline-resolve.js pipeline/default.yml && node engine/bin/contracts-lint.js contracts \
  && for b in BACKLOG.md templates/backlog.md; do bash scripts/backlog-lint.sh "$b" || exit 1; done \
  && for d in templates/design.md docs/contributing/design/*.md; do bash scripts/design-lint.sh "$d" || exit 1; done \
  && bash scripts/docs-structure-lint.sh docs/contributing \
  && bash scripts/docs-structure-lint.sh docs/guides \
  && bash scripts/docs-structure-lint.sh --audience docs \
  && bash scripts/sync-adapter-agents.sh --check
```

`errexit` ignores a failure in any command of an AND-list except the last, so a red lint in a
non-final position short-circuits the rest of the list and the script carries on to the
hygiene block and exits 0. The two `for` loops are fail-closed only by accident: their inner
`|| exit 1` is an unconditional `exit`, not errexit. `adr-lint` already lived in this list
(ADR-355, "joins the existing `&&` chain") before it moved out to `run_adr_lint`, so the hole
has been open across several changes.

Things that already read this block and constrain the change:

| Coupling | Location | What it pins |
|---|---|---|
| ordering test | `test/hygiene-gates-ci.test.js` L90–103, `content.indexOf('shellcheck scripts')` | `run_intention_lint` < lint block < `run_stub_lint` in `ci.sh` text |
| wiring test | `test/sync-adapter-agents.test.js` L409–418 | `ci.sh` text contains `bash scripts/sync-adapter-agents.sh --check` |
| eval-isolation guard | `test/plugin-evals-local-only.test.js` L14 `EVALS_PATH_PATTERN = /\bevals\//`, L210 | no script, no test file, not `ci.sh` may name an eval path or the eval CLI (ADR-393) |
| registration meta-test | `test/every-test-file-registers.test.js` | each `test/*.test.js` registers ≥ 1 test; `run_suite process test` (L60) enumerates them, so no `ci.sh` edit is needed to register a new file |
| shellcheck | the block's own first command | any new `scripts/*.sh` must lint clean |
| DOD | `docs/contributing/DOD.md` L60 | lists the lints `ci.sh` must run green; unchanged by this design |

House precedent for a single-sourced script that both `ci.sh` and a test run:
`scripts/living-corpus.sh` (consumed by `run_intention_lint` and
`test/intention-lint-ci.test.js` `enumerateCorpus()`). House precedent for carving a `ci.sh`
function out of its text: `functionBody()` in `test/hygiene-gates-ci.test.js` L28–35.
`test/helpers/tmp-git-repo.js` `createTmpGitRepo()` builds a mkdtemp + realpath throwaway,
but it is a git repo with empty files; no lint in this block needs git, so the test below
builds its own non-git throwaway with the same mkdtemp + `realpathSync` discipline.

## Requirements

- **R1** A non-zero exit from any of the ten lint commands (shellcheck, pipeline-lint,
  pipeline-resolve, contracts-lint, the backlog-lint loop, the design-lint loop,
  docs-structure-lint ×3, sync-adapter-agents `--check`; a loop fails on any one file) makes `bash scripts/ci.sh` exit
  non-zero, and no later lint in the block runs.
- **R2** With every lint green the block runs all ten commands (every loop file included) and `ci.sh` proceeds to the
  hygiene block (no lint dropped by the restructure).
- **R3** A test reproduces the defect RED before the fix: with the current AND-list it fails
  for at least the seven fail-open positions pinned below.
- **R4** That test runs every lint it executes inside a `mkdtemp` throwaway, never the
  worktree; it names no eval path and no eval CLI; its titles are Given/When/Then with an AAA
  body and a `sut` variable.
- **R5** Existing coupled tests stay green (retargeted where the text they read moves).
- **R6** Any new shell script passes `shellcheck`.

## Design

### Pinned behaviour (bash 3.2.57, macOS `/bin/bash`; probes in a mktemp throwaway)

Errexit primitives, each run as `bash -c 'set -euo pipefail; <probe>'`:

| Probe | exit | stdout |
|---|---|---|
| `false && true; echo continued` | 0 | `continued` |
| `true && false; echo continued` | 1 | — |
| `true && false && true; echo continued` | 0 | `continued` |
| `true && for x in a; do (exit 2) \|\| exit 1; done && true; echo continued` | 1 | — |
| `(exit 2); echo continued` | 2 | — |
| `for x in a b; do (exit 3); echo body-$x; done; echo continued` | 3 | — |
| `f(){ (exit 2); echo inner; }; f; echo continued` | 2 | — |
| `f(){ (exit 2); echo inner; }; f \|\| exit 9; echo continued` | 0 | `inner continued` |
| `bash -c "exit 2"; echo continued` | 2 | — |
| parent `set -euo pipefail; bash child.sh; echo parent-continued`, child has no `set -e` and runs `false; echo child-continued` | 0 | `child-continued parent-continued` |

Current block, L80–86 copied verbatim under `set -euo pipefail` into a throwaway where every
lint is a stub that exits 2 when it is the selected one (`shellcheck` stubbed on `PATH`, the
three `engine/bin/*.js` and four `scripts/*.sh` stubbed in place); `ran-to-end` = a trailing
`echo BLOCK-END` printed:

| Failing lint | stub fired | ran-to-end | exit | verdict |
|---|---|---|---|---|
| none (control) | no | yes | 0 | green |
| shellcheck | yes | yes | 0 | **fail-open** |
| pipeline-lint | yes | yes | 0 | **fail-open** |
| pipeline-resolve | yes | yes | 0 | **fail-open** |
| contracts-lint | yes | yes | 0 | **fail-open** |
| backlog-lint `BACKLOG.md` | yes | no | 1 | fail-closed (inner `exit 1`) |
| design-lint (a design doc) | yes | no | 1 | fail-closed (inner `exit 1`) |
| docs-structure-lint `docs/contributing` | yes | yes | 0 | **fail-open** |
| docs-structure-lint `docs/guides` | yes | yes | 0 | **fail-open** |
| docs-structure-lint `--audience docs` | yes | yes | 0 | **fail-open** |
| sync-adapter-agents `--check` | yes | no | 2 | fail-closed (last in list) |

Both fix forms, same harness: one-command-per-line → every failing row fail-closed, exit 2
(the lint's own status), ran-to-end no; `|| exit 1` on each → every failing row
fail-closed, exit 1 (status normalised). Control row green in both.

Not pinned: bash 5.x. No bash 5 binary on this machine and the Docker daemon is not running.
CI runs `ubuntu-latest` bash; the behavioural test below runs there and is the 5.x pin — a
divergence goes red in CI, not silently green.

Two consequences of the pins drive the design:

1. A lint list is fail-closed only if every lint is its own statement (or carries an
   explicit `exit`). Splitting into statements alone is enough under errexit.
2. Errexit does not cross a `bash script.sh` boundary, and is disabled inside a function
   called from an `||`/`&&` context. So whichever unit holds the lints must declare
   `set -euo pipefail` itself (script) or be called as a bare statement (function), and the
   `ci.sh` call site must be a bare statement.

### Shape (under the recommended candidates 1a + 2a)

New `scripts/static-lints.sh` holds the block, one invocation per line, same order,
self-rooted exactly like `ci.sh` L8 so a copy placed in any `<root>/scripts/` lints `<root>`:

```bash
#!/usr/bin/env bash
# Static lints run by scripts/ci.sh. One command per line: errexit ignores a failure in
# every command of an && list except the last, which is how a red lint once exited 0.
set -euo pipefail
cd "$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

shellcheck scripts/*.sh hooks/*.sh
node engine/bin/pipeline-lint.js pipeline/default.yml
node engine/bin/pipeline-resolve.js pipeline/default.yml
node engine/bin/contracts-lint.js contracts
for b in BACKLOG.md templates/backlog.md; do bash scripts/backlog-lint.sh "$b"; done
for d in templates/design.md docs/contributing/design/*.md; do bash scripts/design-lint.sh "$d"; done
bash scripts/docs-structure-lint.sh docs/contributing
bash scripts/docs-structure-lint.sh docs/guides
bash scripts/docs-structure-lint.sh --audience docs
bash scripts/sync-adapter-agents.sh --check
```

The inner `|| exit 1` of both loops is dropped: errexit stops the loop at the first failing
file with that lint's status (pinned row `for … (exit 3) …` → exit 3). The name
`static-lints.sh` is cosmetic.

`scripts/ci.sh` L80–86 becomes the single bare line `bash scripts/static-lints.sh` (pinned:
a bare `bash x` exiting 2 stops the parent with 2). Position unchanged: after
`run_intention_lint`, before the hygiene block.

Collateral edits (R5):

- `test/hygiene-gates-ci.test.js` L94: `indexOf('shellcheck scripts')` →
  `indexOf('bash scripts/static-lints.sh')`; message strings say "static-lints call".
- `test/sync-adapter-agents.test.js` L409–418: read `scripts/static-lints.sh` instead of
  `scripts/ci.sh`; title "Given scripts/static-lints.sh, when its content is read, then it
  wires --check into the static lints".

Under candidate 1b instead, the block becomes a `run_static_lints()` function inside
`ci.sh` with the same body (minus `set`/`cd`), called as the bare line `run_static_lints`;
both collateral tests keep passing unchanged because the text stays in `ci.sh`. Under 2b,
each line keeps `|| exit 1` and exit statuses normalise to 1.

### Edge behaviour

- An empty `docs/contributing/design/` glob passes the literal pattern to design-lint,
  which exits 2 (`no such file`) → fail-closed. Same as today; not changed.
- Fail-fast is preserved: the first red lint stops the block, as the AND-list intended.
- A future editor re-joining two lines with `&&` re-opens the hole for the left command;
  the per-position behavioural test catches it (that position's case goes red).
- A future `bash scripts/static-lints.sh || true` (or `&&`-joined call) in `ci.sh` is
  caught by the wiring assertion (bare-line regex), not by the behavioural test.

## Decision candidates

| # | Choice | Alternatives (≤3) | Recommendation | Why |
|---|---|---|---|---|
| 1 | How the test isolates the lint block from the rest of `ci.sh` | (a) extract the block to `scripts/static-lints.sh`; the test copies the real script into a mktemp throwaway with stubbed lints and runs it; `ci.sh` calls it as a bare line. (b) keep it in `ci.sh` as a `run_static_lints()` function; the test carves the function text out of `ci.sh` (like `functionBody()`), runs it under `set -euo pipefail` in the same stubbed throwaway. (c) text-only structural assertion: no lint line in the block is joined by `&&` or a `\` continuation. | (a) | The test executes the shipped file byte for byte, not a regex carve; its own `set -euo pipefail` makes it fail-closed whoever calls it (pinned: errexit does not cross a `bash` boundary). Precedent: `scripts/living-corpus.sh`. Cost: two coupled tests are retargeted. (b) leaves those tests untouched but tests a text slice whose boundaries a crude carve can misread. (c) is cheapest but proves no behaviour: `shellcheck … \|\| true` on its own line passes it. |
| 2 | Fix form inside the block | (a) one command per line, errexit enforces; loops drop their inner `\|\| exit 1`. (b) `\|\| exit 1` appended to every command. | (a) | Pinned: (a) propagates the lint's own exit status (2), (b) normalises it to 1. (a) matches every other step in `ci.sh` (bare statements) and the script's declared `set -euo pipefail` contract. (b) is redundant under errexit and invites the next edit to omit it on one line silently. |
| 3 | Granularity of the RED test | (a) one case per lint position (10 failing-position cases + 1 green control asserting all 10 invocations ran). (b) one representative failing lint (e.g. docs-structure-lint `--audience docs`) + the green control. | (a) | The defect is position-dependent (pinned: 7 open, 3 closed). (b) can go green while other positions stay open; a later `&&` re-join at any position would only be caught by (a). Cost: 11 subprocess runs over stubs, each a few ms. |

## Test strategy

New file `test/static-lints-ci.test.js` (process suite; auto-enumerated by
`run_suite process test`, so no `ci.sh` edit to register it). Pattern sources:
`test/hygiene-gates-ci.test.js` (Given/When/Then over `ci.sh`), `test/readme-drift.test.js`
L47–49 (`copyFileSync` real artifact into a throwaway), `test/craft-root-shim.test.js` L95
(explicit `env` with `PATH`).

Fixture builder (local to the file, named constants, no `evals/` substring anywhere — note
`\bevals\/` also matches after `-` or `_`, so the mkdtemp prefix is `static-lints-`):

```js
const STUB_FAIL_STATUS = 3; // distinct from 1 and 2: proves the lint's own status propagates
const LINT_IDS = [
  'shellcheck',
  'pipeline-lint pipeline/default.yml',
  'pipeline-resolve pipeline/default.yml',
  'contracts-lint contracts',
  'backlog-lint BACKLOG.md',
  'design-lint templates/design.md',
  'docs-structure-lint docs/contributing',
  'docs-structure-lint docs/guides',
  'docs-structure-lint --audience docs',
  'sync-adapter-agents --check',
];
```

`buildThrowaway()`: `mkdtempSync(os.tmpdir()/static-lints-)` → `realpathSync`; copy the real
`scripts/static-lints.sh` to `<tmp>/scripts/`; write stubs that append their id to
`$LINT_LOG` and exit `STUB_FAIL_STATUS` when their id equals `$FAIL_LINT`:
`<tmp>/bin/shellcheck` (id `shellcheck`, args ignored — the glob expands to stub names),
`<tmp>/scripts/{backlog-lint,design-lint,docs-structure-lint,sync-adapter-agents}.sh`
(id = `<name> <args>`), `<tmp>/engine/bin/{pipeline-lint,pipeline-resolve,contracts-lint}.js`
(id = `<name> <args>`); create inputs `BACKLOG.md`, `templates/backlog.md`,
`templates/design.md`, `docs/contributing/design/a.md`, `hooks/h.sh`. Run via
`spawnSync('bash', [<tmp>/scripts/static-lints.sh], { cwd: tmp, env: { ...process.env,
PATH: <tmp>/bin:$PATH, FAIL_LINT, LINT_LOG } })`; `rmSync` the throwaway after each case.

Cases (titles Given/When/Then, AAA, `sut` = the spawned result):

| # | Given / When | Then |
|---|---|---|
| 1 | every stubbed lint green / static-lints runs | exit 0, `LINT_LOG` equals the twelve invocations in block order (`LINT_IDS` with `backlog-lint templates/backlog.md` after `backlog-lint BACKLOG.md` and `design-lint docs/contributing/design/a.md` after `design-lint templates/design.md`) |
| 2–11 | the lint `<id>` fails / static-lints runs (one case per `LINT_IDS` entry, in order, generated by a loop; a loop's first file stands for its command) | exit `STUB_FAIL_STATUS` (under 2b: non-zero), `LINT_LOG` ends with `<id>` (no later invocation ran) |
| 12 | `scripts/ci.sh` text | matches `/^bash scripts\/static-lints\.sh$/m` (bare statement, no `\|\|`/`&&`), between `run_intention_lint` and `run_stub_lint` (the retargeted ordering test covers the order) |

RED evidence (R3): land the extraction first as a verbatim move of the current AND-list
(including `set -euo pipefail` + `cd`), run the new file, and record the result: per the
pinned matrix cases 2–5 (shellcheck, pipeline-lint, pipeline-resolve, contracts-lint) and
8–10 (docs-structure-lint ×3) — seven positions — fail with exit 0 and a log that runs past
`<id>`; under candidate 2a's exact-status assertion cases 6–7 (the loops) also fail
(exit 1 ≠ 3) — nine red, only case 11 (sync-adapter-agents) green. Then apply the one-per-line fix → all green.
Never commit the red state; the gate is `bash scripts/ci.sh`.

Collateral verification: the two retargeted tests (L90–103, L409–418) green; `shellcheck`
over the new script runs inside the real block itself; `test/plugin-evals-local-only.test.js`
green (scans the new script and the new test).

No property-test lens: no parser, matcher or round-trip pair is touched.

## Out of scope

- Collecting every lint failure before exiting (aggregate report) — the AND-list was
  fail-fast and every other `ci.sh` step is fail-fast; changing that is a behaviour change
  nobody asked for.
- Auditing other `ci.sh` / `scripts/*.sh` lists for the same errexit hole (e.g. the hygiene
  block's `|| true` / `|| echo advisory` are deliberate fail-open and documented as such).
- Moving `run_intention_lint` or the hygiene block into the new script — they are already
  bare statements and fail-closed.
- `DOD.md` L60 wording — the set of lints `ci.sh` runs is unchanged.
- Pinning bash 5.x locally — CI's `ubuntu-latest` run of the behavioural test is the pin.
