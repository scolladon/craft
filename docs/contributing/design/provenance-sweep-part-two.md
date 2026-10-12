# Design — provenance-sweep-part-two

> Brief: close the two BACKLOG.md entries scoped 2026-10-12. (A) Single-letter rule ids in
> shipped code comments: decide per id whether it is provenance (strip it) or a stable in-repo
> rule name (keep it), and teach the class-E test the difference. (B) Provenance refs in tests:
> clean the comment and title hits in one sweep, decide whether a rule scoped to comments and
> titles can hold over tests without a fixture allowlist, and decide on the
> `test/p{10,20,22}-*.test.js` file names.
> Status: draft → self-reviewed ×3

Entry key, used only in this doc and never in planned source or test:

| Key | BACKLOG.md line | Entry |
|---|---|---|
| A | :180 | "Single-letter rule ids still sit in shipped code comments." |
| B | :190 | "Provenance refs in tests are unguarded." |

Every fact below was re-checked in the worktree at `dbfecb4` (git 2.56.0, node v22.22.3, darwin).
Probes that create repositories or run the suite on a modified tree ran in mktemp throwaways,
shown as `<tmp>`. Every `git grep` ran with `GIT_LITERAL_PATHSPECS`, `GIT_DIR`, `GIT_WORK_TREE`
and `GIT_INDEX_FILE` unset.

## Context

### Toolchain and gates

- No root `package.json`. Phase gate: `bash scripts/ci.sh`. Engine part gate:
  `npm --prefix engine test` (`engine/test/findings.test.js:611` is a sub-millisecond timing
  flake; rerun once before treating it as red). Root suites run inside ci.sh, which finds
  `test/*.test.js` with `find` (`scripts/ci.sh:21`), so no file name is hard-coded.
- `readme-drift` is not part of ci.sh. It runs as its own GitHub job
  (`.github/workflows/ci.yml:39`) and counts `*.md` files per corpus directory
  (`engine/src/readme-drift-main.js:119`). README.md:180 claims 52 design docs, 51 plans and
  488 ADRs. This doc makes it 53, so the run must bump the receipts in a docs commit.
- stub-lint bans `TODO|FIXME|HACK|XXX|PLACEHOLDER|STUB` case-insensitively in touched non-test
  code (`engine/src/stub-lint-main.js:12`; scope at `scripts/ci.sh:108-121`, which skips `*.test.js`
  and `test/` trees). That makes it relevant only to the Part 6 comments in `engine/src`.

### Class E today

`contracts/core.md:4`: "No provenance refs (phase/ADR/backlog numbers) in source or test."
ADR-485 put a mechanical guard on the source half only. Its decision text says "Tests,
skills and templates are out of its scope." Shape, in `test/source-hygiene.test.js`:

- :126-128, a comment explaining the scope ("Shipped code only: tests, skills and templates carry
  such tokens as fixture data …").
- :129 `PROVENANCE_REF_PATTERN = '\\b(ADR-?\\d+|P\\d+|Part\\s+\\d+|backlog\\s*#\\d+|DC-\\d+)\\b'`.
- :130-140 `SHIPPED_CODE_PATHSPECS` (`engine/src`, `engine/bin`, `hooks`, `scripts`,
  `:(glob)adapters/*/{src,bin,extensions,hooks,plugins}/**`).
- :142-156 `listProvenanceRefLines(cwd, env = process.env)`: `git grep -n -i -P` under
  `withoutAmbientGitScope(env)` (:92). `GIT_GREP_NO_MATCH` (:74) → `[]`. Every other failure
  propagates.
- Helpers to reuse: `LOCATED_LINE_PATTERN` (:77), `GIT_NOT_A_REPOSITORY` (:75),
  `hermeticGitEnv()` (:469), `withThrowawayRepo(files, assertOnRepo)` (:473-487), which already
  creates parent dirs.
- Unit tests :530-:574: a scope test (an `engine/test` comment is NOT reported), ambient
  `GIT_LITERAL_PATHSPECS`, BACKLOG.md and `SC5-*` non-matches, non-repo propagation.
  Whole-tree test :576-:585.

Precedent for test-side provenance checks: ten adapter suites hold their own whole-file
`PROVENANCE_REF` regex over their shipped surfaces (e.g. `adapters/codex/test/native-surface.test.js:40`).
`test/p10-structure.test.js:228-246` and `test/p22-memory.test.js:89-98` grep named files for
`P21|ADR` and `P22|ADR-[0-9]`.

### A — pinned facts

`git grep -n -P '\b[RTF]\d+\b'` over `SHIPPED_CODE_PATHSPECS` gives exactly 3 hits. The backlog's
"1 false positive" no longer reproduces case-sensitively:

| Line | Id | In-repo definition |
|---|---|---|
| `engine/src/findings.js:197` ` * Accepts two shapes interchangeably (R10 — key on fields, never on layout):` | R10 | none (review/requirement id) |
| `engine/src/observability/adapters/claude/telemetry.js:59` `// F6: coerce non-finite values …` | F6 | none (review-finding id) |
| `engine/src/observability/metrics-line.js:9` ` * a declared composition root, so R3 in test/architecture-boundaries.test.js` | R3 | `test/architecture-boundaries.test.js:149` `// R3 — vendor bindings are wired up in exactly one place: the declared …` and the `R3 FAIL —` message |

The class-E scan runs with `-i`. Pinned in `<tmp>` (git 2.56.0, `git grep -n -i -P`):

| Pattern | `// F6: x` | `// R3 in test/architecture-boundaries.test.js` | `cut -d" " -f2-` | `// r1 lower` | `// see R10 here` |
|---|---|---|---|---|---|
| `\b(…\|[RF]\d+)\b` under `-i` | hit | hit | **hit** | **hit** | hit |
| `\b(…\|(?-i:[RF]\d+))\b` under `-i` | hit | hit | — | — | hit |
| `\b(…\|(?-i:[RF]\d+)(?! in test/architecture-boundaries\.test\.js))\b` | hit | — | — | — | hit |

On the live tree, the `-i` form also hits `scripts/run-ledger.sh:214` (`cut -d' ' -f2-`).
The id alternation therefore has to be case-sensitive inside the `-i` scan, and PCRE's inline
`(?-i:…)` does that.

Test-side twins of the same ids (`git grep -n -P '\b[RTF]\d+\b' -- engine/test ':(glob)adapters/*/test/**' test`):
43 lines. 18 are in `test/architecture-boundaries.test.js`, where R1-R3 are defined and used
as rule names. The other 25 are in `engine/test`:

- R10: `findings.test.js:61,63,259`, `model-class-shape.test.js:133`,
  `normalize-findings-bin.test.js:63,65`.
- F6: `telemetry-claude.test.js:71`.
- Others: `archetype.test.js:118` (T5), `governance-invariance.test.js:55` (T3),
  `graph.test.js:240,284,340` (T2-T4), `pipeline-resolve-main.test.js:561,574,586,598,640,652`
  (R3/R4/R6/B2/B4), `producers.test.js:61` (T4), `strand.test.js:81` (T1),
  `usage-aggregate.test.js:341,432` (F2, F3), `usage-mine-main.test.js:585,644,1009` (F1, F5, F3).

### B — pinned facts

`git grep -n -i -P "$PROVENANCE_REF_PATTERN" -- engine/test ':(glob)adapters/*/test/**' test`
gives 193 lines (engine/test 165, adapters 1, test/ 27). A throwaway classifier, the same logic
as the B2 design below, sorts them:

| Class | Lines | Content |
|---|---|---|
| Comment (JS line starting `//`, `/*`, `*`; YAML line starting `#`) | 42 | 41 real provenance, plus `engine/test/adr-lint-main.test.js:1011`, a comment that uses `ADR-012` as example input for a regex |
| Title (`test(`/`it(`/`describe(` at line start, first argument on the same or the next line) | 6 | 5 real provenance, plus `engine/test/plan-lint-main.test.js:557`, a title that quotes its fixture (`"## Part  12 — thing"`, `"Part 12"`) |
| Other (code or data) | 145 | fixture data, plus 6 prose lines outside both classes: 3 assert messages (`test/p10-structure.test.js:233,243`, `test/p22-memory.test.js:96`) and 3 markdown headings (`test/fixtures/manifest/*.workflow.md`) |

Line-anchoring titles costs nothing. Pinned: across the three test trees, the only `test(`/`it(`/`describe(`
calls that do not start their line are 4 `RegExp#test` calls (`engine/test/hygiene-lint-core.test.js:486,487,511,512`)
and 1 fixture string (`test/every-test-file-registers.test.js:87`).

The fixture data stays as it is. It includes `adr-lint-main.test.js` (91 lines), `plan-lint-main.test.js`
(27), `plan-lint.bin.test.js:17,38,79`, `init-emit.test.js:233` (the regex under test),
`memory.test.js:2444,2446` (`'p1'`/`'p3'`, matched only because of `-i`),
`test/docs-structure-lint.test.js:33-34`, `test/fixtures/{backlog,plan}-*.md`,
`test/p10-structure.test.js:232,242` and `test/p22-memory.test.js:95` (grep patterns), and
`test/source-hygiene.test.js:531,537,542,548` (class-E fixtures).

Conclusion: a comment-and-title scope has 2 data false positives on today's tree, and both can
be reworded with no loss of meaning. A whole-line scope has 139 data lines across 14 files once
the sweep is done.

### B — file names

Only three tracked files outside the dated ledgers match `(^|/)[pP][0-9]+-`:
`test/p10-structure.test.js`, `test/p20-dod.test.js` and `test/p22-memory.test.js`.
`git grep -n "p10-structure\|p20-dod\|p22-memory"` gives 134 lines. Outside the dated ledgers
(`docs/contributing/{adr,archive,design,plan,prd}/`) the live references are:

| Reference | Kind |
|---|---|
| `BACKLOG.md:354`, `BACKLOG.md:369` | prose in two delivered entries (`test/p10-structure.test.js`) |
| `docs/contributing/adr/436-…plan-mismatch-token-prefix.md:4` `subjects:` | **machine-read**: the governing corpus (`scripts/governing-corpus.sh`) routes a touched subject to this ADR |
| `docs/contributing/adr/449-…claim-status-pin…md:4` `subjects:` | **machine-read**, same route |
| the maintainer's auto-memory note `craft-run-final-flush.md` (outside the repo) | names `test/p22-memory.test.js` for the Done-step `CONCERN_FLOORS` re-derive |

Skills, agents, contracts, templates, scripts, `.github`, README and the guides hold none.
`docs/contributing/prd/PLAN-portable-named-configs.md:62` is a plan resolved on 2026-07-04, so it
counts as a ledger.

Rename probe: `git archive HEAD` was copied into `<tmp>`, the three files were renamed to the
names in B3, and `bash scripts/ci.sh` was run before and after. Both runs gave pass 5030 and
fail 8, with the same 8 failing tests. All 8 are `git log --follow` history tests that cannot
pass in a copy with no history. **No gate notices a renamed subject left dangling in an
ADR `subjects:` list.** The rename has to update those lists by hand.

## Requirements

| # | Requirement | Proof |
|---|---|---|
| REQ-1 | DC-1's outcome is applied to `R10`, `F6` and `R3` in shipped code, and each sentence keeps its meaning. | `git grep -n -P '\b[RTF]\d+\b' -- <SHIPPED_CODE_PATHSPECS>` lists only what DC-1 keeps. |
| REQ-2 | Under DC-1 (a) or (b), class E reports single-letter ids case-sensitively: `F6` is reported, while `-f2-` and `r1` are not. | RED TA.1, GUARD TA.2; the :576 whole-tree test stays green. |
| REQ-3 | Every comment, title and prose line in the B1 table is reworded to give the reason with no id. Fixture data is unchanged. | `git grep -n -i -P "$PROVENANCE_REF_PATTERN"` over the test trees returns only the data lines listed in Context. Each touched suite stays green unedited apart from the reworded lines. |
| REQ-4 | DC-2's outcome is applied. Under (a), class E reports provenance in test comments and titles, needs no allowlist, and is `[]` on the tree. | RED TB.1-TB.4, GUARD TB.5, whole-tree TB.6. |
| REQ-5 | DC-3's outcome is applied. Under (a), no tracked file outside the ledgers matches `(^|/)[pP][0-9]+-`, the ADR-436/449 `subjects:` entries name the new paths, and the suite's pass count is unchanged. | the B3 evidence command; ci.sh pass/fail totals equal before and after. |
| REQ-6 | DC-4's outcome is applied to the test-side `R/F/T` ids. | `git grep -n -P '\b[RTF]\d+\b'` over the test trees lists only what DC-4 keeps. |
| REQ-7 | The comment above `PROVENANCE_REF_PATTERN` states the scope that DC-2 chose. | diff review. |
| REQ-8 | Both BACKLOG entries are flipped in place in the sibling shape "— delivered 2026-MM-DD** (branch).", and the README receipts are bumped (designs +1, plans +1, ADRs +N) in a separate docs commit. | diff review; `bash scripts/readme-drift.sh`. |

## Design

Order: sweep first and rules last, so every commit is green. The sweep parts are comment and
title edits only. Stryker does not mutate test files, and it does not mutate comments in
`engine/src`, so no part needs a mutation run.

### A — shipped single-letter ids (DC-1)

Rewordings under DC-1 (a). Under (b) the `metrics-line.js` lines stay as they are.

```js
// engine/src/findings.js:197
 * Accepts two shapes interchangeably (key on fields, never on layout):
// engine/src/observability/adapters/claude/telemetry.js:59
// Coerce non-finite values (string, NaN, null) to 0 so they can't poison cost math.
// engine/src/observability/metrics-line.js:8-10 (reflowed to four lines)
 * imported one — this module sits under engine/src/observability/ and is not
 * a declared composition root, and test/architecture-boundaries.test.js allows
 * vendor bindings to be wired up only there, so it cannot import
 * adapters/claude/metrics-split.js directly. The
```

Class-E change under DC-1 (a). Context block, `test/source-hygiene.test.js:126-129`:

```js
const PROVENANCE_REF_TOKENS = 'ADR-?\\d+|P\\d+|Part\\s+\\d+|backlog\\s*#\\d+|DC-\\d+';
// Case-sensitive inside the -i scan: a `-f2-` cut field or an `r1` variable is not a review id.
const REVIEW_ID_TOKEN = '(?-i:[RTF]\\d+)';
const PROVENANCE_REF_PATTERN = `\\b(${PROVENANCE_REF_TOKENS})\\b`;
const SHIPPED_PROVENANCE_REF_PATTERN = `\\b(${PROVENANCE_REF_TOKENS}|${REVIEW_ID_TOKEN})\\b`;
```

`listProvenanceRefLines` (:142) switches to `SHIPPED_PROVENANCE_REF_PATTERN`. `PROVENANCE_REF_PATTERN`
keeps its current value and is the pattern the test-tree scan uses (B2). Keeping the review-id
token out of the test scan is deliberate: `test/architecture-boundaries.test.js` defines R1-R3
as rule names (DC-4).

DC-1 (b) shape, for comparison: the same split, plus a post-filter on the shipped rows. A row
whose id is followed by ` in <path>.test.js` is dropped only when the cited file contains
`// <id> —`. That is one more helper (`citesDefinedRuleName(cwd, row)`), one file read per
such row, and a definition-site convention the test has to pin. DC-1 (c) changes only the two
comments and leaves the pattern alone.

### B1 — the sweep

Rewrite the comment or title so it gives the reason. A banner drops only its prefix. Each
banner's trailing `─` run is trimmed so the line ends at its old column. This is cosmetic, and
no test reads it.

| File:line | Today (id part) | After |
|---|---|---|
| `engine/test/usage-mine-main.test.js:661` | `P29 kill-tests: target survivors from mutation run` | `kill-tests: target survivors from a mutation run` |
| `engine/test/usage-mine-main.test.js:663,678,730,759,776,793,809,827,845,863,876,891,909,925,938,961,984,1031,1055` | `P29-<n>. <text>` | `<text>` (e.g. `--since filters events by timestamp`) |
| `engine/test/usage-aggregate.test.js:457` | `P29 kill-tests: …` | as :661 |
| `engine/test/hygiene-lint-core.test.js:315,358,390,415,479,516` | `Part 2 hardening: <x>` | `hardening: <x>` |
| `engine/test/manifest.test.js:639` | `ADR-011: per-phase skip → loud error` | `per-phase skip → loud error` |
| `engine/test/manifest.test.js:797` | `must also accumulate (ADR-011), not be dropped` | `must also accumulate, not be dropped` |
| `engine/test/manifest.test.js:913` (title) | `… with pipeline.skip guidance (ADR-011 broadening)` | `… with pipeline.skip guidance` |
| `engine/test/manifest.test.js:916` | `Pre-P3 the bash PROTECTED list let design.skip lint clean; ADR-011 rejects every per-phase skip.` | `Every per-phase skip is rejected, not only a protected phase's: design.skip must not lint clean.` |
| `engine/test/manifest.test.js:999` | `phases: newly accepted fields (ADR-028 lint-gap closure)` | `phases: newly accepted fields` |
| `engine/test/manifest.test.js:1379` | `phases.harness shape validation (ADR-030)` | `phases.harness shape validation` |
| `engine/test/resolve.test.js:482` | `fan-out advisory (ADR-312, ADR-313)` | `fan-out advisory` |
| `engine/test/resolve.test.js:1188` | `reviewPlan derivation (Layer A — ADR-096 / ADR-097)` | `reviewPlan derivation` |
| `engine/test/resolve.test.js:1282` | `techniquePlan derivation (ADR-155)` | `techniquePlan derivation` |
| `engine/test/skip-signals.test.js:3` | `token grammar (ADR-146) and its fold into` | `token grammar and its fold into` |
| `engine/test/fixtures/manifests/exec-precedence.yml:1` | `# ADR-008 precedence fixture:` | `# Execution precedence fixture:` |
| `engine/test/fixtures/manifests/exec-toplevel-default.yml:1` | `# ADR-008 third leg: …` | `# Execution precedence, third leg: …` |
| `adapters/pi/test/tool-call-hook.test.js:128` (title) | `(DC-5 nearest-existing-ancestor is contained)` | `(the nearest existing ancestor is contained)` |
| `test/fixtures/manifest/invalid-skip-nonprotected.workflow.md:7` | `— ADR-011 rejects every per-phase skip` | `— every per-phase skip is rejected` |
| `test/fixtures/manifest/invalid-unknown-pipeline-key.workflow.md:6` | `(ADR-010 shape boundary)` | `(pipeline shape boundary)` |
| `test/fixtures/manifest/valid-pipeline-skip.workflow.md:6` | `— valid ADR-010 surface` | `— valid pipeline surface` |
| `test/living-corpus.test.js:12` | `Pinned live corpus — see docs/contributing/plan/harness-hygiene-prune-gates.md "Part 2":` | `Pinned live corpus:` (the :13 continuation stays) |
| `test/source-hygiene.test.js:35` | `location contract (ADR-191). A vendor-named …` | `location contract. A vendor-named …` |
| `test/source-hygiene.test.js:254` | `(Backlog port, out of scope per Part 9 plan note)` | `(Backlog port, not the VCS axis)` |
| `test/p10-structure.test.js:229,239` (titles) | `then no P21 or ADR tokens appear` | `then no phase or decision-record tokens appear` |
| `test/p10-structure.test.js:233,243` (messages) | `should not contain P21 or ADR tokens` | `should not contain phase or decision-record tokens` |
| `test/p22-memory.test.js:90` (title) | `then no P22 or ADR tokens appear` | `then no phase or decision-record tokens appear` |
| `test/p22-memory.test.js:96` (message) | `should contain no P22 or ADR tokens` | `should contain no phase or decision-record tokens` |
| `engine/test/adr-lint-main.test.js:1011` (example data, DC-2 a only) | `an id of "01" would make the pattern ADR-(01) match ADR-012 and` | `an id of "01" would make the pattern match a longer id such as 012 and` |
| `engine/test/plan-lint-main.test.js:557` (title, example data, DC-2 a only) | `… multi-digit label ("## Part  12 — thing"), … is exactly "Part 12"` | `… multi-digit label, when main runs, then the resolved label keeps the whole number` |

The workflow fixtures are read only for their frontmatter (`test/manifest-lint.test.js:116,159,169`),
and nothing asserts on banner or heading text. The grep patterns at `test/p10-structure.test.js:232,242`
and `test/p22-memory.test.js:95` are data and stay.

### B2 — a test-tree scope for class E (DC-2)

DC-2 (a) shape. Context block, `test/source-hygiene.test.js` after :156:

```js
const TEST_CODE_PATHSPECS = ['engine/test', 'test', ':(glob)adapters/*/test/**'];
const SLASH_COMMENT_EXTENSIONS = new Set(['.js', '.mjs', '.cjs', '.ts']);
const HASH_COMMENT_EXTENSIONS = new Set(['.yml', '.yaml', '.sh', '.bash']);
const SLASH_COMMENT_LINE = /^\s*(?:\/\/|\/\*|\*)/;
const HASH_COMMENT_LINE = /^\s*#/;
// Anchored: every title call in the test trees starts its line, so `re.test('…')` and fixture
// strings that quote a call never read as titles.
const TITLE_CALL = '^\\s*(?:test|it|describe)(?:\\.(?:only|skip|todo))?\\(\\s*';
const TITLE_ON_SAME_LINE = new RegExp(`${TITLE_CALL}['"\`]`);
const TITLE_CALL_OPENS_LINE_END = new RegExp(`${TITLE_CALL}$`);
const STRING_OPENS_LINE = /^\s*['"`]/;

function isCommentOrTitleLine(file, text, previousText)   // pure: extension → comment rule or title rule
function listTestProvenanceRefLines(cwd, env = process.env) // rows `file:line:text`, comment/title rows only
```

- To keep one grep body, extract `grepTrackedLines(cwd, env, pattern, pathspecs)` from :142-156:
  the same `execFileSync('git', ['grep', '-n', '-i', '-P', pattern, '--', ...pathspecs])`,
  the same `withoutAmbientGitScope`, the same `GIT_GREP_NO_MATCH` → `[]`, rethrow otherwise.
  `listProvenanceRefLines` becomes a one-line call to it. Do not reuse `runGrep` (:162), which
  swallows grep errors.
- `listTestProvenanceRefLines` parses each row with `LOCATED_LINE_PATTERN`. An unparsable row
  throws `class E: unparsable git grep row …`. It reads the previous line from
  `path.join(cwd, file)`, caching per file in a `Map` local to the call (no module state), and
  keeps the row when `isCommentOrTitleLine` holds. A row on line 1 gets `''` as its previous
  line. A read error propagates.
- Extensions outside both sets are never reported (`.md`, `.json`, `.jsonl`, `.txt`). That is
  where fixture data lives: a markdown `#` is a heading (`## Part 1 —` in plan fixtures), not a
  comment. This is the one fail-open boundary. The three swept `workflow.md` headings stay
  unguarded.
- Known gaps, by design: trailing comments (`code; // …`), titles split over concatenated
  strings, and block-comment continuation lines without a leading `*`. Measured cost today: 0.
  None of the 145 unclassified rows has a trailing `//` comment, and none is a title fragment.
- Fail-closed edge: a fixture template literal with a line that starts `*`, `//` or `#` (YAML)
  and carries a token is reported. The fix is to change the fixture (e.g. a `-` bullet). Measured
  frequency today: 0. Of the 193 hits, only :1011 was a comment-classified data line, and it is
  a real comment.
- Self-scan: TB.6 scans `test/source-hygiene.test.js` itself. The new unit tests keep their
  token-bearing fixture strings inside object or array literals that start with code on the same
  line (as :531 does). A token never sits on a line that starts with `//`, `*` or a `test(`/`it(`
  call, or on a quote-led line right after a line ending in `test(`. Titles and the TB.1/TB.2 table
  rows carry no token: the classifier does not depend on tokens.
- Rewrite the scope comment (:126-128): shipped code is scanned whole-line, and tests are
  scanned in comments and titles only, because test code and fixtures carry these tokens as data.

DC-2 (b) shape, for comparison: `listTestProvenanceRefLines` scans whole lines and drops rows
through a fixture allowlist. That means file-level entries for `engine/test/adr-lint-main.test.js`,
`engine/test/plan-lint-main.test.js`, `engine/test/plan-lint.bin.test.js` and
`test/fixtures/{backlog,plan}-*.md`, plus content filters (the class-B `allowlistFilters` style,
:236-275) for `memory.test.js:2444,2446`, `init-emit.test.js:233`, `docs-structure-lint.test.js:33-34`,
`p10-structure.test.js:232,242`, `p22-memory.test.js:95` and the class-E fixtures in
`source-hygiene.test.js`: 139 data lines across 14 files. The file-level entries also blind
every comment in the two lint suites. DC-2 (c): no code. Only the B1 sweep and the scope comment
stay as they are.

### B3 — file names (DC-3)

Under DC-3 (a), `git mv` with subject names. No other tracked file matches them today.

| From | To | Subject (titles) |
|---|---|---|
| `test/p10-structure.test.js` | `test/plugin-structure.test.js` | skills, agents, verticals and loop recipe structure |
| `test/p20-dod.test.js` | `test/repo-dod.test.js` | `docs/contributing/DOD.md` |
| `test/p22-memory.test.js` | `test/memory-store.test.js` | the committed memory store and `.gitignore` rules |

The same commit updates `subjects:` in `docs/contributing/adr/436-…md:4` and
`docs/contributing/adr/449-…md:4`. These are frontmatter-only edits. Accepted ADRs have had
their frontmatter edited before (`cae7206` added a `supersedes:` block to ADR-348), but no commit
has yet edited an accepted ADR's `subjects:`. The two BACKLOG.md delivered-entry mentions
(:354, :369) are updated in the flip commit. Dated ledgers stay stale on purpose, and
`git log --follow` resolves them. The orchestrator updates the out-of-repo memory note at Done;
it is not a committed artifact.

Evidence command for REQ-5:
`git ls-files | grep -E '(^|/)[pP][0-9]+-' | grep -v '^docs/contributing/\(archive\|design\|plan\|adr\|prd\)/'` → empty.

### Part partition (≤6 files each, sequential)

| Part | Files | Gate |
|---|---|---|
| 1 sweep: usage and hygiene banners | `engine/test/usage-mine-main.test.js`, `engine/test/usage-aggregate.test.js`, `engine/test/hygiene-lint-core.test.js` | `npm --prefix engine test` |
| 2 sweep: manifest and resolve | `engine/test/manifest.test.js`, `engine/test/resolve.test.js`, `engine/test/skip-signals.test.js`, `engine/test/fixtures/manifests/exec-precedence.yml`, `engine/test/fixtures/manifests/exec-toplevel-default.yml` | `npm --prefix engine test` |
| 3 sweep: adapter and root | `adapters/pi/test/tool-call-hook.test.js`, `test/living-corpus.test.js`, `test/source-hygiene.test.js` (:35, :254), `test/fixtures/manifest/{invalid-skip-nonprotected,invalid-unknown-pipeline-key,valid-pipeline-skip}.workflow.md` | `bash scripts/ci.sh` |
| 4 p-files (+ DC-3 a renames) | `test/p10-structure.test.js`, `test/p20-dod.test.js` (rename only), `test/p22-memory.test.js`, ADR-436, ADR-449 | `bash scripts/ci.sh` |
| 5 example-data rewords (DC-2 a only) | `engine/test/adr-lint-main.test.js`, `engine/test/plan-lint-main.test.js` | `npm --prefix engine test` |
| 6 A: shipped ids + review-id token | `engine/src/findings.js`, `engine/src/observability/adapters/claude/telemetry.js`, `engine/src/observability/metrics-line.js`, `test/source-hygiene.test.js` | `bash scripts/ci.sh` |
| 7 DC-4 (b) twins | `engine/test/findings.test.js`, `engine/test/model-class-shape.test.js`, `engine/test/normalize-findings-bin.test.js`, `engine/test/telemetry-claude.test.js` | `npm --prefix engine test` |
| 8 B2 rule (DC-2 a) | `test/source-hygiene.test.js` | `bash scripts/ci.sh` |
| 9 docs | `README.md` receipts, `BACKLOG.md` flips (+ :354/:369 under DC-3 a) | `bash scripts/ci.sh`, `bash scripts/readme-drift.sh` |

The table assumes the recommendations. Under DC-1 (c), Part 6 is the two comment edits with no
test change. Under DC-2 (b), Part 5 drops and Part 8 builds the allowlist variant. Under DC-2 (c),
Parts 5 and 8 drop. Under DC-3 (b), Part 4 keeps only the three content files. Under DC-4 (c) Part 7 grows by
`archetype`, `governance-invariance`, `graph`, `pipeline-resolve-main`, `producers`, `strand`,
`usage-aggregate` and `usage-mine-main`, so it splits into 7a and 7b. Part 8 must follow Parts 1-5.

## Decision candidates

| # | Choice | Alternatives (≤3) | Recommendation | Why |
|---|---|---|---|---|
| DC-1 | Single-letter ids in shipped code (`R10`, `F6`, `R3`): which stay, and how does class E tell a rule name from provenance? (A) | (a) **Strip all three, rule with no exceptions**: reword `metrics-line.js:9` to describe the rule it cites, and add a case-sensitive `(?-i:[RTF]\d+)` token to the shipped scan only. (b) **Keep R3 as a defined rule name**: strip R10/F6, add the same token, and exempt an id followed by ` in <file>.test.js` only when that file contains `// <id> —`. (c) **Strip R10/F6 only, no rule change**: R/F ids stay unguarded. | (a) | Pinned: case-sensitive, the token hits exactly the 3 lines on the tree. The `-i` form also hits `scripts/run-ledger.sh:214` (`-f2-`), and the `(?-i:…)` form clears it. R3's meaning can be said in words ("vendor bindings are wired up only in the declared composition root"), so the id adds nothing a reader needs, and (a) keeps class E free of exceptions. (b) adds a definition-site convention, a helper and a file read per row to save one id. The lookahead alone (pinned) would only be an allowlist under another name. (c) leaves the next `F7` to a manual sweep, which is how these three were found. Cost of (a): a future legitimate `R2`/`T0` in a shipped comment fails closed and must be reworded. |
| DC-2 | Guard the test trees after the sweep? (B) | (a) **Comment-and-title scope, no allowlist**: `listTestProvenanceRefLines` with `isCommentOrTitleLine` over `engine/test`, `test`, `adapters/*/test` using the base pattern. Reword 2 example-data lines (`adr-lint-main.test.js:1011`, `plan-lint-main.test.js:557`). (b) **Whole-line scope plus a fixture allowlist**: 139 data lines across 14 files, with file-level entries for the two lint suites. (c) **Leave tests unguarded**: one-time sweep only. | (a) | Pinned classifier over the 193 test hits: 48 comment/title lines, 46 real and 2 example data, both rewordable without loss. After the sweep the scope is `[]` with zero exceptions. `contracts/core.md:4` already says "in source or test", and today only the source half is guarded. (b) blinds every comment in the two largest fixture suites and goes stale when line content moves. (c) is how 46 lines piled up. Cost of (a): it refines ADR-485's "tests … out of scope", adds two helpers and six tests to `source-hygiene.test.js`, has a documented fail-open at non-code extensions (`.md` headings), and fails closed on a template-literal fixture line that starts `*`/`//`. |
| DC-3 | Rename `test/p{10,20,22}-*.test.js` in this run? (B) | (a) **Rename** to `plugin-structure`, `repo-dod` and `memory-store`, update the ADR-436/449 `subjects:` and the 2 BACKLOG mentions, and leave ledgers stale. (b) **Keep the names**: sweep contents only. (c) **Rename plus a guard**: class E also fails on a tracked test file whose basename matches `^p\d+-`. | (a) | The entry names the file names as sweep targets. The rename probe in `<tmp>` shows ci.sh unchanged (pass 5030, fail 8, the same 8 history-only tests before and after). It also shows that no gate catches a dangling ADR subject, so the 2 `subjects:` edits are what keeps the governing-corpus route working, and the design names them. 5 files, one part. (c) guards a pattern with exactly 3 instances in the tracked tree, all removed by (a), which is YAGNI. (b) leaves the most visible provenance in the tree. |
| DC-4 | Test-side `R/F/T` ids (25 lines in `engine/test`, plus R1-R3 defined in `test/architecture-boundaries.test.js`) | (a) **Untouched**: the shipped strip only. (b) **Twins only**: reword the 7 test lines citing the ids stripped under DC-1 (R10 ×6, F6 ×1), so no test cites an id that no longer appears anywhere. (c) **All 25**: reword every `engine/test` R/F/T id. Keep R1-R3 in `architecture-boundaries.test.js` as defined rule names. No rule either way. | (b) | Under DC-1 (a) or (c), `findings.test.js:61,63,259`, `model-class-shape.test.js:133`, `normalize-findings-bin.test.js:63,65` and `telemetry-claude.test.js:71` would cite ids whose only shipped anchor is gone. (b) closes that in one 4-file part. (c) is the full clean-up, but the backlog entries scope tests by the class-E pattern, which these ids are outside, so it is scope growth for you to opt into (2 extra parts). None of the options adds the id token to the test scan: R1-R3 are real rule names in `architecture-boundaries.test.js:129-149` and its titles. |

## Test strategy

TDD per part. Write the test RED first and confirm it fails for the stated reason before the
production edit. Titles use Given/When/Then, bodies are AAA, and the unit under test is bound to
`sut`. Titles, comments and fixture file names carry no id (`P29`, `DC-5`, `ADR-011`, `R10`, …).
Token-bearing fixture strings sit only in object or array literals on code lines.

Sweep parts 1-5 are rewordings and renames with no behaviour change. Their proof is the suite
staying green plus a grep count:

```bash
git grep -n -i -P '\b(ADR-?\d+|P\d+|Part\s+\d+|backlog\s*#\d+|DC-\d+)\b' -- <the part's files>
```

That command lists only the data lines named in Context. Part 4 also proves the rename: the
REQ-5 command is empty, the ci.sh `# pass` totals summed over the run are equal before and
after, and the old names are absent from both ADR `subjects:` lists.

Part 6 (DC-1 a), in `test/source-hygiene.test.js`, mirroring :530-:574:

| Id | Kind | Title (shape) | Fixture → expected |
|---|---|---|---|
| TA.1 | RED | Given a git repo tracking a single-letter review id in engine source, when listProvenanceRefLines scans it, then the line is reported | `{ 'engine/src/a.js': '// F6: x\n' }` → `['engine/src/a.js:1:// F6: x']` (today `[]`) |
| TA.2 | GUARD | Given a shipped script cutting a field range and a lower-case r-number in engine source, when listProvenanceRefLines scans them, then nothing is reported | `{ 'scripts/x.sh': 'cut -d" " -f2-\n', 'engine/src/b.js': '// r1 lower\n' }` → `[]`. Green on arrival. It is the test that fails if the new token loses `(?-i:…)`, since Stryker does not mutate test-file constants. |
| :576 | whole-tree | unchanged | RED with the 3 lines once the token lands, GREEN after the 3 rewordings in the same part |

Under DC-1 (b) add TA.3: `{ 'engine/src/a.js': '// R3 in t/r.test.js\n', 't/r.test.js': '// R3 — rule\n' }`
→ `[]`, and the same row with an empty `t/r.test.js` → reported.

Part 8 (DC-2 a), in `test/source-hygiene.test.js`. The table-driven pure tests follow the
`LEAK_SHAPED_LINES` loop style (:361-:445):

| Id | Kind | Surface | Cases → expected |
|---|---|---|---|
| TB.1 | RED | `isCommentOrTitleLine` table, true rows | `a.test.js` `// ─── x ─` ; `a.test.js` ` * x (y)` ; `a.test.js` `test('Given x', () => {` ; `a.test.js` `  'Given x',` after `test(` ; `a.yml` `# x` → `true` (fails today: the function is undefined) |
| TB.2 | RED | same, false rows | `a.test.js` `const plan = 'x';` ; `a.test.js` `  'x',` after `const a = [` ; `a.md` `# x` ; `a.md` `## x — y` ; `a.json` `"x"` → `false` |
| TB.3 | RED | `listTestProvenanceRefLines` on a fixture repo | `engine/test/a.test.js`: comment line with a phase-numbered banner, then a code line holding a part-numbered string; `test/b.test.js`: `test(` then a title line carrying a design-candidate id; `test/fixtures/p.md`: a part-numbered heading; `engine/src/c.js`: a decision-candidate comment → exactly the two test rows (comment, next-line title) |
| TB.4 | RED | same, ambient `GIT_LITERAL_PATHSPECS: '1'` | `adapters/x/test/a.test.js` same-line title with an id → that row reported (the `:(glob)` pathspec still expands) |
| TB.5 | GUARD | same, non-repo dir | `assert.throws(act, { status: GIT_NOT_A_REPOSITORY })` |
| TB.6 | whole-tree | `listTestProvenanceRefLines(ROOT)` | `[]`, message ``Source-hygiene FAIL — provenance refs in test comments or titles (class E) at:\n${result.join('\n')}``. Green on arrival because Parts 1-5 landed first. TB.3 is its teeth. |

The existing :530 test (an `engine/test` comment is not reported by the shipped scan) stays as
it is. It still pins the shipped scope, which `listTestProvenanceRefLines` does not widen.

Edge matrix the TB tables must cover: same-line vs next-line title, `//` vs `/*` vs `*`, YAML `#`
vs markdown `#`, code line with a token in a string, and a fixture under `adapters/*/test`.
Property-test lens: not applicable. The classifier is a line predicate with a finite case table,
not a parser or round-trip pair.

Phase gate: `bash scripts/ci.sh` green, then `bash scripts/readme-drift.sh` after Part 9.

## Out of scope

- `test/p22-memory.test.js:80` title "authored in S4" is a provenance id outside the class-E
  pattern (`S\d+`). Proof: the line text. It is not in either entry.
- `R1`-`R3` in `test/architecture-boundaries.test.js` (18 lines) are defined there as rule names.
  Renaming them is not asked for.
- The ten adapter-suite copies of the `PROVENANCE_REF` literal (e.g.
  `adapters/codex/test/native-surface.test.js:40`) and the `test/p10-structure.test.js:228-246`
  and `test/p22-memory.test.js:89-98` greps overlap with class E, but no defect is shown.
- Markdown fixture prose (`test/fixtures/**/*.md`) stays unguarded under DC-2 (a), because a
  markdown `#` line is fixture data in this tree.
