# Plan — refuse-open-on-live-run-id

> Source: design doc `docs/contributing/design/refuse-open-on-live-run-id.md` · ADRs 450, 451, 452, 453, 454
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

**How this plan applies them.** Two parts, run in order, in the same working tree.

- Part 1 (2 files, 1 RED→GREEN cycle: 3 RED entries and 4 GUARD entries before one
  GREEN) is the only code change: the refusal in scripts/run-ledger.sh plus the
  behaviour tests that pin the post-change matrix S1–S6.
- Part 2 (3 files, 3 RED→GREEN cycles) is prose plus the prose pins that hold it:
  the §0 step-4 STOP in skills/run/SKILL.md and the run-record spec rewrite. It has no
  code delta. Each pin lands in the same part as the prose it pins.

**Pre-probed.** Before this plan was written, a throwaway `git clone` of this branch
(HEAD 1ec4a6b, engine/node_modules symlinked in) ran every step below verbatim:

- Part 1 tests against the unchanged script: 3 failing (exactly the three RED entries,
  first failing assertions `expected: 3 / actual: 0`, `expected: '' / actual: demo <ledger>`,
  `expected: 3 / actual: 0`) and 70 passing, the 4 GUARD entries among them.
- After the Part 1 GREEN: `node --test test/run-ledger.test.js test/run-record.test.js`
  117/117; `shellcheck scripts/run-ledger.sh` clean; every root test file 505/505.
- Part 2 pins against the unchanged prose: 3 failing (the three RED entries), 44 passing.
- After the Part 2 GREENs: the two-file gate 120/120; every root test file 508/508;
  both parts committed in the clone, `bash scripts/ci.sh` exit 0.

**Public surface.** None new. `OPEN_RUN_EXIT` and `refuse_if_open` are internal to
scripts/run-ledger.sh (a bash script: nothing exports them). No new verb, no new flag,
no new usage line: the `case` dispatcher and `usage_exit` are untouched, so the verb-set
test (test/run-record.test.js, the test titled "Given every run-ledger.sh invocation the
skills, the spec and the hooks name…", ~L397) keeps its `['append', 'close', 'dir',
'locate', 'open']` set. The exit code 3 is a CLI contract; Part 2 documents it on the two
surfaces that describe `open` (the run skill §0 step 4 and the run-record spec). No
adapter mirrors skills/run/SKILL.md (scripts/sync-adapter-agents.sh mirrors agents only),
no guide page describes the open-collision behaviour (grep of docs/guides for
`collision`, `same topic`, `craft-runs` finds only generic run-record mentions), and
test/craft-root-shim.test.js pins per-file `${CLAUDE_PLUGIN_ROOT}` counts, so the new
prose must not add that string.

**Binding for every part.**

- No provenance references (ADR numbers, design ids, matrix row ids like `S5`, phase or
  backlog ids) in the script, the tests, the skill or the new spec sentences. No
  suppression directives. No swallowed errors (`result.error` from `spawnSync` is
  rethrown).
- Prose trap: test/run-record.test.js ~L397 parses every `` run-ledger.sh"?)?"? <word> ``
  in skills/*/SKILL.md, the run-record spec and hooks/*.sh as a verb and fails on an
  unknown one. Write `run-ledger.sh close`, `run-ledger.sh open`, or a bare `` `open` ``.
  Never write `run-ledger.sh refuses` or `run-ledger.sh exits`.
- skills/run/SKILL.md is prose-linted by ci.sh (ban list: delve, leverage, seamless,
  robust, "it's important to note", "in conclusion"). The spec dir is exempt.
- Commit only the part's own files (`git add <each path>`, then `git commit -m
  "<message>"`). Never touch the branch, the index beyond your own paths, the stash, or
  other files; never checkout/restore/reset/stash.
- Pipe every test run through `tail`; `bash scripts/ci.sh` prints tens of thousands of
  lines — write it to a `mktemp` file and read back with `tail`/`grep`.

## Decision candidates

| # | Choice | Alternatives (≤3) | Recommendation | Why |
|---|---|---|---|---|
| P-1 | How tightly the refusal test pins stderr (the design's Test strategy gave a regex) | (a) byte-exact: `run-ledger: open: run-id demo is already open since <since> (ledger <path>); refusing to discard it\n`, plus `doesNotMatch(/demo@/)`; (b) the design's regex `/already open since \d{4}-.*Z/` plus `includes(<ledger path>)`; (c) (b) plus a one-line count | (a) | R1 asks for one line naming three things and R2 forbids the run-key; the design also wants no `close` hint in the line. Only an exact pin fails when a hint, a second line or a key creeps in. Cost: rewording the message needs a test edit, which is the point of a pin. The exact bytes are the design's own `die` message, measured in the probe. |
| P-2 | How the BACKLOG.md entry "**`open` on a live run-id discards that run's ledger.**" (BACKLOG.md L384–388) is closed (the design says "removed") | (a) the documentation phase flips it in place to "**… — delivered <date>** (fix/refuse-open-on-live-run-id)" plus a short what-changed note, outside every part; (b) Part 2 deletes the entry; (c) Part 2 flips it in place | (a) | Every recent close kept the entry and flipped its head in place: 9865c51, 78c6faa, d6d2ec0 and 594fe7f all rewrite `**<title>.**` to `**<title> — delivered <date>**` (branch) with a summary, and the ci-lint-chain plan states "The documentation phase closes the BACKLOG.md entry". Deleting it would break that ledger of delivered work. The delivered note needs the merged outcome, which the documentation phase has and a part does not. |

The parts below are written for P-1 (a) and P-2 (a). If P-1 (b) is chosen: in RED 1.1
replace the `assert.strictEqual(result.stderr, …)` call with
`assert.match(result.stderr, /already open since \d{4}-.*Z/)` and
`assert.ok(result.stderr.includes(ledgerOf(main)))`. If P-2 (b) or (c) is chosen: add
BACKLOG.md to Part 2's files and its commit; backlog-lint (`bash scripts/backlog-lint.sh
BACKLOG.md`, run inside ci.sh) must stay green.

## Follow-on, not parts

- The documentation phase closes the BACKLOG.md entry per P-2.
- No docs/guides page changes: none describes what `open` does on a reused run-id.
- Kept as-is on purpose (do not "fix" them): the `write_atomically` comment in
  scripts/run-ledger.sh (L127–129, "a leftover from a crashed attempt of the same topic
  never leaks its lines into the new run") stays true for the cases that still reach the
  write (a pointerless or untrusted leftover); `warn_if_replacing` (~L156–160) stays and
  is now reached only for an untrusted leftover pointer; the script's usage header
  (L8–13) is unchanged.

## Part 1 — Refuse `open` on a run-id whose trusted pointer and ledger exist

### Context

Working directory: the worktree root (`<worktree>`)
(branch fix/refuse-open-on-live-run-id). Bash 3.2 locally (macOS /bin/bash); CI runs
ubuntu bash 5.

Files this part touches (exactly two):

1. `scripts/run-ledger.sh` — EDIT: one `readonly`, one new function, one call.
2. `test/run-ledger.test.js` — EDIT: replace one test (L84–96), add six tests in the
   `// open` block.

**scripts/run-ledger.sh today** (258 lines, `set -euo pipefail`, `LC_ALL=C`):

- L17–24: the `readonly` constants; the last is
  `readonly UTC_STAMP_FORMAT='+%Y-%m-%dT%H:%M:%SZ'` (L24). `OPEN_RUN_EXIT` goes right
  after it.
- L37–41 `die() { local message="$1" code="${2:-1}"; printf 'run-ledger: %s\n' "$message" >&2; exit "$code"; }`
  — the second argument is the exit code.
- L93–101 `read_pointer` and L109–117 `load_trusted_pointer <run-id>`: on success they set
  the script-scoped globals `key` (`<run-id>@<iso>`) and `ledger` (absolute ledger path);
  `load_trusted_pointer` fails for a missing/symlinked pointer, a malformed line, a key
  whose run-id is not the file name, a stamp later than `utc_now`, or a ledger that is not
  `ledger_path <run-id>` or is a symlink. `cmd_append` (L177–192) and `locate_by_run`
  (L220–227) already rely on `key`/`ledger` after a successful call.
- L139–149 `sweep_stale_pointers`: removes every pointer whose line is malformed or whose
  ledger is missing. It runs before the refusal, so a pointer whose ledger was deleted
  is gone by then and `open` proceeds silently.
- L156–160 `warn_if_replacing <run-id>`: prints
  `run-ledger: open: replacing existing pointer for run-id <run-id>` when a pointer file
  exists. Unchanged.
- L162–175 `cmd_open`, today:

```bash
cmd_open() {
  [ $# -le 1 ] || usage_exit
  local run_id="${1:-}" target run_key
  require_run_id "$run_id"
  resolve_git_common || die "not inside a git repository's work tree"
  prepare_runs_dir
  sweep_stale_pointers
  target="$(ledger_path "$run_id")"
  write_atomically "$target" "$LEDGER_HEADER"
  warn_if_replacing "$run_id"
  run_key="$run_id@$(utc_now)"
  write_atomically "$(pointer_path "$run_id")" "$run_key $target"
  printf '%s %s\n' "$run_key" "$target"
}
```

  The argument check (`[ $# -le 1 ] || usage_exit`) runs first, so `open demo --in-place`
  keeps exiting 2 with no run directory created; the refusal sits after
  `sweep_stale_pointers` and before the first write.

**test/run-ledger.test.js today** (684 lines). Imports at L1–17: `test`, `assert`, `fs`,
`os`, `path`, `spawnSync` (from `node:child_process`), and from ./helpers/craft-run (read
only, test/helpers/craft-run.js): `LEDGER_SCRIPT`, `LEDGER_HEADER`, `git`, `runsDirOf`,
`createRunRepo`, `runLedger`, `writeTranscript`, `bindRun`. Every symbol the new tests use
is already imported; add no import.

- Local helpers L19–50: `RUN_KEY_PATTERN = /^demo@\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/`,
  `PAST_STAMP`, `ledgerOf(main, runId = 'demo')`, `pointerOf(main, runId = 'demo')`,
  `withTempDir`, `withRepo(act)` (act receives `{ parent, main, cleanup }`),
  `withRun(options, act)` (act receives bindRun's
  `{ parent, main, worktree, ledgerPath, runKey, transcriptPath, cleanup }`).
- Helper behaviour (test/helpers/craft-run.js, read only):
  `runLedger(cwd, args, input = '')` → `{ status, stdout, stderr }` via
  `spawnSync('bash', [LEDGER_SCRIPT, ...args])`; `writeTranscript(dir, texts)` writes
  `<dir>/transcript.jsonl`, one JSONL tool_result line per text, and returns its path —
  bindRun already wrote `<parent>/transcript.jsonl`, so a second transcript needs its own
  sub-directory; `bindRun()` opens `demo` once in a fresh repo and adds a worktree.
- The `// open` block runs L52–211. L84–96 is the test that pins the defect:
  "Given demo already open with records, when open demo runs again, then stderr names the
  replacement and the ledger starts fresh" (it asserts the replacement warning and a
  header-only ledger). Delete all of L84–96 and put the new tests in its place, so they
  sit before the L98 `for (const [label, args, status] of [` loop (whose
  `['an extra argument', ['open', 'demo', '--in-place'], 2]` row is the R3 grammar pin
  and stays).
- Already pinned and kept unchanged: S1 (L56 "Given a fresh repo, when open demo runs…"),
  the argument grammar (L98–113), the sweep tests (L608–632), close (L634–646), and the
  `UNTRUSTED_POINTERS` table (L478–583), which exercises locate and append only, never
  `open` on the same run-id. Nothing pins S3, S4, S5 or S6 for `open` on the same run-id;
  the GUARD entries below add them.
- House style: GWT titles, AAA blocks separated by blank lines, `const sut = …`,
  `assert.strictEqual`, table-driven `for` loops for parameterised cases.

### TDD steps

Insert the following block in place of L84–96 (after the test ending at L82 and its blank
line), in this order. Each entry's label names the step.

**RED 1.1 — refusal (R1, R2, replaces the defect pin).** Fails today on its first
assertion: `expected: 3`, `actual: 0` (today's `open` overwrites the ledger and exits 0).

```js
test('Given demo already open with records, when open demo runs again, then it exits 3 with an empty stdout, leaves the ledger and the pointer byte-identical and names the run-id, its open-since stamp and the ledger on one stderr line without the run-key', () => {
  withRepo(({ main }) => {
    runLedger(main, ['open', 'demo']);
    runLedger(main, ['append', 'demo', 'resolve'], 'RESOLVE: --skip review\n');
    const ledgerBefore = fs.readFileSync(ledgerOf(main), 'utf8');
    const pointerBefore = fs.readFileSync(pointerOf(main), 'utf8');
    const since = pointerBefore.split(' ')[0].slice('demo@'.length);
    const sut = runLedger;

    const result = sut(main, ['open', 'demo']);

    assert.strictEqual(result.status, 3);
    assert.strictEqual(result.stdout, '');
    assert.strictEqual(fs.readFileSync(ledgerOf(main), 'utf8'), ledgerBefore);
    assert.strictEqual(fs.readFileSync(pointerOf(main), 'utf8'), pointerBefore);
    assert.strictEqual(
      result.stderr,
      `run-ledger: open: run-id demo is already open since ${since} (ledger ${ledgerOf(main)}); refusing to discard it\n`,
    );
    assert.doesNotMatch(result.stderr, /demo@/);
  });
});
```

The design's separate "bound run, stderr/stdout do not include `run.runKey`" row is
folded in here as `stdout === ''` plus `doesNotMatch(/demo@/)`: against today's script a
`run.runKey` comparison fails only when both `open`s land in the same second, so it would
be a timing-dependent RED. The pattern form fails deterministically and is stronger.

**RED 1.2 — a refusal binds nothing (R2, hook binding).** Fails today:
`expected: ''`, `actual: 'demo <ledger>\n'` — today the second `open` prints a new
run-key, its pointer is trusted, and `locate --transcript` binds it.

```js
test("Given a bound run and a second session whose transcript holds only a refused open's output, when locate --transcript runs on that transcript, then no run is bound", () => {
  withRun({}, (run) => {
    const refused = runLedger(run.main, ['open', 'demo']);
    const transcriptPath = writeTranscript(path.join(run.parent, 'second-session'), [refused.stdout, refused.stderr]);
    const sut = runLedger;

    const result = sut(run.main, ['locate', '--transcript', transcriptPath]);

    assert.strictEqual(result.status, 0);
    assert.strictEqual(result.stdout, '');
  });
});
```

**RED 1.3 — the §0 `&&` chain keeps a second run's lines out (R4).** Fails today:
`expected: 3`, `actual: 0` — `open` succeeds, the `append` runs, and the ledger holds the
header plus the second run's `RESOLVE: --skip review` line instead of the first run's.

```js
test('Given demo already open with records, when the open-and-append chain of a second run runs, then the append never runs and the ledger keeps only its own records', () => {
  withRepo(({ main }) => {
    runLedger(main, ['open', 'demo']);
    runLedger(main, ['append', 'demo', 'resolve'], 'RESOLVE: none\n');
    const before = fs.readFileSync(ledgerOf(main), 'utf8');
    const chain = '"$LEDGER" open demo && "$LEDGER" append demo resolve <<\'EOF\'\nRESOLVE: --skip review\nEOF\n';
    const sut = (cwd) => spawnSync('bash', ['-c', chain], { cwd, env: { ...process.env, LEDGER: LEDGER_SCRIPT }, encoding: 'utf8' });

    const result = sut(main);

    if (result.error) throw result.error;
    assert.strictEqual(result.status, 3);
    assert.strictEqual(fs.readFileSync(ledgerOf(main), 'utf8'), before);
  });
});
```

**GUARD 1.4 — discard path (R5, row S6).** Passes today and after the GREEN: `close`
removes both files, so the next `open` is the fresh-repo case.

```js
test('Given demo closed after records were appended, when open demo runs, then it exits 0 and the ledger holds the header alone', () => {
  withRepo(({ main }) => {
    runLedger(main, ['open', 'demo']);
    runLedger(main, ['append', 'demo', 'resolve'], 'RESOLVE: none\n');
    runLedger(main, ['close', 'demo']);
    const sut = runLedger;

    const result = sut(main, ['open', 'demo']);

    assert.strictEqual(result.status, 0);
    assert.match(result.stdout.split(' ')[0], RUN_KEY_PATTERN);
    assert.strictEqual(fs.readFileSync(ledgerOf(main), 'utf8'), `${LEDGER_HEADER}\n`);
  });
});
```

**GUARD 1.5–1.7 — leftovers no run can append through (R3, rows S3, S4, S5).** Pass
today (today's `open` overwrites unconditionally) and must still pass after the GREEN,
which refuses only a trusted pointer whose ledger exists: S3's pointer is swept first
(its ledger is gone, so stderr stays empty), S4 has no pointer, S5's pointer is stamped
in the future so `load_trusted_pointer` rejects it and `warn_if_replacing` still fires.
They are the guard against an over-broad refusal.

```js
// Leftovers no run can append through: open replaces each and starts a fresh ledger.
const REPLACEABLE_LEFTOVERS = [
  {
    label: 'a pointer whose ledger was deleted',
    arrange: (main) => {
      runLedger(main, ['open', 'demo']);
      fs.rmSync(ledgerOf(main));
    },
    stderr: /^$/,
  },
  {
    label: 'a ledger holding records with no pointer',
    arrange: (main) => {
      runLedger(main, ['open', 'demo']);
      runLedger(main, ['append', 'demo', 'resolve'], 'RESOLVE: none\n');
      fs.rmSync(pointerOf(main));
    },
    stderr: /^$/,
  },
  {
    label: 'a pointer stamped in the future beside a ledger holding records',
    arrange: (main) => {
      fs.mkdirSync(runsDirOf(main), { recursive: true });
      fs.writeFileSync(ledgerOf(main), `${LEDGER_HEADER}\ndemo resolve RESOLVE: none\n`);
      fs.writeFileSync(pointerOf(main), `demo@2099-01-01T00:00:00Z ${ledgerOf(main)}\n`);
    },
    stderr: /^run-ledger: open: replacing existing pointer for run-id demo\n$/,
  },
];

for (const { label, arrange, stderr } of REPLACEABLE_LEFTOVERS) {
  test(`Given ${label}, when open demo runs, then it exits 0, the ledger holds the header alone and the pointer names a fresh run-key`, () => {
    withRepo(({ main }) => {
      arrange(main);
      const sut = runLedger;

      const result = sut(main, ['open', 'demo']);

      const [key] = result.stdout.trim().split(' ');
      assert.strictEqual(result.status, 0);
      assert.match(result.stderr, stderr);
      assert.match(key, RUN_KEY_PATTERN);
      assert.strictEqual(fs.readFileSync(ledgerOf(main), 'utf8'), `${LEDGER_HEADER}\n`);
      assert.strictEqual(fs.readFileSync(pointerOf(main), 'utf8'), `${key} ${ledgerOf(main)}\n`);
    });
  });
}
```

Run the two-file gate now: exactly RED 1.1, 1.2 and 1.3 fail, with the reasons above;
everything else passes. Any other failure is a blocker, not something to fix here.

**GREEN 1 — the refusal.** Three edits in scripts/run-ledger.sh:

1. After L24 (`readonly UTC_STAMP_FORMAT=…`):

```bash
readonly OPEN_RUN_EXIT=3
```

2. After `warn_if_replacing` (after its closing `}`, L160 before edit 1, one blank line
   between):

```bash
# A run stays open from `open` to `close`: no process outlives a tool call, so
# whether an open run is dead is the user's call, never this script's.
refuse_if_open() {
  local run_id="$1"
  load_trusted_pointer "$run_id" && [ -f "$ledger" ] || return 0
  die "open: run-id $run_id is already open since ${key#*@} (ledger $ledger); refusing to discard it" "$OPEN_RUN_EXIT"
}
```

3. In `cmd_open`, one new line right after `sweep_stale_pointers`:

```bash
  refuse_if_open "$run_id"
```

No other change: no comment on the call line, `warn_if_replacing` and its call stay. The
message never prints `<run-id>@<iso>` (only `since <iso>`), and it carries no `close`
hint on purpose — discarding is the user's call. Under `set -e`, the
`load_trusted_pointer … && [ -f … ] || return 0` list does not trip errexit.

Run the gate: all tests pass (probe: 117/117), `shellcheck scripts/run-ledger.sh` clean
(no SC2154: `key` and `ledger` are assigned in `read_pointer`).

**REFACTOR 1.** None expected: `refuse_if_open` is four lines and reuses
`load_trusted_pointer`, the same predicate `locate_by_run` uses. Confirm no `S3`/`S5`-style
row ids or design references slipped into test titles or comments.

### Gate

```bash
node --test test/run-ledger.test.js test/run-record.test.js 2>&1 | tail -15
shellcheck scripts/run-ledger.sh
```

### Commit

`fix(scripts): refuse open on a run-id that is still open`

## Part 2 — A refused `open` is a STOP: run skill §0 step 4 and the run-record spec

### Context

Working directory: the worktree root (`<worktree>`).
Part 1 has landed: `run-ledger.sh open` now exits 3, prints nothing on stdout and writes
nothing when the run-id's trusted pointer and ledger both exist; its stderr line is
`run-ledger: open: run-id <id> is already open since <iso> (ledger <path>); refusing to discard it`.
An untrusted leftover pointer (e.g. a future stamp) is still replaced with the
`replacing existing pointer` warning. This part changes prose and its pins only.

Files this part touches (exactly three):

1. `skills/run/SKILL.md` — EDIT: one new paragraph in §0 step 4.
2. `docs/contributing/specs/run-record.md` — EDIT: five passages.
3. `test/run-record.test.js` — EDIT: three new tests.

**skills/run/SKILL.md §0 step 4** (L129–170; `### Run-record tokens` follows at L172).
L129 `4. Open the **run record** — …`; L141–150 the fenced call block, which holds
`"$ledger" open <run-id> && "$ledger" append <run-id> resolve <<'EOF'` (the `&&` already
stops the seeded lines on refusal; do not change the call); L152–153, verbatim:

```markdown
   Never silence `open`'s stdout: the run-key it prints into this session's transcript
   is what binds the compaction hooks to this run.
```

L154 blank; L155 `   **Flush-per-line.** …`. The step-4 body is indented three spaces;
step 4 is the last numbered step of §0 (the next `^## ` heading is `## Phase walk` at
L187).

**docs/contributing/specs/run-record.md** — the passages to change, verbatim today:

- `## The absent-file case` (L144), body L146–148:
  `` `run-ledger.sh open` writes the ledger fresh — the header line is appended first, then ``
  / `` the seeded `Resolution.record[]` entries from §1c — through a temp file and a rename, so a ``
  / `leftover from a crashed attempt of the same topic never leaks into the new run.`
- `## Write cadence and the single-writer rule` (L155), item 1 at L162–163:
  `` 1. **`open`, at §0 step 4.** Creates the ledger and the pointer and appends the seeded ``
  / `` `Resolution.record[]` lines in the same call. ``
- `## Failure posture` (L194), body L196–198, ends with
  ``failed `save` (ADR-120): a write failure never blocks delivery work.``
- `## Inherited edges` (L200), **Run-id collision.** paragraph L202–207 (its sentences
  from "`open` on an id already in use discards that id's ledger" to "a live run of that
  topic loses its ledger." go); **Resume double-`Done`.** L209–212 stays byte-identical;
  **Pointer replacement.** L214–217.
- The next heading `## Ledger vs. store` (L219) ends the Inherited-edges region.

**test/run-record.test.js** (412 lines). Line numbers below are pre-edit; once RED 2.1
lands, everything after L83 shifts down, so place later tests by title, not number.
Read-only anchors:

- L7–12 constants: `RUN_SKILL_PATH`, `RUN_RECORD_SPEC_PATH`; L46–63
  `sliceRegion(content, startPattern, endPattern)` returns the lines from the start match
  up to (excluding) the end match, joined with one space — leading indentation survives,
  so the new tests normalise whitespace with `.replace(/\s+/gu, ' ')` and a pinned
  phrase may wrap across markdown lines. L65–66 module-level `runSkill` and
  `runRecordSpec` (file contents).
- L75–83: "Given skills/run/SKILL.md §0 step 4, when the open-record region is read, then it
  opens the ledger, flushes per line and seeds RESOLVE/AWAITING" — slices
  `sliceRegion(runSkill, /^4\. Open the \*\*run record\*\*/, /^## Phase walk/)`. The new
  skill test goes right after it (after L83).
- L247–255: "Given the run-record spec, when the inherited-edges section is read, then the
  run-id-collision edge is documented there" — asserts `/collision/iu` and
  `/decay-merges against the run-start/u` on the Inherited-edges region. Keep the word
  "collision" and the Resume double-`Done` paragraph. The two new spec tests go right
  after it (after L255).
- ~L397–412: the verb-set test (see the prose trap in "Binding for every part").
- File style: the existing tests here name the result `result` with no `sut`; the new
  tests add `const sut = sliceRegion;` (or a small `sut` closure) to meet the GWT/AAA/`sut`
  convention while keeping `result`.

### TDD steps

**RED 2.1 — the skill names the STOP.** Insert after L83. Fails today on its first
assertion: "expected the refused-open paragraph" (the step-4 region has no such text).

```js
test("Given skills/run/SKILL.md §0 step 4, when the open-record region is read, then a refused open is a STOP whose only discard path is close on the user's choice", () => {
  const sut = sliceRegion;

  const result = sut(runSkill, /^4\. Open the \*\*run record\*\*/, /^## Phase walk/).replace(/\s+/gu, ' ');

  assert.ok(result.includes('**A refused `open` is a STOP.**'), 'expected the refused-open paragraph');
  assert.ok(result.includes('`open` exits 3'), 'expected the refusal exit code');
  assert.ok(result.includes("would append this run's lines to that run's ledger"), 'expected the reason a refused run cannot continue');
  assert.ok(result.includes('run-ledger.sh close <run-id>'), 'expected the discard path');
  assert.ok(result.includes('Never run `close` without the user choosing option 2'), 'expected the user-only discard rule');
});
```

**GREEN 2.1.** In skills/run/SKILL.md, insert after L153 (the "Never silence `open`'s
stdout" paragraph), keeping one blank line before and after, so it precedes
`**Flush-per-line.**`:

```markdown
   **A refused `open` is a STOP.** `open` exits 3 when the run-id is already open: another
   run of this topic is live, or crashed without `close`. This is not a failed append:
   continuing would append this run's lines to that run's ledger under the same run-id,
   and the `&&` above already keeps the seeded lines out of it. STOP with the blocker
   `{ resolve, reason: "run-id <slug> already open since <iso>", options }`:

   1. **Stop here.** The run is live: continue it in its own session.
   2. **Discard it.** The run is dead: run `run-ledger.sh close <run-id>`, then re-run
      this step's call unchanged. A leftover `../<repo>-<slug>` worktree or `*/<slug>`
      branch still hits `craft:workspace`'s collision STOP.
   3. **Re-slug.** Re-run step 3 with a different topic slug.

   Never run `close` without the user choosing option 2. Until then, append nothing for
   this run and never continue the walk.
```

**RED 2.2 — the spec's inherited edges stop promising a discard.** Insert after L255.
Fails today on its first assertion: "the discard wording must be gone" (L207 still says a
live run of that topic loses its ledger).

```js
test('Given the run-record spec, when the inherited-edges section is read, then an open run-id is refused and only an untrusted leftover pointer is replaced', () => {
  const spec = fs.readFileSync(RUN_RECORD_SPEC_PATH, 'utf8');
  const sut = sliceRegion;

  const result = sut(spec, /^## Inherited edges/u, /^## /u).replace(/\s+/gu, ' ');

  assert.ok(!result.includes('a live run of that topic loses its ledger'), 'the discard wording must be gone');
  assert.ok(!result.includes("discards that id's ledger"), 'the discard wording must be gone');
  assert.ok(result.includes('refuses with exit 3 and touches neither file'), result);
  assert.ok(result.includes('can bind no run'), result);
});
```

**GREEN 2.2.** In docs/contributing/specs/run-record.md:

- Run-id collision: keep its first sentence up to "already carries repeat records for
  one id." and replace the rest of the paragraph, from "`open` on an id already in use"
  to "loses its ledger.", with:

```markdown
While the first run is open
— its trusted pointer and its ledger exist, from `open` to `close` — `open` on the same id
refuses with exit 3 and touches neither file. No process outlives a tool call, so nothing
tells a live run from a crashed one: the orchestrator STOPs (§0 step 4) and the user
chooses stop, discard (`close`, then `open`) or re-slug. A second run of the same topic
never inherits the first one's lines, and never discards them unasked.
```

- Pointer replacement: replace the whole paragraph (L214–217) with:

```markdown
**Pointer replacement.** `run-ledger.sh open` on a `<run-id>` whose leftover pointer is
untrusted (a stamp in the future, say) replaces it and writes one stderr line saying so.
Such a pointer can bind no run — `locate` and `append` refuse it — so replacing it
discards nothing live.
```

- Leave **Resume double-`Done`.** untouched (pinned by the L247 test).

**RED 2.3 — absent-file, write cadence and failure posture state the refusal.** Insert
right after RED 2.2's test. Fails today on its first assertion: the absent-file region
still says "leftover from a crashed attempt of the same topic".

```js
test('Given the run-record spec, when the absent-file, write-cadence and failure-posture sections are read, then each states the refusal of an open run-id', () => {
  const spec = fs.readFileSync(RUN_RECORD_SPEC_PATH, 'utf8');
  const sut = (heading) => sliceRegion(spec, heading, /^## /u).replace(/\s+/gu, ' ');

  const absentFile = sut(/^## The absent-file case/u);
  const cadence = sut(/^## Write cadence/u);
  const posture = sut(/^## Failure posture/u);

  assert.ok(absentFile.includes('a leftover ledger with no open pointer'), absentFile);
  assert.ok(cadence.includes('exit 3, nothing written'), cadence);
  assert.ok(posture.includes('A refused `open` (exit 3) is not a write failure'), posture);
});
```

**GREEN 2.3.** In docs/contributing/specs/run-record.md:

- The absent-file case, L146–148 become:

```markdown
`run-ledger.sh open` writes the ledger fresh — the header line is appended first, then
the seeded `Resolution.record[]` entries from §1c — through a temp file and a rename, so a
leftover ledger with no open pointer never leaks into the new run. A run-id that is still
open is refused, never overwritten (see Inherited edges).
```

- Write cadence item 1, L162–163 become:

```markdown
1. **`open`, at §0 step 4.** Creates the ledger and the pointer and appends the seeded
   `Resolution.record[]` lines in the same call. It refuses — exit 3, nothing written — a
   run-id whose trusted pointer and ledger exist; see Inherited edges.
```

- Failure posture: after its last line ("…a write failure never blocks delivery work."),
  add a blank line and:

```markdown
A refused `open` (exit 3) is not a write failure: the orchestrator STOPs, because a run
that continued would append into the other run's ledger.
```

**GUARD 2.4 — unchanged pins stay green.** The L75 step-4 test (call, flush-per-line,
RESOLVE/AWAITING tokens), the L247 inherited-edges test (`collision`, double-`Done`) and
the verb-set test (only `open`/`close` follow `run-ledger.sh` in the new prose) pass
before and after this part. Run the gate after each GREEN; probe result after GREEN 2.3:
120/120.

**REFACTOR 2.** None expected. Re-read the new spec sentences against the "Binding"
list: no ADR numbers in the new text, no `run-ledger.sh <non-verb>`, no
`${CLAUDE_PLUGIN_ROOT}` added to the skill, no prose-lint ban-list word.

### Gate

```bash
node --test test/run-ledger.test.js test/run-record.test.js 2>&1 | tail -15
shellcheck scripts/run-ledger.sh
```

Phase gate after this part (orchestrator):
`out=$(mktemp); bash scripts/ci.sh > "$out" 2>&1; echo "exit $?"; tail -20 "$out"`.

### Commit

`docs(skills): make a refused open a STOP and drop the discard wording from the run-record spec`
