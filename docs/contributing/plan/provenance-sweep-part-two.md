# Plan — provenance-sweep-part-two

> Source: design doc `docs/contributing/design/provenance-sweep-part-two.md` · ADRs 489, 490, 491, 492
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

## Run-wide notes (read before any part)

Decisions ratified as recommended: DC-1 (a), DC-2 (a), DC-3 (a), DC-4 (b). The design's
9-part partition applies as written, plus one forced addition, Part 0.

**Why Part 0 exists (deviation from the design's partition, with proof).** The design put the
README receipt bump last (its Part 9). On the branch head before this plan, both suites are red
on exactly that drift:

- `bash scripts/readme-drift.sh` → exit 1: `corpus-counts: docs/contributing/design/ claims 52,
  tree holds 53` and `corpus-counts: docs/contributing/adr/ claims 488, tree holds 492`. Once
  this plan commits, plans become 52 against a claim of 51 as well.
- `npm --prefix engine test` → 1 failure: `engine/test/readme-drift-main.test.js:304` ("Given no
  root argument, when main runs, then it resolves DEFAULT_ROOT against the real repo root and
  finds no unusable-input errors"), `1 !== 0`.
- the process suite (`test/`) → 1 failure: `test/readme-drift.test.js:98` ("Given the live repo
  tree, when readme-drift runs, then it exits 0 with no findings").
- the seven adapter suites were green (pi 252, opencode 239, copilot 241, codex 518, antigravity
  97, cursor 114, aider 85).

Every later part gate would be red until the receipts move, and no part may commit on a red
gate. So the README bump runs first as Part 0, in its own docs commit, and Part 9 keeps only
the BACKLOG flip. The two docs commits stay separate as the design requires.

**Gates.** No root `package.json`; never `npm test` at root.
- Engine-only parts: `npm --prefix engine test`. `engine/test/findings.test.js:611` is a known
  sub-millisecond timing flake: if it is the single failure, rerun once before treating it as red.
- Parts touching root `test/`, `adapters/`, `README.md`, `BACKLOG.md` or `docs/`: `bash scripts/ci.sh`
  (runs engine, all adapter suites, then `test/`, then static lints, stub/prose/adr lints; it
  stops at the first red suite).
- `bash scripts/readme-drift.sh` is NOT part of ci.sh; run it where a part says so.
- Write long outputs to a file and read back only the summary, e.g.
  `bash scripts/ci.sh > <tmp>/ci.txt 2>&1; echo rc=$?; awk '/^# (pass|fail) /' <tmp>/ci.txt`.

**Sweep evidence.** Sweep parts (1, 2, 3, 4, 5, 7) change comments, titles, assert messages
and fixture headings only, with no behaviour change. Their RED is an evidence command that
lists the id-bearing lines before the edit; their GREEN is the same command listing nothing
(or only the named data lines) afterwards, plus the green gate. No unit test is invented for
them. Always run git grep with the ambient git scope stripped:

```bash
env -u GIT_DIR -u GIT_WORK_TREE -u GIT_INDEX_FILE -u GIT_LITERAL_PATHSPECS \
  git grep -n -i -P '\b(ADR-?\d+|P\d+|Part\s+\d+|backlog\s*#\d+|DC-\d+)\b' -- <the part's files>
```

**Banner rewrites keep the line width.** A `// ─── … ───` banner drops only its id prefix or
suffix, and its trailing `─` run is lengthened by the removed character count so the line ends
at its old column (cosmetic; no test reads it). Each sweep part gives a `perl` command that does
exactly that on the listed lines; each was dry-run on a throwaway copy and keeps every banner's
character length. Run it from the worktree root; it edits in place. Edit non-banner lines with
the exact before/after text given.

**Shared file across parts.** `test/source-hygiene.test.js` is edited by Parts 3, 6 and 8
(plan-lint will print an advisory cognitive-locality warning). They stay separate on purpose:
Part 3 is the comment sweep that Part 8's whole-tree test depends on, Part 6 is ADR-489's
shipped-code rule, and Part 8 is ADR-490's test-tree rule, which must land after Parts 1-5.
Part 6 and Part 8 shift line numbers in that file, so later parts locate code by symbol name.

**Public surface.** No part introduces an exported symbol. Every new symbol (`PROVENANCE_REF_TOKENS`,
`REVIEW_ID_TOKEN`, `SHIPPED_PROVENANCE_REF_PATTERN`, `TEST_CODE_PATHSPECS`, the comment/title
constants, `grepTrackedLines`, `isTitleLine`, `isCommentOrTitleLine`, `commentOrTitleRows`,
`listTestProvenanceRefLines`) is file-local to `test/source-hygiene.test.js`: internal. No barrel,
README, registry or API report gate applies.

**Binding constraints for every part.** No provenance refs (phase, ADR, part, backlog,
design-candidate numbers, single-letter review ids) in any source or test line you write —
titles, comments and fixture file names included. Titles Given/When/Then, AAA bodies, `sut`.
No suppression directives. Commit only the part's own files; never checkout/reset/stash. Commit
messages are one line, no body, no trailers.

**Out-of-repo.** The maintainer's memory note that names the old `p22-memory` file is updated
by the orchestrator at Done; no part touches it.

## Part 0 — README corpus receipts

### Context

Docs-only. Edit `README.md`, section "## craft builds craft" (README.md:178-183). Today:

```
receipts: [52 design docs](docs/contributing/design/), [51 parted plans](docs/contributing/plan/),
[488 ADRs](docs/contributing/adr/), and [raw telemetry for 25 runs](docs/contributing/metrics-baseline.report.json)
```

After: `52 design docs` → `53 design docs`, `51 parted plans` → `52 parted plans`,
`488 ADRs` → `492 ADRs`. Nothing else on the lines changes (the "25 runs" claim is not drifting).
The counts come from `*.md` files per corpus directory (engine/src/readme-drift-main.js:119):
design 53 (this run's design doc), plan 52 (this plan), adr 492 (ADR-489 to ADR-492).

### TDD steps

1. RED (evidence): `bash scripts/readme-drift.sh` exits 1 with three `corpus-counts` findings
   (design claims 52 / holds 53, plan claims 51 / holds 52, adr claims 488 / holds 492). The
   tests engine/test/readme-drift-main.test.js:304 and test/readme-drift.test.js:98 fail on the
   same drift.
2. GREEN: edit the three numbers in `README.md`. `bash scripts/readme-drift.sh` exits 0 with no
   output; both tests pass.

### Gate

```bash
bash scripts/readme-drift.sh
bash scripts/ci.sh
```

### Commit

`docs(readme): bump the corpus receipts to 53 designs, 52 plans and 492 ADRs`

## Part 1 — sweep: usage and hygiene suite banners

### Context

Test-comment sweep, no behaviour change. Files: `engine/test/usage-mine-main.test.js`,
`engine/test/usage-aggregate.test.js`, `engine/test/hygiene-lint-core.test.js`. All 27 target
lines are `//` banners.

| File:line | Today (id part) | After |
|---|---|---|
| usage-mine-main.test.js:661 | `// ─── P29 kill-tests: target survivors from mutation run ───…` | `// ─── kill-tests: target survivors from a mutation run ───…` |
| usage-mine-main.test.js:663,678,730,759,776,793,809,827,845,863,876,891,909,925,938,961,984,1031,1055 | `// ─── P29-<n>. <text> ───…` | `// ─── <text> ───…` (e.g. `// ─── --since filters events by timestamp ───…`) |
| usage-aggregate.test.js:457 | `// ── P29 kill-tests: target survivors from mutation run ───…` | `// ── kill-tests: target survivors from a mutation run ───…` |
| hygiene-lint-core.test.js:315,358,390,415,479,516 | `// ─── Part 2 hardening: <x> ───…` | `// ─── hardening: <x> ───…` |

Commands (dry-run verified; widths preserved):

```bash
perl -CSD -Mutf8 -i -pe 'BEGIN { %L = map { $_ => 1 } (661,663,678,730,759,776,793,809,827,845,863,876,891,909,925,938,961,984,1031,1055) } if ($L{$.}) { my $w = length; s/P29 kill-tests: target survivors from mutation run/kill-tests: target survivors from a mutation run/; s/─── P29-\d+\. /─── /; my $d = $w - length; s/─$/"─" x ($d + 1)/e if $d > 0; }' engine/test/usage-mine-main.test.js
perl -CSD -Mutf8 -i -pe 'if ($. == 457) { my $w = length; s/P29 kill-tests: target survivors from mutation run/kill-tests: target survivors from a mutation run/; my $d = $w - length; s/─$/"─" x ($d + 1)/e if $d > 0; }' engine/test/usage-aggregate.test.js
perl -CSD -Mutf8 -i -pe 'BEGIN { %L = map { $_ => 1 } (315,358,390,415,479,516) } if ($L{$.}) { my $w = length; s/─── Part 2 hardening: /─── hardening: /; my $d = $w - length; s/─$/"─" x ($d + 1)/e if $d > 0; }' engine/test/hygiene-lint-core.test.js
```

Read-only check: `git diff --no-ext-diff --stat` shows 27 insertions and 27 deletions across the 3 files and
nothing else.

### TDD steps

1. RED (evidence): the sweep evidence command over the 3 files lists 27 lines (20 in
   usage-mine-main, 1 in usage-aggregate, 6 in hygiene-lint-core).
2. GREEN: run the three `perl` commands. The evidence command lists nothing.
3. GUARD: `npm --prefix engine test` stays green with the same pass count — only comments moved.

### Gate

```bash
npm --prefix engine test
```

### Commit

`test: drop phase and part numbers from usage and hygiene suite banners`

## Part 2 — sweep: manifest and resolve suites

### Context

Test-comment/title sweep plus two YAML fixture header comments, no behaviour change. Files:
`engine/test/manifest.test.js`, `engine/test/resolve.test.js`, `engine/test/skip-signals.test.js`,
`engine/test/fixtures/manifests/exec-precedence.yml`, `engine/test/fixtures/manifests/exec-toplevel-default.yml`.
YAML comments are ignored by the manifest parser; no test reads them.

Banners (run from the worktree root; dry-run verified):

```bash
perl -CSD -Mutf8 -i -pe 'BEGIN { %L = map { $_ => 1 } (639,999,1379) } if ($L{$.}) { my $w = length; s/─── ADR-011: /─── /; s/ \(ADR-028 lint-gap closure\)//; s/ \(ADR-030\)//; my $d = $w - length; s/─$/"─" x ($d + 1)/e if $d > 0; }' engine/test/manifest.test.js
perl -CSD -Mutf8 -i -pe 'BEGIN { %L = map { $_ => 1 } (482,1188,1282) } if ($L{$.}) { my $w = length; s/ \(ADR-312, ADR-313\)//; s/ \(Layer A — ADR-096 \/ ADR-097\)//; s/ \(ADR-155\)//; my $d = $w - length; s/─$/"─" x ($d + 1)/e if $d > 0; }' engine/test/resolve.test.js
```

That covers manifest.test.js:639 (`ADR-011: per-phase skip → loud error` → `per-phase skip → loud error`),
:999 (`phases: newly accepted fields (ADR-028 lint-gap closure)` → `phases: newly accepted fields`),
:1379 (`phases.harness shape validation (ADR-030)` → `phases.harness shape validation`), and
resolve.test.js:482 (`fan-out advisory`), :1188 (`reviewPlan derivation`), :1282 (`techniquePlan derivation`).

Exact single-line edits (leading whitespace as shown):

| File:line | Today | After |
|---|---|---|
| manifest.test.js:797 | `  // the per-phase skip on bogusPhase must also accumulate (ADR-011), not be dropped` | `  // the per-phase skip on bogusPhase must also accumulate, not be dropped` |
| manifest.test.js:913 (title) | `test('Given a per-phase skip on a NON-protected phase (design), when validateManifest runs, then it is still rejected with pipeline.skip guidance (ADR-011 broadening)', () => {` | same with ` (ADR-011 broadening)` removed: `… then it is still rejected with pipeline.skip guidance', () => {` |
| manifest.test.js:916 | `  // Pre-P3 the bash PROTECTED list let design.skip lint clean; ADR-011 rejects every per-phase skip.` | `  // Every per-phase skip is rejected, not only a protected phase's: design.skip must not lint clean.` |
| skip-signals.test.js:3 | `` * `auto-skip: <phase>` run-record token grammar (ADR-146) and its fold into`` | `` * `auto-skip: <phase>` run-record token grammar and its fold into`` |
| exec-precedence.yml:1 | `# ADR-008 precedence fixture:` | `# Execution precedence fixture:` |
| exec-toplevel-default.yml:1 | `# ADR-008 third leg: top-level execution:inline with no profile.` | `# Execution precedence, third leg: top-level execution:inline with no profile.` |

### TDD steps

1. RED (evidence): the sweep evidence command over the 5 files lists 12 lines (manifest 6,
   resolve 3, skip-signals 1, one per YAML fixture).
2. GREEN: run the two `perl` commands, then the six exact edits. The evidence command lists
   nothing.
3. GUARD: `npm --prefix engine test` green, same pass count (one title reworded, no test added
   or removed).

### Gate

```bash
npm --prefix engine test
```

### Commit

`test: drop decision-record numbers from manifest and resolve suite comments`

## Part 3 — sweep: adapter and root suites

### Context

Test-comment/title sweep plus three markdown fixture headings, no behaviour change. Files:
`adapters/pi/test/tool-call-hook.test.js`, `test/living-corpus.test.js`, `test/source-hygiene.test.js`,
`test/fixtures/manifest/invalid-skip-nonprotected.workflow.md`,
`test/fixtures/manifest/invalid-unknown-pipeline-key.workflow.md`,
`test/fixtures/manifest/valid-pipeline-skip.workflow.md`. The workflow fixtures are read only
for their frontmatter (test/manifest-lint.test.js:116,159,169); nothing asserts on their headings.

| File:line | Today | After |
|---|---|---|
| tool-call-hook.test.js:128 (title) | `  it('Given a Write into a not-yet-existing subdir inside the working dir, when the hook runs, then it returns block:false (DC-5 nearest-existing-ancestor is contained)', async () => {` | `… then it returns block:false (the nearest existing ancestor is contained)', async () => {` |
| living-corpus.test.js:12 | `// Pinned live corpus — see docs/contributing/plan/harness-hygiene-prune-gates.md "Part 2":` | `// Pinned live corpus:` (line 13 `// verified with …` stays) |
| source-hygiene.test.js:35 | `// vendor-binding location contract (ADR-191). A vendor-named file outside that segment` | `// vendor-binding location contract. A vendor-named file outside that segment` |
| source-hygiene.test.js:254-255 | `      // hexagon diagram — explicitly kept (Backlog port, out of scope per Part 9` / `      // plan note); the regex is deliberately line-agnostic.` | `      // hexagon diagram — explicitly kept (Backlog port, not the VCS axis); the` / `      // regex is deliberately line-agnostic.` |
| invalid-skip-nonprotected.workflow.md:7 | `# Per-phase skip on a NON-protected phase — ADR-011 rejects every per-phase skip` | `# Per-phase skip on a NON-protected phase — every per-phase skip is rejected` |
| invalid-unknown-pipeline-key.workflow.md:6 | `# Unknown pipeline sub-key (ADR-010 shape boundary)` | `# Unknown pipeline sub-key (pipeline shape boundary)` |
| valid-pipeline-skip.workflow.md:6 | `# Pipeline skip — valid ADR-010 surface` | `# Pipeline skip — valid pipeline surface` |

Do NOT touch the class-E fixture lines in source-hygiene.test.js (:531, :537, :542, :548): they
are data on code lines.

### TDD steps

1. RED (evidence): the sweep evidence command over the 6 files lists 11 lines: tool-call-hook
   :128, living-corpus :12, source-hygiene :35, :254, :531, :537, :542, :548, and the three
   workflow headings.
2. GREEN: the seven edits above. The evidence command lists exactly the four source-hygiene
   data lines (:531, :537, :542, :548).
3. GUARD: `bash scripts/ci.sh` green (pi suite and process suite unchanged in count).

### Gate

```bash
bash scripts/ci.sh
```

### Commit

`test: drop provenance refs from adapter and root suite comments and fixtures`

## Part 4 — rename the phase-numbered root suites

### Context

Rename plus title/message rewords plus two ADR frontmatter edits, one commit. Files after the
part: `test/plugin-structure.test.js`, `test/repo-dod.test.js`, `test/memory-store.test.js`,
`docs/contributing/adr/436-the-part-implementer-body-pins-the-plan-mismatch-token-prefix.md`,
`docs/contributing/adr/449-the-claim-status-pin-lives-in-the-engine-findings-suite.md`.

Renames (ADR-491), with `git mv` so history follows:

| From (old name, removed) | To |
|---|---|
| test/p10-structure.test.js | plugin-structure (skills, agents, verticals, loop recipe structure) |
| test/p20-dod.test.js | repo-dod (docs/contributing/DOD.md), rename only — no content hit |
| test/p22-memory.test.js | memory-store (committed memory store and .gitignore rules) |

ci.sh finds root suites with `find` (scripts/ci.sh:21) and test/every-test-file-registers.test.js
enumerates directories, so no runner names these files. None of the three files names itself.

Content edits, made in the NEW paths after the `git mv` (line numbers unchanged by the rename):

| New file:line | Today | After |
|---|---|---|
| plugin-structure.test.js:229 (title) | `  'Given the loop workflow file is provenance-clean, when it is checked for plan references, then no P21 or ADR tokens appear',` | `… then no phase or decision-record tokens appear',` |
| plugin-structure.test.js:233 (message) | `      'examples/loop/workflow.md should not contain P21 or ADR tokens',` | `      'examples/loop/workflow.md should not contain phase or decision-record tokens',` |
| plugin-structure.test.js:239 (title) | `  'Given the loop DoD file is provenance-clean, when it is checked for plan references, then no P21 or ADR tokens appear',` | `… then no phase or decision-record tokens appear',` |
| plugin-structure.test.js:243 (message) | `      'examples/loop/DOD.md should not contain P21 or ADR tokens',` | `      'examples/loop/DOD.md should not contain phase or decision-record tokens',` |
| memory-store.test.js:90 (title) | `  'Given source and tests must carry no provenance refs, when engine/src/observability/memory.js and engine/test/memory.test.js are checked, then no P22 or ADR tokens appear',` | `… then no phase or decision-record tokens appear',` |
| memory-store.test.js:96 (message) | `      'engine/src/observability/memory.js and engine/test/memory.test.js should contain no P22 or ADR tokens',` | `… should contain no phase or decision-record tokens',` |

Leave the grep patterns at plugin-structure.test.js:232, :242 (`'P21|ADR'`) and
memory-store.test.js:95 (`'P22|ADR-[0-9]'`) unchanged: they are data. Leave memory-store.test.js:80
("authored in S4") unchanged: out of scope.

ADR frontmatter (line 4 of each), the only edits to those files:
- ADR-436: `  - test/p10-structure.test.js` → `  - test/plugin-structure.test.js`
- ADR-449: `  - test/p10-structure.test.js` → `  - test/plugin-structure.test.js`

These `subjects:` lists route the governing corpus (scripts/governing-corpus.sh); no gate
catches a dangling subject, so this edit is the only thing keeping the route alive. ADR bodies
and every dated ledger (docs/contributing/{adr,archive,design,plan,prd}/) keep the old names on
purpose. BACKLOG.md:354 and :369 also name the old p10 file; Part 9 updates them, not this part.

### TDD steps

1. RED (evidence), before any change: record the baseline
   `bash scripts/ci.sh > <tmp>/ci-before.txt 2>&1; awk '/^# pass /{p+=$3} /^# fail /{f+=$3} END{print p, f}' <tmp>/ci-before.txt`,
   and `git ls-files | grep -E '(^|/)[pP][0-9]+-' | grep -v '^docs/contributing/\(archive\|design\|plan\|adr\|prd\)/'`
   lists the 3 old files. The sweep evidence command over the 3 old files lists 9 lines
   (p10 :229, :232, :233, :239, :242, :243; p22 :90, :95, :96).
2. GREEN: `git mv` the three files to their new names; edit the six lines above in the new
   files; edit line 4 of both ADRs. Stage the renamed files and the two ADRs.
3. GREEN check: the `git ls-files` command lists nothing; the sweep evidence command over the 3
   new files lists exactly the 3 data lines (plugin-structure :232, :242; memory-store :95);
   `grep -n 'p10-structure' docs/contributing/adr/436-*.md docs/contributing/adr/449-*.md` lists
   nothing on line 4.
4. GUARD: rerun ci.sh into `<tmp>/ci-after.txt`; the summed pass and fail totals equal the
   baseline (a rename adds or drops no test).

### Gate

```bash
bash scripts/ci.sh
```

### Commit

`test: name the phase-numbered root suites after their subject`

## Part 5 — reword two example-data lines that read as refs

### Context

Two lines inside the lint suites are not provenance but would be reported by Part 8's
comment/title rule; both are reworded with no loss of meaning. Files:
`engine/test/adr-lint-main.test.js`, `engine/test/plan-lint-main.test.js`. Every other hit in
these files is fixture data on code lines and stays.

| File:line | Today | After |
|---|---|---|
| adr-lint-main.test.js:1011 (comment) | `  // an id of "01" would make the pattern ADR-(01) match ADR-012 and` | `  // an id of "01" would make the pattern match a longer id such as 012 and` (line 1012 `  // mis-attribute the hit.` stays) |
| plan-lint-main.test.js:557 (title) | `test('Given a part heading with two spaces before a multi-digit label ("## Part  12 — thing"), when main runs, then the resolved label is exactly "Part 12"', () => {` | `test('Given a part heading with two spaces before a multi-digit label, when main runs, then the resolved label keeps the whole number', () => {` |

The test body at plan-lint-main.test.js:558-570 (the `oddPart` fixture and the `Part 12`
assertion) is unchanged.

### TDD steps

1. RED (evidence): the sweep evidence command over the 2 files counts 92 lines in
   adr-lint-main and 28 in plan-lint-main (use `git grep -c`); `sed -n '1011p'` and `sed -n '557p'`
   show the two lines above.
2. GREEN: the two edits. Counts become 91 and 27; neither line 1011 nor 557 is in the list.
3. GUARD: `npm --prefix engine test` green, same pass count.

### Gate

```bash
npm --prefix engine test
```

### Commit

`test: reword two example-data lines that read as provenance refs`

## Part 6 — shipped single-letter ids and the review-id token

### Context

ADR-489. Files: `engine/src/findings.js`, `engine/src/observability/adapters/claude/telemetry.js`,
`engine/src/observability/metrics-line.js` (comment edits only, no code change), and
`test/source-hygiene.test.js` (class-E pattern + 2 tests).

Today, `test/source-hygiene.test.js` (located by symbol; :126-:156 on the Part 5 tree):

```js
// Class E: phase, decision-record, part and backlog numbering in shipped code (contracts/core.md).
// Shipped code only: tests, skills and templates carry such tokens as fixture data or as
// deliberate decision citations that adr-lint checks.
const PROVENANCE_REF_PATTERN = '\\b(ADR-?\\d+|P\\d+|Part\\s+\\d+|backlog\\s*#\\d+|DC-\\d+)\\b';
const SHIPPED_CODE_PATHSPECS = [ … ]; // unchanged: engine/src, engine/bin, hooks, scripts and five adapters/*/<dir> globs

function listProvenanceRefLines(cwd, env = process.env) {
  try {
    return execFileSync('git', ['grep', '-n', '-i', '-P', PROVENANCE_REF_PATTERN, '--', ...SHIPPED_CODE_PATHSPECS], { … })
  …
```

GREEN replaces the single `PROVENANCE_REF_PATTERN` line with (keep the 3-line scope comment
above it as is; Part 8 rewrites it):

```js
const PROVENANCE_REF_TOKENS = 'ADR-?\\d+|P\\d+|Part\\s+\\d+|backlog\\s*#\\d+|DC-\\d+';
// Case-sensitive inside the -i scan: a `-f2-` cut field or an `r1` variable is not a review id.
const REVIEW_ID_TOKEN = '(?-i:[RTF]\\d+)';
const PROVENANCE_REF_PATTERN = `\\b(${PROVENANCE_REF_TOKENS})\\b`;
const SHIPPED_PROVENANCE_REF_PATTERN = `\\b(${PROVENANCE_REF_TOKENS}|${REVIEW_ID_TOKEN})\\b`;
```

and `listProvenanceRefLines` passes `SHIPPED_PROVENANCE_REF_PATTERN` instead of
`PROVENANCE_REF_PATTERN` to git grep. `PROVENANCE_REF_PATTERN` keeps its exact current value
(Part 8's test-tree scan uses it, without the review-id token, because
test/architecture-boundaries.test.js defines R1-R3 as rule names).

Pinned probe (git grep -i -P, live tree): the shipped pattern plus the token hits exactly 3
lines, and `(?-i:…)` keeps scripts/run-ledger.sh:214 (`cut -d' ' -f2-`) out.

New tests, placed right after the existing test "Given a git repo tracking a decision-candidate
ref in engine source and a phase ref in an engine test, when listProvenanceRefLines scans it,
then only the shipped-code line is reported"; reuse `withThrowawayRepo(files, assertOnRepo)` and
`hermeticGitEnv()` (both defined above the class-E tests in the same file):

```js
test('Given a git repo tracking a single-letter review id in engine source, when listProvenanceRefLines scans it, then the line is reported', () => {
  const files = { 'engine/src/a.js': '// F6: x\n' };
  withThrowawayRepo(files, (repo) => {
    const sut = listProvenanceRefLines;

    const result = sut(repo, hermeticGitEnv());

    assert.deepStrictEqual(result, ['engine/src/a.js:1:// F6: x']);
  });
});

test('Given a shipped script cutting a field range and a lower-case r-number in engine source, when listProvenanceRefLines scans them, then nothing is reported', () => {
  const files = { 'scripts/x.sh': 'cut -d" " -f2-\n', 'engine/src/b.js': '// r1 lower\n' };
  withThrowawayRepo(files, (repo) => {
    const sut = listProvenanceRefLines;

    const result = sut(repo, hermeticGitEnv());

    assert.deepStrictEqual(result, []);
  });
});
```

Shipped comment rewordings (exact text; stub-lint scans these engine/src files in ci.sh and
none of the new words is a marker):

- `engine/src/findings.js:197`: ` * Accepts two shapes interchangeably (R10 — key on fields, never on layout):`
  → ` * Accepts two shapes interchangeably (key on fields, never on layout):`
- `engine/src/observability/adapters/claude/telemetry.js:59`:
  `// F6: coerce non-finite values (string, NaN, null) to 0 so they can't poison cost math.`
  → `// Coerce non-finite values (string, NaN, null) to 0 so they can't poison cost math.`
- `engine/src/observability/metrics-line.js:8-10` (three lines today) is replaced by four lines:

```text
 * imported one — this module sits under engine/src/observability/ and is not
 * a declared composition root, and test/architecture-boundaries.test.js allows
 * vendor bindings to be wired up only there, so it cannot import
 * adapters/claude/metrics-split.js directly. The
```

  Lines 11-12 (` * composition root supplies the closure …`) are unchanged.

### TDD steps

1. RED: "Given a git repo tracking a single-letter review id in engine source, when
   listProvenanceRefLines scans it, then the line is reported" — fails: `deepStrictEqual` gets
   `[]`, because the shipped pattern has no single-letter id token.
2. GUARD: "Given a shipped script cutting a field range and a lower-case r-number in engine
   source, when listProvenanceRefLines scans them, then nothing is reported" — passes today
   (no token matches `-f2-` or `r1`); it is the test that pins `(?-i:…)` after GREEN, since
   Stryker does not mutate test-file constants.
3. GREEN: the constants split and the `listProvenanceRefLines` switch. The RED test passes, the
   GUARD stays green. Expected intermediate: the whole-tree test "Given the tracked tree, when
   shipped code is scanned for provenance refs, then none remain" now fails listing exactly the
   3 shipped lines (findings.js:197, telemetry.js:59, metrics-line.js:9) — the token's teeth on
   the live tree. Do not commit here.
4. GREEN: the three shipped comment rewordings. The whole-tree test passes;
   `env -u GIT_DIR -u GIT_WORK_TREE -u GIT_INDEX_FILE -u GIT_LITERAL_PATHSPECS git grep -n -P '\b[RTF]\d+\b' -- engine/src engine/bin hooks scripts ':(glob)adapters/*/src/**' ':(glob)adapters/*/bin/**' ':(glob)adapters/*/extensions/**' ':(glob)adapters/*/hooks/**' ':(glob)adapters/*/plugins/**'`
   lists nothing.

### Gate

```bash
bash scripts/ci.sh
```

### Commit

`chore: strip single-letter review ids from shipped comments and guard them in class E`

## Part 7 — test twins of the stripped ids

### Context

ADR-492 (DC-4 b): the seven test lines that cite `R10` or `F6`, ids no shipped code carries
after Part 6, say what they pin without the id. Files: `engine/test/findings.test.js`,
`engine/test/model-class-shape.test.js`, `engine/test/normalize-findings-bin.test.js`,
`engine/test/telemetry-claude.test.js`. All other test-side single-letter ids (T1-T5, F1-F5,
R3/R4/R6/B2/B4 in other engine suites, R1-R3 in test/architecture-boundaries.test.js) stay.

| File:line | Today | After |
|---|---|---|
| findings.test.js:61 (banner) | `// ─── R10 anchor: both layouts produce identical field-keyed output ───…` | `// ─── both layouts produce identical field-keyed output ───…` |
| findings.test.js:63 (title) | `… then results are deeply equal (R10)', () => {` | `… then results are deeply equal', () => {` |
| findings.test.js:259 (title) | `… with-status fixtures, … then results are deeply equal (R10)', () => {` | `… then results are deeply equal', () => {` |
| model-class-shape.test.js:133 (banner) | `// ─── 2. normalizeFindings shape-stability (R10 discharge) ───…` | `// ─── 2. normalizeFindings shape-stability ───…` |
| normalize-findings-bin.test.js:63 (banner) | `// ─── R10 anchor: both shapes produce byte-identical output ───…` | `// ─── both shapes produce byte-identical output ───…` |
| normalize-findings-bin.test.js:65 (title) | `… then stdout is byte-identical (R10)', () => {` | `… then stdout is byte-identical', () => {` |
| telemetry-claude.test.js:71 (banner) | `// ── 4. tokensFromClaudeUsage — adversarial non-numeric values coerce to 0 (F6) ─` | `// ── 4. tokensFromClaudeUsage — adversarial non-numeric values coerce to 0 ──────` |

The two findings.test.js titles stay distinct ("per-line fixtures" vs "per-line with-status
fixtures"). No other file references these titles. Commands (dry-run verified):

```bash
perl -CSD -Mutf8 -i -pe 'BEGIN { %L = map { $_ => 1 } (61,63,259) } if ($L{$.}) { my $w = length; s/─── R10 anchor: /─── /; s/ \(R10\)//; my $d = $w - length; s/─$/"─" x ($d + 1)/e if $d > 0; }' engine/test/findings.test.js
perl -CSD -Mutf8 -i -pe 'if ($. == 133) { my $w = length; s/ \(R10 discharge\)//; my $d = $w - length; s/─$/"─" x ($d + 1)/e if $d > 0; }' engine/test/model-class-shape.test.js
perl -CSD -Mutf8 -i -pe 'BEGIN { %L = map { $_ => 1 } (63,65) } if ($L{$.}) { my $w = length; s/─── R10 anchor: /─── /; s/ \(R10\)//; my $d = $w - length; s/─$/"─" x ($d + 1)/e if $d > 0; }' engine/test/normalize-findings-bin.test.js
perl -CSD -Mutf8 -i -pe 'if ($. == 71) { my $w = length; s/ \(F6\)//; my $d = $w - length; s/─$/"─" x ($d + 1)/e if $d > 0; }' engine/test/telemetry-claude.test.js
```

### TDD steps

1. RED (evidence):
   `env -u GIT_DIR -u GIT_WORK_TREE -u GIT_INDEX_FILE -u GIT_LITERAL_PATHSPECS git grep -n -P '\b(R10|F6)\b' -- engine/test`
   lists the 7 lines above.
2. GREEN: run the four `perl` commands. The command lists nothing.
3. GUARD: `npm --prefix engine test` green, same pass count.

### Gate

```bash
npm --prefix engine test
```

### Commit

`test: drop stripped review ids from their test twins`

## Part 8 — class E over test comments and titles

### Context

ADR-490 (DC-2 a). One file: `test/source-hygiene.test.js`. Must run after Parts 1-5: the
whole-tree test below is green only because those sweeps landed. Line numbers moved in Part 6;
locate by symbol.

Existing pieces to reuse (all in this file): `LOCATED_LINE_PATTERN` (`/^(.+?):(\d+):(.*)$/s`),
`GIT_GREP_NO_MATCH` (1), `GIT_NOT_A_REPOSITORY` (128), `withoutAmbientGitScope(env)`,
`hermeticGitEnv()`, `withThrowawayRepo(files, assertOnRepo)` (creates parent dirs, `git add .`),
`PROVENANCE_REF_PATTERN` (base tokens, no review-id token) and `SHIPPED_PROVENANCE_REF_PATTERN`
from Part 6. Do NOT reuse `runGrep`: it swallows grep errors. The `LEAK_SHAPED_LINES` /
`HARMLESS_LINES` loops in this file are the style for the table-driven tests.

Current `listProvenanceRefLines(cwd, env = process.env)` body (try `execFileSync('git', ['grep',
'-n', '-i', '-P', SHIPPED_PROVENANCE_REF_PATTERN, '--', ...SHIPPED_CODE_PATHSPECS], { cwd, env:
withoutAmbientGitScope(env), encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).split('\n').filter(Boolean)`;
catch: `GIT_GREP_NO_MATCH` → `[]`, else rethrow) becomes the extracted `grepTrackedLines`.

GREEN code, inserted right after `SHIPPED_CODE_PATHSPECS` (replacing the old
`listProvenanceRefLines` body):

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

function grepTrackedLines(cwd, env, pattern, pathspecs) {
  try {
    return execFileSync('git', ['grep', '-n', '-i', '-P', pattern, '--', ...pathspecs], {
      cwd,
      env: withoutAmbientGitScope(env),
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    })
      .split('\n')
      .filter(Boolean);
  } catch (err) {
    if (err.status === GIT_GREP_NO_MATCH) return [];
    throw err;
  }
}

function listProvenanceRefLines(cwd, env = process.env) {
  return grepTrackedLines(cwd, env, SHIPPED_PROVENANCE_REF_PATTERN, SHIPPED_CODE_PATHSPECS);
}

function isTitleLine(text, previousText) {
  if (TITLE_ON_SAME_LINE.test(text)) return true;
  return TITLE_CALL_OPENS_LINE_END.test(previousText) && STRING_OPENS_LINE.test(text);
}

function isCommentOrTitleLine(file, text, previousText) {
  const extension = path.extname(file);
  if (HASH_COMMENT_EXTENSIONS.has(extension)) return HASH_COMMENT_LINE.test(text);
  if (!SLASH_COMMENT_EXTENSIONS.has(extension)) return false;
  return SLASH_COMMENT_LINE.test(text) || isTitleLine(text, previousText);
}

function commentOrTitleRows(cwd, rows) {
  const linesByFile = new Map();
  const linesOf = (file) => {
    if (!linesByFile.has(file)) linesByFile.set(file, fs.readFileSync(path.join(cwd, file), 'utf8').split('\n'));
    return linesByFile.get(file);
  };
  return rows.filter((row) => {
    const located = row.match(LOCATED_LINE_PATTERN);
    if (!located) throw new Error(`class E: unparsable git grep row of ${row.length} chars`);
    const [, file, line, text] = located;
    const previousText = Number(line) > 1 ? linesOf(file)[Number(line) - 2] : '';
    return isCommentOrTitleLine(file, text, previousText);
  });
}

function listTestProvenanceRefLines(cwd, env = process.env) {
  return commentOrTitleRows(cwd, grepTrackedLines(cwd, env, PROVENANCE_REF_PATTERN, TEST_CODE_PATHSPECS));
}
```

Behaviour notes: extensions outside both sets (`.md`, `.json`, `.jsonl`, `.txt`) are never
reported — a markdown `#` is a heading in fixture data (documented fail-open). A file read error
propagates. Trailing comments, titles split over concatenated strings and block-comment lines
without a leading `*` are unguarded by design. Pinned with a throwaway classifier of this exact
logic over the live tree before the sweep: 193 test-tree hits, 48 kept, all of them the Parts
1-5 lines, so the tree scan is `[]` once Parts 1-5 have landed.

REFACTOR: the scope comment above `PROVENANCE_REF_TOKENS` (3 lines today, starting
`// Class E: phase, decision-record, part and backlog numbering in shipped code`) becomes:

```js
// Class E: phase, decision-record, part and backlog numbering (contracts/core.md).
// Shipped code is scanned whole-line, single-letter review ids included. Tests are scanned in
// comments and titles only: test code and fixtures carry these tokens as data. Skills and
// templates are not scanned: their decision citations are deliberate and adr-lint checks them.
```

**Self-scan trap.** The whole-tree test scans `test/source-hygiene.test.js` itself, with `-i`
(so `p1`, `part 2`, `adr12` all match). A token must never sit on a line that starts with `//`,
`/*` or `*` (comments, JSDoc), on a line that starts with `test(`/`it(`/`describe(`, or on a
quote-led line directly after a line ending in `test(`/`it(`/`describe(`. So: titles and
comments carry no token (the classifier does not depend on tokens, so the TB.1/TB.2 rows carry
none either); token-bearing fixture strings sit only on code lines (`const files = …`,
`assert.deepStrictEqual(…)`) or on object-literal key lines whose previous line is
`const files = {` or another key line. If this is violated, the whole-tree test fails and names
the line.

Tests to append at the end of the file, after "Given the tracked tree, when shipped code is
scanned for provenance refs, then none remain":

```js
const COMMENT_OR_TITLE_ROWS = [
  { file: 'a.test.js', text: '// ─── x ─', previousText: '' },
  { file: 'a.test.js', text: '/* x */', previousText: '' },
  { file: 'a.test.js', text: ' * x (y)', previousText: '/**' },
  { file: 'a.test.js', text: "test('Given x', () => {", previousText: '' },
  { file: 'a.mjs', text: "describe.skip('x', () => {", previousText: '' },
  { file: 'a.test.js', text: "  'Given x',", previousText: 'test(' },
  { file: 'a.yml', text: '# x', previousText: '' },
];
const NEITHER_COMMENT_NOR_TITLE_ROWS = [
  { file: 'a.test.js', text: "const plan = 'x';", previousText: '' },
  { file: 'a.test.js', text: "  'x',", previousText: 'const a = [' },
  { file: 'a.test.js', text: "    assert.ok(re.test('x'));", previousText: '' },
  { file: 'a.md', text: '# x', previousText: '' },
  { file: 'a.md', text: '## x — y', previousText: '' },
  { file: 'a.json', text: '"x"', previousText: '' },
];
```

One loop per table, title built from the row (`JSON.stringify` the texts so each title is
unique), body `const sut = isCommentOrTitleLine; const result = sut(row.file, row.text,
row.previousText); assert.strictEqual(result, true|false);`. Title shapes:
`Given the ${row.file} line ${JSON.stringify(row.text)} after ${JSON.stringify(row.previousText)}, when isCommentOrTitleLine judges it, then it is a comment or a title`
and `…, then it is neither a comment nor a title`.

Fixture-repo tests (mirror the class-E tests above them):

| Id | Title | Arrange → Assert |
|---|---|---|
| TB.7 | Given a git grep row with no file:line prefix, when commentOrTitleRows filters it, then it throws instead of skipping the row | `sut(os.tmpdir(), ['no location prefix'])` → `assert.throws(act, /class E: unparsable git grep row/)` |
| TB.3 | Given a git repo tracking test-tree refs in a comment, a next-line title, a code string and a markdown heading, when listTestProvenanceRefLines scans it, then only the comment and the title are reported | files below, `sut(repo, hermeticGitEnv())` → `['engine/test/a.test.js:1:// ─── P29 banner', "test/b.test.js:2:  'Given DC-2 x',"]` (git grep emits path-sorted rows) |
| TB.4 | Given an ambient GIT_LITERAL_PATHSPECS, when listTestProvenanceRefLines scans a repo with a ref in an adapter test title, then the title line is still reported | `const files = { 'adapters/x/test/a.test.js': "test('Given DC-2 x', () => {});\n" };`, `sut(repo, { ...hermeticGitEnv(), GIT_LITERAL_PATHSPECS: '1' })` → `["adapters/x/test/a.test.js:1:test('Given DC-2 x', () => {});"]` |
| TB.5 | Given a directory outside any git repository, when listTestProvenanceRefLines scans it, then the git failure propagates | mkdtemp non-repo dir, `assert.throws(act, { status: GIT_NOT_A_REPOSITORY })`, `finally` rmSync (copy the shipped variant) |
| TB.6 | Given the tracked tree, when test comments and titles are scanned for provenance refs, then none remain | `sut(ROOT)` → `[]`, message ``Source-hygiene FAIL — provenance refs in test comments or titles (class E) at:\n${result.join('\n')}`` |

TB.3 fixture (each key line follows `const files = {` or another key line, so it is not a title):

```js
const files = {
  'engine/test/a.test.js': "// ─── P29 banner\nconst plan = 'Part 2';\n",
  'test/b.test.js': "test(\n  'Given DC-2 x',\n  () => {},\n);\n",
  'test/fixtures/p.md': '## Part 1 — x\n',
  'engine/src/c.js': '// DC-3: x\n',
};
```

Probed in a throwaway repo with this exact classifier: the engine/test comment (line 1, empty
previous line) and the test/b title (line 2, previous `test(`) are kept; the code string, the
markdown heading and the engine/src file (outside the test pathspecs) are not.

The existing test "Given a git repo tracking a decision-candidate ref in engine source and a
phase ref in an engine test, when listProvenanceRefLines scans it, then only the shipped-code
line is reported" stays unchanged: it still pins the shipped scope.

### TDD steps

1. RED: the seven `COMMENT_OR_TITLE_ROWS` tests — fail with `ReferenceError:
   isCommentOrTitleLine is not defined`.
2. RED: the six `NEITHER_COMMENT_NOR_TITLE_ROWS` tests — same `ReferenceError`.
3. GREEN: add `TEST_CODE_PATHSPECS`, the comment/title constants, `isTitleLine` and
   `isCommentOrTitleLine`. All 13 pass.
4. RED: TB.7 — fails with `ReferenceError: commentOrTitleRows is not defined`.
5. GREEN: add `commentOrTitleRows`. TB.7 passes.
6. RED: TB.3 and TB.4 — fail with `ReferenceError: listTestProvenanceRefLines is not defined`.
7. GREEN: extract `grepTrackedLines`, make `listProvenanceRefLines` a one-line call to it, add
   `listTestProvenanceRefLines`. TB.3 and TB.4 pass. GUARD: the existing class-E tests
   (decision-candidate scope, ambient `GIT_LITERAL_PATHSPECS`, BACKLOG/`SC5-*` non-match,
   non-repo propagation, the Part 6 single-letter pair, whole-tree shipped) stay green — the
   extraction keeps their behaviour.
8. GUARD: TB.5 — passes because `grepTrackedLines` rethrows any status other than 1 (git exits
   128 outside a repo).
9. GUARD: TB.6 — passes because Parts 1-5 already removed every comment/title hit; TB.3 is
   its teeth. If it fails, the listed rows name the line (likely a self-scan trap violation).
10. REFACTOR: rewrite the scope comment as given. Rerun the file:
    `node --test test/source-hygiene.test.js`.

### Gate

```bash
bash scripts/ci.sh
```

### Commit

`chore: extend class E to test comments and titles`

## Part 9 — BACKLOG flip

### Context

Docs-only. One file: `BACKLOG.md`. The README receipts already moved in Part 0.

1. Flip the two entries under `### Open (scoped 2026-10-12 — follow-ups surfaced by the
   backlog-sweep-six-entries run, not yet scheduled)` (BACKLOG.md:178-198) in place, keeping
   the section heading, in the sibling shape used at BACKLOG.md:201-213
   (`**<title> — delivered 2026-10-12**` then `(<branch>). <what changed>. Design: [...]; ADR-…`).
   Replace each entry's whole paragraph with exactly:

```markdown
**Single-letter rule ids still sit in shipped code comments — delivered 2026-10-12**
(chore/provenance-sweep-part-two). `R10` (`engine/src/findings.js`) and `F6`
(`engine/src/observability/adapters/claude/telemetry.js`) are dropped from their comments, and
the `R3` comment in `engine/src/observability/metrics-line.js` states the composition-root rule
in words. Class E's shipped-code scan gains a `(?-i:[RTF]\d+)` token, case-sensitive inside the
case-insensitive scan, so `-f2-` in `scripts/run-ledger.sh` and a lower-case `r1` are not
reported (ADR-489). The seven test lines citing `R10` or `F6` say what they pin without the id
(ADR-492); the other test-side single-letter ids, and the `R1`–`R3` rule names in
`test/architecture-boundaries.test.js`, are unchanged. Design:
[provenance-sweep-part-two](docs/contributing/design/provenance-sweep-part-two.md); ADR-489–492.

**Provenance refs in tests are unguarded — delivered 2026-10-12**
(chore/provenance-sweep-part-two). The 46 test comments and titles carrying provenance are
reworded to give the reason, along with three assert messages, three fixture headings and two
example-data lines that read as refs. Class E now also scans `engine/test`, `test` and
`adapters/*/test`, reporting a hit only on a comment line or a line-anchored
`test`/`it`/`describe` title, with no allowlist; the 139 remaining hits are fixture data
(ADR-490). `test/p10-structure.test.js`, `test/p20-dod.test.js` and `test/p22-memory.test.js`
are now `test/plugin-structure.test.js`, `test/repo-dod.test.js` and `test/memory-store.test.js`,
and the `subjects:` of ADR-436 and ADR-449 follow (ADR-491). Design:
[provenance-sweep-part-two](docs/contributing/design/provenance-sweep-part-two.md); ADR-489–492.
```

   Before committing, check the two counts against the tree:
   `env -u GIT_DIR -u GIT_WORK_TREE -u GIT_INDEX_FILE -u GIT_LITERAL_PATHSPECS git grep -c -i -P '\b(ADR-?\d+|P\d+|Part\s+\d+|backlog\s*#\d+|DC-\d+)\b' -- engine/test test ':(glob)adapters/*/test/**' | awk -F: '{s+=$2} END {print s}'`
   prints 139; if a part deviated, correct the number in the text rather than the tree.
2. Two older delivered entries name the old file: "Haiku omits the arriving-`GUARD` deferred
   observation" (BACKLOG.md:354, "test/p10-structure.test.js
   pins the token prefix") and "Bound the arriving-`GUARD` exemption to the part" (BACKLOG.md:369,
   "engine/test/contract-equivalence.test.js and test/p10-structure.test.js pin both"). Line
   numbers shift after step 1, and the flipped entry from step 1 names the old file too (its
   rename sentence, which stays). Locate the two with `grep -n 'p10-structure' BACKLOG.md` and
   replace the path with test/plugin-structure.test.js in those two entries only, nothing else.

prose-lint (advisory) scans touched `.md`; the text above has no ban-list word (`delve`,
`leverage`, `seamless`, `robust`, …). backlog-lint checks section headings only.

### TDD steps

1. RED (evidence): `grep -n 'delivered 2026-10-12\*\*' BACKLOG.md` does not list either entry
   title, and `grep -c 'p10-structure' BACKLOG.md` prints 2.
2. GREEN: the two edits. Both titles appear with `— delivered 2026-10-12**`;
   `grep -c 'p10-structure' BACKLOG.md` prints 1 (the rename sentence in the flipped entry);
   `grep -c 'plugin-structure' BACKLOG.md` prints 3; `bash scripts/backlog-lint.sh BACKLOG.md` OK.
3. GUARD: `bash scripts/readme-drift.sh` exits 0 (no corpus file added since Part 0).

### Gate

```bash
bash scripts/ci.sh
bash scripts/readme-drift.sh
```

### Commit

`docs(backlog): mark the two provenance entries delivered`

## Decision candidates

None open. The four design decision candidates were ratified as recommended (DC-1 a, DC-2 a,
DC-3 a, DC-4 b; ADR-489 to ADR-492). Two plan-level calls are forced or local, not
load-bearing choices:

- Part 0 moves the README receipt bump ahead of the sweep. Every alternative order leaves the
  engine and process gates red on readme-drift (proof in Run-wide notes), so there is nothing
  to choose.
- Part 8 splits row parsing into `commentOrTitleRows` so the design's "unparsable row throws"
  edge gets its own test (TB.7) and each function stays under 20 lines. Behaviour and public
  surface are as designed.
