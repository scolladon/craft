# Design — normalize-findings-silent-field-loss

> Brief: `normalizeFindings` (`engine/src/findings.js`) drops or corrupts JSON fields with exit 0.
> (1) A canonical finding that also carries the legacy `suggested fix` key loses the fix.
> (2) A non-numeric `line` such as `"12x"` normalizes to `line: null`.
> Both break the module's fail-loud rule. Red tests first, one per defect, through
> `normalizeFindings` and one through the bin.
> Status: draft → self-reviewed ×3

## Context

### Surfaces

| Symbol | Location | Role here |
|---|---|---|
| `REQUIRED_JSON_FIELDS` | `engine/src/findings.js:60` | `['file','line','severity','finding']`, presence-checked only |
| `toFinding({ file, line, severity, finding, fix, status })` | `engine/src/findings.js:69` | Shared builder. `line: Number(line)`. Destructuring ignores every other key. `status` is passed through unvalidated on purpose (comment at `:77-78`) |
| `mapJsonItem(item, index)` | `engine/src/findings.js:99` | JSON path: non-object check, required-field presence, then `toFinding(item)` |
| `parseJsonShape(raw)` | `engine/src/findings.js:117` | `parsed.map(mapJsonItem)` |
| `parseLine(line)` | `engine/src/findings.js:134` | Per-line path. Builds its own object and calls `toFinding` at `:159` with `rawLine`, a `\d+` capture. Never sees extra keys or a non-digit line |
| `main(argv, io)` | `engine/src/normalize-findings-main.js` | Any `normalizeFindings` throw → stderr `normalize-findings: <message>`, exit 2 |
| Canonical shape | `contracts/harness-read.md:2` | `{ file, line, severity: CRITICAL\|HIGH\|MEDIUM\|LOW, finding, fix?, status?: … }` (ADR-667, ADR-668) |

Consumers of the bin: `skills/review/SKILL.md:47-50` (every reviewer output) and
`skills/validation/SKILL.md:181-188` (exit 0 → digest + filter; non-zero → `NON-CANONICAL`,
routed to the triager). The review skill has no exit-2 route.

### Pinned behaviour (probe, `node engine/bin/normalize-findings.js <file>`, 2026-10-21)

Run from a scratch directory against this worktree's `HEAD` (`dea964e`). Base object
`{"file":"a.js","severity":"HIGH","finding":"x", …}`.

`line` values (all exit 0):

| `line` | Output `line` | Verdict |
|---|---|---|
| `12`, `"12"`, `[12]`, `" 12 "` | `12` | `[12]` and `" 12 "` are coerced, not valid |
| `"12x"`, `"x"`, `{}`, `1e400` | `null` | **defect (2)**: `Number()` gives `NaN`/`Infinity`, `JSON.stringify` writes `null` |
| `""`, `"  "`, `null`, `false`, `[]` | `0` | silent corruption: `Number()` coerces to 0 |
| `true` | `1` | silent corruption |
| `"0x1A"`, `1e3` | `26`, `1000` | `"0x1A"` is a hex coercion; `1e3` is a legal JSON integer |
| `-3`, `1.5` | `-3`, `1.5` | not a line number |
| `9007199254740993` | `9007199254740992` | precision lost at `JSON.parse`, beyond `Number.MAX_SAFE_INTEGER` |
| `0` | `0` | per-line accepts `:0` too (below) |

Extra keys (base plus `"line":12`, all exit 0):

| Extra | Output |
|---|---|
| `"fix":"y","suggested fix":"z"` | `fix: "y"`; `"z"` dropped |
| `"suggested fix":"z"` | **no `fix` key**: defect (1) |
| `"file:line":"b.js:3"` | `file: "a.js"`; the alias is ignored |
| `"column":4` | dropped |
| `"fix":null`, `"status":null` | key omitted (pinned by `findings.test.js:196` and `:279`) |

Per-line grammar for comparison: `HIGH a.js:0 — x` → `line: 0`; `HIGH b.js:007 — y` → `line: 7`.
So the per-line path accepts exactly the decimal-digit strings, 0 and leading zeros included.

### Why the legacy keys still reach the parser

PR #89 (ADR-667) aligned the contract to the canonical shape and left the parser alone. Its design
doc scoped P3 (`suggested fix` beside canonical keys) and the general unknown-key case out:
`docs/contributing/design/reviewer-findings-shape-mismatch.md`, Out of scope. A model that keeps its
old habit, or a user `context:` file copied from the old wording, still emits the mixed object.

### House patterns this must follow

- **Fail loud, never drop silently.** `parseLineShape` throws on any unparseable line;
  `parseScopeSpec` rejects swallowed entries and requires `:*`. Each comment names the silent drop
  it prevents.
- **Exact error family.** JSON-item errors read `Finding at index ${index} …`, and the suite
  asserts them by exact equality (`findings.test.js:531-548`, `:559+`).
- **Interchangeability (ADR-019, ADR-277).** JSON and per-line inputs for the same finding produce
  byte-identical output. Key order is `file, line, severity, finding, fix?, status?`.
- **`status` is unvalidated** (`toFinding` comment; pinned by `findings.test.js:311`).

## Requirements

- R1 — A JSON finding carrying a key outside the accepted set exits 2 with a
  `Finding at index N …` message naming the key. The accepted set is chosen in D1, and it
  includes at least `suggested fix` and `file:line`. Defect (1) is closed either way.
- R2 — A JSON `line` that is not a valid line number exits 2 with a `Finding at index N …`
  message. Every corruption row in the `line` matrix above (`null`, `0`-from-coercion, `1`,
  hex, negative, fractional, unsafe) is rejected. Defect (2) is closed.
- R3 — Unchanged: canonical inputs with integer `line ≥ 0`, `fix: null`, `status: null`, any
  `status` string, the per-line path, and every existing test and fixture.
- R4 — Each new throw has one exact message string, asserted by equality.

## Design

All changes sit in the JSON path (`mapJsonItem`). `toFinding` and `parseLine` are not touched, so
the per-line path cannot regress.

```js
const REQUIRED_JSON_FIELDS = /** @type {const} */ (['file', 'line', 'severity', 'finding']);
// D1(a): every key the canonical shape names; anything else is a silent drop waiting to happen.
const ACCEPTED_JSON_FIELDS = new Set([...REQUIRED_JSON_FIELDS, 'fix', 'status']);
// D1(b) instead: the two keys the pre-ADR-667 contract taught, mapped to their replacement.
// const LEGACY_JSON_FIELDS = new Map([['file:line', 'file and line'], ['suggested fix', 'fix']]);
// D2(b) only: the per-line `\d+` grammar, so both shapes accept the same line text.
const DIGIT_STRING_PATTERN = /^\d+$/u;

function mapJsonItem(item, index) {
  // existing: not-an-object check, then REQUIRED_JSON_FIELDS presence
  rejectUnexpectedFields(item, index);
  return toFinding({ ...item, line: resolveJsonLine(item.line, index) });
}
```

Helpers (each ≤ 20 lines, early return, no boolean parameters):

| Helper | Input | Behaviour |
|---|---|---|
| `rejectUnexpectedFields(item, index)` | object with the required fields present | D1(a): throws on the first `Object.keys(item)` entry not in `ACCEPTED_JSON_FIELDS`. D1(b): throws on the first entry in `LEGACY_JSON_FIELDS`. Returns nothing (command) |
| `resolveJsonLine(value, index)` | raw `line` value | D2(a): `value` when `Number.isSafeInteger(value) && value >= 0`. D2(b): also a string matching `DIGIT_STRING_PATTERN` whose `Number()` is a safe integer, returned as that number. Otherwise throws |

Check order inside `mapJsonItem`: not-an-object → missing required field → unexpected field →
invalid line. A legacy-only object (`file:line` without `file`) still throws
`missing required field: file` first, unchanged from today.

### Exact messages

| Throw | Message |
|---|---|
| Unknown key, D1(a) | `` `Finding at index ${index} has an unknown field: ${JSON.stringify(key)}` `` → `Finding at index 0 has an unknown field: "suggested fix"` |
| Legacy key, D1(b) | `` `Finding at index ${index} has a legacy field: ${JSON.stringify(key)} (use ${replacement})` `` → `Finding at index 0 has a legacy field: "suggested fix" (use fix)` |
| Invalid line, D2(a) | `Finding at index ${index} has an invalid line: expected a non-negative integer` |
| Invalid line, D2(b) | `Finding at index ${index} has an invalid line: expected a non-negative integer or digit string` |

`JSON.stringify(key)` keeps a key with spaces, quotes or a newline readable on one stderr line. The
`line` value is **not** echoed: index plus field locates it, and that matches
`missing required field: …`, which echoes nothing. Echoing would also print `Infinity` as `null`
(row `1e400`), which is misleading.

### Edge matrix (after the fix)

| Input | D2(a) | D2(b) |
|---|---|---|
| `12`, `0`, `1e3` | `12`, `0`, `1000` | same |
| `"12"`, `"007"` | throws | `12`, `7` (per-line parity) |
| `"12x"`, `" 12 "`, `""`, `"0x1A"`, `"-3"` | throws | throws |
| `-3`, `1.5`, `null`, `true`, `false`, `[]`, `[12]`, `{}`, `1e400`, `9007199254740993` | throws | throws |

| Extra key | D1(a) | D1(b) |
|---|---|---|
| `suggested fix` (with or without `fix`) | throws unknown | throws legacy (`use fix`) |
| `file:line` beside `file`, `line` | throws unknown | throws legacy (`use file and line`) |
| `column`, `Fix`, `confidence` | throws unknown | dropped silently, as today |
| `fix: null`, `status: null` | omitted, as today | same |
| `status: "whatever"` | passed through, as today | same |
| `"__proto__"` as an own JSON key | throws unknown | dropped, as today |

## Decision candidates

| # | Choice | Alternatives (≤3) | Recommendation | Why |
|---|---|---|---|---|
| D1 | **User-owned.** What an unexpected key in a JSON finding does | (a) reject every key outside `{file, line, severity, finding, fix, status}`; (b) reject only the known legacy aliases `file:line` and `suggested fix`, keep ignoring every other key | **(a)** | Defect (1) is one case of a general class: any misspelt or invented key (`Fix`, `suggestion`) is the same silent drop, and (b) leaves it open. The contract (ADR-667) names the full shape, so (a) has a precise and stable allow-list. Cost of (a): a reviewer that adds a harmless key (`confidence`) now gets exit 2, and the review skill has no exit-2 route. A validation technique emitting canonical JSON plus extras moves from the digest branch to the `NON-CANONICAL` triager branch. Both are the module's fail-loud intent, but they reject inputs that exit 0 today. Pick (b) if that acceptance change is unwelcome. (b) also gives a remediation hint (`use fix`) |
| D2 | Whether a JSON `line` may be a decimal-digit string | (a) JSON integer only; (b) integer or a string matching the per-line `\d+` grammar (`"12"`, `"007"`) | **(b)** | `"12"` normalizes correctly today. Under (a) it would start exiting 2, which breaks R3 for a plausible model emission (quoted numbers) and buys nothing: the value is unambiguous. (b) reuses the grammar the per-line path already accepts, so JSON and per-line agree on what a line is. Pick (a) for the stricter typed contract. |

Pre-decided here, not candidates: `line: 0` stays valid (per-line parity, row `HIGH a.js:0`);
`fix: null` stays accepted and omitted (pinned by an existing test); `status` stays unvalidated
(deliberate, commented in `toFinding`); the `line` value is not echoed in the error.

## Test strategy

TDD, `Given/When/Then` titles, AAA, `sut`. Messages asserted by exact equality, the style already
used at `findings.test.js:531-548`. Run with `node --test` piped to a file and read back by grep.

### RED tests (written first, red at `dea964e`)

`engine/test/findings.test.js`, next to the existing JSON-item error tests:

```js
test('Given a canonical JSON finding that also carries a suggested fix key, when normalizeFindings runs, then it throws naming the key', () => {
  const raw = JSON.stringify([{ file: 'a.js', line: 12, severity: 'HIGH', finding: 'x', 'suggested fix': 'y' }]);
  const sut = normalizeFindings;

  assert.throws(() => sut(raw), (err) => err.message === EXPECTED_SUGGESTED_FIX_MESSAGE);
});

test('Given a JSON finding whose line is a non-numeric string, when normalizeFindings runs, then it throws naming the index and line', () => {
  const raw = JSON.stringify([{ file: 'a.js', line: '12x', severity: 'HIGH', finding: 'x' }]);
  const sut = normalizeFindings;

  assert.throws(() => sut(raw), (err) => err.message === EXPECTED_INVALID_LINE_MESSAGE);
});
```

`EXPECTED_*` are the exact strings from the Exact messages table for the options D1 and D2 pick.
Today the first returns `[{ …, no fix }]` and the second returns `line: NaN`, so neither throws.

`engine/test/normalize-findings-bin.test.js` (one test, drives the real bin):

```js
test('Given a JSON finding with a suggested fix key on stdin, when normalize-findings runs, then it exits 2 with the reason on stderr and nothing on stdout', () => {
  const sut = runStdin;
  const input = JSON.stringify([{ file: 'a.js', line: 3, severity: 'HIGH', finding: 'x', 'suggested fix': 'y' }]);

  const result = sut(input);

  assert.equal(result.status, 2);
  assert.equal(result.stderr, `normalize-findings: ${EXPECTED_SUGGESTED_FIX_MESSAGE}\n`);
  assert.equal(result.stdout, '');
});
```

### Edge tests (after green, `findings.test.js`)

- One table-driven loop over the `line` rejection rows of the edge matrix for the chosen D2
  option. One `test()` per row, title escaped with `JSON.stringify(value)` (raw control
  characters in titles break Stryker's tap dry run), each asserting the exact message.
- Accepted lines: `0`, `1e3`, and under D2(b) `"12"` and `"007"`, each deep-equal to its
  per-line twin (`HIGH a.js:0 — x`, …). This keeps interchangeability pinned.
- D1(a): `file:line` beside canonical keys, `column`, and an own `"__proto__"` key each throw
  unknown. D1(b): `file:line` throws legacy with `use file and line`, and `column` still
  normalizes (pins the chosen leniency).
- Order: an object missing `file` **and** carrying `suggested fix` throws
  `missing required field: file` (required check runs first).
- Regression, no edits: `fix: null` (`:196`), `status: null` (`:279`), out-of-vocabulary
  status (`:311`), the contract-shape bin test (`normalize-findings-bin.test.js:181`), and every
  per-line test.

### Mutation

Stryker on `engine/src/findings.js` only (`engine/stryker.conf.json`), one module per run,
concurrency 1, `nice -n 19`. Each new survivor is killed by a test or carries an
`equivalent mutant` justification in the module's existing comment style. Expected hot spots:
the `>= 0` boundary (killed by `0` accepted and `-3` rejected) and the `isSafeInteger` call
(killed by `1.5` and `9007199254740993`).

## Out of scope

- `file`, `severity` and `finding` type coercion: `{"file":null,"severity":{}, "finding":["a"]}`
  exits 0 as `file: "null"`, `severity: "[object Object]"` (probed 2026-10-21). Same family, but
  not in the brief.
- `fix` type coercion (`"fix":{"a":1}` → `"[object Object]"`, probed): not in the brief.
- Per-line `line` beyond `Number.MAX_SAFE_INTEGER` (a `\d+` capture of 17+ digits): `parseLine` is
  not touched.
- A review-skill route for normalize-findings exit 2 (`skills/review/SKILL.md:47-50`): skill
  restructuring, not in the brief. D1 records it as a cost.
- Translating legacy aliases into canonical fields: PR #89 chose to fix the contract instead
  (ADR-667).
