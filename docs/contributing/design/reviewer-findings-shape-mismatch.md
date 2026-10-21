# Design — reviewer-findings-shape-mismatch

> Brief: the reviewer contract (`contracts/harness-read.md:2`) tells reviewers to emit
> `{ file:line, severity, finding, suggested fix, status? }`, but `normalize-findings` only
> accepts the canonical `{file, line, severity, finding, fix?, status?}`. A reviewer that
> follows the contract to the letter makes the bin exit 2.
> Status: draft → self-reviewed ×3

## Context

### Surfaces

| Surface | Location | State today |
|---|---|---|
| Reviewer contract (injected verbatim into every reviewer spawn by `contract-assemble`) | `contracts/harness-read.md:2` | `Structured findings: each finding reported as { file:line, severity: CRITICAL\|HIGH\|MEDIUM\|LOW, finding, suggested fix, status?: VERIFIED\|SUSPECT\|RULED-OUT\|PROBE }. status is optional: …` |
| Canonical type | `engine/src/findings.js:1-3` typedef `Finding` | `{ file, line, severity, finding, fix?, status? }` |
| Required JSON fields | `engine/src/findings.js:59` `REQUIRED_JSON_FIELDS` | `['file', 'line', 'severity', 'finding']` |
| JSON item mapper | `engine/src/findings.js` `mapJsonItem(item, index)` | `in`-checks each required field, then `toFinding(item)`; unknown keys are ignored |
| Builder | `engine/src/findings.js` `toFinding({ file, line, severity, finding, fix, status })` | Destructures canonical names only |
| Per-line parser | `engine/src/findings.js` `parseLine` / `LINE_HEAD_PATTERN = /^(\S+)\s+(\S+):(\d+)\s+[—–-]\s+(.*\S)$/u` | `<severity> <file>:<line> — <finding> [ \| <fix> ]`, optional `<STATUS>: ` prefix |
| Entry | `engine/src/findings.js` `normalizeFindings(raw)` (exported) → `parseJsonShape` when the trimmed input starts with `[`, else `parseLineShape` | — |
| Bin | `engine/bin/normalize-findings.js` → `engine/src/normalize-findings-main.js` `main(argv, io)` | Exit 0 + canonical JSON on stdout; exit 2 + `normalize-findings: <message>` on stderr |
| Review consumer | `skills/review/SKILL.md:47-50` | Pipes each reviewer's raw output through the bin and documents the canonical shape as its output. States no route for exit 2 |
| Validation consumer | `skills/validation/SKILL.md:181` | Exit ≠ 0 → `NON-CANONICAL` route to the triager |
| Reviewer agent | `agents/reviewer.md` | Names the severity and claim-status sets; final message is "the structured findings list". Names no field shape |
| Maintainer-smokes prose | `docs/contributing/maintainer-smokes.md:181-182` | "the per-line shape (`file:line`, suggested fix) still comes only from the phase" — quotes the contract's current wording |

### Existing pins on the contract line

The contract line is already read by two tests. Any rewording must keep both green:

| Test | Regex it applies to `contracts/harness-read.md` | Constraint on the line |
|---|---|---|
| `engine/test/findings.test.js` `CONTRACT_STATUS_SET_PATTERN` (ADR-448/449) | `/status\??:\s*([A-Z-]+(?:\|[A-Z-]+)+)\s*\}/u` | The status set must be the **last** field, directly followed by `}` |
| `test/plugin-structure.test.js` `contractSetFor(text, 'severity')` / `contractSetFor(text, 'status')` | `` `${key}\??:\s*([A-Z-]+(?:\|[A-Z-]+)+)` `` | `severity: CRITICAL\|…` and `status?: VERIFIED\|…` keep their `key: SET` shape |
| `engine/test/contract-equivalence.test.js` `PHASE_EXPECTATIONS['harness-read']` | markers `Read-only`, `findings`, `Zero findings` | Untouched by any option |

No test pins the field names `file:line` or `suggested fix`: a repo-wide grep finds them only in
the contract, the maintainer-smokes prose and dated design/plan/ADR records.
`engine/test/fixtures/contracts/harness-read.md` is a fixture (`{file:line, severity, finding, fix}`)
read by `engine/test/contract.test.js` for assembly ordering only. It is not the live contract.

### Pinned behaviour (probe, `node engine/bin/normalize-findings.js <file>`, 2026-10-21)

Run from a scratch directory against this worktree's `HEAD` (`610c9ea`).

| # | Input | Exit | Output |
|---|---|---|---|
| P1 | `[{"file:line":"src/a.js:12","severity":"HIGH","finding":"x","suggested fix":"y","status":"VERIFIED"}]` (contract-shaped) | 2 | `normalize-findings: Finding at index 0 missing required field: file` |
| P2 | `[{"file":"src/a.js","line":12,"severity":"HIGH","finding":"x","fix":"y"}]` (canonical) | 0 | canonical, `fix: "y"` |
| P3 | canonical fields plus `"suggested fix":"y"` instead of `fix` | 0 | canonical, **no `fix` key**: the fix is dropped silently |
| P4 | `file`, `line` **and** `"file:line":"src/b.js:3"` | 0 | `file: "src/a.js"`: the alias key is ignored silently |
| P5 | `HIGH src/a.js:12 — x \| y` (per-line) | 0 | canonical with `fix` |
| P6 | `VERIFIED: HIGH src/a.js:12 — x \| y` | 0 | canonical with `fix` and `status` |
| P7 | `HIGH C:/a.js:12 — x` | 0 | `file: "C:/a.js"`: the per-line head is greedy, so the last colon splits |
| P8 | `[]` | 0 | `[]` |

P1 is the reported defect. P3 and P4 matter to every option: `mapJsonItem` ignores unknown keys,
so a half-migrated emission (canonical location, legacy `suggested fix`) loses its fix with exit 0.

### Why one install cannot mix versions

The contract, the bin and both skills ship in the same plugin tree, and `contract-assemble` reads
the contract from that tree at spawn time. So a reviewer spawned by a given install always gets that
install's contract. The legacy shape can only reach the parser from (a) the current contract text,
(b) a model's prior habits, or (c) a user-authored `context:` file or custom agent that copied the
old wording.

### House patterns this must follow

- **Fail loud, never drop silently.** `parseLineShape` throws on any unparseable line.
  `parseScopeSpec` rejects ambiguous and swallowed entries (`SWALLOWED_ENTRY_PATTERN`) and requires
  the explicit `:*` marker instead of inferring a whole-file grant. Each of those comments names
  the silent drop or silent widen it prevents.
- **Last colon splits path from position.** `SCOPE_ENTRY_PATTERN = /^(.+):(\d+)-(\d+)$/u` and
  `LINE_HEAD_PATTERN`'s `(\S+):(\d+)` both give colons inside the path to the path.
- **Interchangeability (ADR-019, ADR-277).** JSON and per-line inputs carrying the same finding
  must normalize to byte-identical output. Key order is pinned as `file, line, severity, finding, fix?, status?`.
- **Behavioural contract pins (ADR-448).** The contract's status set is pinned by driving it
  through `normalizeFindings`, not by reading the parser source. ADR-449 puts that pin in
  `engine/test/findings.test.js`.

## Requirements

- R1 — A reviewer JSON array whose field names are exactly those `contracts/harness-read.md`
  names normalizes with exit 0. Every value it carries (location, severity, finding, fix, status)
  survives into the canonical output.
- R2 — A test derives the field set from the live contract text and fails when the contract
  names a field the parser cannot map. It is the field-shape sibling of the ADR-448 status pin, and
  it is the RED test.
- R3 — No currently accepted input changes its output. That covers every existing fixture and
  test, P2 and P5–P8.
- R4 — Neither the contract-status pin nor the plugin-structure set pins go red.
- R5 — Any input the chosen option still cannot map exits 2 with a message that names the field.
  It never exits 0 with a value dropped. P3/P4 are scoped per option below: option A leaves them
  as they are (see Out of scope), B and C close them for the alias keys.

## Design

The three options from the brief, each specified fully enough for the plan to follow whichever one
the user picks. The shared RED test (Test strategy, T1) is the same for all three.

### Option A: align the contract text to the canonical shape

**Change.** Edit only `contracts/harness-read.md` line 2, the field list inside the braces:

```diff
-Structured findings: each finding reported as { file:line, severity: CRITICAL|HIGH|MEDIUM|LOW, finding, suggested fix, status?: VERIFIED|SUSPECT|RULED-OUT|PROBE }. status is optional: …
+Structured findings: each finding reported as { file, line, severity: CRITICAL|HIGH|MEDIUM|LOW, finding, fix?, status?: VERIFIED|SUSPECT|RULED-OUT|PROBE }. status is optional: …
```

The rest of the line (`status is optional: tag each finding's claim status; …`) is unchanged.
Whether the fix is written `fix?` or `fix` is decision D2.

**Pin compatibility.** `severity: CRITICAL|…` and `status?: VERIFIED|… }` keep their exact
substrings, so `CONTRACT_STATUS_SET_PATTERN` and both `contractSetFor` reads match as before (R4).
`engine/src` is unchanged.

**Downstream prose.** `docs/contributing/maintainer-smokes.md:181-182` quotes the old wording
("`file:line`, suggested fix"). That line describes the eval grader, which accepts any order and
case, so its meaning holds. The documentation phase rewords the quote to `file`, `line`, `fix` so
it does not cite a field set that no longer exists. That is documentation, not contract text.

**Residual.** P1 still exits 2 for a model that keeps the legacy shape out of habit, or a user
`context:` file that copied the old wording. The validation consumer routes exit 2 to its triager.
The review consumer states no route for it, and fixing that is review-skill restructuring, which
is out of scope. P3 (legacy `suggested fix` beside canonical keys) still drops the fix silently.

### Option B: teach `normalizeFindings` the two aliases

**Change.** `engine/src/findings.js` only. The contract text stays as it is.

New module-private constants, next to `REQUIRED_JSON_FIELDS`:

```js
// The reviewer contract's combined location key. Greedy head: the LAST colon splits,
// as in SCOPE_ENTRY_PATTERN, so a colon inside the path stays in the path.
const LOCATION_ALIAS = 'file:line';
const LOCATION_ALIAS_PATTERN = /^(.+):(\d+)$/u;
const FIX_ALIAS = 'suggested fix';
```

New helpers, each a few lines long, called from `mapJsonItem` before the required-field loop:

```js
// mapJsonItem(item, index), after the object check:
const resolved = resolveFixAlias(resolveLocationAlias(item, index), index);
for (const field of REQUIRED_JSON_FIELDS) { if (!(field in resolved)) throw … }  // message unchanged
return toFinding(resolved);
```

| Helper | Input | Behaviour |
|---|---|---|
| `resolveLocationAlias(item, index)` | raw object | No `file:line` key → returns `item` unchanged. Key present and `file` **or** `line` also present → throws `Finding at index ${index} carries both file:line and file/line`. Value not a string, or not matching `LOCATION_ALIAS_PATTERN` → throws `Finding at index ${index} has a malformed file:line: ${JSON.stringify(value)}`. Otherwise returns a new object without `file:line`, with `file: match[1]` and `line: match[2]` (`toFinding` already applies `Number()`). |
| `resolveFixAlias(item, index)` | output of the above | No `suggested fix` key → unchanged. Both `fix` and `suggested fix` → throws `Finding at index ${index} carries both fix and suggested fix`. Otherwise returns a new object with `fix` set to the alias value and the alias key removed. |

Both return new objects, so nothing is mutated. Key order in the output is still fixed by
`toFinding`, so ADR-277's pinned order holds.

**Edge matrix (B).**

| Input | Result |
|---|---|
| `"file:line": "src/a.js:12"` | `file: "src/a.js"`, `line: 12` |
| `"file:line": "C:/x/a.js:12"` | `file: "C:/x/a.js"`, `line: 12` (last colon) |
| `"file:line": "src/a.js"` (no line) | throws malformed |
| `"file:line": "src/a.js:12-14"` (range) | throws malformed. A range is a scope-spec shape, not a finding location |
| `"file:line": "src/a.js:"` / `":12"` | throws malformed (`.+` and `\d+` both need at least one character) |
| `"file:line": 12` (non-string) | throws malformed |
| `file:line` + `file` (P4) | throws "carries both". This closes P4 for the alias |
| `suggested fix` + canonical location (P3) | `fix` carried. This closes P3 for the alias |
| `suggested fix` + `fix` | throws "carries both" |
| `"suggested fix": null` | `fix` omitted, the same as `fix: null` today (`toFinding`'s `!= null`) |
| Neither alias present | byte-identical to today (R3) |

**Per-line shape.** Unchanged. The contract's braces describe an object, and the per-line grammar
already carries `file:line` and ` | fix`.

**Cost.** Two branches, three constants and two helpers in a module whose Stryker survivors are
documented one by one (the `equivalent mutant` comments). A shape no current prompt would teach,
once option A has landed, stays in the parser for good.

### Option C: both

Apply A and B. The contract teaches the canonical shape, and the parser also accepts the two
legacy aliases for habit-driven or user-copied emissions, with the fail-loud conflict rules from B.
Costs and pins are the sum of A's and B's. A's residual (exit 2 on legacy JSON with no review-side
route, and the P3 silent fix drop) is closed by B's aliases.

### Comparison

| | A | B | C |
|---|---|---|---|
| Files changed (production) | `contracts/harness-read.md` | `engine/src/findings.js` | both |
| Root cause (contract ≠ parser) removed | yes | no: the contract keeps teaching a non-canonical shape that the parser then translates | yes |
| Legacy emission (P1) | exit 2 | exit 0 | exit 0 |
| P3 silent fix drop for `suggested fix` | remains | closed | closed |
| New parser surface / mutants | none | 2 helpers, 1 regex, 3 throw sites | same as B |
| Contract stays the single source of the shape | yes | no: two vocabularies stay valid indefinitely | partly: canonical taught, legacy tolerated |

## Decision candidates

| # | Choice | Alternatives (≤3) | Recommendation | Why |
|---|---|---|---|---|
| D1 | How to close the contract ↔ parser mismatch | (A) align `contracts/harness-read.md:2` to `{ file, line, severity, finding, fix?, status? }`; (B) teach `normalizeFindings` the `file:line` and `suggested fix` aliases with fail-loud conflict and malformed rules; (C) both | **A** | The contract is the only thing in an install that teaches the legacy shape, and one install cannot mix contract and parser versions. Fixing the contract removes the root cause with no new parser surface. B keeps two vocabularies valid indefinitely in a module built to fail loud. T1 pins the contract's field set to the parser, so the mismatch cannot come back unnoticed. Choose C instead if you weigh habit-driven legacy emissions, which would exit 2 with no review-side route, above the cost of the alias code. |
| D2 | (A/C only) How the contract writes the fix field | (a) `fix?` (optional marker, mirrors the typedef and `status?`); (b) `fix` (required in wording, optional in the parser, like today's `suggested fix`) | **(a) `fix?`** | The typedef, the review skill's output description and the parser all treat fix as optional. A finding about a missing test may have no fix to state. The contract should not ask for more than the parser needs. |
| D3 | (B/C only) What happens when an alias and its canonical key are both present | (a) throw "carries both"; (b) prefer the canonical key silently (today's P4 behaviour) | **(a) throw** | Two locations or two fixes for one finding are ambiguous. Silently picking one is the silent drop that the module's scope-spec rules (`SWALLOWED_ENTRY_PATTERN`, required `:*`) already refuse. |

## Test strategy

TDD, London-style naming (`Given/When/Then`, AAA, `sut`). Engine suites run under `node --test`.
Stryker scope is `engine/src/findings.js` for B/C only. A changes no engine source.

### T1: the RED test (all options)

Home: `engine/test/normalize-findings-bin.test.js`. It drives the real bin, the same command that
failed in the smoke. A reviewer JSON array is built **from the live contract's field list**, so it
is red today and green under A, B or C:

```js
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

RED today: exit 2, `missing required field: file` (P1). The extraction and bin call were
dry-run in a scratch script: against the live contract it reads
`[file:line, severity, finding, suggested fix, status]` and exits 2. Against a copy carrying A's
line it reads `[file, line, severity, finding, fix, status]` and exits 0 with the expected finding,
and both pin regexes still extract their sets. The test also fails loud when a future
contract names a field with no sample (`no sample for contract field`) or loses its field list.
The `Structured findings: …` anchor makes T1 a third reader of contract line 2. Any rewording of
its lead-in must be mirrored here, as ADR-449 already notes for the status pin.

### Option A tests

- T1 goes green on the contract edit alone.
- Regression: `engine/test/findings.test.js` status pin (`CONTRACT_STATUS_SET_PATTERN`) and
  `test/plugin-structure.test.js` severity and claim-status set pins stay green (R4), with no edits.
- No new engine unit tests: no engine code changes.

### Option B tests (in `engine/test/findings.test.js`, a new `JSON aliases` section)

One test per row of the B edge matrix:
- Alias round-trip: `file:line` + `suggested fix` gives the canonical finding, deep-equal to the
  per-line form `HIGH src/a.js:12 — x | y` (ADR-019 interchangeability).
- Last-colon split: `C:/x/a.js:12`.
- Malformed `file:line`: no line, range `12-14`, empty path, empty line, non-string. Each is
  `assert.throws` with an exact message (the suite asserts exact messages, `findings.test.js:536`).
- Conflicts: `file:line`+`file`, `file:line`+`line`, `fix`+`suggested fix` each throw "carries both" (D3a).
- `"suggested fix": null` gives no `fix` key.
- Key order `file, line, severity, finding, fix, status` for an alias-built finding.
- Bin: one exit-2 test for a conflict, to show the throw reaches stderr through `main`.
- Stryker over `engine/src/findings.js`, one module per run at concurrency 1. Every new
  survivor is killed or carries an `equivalent mutant` justification in the suite's existing
  comment style.

### Option C tests

The union of A and B. T1 goes green on the contract edit. B's alias tests then pin the tolerance
separately, because once the contract is canonical T1 no longer exercises the alias path.

## Out of scope

- Any other line of `contracts/harness-read.md`, and every other contract: the brief bounds the
  change to the findings field shape.
- A review-skill route for normalize-findings exit 2 (`skills/review/SKILL.md:47-50`):
  review-skill restructuring, excluded by the brief.
- Rejecting unknown JSON keys in general (the general case behind P3/P4): it would change
  acceptance for inputs that pass today. Only the two contract aliases are addressed, and only
  under B/C.
- `engine/test/fixtures/contracts/harness-read.md`: an assembly-order fixture, not the injected
  contract.
- Fenced (```` ```json ````) reviewer output: today it exits 2 as an unparseable per-line record.
  That is a separate input shape from the contract mismatch.
