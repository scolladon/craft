# Plan — pin the parser's claim-status set to the review contract

> Source: design doc `docs/contributing/design/pin-claim-status-set-to-contract.md` · ADRs 448, 449
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

**How this plan applies them.** One part, the design's "Implementation context (single
part)". It adds one test and four file-local names to `engine/test/findings.test.js`, with
no `src/` delta: ADR 448 rules out a production change (the pattern stays module-private),
and ADR 449 puts the test in the engine findings suite. There is no implementation part for
the test to fold into, so the test-only exception applies. The part reverts on its own.

- **The worktree step is a GUARD, not a RED.** The contract, the agent and the parser agree
  today, so the new test passes against HEAD on its first run. The drift it exists to catch
  is shown in a `mktemp` throwaway copy with the contract edited there (Drift proofs below).
  The worktree's `contracts/`, `engine/src/` and `agents/` are never edited, not even
  temporarily.
- **README corpus count.** The plan commit bumps README.md l. 180 from "[40 parted plans]"
  to "[41 parted plans]". The part adds no design doc, plan or ADR, so it does not touch
  README.md.

**Public surface.** The plan introduces no exported symbol. `HARNESS_READ_CONTRACT`,
`CONTRACT_STATUS_SET_PATTERN`, `STATUS_LESS_RECORD` and `contractStatusSet()` are
module-local to the test file. `STATUS_PREFIX_PATTERN` in engine/src/findings.js stays
private (ADR 448). No barrel, registry, API report or doc surface changes.

**Binding for the part.**

- No provenance references (ADR numbers, design ids, phase or backlog ids) in
  `engine/test/findings.test.js`. The verbatim code below cites none.
- No suppression directives, no swallowed errors: the test lets `normalizeFindings`' throw
  propagate to node:test.
- Do not edit engine/src/findings.js, contracts/harness-read.md, agents/reviewer.md or
  test/p10-structure.test.js, and do not modify the existing status tests in
  `engine/test/findings.test.js`.
- Commit only `engine/test/findings.test.js` (`git add engine/test/findings.test.js` +
  `git commit`). Never touch the branch, the stash, or other files.
- Any command whose output may exceed ~100 lines writes to a scratch file; read back with
  `tail`/`grep`.

## Decision candidates

None open. ADR 448 (user-ratified) fixes the observation route: a behavioural round-trip
through the public `normalizeFindings`, no export, no production change. ADR 449 (adopted as
recommended) fixes the location: `engine/test/findings.test.js`, contract-set regex
re-stated locally rather than shared with test/p10-structure.test.js. The design's code
block is taken verbatim; no plan-level choice remains.

## Part 1 — Pin the parser's claim-status set to the harness-read contract

### Context

File this part edits (by hand): `engine/test/findings.test.js` (ESM, node:test).

Read-only references (do not edit):

- engine/src/findings.js l. 40 — module-private
  `const STATUS_PREFIX_PATTERN = /^(VERIFIED|SUSPECT|RULED-OUT|PROBE):\s+/u;`. Its only
  reader is private `parseLine(line)` (l. 134-138), which peels an optional `<STATUS>: `
  prefix before the line-head match. Public surface: `normalizeFindings(raw)`,
  `parseScopeSpec(spec)`, `filterFindings(findings, ranges, repoRoot = '')`. An unknown
  status prefix makes the line fail the per-line format, and `normalizeFindings` throws
  `Cannot parse findings: line does not match the per-line format: "<line>"` for the whole
  batch. `normalizeFindings('')` returns `[]`.
- contracts/harness-read.md l. 2 — the source of truth:
  `… suggested fix, status?: VERIFIED|SUSPECT|RULED-OUT|PROBE }`. It is the first
  `status?:` occurrence in the file.
- test/p10-structure.test.js l. 310-314 — `contractSetFor(text, 'status')`, the CommonJS
  sibling extraction the new regex mirrors (file-local there, not importable from ESM).

Current state of `engine/test/findings.test.js`:

- l. 1-6 imports, all already present, add none: `test` (node:test), `assert`
  (node:assert/strict), `readFileSync` (node:fs), `fileURLToPath` (node:url), `join`,
  `dirname` (node:path), `normalizeFindings, parseScopeSpec, filterFindings` from
  `'../src/findings.js'`.
- l. 8 `const __dir = dirname(fileURLToPath(import.meta.url));` — reuse it.
- l. 15-18 precedent idiom: `MAX_LINE_CHARS` mirrors a module-private value, "declared
  independently (not imported) so a drift between the two fails loudly".
- The `// ─── status field (optional)` section ends with the test titled
  `Given a status-bearing record without a fix, when normalizeFindings runs, then the output key order is file, line, severity, finding, status`
  (closes at l. 331). l. 332 is blank; l. 333 is
  `// ─── backward compatibility: existing fixtures gain no status key ────────────`.
- Style anchors: GWT titles, AAA body, `const sut = normalizeFindings;` then
  `const result = sut(raw);` (l. 303-305).
- Suite size at HEAD: `node --test engine/test/findings.test.js` reports 112 pass, 0 fail.

Insert this block verbatim between l. 331's closing `});` + blank line and l. 333's
`// ─── backward compatibility` header (one blank line before the header, as elsewhere):

```js
const HARNESS_READ_CONTRACT = join(__dir, '..', '..', 'contracts', 'harness-read.md');
const CONTRACT_STATUS_SET_PATTERN = /status\??:\s*([A-Z-]+(?:\|[A-Z-]+)+)/u;
const STATUS_LESS_RECORD = 'HIGH src/a.js:1 — finding';

function contractStatusSet() {
  const match = readFileSync(HARNESS_READ_CONTRACT, 'utf8').match(CONTRACT_STATUS_SET_PATTERN);
  return match ? match[1].split('|') : [];
}

test('Given each claim status the harness-read contract names, when a per-line record carrying it is normalized, then every status round-trips in contract order', () => {
  const expected = contractStatusSet();
  const raw = expected.map(status => `${status}: ${STATUS_LESS_RECORD}`).join('\n');
  const sut = normalizeFindings;

  const result = sut(raw).map(finding => finding.status);

  assert.ok(expected.length > 0, 'contracts/harness-read.md should name a claim-status set');
  assert.deepEqual(result, expected);
});
```

Why each piece (do not "simplify" them away):

- `expected.length > 0` is load-bearing: an empty extracted set gives `raw = ''`, which
  normalizes to `[]`, and `deepEqual([], [])` would pass vacuously.
- No try/catch: on drift `normalizeFindings` throws on the unknown-status line, and the
  error message carries that line, so node:test's report names the status.
- The contract is read from disk, not from engine/src, so Stryker's instrumented
  `findings.js` in its sandbox does not affect the extraction (a source-read of the
  pattern would abort the dry run; that is why ADR 448 rejected it).

Measured during planning (throwaway copy, this exact block): 113 pass / 0 fail on the
unchanged tree; Drift proof 1 and 2 fail with the messages quoted below; the narrowed
Stryker run reports "Initial test run succeeded", 2 killed, 1 survived.

### TDD steps

GUARD 1: insert the block above, then run
`node --test engine/test/findings.test.js > "$TMPDIR/findings.out" 2>&1; grep -n '^# pass\|^# fail' "$TMPDIR/findings.out"`.
Expected: `# pass 113`, `# fail 0`. Why it passes: the contract names
`VERIFIED|SUSPECT|RULED-OUT|PROBE`, exactly the four alternatives `STATUS_PREFIX_PATTERN`
peels, so each `<STATUS>: HIGH src/a.js:1 — finding` line normalizes to a finding whose
`status` is that token, in input order. If it fails on its first run, its GREEN lies outside
the part (engine/src/findings.js or contracts/harness-read.md): stop and hand back a blocker
carrying
`PLAN-MISMATCH(Given each claim status the harness-read contract names, when a per-line record carrying it is normalized, then every status round-trips in contract order): the plan expected it to pass; it failed on its first run`.
Do not edit either file.

Drift proofs (throwaway only; they show the RED the GUARD exists to raise, without breaking
the worktree). Build the copy after GUARD 1 so it carries the new test:

```bash
W=$(git rev-parse --show-toplevel)
T=$(mktemp -d)
rsync -a --exclude node_modules --exclude .git --exclude engine/.stryker-tmp "$W/" "$T/"
cp "$T/contracts/harness-read.md" "$T/harness-read.orig"
```

Drift proof 1 (R1, contract-only addition), in `$T` only:

```bash
sed -i '' 's/status?: VERIFIED|SUSPECT|RULED-OUT|PROBE/status?: VERIFIED|SUSPECT|RULED-OUT|PROBE|REFUTED/' "$T/contracts/harness-read.md"
(cd "$T" && node --test engine/test/findings.test.js > "$T/out1.txt" 2>&1)
grep -n '^not ok\|error:\|^# fail' "$T/out1.txt"
```

Expected: the new test is `not ok`, `# fail 1`, and its error reads
`Cannot parse findings: line does not match the per-line format: "REFUTED: HIGH src/a.js:1 — finding"`.
The parser does not peel `REFUTED`, so the line fails the per-line format and the batch
throws, naming the status.

Drift proof 2 (R2, unextractable set), in `$T` only:

```bash
cp "$T/harness-read.orig" "$T/contracts/harness-read.md"
sed -i '' 's/status?: VERIFIED|SUSPECT|RULED-OUT|PROBE/status?: free text/' "$T/contracts/harness-read.md"
(cd "$T" && node --test engine/test/findings.test.js > "$T/out2.txt" 2>&1)
grep -n '^not ok\|error:\|^# fail' "$T/out2.txt"
```

Expected: the new test is `not ok`, `# fail 1`, error
`contracts/harness-read.md should name a claim-status set`. The extraction finds no set, so
the non-empty assertion fails instead of a vacuous `deepEqual([], [])` pass.

Drift proof 3 (R4, Stryker-neutral), in `$T` with the contract restored:

```bash
cp "$T/harness-read.orig" "$T/contracts/harness-read.md"
ln -s "$W/engine/node_modules" "$T/engine/node_modules"
cat > "$T/stryker.narrow.json" <<'EOF'
{
  "testRunner": "tap",
  "coverageAnalysis": "perTest",
  "tap": { "testFiles": ["engine/test/findings.test.js"] },
  "mutate": ["engine/src/findings.js:40-40"],
  "concurrency": 2,
  "tempDirName": "engine/.stryker-tmp",
  "reporters": ["clear-text"]
}
EOF
(cd "$T" && engine/node_modules/.bin/stryker run stryker.narrow.json > "$T/stryker.out" 2>&1); echo "exit=$?"
grep -n 'Initial test run\|killed\|Survived' "$T/stryker.out"
```

Expected: exit 0, `Initial test run succeeded`, `engine/test/findings.test.js (killed 2)`,
one `[Survived] Regex` (the documented `\s+` → `\s` equivalent mutant at
engine/src/findings.js l. 36-39). The config file is the positional argument; there is no
`--config-file` flag. Do not run the full-suite mutation run: its dry run is a memory-ceiling
risk and proves nothing more here.

Then `rm -rf "$T"`. Report each drift proof as a one-line observation in the handback (not as
a RED/GREEN cycle: no GREEN is owed, the worktree code already satisfies the test).

GREEN: none. No production change (ADR 448).

REFACTOR: none expected. If the new test's title or names collide with an existing one
(`grep -n 'HARNESS_READ_CONTRACT\|contractStatusSet\|STATUS_LESS_RECORD\|CONTRACT_STATUS_SET_PATTERN' engine/test/findings.test.js`
must show only the inserted lines), rename within the inserted block only.

### Gate

`npm --prefix engine test 2>&1 | tail -5` — expect `# fail 0`.

Phase gate (run by the orchestrator, or by the part before committing if turn budget
allows): `bash scripts/ci.sh > "$TMPDIR/ci.out" 2>&1; tail -20 "$TMPDIR/ci.out"` — green.

### Commit

`test(findings): pin the parser's claim-status set to the harness-read contract`
