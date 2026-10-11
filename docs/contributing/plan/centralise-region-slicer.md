# Plan — centralise-region-slicer

> Source: design doc `docs/contributing/design/centralise-region-slicer.md` · ADRs `472, 473`
> (both take the design's recommended options: DC-1 (b) two functions over one core,
> `sliceRegion` faithful and `sliceProse` normalised; DC-2 (b) `FROM_TOP` / `TO_END` Symbol
> sentinels, a wrong-type boundary throws `TypeError`, a given-but-missing pattern fails
> through `node:assert`)
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

## Plan shape (3 parts, sequential, one working tree `test/centralise-region-slicer`)

| # | Part | src delta | Files |
|---|---|---|---|
| 1 | Shared region-slicer helper and its unit suite | none (test helper) | new `test/helpers/region-slice.js`, new `test/region-slice.test.js` |
| 2 | Prose callers move to `sliceProse` | none (test refactor) | `test/run-record.test.js`, `test/model-retry-token.test.js` |
| 3 | Faithful callers move to `sliceRegion` | none (test refactor) | `test/concepts-frames.test.js`, `test/auto-compaction-docs.test.js` |

The whole change is test-only (design R8): no `engine/`, `adapters/`, `skills/` or guide
prose is touched. Part 1 is test infrastructure with no implementation part to fold into, so
it stands alone. Parts 2 and 3 depend only on Part 1 and touch disjoint files; they run
sequentially here because the parts share one working tree.

Every edit below was applied to a `git archive HEAD` throwaway copy of `f997381` (suites
unchanged since the design's `cc54aa9`) and checked there:

| Suite | Baseline (HEAD) | After its part |
|---|---|---|
| `test/region-slice.test.js` | absent | 12 / 0 fail |
| `test/every-test-file-registers.test.js` | 16 | 16 |
| `test/run-record.test.js` | 49 | 49 |
| `test/model-retry-token.test.js` | 10 | 10 |
| `test/concepts-frames.test.js` | 7 | 7 |
| `test/auto-compaction-docs.test.js` | 7 | 7 |

The red-check the design marks optional was also run in that throwaway: with
`## Rosetta stone` and every later `##` heading deleted from docs/guides/concepts.md, the
migrated concepts-frames suite fails with `region end /^## / not found — heading renamed?`
(5 pass / 2 fail). On HEAD the same deletion passes by widening.

## Public-surface decision

The new module `test/helpers/region-slice.js` exports five symbols: `FROM_TOP`, `TO_END`,
`sliceRegion`, `sliceProse` and `normaliseWhitespace`. All five are **internal** to the root
process test tree. Only `test/*.test.js` suites `require` them. They are not in any package
entry, barrel, README surface, generated API report or registry, so no surface gate applies.
The new suite `test/region-slice.test.js` needs no registration either: `scripts/ci.sh`
finds it through `run_suite process test` (a `find test -name '*.test.js'`), and
`test/every-test-file-registers.test.js` checks only that it registers at least one test.

## Decision candidates

None. Both load-bearing choices (output shape, boundary spelling) are ratified by ADR 472 and
ADR 473, and the plan follows them without deviation. Two details the design left implicit
are fixed by the tests below, not by a decision:

- Start is validated before end. `sliceRegion(content)` with no boundaries throws the
  start `TypeError`, as the start-type test asserts.
- The design's item 6 (`FROM_TOP`) and item 7 (wrong-type start and end) are each split into
  two tests, one assertion focus each. The suite has 12 tests.

## Part 1 — Shared region-slicer helper and its unit suite

### Context

**What changes.** A new CommonJS helper module slices a markdown string between two line
boundaries and fails loud when a given boundary is missing. Its unit suite is written first.
Nothing else changes in this part; the four process suites keep their local slicers until
Parts 2 and 3.

**Files.**

- `test/helpers/region-slice.js` (new). Model the header on test/helpers/tmp-git-repo.js:
  `'use strict';`, the `require`s, one leading why-comment, `module.exports = { … }` last.
  The file name must NOT end in ".test.js". test/every-test-file-registers.test.js walks
  the test dir (including test/helpers, only `fixtures` dirs are excluded) and requires every
  *.test.js file to register a test.
- `test/region-slice.test.js` (new). It imports with
  `require('./helpers/region-slice')`, the same style as test/docs-structure-lint.test.js:8.

**Contract (ADR 472, ADR 473).**

```
sliceRegion(content, start, end) → string     lines [startIdx, endIdx) joined with '\n'
sliceProse(content, start, end)  → normaliseWhitespace(sliceRegion(content, start, end))
normaliseWhitespace(text)        → text.replace(/\s+/g, ' ')   (no trim)
start: RegExp | FROM_TOP          end: RegExp | TO_END
```

- `FROM_TOP` → startIdx `0`, and the end is searched from line `0`. A `RegExp` start →
  first matching line. A miss fails `assert.notEqual(idx, -1, …)` with
  `region start <pattern> not found — heading renamed?`.
- `TO_END` → endIdx `lines.length`. A `RegExp` end is searched over
  `lines.slice(searchFrom)`, where `searchFrom = startIdx + 1` (so `/^## /` never closes the
  region on its own `## …` start line). A miss fails with
  `region end <pattern> not found — heading renamed?` even though EOF is reachable. Nothing
  ever widens to EOF unless the caller passed `TO_END`.
- Any other boundary value (`null`, `undefined`, an omitted argument, a string) throws
  `TypeError('region start must be a RegExp or FROM_TOP')` or
  `TypeError('region end must be a RegExp or TO_END')`. Start is checked first.
- Assumed (design): no boundary carries the `g` or `y` flag; not guarded.
- Message prefixes are the same bytes as today's run-record slicer
  (test/run-record.test.js:56 and :60). `${pattern}` renders a RegExp as `/…/flags`.

**Final module** (verified green in the throwaway):

```js
'use strict';
const assert = require('node:assert');

// A section-scoped pin must fail when its boundary heading is renamed: widening
// a missing boundary to the whole file would turn the pin into a whole-file grep
// that passes for the wrong reason. So "from the top" and "to the end" are
// sentinels the caller states, never what a missing argument falls back to.
const FROM_TOP = Symbol('region: from the top of the file');
const TO_END = Symbol('region: to the end of the file');

const LINE_BREAK = '\n';
const WHITESPACE_RUN = /\s+/g;
const SINGLE_SPACE = ' ';
const NOT_FOUND = -1;
const FIRST_LINE = 0;

function normaliseWhitespace(text) {
  return text.replace(WHITESPACE_RUN, SINGLE_SPACE);
}

function startIndexOf(lines, start) {
  if (start === FROM_TOP) return FIRST_LINE;
  if (!(start instanceof RegExp)) throw new TypeError('region start must be a RegExp or FROM_TOP');
  const startIdx = lines.findIndex((line) => start.test(line));
  assert.notEqual(startIdx, NOT_FOUND, `region start ${start} not found — heading renamed?`);
  return startIdx;
}

// The end is searched from the line after the start, so a generic end such as
// /^## / never closes the region on its own start heading.
function endSearchFrom(start, startIdx) {
  return start === FROM_TOP ? FIRST_LINE : startIdx + 1;
}

function endIndexOf(lines, searchFrom, end) {
  if (end === TO_END) return lines.length;
  if (!(end instanceof RegExp)) throw new TypeError('region end must be a RegExp or TO_END');
  const relativeEnd = lines.slice(searchFrom).findIndex((line) => end.test(line));
  assert.notEqual(relativeEnd, NOT_FOUND, `region end ${end} not found — heading renamed?`);
  return searchFrom + relativeEnd;
}

function sliceRegion(content, start, end) {
  const lines = content.split(LINE_BREAK);
  const startIdx = startIndexOf(lines, start);
  const endIdx = endIndexOf(lines, endSearchFrom(start, startIdx), end);
  return lines.slice(startIdx, endIdx).join(LINE_BREAK);
}

// Prose pins quote sentences that word-wrap and indent across markdown lines;
// collapsing whitespace lets such a sentence match as one phrase.
function sliceProse(content, start, end) {
  return normaliseWhitespace(sliceRegion(content, start, end));
}

module.exports = { FROM_TOP, TO_END, sliceRegion, sliceProse, normaliseWhitespace };
```

**Final suite** (verified 12/12 in the throwaway). Root-suite house style: `'use strict'`,
`node:test` + `node:assert`, Given/When/Then titles, AAA blocks separated by a blank line,
`const sut = <function>` then `const result = sut(…)`, named constants, no provenance
references in comments.

```js
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');

const { FROM_TOP, TO_END, sliceRegion, sliceProse, normaliseWhitespace } = require('./helpers/region-slice');

const FIXTURE = [
  'Preamble line',
  '## First',
  '- <https://example.com/one>',
  '- <https://example.com/two>',
  '## Second',
  '- a bullet whose phrase wraps',
  '  across an indented continuation',
].join('\n');
const FIRST_SECTION = ['## First', '- <https://example.com/one>', '- <https://example.com/two>'].join('\n');
const SECOND_SECTION = ['## Second', '- a bullet whose phrase wraps', '  across an indented continuation'].join('\n');
const TOP_LINE = 'Preamble line';

const ANY_HEADING = /^## /u;
const FIRST_HEADING = /^## First$/u;
const SECOND_HEADING = /^## Second$/u;
const ABSENT_HEADING = /^## Absent$/u;
const TOP_LINE_PATTERN = /^Preamble line$/u;
const URL_BULLET = /^- <https?:/gmu;
const URL_BULLET_COUNT = 2;
const WRAPPED_PHRASE = 'a bullet whose phrase wraps across an indented continuation';

const START_NOT_FOUND = /region start .* not found — heading renamed\?/u;
const END_NOT_FOUND = /region end .* not found — heading renamed\?/u;
const START_WRONG_TYPE = { name: 'TypeError', message: 'region start must be a RegExp or FROM_TOP' };
const END_WRONG_TYPE = { name: 'TypeError', message: 'region end must be a RegExp or TO_END' };

const WRONG_TYPE_END_CALLS = [
  ['omitted', (sut) => sut(FIXTURE, FIRST_HEADING)],
  ['undefined', (sut) => sut(FIXTURE, FIRST_HEADING, undefined)],
  ['null', (sut) => sut(FIXTURE, FIRST_HEADING, null)],
];
const WRONG_TYPE_START_CALLS = [
  ['omitted', (sut) => sut(FIXTURE)],
  ['undefined', (sut) => sut(FIXTURE, undefined, SECOND_HEADING)],
  ['null', (sut) => sut(FIXTURE, null, SECOND_HEADING)],
];

test('Given a start and an end pattern, when the region is sliced, then it includes the start line and excludes the end line', () => {
  const sut = sliceRegion;

  const result = sut(FIXTURE, FIRST_HEADING, SECOND_HEADING);

  assert.strictEqual(result, FIRST_SECTION);
});

test('Given an end pattern that also matches the start line, when the region is sliced, then it ends at the next matching line', () => {
  const sut = sliceRegion;

  const result = sut(FIXTURE, FIRST_HEADING, ANY_HEADING);

  assert.strictEqual(result, FIRST_SECTION);
});

test('Given a start pattern that matches no line, when the region is sliced, then it fails naming the missing start', () => {
  const sut = sliceRegion;

  const act = () => sut(FIXTURE, ABSENT_HEADING, ANY_HEADING);

  assert.throws(act, START_NOT_FOUND);
});

test('Given an end pattern that matches no line after the start, when the region is sliced, then it fails instead of widening to the end of the file', () => {
  const sut = sliceRegion;

  const act = () => sut(FIXTURE, FIRST_HEADING, ABSENT_HEADING);

  assert.throws(act, END_NOT_FOUND);
});

test('Given an end boundary that is neither a RegExp nor TO_END, when the region is sliced, then it throws a TypeError', () => {
  const sut = sliceRegion;

  for (const [label, call] of WRONG_TYPE_END_CALLS) {
    assert.throws(() => call(sut), END_WRONG_TYPE, label);
  }
});

test('Given a start boundary that is neither a RegExp nor FROM_TOP, when the region is sliced, then it throws a TypeError', () => {
  const sut = sliceRegion;

  for (const [label, call] of WRONG_TYPE_START_CALLS) {
    assert.throws(() => call(sut), START_WRONG_TYPE, label);
  }
});

test('Given a region of bullet lines, when it is sliced faithfully, then a multiline anchor counts every bullet', () => {
  const sut = sliceRegion;

  const result = sut(FIXTURE, FIRST_HEADING, ANY_HEADING);

  assert.strictEqual(result.match(URL_BULLET).length, URL_BULLET_COUNT);
});

test('Given TO_END as the end boundary, when the region is sliced, then it runs to the last line', () => {
  const sut = sliceRegion;

  const result = sut(FIXTURE, SECOND_HEADING, TO_END);

  assert.strictEqual(result, SECOND_SECTION);
});

test('Given FROM_TOP as the start boundary, when the region is sliced, then it starts at the first line', () => {
  const sut = sliceRegion;

  const result = sut(FIXTURE, FROM_TOP, FIRST_HEADING);

  assert.strictEqual(result, TOP_LINE);
});

test('Given FROM_TOP and an end pattern matching the first line, when the region is sliced, then the end is searched from the first line', () => {
  const sut = sliceRegion;

  const result = sut(FIXTURE, FROM_TOP, TOP_LINE_PATTERN);

  assert.strictEqual(result, '');
});

test('Given a bullet that wraps onto an indented continuation, when the region is sliced as prose, then the phrase matches as one', () => {
  const sut = sliceProse;

  const result = sut(FIXTURE, SECOND_HEADING, TO_END);

  assert.ok(result.includes(WRAPPED_PHRASE), result);
});

test('Given a mixed run of spaces, tabs and newlines, when whitespace is normalised, then the run collapses to one space', () => {
  const sut = normaliseWhitespace;

  const result = sut('a \t\n  b');

  assert.strictEqual(result, 'a b');
});
```

The fixture is built so each test discriminates. The URL bullets sit in the FIRST section,
so the faithful test needs no sentinel. A `' '` join would leave `^` matching only at
string start (`## First`), giving 0 bullets instead of 2. The wrapped bullet is in the
SECOND section, which runs to EOF, so the prose test uses `TO_END`.

### TDD steps

Each step adds the tests it names, plus only the constants those tests use. The final file
is the one shown in Context.

1. **RED 1: the boundary core, fail-loud misses, type guard, faithful join.** Create
   `test/region-slice.test.js` with the `require` line and the first seven tests: start/end
   include-exclude; end matching the start line; start not found; end not found; end
   wrong-type; start wrong-type; multiline-anchor bullet count. Run
   `node --test test/region-slice.test.js`. It fails with
   `Error: Cannot find module './helpers/region-slice'`. Node reports the whole file as 1
   failing test (`# tests 1`, `# fail 1`).

2. **GREEN 1: `sliceRegion` over RegExp boundaries.** Create `test/helpers/region-slice.js`
   with `startIndexOf` and `endIndexOf`, each holding only its type guard + `findIndex` +
   `assert.notEqual`. Add `sliceRegion` with `searchFrom = startIdx + 1`, joining with
   `'\n'`, and `module.exports = { sliceRegion }`. The guards are needed here: without them,
   `null.test` throws a `TypeError` whose message ("Cannot read properties of null") fails
   the exact-message assertion. Run: 7 pass / 0 fail.

3. **RED 2: the sentinels.** Add the `TO_END`, `FROM_TOP` and FROM_TOP-end-searched-from-
   line-0 tests. They fail because `FROM_TOP` and `TO_END` are not exported (they
   destructure to `undefined`). The guards then throw
   `'region end must be a RegExp or TO_END'` (TO_END test) and
   `'region start must be a RegExp or FROM_TOP'` (both FROM_TOP tests). Verified: 7 pass /
   3 fail.

4. **GREEN 2: sentinel branches.** Add the two `Symbol` constants. Add the `FROM_TOP` branch
   in `startIndexOf` (returns `FIRST_LINE`) and the `TO_END` branch in `endIndexOf` (returns
   `lines.length`). Add `endSearchFrom(start, startIdx)` (`FIRST_LINE` under `FROM_TOP`,
   else `startIdx + 1`) and export both sentinels. Run: 10 pass / 0 fail.

5. **RED 3: prose shape and normalisation.** Add the `sliceProse` and `normaliseWhitespace`
   tests. They fail with `sut is not a function`: neither name is exported yet. Verified:
   10 pass / 2 fail.

6. **GREEN 3: `normaliseWhitespace` + `sliceProse`.** Add both functions as in the final
   module and export all five names. Run: 12 pass / 0 fail.

7. **REFACTOR.** Match the final module: the single leading why-comment (why a miss must
   not widen), the two short why-comments on `endSearchFrom` and `sliceProse`, and named
   constants (`LINE_BREAK`, `WHITESPACE_RUN`, `SINGLE_SPACE`, `NOT_FOUND`, `FIRST_LINE`).
   No function longer than 20 lines, nesting ≤ 1, no boolean parameters, no comment citing
   an ADR, design or backlog id. Re-run the gate. `git --no-pager diff --no-ext-diff --stat`
   lists exactly the two new files.

### Gate

```bash
node --test test/region-slice.test.js test/every-test-file-registers.test.js > "$TMPDIR/p1-gate.log" 2>&1; echo "exit $?"
grep -E '^# (tests|pass|fail)' "$TMPDIR/p1-gate.log"
```

Expected: exit 0, `# pass 28`, `# fail 0` (12 region-slice + 16 every-test-file-registers).
The phase gate `bash scripts/ci.sh` runs at the phase boundary, not in this part.

### Commit

`test(helpers): add a fail-loud markdown region slicer`

## Part 2 — Prose callers move to `sliceProse`

### Context

**What changes.** The two suites whose pins quote word-wrapped or indented prose drop their
local slicers and import `sliceProse` from the Part 1 helper. Behaviour is preserved: no
assertion body changes beyond removing three `.replace(/\s+/gu, ' ')` calls that
`sliceProse` makes redundant. Test counts stay at 49 and 10.

**Why the output is unchanged.**

- run-record joined with `' '` (test/run-record.test.js:63). `sliceProse` joins with `'\n'`
  and collapses every `\s+` run to `' '`. The design's output-shape matrix pinned run-record
  at 49/0 under the normalised shape.
- model-retry-token already joined with `' '` and then applied `normaliseWhitespace`
  (:61). `\s` covers `\n`, so the result is byte-identical.
- Dropping `.replace(/\s+/gu, ' ')` after `sliceProse` is the identity: the input already
  has no whitespace run longer than one space, and `\s` is the same class with or without
  `u`.
- run-record :58/:62 widened on a falsy end. `TO_END` makes those 11 sites state EOF, and
  `FROM_TOP` does the same for the one `null` start.

**Files (line numbers at HEAD `f997381`).**

- `test/run-record.test.js`
  - Insert after :6 (`const path = require('node:path');`):
    `const { FROM_TOP, TO_END, sliceProse } = require('./helpers/region-slice');`
  - Delete :46-65: the why-comment :46-49, `function sliceRegion` :50-64 (with its inner
    comment :53-55), and the trailing blank :65. Line :66 `const runSkill = …` then follows
    the blank :45 directly.
  - :70 `sliceRegion(runSkill, null, /^## Phase walk/)` →
    `sliceProse(runSkill, FROM_TOP, /^## Phase walk/)`.
  - End `null` → `TO_END` at the 11 sites :150 :175 :188 :195 :201 :208 :298 :305 :313 :321
    (all `/^## Done/`) and :328 (`/^Final message:/`).
  - Rename every remaining `sliceRegion` identifier to `sliceProse`: 29 call sites in all,
    including the aliases `const sut = sliceRegion;` at :86 and :274 and the arrow at :286.
  - Drop the trailing `.replace(/\s+/gu, ' ')` at :88, :276 and :286.
  - Leave :101 `runRecordSpec.replace(/\s+/g, ' ')` untouched. It normalises a whole file,
    not a slice.
  - After: `grep -c 'sliceRegion\|, null)' test/run-record.test.js` → 0. The file loses
    19 lines net (20 deleted, 1 inserted).
- `test/model-retry-token.test.js`
  - Insert after :5 (`const path = require('node:path');`):
    `const { normaliseWhitespace, sliceProse } = require('./helpers/region-slice');`
  - Delete :48-63: local `function normaliseWhitespace` :48-50, blank :51, why-comment
    :52-54, `function sliceRegion` :55-62, and blank :63. Line :47 (blank after
    `const CHAIN_END`) is then followed directly by `function resolutionChainOf` (was :64).
  - `sliceRegion(` → `sliceProse(` at the 5 sites :78 (`invariantBullet`), :80
    (`transientRetryBullet`), :135, :147 and :150.
  - Keep `normaliseWhitespace(` at :65 (`resolutionChainOf`), :129 and :166 unchanged.
    They now resolve to the import. `resolutionChainOf` stays in this suite (design: out of
    scope).
  - `assert` stays required. `resolutionChainOf` and the tests still use it.

Read-only reference: test/helpers/region-slice.js (Part 1) for the contract.

### TDD steps

No RED step exists here: this is a behaviour-preserving migration, and making a test fail
first would mean breaking code. The suites guard the behaviour.

1. **GUARD 0: baseline.** Before editing, run
   `node --test test/run-record.test.js test/model-retry-token.test.js` and record 59 pass
   / 0 fail (49 + 10). These suites pass now and must pass unchanged after GREEN.

2. **GREEN 1: migrate `test/run-record.test.js`.** Apply the edits listed in Context. Make
   the call-site edits before the insert and the deletion, or recompute line numbers after
   them: lines past :65 end up 19 lower (+1 for the import, -20 for the deletion). Run `node --test test/run-record.test.js`: 49 pass / 0 fail.

3. **GREEN 2: migrate `test/model-retry-token.test.js`.** Apply the edits listed in
   Context. Run `node --test test/model-retry-token.test.js`: 10 pass / 0 fail.

4. **REFACTOR.** `grep -n 'function sliceRegion\|function normaliseWhitespace\|sliceRegion'
   test/run-record.test.js test/model-retry-token.test.js` returns nothing. No leftover
   double blank line where the functions were. No comment cites an ADR, design or backlog id.
   `git --no-pager diff --no-ext-diff --stat` lists exactly these two files, and the diff
   shows no assertion line changed except the three `.replace` removals.

### Gate

```bash
node --test test/run-record.test.js test/model-retry-token.test.js > "$TMPDIR/p2-gate.log" 2>&1; echo "exit $?"
grep -E '^# (tests|pass|fail)' "$TMPDIR/p2-gate.log"
```

Expected: exit 0, `# pass 59`, `# fail 0` (run-record 49 + model-retry-token 10, as on
HEAD).

### Commit

`refactor(test): slice run-record and model-retry prose with the shared helper`

## Part 3 — Faithful callers move to `sliceRegion`

### Context

**What changes.** The two suites that need real line breaks drop their local `sliceFrom`
and import `sliceRegion` from the Part 1 helper. Test counts stay at 7 and 7. No assertion
body changes. `sliceRegion` joins with `'\n'`, exactly like both `sliceFrom`s
(test/concepts-frames.test.js:34, test/auto-compaction-docs.test.js:88). That keeps the
`/^- <https?:/gm` Sources bullet count at concepts-frames :87 working.

**The one semantics change (intended).** Both local slicers silently widened to EOF when the
end pattern was given but not found (concepts-frames :33, auto-compaction-docs :87). They
now fail loud. Today every given end marker is found, so no test changes verdict:

| Call site | Start | End marker found at |
|---|---|---|
| concepts-frames :62 | README.md:52 | README.md:57 `## What craft is not` (`/^## /`) |
| concepts-frames :95 | docs/guides/concepts.md:186 | docs/guides/concepts.md:222 `## Rosetta stone` (`/^## /`) |
| concepts-frames :86 | docs/guides/concepts.md:241 | end `null` → `TO_END` (Sources is the last section) |
| auto-compaction-docs :102 | docs/guides/customizing.md:441 | docs/guides/customizing.md:465 `## 5. Tailor in one sitting` |

Note: the auto-compaction-docs end pattern is `/^#{2,3} /` (:105), not `/^## /`. The
design's "both generic `/^## /`" holds for concepts-frames only. The marker check above
still holds: no `##` or `###` heading sits between :441 and :465.

**Files (line numbers at HEAD `f997381`).**

- `test/concepts-frames.test.js`
  - Insert after :5 (`const path = require('node:path');`):
    `const { TO_END, sliceRegion } = require('./helpers/region-slice');`
  - Delete :21-36: the why-comment :21-24, `function sliceFrom` :25-35, and blank :36.
    `frameHeadingCount` (:17-19) and its blank :20 stay, followed directly by the first
    `test(` (was :37).
  - `sliceFrom(` → `sliceRegion(` at :62 and :95.
  - :86 `sliceFrom(concepts, /^## Sources$/, null)` →
    `sliceRegion(concepts, /^## Sources$/, TO_END)`.
  - `assert` stays required (the tests use it).
- `test/auto-compaction-docs.test.js`
  - Insert after :5 (`const path = require('node:path');`):
    `const { sliceRegion } = require('./helpers/region-slice');`
  - Delete :78-90: the why-comment :78-80, `function sliceFrom` :81-89, and blank :90.
    The blank :77 is then followed directly by `const GUIDE_TOKENS = [` (was :91).
  - `sliceFrom(` → `sliceRegion(` at :102.

Read-only reference: test/helpers/region-slice.js (Part 1) for the contract.

### TDD steps

No RED step against the worktree. Behaviour on today's docs is preserved, and the fail-loud
change can only be shown red by deleting doc headings, which this part must not do.

1. **GUARD 0: baseline.** Before editing, run
   `node --test test/concepts-frames.test.js test/auto-compaction-docs.test.js` and record
   14 pass / 0 fail (7 + 7). These suites pass now and must pass unchanged after GREEN.

2. **GREEN 1: migrate `test/concepts-frames.test.js`.** Apply the Context edits, making the
   call-site edits before the deletion (or recompute line numbers after it). Run it:
   7 pass / 0 fail.

3. **GREEN 2: migrate `test/auto-compaction-docs.test.js`.** Apply the Context edits. Run
   it: 7 pass / 0 fail.

4. **GUARD 1 (optional, throwaway only): fail loud now bites.** In a `mktemp -d` copy
   (`git archive HEAD | tar -x -C "$tmp"`, then copy the two migrated suites and the helper
   in), delete every `^## ` line from line 222 onward in docs/guides/concepts.md. Run
   `node --test test/concepts-frames.test.js` there. Expect a failure carrying
   `region end /^## / not found — heading renamed?` (verified at planning: 5 pass /
   2 fail). Never edit docs/guides/concepts.md in the worktree.

5. **REFACTOR.** `grep -n 'sliceFrom\|, null)' test/concepts-frames.test.js
   test/auto-compaction-docs.test.js` returns nothing. No leftover double blank line. No
   comment cites an ADR, design or backlog id. `git --no-pager diff --no-ext-diff --stat`
   lists exactly these two files, and no assertion line changed.

### Gate

```bash
node --test test/concepts-frames.test.js test/auto-compaction-docs.test.js > "$TMPDIR/p3-gate.log" 2>&1; echo "exit $?"
grep -E '^# (tests|pass|fail)' "$TMPDIR/p3-gate.log"
```

Expected: exit 0, `# pass 14`, `# fail 0` (concepts-frames 7 + auto-compaction-docs 7, as
on HEAD).

**Phase gate (after Part 3, at the phase boundary):**

```bash
bash scripts/ci.sh > "$TMPDIR/ci.log" 2>&1; echo "exit $?"
tail -n 40 "$TMPDIR/ci.log"
```

Expected: exit 0. ci.sh runs the full `test/` process suite (including the new
`test/region-slice.test.js` and every-test-file-registers) plus the static lints. The
stub-lint skips `test/*` paths, so the new helper is not stub-linted.

### Commit

`refactor(test): slice concepts-frames and auto-compaction regions with the shared helper`
