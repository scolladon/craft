# Plan — ci-lint-chain-fail-closed

> Source: design doc `docs/contributing/design/ci-lint-chain-fail-closed.md` · ADRs 429, 430, 431
> The plan is the implementation script AND the knowledge handoff. Part agents start
> with zero context: whatever a part block omits is paid later as agent rediscovery.
> `plan-lint.sh` enforces the schema below — the plan phase cannot close without it.

## Sizing rules

- Every part costs a full agent lifecycle (spin-up, zero-context rebuild, gate) — it
  must earn it. No standalone test-only parts for FEATURE code: coverage/interop/property
  tests fold into the implementation part whose code they exercise. EXCEPTION:
  test-infra-only and docs-only parts (tooling config, test helpers, fixtures,
  harness/ADV/property suites, docs/prose) with no `src/` delta ARE standalone — they
  have no implementation part to fold into.
- A part that would be a pure test pass over already-landed code merges into its
  neighbour.
- A part should land in ~100 tool calls. More than ~5 RED→GREEN cycles, or more than 6
  files in its `### Context` block, is two parts. What counts is a backticked path:
  backtick the files the part CREATES or EDITS, and write read-only reference paths in
  plain text.

**How this plan applies them.** One part. The extraction, the one-per-line fix, the new
behavioural test and the two retargeted coupled tests are one change: the new test exercises
the new script, and the coupled tests break the moment the block leaves ci.sh. Five files,
two RED→GREEN cycles.

- **Commit mapping (decided here, as the brief asked).** One commit at the end of the part,
  after the gate is green. The RED of cycle 2 is observed against the uncommitted verbatim
  move of cycle 1 and recorded in the part's handback (counts and the `actual:` values),
  never committed. A two-commit split (verbatim move first, fix second) was rejected: the
  verbatim move is not behaviour-preserving (see D-1), so a "refactor" commit would ship a
  changed exit-status contract under a refactor label.
- **README corpus count.** The plan commit bumps README.md l. 180 from "[37 parted plans]" to
  "[38 parted plans]" (checked by test/readme-drift.test.js against the live tree). The part
  adds no design doc, plan or ADR, so it does not touch README.md.
- **Pre-probed.** Before this plan was written, a throwaway `git clone` of this branch (HEAD
  a0a3aef, with the worktree's engine/node_modules symlinked in) took every step below:
  - verbatim move + the test file of this plan: 9 failing, 3 passing — exactly the RED 2
    and GUARD lists below;
  - the same test with the plain copy (no trailing statement, the design's harness): only
    2 failing (the two loop cases, `actual: 1`), see D-1;
  - one-per-line fix: 12/12 green; `shellcheck scripts/static-lints.sh` clean;
    `bash scripts/static-lints.sh` exit 0;
  - the two retargeted tests plus test/plugin-evals-local-only.test.js and
    test/every-test-file-registers.test.js: 54 pass, 0 fail;
  - committed in the clone, `bash scripts/ci.sh` exit 0, last line
    "craft-adr: OK — 431 ADR(s) checked, 4 declaring supersession.";
  - real-lint end-to-end: with pipeline/default.yml replaced by `phases: [` in the clone,
    the fixed `bash scripts/static-lints.sh` exited 2, while the old L80–86 block run as
    `bash -c "set -euo pipefail; <block>; echo AFTER-BLOCK"` exited 0 and printed
    AFTER-BLOCK.

**Public surface.** None. `scripts/static-lints.sh` is an internal CI script, not a plugin
surface: no skill, agent, adapter, barrel, registry or guide names it. The surfaces that scan
every `scripts/*.sh` pick it up with no edit: the shellcheck glob on the script's own first
line, and test/plugin-evals-local-only.test.js (`ciSurfaces()`). The new test file registers
itself through `run_suite process test` (ci.sh L60) and
test/every-test-file-registers.test.js; no ci.sh edit registers it.

**Binding for the part.**

- No provenance references (ADR numbers, design ids, phase or backlog ids) in the script or
  the test. No suppression directives. No swallowed errors (`result.error` is rethrown).
- The test file must not contain the substring `evals/` anywhere, nor `plugin eval`
  (test/plugin-evals-local-only.test.js patterns `/\bevals\//` and `/\bplugin\s+eval\b/`;
  `\b` also matches after `-` or `_`). The mkdtemp prefix is `static-lints-`.
- Every lint the test runs, runs in a `mktemp` throwaway, never the worktree. Any probe that
  breaks a real lint input runs in a throwaway `git clone`, never the worktree.
- Commit only the five files (`git add <each path>` then `git commit -m "<message>"`); never
  touch the branch, the stash, or other files; never checkout/restore/reset to undo.
- `bash scripts/ci.sh` prints ~32 000 lines: write it to a `mktemp` file, read back with
  `tail`/`grep`.

## Decision candidates

| # | Choice | Alternatives (≤3) | Recommendation | Why |
|---|---|---|---|---|
| D-1 | How the behavioural test reproduces the fail-open positions (refines the design's Test strategy harness; ADR-431's assertions are unchanged) | (a) The harness copies the shipped `scripts/static-lints.sh` into the throwaway and appends one line, `true`, after it; every case then runs with a statement after the lints. (b) The harness copies the script byte for byte, as the design wrote it. (c) Both harnesses, 21 cases. | (a) | Measured on the pre-probe clone: once the AND-list is the LAST statement of its own script, a failure that short-circuits it becomes the script's exit status, so the verbatim move already exits 3 for the 7 positions the design calls fail-open. With (b) the RED is 2/10 (only the two loop cases, `actual: 1`), and R3 ("fails for at least the seven fail-open positions") cannot be met by any committed test. With (a) the RED is 9/10, as the design predicted, because the trailing statement restores the condition ci.sh had (more statements after the list). After the fix, (a) is also the stricter regression guard: a re-join of the LAST two lines (`… --audience docs && bash scripts/sync-adapter-agents.sh --check`) goes red under (a) and stays green under (b). Cost of (a): the throwaway script is the shipped bytes plus one line. (c) doubles the runs for no extra coverage over (a). |

The part below is written for D-1 (a). If (b) is chosen instead: drop `TRAILING_STATEMENT` and
its use in `buildThrowaway()`; RED 2 then lists only cases 6 and 7 (`actual: 1`), and cases
2–5 and 8–10 move to GUARD 2 (the verbatim list ends the file, so its short-circuit status is
the script's exit status).

## Follow-on, not parts

- The documentation phase closes the BACKLOG.md entry "**`ci.sh` lint chain fails open.**"
  (l. 180–187). DOD.md L60 is unchanged (design § Out of scope).
- The comment in test/adr-lint-ci.test.js L30–31 ("adr-lint was moved out of the
  unconditional && chain") is a historic statement that stays true; no edit.

## Part 1 — Extract the static lints to their own script, one statement per line

### Context

Worktree: /Users/scolladon/workspace/perso/craft-ci-lint-chain-fail-closed. Bash on this
machine is 3.2.57 (macOS /bin/bash); CI runs ubuntu-latest bash 5.x through
.github/workflows/ci.yml → `bash scripts/ci.sh`, so the new test is the bash 5 pin there.

Files this part touches (exactly five):

1. `scripts/static-lints.sh` — CREATE, mode 755 (every scripts/*.sh is 755).
2. `scripts/ci.sh` — EDIT L80–86 only.
3. `test/static-lints-ci.test.js` — CREATE.
4. `test/hygiene-gates-ci.test.js` — EDIT L91–103 (one test).
5. `test/sync-adapter-agents.test.js` — EDIT L409–411 (one test's title and read path).

**scripts/ci.sh today.** L5 `set -euo pipefail`; L8 self-root
`cd "$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"`; L60 `run_suite process test`; L78
`run_intention_lint` (bare call); L79 blank; L80–86 the lint block (one `&&` list, bytes in
the design doc § Context and below); L87 blank; L88 `# --- hygiene gates (workstream C): …`;
L171–173 `run_stub_lint` / `run_prose_lint` / `run_adr_lint`. Current L80–86, verbatim:

```bash
shellcheck scripts/*.sh hooks/*.sh && node engine/bin/pipeline-lint.js pipeline/default.yml && node engine/bin/pipeline-resolve.js pipeline/default.yml && node engine/bin/contracts-lint.js contracts \
  && for b in BACKLOG.md templates/backlog.md; do bash scripts/backlog-lint.sh "$b" || exit 1; done \
  && for d in templates/design.md docs/contributing/design/*.md; do bash scripts/design-lint.sh "$d" || exit 1; done \
  && bash scripts/docs-structure-lint.sh docs/contributing \
  && bash scripts/docs-structure-lint.sh docs/guides \
  && bash scripts/docs-structure-lint.sh --audience docs \
  && bash scripts/sync-adapter-agents.sh --check
```

Target: L80–86 become the one line `bash scripts/static-lints.sh` (bare: never `|| …`, never
`&& …`). L79 and the new L81 stay blank, so the file shrinks by 6 lines and the hygiene
block keeps its place after the call.

**Final bytes of the new script** (the design's § Shape; GREEN 2 lands these):

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

The self-root line matters to the test: a copy placed in `<tmp>/scripts/` lints `<tmp>`.
The loops lose their inner `|| exit 1`: errexit stops a loop at the first failing file with
that lint's own status.

**test/hygiene-gates-ci.test.js L91–103, the one test to retarget** (title "Given
scripts/ci.sh, when the hygiene block is located, then it sits after the lint chain and
non-adjacent to run_intention_lint"). It reads `CI_SCRIPT` (L8) and checks
`indexOf('run_intention_lint') < indexOf('shellcheck scripts') < indexOf('run_stub_lint')`
(L93–95, L101), with messages "expected the shellcheck lint chain to be present" (L98) and
"expected run_intention_lint < shellcheck lint chain < run_stub_lint ordering" (L102).
Target: the title ends "then it sits after the static-lints call and non-adjacent to
run_intention_lint"; L94 becomes `const staticLintsIdx = content.indexOf('bash scripts/static-lints.sh');`
with `lintChainIdx` renamed `staticLintsIdx` on L98 and L101; the messages read "expected the
static-lints call to be present" and "expected run_intention_lint < static-lints call <
run_stub_lint ordering". Nothing else in that file changes.

**test/sync-adapter-agents.test.js L409–418, the last test of the file.** Title "Given
scripts/ci.sh, when its content is read, then it wires --check into the lint chain"; L411
`const sut = fs.readFileSync(path.join(ROOT, 'scripts', 'ci.sh'), 'utf8');`; the assertion
(`sut.includes('bash scripts/sync-adapter-agents.sh --check')` is true) stays. Target title:
"Given scripts/static-lints.sh, when its content is read, then it wires --check into the
static lints"; L411 reads `path.join(ROOT, 'scripts', 'static-lints.sh')`.

**The new test file**, full target content (CommonJS, node:test; house conventions as in
test/hygiene-gates-ci.test.js and test/readme-drift.test.js: Given/When/Then titles,
Arrange/Act/Assert comments, `sut`, named constants). Pre-probed exactly as below:

```js
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const STATIC_LINTS_SCRIPT = path.join(ROOT, 'scripts', 'static-lints.sh');
const CI_SCRIPT = path.join(ROOT, 'scripts', 'ci.sh');
const STATIC_LINTS_CALL = /^bash scripts\/static-lints\.sh$/m;

const THROWAWAY_PREFIX = 'static-lints-';
const LINT_LOG_NAME = 'lint.log';
const EXECUTABLE_MODE = 0o755;
// Distinct from 1 and 2 so an exit with it proves the lint's own status propagated.
const STUB_FAIL_STATUS = 3;
const NO_FAILING_LINT = '';
// errexit ignores a failure in every command of an && list except the last, so a joined
// list that ends the file still exits with the lint's status. A statement after the lints
// exposes every position that is not its own statement.
const TRAILING_STATEMENT = 'true\n';

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
const LOOP_FOLLOWERS = new Map([
  ['backlog-lint BACKLOG.md', 'backlog-lint templates/backlog.md'],
  ['design-lint templates/design.md', 'design-lint docs/contributing/design/a.md'],
]);
const ALL_INVOCATIONS = LINT_IDS.flatMap((id) => [id, ...(LOOP_FOLLOWERS.has(id) ? [LOOP_FOLLOWERS.get(id)] : [])]);

const SHELL_STUB_NAMES = ['backlog-lint', 'design-lint', 'docs-structure-lint', 'sync-adapter-agents'];
const NODE_STUB_NAMES = ['pipeline-lint', 'pipeline-resolve', 'contracts-lint'];
const LINT_INPUTS = ['BACKLOG.md', 'templates/backlog.md', 'templates/design.md', 'docs/contributing/design/a.md', 'hooks/h.sh'];

function shellStub(idExpression) {
  return [
    '#!/usr/bin/env bash',
    `id="${idExpression}"`,
    'echo "$id" >> "$LINT_LOG"',
    `if [ "$id" = "$FAIL_LINT" ]; then exit ${STUB_FAIL_STATUS}; fi`,
    '',
  ].join('\n');
}

function nodeStub(name) {
  return [
    "const fs = require('node:fs');",
    `const id = ['${name}', ...process.argv.slice(2)].join(' ');`,
    "fs.appendFileSync(process.env.LINT_LOG, id + '\\n');",
    `process.exit(id === process.env.FAIL_LINT ? ${STUB_FAIL_STATUS} : 0);`,
    '',
  ].join('\n');
}

function writeThrowawayFile(root, relativePath, content) {
  const target = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content, { mode: EXECUTABLE_MODE });
}

function buildThrowaway() {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), THROWAWAY_PREFIX)));
  writeThrowawayFile(root, 'scripts/static-lints.sh', fs.readFileSync(STATIC_LINTS_SCRIPT, 'utf8') + TRAILING_STATEMENT);
  writeThrowawayFile(root, 'bin/shellcheck', shellStub('shellcheck'));
  for (const name of SHELL_STUB_NAMES) writeThrowawayFile(root, `scripts/${name}.sh`, shellStub(`${name} $*`));
  for (const name of NODE_STUB_NAMES) writeThrowawayFile(root, `engine/bin/${name}.js`, nodeStub(name));
  for (const input of LINT_INPUTS) writeThrowawayFile(root, input, '');
  return root;
}

function readInvocations(logPath) {
  if (!fs.existsSync(logPath)) return [];
  return fs.readFileSync(logPath, 'utf8').split('\n').filter(Boolean);
}

function runStaticLints(failingLint) {
  const root = buildThrowaway();
  const logPath = path.join(root, LINT_LOG_NAME);
  try {
    const result = spawnSync('bash', [path.join(root, 'scripts', 'static-lints.sh')], {
      cwd: root,
      encoding: 'utf8',
      env: {
        ...process.env,
        PATH: `${path.join(root, 'bin')}${path.delimiter}${process.env.PATH}`,
        FAIL_LINT: failingLint,
        LINT_LOG: logPath,
      },
    });
    if (result.error) throw result.error;
    return { status: result.status, invocations: readInvocations(logPath) };
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

test('Given every stubbed lint green, when static-lints runs, then it exits 0 after all twelve invocations in block order', () => {
  // Arrange
  const failingLint = NO_FAILING_LINT;

  // Act
  const sut = runStaticLints(failingLint);

  // Assert
  assert.strictEqual(sut.status, 0);
  assert.deepStrictEqual(sut.invocations, ALL_INVOCATIONS);
});

for (const lintId of LINT_IDS) {
  test(`Given the lint "${lintId}" fails with a statement after the lints, when static-lints runs, then it exits with that lint's status and no later lint runs`, () => {
    // Arrange
    const expectedInvocations = ALL_INVOCATIONS.slice(0, ALL_INVOCATIONS.indexOf(lintId) + 1);

    // Act
    const sut = runStaticLints(lintId);

    // Assert
    assert.strictEqual(sut.status, STUB_FAIL_STATUS);
    assert.deepStrictEqual(sut.invocations, expectedInvocations);
  });
}

test('Given scripts/ci.sh, when its content is read, then it calls static-lints as a bare statement', () => {
  // Arrange
  const sut = fs.readFileSync(CI_SCRIPT, 'utf8');

  // Act
  const result = STATIC_LINTS_CALL.test(sut);

  // Assert
  assert.strictEqual(result, true);
});
```

Why the fixture is shaped this way (keep it so):

- The shellcheck stub sits on `PATH` (`<tmp>/bin` first) and ignores its args: the
  `scripts/*.sh hooks/*.sh` globs expand to the stub names, not to anything stable.
- Script stubs live at the real call paths (`<tmp>/scripts/<name>.sh`, run via `bash`, so
  the mode is cosmetic for them; the PATH stub needs 755) and log `<name> <args>`. Node stubs
  are CommonJS .js files at `<tmp>/engine/bin/<name>.js`; the tmp dir has no package.json,
  so `require` works.
- docs/contributing/design/a.md is the one input the script needs (the design-lint glob);
  the other inputs mirror the real tree and cost nothing.
- Case 1 is the R2 control: all twelve invocations ran, in order, loop files included. The
  failing cases assert the invocation PREFIX up to `<id>` (stronger than "ends with `<id>`":
  it also proves every earlier lint ran).
- Each case gets its own mkdtemp, removed in `finally`; cases do not share state.

Read-only references (do not edit): test/plugin-evals-local-only.test.js (L14, L210: scans
every script and test file for eval paths), test/every-test-file-registers.test.js,
test/readme-drift.test.js L47–49 (copy-into-throwaway precedent), scripts/living-corpus.sh
(single-sourced script precedent), docs/contributing/DOD.md L60.

### TDD steps

RED 1 — retarget the two coupled tests and create the new test file holding ONLY its last
test (the ci.sh wiring case) plus what that test needs: `'use strict'`, the `node:test`,
`node:assert`, `node:fs` and `node:path` requires, and the `ROOT`, `CI_SCRIPT` and
`STATIC_LINTS_CALL` constants. Edit `test/hygiene-gates-ci.test.js` and
`test/sync-adapter-agents.test.js` to their targets from the Context block. Run
`node --test test/static-lints-ci.test.js test/hygiene-gates-ci.test.js test/sync-adapter-agents.test.js > "$(mktemp)"`
(pipe to a file, grep `^not ok` and `^# (pass|fail)`). Expected: exactly 3 failures —
"calls static-lints as a bare statement" (ci.sh has no `bash scripts/static-lints.sh` line:
the lints still run inline as the `&&` list), "sits after the static-lints call" (fails on
"expected the static-lints call to be present": `indexOf` returns -1), and "wires --check
into the static lints" (ENOENT: scripts/static-lints.sh does not exist).

GREEN 1 — verbatim move. Create `scripts/static-lints.sh` (`chmod 755`) holding:
the shebang; `# Static lints run by scripts/ci.sh.`; `set -euo pipefail`; the self-root `cd`
line; a blank line; then ci.sh L80–86 copied byte for byte (still the `&&` list with both
inner `|| exit 1`). In `scripts/ci.sh` replace L80–86 with the single line
`bash scripts/static-lints.sh`. Rerun the RED 1 command: 0 failures. Run
`shellcheck scripts/static-lints.sh scripts/ci.sh` (clean).

RED 2 — add the rest of the new test file from the Context block (constants, stubs,
`buildThrowaway`, `runStaticLints`, the control test and the `LINT_IDS` loop; the wiring test
stays last). Run `node --test test/static-lints-ci.test.js > "$log" 2>&1`, then
`grep -E '^(not )?ok|^# (pass|fail)|actual:' "$log"`. Expected: `# fail 9`. The RED cases
and what the verbatim `&&` list does instead:

- cases "shellcheck", "pipeline-lint pipeline/default.yml",
  "pipeline-resolve pipeline/default.yml", "contracts-lint contracts",
  "docs-structure-lint docs/contributing", "docs-structure-lint docs/guides",
  "docs-structure-lint --audience docs": `actual: 0` (expected 3). The failing stub
  short-circuits the list, errexit ignores it because it is not the list's last command,
  and the trailing statement exits 0.
- cases "backlog-lint BACKLOG.md", "design-lint templates/design.md": `actual: 1`
  (expected 3). The inner `|| exit 1` normalises the lint's status.

Record these nine names and their `actual:` values in the handback.

GUARD 2 — in the same run, three tests pass at RED 2, each for a stated reason:

- the control case (every stub green): the verbatim list runs all twelve invocations in
  order and the trailing `true` exits 0;
- "sync-adapter-agents --check": it is the list's LAST command, so errexit fires on it and
  the script exits 3 (the one position the old block already closed);
- the wiring case: GREEN 1 put the bare call in ci.sh.

If any of these fails on its first run, treat it as a RED per the construction contract:
write its GREEN, and note the plan mismatch in the handback.

GREEN 2 — replace the body of `scripts/static-lints.sh` with the final bytes from the
Context block (two-line why comment in the header; one bare statement per lint; both loops
without `|| exit 1`). Rerun the RED 2 command: `# pass 12`, `# fail 0`. Then run, by hand
(the gate's lint block is the file under change):

- `shellcheck scripts/static-lints.sh scripts/ci.sh` — no output, exit 0;
- `bash scripts/static-lints.sh > "$log" 2>&1; echo "exit=$?"; tail -1 "$log"` — exit 0,
  last line "sync-adapter-agents: 54 mirrors in sync across 6 adapters." (the mirror count
  is whatever the tree holds; the exit code is what matters);
- `node --test test/plugin-evals-local-only.test.js test/every-test-file-registers.test.js test/hygiene-gates-ci.test.js test/sync-adapter-agents.test.js`
  to a file — `# fail 0`.

GUARD 3 — real-lint end-to-end, in a throwaway clone (never the worktree). Commit nothing in
the worktree yet; the clone takes the working-tree files by copy:

```bash
w=/Users/scolladon/workspace/perso/craft-ci-lint-chain-fail-closed
t="$(mktemp -d)"; git clone -q "$w" "$t/repo"
cp "$w/scripts/static-lints.sh" "$t/repo/scripts/static-lints.sh"
printf 'phases: [\n' > "$t/repo/pipeline/default.yml"
ln -s "$w/engine/node_modules" "$t/repo/engine/node_modules"
bash "$t/repo/scripts/static-lints.sh" > "$t/out.log" 2>&1; echo "exit=$?"
```

Expected: a non-zero exit (2 in the pre-probe) and no `sync-adapter-agents:` line in
`$t/out.log`: pipeline-lint fails at the second position and stops the script. It passes
because GREEN 2 made that lint its own statement; the old block exited 0 on the same input.

REFACTOR — reread the five diffs (`git diff --no-ext-diff -- <path>` per file) for: no
provenance reference, no magic value outside a named constant in the test, no dead code
(the GREEN 1 one-line header comment is gone), ci.sh's blank lines around the call kept. No
further change is expected; rerun the RED 2 command if anything moves.

### Gate

`log="$(mktemp)"; bash scripts/ci.sh > "$log" 2>&1; echo "ci exit=$?"; tail -1 "$log"` —
exit 0 AND last line "craft-adr: OK — 431 ADR(s) checked, 4 declaring supersession.".
Require both: an exit 0 whose log does not end on the craft-adr line means a step was skipped.
Also `grep -c '^# Subtest: Given the lint' "$log"` prints 10 (the per-position cases ran). On failure,
`grep -n '^not ok\|^ci:\|Error' "$log" | head`. Plus the GREEN 2 by-hand lint runs and the
GUARD 3 result, as stated.

### Commit

`fix(ci): fail the build when any static lint fails`
