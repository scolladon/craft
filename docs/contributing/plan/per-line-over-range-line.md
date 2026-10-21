# Plan — per-line-over-range-line

> Source: design doc `docs/contributing/design/per-line-over-range-line.md` · ADRs 671, 672, 673
> The plan is the implementation script AND the knowledge handoff. Part agents start
> with zero context: whatever a part block omits is paid later as agent rediscovery.
> `plan-lint.sh` enforces the schema below — the plan phase cannot close without it.

Scope: D1(b), D2(a), D3(a), all accepted. A per-line record whose `<line>` digits convert to a
number that is not a safe integer is rejected. The check runs on the built finding, inside a new
module-internal `parseRecord` helper split out of `parseLineShape`. `isLineNumber` is the one
predicate for a valid line number, shared with `resolveJsonLine`. Do NOT build D1(a) (reuse the
JSON message) or D1(c) (reuse the no-match message). Do NOT touch `parseLine`, `toFinding`,
`LINE_HEAD_PATTERN` (no digit-length bound), or the JSON message.

Exact message (asserted by `err.message === '…'` and by exact stderr bytes):

| Throw | Template | Example |
|---|---|---|
| Over-range line number | `` `Cannot parse findings: line number exceeds ${Number.MAX_SAFE_INTEGER}: ${JSON.stringify(shown)}` `` | `Cannot parse findings: line number exceeds 9007199254740991: "LOW a.js:99999999999999999999 — x"` |

`shown` is the existing truncation: `line.length > 120 ? `${line.slice(0, 120)}…` : line`. The
per-line `line` passed in is the raw record, untrimmed (same value the cap and no-match throws
echo today).

Check order per record, after the fix (R4): cap → no-match → over-range. Output stays
all-or-nothing: the first bad record throws, nothing is returned.

Requirement map: R1, R2 → Part 1 RED pair + rejection loop. R3 → Part 1 GUARD entries (accept
boundary, leading zeros, status passthrough, cap, ReDoS, no-match, JSON loop, every existing
test). R4 → Part 1 precedence GUARDs. R5 → Part 1 `isLineNumber` in `resolveJsonLine` + the
interchangeability GUARD.

Public surface: no new exported symbol. `isLineNumber` and `parseRecord` are module-internal to
`engine/src/findings.js` (not exported). The module still exports only `normalizeFindings`,
`parseScopeSpec`, `filterFindings`; the barrel engine/src/index.js line 6 re-exports
`normalizeFindings` unchanged. No barrel, registry, README or generated-API surface gate applies.

Gate runner: the engine suite is `node:test`, not vitest. The part gate was run at `f80bcec`:
160 tests, 0 fail. Pipe output to a file and grep `^# (tests|pass|fail)` and `^not ok`; do not
read the whole output.

Phase gate: `nice -n 19 bash scripts/ci.sh`, once per commit.

House rules for the implementer:
- No provenance refs (phase, ADR, design, backlog numbers) in source, test titles or test
  comments. Comments say why, never what.
- Test titles must not contain raw invisible, NEL or U+2028 characters (Stryker tap dry run
  breaks). Data-driven titles go through `JSON.stringify(...)`, like the existing
  `INVALID_LINE_JSON` loop. The em dash `—` already used in titles is fine.
- Given/When/Then titles, AAA body, `const sut = normalizeFindings;` (or `runStdin` in the bin
  suite). Exact-equality message assertions.
- No suppression directives, no swallowed errors. Stage explicit paths with `/usr/bin/git add`.

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

## Part 1 — reject over-range per-line line numbers

### Context

Files edited (3):

- `engine/src/findings.js` (381 lines at `f80bcec`)
- `engine/test/findings.test.js` (1403 lines)
- `engine/test/normalize-findings-bin.test.js` (219 lines)

Read-only reference: engine/src/normalize-findings-main.js (any `normalizeFindings` throw →
stderr `normalize-findings: <message>\n`, exit 2 — no change needed there).

Current code in `engine/src/findings.js`:

- `DIGIT_STRING_PATTERN` at :68 (`/^\d+$/u`). Unchanged.
- `toFinding({ file, line, severity, finding, fix, status })` at :77 does `line: Number(line)`.
  Unchanged — the per-line check runs on the number it builds.
- `resolveJsonLine(value, index)` at :122-127:
  ```js
  function resolveJsonLine(value, index) {
    const candidate = typeof value === 'string' && DIGIT_STRING_PATTERN.test(value) ? Number(value) : value;
    if (Number.isSafeInteger(candidate) && candidate >= 0) {
      return candidate;
    }
    throw new Error(`Finding at index ${index} has an invalid line: expected a non-negative safe integer, as a number or a digit string`);
  }
  ```
- `parseLine(line)` at :174, `(line: string) => Finding | null`. Unchanged.
- `parseLineShape(raw)` at :210-232 (23 lines, over the 20-line limit): filters non-blank lines,
  loops, computes `shown`, throws the cap message
  (`` `Cannot parse findings: line exceeds the ${MAX_LINE_CHARS}-character cap` + ` (${line.length} characters): ${JSON.stringify(shown)}` ``),
  calls `parseLine`, throws the no-match message
  (`` `Cannot parse findings: line does not match the per-line format: ${JSON.stringify(shown)}` ``),
  pushes. Keep its JSDoc (the "every non-blank line must parse" why) and the
  "Truncate the echoed content" comment (move it with `shown` into `parseRecord`).
- `normalizeFindings` calls `parseLineShape(trimmed)` at :256. Unchanged.

Target shape (place `isLineNumber` next to `DIGIT_STRING_PATTERN`, above `toFinding`; place
`parseRecord` directly above `parseLineShape`):

```js
const isLineNumber = value => Number.isSafeInteger(value) && value >= 0;
// resolveJsonLine: `if (isLineNumber(candidate)) {` — message unchanged.

/** Parses one non-blank per-line record, or throws naming the record. */
function parseRecord(line) {
  const shown = line.length > 120 ? `${line.slice(0, 120)}…` : line;
  if (line.length > MAX_LINE_CHARS) { throw /* cap message, byte-identical */; }
  const finding = parseLine(line);
  if (finding === null) { throw /* no-match message, byte-identical */; }
  if (!isLineNumber(finding.line)) {
    throw new Error(`Cannot parse findings: line number exceeds ${Number.MAX_SAFE_INTEGER}: ${JSON.stringify(shown)}`);
  }
  return finding;
}

function parseLineShape(raw) {
  return raw.split('\n').filter(l => l.trim() !== '').map(parseRecord);
}
```

`map(parseRecord)` passes `(line, index, array)`; `parseRecord` reads only the first argument,
which is fine. Give `parseRecord` a JSDoc `@param {string} line` / `@returns {Finding}` like its
neighbours. A short why-comment on `isLineNumber` is allowed (one rule for both input shapes);
no provenance.

`engine/test/findings.test.js` landmarks:

- `normalizeFindings` imported at :6; `MAX_LINE_CHARS = 16384` mirrored at :18.
- Section `// ─── invalid line in a JSON finding ───` at :433: `INVALID_LINE_MESSAGE` (:435),
  `jsonWithLine(lineJson)` helper (:437), `INVALID_LINE_JSON` loop (:449-464, includes `'"-3"'`
  and `'-3'`, which kill the `>= 0` mutant), `ACCEPTED_LINE_PAIRS` interchangeability loop
  (:478-493: `[lineJson, perLine]`, asserts `deepEqual(sut(jsonWithLine(lineJson)), sut(perLine))`).
- Add a new section right after the `ACCEPTED_LINE_PAIRS` loop (before the
  "unknown key and an invalid line" test at :495), headed
  `// ─── over-range line number in a per-line record ───` in the file's box-rule style.
- Cap tests at :896-922 (`// ─── per-line cap …`), malformed section at :519, ReDoS at :506,
  :705-752, truncation tests at :766-800.
- Stale comments to retarget: :779 and :791 say the truncation check lives in `parseLineShape`;
  after the refactor it lives in `parseRecord`. Change only that function name in both comments.
  Comments at :112, :415, :546 describe the filter/split, which stays in `parseLineShape` — leave
  them.

`engine/test/normalize-findings-bin.test.js` landmarks: `runStdin(input)` at :22 (spawnSync, utf8).
Section `// ─── invalid JSON line → exit 2, reason on stderr ───` at :167 with its test at
:169-178. Add the new bin test right after it, under
`// ─── over-range per-line line number → exit 2, reason on stderr ───`.

Shared test constants (define once in findings.test.js, in the new section):

```js
const OVER_RANGE_PREFIX = `Cannot parse findings: line number exceeds 9007199254740991: `;
const OVER_RANGE_LINE = 'LOW a.js:99999999999999999999 — x';
const EXPECTED_OVER_RANGE_MESSAGE = 'Cannot parse findings: line number exceeds 9007199254740991: "LOW a.js:99999999999999999999 — x"';
```

Write the bound as the literal `9007199254740991`, never `Number.MAX_SAFE_INTEGER`, so the test
pins the bytes. The bin suite writes its expected stderr as a full literal too.

### TDD steps

1. RED — findings.test.js: `Given a per-line finding whose line number exceeds the safe-integer range, when normalizeFindings runs, then it throws naming the record`.
   `assert.throws(() => sut(OVER_RANGE_LINE), (err) => err.message === EXPECTED_OVER_RANGE_MESSAGE)`.
   Fails: today `parseLineShape` returns `[{ …, line: 100000000000000000000 }]` and does not throw.
2. RED — normalize-findings-bin.test.js: `Given a per-line finding with an over-range line number on stdin, when normalize-findings runs, then it exits 2 with the reason on stderr and nothing on stdout`.
   `sut('LOW a.js:99999999999999999999 — x\n')`; assert `status === 2`, `stderr ===
   'normalize-findings: Cannot parse findings: line number exceeds 9007199254740991: "LOW a.js:99999999999999999999 — x"\n'`,
   `stdout === ''`. Fails: today exit 0, stdout carries `"line": 100000000000000000000`.
3. RED — findings.test.js rejection loop, one `test()` per row, title
   `` `Given a per-line record ${JSON.stringify(raw)}, when normalizeFindings runs, then it throws the over-range message` ``
   (for the 400-digit row use a short label in the title, e.g. `'400 nines'`, not the raw line).
   Rows `[label, raw, expectedShown]`:
   - `'LOW a.js:9007199254740992 — x'` → shown = the raw line (first non-safe value, kills a
     `<=`/`isSafeInteger` mutant at the boundary)
   - `'LOW a.js:9007199254740993 — x'` → shown = the raw line (silently rounded today)
   - `` `LOW a.js:${'9'.repeat(400)} — x` `` → shown = `` `LOW a.js:${'9'.repeat(111)}…` ``
     (`Number()` gives `Infinity`; 120-char cut plus `…`)
   - `'VERIFIED: LOW a.js:99999999999999999999 — x | y'` → shown = the raw line (status and fix
     do not bypass the check)
   Assert `err.message === OVER_RANGE_PREFIX + JSON.stringify(expectedShown)`.
   Fails: all four return a finding today (lines `9007199254740992`, `9007199254740992`, `Infinity`,
   `100000000000000000000`).
4. RED — findings.test.js all-or-nothing: `Given a valid per-line record followed by an over-range one, when normalizeFindings runs, then it throws naming the second record`.
   Input `'LOW a.js:1 — x\nLOW a.js:99999999999999999999 — y'`; expected message
   `OVER_RANGE_PREFIX + '"LOW a.js:99999999999999999999 — y"'`. Fails: today returns two findings.
5. GREEN — in `engine/src/findings.js`: add `isLineNumber`; switch `resolveJsonLine` to
   `if (isLineNumber(candidate))`; extract `parseRecord` with the three throws in order cap →
   no-match → over-range; reduce `parseLineShape` to the split/filter/map one-liner. Steps 1-4
   pass.
6. GUARD — boundary accepts (pass after GREEN because `isLineNumber` admits every safe
   non-negative integer and the check is on the value, not the digit count):
   - `Given a per-line record at line 9007199254740991, when normalizeFindings runs, then it keeps the line number`
     → `deepEqual(sut('LOW a.js:9007199254740991 — x'), [{ file: 'a.js', line: 9007199254740991, severity: 'LOW', finding: 'x' }])`.
     Kills a mutant that negates or drops the per-line guard in favour of a strict bound.
   - `Given a per-line record whose line has 25 digits with leading zeros, when normalizeFindings runs, then it parses the value 12`
     → `sut('LOW a.js:0000000000000000000000012 — x')[0].line === 12`.
7. GUARD — precedence (R4; pass because the cap and no-match throws run first in `parseRecord`):
   - `Given an over-range per-line record with two fix delimiters, when normalizeFindings runs, then the no-match message wins`
     → raw `'LOW a.js:99999999999999999999 — x | y | z'`; `err.message ===
     'Cannot parse findings: line does not match the per-line format: "LOW a.js:99999999999999999999 — x | y | z"'`.
   - `Given an over-range per-line record longer than the cap, when normalizeFindings runs, then the cap message wins`
     → `const prefix = 'LOW a.js:99999999999999999999 — '; const raw = prefix + 'x'.repeat(MAX_LINE_CHARS + 1 - prefix.length);`
     expected `` `Cannot parse findings: line exceeds the ${MAX_LINE_CHARS}-character cap (${MAX_LINE_CHARS + 1} characters): ${JSON.stringify(`${raw.slice(0, 120)}…`)}` ``.
8. GUARD — interchangeability (R5): append `['9007199254740991', 'HIGH a.js:9007199254740991 — x']`
   to `ACCEPTED_LINE_PAIRS`; the existing loop asserts both shapes deep-equal. Passes because
   both paths accept the same safe value.
9. GUARD — regression, no edits: the whole existing suite (JSON `INVALID_LINE_JSON` loop still
   throws `INVALID_LINE_MESSAGE` with `resolveJsonLine` on `isLineNumber`, `-3` rows included;
   `line: 0`, `007`, status passthrough, cap tests :896-922, ReDoS tests :506, :705-752,
   truncation tests :766-800, malformed section :519; bin invalid-JSON-line test :169). These
   pass because `parseRecord` carries the cap/no-match/truncation code byte-identical.
10. REFACTOR — retarget the two stale comments (findings.test.js :779, :791) from
    `parseLineShape` to `parseRecord`. Confirm `parseRecord` and `parseLineShape` are each under
    20 lines, nesting ≤ 2, no new magic values beyond the existing `120` (do not rename it in
    this part). Re-run the part gate.

### Gate

`cd engine && node --test test/findings.test.js test/normalize-findings-bin.test.js`
(expect 160 + the new tests, 0 fail), then `nice -n 19 bash scripts/ci.sh` once before the commit.

### Commit

`fix(findings): reject per-line line numbers beyond the safe-integer range`
