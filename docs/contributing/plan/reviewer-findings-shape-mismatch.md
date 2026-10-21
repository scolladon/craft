# Plan — reviewer-findings-shape-mismatch

> Source: design doc `docs/contributing/design/reviewer-findings-shape-mismatch.md` · ADRs 667, 668
> The plan is the implementation script AND the knowledge handoff. Part agents start
> with zero context: whatever a part block omits is paid later as agent rediscovery.
> `plan-lint.sh` enforces the schema below — the plan phase cannot close without it.

Scope: option A only (ADR-667 ratified; ADR-668 writes the fix field `fix?`). Options B and C
(parser aliases in `engine/src/findings.js`) are NOT built. `engine/src` is unchanged.

Out-of-plan note: `docs/contributing/maintainer-smokes.md:181-182` quotes the old wording
("`file:line`, suggested fix"). The documentation phase rewords it to `file`, `line`, `fix`.
It is not a plan part.

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

## Part 1 — Align the reviewer contract's finding fields to the canonical shape

### Context

Defect: contracts/harness-read.md line 2 tells reviewers to emit
`{ file:line, severity, finding, suggested fix, status? }`; `normalize-findings` requires
`file`, `line`, `severity`, `finding` (engine/src/findings.js `REQUIRED_JSON_FIELDS`, line ~59) and
ignores unknown keys. A contract-shaped JSON array exits 2 with
`normalize-findings: Finding at index 0 missing required field: file`.

Files this part EDITS (two):

- `engine/test/normalize-findings-bin.test.js` — add test T1.
  - Current imports (lines 1-7): `test, after` from `node:test`; `assert` from
    `node:assert/strict`; `spawnSync`; `{ mkdtempSync, writeFileSync, rmSync }` from `node:fs`;
    `fileURLToPath`; `{ join, dirname }`; `tmpdir`. **Add `readFileSync` to the `node:fs` import.**
  - Existing helpers to reuse: `__dir` (line 9), `bin` (line 10), `runStdin(input)` (line 22,
    `spawnSync(process.execPath, [bin], { input, encoding: 'utf8' })`).
  - Test style in this file: section banners `// ─── <title> ───…`, `Given/When/Then` titles,
    `const sut = runStdin;` then AAA. Append T1 as a new section at the end of the file
    (after the nonexistent-file-path test, last line ~153).
  - Comments must not cite ADR/phase/backlog numbers (no provenance refs in tests).
- `contracts/harness-read.md` — line 2 only, the field list inside the braces.

Exact contract edit (rest of the line, `status is optional: …`, unchanged):

```diff
-Structured findings: each finding reported as { file:line, severity: CRITICAL|HIGH|MEDIUM|LOW, finding, suggested fix, status?: VERIFIED|SUSPECT|RULED-OUT|PROBE }. status is optional: tag each finding's claim status; when omitted it defaults to the actionable case for a plain defect.
+Structured findings: each finding reported as { file, line, severity: CRITICAL|HIGH|MEDIUM|LOW, finding, fix?, status?: VERIFIED|SUSPECT|RULED-OUT|PROBE }. status is optional: tag each finding's claim status; when omitted it defaults to the actionable case for a plain defect.
```

T1 code (from the design, dry-run verified: reads `[file:line, severity, finding, suggested fix, status]`
today → exit 2; reads `[file, line, severity, finding, fix, status]` after the edit → exit 0):

```js
// ─── contract-shaped JSON (live harness-read field list) → canonical, exit 0 ───

const HARNESS_READ_CONTRACT = join(__dir, '..', '..', 'contracts', 'harness-read.md');
// Declared independently of the parser so a contract field it cannot map fails loudly here.
const CONTRACT_FIELD_LIST_PATTERN = /Structured findings: each finding reported as \{([^}]+)\}/u;
const SAMPLE_BY_CONTRACT_FIELD = {
  file: 'src/a.js', line: 12, 'file:line': 'src/a.js:12',
  severity: 'HIGH', finding: 'x', fix: 'y', 'suggested fix': 'y', status: 'VERIFIED',
};

function contractFieldNames() {
  const match = readFileSync(HARNESS_READ_CONTRACT, 'utf8').match(CONTRACT_FIELD_LIST_PATTERN);
  if (match === null) throw new Error('contracts/harness-read.md names no finding field list');
  // "severity: CRITICAL|…" → "severity"; "status?: …" → "status"; "fix?" → "fix"; "file:line" stays whole.
  return match[1].split(',').map(entry => entry.trim().split(/\??: /u)[0].replace(/\?$/u, ''));
}

function contractShapedFinding() {
  return Object.fromEntries(contractFieldNames().map((name) => {
    if (!(name in SAMPLE_BY_CONTRACT_FIELD)) throw new Error(`no sample for contract field: ${name}`);
    return [name, SAMPLE_BY_CONTRACT_FIELD[name]];
  }));
}

test('Given a reviewer JSON array shaped exactly as the harness-read contract instructs, when normalize-findings runs, then it exits 0 with every field carried into the canonical finding', () => {
  const sut = runStdin;
  const input = JSON.stringify([contractShapedFinding()]);

  const result = sut(input);

  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout),
    [{ file: 'src/a.js', line: 12, severity: 'HIGH', finding: 'x', fix: 'y', status: 'VERIFIED' }]);
});
```

Notes on T1:
- `'file:line'` and `'suggested fix'` samples stay in `SAMPLE_BY_CONTRACT_FIELD`: they are what makes
  T1 build the legacy object today (RED by exit 2, not by a `no sample` throw), and they keep T1
  meaningful if the legacy wording is ever reintroduced.
- `"file:line"` survives the name split: `split(/\??: /u)` needs a colon followed by a space.

Read-only pins that must stay green with NO edits (R4):
- engine/test/findings.test.js `CONTRACT_STATUS_SET_PATTERN` (line ~334,
  `/status\??:\s*([A-Z-]+(?:\|[A-Z-]+)+)\s*\}/u`) — status set must stay the last field, before `}`.
- test/plugin-structure.test.js `contractSetFor(text, key)` (line ~331; used ~341 for `severity`,
  ~354 for `status`) — `severity: CRITICAL|…` and `status?: VERIFIED|…` substrings unchanged.
- engine/test/contract-equivalence.test.js `PHASE_EXPECTATIONS['harness-read']` markers
  (`Read-only`, `findings`, `Zero findings`) — untouched.
- engine/test/fixtures/contracts/harness-read.md is an assembly-order fixture, NOT the live
  contract: do not edit it.

Public surface: no new exported symbol (test-file-local helpers and constants only; contract
text is not an API). No barrel, registry or README surface gate applies.

### TDD steps

1. RED — T1 in `engine/test/normalize-findings-bin.test.js` (plus the `readFileSync` import).
   Run `node --test engine/test/normalize-findings-bin.test.js`. Expected failure: the live contract
   yields fields `[file:line, severity, finding, suggested fix, status]`; the bin exits 2 with
   stderr `normalize-findings: Finding at index 0 missing required field: file`, so
   `assert.equal(result.status, 0, …)` fails (actual 2). Any other failure reason (e.g. `no sample
   for contract field`, `names no finding field list`, `readFileSync is not defined`) means T1 is
   wrong — fix the test, not the contract.
2. GREEN — apply the one-line contract edit in `contracts/harness-read.md` (diff above). T1 passes:
   exit 0, stdout deep-equals the canonical finding.
3. GUARD — `node --test engine/test/findings.test.js test/plugin-structure.test.js
   engine/test/contract-equivalence.test.js engine/test/contract.test.js`: passes because the
   `severity: CRITICAL|…` and `status?: VERIFIED|… }` substrings are byte-identical and the
   equivalence markers are on other lines.
4. REFACTOR — none expected; keep T1's helpers file-local. No `engine/src` change.

### Gate

`nice -n 19 bash scripts/ci.sh` (pipe to a file under a scratch dir and grep for failures; do
not read the full output).

### Commit

`fix(contracts): name the canonical finding fields in the reviewer contract`
