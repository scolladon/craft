# Plan — decision-drift propagation

> Source: design doc `docs/contributing/design/decision-drift-propagation.md` · ADRs 351–360
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

## Standing facts every part needs

Read this once; no part block repeats it.

**Working tree.** `/Users/scolladon/workspace/perso/craft-decision-drift-propagation`,
branch `feat/decision-drift-propagation`, deps installed under `engine/node_modules`.
There is no root `package.json` — the root suite runs as bare `node --test`.

**Both gate suites are RED on arrival.** Probed at plan time:
`node --test 'test/**/*.test.js'` → 293 pass / 1 fail; `npm --prefix engine test` →
2450 pass / 1 fail. Both failures have the same cause — `README.md` line 180–181 claims
`28 design docs` / `27 parted plans` / `350 ADRs` while the tree now holds 29 / 28 / 360
(the design phase added one design doc, the decisions phase added ADRs 351–360, this
plan adds one plan). **Part 1 repairs that and nothing else.** No later part may commit
until Part 1 has landed, because "never commit on a red gate" would otherwise be
unsatisfiable.

**The tree carries one unrelated dirty file.** `.claude/craft-metrics.md` is modified and
uncommitted at plan time — it is the orchestrator's telemetry ledger, not part of this
change. Never stage it, never revert it, never mention it in a commit. Each part stages
and commits its own files by explicit path, never `git add -A`.

**Suites are two different module systems.** `engine/test/*.test.js` is ESM
(`import { test } from 'node:test'`, `assert from 'node:assert/strict'`).
`test/*.test.js` is CommonJS (`'use strict'; const { test } = require('node:test')`).
Copy the idiom of the file you are mirroring; do not mix.

**Test style.** London-school, Given/When/Then titles, AAA bodies, the system under
test bound to a local `const sut = …`. Existing files in both suites already do this —
match the neighbours.

**Hard prohibitions.** No provenance refs (phase / ADR / backlog numbers) in source or
test code — this repo carries them in docs only. No suppression directives of any
flavour. No swallowed errors: every catch either handles, rethrows with context, or
writes a loud stderr line. Note that `engine/src` uses `// equivalent mutant (…)`
comments as a *documented convention* for Stryker triage — those are allowed and are
not provenance refs.

**Public-surface decision, settled here, not deferred.** `engine/src/index.js` is the
engine's barrel and exports exactly eight symbols. Neither `intention.js` nor any
`*-lint-main.js` is in it — the lint mains are reached only through their
`engine/bin/*.js` shim, and `intention.js` is reached only through skill prose. Every
new symbol this plan introduces (`adr-lint-main.js`'s `main`, the widened
`readSubjectPages`, the `adr` manifest validator) is therefore **internal**: no barrel
entry, no `engine/src/index.js` edit, in any part. The one genuinely public surface
this change adds is the `adr.frozen` manifest key — Part 3 pre-pays its downstream
gates (vocabulary set, validator switch, `docs/guides/customizing.md` knob table).

## Part 1 — Unwedge both suites: refresh the README corpus counts

### Context

Docs-only, no `src/` delta — standalone by the sizing exception, and a hard
precondition for every later part's gate.

- File to edit: `README.md`, lines 179–181, in the `## craft builds craft` section. The
  three claims are inline markdown links whose link text opens with the count:

  ```
  receipts: [28 design docs](docs/contributing/design/), [27 parted plans](docs/contributing/plan/),
  [350 ADRs](docs/contributing/adr/), and [raw telemetry for 25 runs](docs/contributing/metrics-baseline.report.json)
  ```

- The checker: `engine/src/readme-drift-main.js` → `corpusCountFindings(root, corpusClaims)`
  (line ~119). It reads each claim with the regex `CORPUS_CLAIM =
  /\[(\d+)\s[^\]]*\]\((docs\/[^)]*\/)\)/g` in `engine/src/readme-regions.js` line 33,
  then compares the claimed number against `readdirSync(join(root, dir))` filtered on the
  `.md` suffix. Only claims whose link target ends in `/` are checked — the telemetry
  claim (`…report.json`) is not a corpus claim and must not be touched.
- Two tests observe it, one per suite:
  - `test/readme-drift.test.js` line 97 — `'Given the live repo tree, when readme-drift
    runs, then it exits 0 with no findings'`.
  - `engine/test/readme-drift-main.test.js` line 304 — `'Given no root argument, when
    main runs, then it resolves DEFAULT_ROOT against the real repo root and finds no
    unusable-input errors'`.
- Ground truth at plan time, re-probe before editing (the numbers are a function of the
  tree, and this plan's own file is one of the plan docs):

  ```bash
  ls docs/contributing/design/*.md | wc -l   # 29
  ls docs/contributing/plan/*.md   | wc -l   # 28  (includes this plan)
  ls docs/contributing/adr/*.md    | wc -l   # 360
  ```

- `readme-drift` is **not** wired into `scripts/ci.sh`; it is gated purely through those
  two test files. Do not add it to `ci.sh`.
- Do not touch the `25 runs` telemetry claim, the README yaml block, or the mermaid
  pipeline diagram — each is guarded by a different sub-guard in the same bin and each
  is currently green.

### TDD steps

RED (observe the standing failure first; do not skip this — it is the evidence the fix
is load-bearing):

1. Run `node --test test/readme-drift.test.js`. Expected failure: the live-tree case
   fails with `readme-drift: corpus-counts: docs/contributing/design/ claims 28, tree
   holds 29` and `readme-drift: corpus-counts: docs/contributing/adr/ claims 350, tree
   holds 360` in the captured output.
2. Run `npm --prefix engine test 2>&1 | grep '^not ok'`. Expected: exactly one failure,
   `Given no root argument, when main runs, then it resolves DEFAULT_ROOT against the
   real repo root…`.

GREEN:

3. Re-probe the three counts with the commands above and rewrite the three link texts in
   `README.md` to the probed values. Change the digits only; leave link targets,
   surrounding prose, and line wrapping exactly as they are.

REFACTOR:

4. None available — this is a three-number data correction. Confirm
   `node engine/bin/readme-drift.js` prints nothing and exits 0.

### Gate

```bash
node --test 'test/**/*.test.js'
npm --prefix engine test
```

Both must be fully green — this part's whole purpose is that they are.

### Commit

`docs(readme): refresh the design, plan and ADR corpus counts`

## Part 2 — Governing enumeration lane: ADRs become consultable

### Context

The read-side fix. Splits the corpus at the **enumeration** boundary so `consult` gains
ADRs while `assertFresh`'s input set is literally untouched.

**`engine/src/intention.js`** (224 lines, pure, no I/O). Current shape:

- `export function consult(scope, deps)` — calls `readSubjectPages(deps)`, filters by
  `matchingPaths(scope, subjects).length > 0`, pushes `{ path: page, purpose:
  extractPurpose(content) }`, returns `{ entries: sortBy(entries, 'path'), skipped:
  sortBy(skipped, 'page') }`.
- `export function assertFresh(change, deps)` — calls `readSubjectPages(deps)`, builds
  `stale` via `buildStaleRow`, `uncovered` via `findUncovered(covers, subjectPages)`,
  `skipped` as-is, and appends `report.note = 'no living pages carry subjects'` when
  `subjectPages.length === 0`.
- `function readSubjectPages(deps)` (private, line ~118) — iterates `deps.listCorpus()`,
  `deps.readPage(page)`, `null` content is `continue` (silent omission), then
  `classifySubjects(content)` → either a `{ reason }` skip row or a
  `{ page, content, subjects }` entry. Returns `{ subjectPages, skipped }`.
- `function extractPurpose(content)` — `stripFrontmatter` then first non-empty line with
  `^#+\s*` stripped. Already fence-aware, so an ADR yields `348 — \`<arch gate>\` resolves
  to the declared technique's own run`. **Do not modify it.**
- `classifySubjects`, `matchingPaths`, `buildStaleRow`, `findUncovered`, `sortBy`,
  `stripFrontmatter`, `isNonEmptyString` — all unchanged.
- `engine/src/intention-subjects.js` `parseSubjects(content)` — **unchanged**, one key,
  one parser, both lanes.

Target shape:

```
readSubjectPages(list, readPage)                    // parameterised by the list it walks
consult(scope, { readPage, listCorpus, listGoverning })
assertFresh(change, { readPage, listCorpus })       // listGoverning is never read
```

`consult` calls `readSubjectPages` twice — `deps.listCorpus()` and
`deps.listGoverning?.() ?? []` — concatenates both `subjectPages` and both `skipped`,
then sorts as today. An absent `listGoverning` must yield byte-identical output to
today's `consult`. `assertFresh` calls it once with `deps.listCorpus()`.

A governing ADR with a present-but-malformed fence still lands in **`consult`'s**
`skipped[]` as `malformed-subjects` — a broken page must read as broken. That is
deliberate and is not a Requirement-3 violation: Requirement 3 constrains the freshness
report only.

**`scripts/governing-corpus.sh`** (new) — sibling of `scripts/living-corpus.sh` (29
lines; read it and mirror its header comment, `set -euo pipefail`, `discovered=()`
accumulation, zero-file hard error, and `LC_ALL=C sort` tail). Differences: it takes the
ADR directory as `$1` (`"${1:?usage: governing-corpus.sh <adr-dir>}"`), enumerates
`find "$adr_dir" -maxdepth 1 -name '*.md'`, and its zero-file stderr message is its own
string. `scripts/ci.sh` line 80 runs `shellcheck scripts/*.sh`, so the new script must be
shellcheck-clean; `living-corpus.sh` is the reference for what passes.

The new enumerator is **not** wired into the CI script. `run_intention_lint` (line 66)
walks the living corpus only — ADR form is `adr-lint` C0's job in Part 4, never
`intention-lint`'s. The governing enumerator's caller is the run skill's §1c-int
`consult`, exactly as `living-corpus.sh`'s already is.

**`engine/test/intention.test.js`** (615 lines, ESM). Existing helpers to extend, at the
top of the file:

- `page(subjects, title = '# Telemetry adapter spec')` — builds a fenced page with
  `subjects: [...]` inline-flow YAML.
- `corpusOf(pages)` → `{ listCorpus: () => Object.keys(pages), readPage: p => … }`.

Add a `governingOf(livingPages, governingPages)` helper in the same style, returning
`{ listCorpus, listGoverning, readPage }` with one shared `readPage` over the union.
Constants already present: `OBS_GLOB = 'engine/src/observability/**'`,
`OBS_PATH = 'engine/src/observability/memory.js'`.

**`test/governing-corpus.test.js`** (new, CommonJS) — mirror `test/living-corpus.test.js`
exactly: `execFileSync('bash', [SCRIPT, …], { cwd: ROOT })`, an `LC_ALL=C` `sort -c`
check via `spawnSync`, and an empty-directory case asserting non-zero exit plus the
stderr message. Do **not** pin the ADR filenames as an `EXPECTED` set the way
`living-corpus.test.js` does — the ADR corpus grows every run and that set would need
editing on each one. Cross-check the script's `find`-based enumeration against an
**independent** `fs.readdirSync` of the ADR directory filtered on the `.md` suffix
(readdir versus find is a real second opinion, not the same command run twice), and pin
sortedness and the zero-file error.

**`docs/contributing/specs/intention.md`** — freshness-guarded on
`engine/src/intention*.js`, so it emits `INTENTION-DRIFT` unless refreshed in this
change. Three edits, all load-bearing:

1. `## Port interface`, the `consult` **pre** bullet (line ~13): `deps` now carries
   `readPage`, `listCorpus`, **and an optional `listGoverning: () => string[]`**; state
   that an absent `listGoverning` yields an empty governing lane.
2. `## file adapter procedure` (line ~137): add the governing lane — `scripts/living-corpus.sh`
   enumerates living pages, `scripts/governing-corpus.sh <adr-dir>` enumerates decision
   records, the frontmatter key is `subjects:` in both lanes, and only the living lane
   reaches `assert-fresh`.
3. **The frozen-record sentence at line ~170 becomes false and must be rewritten.** It
   currently reads: "Frozen records (design history, archived docs, per-run design docs,
   decision records) simply carry no `subjects`, so they are never freshness-guarded, by
   construction." A decision record may now carry `subjects` and still be frozen —
   restate the guarantee on its real footing: no governing-lane path is ever passed to
   `assert-fresh`, so no decision record can appear in `stale[]`, `uncovered[]` **or**
   `skipped[]` of a freshness report.

Do not change the `IntentionView` JSON example — the entry shape is unchanged and adding
a `kind` discriminator is an explicit non-goal.

**`skills/run/SKILL.md`** — two regions, both narrow:

1. §1c-int (lines 87–102): the zero-config corpus sentence gains the governing lane —
   `consult`'s corpus is the living pages **plus** the resolved ADR directory. Leave the
   token list in the same block alone; Part 7 owns it.
2. Step 4's **Intention hint (advisory)** paragraph, line 246: `For the \`design\` and
   \`planning\` phases only` → the same clause naming `design`, `decisions` and
   `planning`. The slice rule, the slot-1 prepend, and the empty-slice behaviour are all
   unchanged — change the phase list and nothing else.

**Regression risk to respect:** `test/run-record.test.js` slices `skills/run/SKILL.md`
between `^## ` headings via `sliceRegion` and asserts pinned sentences (including the
verbatim `Writes are buffered all run and flushed once here…`). Renaming or reflowing a
`## ` heading fails it loudly. Edit inside the existing paragraphs only.

### TDD steps

RED — add each of these to `engine/test/intention.test.js` first and watch it fail:

1. `Given a corpus with one living page and one governing ADR whose subjects both
   intersect the scope, when consult runs, then entries carries both, sorted by path`.
   Expected failure: `consult` ignores `listGoverning`, so `entries` holds one element.
2. `Given a governing ADR with a frontmatter fence carrying no subjects key, when
   consult runs, then it is skipped as no-subjects and never rejected`. Expected
   failure: the ADR never enters the walk, so `skipped` omits it.
3. `Given deps with no listGoverning, when consult runs, then the result deep-equals the
   result from the same deps under today's single-lane read`. Expected failure before
   the change: none — this is the compatibility lock, and it must pass both before and
   after. Write it, run it green, keep it.
4. **The Req-3 lock**: `Given identical change and deps whose governing lane is
   populated, when assertFresh runs, then the report deep-equals the report from the
   same input with an empty governing lane`. Assert `deepStrictEqual` on the whole
   report, and additionally assert no governing path appears in `stale`, `uncovered`
   **or** `skipped`. Expected failure: none yet with the current signature — it becomes
   the guard that the Part-2 refactor does not leak the lane into `assertFresh`. Land it
   before touching `intention.js` and keep it green through the change.
5. `Given a governing ADR body carrying a fence then an H1 of the form '# 348 — <title>',
   when consult runs, then purpose is the H1 with its leading hash stripped and the
   number still in it`. Expected failure: the ADR is not in the lane.
6. In `test/governing-corpus.test.js`: `Given the repo's ADR directory, when
   governing-corpus.sh runs, then it emits one line per .md file, LC_ALL=C-sorted`.
   Expected failure: `bash: scripts/governing-corpus.sh: No such file or directory`.
7. In the same file: `Given a directory holding no markdown, when governing-corpus.sh
   runs, then it exits non-zero with a zero-record stderr message`. Same expected
   failure until the script exists.

GREEN:

8. Write `scripts/governing-corpus.sh`, mirroring `living-corpus.sh`. `chmod +x` it to
   match its sibling's mode.
9. Change `readSubjectPages(deps)` to `readSubjectPages(list, readPage)`; update its
   JSDoc. Update `assertFresh` to the single-lane call. Update `consult` to the two-lane
   call plus concatenation, and widen its JSDoc `@param` for `deps`.

REFACTOR:

10. Both lanes must go through one function — resist a `readGoverningPages` twin. If the
    concatenation reads awkwardly, extract a two-line `mergeLanes(a, b)` local rather
    than duplicating the loop.
11. Refresh `docs/contributing/specs/intention.md` (three edits above) and
    `skills/run/SKILL.md` (two regions above). These are part of the deliverable, not
    follow-ups: the spec is freshness-guarded on the file just edited.

### Gate

```bash
node --test 'test/**/*.test.js'
npm --prefix engine test
```

### Commit

`feat(intention): consult governing ADRs through a separate enumeration lane`

## Part 3 — The `adr.frozen` manifest knob

### Context

The citation sweep's exempt set must derive from resolved manifest paths, never from a
hardcoded `docs/contributing/…` literal in engine code. This part lands the manifest
side only; Part 4 consumes it.

**`engine/src/manifest-vocabulary.js`** (66 lines, pure frozen Sets). `TOP_KEYS` at line
7 currently holds `backlog, memory, paths, context, gates, phases, pr, scripts, models,
pipeline, retrieval, execution, extends, policy, intention, hygiene`. Add `'adr'`. Do
not add a values Set — `frozen` is a free-form glob list, not an enum.

**`engine/src/manifest.js`** (504 lines). Mirror `intention.covers` exactly:

- `function isListOfNonEmptyStrings(value)` already exists at line ~217:
  `Array.isArray(value) && value.every(v => typeof v === 'string' && v.trim() !== '')`.
  Reuse it; do not write a second predicate.
- `function validateHygiene(hygiene, errors)` at line 327 is the closest structural
  sibling for a small single-field block — same guard order (`typeof !== 'object' ||
  === null || Array.isArray` → push `'adr must be an object { frozen }'` and return;
  then the unknown-field loop; then the field check).
- Add `validateAdr(adr, errors)` beside it, and a `case 'adr': validateAdr(value, errors);
  break;` in the dispatch switch at line ~465 (the switch already carries `intention`,
  `hygiene`, `paths` cases). The switch is **not** alphabetical — its order is
  `pr, scripts, pipeline, phases, backlog, memory, intention, policy, hygiene, extends,
  paths` — so place the new case beside `backlog`/`memory` on grounds of neighbourhood,
  never on a sort order the file does not follow.
- Error strings, matching the family's phrasing:
  - `adr must be an object { frozen }`
  - `unknown adr field: <k>`
  - `adr.frozen must be a list of non-empty strings`

**`engine/test/manifest.test.js`** (ESM, ~2450 tests). The `intention.covers` cases at
lines 2432 and 2444 and the `hygiene` block at lines 2339–2429 are the templates. Each
test calls `validateManifest(manifestObject, …)` with an inline object literal — there
are no on-disk fixtures for this; `engine/test/fixtures/manifests/` holds only
role/profile/pipeline scenario files and must not grow for this part. Read the call
shape at line 2339 and copy it verbatim.

**`docs/guides/customizing.md`** — the manifest knob catalogue, and a living-corpus page.
Line 169 documents `hygiene: { gate: advisory|blocking }` *(Tier 0)* as a one-paragraph
knob under `### HOW it's checked`; line 207 is the ports table row for `intention`. Add
`adr: { frozen: [<globs>] }` *(Tier 0)* as a sibling paragraph near line 169: it
overrides the derived dated-ledger exempt set the ADR citation sweep skips. Do **not**
add a row to the `## 4. Examples index` table at line 369 — `test/examples-lint.test.js`
enforces a bijection between `examples/README.md` rows and `examples/*/workflow.md`
directories, and this change ships no example manifest.

`docs/guides/customizing.md` carries no `subjects:` frontmatter and is not
freshness-guarded; it is refreshed here for correctness, because the knob is undocumented
otherwise.

**Do not** wire the knob into the CI script, the repo manifest, or the README yaml
snippet. It stays absent everywhere in this repo — craft's own layout is exactly the
derived default, and `test/readme-drift.test.js`'s manifest-snippet guard validates the
README block through `validateManifest`, which an absent optional key passes.

### TDD steps

RED — add to `engine/test/manifest.test.js`, each expected to fail with
`unknown top-level key: adr` until `TOP_KEYS` grows:

1. `Given adr { frozen: ['docs/history/**'] } when validateManifest runs, then ok:true`.
2. `Given adr { frozen: [] } when validateManifest runs, then ok:true` — an empty list is
   a deliberate "nothing is exempt", not an omission.
3. `Given adr {} when validateManifest runs, then ok:true` — `frozen` is optional.
4. `Given adr { frozen: ['', 1] } when validateManifest runs, then error contains
   "adr.frozen must be a list of non-empty strings"`.
5. `Given adr { frozen: 'docs/**' } when validateManifest runs, then error contains
   "adr.frozen must be a list of non-empty strings"` — a bare string is not a list.
6. `Given adr { bogus: 1 } when validateManifest runs, then error contains "unknown adr
   field"`.
7. `Given adr as an array when validateManifest runs, then error contains "adr must be an
   object"`.
8. `Given adr as null when validateManifest runs, then error contains "adr must be an
   object"`.

GREEN:

9. Add `'adr'` to `TOP_KEYS`.
10. Add `validateAdr` and its switch case.

REFACTOR:

11. If `validateAdr` and `validateHygiene` diverge only in the field name and the
    predicate, leave them separate — the file's convention is one validator per key, and
    collapsing them would hide the field-specific error strings each pushes.
12. Add the `adr.frozen` paragraph to `docs/guides/customizing.md`.

### Gate

```bash
node --test 'test/**/*.test.js'
npm --prefix engine test
```

### Commit

`feat(manifest): accept an adr.frozen glob list for the citation-sweep exempt set`

## Part 4 — `adr-lint`: the C0–C3 whole-corpus gate

### Context

The largest part. A `bin` + `-main.js` + `.sh` triple mirroring `plan-lint`, wired into
`scripts/ci.sh`, hard-blocking, whole-corpus. It lands **green-because-inert** — no ADR
declares `supersedes` yet, so C1–C3 never fire. Part 5 makes it fire.

**The triple, all three files new, each a near-copy of its `plan-lint` sibling:**

- `engine/bin/adr-lint.js` — six lines, byte-for-byte the shape of
  `engine/bin/plan-lint.js`:
  ```js
  #!/usr/bin/env node
  import { fileURLToPath } from 'node:url';
  import { main } from '../src/adr-lint-main.js';
  if (process.argv[1] === fileURLToPath(import.meta.url)) {
    process.exit(main(process.argv.slice(2), { stdout: process.stdout, stderr: process.stderr }));
  }
  ```
- `scripts/adr-lint.sh` — four lines, byte-for-byte the shape of `scripts/plan-lint.sh`
  (`set -euo pipefail`, `ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"`,
  `exec node "$ROOT/engine/bin/adr-lint.js" "$@"`). Must be shellcheck-clean —
  `ci.sh` line 80 runs `shellcheck scripts/*.sh`.
- `engine/src/adr-lint-main.js` — `export function main(argv, io) → exitCode`, exit `0`
  clean / `2` on findings, matching `EXIT_OK` / `EXIT_INVALID` in
  `engine/src/intention-lint-main.js` lines 15–16. **Internal — not exported from
  `engine/src/index.js`.**

**Argv contract:** `adr-lint.sh <adr-dir> [--manifest <path>] [--waiver-source <file>]…`.
Write adr-lint's **own** small arg parser. Do **not** reuse `parseArgs` from
`engine/src/hygiene-lint-core.js`: it owns a `--gate` flag adr-lint deliberately does not
have (this lint has no `hygiene.gate` knob — a superseded decision left un-propagated is
a correctness fact, not a style smell) and it knows nothing of `--manifest`. `--manifest`
defaults to `.claude/workflow.md`; an absent or unreadable manifest is the zero-config
case and resolves silently to defaults, exactly as `engine/src/hygiene-gate-main.js`
`resolveGate` does at its `catch` (read it — it is the reference for "absent is silent,
malformed is a loud stderr line and a fall-back, never a crash"). Parse the manifest with
`parseManifestContent` from `engine/src/frontmatter.js`, not with a bare `js-yaml` `load`:
a real `.claude/workflow.md` is YAML frontmatter plus a markdown body, and only that
function keeps the prose body out of the parser.

**Missing or non-directory `<adr-dir>`, and zero-argument invocation:** print usage on
**stderr** and exit 2, matching `scripts/plan-lint.sh`'s behaviour pinned by
`test/plan-lint.test.js`'s third case (`plan-lint: usage:` on stderr, status 2).

**Output convention** (this plan's choice, mirroring the family — no design constraint
existed, so pin it once here rather than letting each check invent one): every finding —
C0, C1, C2 and C3 alike — goes to **stdout**, one per line, C3's in the hygiene core's
`${foundToken}(${file}): …` shape and C0–C2's as `<adr-path>: <what is wrong>`, matching
`intention-lint`'s `${pagePath}: ${message}` phrasing. Diagnostics that are not findings
(the C3 unrunnable-sweep skip) go to stderr. A clean run prints one line —
`craft-adr: OK — <n> ADR(s) checked, <m> declaring supersession.` — so the CI test can
assert something with content rather than merely an exit code.

**Waiver machinery, reused unchanged:** import `collectWaived` from
`engine/src/hygiene-lint-core.js` and call it as
`collectWaived(waiverSources, io, WAIVER_PATTERN)`. Define
`const WAIVER_PATTERN = /DECISION-CITE-WAIVE\(([^)]+)\)/g;` — the exact shape of
`STUB-WAIVE`/`SLOP-WAIVE` in `engine/src/stub-lint-main.js` line 14 and
`engine/src/prose-lint-main.js` line 21. **`collectWaived` resolves each captured path to
absolute via `resolve(process.cwd(), match[1].trim())`**, so every swept path must be
resolved the same way before the `waived.has(…)` test, or no waiver will ever match.

**Frontmatter reading:** `extractFrontmatter` from `engine/src/frontmatter.js` plus
`js-yaml`'s `load` **directly** — not `parseSubjects`, which returns only
`parsed.subjects` and would discard `supersedes`. Both keys live in one fence and neither
requires the other. A missing fence returns `null` and is a silent skip.

**The four checks.**

*C0 — declaration form, over every ADR.* Fires only when a fence is **present**. A
missing fence is never a finding (that is what keeps all 350 legacy files green
structurally). Malformed YAML in a present fence **is** a finding. When present:
`subjects` must be a list of non-empty strings (the direct analogue of
`checkSubjectsForm` in `engine/src/intention-lint-main.js` line ~163 — read it and
mirror its shape and message), and each `supersedes` entry must be
`{ adr: <string>, scope: <non-empty string> }`. `adr` is the **zero-padded 3-digit id
exactly as it appears in the filename and in `ADR-NNN` prose** — `"050"`, never `50`.
C0 checks form, **never presence**: it can never require the block. The template is the
enforcement surface for new ADRs, not the lint.

*C1 — target status flip.* For `supersedes: [{ adr: N }]` in ADR *M*, resolve the file in
`<adr-dir>` whose basename starts `N-` and require it to carry the line
`- **Status:** superseded by ADR-M`. Zero matches, or two files sharing the prefix, is a
finding — never a crash.

*C2 — scope stated in both directions.* *M*'s body must carry both anchors, each naming
*N*, matched as **line-anchored prefixes**: `^Superseded from ADR-N\b` and
`^Carried forward from ADR-N\b`. Everything after the id is free prose and is never read.
The prefix (not a colon) match is load-bearing — ADR-348's real lines are
`Carried forward from ADR-050, unchanged and now stated tool-independently:` (line 42)
and `Superseded from ADR-050: every mention of dependency-cruiser as the gate, the
exception` (line 51); a `ADR-N:` colon match would fail the one file in 360 that got this
right by hand. Both anchors are required; "nothing survives" is written as
`Carried forward from ADR-N: nothing — <why>`, never by omitting the anchor.

*C3 — live-tier citation sweep.* One `git grep -n -E 'ADR-(N1|N2|…)'` pass over the
**tracked** tree — tracked-only, matching `scripts/docs-structure-lint.sh --audience`'s
`git ls-files` posture, so untracked junk and `node_modules` can never enter the sweep.
Every hit outside the exempt set is
`DECISION-CITE-FOUND(<file>): ADR-N@L<n>` on stdout, unless waived. Rules:

- Target numbers are **regex-escaped** into the alternation, never interpolated raw.
- **Zero ADRs declaring `supersedes` skips the `git grep` entirely** — no process is
  spawned on the common path. This is the state Part 4 ships in.
- A tree with no git, or a `git grep` that fails, yields a **recorded skip on stderr and
  exit 0 for C3** — a sweep that cannot run is not a pass claim and not a crash. This
  matches `compute_touched`'s degrade-to-empty posture in `scripts/ci.sh` line 113.
  Note `git grep` exits 1 on "no matches", which is success, not failure — distinguish it
  from a real invocation error.
- `DECISION-CITE-FOUND` is **not** a run-record token. Under the hard-blocking posture a
  finding stops `ci.sh` and there is no run to fold it into. It is stdout format only,
  reusing the hygiene core's `${foundToken}(${file}): …` shape. Do not add it to any
  token list in Part 7.

**The exempt set** (this is where nothing may hardcode a `docs/…` literal):

- Resolve `paths.adr`, `paths.design`, `paths.plan` from the manifest. `paths.adr` falls
  back to the `<adr-dir>` argv when the manifest declares none.
- Take the common directory parent of the resolved paths and add its `archive/` and
  `prd/` children.
- When `adr.frozen` (Part 3) is present it **replaces** the derived dated-ledger set —
  a consumer with an unusual frozen tier states it rather than patching engine code.
  **`<adr-dir>` itself stays exempt unconditionally, in both branches.** That is what
  makes "the lint never self-flags" structural: exempting the ADR directory covers *M*
  itself and the target file, so no separate self-flagging rule exists to be forgotten,
  and an `adr.frozen` that omits the ADR dir cannot resurrect self-flagging.
- craft's own `.claude/workflow.md` declares `paths: { design: docs/contributing/design,
  adr: docs/contributing/adr, plan: docs/contributing/plan, dod: docs/contributing/DOD.md }`
  — so the derived set for this repo is
  `docs/contributing/{adr,design,plan,archive,prd}/`, with zero configuration.

**Templates.** `templates/adr.md` (25 lines) currently opens at line 1 with
`# NNN — <title>`. Prepend the line-1 fence carrying the governance declaration, so every
ADR authored from the template carries it by construction (Requirement 1):

```yaml
---
subjects:
  - <repo paths this decision governs, or [] when it governs none>
---
```

Keep line 5's `**Supersedes/Refines:** <ADR refs or none>` prose field exactly as it is —
it stays the human sentence; the machine-readable fact lives in the fence. Add the
`supersedes:` shape as a commented example beneath `subjects`, matching the file's
existing `<!-- … -->` guidance style. Nothing lints `templates/adr.md` today; do not
add a lint for it.

**`scripts/ci.sh` wiring.** One line appended to the existing `&&` chain at lines 80–86,
after the `design-lint` loop at line 82 and its `docs-structure-lint` siblings:

```bash
  && bash scripts/adr-lint.sh docs/contributing/adr
```

The literal path here is fine — `ci.sh` is craft's own repo script, not engine code, and
`shellcheck scripts/*.sh` on line 80 covers it. Do **not** touch the hygiene block at
lines 88–143 (`compute_touched`, `run_stub_lint`, `run_prose_lint`); it is a separate
workstream that must revert without conflicting on this file.

**Tests.**

- `engine/test/adr-lint-main.test.js` (new, ESM) — mirror
  `engine/test/intention-lint-main.test.js` lines 1–24: `mkdtempSync(join(tmpdir(),
  'adrlint-'))` per case, a `tmpDirs[]` array with `after(() => tmpDirs.forEach(d =>
  rmSync(d, { recursive: true, force: true })))`, a local `writeFixture(root, relPath,
  content)` that `mkdirSync`s the parent, and `makeCaptureIo()` from
  `../test-helpers/capture-io.js`. **Fixtures are written into the temp dir per case, not
  committed under `engine/test/fixtures/adr/`** — `engine/test/fixtures/` is not in the
  exempt set, so a committed fixture citing a superseded ADR would be a genuine live-tier
  hit for C3's `git grep` over the real tree and would break `test/adr-lint-ci.test.js`
  the moment Part 5 lands the backfill. The temp-dir idiom avoids that entirely. The C3 cases need a real git repo: use the
  `createTmpGitRepo`-style recipe in `test/helpers/tmp-git-repo.js` (`git init -q` then
  `git add -A`, with `-c user.email=… -c user.name=…` on every invocation, and
  `fs.realpathSync` the root — on macOS `$TMPDIR` is a symlink and every path comparison
  silently mismatches without it). That helper is CommonJS and lives in the root suite;
  re-implement the same seven lines locally in the ESM engine test rather than importing
  across suites.
- `engine/test/adr-lint.bin.test.js` (new, ESM) — mirror
  `engine/test/plan-lint.bin.test.js`: spawn `engine/bin/adr-lint.js` and assert exit 0
  on a clean fixture dir and exit 2 on a violating one.
- `test/adr-lint-ci.test.js` (new, CommonJS) — mirror `test/intention-lint-ci.test.js`
  verbatim in shape: one case reading `scripts/ci.sh` and asserting it contains
  `adr-lint`, one case shelling out to `scripts/adr-lint.sh docs/contributing/adr` over
  the **real** corpus and asserting exit 0. Use `spawnSync` (not `execFileSync`) so a
  non-zero exit yields the captured stdout in the assertion message instead of throwing.

**Legacy-green, probed at plan time, re-probe if the corpus moved:** 360 ADRs, of which
exactly 10 carry a frontmatter fence — 351 through 360, all authored with a `subjects:`
list of non-empty strings ahead of this template change, as a deliberate dogfood. Zero
carry `supersedes`. So C0 fires on those 10 and passes; C1–C3 fire on nothing. The
`test/adr-lint-ci.test.js` exit-0 case is green from the moment it is written.

```bash
for f in docs/contributing/adr/*.md; do head -1 "$f" | grep -qx -- '---' && echo "$f"; done
```

### TDD steps

RED — build `engine/test/adr-lint-main.test.js` first; every case fails with
`Cannot find module '../src/adr-lint-main.js'` until GREEN. Write the full edge matrix,
one case each:

| # | Case | Expected |
|---|---|---|
| 1 | ADR with no frontmatter fence | exit 0, no finding (legacy-green) |
| 2 | Fence present, malformed YAML | finding |
| 3 | Fence present, `subjects` a string not a list | finding |
| 4 | Fence present, `subjects` list with an empty-string element | finding |
| 5 | `supersedes` entry missing `scope` | finding |
| 6 | `supersedes` entry with whitespace-only `scope` | finding |
| 7 | `adr: 50` (unpadded) against file `050-….md` | C0 finding — the id is the padded string |
| 8 | Target ADR's `Status:` still `accepted` | C1 finding |
| 9 | Target number resolves to no file | C1 finding, no crash |
| 10 | Two files sharing the `N-` filename prefix | C1 finding, no crash |
| 11 | `Superseded from ADR-N:` present, `Carried forward from ADR-N:` absent | C2 finding |
| 12 | `Carried forward from ADR-N: nothing — <why>` | pass |
| 13 | `Carried forward from ADR-N, unchanged and …:` (ADR-348's real comma form) | pass — prefix match, not colon match |
| 14 | Anchor present but naming a different ADR | C2 finding |
| 15 | Live-tier citation of N | C3 finding, one line per hit |
| 16 | Same citation under each exempt path (`paths.adr`/`design`/`plan`/`archive`/`prd`) | pass |
| 17 | Same citation with a matching `DECISION-CITE-WAIVE(<file>)` in a `--waiver-source` | pass |
| 18 | Citation inside the superseding ADR itself, and inside the target | pass — never self-flags |
| 19 | Two ADRs superseding two targets | both swept, findings attributed per target |
| 20 | `adr.frozen` present in the manifest | it replaces the derived set; `<adr-dir>` stays exempt |
| 21 | Tree with no git | C3 records a skip on stderr, exit stays 0 |
| 22 | Zero ADRs declaring `supersedes` | no `git grep` process spawned, exit 0 |
| 23 | Zero arguments, and an `<adr-dir>` that is not a directory | usage on stderr, exit 2 |
| 24 | A clean directory of legacy ADRs | exit 0 **and** the `craft-adr: OK — …` line on stdout |

Case 22 needs an observable assertion, not a claim. Give `main` an optional third
parameter — `export function main(argv, io, deps = {})`, with `deps.runGitGrep`
defaulting to the real `execFileSync` runner — and count the calls in the test.
`engine/bin/adr-lint.js` and `scripts/adr-lint.sh` pass **two** arguments, so the argv
contract those callers see is exactly `main(argv, io)` as designed; the seam is
test-only and mirrors `hygiene-lint-core`'s own `main(argv, io, ctx)` shape and
`memory.js`'s injected `deps`. Prefer the seam over an un-assertable comment.

GREEN:

23. Write `engine/src/adr-lint-main.js`, then `engine/bin/adr-lint.js`, then
    `scripts/adr-lint.sh` (`chmod +x`, shellcheck-clean).
24. Add `engine/test/adr-lint.bin.test.js` (both cases) and let them drive the bin shim.
25. Add `test/adr-lint-ci.test.js` — the ci.sh grep case fails until step 26.
26. Append the `&& bash scripts/adr-lint.sh docs/contributing/adr` line to `scripts/ci.sh`.

REFACTOR:

27. Prepend the frontmatter fence to `templates/adr.md`.
28. Keep each check a named function taking the parsed declaration and returning a
    findings array — `main` should read as parse → C0 → (C1, C2, C3 per declaration) →
    print → exit. No nesting past two levels; extract or early-return.
29. Run `bash scripts/ci.sh` once locally before committing: this part is the one that
    changes the phase gate itself, and a broken `&&` chain is invisible to the two test
    suites.

### Gate

```bash
node --test 'test/**/*.test.js'
npm --prefix engine test
bash scripts/ci.sh
```

### Commit

`feat(adr-lint): gate ADR supersession form, target status, scope anchors and citations`

## Part 5 — The worked backfill: ADR-348 and the stale live citation

### Context

Part 4 shipped the gate green-because-inert: with the corpus untouched, C1–C3 never
execute against real data. This part is the proof the gate is live. It is a genuine
RED→GREEN cycle over the **real tree**, observed in that order inside this one part, and
committed only once green.

**The backfill target.** `docs/contributing/adr/348-arch-gate-resolves-to-the-declared-technique.md`
(63 lines) — the corpus's only supersession, and the file whose hand-written shape C1
and C2 were derived from. It currently opens at line 1 with
`# 348 — \`<arch gate>\` resolves to the declared technique's own run`, no fence. Prepend:

```yaml
---
supersedes:
  - adr: "050"
    scope: "dependency-cruiser as the gate, the exception home, and the report producer"
---
```

The `scope` string is quoted verbatim from the design; it is also the payload of the
`DECISION-REVERSAL` token Part 7 documents, so the two cannot disagree. `subjects:` is
**not** added to ADR-348 — it governs no live code path, and Requirement 5 makes absence
a silent skip. A fence carrying only `supersedes` is valid: both keys live in one fence
and neither requires the other.

**Why C1 and C2 pass immediately, probed at plan time:**

- `docs/contributing/adr/050-architecture-report-gate-and-exceptions.md` line 3 already
  reads `- **Status:** superseded by ADR-348` → C1 green with no edit.
- ADR-348 line 42 reads `Carried forward from ADR-050, unchanged and now stated
  tool-independently:` and line 51 reads `Superseded from ADR-050: every mention of
  dependency-cruiser as the gate, the exception` → both anchors present, both naming
  050, both matching the line-anchored prefix → C2 green with no edit.

**Why C3 fires exactly once.** Probed at plan time with the sweep's own shape:

```bash
git grep -n -E 'ADR-050' -- . \
  | grep -v '^docs/contributing/\(adr\|design\|plan\|archive\|prd\)/'
```

yields exactly one line:

```
examples/architecture/workflow.md:5:# exists yet, so it is safe to enable mid-adoption (ADR-049/ADR-050). All-current.
```

**The fix.** `examples/architecture/workflow.md` lines 2–5 are a comment block inside the
example manifest's YAML frontmatter:

```
# Injection point (PRD §7): phases.<id>.enabled — turn ON a default-off phase.
# The architecture phase runs dependency-cruiser over the change and triages violations;
# its triage gates the PR alongside validation. No-ops with a note if no depcruise config
# exists yet, so it is safe to enable mid-adoption (ADR-049/ADR-050). All-current.
```

That is real, live, uncaught drift: it states ADR-050's **superseded** dependency-cruiser
rule in the present tense, on a live example manifest — not a dated ledger. Restate it as
the ADR-348 rule: the `architecture` phase runs **the declared technique's own `run`
command**, and `<arch gate>` is that command exiting 0 over the phase's scope — the same
technique-agnostic shape `<validation gate>` has. The engine names no tool. Keep the
citation shape (`ADR-049/ADR-348`) rather than dropping the reference — the comment
should stay attributable.

The example's own `phases.architecture.harness.techniques[0]` block below line 6 still
declares `id: dependency-cruiser` with a `probe` and a `run` — **leave it exactly as it
is**. A repo-declared technique naming a real tool is precisely what ADR-348 carried
forward; only the prose claiming the engine mandates that tool is stale.

**Two guards on this file to respect:** `test/examples-lint.test.js` runs manifest-lint
over every `examples/*/workflow.md` and enforces a bijection between
`examples/README.md`'s linked rows and the example directories. This part changes comment
lines only — no key, no filename, no README row.

### TDD steps

RED — observe it on the real tree, and record what you saw:

1. Apply the ADR-348 frontmatter backfill.
2. Run `node --test test/adr-lint-ci.test.js`. Expected failure: the "exits 0 over the
   real ADR directory" case now fails, and the captured stdout carries **exactly one**
   `DECISION-CITE-FOUND(examples/architecture/workflow.md): ADR-050@L5` line. Confirm the
   count is one, not "at least one" — an unexpected second hit means the exempt set is
   wrong and is a blocker, not something to sweep past.
3. Run `bash scripts/ci.sh`. Expected failure: the chain stops at
   `bash scripts/adr-lint.sh docs/contributing/adr` with exit 2 and the same single
   finding. This is the phase gate observing the same red.

GREEN:

4. Rewrite `examples/architecture/workflow.md` lines 2–5 as described. Re-run step 2 —
   exit 0. Re-run step 3 — the full chain passes.

REFACTOR:

5. Re-run the exempt-set probe (`git grep -n -E 'ADR-050' …`) and confirm the only
   remaining hits are inside `docs/contributing/{adr,design,plan,archive,prd}/` — that is
   the dated-ledger convention working, not a miss.
   `docs/contributing/archive/PLAN-P10-default-phases.md:71` still stating ADR-050's rule
   in the present tense is **correct and must stay** — it is a record of what was true on
   its date. Un-stale-ing frozen-tier citations is an explicit non-goal.
6. No code changes belong in this part. If C1, C2 or C3 misbehaves against the real
   corpus, that is a Part-4 defect — fix it here rather than working around it, and say
   so in the commit body's absence by keeping the fix minimal and in `adr-lint-main.js`.

### Gate

```bash
node --test 'test/**/*.test.js'
npm --prefix engine test
bash scripts/ci.sh
```

### Commit

`fix(examples): restate the architecture gate as the ADR-348 rule and backfill ADR-348`

## Part 6 — RETRACTED: the fifth memory transition

### Context

**`engine/src/observability/memory.js`** (696 lines). The change is confined to three
functions, all of which run inside `save` **after** the `view.degraded` guard is
evaluated and before any path resolution — which is what keeps every existing invariant
intact for free.

Current shapes, line numbers approximate:

- `const KEY_FIELDS` (line 341): `{ toolchain: ['ecosystem'], 'gate-cmd': ['phase'],
  'validation-tool': ['id'], findings: ['file', 'pattern'], 'part-sizing': ['size'] }`.
  `keyOf(concern, payload)` joins the field values with `\x00`.
- `entryKey(concern, payload)` (line 415) — `concern + '\x01' + keyOf(concern, payload)`.
  **Unchanged.**
- `indexDelta(delta)` (line 426) — `for (const obs of delta) observedMap.set(entryKey(…),
  obs)`. Last-wins.
- `refreshedEntry(entry, obs, concern, provenance)` (line 443) — spreads `entry`, then
  `obs.payload` when `improves` is true, then `confidence: Math.min(entry.confidence +
  STEP, CEILING)` and `provenance`. **Unchanged.**
- `addedEntries(concern, delta, refreshedKeys, provenance)` (line 462) — filters
  `obs.concern === concern && !refreshedKeys.has(entryKey(concern, obs.payload))`, maps
  to `{ concern, ...obs.payload, confidence: FLOOR + STEP, provenance }`.
- `reconcileConcern(concern, existing, observedMap, delta, provenance)` (line 480) — per
  stored entry: `observedMap.get(k)` defined → REFRESHED and `refreshedKeys.add(k)`;
  undefined → `newConf = entry.confidence - STEP`, kept only `if (newConf > FLOOR)`.
- Constants (lines 327–336): `FLOOR = 0`, `CEILING = 5`, `STEP = 1`, `WINDOW = 50`.
  **RETRACTED reuses `FLOOR`; it must not introduce a sixth constant.**
- `save(repoRoot, view, delta, deps)` (line 670) — `reconcile` → `evictToCaps` →
  `finalView` → `if (view.degraded) return { writeNote: 'save skipped: load was
  degraded', view: finalView }` → `resolveStorePath` → `serializeStore` → single
  `deps.writeStore` in a try/catch returning a `writeNote` on failure. **Unchanged.**

Target behaviour — the delta observation gains a marker: `{ concern, payload, retract:
true }`. Two edits:

1. `reconcileConcern`'s per-entry branch order becomes: **retraction → drop** (do not
   push, do not add) → **observation → REFRESHED** → **neither → DECAYED**. A retracted
   entry is simply absent from the reconciled list; its confidence goes to `FLOOR` by
   omission, not by arithmetic.
2. `addedEntries` filters retraction-marked observations out of the ADDED path
   (`!obs.retract` in the existing `.filter`). Without it, a retraction whose key matches
   nothing stored would **add** the entry it meant to kill — that is Requirement 13, and
   it is the single most likely defect in this part.

**The both-present edge, and why it needs `indexDelta`.** A delta carrying a retraction
*and* an observation for the same key currently resolves by array order, because
`indexDelta` is last-wins. "The retraction wins" must be pinned, not incidental: give
`indexDelta` a retraction-preference rule — once a key's stored observation carries
`retract`, a later plain observation never overwrites it. Assert both delta orderings
(retraction first, retraction last) so neither is order-dependent.

**`retract` must never reach the store.** The marker lives on the observation, not the
payload, so neither `refreshedEntry`'s nor `addedEntries`' spread of `obs.payload` can
carry it. Assert that explicitly — no flushed entry carries a `retract` field.

**`engine/test/memory.test.js`** (2691 lines, ESM). The reconciler cases start at line
470 (`Given empty store and delta with one new observation, when save runs, then entry is
added with confidence FLOOR+STEP and stamped provenance`); the decay cases at 574 and
594; the degraded/write-failure cases follow. Read lines 470–620 for the fixture idiom —
each case builds a `view`, a `delta`, and a `deps` with a capturing `writeStore` — and
extend in place rather than inventing a second harness.

**`docs/contributing/specs/memory.md`** (174 lines) — two edits plus a frontmatter line:

- Line ~45, `save`'s **post** bullet: `ADDED / REFRESHED / DECAYED / EVICTED` becomes
  `ADDED / REFRESHED / DECAYED / RETRACTED / EVICTED`.
- Lines ~69–71, the transition list under **Confidence/decay model + canonical
  constants**: add `RETRACTED (a run proved the stored entry wrong — confidence → FLOOR,
  dropped this run rather than decayed by one STEP)` between DECAYED and EVICTED.
- Prepend a line-1 frontmatter fence (Requirement 14 — it governs code it does not
  declare, so it can silently rot today):
  ```yaml
  ---
  subjects:
    - engine/src/observability/memory.js
  ---
  ```
  `scripts/ci.sh`'s `run_intention_lint` (line 66) already walks this file via
  `scripts/living-corpus.sh`, so the new fence is form-checked from the moment it lands:
  `subjects` must be a list of non-empty strings.

**`docs/contributing/specs/telemetry.md`** (551 lines) — line 2 declares
`subjects: ['engine/src/observability/**']`, which over-reaches onto `memory.js`. This
change edits `memory.js`, so the page emits `INTENTION-DRIFT` unless touched. The honest
refresh is not a cosmetic edit: add a short scope note near the top stating that
`engine/src/observability/memory.js` is specified by
`docs/contributing/specs/memory.md`, which now declares it, so the shared glob's
over-reach is documented rather than accidental. Do **not** narrow the glob — the
advisory over-flag trade-off is the same one `docs/contributing/specs/intention.md`
already documents inline for `engine/src/glob.js`.

**Invariants that must still hold, and which existing tests already pin** (Requirement
12): the store is advisory-only and never a gate; `save` never throws and never blocks;
`load` returns an empty view on a malformed store; a `degraded` view declines the write
before any filesystem access with `writeNote: 'save skipped: load was degraded'`. None of
these needs a code change — they need the new tests to prove the retraction path does not
sidestep them.

**Mutation note:** `.claude/workflow.md` declares a `mutation` technique
(`npm --prefix engine run mutation`). The reconciler's branch order is the hunk most
likely to harbour survivors. If you run per-hunk scope, emit **ONE** comma-separated
`--mutate "fileA:r1,fileB:r2"` — repeated `--mutate` flags silently drop all but the
last and fake a clean score.

### TDD steps

RED — add to `engine/test/memory.test.js`; each fails because `retract` is an unknown
field today:

1. `Given a stored findings entry at confidence 4 and a delta retracting its key, when
   save runs, then the entry is absent from the returned view`. Expected failure: it is
   present at confidence 5 (the retraction is read as a plain observation and REFRESHES
   it) — the sharpest possible statement of the bug.
2. `Given a retraction whose key matches nothing stored, when save runs, then the store
   is unchanged and no entry is added`. Expected failure: an entry appears at
   `FLOOR + STEP`.
3. `Given a delta carrying a retraction and an observation for the same key with the
   retraction first, when save runs, then the entry is absent`.
4. `Given the same delta with the retraction last, when save runs, then the entry is
   absent`. Cases 3 and 4 together pin the ordering as designed rather than incidental.
5. `Given a degraded view and a delta of retractions, when save runs, then writeNote is
   'save skipped: load was degraded' and deps.writeStore is never called`.
6. `Given a writeStore that throws and a delta of retractions, when save runs, then it
   returns a writeNote and does not throw`.
7. `Given a retracted key, when the flushed store is inspected, then no entry carries a
   retract field`.
8. A property lens over the transition table: for every stored confidence in
   `FLOOR..CEILING` crossed with `{observed, not-observed, retracted}`, the resulting
   confidence is within `FLOOR..CEILING` and the retracted axis always yields absence.
   Drive it from `FLOOR`, `CEILING`, `STEP` imported from the module — never from
   hardcoded `0`/`5`/`1`.

GREEN:

9. Add the retraction branch at the head of `reconcileConcern`'s per-entry loop.
10. Add `!obs.retract` to `addedEntries`' filter.
11. Add the retraction-preference rule to `indexDelta`.

REFACTOR:

12. Update the JSDoc `@param` for `delta` on `reconcileConcern`, `addedEntries`,
    `indexDelta`, `reconcile` **and** the exported `save` to the
    `{ concern, payload, retract?: boolean }` shape — `save`'s is the one a binding
    author reads, so leaving it stale is the expensive omission. Update the
    transition-list comment above `reconcileConcern` to name RETRACTED.
13. Refresh `docs/contributing/specs/memory.md` (two edits plus the `subjects:` fence) and
    `docs/contributing/specs/telemetry.md` (the scope note).

### Gate

```bash
node --test 'test/**/*.test.js'
npm --prefix engine test
```

### Commit

`feat(memory): evict a disproven entry through a RETRACTED transition`

## Part 7 — The three new tokens and their emitting surfaces

### Context

The vocabulary grows from 11 tokens to 14, deliberately rather than silently. This part
is prose plus one new test file — no `src/` delta, so it is standalone by the sizing
exception, and it depends on Parts 5 and 6 having landed the mechanisms it names.

**The three tokens, exact shapes — these strings are the deliverable:**

```
DECISION-REVERSAL(ADR-NNN): <what changed> -> ADR-MMM
DECISION-CITE-WAIVE(<file>): <reason>
MEMORY-RETRACT(<concern>): <merge-key>
```

- `DECISION-REVERSAL` — `NNN` is the superseded target, `MMM` the superseding ADR,
  `<what changed>` is the `scope` string from the strict declaration **verbatim**, so the
  token and the ADR cannot disagree. Emitted by the **`decisions`** phase, one line per
  `supersedes` entry authored that run. The scope string folds to one line before it is
  appended (the ledger's one-record-one-line rule). The token is greppable, never parsed
  — nothing splits on the ` -> `, so a `->` inside a scope string is a cosmetic wart, not
  an ambiguity. **A refinement emits nothing** — only a reversal is a reversal. A
  supersession authored outside a craft run emits no token at all; that is why the lint
  and the token are separate mechanisms, and neither substitutes for the other. The live
  example line, matching Part 5's backfill:

  ```
  decision-drift-propagation decisions DECISION-REVERSAL(ADR-050): dependency-cruiser as the gate, the exception home, and the report producer -> ADR-348
  ```

- `DECISION-CITE-WAIVE` — the C3 waiver, collected by `adr-lint` from `--waiver-source`
  files. Its waiver sources are the design doc and the PR body, exactly as for
  `STUB-WAIVE` and `INTENTION-WAIVE`. It belongs to the `ci.sh` hygiene cadence family in
  the run skill's list, not to a phase procedure.
- `MEMORY-RETRACT` — emitted by the retracting phase, derived at `integrate` step 3 into
  `{ concern, payload, retract: true }`. For the `findings` concern the merge key is
  `file` + `pattern` (`KEY_FIELDS.findings` in `engine/src/observability/memory.js`), and
  `file` is stored repo-RELATIVE. **Pin the on-ledger rendering explicitly in the spec**,
  because the derivation has to be unambiguous: the payload is split on the first run of
  whitespace, the first field is `file`, the remainder is `pattern`. `keyOf` joins key
  fields with `\x00`, which cannot travel on a ledger line, so *some* rendering has to be
  chosen and stated. State its bound honestly in the same paragraph: the split is
  well-defined because a repo-relative path carries no whitespace in this repo — a
  consumer whose paths do would need a different rendering, and the spec should say so
  rather than imply totality. Say all of this in
  `docs/contributing/specs/run-record.md` rather than leaving the reader to infer it. The
  token inherits the ledger's path/secret scrub unmodified.

`DECISION-CITE-FOUND(<file>):` is **not** a run-record token and must not appear in any
list here — under the hard-blocking posture a finding stops `ci.sh` and there is no run
to fold it into.

**Files to edit:**

- **`skills/run/SKILL.md` §1c-int**, lines 96–102. The block currently names the base
  family (`NO-OP(<phase>):`, `GATE(<phase>):`, `auto-skip:`, `WAIVER:`, `POLICY(...)`),
  then `INTENTION-DRIFT(<page>)` / `INTENTION-WAIVE(<page>)`, then the four `ci.sh`
  hygiene tokens (`STUB-FOUND`, `STUB-WAIVE`, `SLOP-FOUND`, `SLOP-WAIVE`). Add the three
  new tokens with their parameter shapes verbatim. Part 2 already edited the corpus
  sentence in the same block — leave that alone.
- **`docs/contributing/specs/run-record.md`** (146 lines). It has **no token-vocabulary
  section today** — line 32 says "The token vocabulary is unchanged; this file only
  narrows where those tokens land", and lines 39–42 name a handful in passing. Add a
  `## Token vocabulary` section listing the three new tokens with the same shapes and
  the same wording as the run skill, plus the `MEMORY-RETRACT` merge-key rendering rule.
  Revise line 32's "the token vocabulary is unchanged" claim — it becomes false. Prepend
  the `subjects:` fence (Requirement 14, one line):
  ```yaml
  ---
  subjects:
    - skills/run/SKILL.md
  ---
  ```
  That page is the ledger's single writer, so the guard is honest: a run-skill edit that
  leaves the spec untouched now surfaces as `INTENTION-DRIFT`.
- **`skills/decisions/SKILL.md`** (52 lines). Three edits:
  - Preamble item 2 (line 13): ADR writes route through the intention port's `record`;
    add that the write now carries the governance declaration from `templates/adr.md`,
    and that the `decisions` phase is the **only** ADR backfill writer — it writes the
    block into a pre-existing ADR it authors or supersedes, never as a read-phase side
    effect.
  - Step 1 (line 21): the adopt-or-escalate rule already turns on "aligns with an
    existing ADR". Make it reference the governing slice now arriving on slot 1, so the
    rule is an indexed read instead of an unindexed wish over 360 files.
  - Step 5 (line 44): add the supersession authoring obligations, all five, as the
    conditions that make `adr-lint` satisfiable in the same commit — write the
    `supersedes: [{ adr, scope }]` entry with a zero-padded 3-digit `adr`; flip the
    target's `Status:` to `superseded by ADR-M`; prepend the target's blockquote note;
    write **both** body anchors (`Superseded from ADR-N …` and `Carried forward from
    ADR-N …`, with "nothing survives" stated explicitly, never by omission); sweep the
    live-tier citations. Then emit one `DECISION-REVERSAL` line per `supersedes` entry.
  - Explicitly **unchanged**: the adopt-or-escalate triage, the ADR-number probe (highest
    existing + 1), the cross-candidate interaction check, the `NO-OP(decisions)`
    first-class no-op, and the scope-fold rule. The phase gains inputs and two authoring
    obligations, not a new procedure.
- **`skills/review/SKILL.md`** preamble item 3 (lines 18–26), the `findings` concern's
  read/write surface. It currently states READS and WRITES. Add **RETRACTS**: the run
  retracts a `findings` entry when it re-checked that entry's own `file` + `pattern` at
  that location and the pattern is absent — a **mechanical** re-check, never a judgment
  call, and only for the concern this phase owns. Emit `MEMORY-RETRACT(findings): <file>
  <pattern>`, with `file` repo-RELATIVE under the same rule the WRITES clause already
  states.
- **`skills/integrate/SKILL.md`** step 3 (lines 28–33), the delta derivation. It reads
  this run's run-id lines from the ledger into the in-session `delta`. Add that a
  `MEMORY-RETRACT(<concern>): <merge-key>` line derives to
  `{ concern, payload, retract: true }` rather than to a plain observation, and name the
  whitespace split for the `findings` merge key. The single-writer rule (R4) is untouched
  — the phase emits, the orchestrator appends.
- **`test/decision-tokens.test.js`** (new, CommonJS). Mirror `test/intention-token.test.js`
  (its `grepCount(pattern, file)` helper using `execFileSync('grep', ['-c', '-F', …])`
  with `err.status === 1` → 0 is the idiom to copy). It must carry:
  1. **The anti-drift assertion the design names**: one `const NEW_TOKENS = ['DECISION-REVERSAL(',
     'DECISION-CITE-WAIVE(', 'MEMORY-RETRACT(']` driving **one** assertion that both
     `skills/run/SKILL.md` and `docs/contributing/specs/run-record.md` name every entry
     — compute the present-subset from each file and `deepStrictEqual` both against
     `NEW_TOKENS`. One list, one assertion, so the two documents cannot drift apart.
  2. `DECISION-REVERSAL(` pinned in `skills/decisions/SKILL.md`.
  3. `MEMORY-RETRACT(` pinned in `skills/review/SKILL.md` and in
     `skills/integrate/SKILL.md`.
  4. The bare literal `DECISION-CITE-WAIVE` (no open paren) pinned in
     `engine/src/adr-lint-main.js`, so the documented token and the one the lint actually
     compiles are the same string. **The paren must be omitted from this one probe**: the
     source spells the token inside a regex as `DECISION-CITE-WAIVE\(([^)]+)\)`, so a
     `grep -F 'DECISION-CITE-WAIVE('` finds nothing and the test would pass or fail for
     the wrong reason.

**Explicitly NOT edited — do not add these:**

- `skills/documentation/SKILL.md` and `skills/propose/SKILL.md`. Both already carry the
  run record into the PR body wholesale (`documentation` step 5 line 54, `propose` line
  44). The new tokens ride that existing surface exactly as `INTENTION-DRIFT` and
  `SLOP-FOUND` do. **No new PR-body surface** is part of the design.
- `skills/validation/SKILL.md`. There is deliberately no `ADR-DRIFT(<adr>)` token —
  making ADRs freshness-guarded is an explicit non-goal.
- Any second injection surface. The governing ADRs ride the existing slot-1 prepend.

**Regression risk:** `test/run-record.test.js` slices `skills/run/SKILL.md` and
`skills/integrate/SKILL.md` between `^## ` headings and asserts pinned sentences
(including the verbatim `Writes are buffered all run and flushed once here, so a phase
that blocked mid-run leaves the store unchanged`). It also asserts against
`docs/contributing/specs/run-record.md`'s absent-file, present-file and inherited-edges
sections. Add sections and sentences; never rename a `## ` heading, and never reflow a
pinned sentence.

### TDD steps

RED — write `test/decision-tokens.test.js` first; every case fails on a missing literal:

1. `Given the run skill and the run-record spec, when both are scanned for the three new
   tokens, then each document names all three` — the single deep-equal assertion above.
   Expected failure: both extracted subsets are empty.
2. `Given skills/decisions/SKILL.md, when scanned, then it pins DECISION-REVERSAL(`.
3. `Given skills/review/SKILL.md, when scanned, then it pins MEMORY-RETRACT(`.
4. `Given skills/integrate/SKILL.md, when scanned, then it pins MEMORY-RETRACT(`.
5. `Given engine/src/adr-lint-main.js, when scanned, then it pins DECISION-CITE-WAIVE(` —
   this one passes immediately if Part 4 named the waiver pattern correctly; if it fails,
   Part 4 used a different literal and that is the defect to fix, not this test.

GREEN:

6. Add the three tokens to `skills/run/SKILL.md` §1c-int.
7. Add the `## Token vocabulary` section and the `subjects:` fence to
   `docs/contributing/specs/run-record.md`, and revise its line-32 "unchanged" claim.
8. Apply the three `skills/decisions/SKILL.md` edits.
9. Apply the `skills/review/SKILL.md` RETRACTS clause.
10. Apply the `skills/integrate/SKILL.md` derivation clause.

REFACTOR:

11. Read the three token shapes back across all five documents and confirm they are
    character-identical — the parameter names (`<file>`, `<concern>`, `<merge-key>`,
    `ADR-NNN`) included. The whole point of the token family is that one grep finds every
    occurrence.
12. Confirm `bash scripts/ci.sh` is green end to end — `run_intention_lint` now
    form-checks the new `subjects:` fence on `docs/contributing/specs/run-record.md`, and
    `run_prose_lint` skips `docs/contributing/specs/` but **not** `skills/`, so a
    ban-list word introduced into a skill file is a finding.

### Gate

```bash
node --test 'test/**/*.test.js'
npm --prefix engine test
bash scripts/ci.sh
```

### Commit

`feat(run-record): add the DECISION-REVERSAL, DECISION-CITE-WAIVE and MEMORY-RETRACT tokens`
