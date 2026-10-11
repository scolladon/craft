# Plan — stub-lint-ci-self-reference

> Source: design doc `docs/contributing/design/stub-lint-ci-self-reference.md` · ADRs `474, 475, 476, 477, 478`
> (all five take the design's recommended options: DC-1 (a) strip the lint's own name token,
> never skip a file; DC-2 (a) reword the `ci.sh` hygiene header; DC-3 (a) the token is
> `stub-lint` alone; DC-4 (a) a separate `OWN_NAME_PATTERN` stripped in `scan`; DC-5 (a)
> fixture-only unit tests, no process test over the real `scripts/ci.sh`)
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

## Plan shape (1 part)

| # | Part | src delta | Files |
|---|---|---|---|
| 1 | Strip the lint's own name before matching; reword the ci.sh header | `engine/src/stub-lint-main.js` (+8 / −1) | `engine/src/stub-lint-main.js`, `engine/test/stub-lint-main.test.js`, `scripts/ci.sh` |

One part: a single GREEN satisfies every RED, the source delta is one constant pair and one
line in `scan`, and the `ci.sh` reword is one comment line whose only proof (R1) needs the
GREEN in place. Splitting would produce a test-only or a one-line part.

Every edit below was applied to a throwaway `git clone` of the branch tip (`0ed6cb8`) and
checked there:

| Check | Before the GREEN | After the part |
|---|---|---|
| `engine/test/stub-lint-main.test.js` | 13 existing pass; 4 new RED fail, 4 new GUARD pass | 21 / 0 fail |
| `npm --prefix engine test` | — | 2810 / 0 fail |
| `bash scripts/ci.sh` (after committing in the clone) | — | exit 0 |
| `node engine/bin/stub-lint.js --gate blocking -- scripts/ci.sh` | `STUB@L82`, `STUB@L121`, exit 2 | empty, exit 0 |

Mutants run by hand against the final suite (same edit, one at a time):

| Mutant | Killed by |
|---|---|
| `OWN_NAME_PATTERN` without the leading `\b` | glued-prefix test (`TODOstub-lint` surfaces `TODO`) |
| `OWN_NAME_PATTERN` without the trailing `\b` | near-miss test (`stub-linter` loses its `STUB`) |
| `OWN_NAME_PATTERN` without the `i` flag | upper/mixed-case test |
| `OWN_NAME_PATTERN` without the `g` flag | twice-on-one-line test |
| `scannable = line` (no strip) | all four RED tests |
| `OWN_NAME_REPLACEMENT = ''` | survives: equivalent, documented beside the constant |

## Public-surface decision

No new exported symbol. `OWN_NAME_PATTERN` and `OWN_NAME_REPLACEMENT` are module-private
constants in `engine/src/stub-lint-main.js`; `scan` stays private and keeps its signature
`(content: string) => string[]`; `main(argv, io)` is unchanged. No barrel, README surface,
registry or API report is touched, so no surface gate applies. The test helpers
`findingsOf` and `writeCiSh` are local to the test file.

## Decision candidates

None. Every load-bearing choice is ratified by ADR 474 to ADR 478, and the plan follows them.
Two details the design left implicit are fixed here, not by a decision:

- The design's inline `' '` replacement becomes a named constant `OWN_NAME_REPLACEMENT`
  (no magic values), and the equivalent-mutant comment sits on that constant.
- `scan` gains a local `scannable` so the `for … of` line stays short; behaviour is the
  design's `line.replace(OWN_NAME_PATTERN, ' ').matchAll(MARKER_PATTERN)` byte for byte.

## Validation-phase notes

- Stryker mutates the `engine/src/stub-lint-main.js` hunk only (`scripts/ci.sh` is outside
  the mutate scope). Use ONE comma-separated `--mutate` value.
- Narrow the test corpus to `engine/test/stub-lint-main.test.js`,
  `engine/test/stub-lint.bin.test.js` and `engine/test/hygiene-lint-core.test.js` via an
  override of engine/stryker.conf.json whose `tap.testFiles` lists only those three (the
  runner is `tap`, not vitest). Hand-check
  any survivor against that full set. The `''` replacement survivor is the documented
  equivalent mutant.
- Trap: on this branch, `ci.sh`'s hygiene block passes every touched `*.md` as a
  `--waiver-source`, and the design doc quotes a `STUB-WAIVE(…)` token naming
  `scripts/ci.sh`. That token waives `ci.sh` for this branch's run (reproduced: a `ci.sh`
  with a `# TODO: x` line exits 2 alone and exits 0 with the design doc as a waiver source).
  So a quiet hygiene block in `bash scripts/ci.sh` is NOT the R1 proof; the direct bin
  command in the Part 1 gate is.

## Part 1 — Strip the lint's own name before matching; reword the ci.sh header

### Context

**What changes.** `stub-lint` reads `stub` inside its own name `stub-lint` as a STUB marker,
because `-` is a word boundary. On the shipped tree it reports two findings on
`scripts/ci.sh`: `STUB@L82` (prose `stub` in the hygiene header) and `STUB@L121` (the
`node engine/bin/stub-lint.js …` invocation). The fix strips the token `stub-lint` from each
line before marker matching (per token, never per line or per file), and rewords the header
so it names the lints instead of using bare prose `stub`. A real marker (`# TODO: x`,
`# stub: fill in`, `# FIXME`) on `ci.sh` must still be reported with its line number.

**Files edited.**

- `engine/src/stub-lint-main.js` (41 lines). Current shape:
  - :12 `MARKERS` (frozen `['TODO','FIXME','HACK','XXX','PLACEHOLDER','STUB']`), :13 `SELF`,
    :14 `WAIVER_PATTERN`, :15 `FOUND_TOKEN`, :16-17 why-comment, :18
    `MARKER_PATTERN = new RegExp(\`\\b(${MARKERS.join('|')})\\b\`, 'gi')`.
  - :20-23 JSDoc, :24-32 `function scan(content)` — splits on `'\n'`, and for each line
    `for (const match of line.matchAll(MARKER_PATTERN))` pushes
    `` `${match[1].toUpperCase()}@L${idx + 1}` ``.
  - :39-41 `export function main(argv, io)` → `coreMain(argv, io, { self: SELF, waiverPattern: WAIVER_PATTERN, foundToken: FOUND_TOKEN, scan })`.
  - Leave `MARKERS`, `MARKER_PATTERN`, `SELF`, `WAIVER_PATTERN`, `FOUND_TOKEN`, `main` and
    the module header untouched.
- `engine/test/stub-lint-main.test.js` (211 lines, node:test ESM). Existing helpers to
  reuse: `tmpRoot()` (:15, mkdtemp `stublint-`, cleaned in `after`), `writeFixture(root,
  relPath, content)` (:21, creates parent dirs, returns the absolute path),
  `makeCaptureIo()` (imported from engine/test-helpers/capture-io.js; `io.stdout.joined()`
  concatenates writes), the `MARKERS` mirror (:10). Every test sets `const sut = main;`,
  Given/When/Then title, AAA body with blank lines between phases. Append the new block at
  the end of the file (after the padded-waiver test ending at :211). Do not edit existing
  tests (:183 glued-vs-standalone loop, :117 `STUBBORN`/`TODOLIST`, :131 lowercase `todo`,
  :170 self-exclusion stay as they are).
- `scripts/ci.sh` :82, one comment line:
  ```diff
  -# --- hygiene gates (workstream C): touched-diff stub + prose lints ---
  +# --- hygiene gates (workstream C): touched-diff stub-lint + prose-lint ---
  ```
  No test anchors on this comment (test/hygiene-gates-ci.test.js anchors on
  `run_stub_lint`, the `stub-lint.js` invocation line, and the static-lints call).
  docs/contributing/plan/harness-hygiene-prune-gates.md:494 and
  docs/contributing/plan/ci-lint-chain-fail-closed.md:112 quote the old comment; they are
  dated ledgers — leave them.

**Read-only references.** engine/src/hygiene-lint-core.js (`scanFile` prints
`${ctx.foundToken}(${file}): ${finding}\n` per finding, :146; argv `--` handling :43;
equivalent-mutant comment style at :39, :133, :140). engine/bin/stub-lint.js (argv shim).
Do NOT edit hygiene-lint-core.js, prose-lint, the waiver mechanism, or `ci.sh`'s wiring.

**Finding format the tests pin.** Each fixture is written as `scripts/ci.sh` under a fresh
tmp root, so a finding line reads `STUB-FOUND(<abs fixture path>): <MARKER>@L<n>`; the
helper `findingsOf(io)` splits stdout into non-empty lines. Exit codes: 0 clean or
advisory, 2 when findings exist under `--gate blocking`.

**Final source** (verified green):

```js
const MARKER_PATTERN = new RegExp(`\\b(${MARKERS.join('|')})\\b`, 'gi');
// The lint's own name: `-` is a word boundary, so `stub` inside `stub-lint` would
// otherwise read as a STUB marker at every call site that names the lint.
const OWN_NAME_PATTERN = /\bstub-lint\b/gi;
// equivalent mutant (StringLiteral: '' instead of ' '): the name is stripped only
// between non-word characters or line edges, so no replacement can join or split a marker
const OWN_NAME_REPLACEMENT = ' ';

/**
 * @param {string} content
 * @returns {string[]} `<MARKER>@L<n>` findings, marker upper-cased, 1-based line
 */
function scan(content) {
  const findings = [];
  content.split('\n').forEach((line, idx) => {
    const scannable = line.replace(OWN_NAME_PATTERN, OWN_NAME_REPLACEMENT);
    for (const match of scannable.matchAll(MARKER_PATTERN)) {
      findings.push(`${match[1].toUpperCase()}@L${idx + 1}`);
    }
  });
  return findings;
}
```

The space replacement keeps line numbers (the only positional data in a finding) intact.
`String.prototype.replace` with a global regex starts from index 0 on every call, so reusing
the literal across lines carries no state. `TODOstub-lint` is not stripped (no boundary
before `s`) and stays a non-finding, as today.

**Shared test scaffolding** (append once, above the new tests):

```js
// ─── the lint's own name is not a marker; real markers on ci.sh still fire ───

const CI_SH_HYGIENE_HEADER = '# --- hygiene gates (workstream C): touched-diff stub-lint + prose-lint ---';
const CI_SH_STUB_LINT_INVOCATION =
  '  node engine/bin/stub-lint.js --gate "$hygiene_gate" ${waivers[@]+"${waivers[@]}"} -- "${src[@]}"';

function findingsOf(io) {
  return io.stdout.joined().split('\n').filter(Boolean);
}

function writeCiSh(lines) {
  return writeFixture(tmpRoot(), 'scripts/ci.sh', `${lines.join('\n')}\n`);
}
```

`CI_SH_STUB_LINT_INVOCATION` is a single-quoted string on purpose: the `${…}` bash
expansions must stay literal, not template interpolations.

### TDD steps

1. **RED — repro (design Test strategy 1).**
   ```js
   test('Given a ci.sh-shaped file naming stub-lint in its header and its invocation, when main runs with --gate blocking, then it exits 0 with no findings', () => {
     const sut = main;
     const ciSh = writeCiSh([CI_SH_HYGIENE_HEADER, CI_SH_STUB_LINT_INVOCATION]);
     const io = makeCaptureIo();

     const result = sut(['--gate', 'blocking', '--', ciSh], io);

     assert.equal(result, 0, `stdout: ${io.stdout.joined()} stderr: ${io.stderr.joined()}`);
     assert.deepEqual(findingsOf(io), []);
   });
   ```
   Fails today: `scan` matches `stub` inside `stub-lint` on both lines, prints
   `STUB@L1` and `STUB@L2`, and `main` returns 2 (expected 0).

2. **RED — token, not line (R3, design 4).**
   ```js
   test('Given stub-lint sharing a line with another marker, when main runs, then only that other marker is reported', () => {
     const sut = main;
     const ciSh = writeCiSh(['stub-lint TODO later', 'stub-lint stub']);
     const io = makeCaptureIo();

     sut([ciSh], io);

     assert.deepEqual(findingsOf(io), [`STUB-FOUND(${ciSh}): TODO@L1`, `STUB-FOUND(${ciSh}): STUB@L2`]);
   });
   ```
   Fails today: four findings (`STUB@L1`, `TODO@L1`, `STUB@L2`, `STUB@L2`) — the name's
   `stub` is reported next to the real marker.

3. **RED — case-insensitive strip (R4, kills the dropped `i` flag).**
   ```js
   test('Given the lint name in upper and mixed case, when main runs, then neither is reported', () => {
     const sut = main;
     const ciSh = writeCiSh(['STUB-LINT', 'Stub-Lint']);
     const io = makeCaptureIo();

     sut([ciSh], io);

     assert.deepEqual(findingsOf(io), []);
   });
   ```
   Fails today: `STUB@L1`, `STUB@L2`.

4. **RED — global strip (R4, kills the dropped `g` flag).**
   ```js
   test('Given the lint name twice on one line, when main runs, then neither occurrence is reported', () => {
     const sut = main;
     const ciSh = writeCiSh(['stub-lint stub-lint']);
     const io = makeCaptureIo();

     sut([ciSh], io);

     assert.deepEqual(findingsOf(io), []);
   });
   ```
   Fails today: `STUB@L1` twice.

5. **GREEN.** In `engine/src/stub-lint-main.js`, add `OWN_NAME_PATTERN` and
   `OWN_NAME_REPLACEMENT` (with their two comments) right after `MARKER_PATTERN` (:18), and
   change `scan` to match over `scannable` — exactly the "Final source" block above. REDs
   1-4 pass; the 13 existing tests stay green.

6. **GUARD — real markers on ci.sh still fire (R2 hard constraint, design 2).**
   ```js
   test('Given a ci.sh-shaped file with real TODO, stub and FIXME lines, when main runs with --gate blocking, then each is reported on its line and the run exits non-zero', () => {
     const sut = main;
     const ciSh = writeCiSh([CI_SH_HYGIENE_HEADER, CI_SH_STUB_LINT_INVOCATION, '# TODO: x', '# stub: fill in', '# FIXME']);
     const io = makeCaptureIo();

     const result = sut(['--gate', 'blocking', '--', ciSh], io);

     assert.equal(result, 2);
     assert.deepEqual(findingsOf(io), [
       `STUB-FOUND(${ciSh}): TODO@L3`,
       `STUB-FOUND(${ciSh}): STUB@L4`,
       `STUB-FOUND(${ciSh}): FIXME@L5`,
     ]);
   });
   ```
   Passes after step 5: the strip touches only the name token, so the three real markers
   keep their lines and exit 2. (Before step 5 the exact list would also carry
   `STUB@L1`/`STUB@L2`, which is why it sits after the GREEN.)

7. **GUARD — prose `stub` stays a marker (design 3).**
   ```js
   test('Given the hygiene header worded with a bare prose stub, when main runs, then that stub is still reported', () => {
     const sut = main;
     const ciSh = writeCiSh(['# --- hygiene gates (workstream C): touched-diff stub + prose lints ---']);
     const io = makeCaptureIo();

     sut([ciSh], io);

     assert.deepEqual(findingsOf(io), [`STUB-FOUND(${ciSh}): STUB@L1`]);
   });
   ```
   Passes before and after: the original header holds no `stub-lint` token.

8. **GUARD — near-miss forms still fire (R4, kills the dropped trailing `\b`).**
   ```js
   test('Given near-miss forms of the lint name, when main runs, then each still reports a STUB marker', () => {
     const sut = main;
     const nearMisses = ['stub-linter', 'stub-lints', 'stub -lint', 'stub--lint', 'STUB-WAIVE(x)'];
     const ciSh = writeCiSh(nearMisses);
     const io = makeCaptureIo();

     sut([ciSh], io);

     assert.deepEqual(
       findingsOf(io),
       nearMisses.map((_, idx) => `STUB-FOUND(${ciSh}): STUB@L${idx + 1}`),
     );
   });
   ```
   Passes: none of these is the exact token `stub-lint` between boundaries.

9. **GUARD — glued prefix (kills the dropped leading `\b`).**
   ```js
   test('Given the lint name glued onto a preceding marker, when main runs, then neither the name nor the marker is reported', () => {
     const sut = main;
     const ciSh = writeCiSh(['TODOstub-lint']);
     const io = makeCaptureIo();

     sut([ciSh], io);

     assert.deepEqual(findingsOf(io), []);
   });
   ```
   Passes: no boundary before `s`, so nothing is stripped and `TODOstub` is one word.

10. **`scripts/ci.sh` :82 reword** (the diff in Context). Then check R1 by hand:
    `node engine/bin/stub-lint.js --gate blocking -- scripts/ci.sh` prints nothing and exits
    0 (before the reword it prints `STUB-FOUND(scripts/ci.sh): STUB@L82` and exits 2).

11. **REFACTOR.** None expected. Confirm no provenance refs (ADR/phase/backlog numbers) in
    the new comments or test titles, no suppression directives, and that every new test
    sets `const sut = main;`.

### Gate

```
out="$(mktemp)"; npm --prefix engine test > "$out" 2>&1; tail -n 12 "$out"
node engine/bin/stub-lint.js --gate blocking -- scripts/ci.sh; echo "exit=$?"
```

Expect `# fail 0` (2810 tests at plan time) and an empty stub-lint output with `exit=0`.
engine/test/findings.test.js:611 is a known sub-ms timing flake: if it is the only failure,
rerun once. Phase gate: `bash scripts/ci.sh`.

### Commit

`fix: stop stub-lint flagging its own name in ci.sh`
