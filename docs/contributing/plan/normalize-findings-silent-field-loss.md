# Plan — normalize-findings-silent-field-loss

> Source: design doc `docs/contributing/design/normalize-findings-silent-field-loss.md` · ADRs 669, 670
> The plan is the implementation script AND the knowledge handoff. Part agents start
> with zero context: whatever a part block omits is paid later as agent rediscovery.
> `plan-lint.sh` enforces the schema below — the plan phase cannot close without it.

Scope: D1(a) and D2(b) only (both user-ratified). D1(a) rejects every key outside
`{file, line, severity, finding, fix, status}`. D2(b) accepts a safe non-negative integer, or a
`^\d+$` string whose value is a safe integer. The design's D1(b) (legacy-alias map, `has a legacy
field` message) and D2(a) (integer-only `line`) branches are NOT built. Do not add
`LEGACY_JSON_FIELDS`. Do not add the integer-only message.

Exact messages (asserted by `err.message === '…'` and by exact stderr bytes):

| Throw | Template | Example |
|---|---|---|
| Unknown key | `` `Finding at index ${index} has an unknown field: ${JSON.stringify(key)}` `` | `Finding at index 0 has an unknown field: "suggested fix"` |
| Invalid line | `` `Finding at index ${index} has an invalid line: expected a non-negative integer or digit string` `` | `Finding at index 0 has an invalid line: expected a non-negative integer or digit string` |

Check order inside `mapJsonItem` after both parts: not-an-object → missing required field →
unknown field → invalid line. The `line` value is never echoed in the message.

Why two parts on the same three files: they fix two independent defects. Each has its own red
pair (one through `normalizeFindings`, one through the bin) and its own message. Merged, the part
would hold eight RED/GUARD groups across two helpers, above the ~5-cycle ceiling. Part 2 builds on
Part 1's `mapJsonItem` in the shared working tree.

Requirement map: R1 → Part 1. R2 → Part 2. R3 (no regression: `fix: null`, `status: null`, any
`status` string, per-line path, every existing test and fixture) → GUARD entries in both parts.
R4 (one exact message per throw) → the exact-equality assertions in both parts.

Untouched by design: `toFinding` (`status` stays unvalidated and un-trimmed; `line: Number(line)`
stays), `parseLine`, `parseLineShape`, `normalizeFindings`, `normalize-findings-main.js`, the bin,
every fixture under engine/test/fixtures/findings/. Fixtures were checked: array.json carries
`file,line,severity,finding,fix` with integer lines 42 and 7. with-status.json carries
`file,line,severity,finding,fix,status` with integer lines 1-5. Both stay valid.

Public surface: no new exported symbol. `ACCEPTED_JSON_FIELDS`, `DIGIT_STRING_PATTERN`,
`rejectUnexpectedFields`, `resolveJsonLine` are module-internal to `engine/src/findings.js`. Only
`normalizeFindings`, `parseScopeSpec`, `filterFindings` are exported, and the barrel
engine/src/index.js re-exports `normalizeFindings` unchanged. No barrel, registry, README or
generated-API surface gate applies.

Gate runner: the engine suite is `node:test` (engine/package.json `"test": "node --test …"`), not
vitest. The part gate below was run at `ef0df21`: 123 tests, 0 fail. Pipe output to a file and
grep `^# (tests|pass|fail)` and `^not ok`. Do not read the whole output.

Phase gate: `nice -n 19 bash scripts/ci.sh` (ci.sh lives in scripts/, not at the repo root). Run it
once per commit.

Out-of-plan, not acted on: the review skill has no exit-2 route for normalize-findings
(skills/review/SKILL.md:47-50). Design Out of scope records it.

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

## Part 1 — Reject unknown keys in a JSON finding

### Context

Defect (1): `[{"file":"a.js","line":12,"severity":"HIGH","finding":"x","suggested fix":"z"}]`
exits 0 with no `fix` key. `toFinding` destructures six named keys and drops every other one
without a word. Fix: an allow-list check in the JSON path only.

Files this part EDITS (three):

- `engine/src/findings.js`
  - `REQUIRED_JSON_FIELDS` (line 60):
    `/** @type {const} */ (['file', 'line', 'severity', 'finding'])`. Keep it.
  - Add directly below it:
    ```js
    // Every key the canonical finding shape names. Any other key (a legacy alias such as
    // `suggested fix`, a misspelling such as `Fix`) used to be dropped without a word.
    const ACCEPTED_JSON_FIELDS = new Set([...REQUIRED_JSON_FIELDS, 'fix', 'status']);
    ```
  - Add the helper above `mapJsonItem` (command, returns nothing, early return, ≤ 20 lines):
    ```js
    /**
     * Throws on the first key of a JSON finding outside the canonical shape.
     *
     * @param {object} item
     * @param {number} index
     */
    function rejectUnexpectedFields(item, index) {
      const unexpected = Object.keys(item).find(key => !ACCEPTED_JSON_FIELDS.has(key));
      if (unexpected === undefined) {
        return;
      }
      throw new Error(`Finding at index ${index} has an unknown field: ${JSON.stringify(unexpected)}`);
    }
    ```
  - `mapJsonItem(item, index)` (line 99, `@param {unknown} item`, returns `Finding`) currently has
    the not-an-object check, then the `REQUIRED_JSON_FIELDS` loop, then
    `return toFinding(/** @type {Record<string,unknown>} */ (item));`. Insert
    `rejectUnexpectedFields(item, index);` between the loop and the `return`. Nothing else changes.
    The required-field loop stays first, so a legacy-only object (no `file`) still throws
    `missing required field: file`.
  - `Object.keys` lists own enumerable keys. `JSON.parse` creates `"__proto__"` as an own key, so
    an own `__proto__` key is rejected as unknown. That is intended.
- `engine/test/findings.test.js`
  - Imports (lines 1-6): `test` from `node:test`, `assert` from `node:assert/strict`, and
    `{ normalizeFindings, parseScopeSpec, filterFindings }` from `../src/findings.js`. No import
    change is needed.
  - Insert the new tests directly after the test
    `Given a JSON array with a missing required field (file), when normalizeFindings runs, then it throws`
    (~line 559, the last JSON-item error test before the `// ─── ReDoS resistance: pathological trailing-space-then-pipe input` banner at ~line 569). Open
    with a banner in the file's style:
    `// ─── unknown keys in a JSON finding ─────────────────────────────────────────`.
  - Exact-message style to copy (lines ~531-548):
    `assert.throws(() => sut(raw), (err) => err.message === '…');`.
  - House style: Given/When/Then titles, `const sut = normalizeFindings;`, AAA with blank lines.
    No ADR, phase or backlog numbers in comments or titles.
  - An own `__proto__` key needs a raw JSON string literal. `JSON.stringify({ __proto__: … })` sets
    the prototype and emits no key.
- `engine/test/normalize-findings-bin.test.js`
  - Helpers to reuse: `runStdin(input)` (line 22,
    `spawnSync(process.execPath, [bin], { input, encoding: 'utf8' })`). Clean-exit stderr bytes are
    `normalize-findings: <message>\n` (engine/src/normalize-findings-main.js).
  - Insert a new section after the nonexistent-file-path test (~line 145-153), before the
    `// ─── contract-shaped JSON` banner:
    `// ─── unknown JSON key → exit 2, reason on stderr ───`.
  - The contract-shaped test (banner ~line 155, test ~line 181) stays green. Its `SAMPLE_BY_CONTRACT_FIELD` holds
    `'file:line'` and `'suggested fix'` samples, but the live contract (contracts/harness-read.md
    line 2) names only `file, line, severity, finding, fix?, status?`, so neither sample is used.
    Do not edit that test.

Read-only references: docs/contributing/design/normalize-findings-silent-field-loss.md (edge
matrix), docs/contributing/adr/669-json-findings-reject-unknown-keys.md.

Mutation-kill notes for the validation phase (Stryker on engine/src/findings.js only, one module,
concurrency 1, `nice -n 19`). Forcing `unexpected === undefined` false is killed by every accepted
JSON test. Dropping the `!` is killed by the `file` key throwing. Blanking `'fix'` or `'status'` in
the Set is killed by the existing fix/status JSON tests (findings.test.js ~:168-330).

### TDD steps

1. RED — findings.test.js:
   `Given a canonical JSON finding that also carries a suggested fix key, when normalizeFindings runs, then it throws naming the key`.
   Raw: `JSON.stringify([{ file: 'a.js', line: 12, severity: 'HIGH', finding: 'x', 'suggested fix': 'y' }])`.
   Assert `err.message === 'Finding at index 0 has an unknown field: "suggested fix"'`.
   Fails because `normalizeFindings` returns `[{ file: 'a.js', line: 12, severity: 'HIGH', finding: 'x' }]`
   (fix dropped) and throws nothing.
2. RED — normalize-findings-bin.test.js:
   `Given a JSON finding with a suggested fix key on stdin, when normalize-findings runs, then it exits 2 with the reason on stderr and nothing on stdout`.
   `const sut = runStdin;`. Input:
   `JSON.stringify([{ file: 'a.js', line: 3, severity: 'HIGH', finding: 'x', 'suggested fix': 'y' }])`.
   Assert `result.status === 2`,
   `result.stderr === 'normalize-findings: Finding at index 0 has an unknown field: "suggested fix"\n'`,
   and `result.stdout === ''`. Fails because the bin exits 0 and prints the canonical array without
   `fix`.
3. RED — findings.test.js:
   `Given a JSON finding whose second item carries a misspelt Fix key, when normalizeFindings runs, then it throws naming index 1 and the key`.
   Two items: the first is canonical, the second carries `Fix: 'y'`. Assert
   `err.message === 'Finding at index 1 has an unknown field: "Fix"'`. Fails because the input
   normalizes without throwing. This pins the index and the general allow-list against a
   `suggested fix`-only fix.
4. GREEN — add `ACCEPTED_JSON_FIELDS` and `rejectUnexpectedFields`, and call it in `mapJsonItem`
   as in Context.
5. GUARD — findings.test.js, one `test()` per row, each asserting the exact unknown-field message
   (the GREEN in step 4 already rejects them):
   - `file:line` beside the canonical keys → `"file:line"`.
   - `column: 4` → `"column"`.
   - `confidence: 'high'` → `"confidence"`.
   - Own `__proto__` key, from the raw text
     `'[{"file":"a.js","line":1,"severity":"HIGH","finding":"x","__proto__":{}}]'` → `"__proto__"`.
   Build titles from the key through `JSON.stringify(key)`. A raw control character in a title
   breaks Stryker's tap dry run.
6. GUARD — findings.test.js:
   `Given a JSON finding missing file and carrying a suggested fix key, when normalizeFindings runs, then the missing-field error wins`.
   Raw `[{ line: 1, severity: 'HIGH', finding: 'x', 'suggested fix': 'y' }]`. Assert
   `err.message === 'Finding at index 0 missing required field: file'`. It passes because the
   required-field loop runs before `rejectUnexpectedFields`.
7. GUARD — findings.test.js:
   `Given a JSON finding carrying every accepted key with fix null and an out-of-vocabulary status, when normalizeFindings runs, then it normalizes with status kept and fix omitted`.
   Raw `[{ file: 'a.js', line: 1, severity: 'HIGH', finding: 'x', fix: null, status: 'WHATEVER' }]`.
   Assert `deepEqual` to
   `[{ file: 'a.js', line: 1, severity: 'HIGH', finding: 'x', status: 'WHATEVER' }]`. It passes
   because `fix` and `status` are in the allow-list and `toFinding` is untouched.
8. GUARD (existing, no edits) — `fix: null` (~:196), `status: null` (~:279), out-of-vocabulary
   status (~:311), the with-status JSON and per-line fixture tests (~:239-266), and the bin status
   trio (~:91). They pass because `toFinding` and `parseLine` are unchanged.
9. REFACTOR — none expected. Confirm `mapJsonItem` stays ≤ 20 lines and nesting ≤ 2.

### Gate

`cd engine && nice -n 19 node --test test/findings.test.js test/normalize-findings-bin.test.js > <scratch>/part1-gate.txt 2>&1; grep -E '^# (tests|pass|fail)|^not ok' <scratch>/part1-gate.txt`
(expect `# fail 0`). Then `nice -n 19 bash scripts/ci.sh` once, before the commit.

### Commit

`fix(findings): reject unknown keys in a JSON finding`

## Part 2 — Validate a JSON finding's line

### Context

Defect (2): `[{"file":"a.js","line":"12x","severity":"HIGH","finding":"x"}]` exits 0 with
`"line": null`. `toFinding` runs `Number(line)` without checking it: `"12x"` gives `NaN`, and
`JSON.stringify` writes `null`. The same coercion corrupts `""`, `null`, `false`, `[]` to `0`,
`true` to `1`, `"0x1A"` to `26`, and lets `-3`, `1.5` and unsafe integers through. Fix: validate
the raw `line` in the JSON path before `toFinding`. Accept a safe non-negative integer, or a `^\d+$`
string whose `Number()` is a safe integer. This is the same `\d+` grammar the per-line path uses
(`LINE_HEAD_PATTERN`, line 22), so `"007"` → `7` matches `HIGH a.js:007 — x`.

Prerequisite state: Part 1 landed. `mapJsonItem` ends with `rejectUnexpectedFields(item, index);`
then `return toFinding(/** @type {Record<string,unknown>} */ (item));`.

Files this part EDITS (three):

- `engine/src/findings.js`
  - Add below `ACCEPTED_JSON_FIELDS`:
    ```js
    // The per-line `\d+` line grammar, so a JSON string line and a per-line record agree on what a
    // line number is.
    const DIGIT_STRING_PATTERN = /^\d+$/u;
    ```
  - Add the helper above `mapJsonItem` (query, ≤ 20 lines, early return):
    ```js
    /**
     * Resolves a JSON finding's raw `line` to a line number, or throws. `Number()` alone turned
     * `"12x"` into NaN, and `""`, `null`, `false` and `[]` into 0, all without a word.
     *
     * @param {unknown} value
     * @param {number} index
     * @returns {number}
     */
    function resolveJsonLine(value, index) {
      const candidate = typeof value === 'string' && DIGIT_STRING_PATTERN.test(value) ? Number(value) : value;
      if (Number.isSafeInteger(candidate) && candidate >= 0) {
        return candidate;
      }
      throw new Error(`Finding at index ${index} has an invalid line: expected a non-negative integer or digit string`);
    }
    ```
    `Number.isSafeInteger` takes `unknown` and returns false for non-numbers, so no extra type
    guard is needed (the repo runs no type checker).
  - `mapJsonItem`: replace the final `return` with
    ```js
    const record = /** @type {Record<string, unknown>} */ (item);
    return toFinding({ ...record, line: resolveJsonLine(record.line, index) });
    ```
    `toFinding`'s `Number(line)` on an already-resolved number is the identity. Leave `toFinding`
    untouched, because `parseLine` shares it.
  - Known accepted edge, not tested: JSON `-0` passes (`Number.isSafeInteger(-0)` and `-0 >= 0`
    are both true), and the bin serializes it as `0`.
- `engine/test/findings.test.js`
  - Insert after Part 1's unknown-key block, under the banner
    `// ─── invalid line in a JSON finding ─────────────────────────────────────────`.
  - Shared constant for the section:
    `const INVALID_LINE_MESSAGE = 'Finding at index 0 has an invalid line: expected a non-negative integer or digit string';`.
  - Build table rows from **raw JSON text** for `line`, spliced into
    `` `[{"file":"a.js","line":${lineJson},"severity":"HIGH","finding":"x"}]` ``. `1e400` and
    `9007199254740993` cannot be written as JS number literals without losing their bytes, and
    `JSON.stringify(Infinity)` writes `null`. Titles embed `JSON.stringify(lineJson)`.
- `engine/test/normalize-findings-bin.test.js`
  - Insert after Part 1's bin section, under
    `// ─── invalid JSON line → exit 2, reason on stderr ───`. Reuse `runStdin`.

Read-only references: docs/contributing/design/normalize-findings-silent-field-loss.md (Pinned
behaviour line matrix, Edge matrix D2(b) column),
docs/contributing/adr/670-json-finding-line-accepts-digit-strings.md.

Mutation-kill notes for the validation phase. `>= 0` → `> 0` is killed by `0` accepted. Dropping
`>= 0` is killed by `-3`. `isSafeInteger` → `isInteger` is killed by `9007199254740993` and
`"9007199254740993"`. `isSafeInteger` → `true` is killed by `1.5`. `typeof value === 'string'` →
`true` is killed by `[12]` (`String([12])` is `"12"`). Forcing it `false` is killed by `"12"`
accepted. Dropping `^` is killed by `" 12"`. Dropping `$` is killed by `"12 "`. `\d+` → `\d` is
killed by `"12"` accepted.

### TDD steps

1. RED — findings.test.js:
   `Given a JSON finding whose line is a non-numeric string, when normalizeFindings runs, then it throws naming the index and line`.
   Raw `JSON.stringify([{ file: 'a.js', line: '12x', severity: 'HIGH', finding: 'x' }])`. Assert
   `err.message === INVALID_LINE_MESSAGE`. Fails because `normalizeFindings` returns
   `[{ …, line: NaN }]` and throws nothing.
2. RED — normalize-findings-bin.test.js:
   `Given a JSON finding with a non-numeric line on stdin, when normalize-findings runs, then it exits 2 with the reason on stderr and nothing on stdout`.
   Input `JSON.stringify([{ file: 'a.js', line: '12x', severity: 'HIGH', finding: 'x' }])`.
   Assert status `2`,
   stderr `'normalize-findings: Finding at index 0 has an invalid line: expected a non-negative integer or digit string\n'`,
   and stdout `''`. Fails because the bin exits 0 and prints `"line": null`.
3. RED — findings.test.js, table-driven. One `test()` per row:
   `Given a JSON finding whose line is ${JSON.stringify(lineJson)}, when normalizeFindings runs, then it throws the invalid-line message`.
   Rows (raw JSON text): `"x"`, `" 12 "`, `" 12"`, `"12 "`, `""`, `"  "`, `"0x1A"`, `"-3"`,
   `"1.5"`, `"9007199254740993"`, `-3`, `1.5`, `null`, `true`, `false`, `[]`, `[12]`, `{}`,
   `1e400`, `9007199254740993`. Each fails because today's `Number()` coercion returns a value
   (`null`/`NaN`, `0`, `1`, `26`, `12`, `-3`, `1.5`, `9007199254740992`) instead of throwing.
4. RED — findings.test.js:
   `Given a JSON array whose second finding has an invalid line, when normalizeFindings runs, then it throws naming index 1`.
   Item 0 is valid and item 1 has `line: -3`. Assert
   `err.message === 'Finding at index 1 has an invalid line: expected a non-negative integer or digit string'`.
   Fails because the input normalizes to `line: -3` without throwing.
5. GREEN — add `DIGIT_STRING_PATTERN` and `resolveJsonLine`, and rewrite the `mapJsonItem` return,
   as in Context.
6. GUARD — findings.test.js, accepted lines, each `deepEqual` to its per-line twin through
   `normalizeFindings` (they pass today through `Number()` and still pass after GREEN):
   - `0` ↔ `HIGH a.js:0 — x`.
   - `1e3` (raw text) ↔ `HIGH a.js:1000 — x`.
   - `"12"` ↔ `HIGH a.js:12 — x`.
   - `"007"` ↔ `HIGH a.js:007 — x`.
   Titles:
   `Given a JSON finding whose line is ${JSON.stringify(lineJson)}, when normalizeFindings runs, then it equals the per-line record ${JSON.stringify(perLine)}`.
7. GUARD — findings.test.js:
   `Given a JSON finding with an unknown key and an invalid line, when normalizeFindings runs, then the unknown-field error wins`.
   Raw `[{ file: 'a.js', line: '12x', severity: 'HIGH', finding: 'x', column: 4 }]`. Assert
   `err.message === 'Finding at index 0 has an unknown field: "column"'`. It passes because
   `rejectUnexpectedFields` runs before `resolveJsonLine`.
8. GUARD (existing, no edits) — every per-line test, the JSON/per-line interchangeability tests
   (findings.test.js ~:63, bin ~:65-108), the status tests (~:259-330), and Part 1's all-accepted
   keys test. They pass because integer lines resolve to themselves and `parseLine` never calls
   `resolveJsonLine`.
9. REFACTOR — none expected. Confirm `mapJsonItem` and `resolveJsonLine` stay ≤ 20 lines, with no
   boolean parameters and no magic values (the pattern and the message template are the only
   literals).

### Gate

`cd engine && nice -n 19 node --test test/findings.test.js test/normalize-findings-bin.test.js > <scratch>/part2-gate.txt 2>&1; grep -E '^# (tests|pass|fail)|^not ok' <scratch>/part2-gate.txt`
(expect `# fail 0`). Then `nice -n 19 bash scripts/ci.sh` once, before the commit.

### Commit

`fix(findings): reject an invalid line in a JSON finding`
