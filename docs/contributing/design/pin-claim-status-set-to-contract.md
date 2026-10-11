# Design — pin the parser's claim-status set to the review contract

> Brief: `engine/src/findings.js` `STATUS_PREFIX_PATTERN` is a third copy of the
> claim-status set (beside `contracts/harness-read.md` and `agents/reviewer.md`); a
> structure test pins the agent to the contract, nothing pins the parser. Add an engine
> test tying the parser to the contract's `status?:` set. Test-only: no production
> change unless the test cannot reach the set otherwise.
> Status: draft → self-reviewed ×2 → accepted

## Context

Three copies of the claim-status set exist today:

| Copy | Location | Pinned by |
|---|---|---|
| contract | `contracts/harness-read.md:2` — `status?: VERIFIED\|SUSPECT\|RULED-OUT\|PROBE` | source of truth |
| agent | `agents/reviewer.md:21` — `{VERIFIED, SUSPECT, RULED-OUT, PROBE}` | `test/p10-structure.test.js:329` (sorted set equality, ADR-397) |
| parser | `engine/src/findings.js:40` — module-private `const STATUS_PREFIX_PATTERN = /^(VERIFIED\|SUSPECT\|RULED-OUT\|PROBE):\s+/u;` | nothing |

`STATUS_PREFIX_PATTERN` has one reader: private `parseLine(line)` (`findings.js:134-138`),
which peels an optional `<STATUS>: ` prefix off a per-line record before
`LINE_HEAD_PATTERN` parses `<severity> <file>:<line> — <finding> [| <fix>]`. Public
surface of the module: `normalizeFindings(raw)`, `parseScopeSpec(spec)`,
`filterFindings(findings, ranges, repoRoot = '')`. The pattern is not exported.

ADR-397 set the precedent for this kind of guard: duplicate a set only where a reader
needs it, and pin the copies with a test so CI fails on drift.

### What drift actually does (measured, not the backlog's wording)

The backlog entry says a contract-only status makes normalize-findings "silently drop"
it. Measured against `HEAD` (`node --input-type=module`, calling `normalizeFindings`
directly):

| Input | Result |
|---|---|
| `VERIFIED: HIGH src/a.js:1 — x` (likewise SUSPECT, RULED-OUT, PROBE) | `[{…, status: 'VERIFIED'}]` |
| `REFUTED: HIGH src/a.js:1 — x` (status not in the parser) | **throws** `Cannot parse findings: line does not match the per-line format: "REFUTED: HIGH src/a.js:1 — x"` |
| JSON `[{…, status: 'REFUTED'}]` | passes through unchanged (`status: 'REFUTED'`), already pinned by `findings.test.js:311` |

So the per-line layout fails loud, and it rejects the whole batch, not one finding
(`parseLineShape`, `findings.js:170-191`). JSON skips status validation entirely. Drift
is therefore not silent, but it fails at run time, on a real reviewer's output. The
review phase (`skills/review/SKILL.md:47`) then gets exit 2 from
`engine/bin/normalize-findings.js`. The validation phase (`skills/validation/SKILL.md:173`)
discards stderr (`2>/dev/null`) and sends the output down the NON-CANONICAL triager
branch. The guard moves that failure to CI.

### Stryker surface on the pattern (measured)

`.claude/workflow.md:11-13` declares the repo's validation technique as
`npm --prefix engine run mutation` → `stryker run engine/stryker.conf.json`, whose
`tap.testFiles` is `engine/test/**/*.test.js` (root `test/` is **not** in it). Narrowed
probe (throwaway `rsync` copy of the worktree, `mutate: engine/src/findings.js:40-40`,
`testFiles: engine/test/findings.test.js`, Stryker 8.7.1):

| Mutant on line 40 | Status at HEAD |
|---|---|
| `^` removed → `/(VERIFIED\|…\|PROBE):\s+/u` | Killed |
| `\s+` → `\S+` | Killed |
| `\s+` → `\s` | Survived — the documented `// equivalent mutant` at `findings.js:36-39` |

None of the generated mutants removes or alters an alternation branch. So no candidate
below can kill a new mutant on this line: the guard's value is drift detection, not
mutation score.

## Requirements

1. R1: when `contracts/harness-read.md` names a claim status that `parseLine` does not
   peel, the engine suite (`npm --prefix engine test`, run by `scripts/ci.sh` via
   `run_suite engine engine/test engine`) goes red, and the failure names the status.
2. R2: when the contract's `status?:` set cannot be extracted (shape changed, set
   emptied), the test fails. A vacuous pass is not allowed: an empty set round-trips to
   `[]` and would pass a bare `deepEqual` (see Design, edge behaviour).
3. R3: no change under `engine/src/` (the user prefers test-only). Exporting
   `STATUS_PREFIX_PATTERN` is allowed only if no test-only route meets R1, and the doc
   must say why.
4. R4: the full mutation run (`npm --prefix engine run mutation`) keeps a green dry run.
   The new test must not fail inside Stryker's sandbox, where `engine/src` files are
   instrumented.
5. R5: the existing `findings.test.js` status tests and `test/p10-structure.test.js`
   stay green and are not modified.
6. R6: no provenance references (ADR/backlog/phase numbers) in the test file.

## Design

### Drift-detection matrix (measured)

Three probe tests, one per candidate, were run in the throwaway copy under plain
`node --test`, with the contract and parser edited between runs (`GREEN` = test passes):

| Scenario | (a) behavioural | (b) source-read | (c) export |
|---|---|---|---|
| unchanged | GREEN | GREEN | GREEN |
| contract-only `+REFUTED` (the backlog's failure mode) | **RED** | **RED** | **RED** |
| parser-only `+REFUTED` | GREEN | RED | RED |
| both `+REFUTED` | GREEN | GREEN | GREEN |
| contract-only `−RULED-OUT` | GREEN | RED | RED |
| parser alternatives reordered | GREEN | GREEN | GREEN |
| parser rebuilt as a `new RegExp(…)` joined from a status array (behaviour-preserving) | GREEN | **RED** (false positive) | GREEN |
| **under Stryker** (full suite + probe, line 40 instrumented) | dry run OK, 2 killed / 1 survived (unchanged) | **dry run FAILS**: `There were failed tests in the initial test run`, so the whole mutation run aborts | dry run OK, 2 killed / 1 survived (unchanged) |

Why (b) fails under Stryker: the sandbox copy of `findings.js` holds the mutant schema,
so the declaration line read from disk is
`const STATUS_PREFIX_PATTERN = stryMutAct_9fa48("2") ? /^(…):\S+/u : stryMutAct_9fa48("1") ? … : (stryCov_9fa48("0", "1", "2"), /^(…):\s+/u);`
and a declaration-anchored extraction finds nothing. In `engine/test/`, (b) breaks R4.
In root `test/`, it is outside `tap.testFiles` and does not.

Coverage of the reverse direction: (a) cannot see a status that the parser accepts but
the contract does not name. A negative probe only pins a token it names in advance. It
cannot list the parser's extras without knowing the parser's set, which is exactly what
(a) avoids reading. Measured impact of that blind spot: none on what downstream can
receive. JSON-layout statuses already pass through unvalidated (`findings.test.js:311`),
and the reviewer is pinned to the contract, so it never emits the stale token. A
parser-only extra is unused acceptance, not a defect.

### Recommended shape — (a) behavioural, in `engine/test/findings.test.js`

Placed at the end of the `// ─── status field (optional)` section, just above the
`// ─── backward compatibility` header (`findings.test.js:333`):

```js
const HARNESS_READ_CONTRACT = join(__dir, '..', '..', 'contracts', 'harness-read.md');
const CONTRACT_STATUS_SET_PATTERN = /status\??:\s*([A-Z-]+(?:\|[A-Z-]+)+)\s*\}/u;
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

- Path idiom: `join(__dir, '..', '..', 'contracts', …)`, as in
  `contract-assemble-main.test.js:12` and `contracts-lint.test.js:12`. `__dir`,
  `readFileSync` and `join` are already imported at the top of `findings.test.js`.
- Contract extraction: the same regex as `contractSetFor(text, 'status')` in
  `test/p10-structure.test.js:310-314`. That helper is file-local in a CommonJS suite
  and not exported, so an ESM engine test cannot import it. Re-stating three lines
  beats adding a cross-module-system shared helper (KISS). Both copies fail loud on a
  contract shape change: p10 through its non-empty assertion, this test through R2.
- Failure mode on drift: `normalizeFindings` throws on the first unparsed line, and
  node:test reports the error. The message carries the offending line, so the status is
  named (R1). The error propagates; nothing catches it.
- Edge behaviour: an empty extracted set gives `raw = ''` → `normalizeFindings('')`
  returns `[]` → `deepEqual([], [])` would pass, so the `expected.length > 0` assertion
  carries R2. A contract status with a character outside `[A-Z-]` (e.g. `NEEDS_INFO`)
  would be truncated at extraction. The test still goes red (the partial token does not
  parse), but the message is misleading. The sibling p10 test has the same limit,
  accepted. The capture is anchored at the closing `}`, so a spaced pipe
  (`PROBE | REFUTED }`) yields no match and fails on the non-empty assertion instead of
  capturing the old set.
- Production change: none (R3). The test reaches the behaviour through the public
  `normalizeFindings`, so the export precondition in the brief is not met.

### Implementation context (single part)

| Item | Value |
|---|---|
| File changed | `engine/test/findings.test.js` only |
| Insert point | after the test ending at line 331 (`Given a status-bearing record without a fix…`), before line 333 `// ─── backward compatibility…` |
| Imports already present | `test` (node:test), `assert` (node:assert/strict), `readFileSync`, `fileURLToPath`, `join`, `dirname`, `normalizeFindings` |
| Existing locals to reuse | `__dir` (line 8) |
| New file-level names | `HARNESS_READ_CONTRACT`, `CONTRACT_STATUS_SET_PATTERN`, `STATUS_LESS_RECORD`, `contractStatusSet()` |
| Style anchors | `const sut = normalizeFindings;` then `const result = sut(raw)` (lines 303-305); GWT title |
| Untouched | `engine/src/findings.js`, `contracts/harness-read.md`, `agents/reviewer.md`, `test/p10-structure.test.js` |
| Run | `npm --prefix engine test 2>&1 \| tail -5`; full `bash scripts/ci.sh > /tmp/ci.out 2>&1; tail -20 /tmp/ci.out` |

## Decision candidates

| # | Choice | Alternatives (≤3) | Recommendation | Why |
|---|---|---|---|---|
| D1 | How the test observes the parser's claim-status set | (a) behavioural: feed each contract status through `normalizeFindings` and assert it round-trips — contract ⊆ parser; (b) source-read: read `engine/src/findings.js` text, extract the regex alternatives, assert set equality — must live in root `test/` (in `engine/test/` it aborts every full Stryker run, measured); (c) export `STATUS_PREFIX_PATTERN` and compare its `.source` alternatives — set equality, production change | (a) | Catches the backlog's failure mode (contract-only addition → RED, measured). No production change, Stryker-neutral (measured), and red only on observable behaviour. Its blind spot (parser-only extras) is unused acceptance: JSON statuses are unvalidated anyway. (b) gives a false RED on a behaviour-preserving refactor (measured) and needs a Stryker-safe placement. (c) is not justified, because the test reaches the set without it (R3). |
| D2 | Where the (a) test lives | (i) `engine/test/findings.test.js`, status section, contract regex re-stated locally; (ii) `test/p10-structure.test.js` beside the sibling ADR-397 pins, reusing `contractSetFor`, importing the ESM parser via `await import('../engine/src/findings.js')` | (i) | The brief asks for an engine test. The parser's behaviour tests and the `MAX_LINE_CHARS` "declared independently so drift fails loudly" idiom already live there, and the test stays inside Stryker's `testFiles`. (ii) saves three duplicated lines but adds the first ESM-from-CJS import into the process suite. |

## Test strategy

- The deliverable is one test. It passes against `HEAD` from the start, because the
  three copies agree today. TDD's RED is shown with the measured drift matrix above. The
  implementer repeats the `contract-only +REFUTED` row in a `mktemp` throwaway copy (never
  the worktree), confirms RED with the throw message naming `REFUTED`, then confirms GREEN
  on the real tree.
- R2 check (throwaway copy): replace the contract copy's `status?: VERIFIED|SUSPECT|RULED-OUT|PROBE` with `status?: free text`.
  The test must fail on the `expected.length > 0` assertion, not pass.
- R4 check: narrowed Stryker run as in Context (`mutate: engine/src/findings.js:40-40`,
  `testFiles` = `findings.test.js`). The expected result is the measured 2 killed /
  1 survived (the documented equivalent). Per the user's Stryker notes, a full-suite dry
  run is a memory-ceiling risk and is not needed to prove this.
- Suites: `npm --prefix engine test` and `bash scripts/ci.sh` green (engine + process
  suites, readme-drift, design-lint).
- No property-test lens: the change adds no parser or matcher; it drives an existing one.

## Out of scope

- Rewording the BACKLOG entry's "silently drops" claim: bookkeeping, owned by the close
  step. The measured behaviour is recorded here.
- Validating JSON-layout statuses against the contract: a production behaviour change.
  The current pass-through is pinned by `findings.test.js:311`.
- A shared contract-set extraction helper across `test/` and `engine/test/`: two
  3-line copies, both fail loud. A helper spanning CJS and ESM costs more than the
  copies save.
- Widening the contract extraction regex beyond `[A-Z-]`: no such status exists. The
  sibling p10 test has the same limit.
- Stryker's lack of an alternation-dropping regex mutant: a property of the tool, not
  of this repo.
