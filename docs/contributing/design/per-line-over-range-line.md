# Design — per-line-over-range-line

> Brief: a per-line finding whose `<line>` digits exceed `Number.MAX_SAFE_INTEGER` normalizes with
> exit 0 to a rounded or `null` line (`LOW a.js:99999999999999999999 - x` → `line: 100000000000000000000`).
> The JSON path already rejects the same value (ADR-670). Close the gap on the per-line path. Red
> tests first, one through `normalizeFindings` and one through the bin.
> Status: draft → self-reviewed ×2

## Context

### Surfaces

| Symbol | Location | Role here |
|---|---|---|
| `LINE_HEAD_PATTERN` | `engine/src/findings.js:22` | `/^(\S+)\s+(\S+):(\d+)\s+[—–-]\s+(.*\S)$/u`. `\d+` has no length bound |
| `MAX_LINE_CHARS` | `engine/src/findings.js:27` | 16384. The only bound on the digit run's length |
| `STATUS_PREFIX_PATTERN` | `engine/src/findings.js:40` | Optional `VERIFIED:`/`SUSPECT:`/… prefix, stripped before the head match |
| `DIGIT_STRING_PATTERN` | `engine/src/findings.js:68` | `/^\d+$/u`, the JSON mirror of the per-line `\d+` grammar |
| `toFinding({ file, line, … })` | `engine/src/findings.js:77` | Shared builder. `line: Number(line)`, no range check |
| `resolveJsonLine(value, index)` | `engine/src/findings.js:122` | JSON only. Accepts a non-negative safe integer or a digit string whose `Number()` is one. Else throws `Finding at index ${index} has an invalid line: expected a non-negative safe integer, as a number or a digit string` |
| `parseLine(line)` | `engine/src/findings.js:174` | `(line: string) => Finding \| null`. `null` means "matches nothing". Passes the raw capture `rawLine` to `toFinding` at `:200` |
| `parseLineShape(raw)` | `engine/src/findings.js:210` | Owns every per-line throw. Computes `shown` (line cut to 120 chars + `…`), then the cap throw, then the no-match throw |
| `main(argv, io)` | `engine/src/normalize-findings-main.js` | Any `normalizeFindings` throw → stderr `normalize-findings: <message>\n`, exit 2 |

Prior art: `docs/contributing/design/normalize-findings-silent-field-loss.md` (ADR-670) closed the
JSON `line` coercions and listed this per-line case in its Out of scope ("`parseLine` is not
touched"). ADR-670 pins the JSON message and its choice not to echo the value.

### Pinned behaviour (probe, `node engine/bin/normalize-findings.js < in.txt`, 2026-10-21)

Run from a `mktemp` directory against this worktree's `HEAD` (`576ceed`). `-` is the ASCII dash.

| Input line | Exit | Output `line` | Verdict |
|---|---|---|---|
| `LOW a.js:0 - x` | 0 | `0` | valid |
| `LOW a.js:007 - x` | 0 | `7` | valid |
| `LOW a.js:0000000000000000000000012 - x` (25 digits) | 0 | `12` | valid: digit count is not the measure, the value is |
| `LOW a.js:9007199254740991 - x` | 0 | `9007199254740991` | valid, `MAX_SAFE_INTEGER` |
| `LOW a.js:9007199254740992 - x` | 0 | `9007199254740992` | **defect**: not a safe integer |
| `LOW a.js:9007199254740993 - x` | 0 | `9007199254740992` | **defect**: silently rounded |
| `LOW a.js:99999999999999999999 - x` | 0 | `100000000000000000000` | **defect**: silently rounded |
| `LOW a.js:` + 400 × `9` + ` - x` | 0 | `null` | **defect**: `Number()` gives `Infinity`, `JSON.stringify` writes `null` |
| `VERIFIED: LOW a.js:99999999999999999999 - x \| y` | 0 | `100000000000000000000` | **defect**, status and fix kept |
| `LOW a.js:99999999999999999999 - x \| y \| z` | 2 | — | `line does not match the per-line format`: the pipe guard fires first |
| `LOW a.js:1 - x` then `LOW a.js:99999999999999999999 - y` | 0 | `1`, `100000000000000000000` | **defect** on line 2 |
| JSON `"line":"99999999999999999999"` | 2 | — | already rejected by `resolveJsonLine` |

`Number.isSafeInteger(Number("9007199254740992"))` is `false` and
`Number.isSafeInteger(Number("9007199254740991"))` is `true` (probed). Any `\d+` string above
`MAX_SAFE_INTEGER` converts to a value ≥ 2^53 or `Infinity`, and neither is a safe integer. So a
check on the converted number catches every defect row, with no digit counting.

### House patterns this must follow

- **Fail loud, never drop or coerce silently.** Each per-line throw lives in `parseLineShape`, and
  the input is all-or-nothing (no partial output on a bad line).
- **Per-line message family.** `Cannot parse findings: line …: ${JSON.stringify(shown)}`. It echoes
  the truncated line, because a per-line input has no index to point at.
- **JSON message family.** `Finding at index ${index} …`. It does not echo the value (ADR-670).
- **Interchangeability (ADR-019, ADR-277).** One finding in either shape gives byte-identical
  output. Today the two shapes disagree on `99999999999999999999` (JSON exits 2, per-line exits 0).
- **Exact messages asserted by equality** (`findings.test.js:435`, `normalize-findings-bin.test.js:177`).

## Requirements

- R1 — A per-line record whose `<line>` digits convert to a number that is not a safe integer
  exits 2. Every **defect** row of the matrix is rejected, the status-prefixed one included.
- R2 — The throw has one exact message string (chosen in D1), asserted by equality through
  `normalizeFindings` and through the bin's stderr.
- R3 — Unchanged: `line: 0`, leading zeros (`007`, 25-digit `…012`), `MAX_SAFE_INTEGER` itself,
  status passthrough, the `MAX_LINE_CHARS` cap and its message, the `PIPE_DELIMITER` ReDoS guard,
  the no-match message, the JSON path's messages, and every existing test.
- R4 — Check precedence on one line: cap → no-match → over-range. A line that fails the grammar
  keeps today's no-match message (matrix row `x | y | z`).
- R5 — Per-line and JSON agree on which line values are valid: a non-negative safe integer.

## Design

`parseLine` keeps its `Finding | null` contract and its body. `toFinding` is not touched. The
range check runs in `parseLineShape` on the built finding, right after the no-match check, where
`shown` is already in scope (D2(a)).

```js
// D3(a): one definition of a valid line number, shared by both shapes.
const isLineNumber = value => Number.isSafeInteger(value) && value >= 0;

function resolveJsonLine(value, index) {
  const candidate = typeof value === 'string' && DIGIT_STRING_PATTERN.test(value) ? Number(value) : value;
  if (isLineNumber(candidate)) {
    return candidate;
  }
  throw new Error(/* ADR-670 message, unchanged */);
}

function parseLineShape(raw) {
  // … existing: nonBlank, shown, cap throw, parseLine, no-match throw …
  if (!isLineNumber(finding.line)) {
    throw new Error(`Cannot parse findings: line number exceeds ${Number.MAX_SAFE_INTEGER}: ${JSON.stringify(shown)}`);
  }
  results.push(finding);
}
```

`parseLineShape` is 23 lines today, over the 20-line limit. Adding a throw makes it worse, so the
per-line checks move into one helper. `parseLineShape` keeps the loop and the push:

```js
/** Parses one non-blank per-line record, or throws naming the line. */
function parseRecord(line) {
  const shown = line.length > 120 ? `${line.slice(0, 120)}…` : line;
  if (line.length > MAX_LINE_CHARS) { throw /* cap message, unchanged */; }
  const finding = parseLine(line);
  if (finding === null) { throw /* no-match message, unchanged */; }
  if (!isLineNumber(finding.line)) { throw /* D1 message */; }
  return finding;
}

function parseLineShape(raw) {
  return raw.split('\n').filter(l => l.trim() !== '').map(parseRecord);
}
```

`map` throws on the first bad line, so the output stays all-or-nothing, as today.

On the per-line path `isLineNumber`'s `>= 0` term never fires (the grammar admits no sign). It is
kept because the predicate states what a line number is, and the JSON path kills its mutants
(`-3` row).

### Exact messages (D1)

| Option | Message for `LOW a.js:99999999999999999999 - x` |
|---|---|
| D1(a) reuse the JSON message | `Finding at index 0 has an invalid line: expected a non-negative safe integer, as a number or a digit string` (index = position among non-blank lines) |
| D1(b) per-line message | `Cannot parse findings: line number exceeds 9007199254740991: "LOW a.js:99999999999999999999 - x"` |
| D1(c) reuse no-match | `Cannot parse findings: line does not match the per-line format: "LOW a.js:99999999999999999999 - x"` |

D1(b) template: `` `Cannot parse findings: line number exceeds ${Number.MAX_SAFE_INTEGER}: ${JSON.stringify(shown)}` ``.
It says "line number" because "line" alone already means the input record in the sibling messages.
For the 400-digit row, `shown` cuts the echo at 120 characters plus `…`. That still identifies the
record.

### Edge matrix (after the fix, D1(b))

| Input | Result |
|---|---|
| `:0`, `:007`, 25-digit `:000…012`, `:9007199254740991` | `0`, `7`, `12`, `9007199254740991` |
| `:9007199254740992`, `:9007199254740993`, `:99999999999999999999`, 400 × `9` | exit 2, over-range message |
| `VERIFIED: LOW a.js:99999999999999999999 - x \| y` | exit 2, over-range message (status does not bypass it) |
| `LOW a.js:99999999999999999999 - x \| y \| z` | exit 2, no-match message (R4) |
| valid line, then over-range line | exit 2, nothing on stdout |
| a line over `MAX_LINE_CHARS` with an over-range number | exit 2, cap message (R4) |

## Decision candidates

| # | Choice | Alternatives (≤3) | Recommendation | Why |
|---|---|---|---|---|
| D1 | **User-owned.** Message for an over-range per-line line number | (a) reuse ADR-670's JSON message, with the non-blank line position as `index`; (b) a new per-line message in the `Cannot parse findings: line …` family, echoing `shown`; (c) reuse the existing no-match message | **(b)** | (a) is JSON-shaped: a per-line input has no "index", and "as a number or a digit string" describes JSON types, not per-line text. It also breaks the per-line convention of echoing the record. (c) is false: the record does match the grammar, so the message sends the reader looking for a format error that is not there. (b) follows the sibling throws (echo `shown`, same prefix) and names the bound. Cost of (b): a third per-line message to keep, and it diverges in wording from the JSON one. Pick (a) for one message across shapes. |
| D2 | Where the per-line check lives, given `parseLine` returns `null` on no-match | (a) in `parseLineShape` (via the extracted `parseRecord`), on `finding.line` after the no-match check; (b) `parseLine` returns a tagged result (`{ finding }` or `{ reason }`) and `parseLineShape` maps each reason to a message; (c) `parseLine` checks `rawLine` and returns `null`, which only works with D1(c) | **(a)** | `parseLine`'s contract and body stay as they are. All per-line throws stay in one function. `shown` is already in scope. The pinned conversion property (every over-range `\d+` gives a non-safe number) makes a check after conversion exact. (b) widens `parseLine`'s return type for one case. (c) ties D2 to D1(c). |
| D3 | Share the "valid line number" predicate between shapes | (a) extract `isLineNumber(value)` and use it in `resolveJsonLine` and the per-line check; (b) inline `Number.isSafeInteger(finding.line)` at the per-line site, leave `resolveJsonLine` as it is | **(a)** | R5 says the two shapes agree on what a line is. With one predicate, changing that rule changes both paths together. The cost is a one-line edit in `resolveJsonLine`, and its message does not change. (b) touches less code but keeps two definitions that can drift apart. |

Pre-decided here, not candidates: `line: 0` and leading zeros stay valid (R3); the cap and
no-match messages run before the range check (R4); the JSON message is unchanged (ADR-670); the
`parseLineShape` split into `parseRecord` (the 20-line rule, `parseLineShape` is 23 lines today).

## Test strategy

TDD with `Given/When/Then` titles, AAA and a `sut` variable. Messages are asserted by exact
equality. Run with `node --test` piped to a file, then grep the result.

### RED tests (written first, red at `576ceed`)

`engine/test/findings.test.js`, next to the per-line malformed tests:

```js
const OVER_RANGE_LINE = 'LOW a.js:99999999999999999999 — x';

test('Given a per-line finding whose line number exceeds the safe-integer range, when normalizeFindings runs, then it throws naming the record', () => {
  const sut = normalizeFindings;

  assert.throws(() => sut(OVER_RANGE_LINE), (err) => err.message === EXPECTED_OVER_RANGE_MESSAGE);
});
```

`engine/test/normalize-findings-bin.test.js`, next to the invalid-JSON-line bin test (`:169`):

```js
test('Given a per-line finding with an over-range line number on stdin, when normalize-findings runs, then it exits 2 with the reason on stderr and nothing on stdout', () => {
  const sut = runStdin;

  const result = sut('LOW a.js:99999999999999999999 — x\n');

  assert.equal(result.status, 2);
  assert.equal(result.stderr, `normalize-findings: ${EXPECTED_OVER_RANGE_MESSAGE}\n`);
  assert.equal(result.stdout, '');
});
```

`EXPECTED_OVER_RANGE_MESSAGE` is the D1 row for the chosen option, written as a literal. Today
both tests get exit 0 / `line: 100000000000000000000`, so both are red.

### Edge tests (after green, `findings.test.js`)

- Rejection loop, one `test()` per row, title escaped with `JSON.stringify` (Stryker tap trap):
  `9007199254740992`, `9007199254740993`, 400 × `9`, and the status-prefixed `| y` row. Each
  asserts the exact message.
- Boundary accepts: `9007199254740991` → `line: 9007199254740991`; 25-digit `000…012` → `12`.
  The second proves the check is on the value, not on the digit count.
- Precedence: the `x | y | z` over-range row gives the no-match message; a cap-length line holding
  an over-range number gives the cap message.
- All-or-nothing: a valid line followed by an over-range line throws.
- Interchangeability: `9007199254740991` in per-line and in JSON (`line: 9007199254740991`)
  deep-equal.
- Regression, no edits: the `line: 0` tests, the status-passthrough tests, the cap test
  (`:899`), the ReDoS tests (`:508`, `:707`, `:728`), and the JSON invalid-line loop (`:454`). The loop
  still passes with `resolveJsonLine` on `isLineNumber`.

### Mutation

Stryker on `engine/src/findings.js` only (`engine/stryker.conf.json`), concurrency 1,
`nice -n 19`. Expected hot spots: the per-line `!isLineNumber` guard (killed by the RED test and
the `…991` accept), `isSafeInteger` (killed by `…992`), and `>= 0` (killed by the JSON `-3`
row). The extracted `parseRecord` brings the cap and no-match checks with it, and their existing
tests still cover them.

## Out of scope

- A length bound on `\d+` in `LINE_HEAD_PATTERN`: value-based rejection already covers it, and a
  digit cap would wrongly reject the valid 25-digit `000…012`.
- Echoing the value in the JSON message: ADR-670 decided against it.
- `file`/`severity`/`finding` type coercion on the JSON path: carried over from the sibling
  design's Out of scope, not in the brief.
