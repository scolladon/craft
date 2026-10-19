# Plan — lessons-corpus

> Source: design doc `docs/contributing/design/lessons-corpus.md` · ADRs `655, 656, 657, 658, 659`
> (655: harvest is its own default-on `lessons` phase; 656: PR review and merge ratify;
> 657: `lessons.max_injected` defaults to 3, per phase; 658: lessons numbered in their own
> sequence; 659: index line plus a How to apply capped at 6 non-empty lines)
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

## Plan shape (11 parts)

| # | Part | Size class | Files | Depends on |
|---|---|---|---|---|
| 1 | Vocabulary and manifest keys | engine src + sample | 6 | — |
| 2 | Lesson parser | pure module | 2 | 1 |
| 3 | lesson-lint bin and CI wiring | engine bin + script | 6 | 2 |
| 4 | Lessons lane in consult, sliceLessons, assertFresh rows | engine src | 2 | 2 |
| 5 | lessons skill and PR trailer | prose + pins | 5 | 3, 4 |
| 6 | Pi role-less lessons step | adapter src | 3 | — |
| 7 | Phase spine (ATOMIC: one commit) | descriptor + goldens + README | 6 | 5, 6 |
| 8 | Run-skill, validation and spec prose | prose + pins | 5 | 4, 7 |
| 9 | Template, seed lesson, proof | docs + evidence test | 6 | 3, 4 |
| 10 | Guides and plugin description | docs + pins | 6 | 7 |
| 11 | README loop section | README + pin | 2 | 7, 9, 10 |

README.md is edited by Parts 7, 9 and 11 on purpose: each edit must land in the same
commit as the change the README guard counts (the phase list, the lessons count, the
loop section that needs the guide), so merging them would bundle unrelated units.

Parts run strictly in the numbered order on one working tree; each builds on the previous
ones. **Part 7 is atomic**: its six files land in one commit, because each turns red
without the others (the design's pinned fallout list). Every part's gate is
`bash scripts/ci.sh`; a part may iterate with targeted `node --test <files>` but closes
only on a green `ci.sh`. Never commit on a red gate.

Standing rules restated for every part (the part blocks below do not repeat them):

- No provenance references (ADR, phase, part, backlog, decision-candidate numbers, or
  single-letter review ids such as `R1`/`T5`) in source, source comments, test comments
  or test titles. `test/source-hygiene.test.js` scans shipped code whole-line and test
  comments/titles for `ADR-?\d+`, `P\d+`, `Part \d+`, `backlog #\d+`, `DC-\d+`, and in
  shipped code also case-sensitive `[RTF]\d+`.
- Tests are London School, Given/When/Then titles, Arrange-Act-Assert bodies, the value
  under test bound to a `sut` variable, one behaviour per test.
- Test titles are **printable ASCII only**: no em dash, no `≥` (write `>=`), no arrows, no
  NEL or U+2028. Files under engine/test enter Stryker's tap run, which fails on such
  titles. Assertion strings and fixtures may hold non-ASCII.
- Home-rooted fixture paths use a placeholder home only (`alice`, `user`, `example`,
  `me`, `someone`, `x`): `test/source-hygiene.test.js` flags `/Users/<name>` and
  `/home/<name>` anywhere in the tracked tree for any other name.
- Engine source that must recognise a home path builds the pattern so the literal text
  `/Users/<segment>` never appears in the file (write `\/(?:Users|home)\/` in a regex).
- No suppression directives, no swallowed errors, no TODO/FIXME markers (stub-lint).
- Touched `*.md` outside the dated doc trees is prose-linted: avoid the ban-list words
  delve, leverage, seamless, robust, "it's important to note", "in conclusion".
- Commits: `/usr/bin/git add <explicit paths>` then `/usr/bin/git commit -m "<message>"`;
  never `commit -a`, never touch other agents' files.

## Public-surface decision

Every new exported symbol is **internal** to this repo. craft has no published JS API,
no barrel, no generated API report and no bin registry (engine/package.json has no
`bin` field; skills call bins by path).

| Symbol | Created in | Decision | Surface gates pre-paid in-part |
|---|---|---|---|
| `LESSON_KINDS`, `LESSON_STATUSES`, `LESSON_SECTIONS`, `MAX_HOW_TO_APPLY_LINES`, `parseLesson`, `evidencePath` (engine/src/lesson.js) | Part 2 | internal | none |
| `main` (engine/src/lesson-lint-main.js) and engine/bin/lesson-lint.js | Part 3 | internal CLI | static-lints statement + its position test (Part 3) |
| `sliceLessons` (engine/src/intention.js), `consult().lessons`, `assertFresh().lessons` | Part 4 | internal | the intention spec section (Part 8) |
| `lessons` (adapters/pi/src/roleless.js) | Part 6 | internal | `rolelessSteps` entry (Part 6) |
| manifest key `lessons`, `paths.lessons`, phase id `lessons` | Parts 1, 7 | public (manifest vocabulary) | examples sample + examples index (Part 1); customizing guide Ports row and examples-index row (Part 10); README diagram, timeline and adapter row (Part 7) |
| skill `craft:lessons` | Part 5 | public (procedure) | no adapter mirror: `sync-adapter-agents.sh` mirrors agents only, and no new agent is added; opencode commands list standalone commands only |

## Decision candidates

Choices the design leaves open. The parts are written to the recommendation; the
orchestrator may put any of these to the user before Part 2 starts.

1. **Where `last-verified >= source.date` is checked.**
   (a) in `parseLesson`, as a per-file form error, so `consult` also skips such a lesson
   — **recommended**: it is a single-file check and the design states `parseLesson`
   collects every form error; (b) in `lesson-lint` only, as the design's lint list
   places it; consult would then inject a lesson whose dates are inverted.
2. **Sha-shaped evidence entries.** The design says "a commit sha is not accepted", but a
   bare sha also matches the repo-path grammar. (a) reject any entry matching
   `^[0-9a-f]{7,40}$` with its own error — **recommended**, it enforces the stated rule;
   (b) accept it and let `lesson-lint` report it as `stale-evidence` only.
3. **Sample shape for the manifest keys.** (a) one `examples/lessons-corpus/workflow.md`
   whose body carries the prose, plus a row in the examples index README — **recommended**:
   this is every other sample's shape, and `test/examples-lint.test.js` requires the
   index row; (b) the design's extra `examples/lessons-corpus/README.md` as well, which
   no other sample has and no test reads.

## Corrections to the design (applied in this plan)

- The H1-number-matches-filename check moves from `parseLesson` (T6) to `lesson-lint`
  (T7): `parseLesson(content)` has no filename. The parser exposes `lesson.number`.
- Proposed P2 (parser + lint, 6 files, more than 5 cycles) splits into Part 2 (parser)
  and Part 3 (lint + CLI); the proposed P4 CI wiring folds into Part 3.
- The examples sample is one `workflow.md`; the second file is the examples index
  (`examples/README.md`), which the examples-lint test requires.
- `test/static-lints-ci.test.js`: "twelve" counts `ALL_INVOCATIONS` (10 `LINT_IDS` plus 2
  loop followers). After the change: 11 `LINT_IDS`, thirteen invocations.
- README timeline: the phase names pad to column 17, so the line is `lessons` plus nine
  spaces, not eight.
- `test/craft-root-shim.test.js` pins per-file shim counts (skills/run/SKILL.md 13,
  skills/validation/SKILL.md 4). Part 8 adds no `${CRAFT_ROOT:-…}` invocation to those
  files (it names `scripts/governing-corpus.sh` plainly, as 1c-int already does), so the
  counts stay.
- The run skill's walk step 5 role-less list (`workspace`/`decisions`/`propose`/`integrate`)
  also gains `lessons`; the design did not list that line.
- `scenarios.test.js` `S_REORDER_IDS` is at L959, not L958.

## Part 1 — Vocabulary and manifest keys

### Context

**Goal.** `lessons` becomes a phase id and a top-level manifest key; `paths.lessons` and
`lessons.max_injected` are validated; this repo declares its lessons directory; a
lint-clean sample proves the keys.

**Files (created/edited).**

- `engine/src/manifest-vocabulary.js` — `TOP_KEYS` (L7-11) gains `'lessons'`;
  `PHASE_NAMES` (L17-21) gains `'lessons'` between `'documentation'` and `'propose'`.
- `engine/src/manifest.js` —
  - `validatePaths(paths, fileExists, errors, readFile)` (L99): add one call
    `checkLessonsDir(paths.lessons, errors);` right after the `checkFileRef('paths.dod', …)`
    line, before the `readFile` early return.
  - new `checkLessonsDir(value, errors)`: return when `value === undefined`; push
    `paths.lessons must be a repo-relative directory path` when the value is not a
    non-empty string, starts with a slash or `~`, or has a `..` segment
    (`value.split('/').includes('..')`). Existence is never checked.
  - new `validateLessons(lessons, errors)`, modelled on `validateHygiene` (L335): non-object
    or array pushes `lessons must be an object { max_injected }` and returns; every key
    other than `max_injected` pushes `unknown lessons field: <k>`; a present
    `max_injected` that is not `Number.isInteger(v) && v >= 0` pushes
    `lessons.max_injected must be a non-negative integer`. Use a named constant for the
    field name, no magic strings duplicated.
  - `validateManifest` switch (L575-621): add `case 'lessons': validateLessons(value, errors); break;`
  - Defaults (docs/lessons/ and 3) are applied by the reader (run skill), never here.
- `engine/test/manifest.test.js` (4164 lines, ESM, `validateManifest` imported at L8,
  `ALWAYS_EXISTS` at L10). Append a `// lessons` block after the hygiene block (ends
  near L2510). Assertion shape to copy: L2459-2500 (`result.ok`, `result.errors.some(e => e.includes(…))`).
- `examples/lessons-corpus/workflow.md` (new) — a sample manifest declaring
  `paths: { lessons: docs/lessons }` and `lessons: { max_injected: 3 }`, frontmatter
  comment lines in the style of the hygiene-gate sample, then a prose body: what a
  lesson is, the two knobs, `pipeline.skip: [lessons]` turns the harvest off,
  `max_injected: 0` turns injection off. No link to the lessons guide yet (it lands in
  Part 10).
- `examples/README.md` — add a row to the "By injection point" table after the
  hygiene-gate row: `| — | **lessons** corpus (paths.lessons, lessons.max_injected) | [lessons-corpus/](lessons-corpus/) | 0 |`
  using the table's own backtick style around the link text. The test requires the
  literal `](lessons-corpus/)`.
- `.claude/workflow.md` — under `paths:` (L2-6) add `  lessons: docs/contributing/lessons`
  after the `plan:` line. Top-level docs/lessons is forbidden here by
  `docs-structure-lint --audience docs`.

**Read-only references.** engine/src/tune-plan.js (consumes `PHASE_NAMES`, no change);
engine/test/init-emit.test.js keeps its own TOP_KEYS copy (no change needed: it checks
emitted keys are members). The skip/required conflict message is built in
`validateSkipRequiredCollision` (manifest.js L527):
`phases.lessons.required: true conflicts with pipeline.skip: [lessons] — a phase cannot be both skipped and required`.
test/examples-lint.test.js runs scripts/manifest-lint.sh over every
examples/*/workflow.md and requires each dir linked from the examples index.

**RED command.**

~~~
cd engine && node --test test/manifest.test.js
node --test test/examples-lint.test.js
~~~

### TDD steps

Tests appended to the manifest suite (titles exact, ASCII):

1. **RED (vocabulary)** —
   - `Given phases.lessons with a turn_budget, when validateManifest runs, then ok:true`
     — fails: `unknown phase: lessons`.
   - `Given pipeline.skip [lessons] and phases.lessons.required true, when validateManifest runs, then the only error is the skip and required conflict`
     (`assert.deepEqual(result.errors, [<conflict message>])`) — fails: errors also hold
     `unknown phase: lessons`.
   - GUARD `Given pipeline.skip [lessons] alone, when validateManifest runs, then ok:true`
     — passes today: skip ids are not checked against the vocabulary.
2. **GREEN** — add `'lessons'` to `PHASE_NAMES`.
3. **RED (lessons key)** —
   - `Given lessons { max_injected: 3 }, when validateManifest runs, then ok:true` and
     the same with `0` — fail: `unknown top-level key: lessons`.
   - `Given lessons.max_injected <v>, when validateManifest runs, then the error says it must be a non-negative integer`
     for `-1`, `1.5`, `'3'` (one test each, value in the title as `-1`, `1.5`, `a string`)
     — fail: the only error is the unknown top-level key.
   - `Given lessons { bogus: 1 }, when validateManifest runs, then the error names an unknown lessons field`.
   - `Given lessons as an array, when validateManifest runs, then the error says lessons must be an object`.
   - Author examples/lessons-corpus/workflow.md and the examples index row: the
     examples-lint loop now fails with `unknown top-level key: lessons`.
4. **GREEN** — `TOP_KEYS` gains `'lessons'`; add `validateLessons` and the switch case.
5. **RED (paths.lessons)** —
   - `Given paths.lessons <shape>, when validateManifest runs, then the error says it must be a repo-relative directory path`
     for an absolute path, a `~` path, a `..` segment, an empty string and a number (one
     test each) — fail: `paths.lessons` is inert today, so `ok` is true.
   - GUARD `Given paths.lessons as a relative directory, when validateManifest runs, then ok:true`
     — passes today (inert key).
6. **GREEN** — `checkLessonsDir` and its call in `validatePaths`.
7. Edit `.claude/workflow.md` (`paths.lessons`); GUARD: `bash scripts/manifest-lint.sh .claude/workflow.md` prints valid.
8. **REFACTOR** — keep each new function under 20 lines, early returns, named
   constants for the field and messages.

### Gate

~~~
cd engine && node --test test/manifest.test.js
node --test test/examples-lint.test.js
bash scripts/ci.sh
~~~

### Commit

`feat(manifest): admit the lessons phase id, lessons key and paths.lessons`

## Part 2 — Lesson parser

### Context

**Goal.** A pure parser shared by `consult` (Part 4) and `lesson-lint` (Part 3). It
never throws; it collects every form error.

**Files (created).**

- `engine/src/lesson.js` (new, ESM, pure, no I/O). Exports:

  ~~~
  export const LESSON_KINDS        // frozen Set: trap, technique, gotcha, anti-pattern
  export const LESSON_STATUSES     // frozen Set: active, superseded, retired
  export const LESSON_SECTIONS     // frozen ['Context', 'Lesson', 'How to apply', 'Evidence']
  export const MAX_HOW_TO_APPLY_LINES  // 6
  export function parseLesson(content)
    // -> { lesson } | { reason: 'malformed-lesson', errors: string[] }
  export function evidencePath(entry)  // 'a/b.js:3-9' -> 'a/b.js'
  ~~~

  `lesson` shape: `{ subjects: string[], phases: string[], kind, trigger,
  evidence: string[], source: { run, phase, date }, status, supersedes: number[],
  lastVerified: 'YYYY-MM-DD', number: number, title: string,
  sections: Record<string, string> }`. `sections['How to apply']` is the section text
  with leading and trailing blank lines trimmed (what consult injects verbatim).

  Rules, one error string each (exact text is the implementer's, but each must name the
  offending key so tests can match on it):
  - frontmatter via `extractFrontmatter` (engine/src/frontmatter.js) → null gives
    `missing frontmatter`; js-yaml `load` throwing gives `malformed YAML frontmatter: <msg>`
    (catch, record, return — never rethrow); a non-mapping gives `frontmatter must be a mapping`.
  - `subjects`: non-empty list of non-empty strings (reuse `isNonEmptyString` from
    engine/src/cli-io.js).
  - `phases`: non-empty list; each entry in `PHASE_NAMES` (engine/src/manifest-vocabulary.js,
    which holds `lessons` since Part 1), else `unknown phase: <id>`.
  - `kind` in `LESSON_KINDS`; `status` in `LESSON_STATUSES`.
  - `trigger`: non-empty string with no newline.
  - `evidence`: non-empty list; each entry matches `^([^\s:]+)(?::\d+(?:-\d+)?)?$`, the
    path part does not start with a slash or `~`, has no `..` segment, holds no `$`, and is
    not sha-shaped (`^[0-9a-f]{7,40}$`) — else `evidence entry is not a repo path: <entry>`.
  - `source`: a mapping; `run` kebab (`^[a-z0-9]+(-[a-z0-9]+)*$`), `phase` in `PHASE_NAMES`,
    `date` a date.
  - dates (`source.date`, `last-verified`): a js-yaml `Date` becomes
    `toISOString().slice(0, 10)`; a string must match `^\d{4}-\d{2}-\d{2}$`.
    `last-verified` earlier than `source.date` (string compare) is an error.
  - `supersedes`: optional, default `[]`; a list of integers >= 1.
  - body (after the closing fence): the first non-empty line must match
    `^# (\d{3,}) — (.+)$` (em dash) → `number` and `title`; the `## ` headings must
    equal `LESSON_SECTIONS` exactly and in order; the How-to-apply section's non-empty
    line count must be <= `MAX_HOW_TO_APPLY_LINES`
    (`How to apply holds <n> non-empty lines (max 6)`).
  - The H1 number versus the filename is NOT checked here (no filename); Part 3 does it.
- `engine/test/lesson.test.js` (new, ESM, `node:test` + `node:assert/strict`). Fixture
  helper `lessonText({ frontmatter = {}, body } = {})`: a BASE map of raw YAML lines
  (key → value text), overrides merged in, a value of `undefined` drops the key; BASE is
  a valid lesson with `subjects: ['engine/src/**']`, `phases: [validation]`,
  `kind: trap`, `trigger: running a scoped mutation`, `evidence: ['README.md']`,
  `source: { run: some-run, phase: design, date: 2026-10-19 }`, `status: active`,
  `last-verified: 2026-10-19`; default body `# 001 — A title` then the four sections
  with one line each.

**Read-only references.** engine/src/intention-subjects.js (`parseSubjects`, the shared
primitive pattern and its never-throw-on-absence contract); engine/src/intention.js
`classifySubjects` (how consult turns a throw into a skip).

**RED command.**

~~~
cd engine && node --test test/lesson.test.js
~~~

### TDD steps

1. **RED (shape)** — the module is absent, so every test fails on import.
   - `Given a valid lesson, when parseLesson runs, then it returns the lesson with every field`
   - `Given content with no frontmatter, when parseLesson runs, then it reports missing frontmatter`
   - `Given mis-typed YAML frontmatter, when parseLesson runs, then it reports malformed YAML and does not throw`
   - `Given a lesson missing <key>, when parseLesson runs, then the error names <key>`
     (one test per key: subjects, phases, kind, trigger, evidence, source, status,
     last-verified; loop over a table, title built per key)
   - `Given two defects, when parseLesson runs, then both errors are collected`
2. **GREEN** — frontmatter read, required keys, error collection.
3. **RED (values)** —
   - `Given kind outside the enum, ...then the error names kind`; same for `status`.
   - `Given phases naming an unknown id, ...then the error names that id`
   - GUARD `Given phases [lessons], when parseLesson runs, then it is accepted` — passes
     already: `PHASE_NAMES` holds `lessons` since Part 1 and step 2 adds no phase check;
     it keeps the phase check written next from rejecting the new id.
   - `Given a multi-line trigger, ...then the error names trigger`
   - `Given supersedes [0], ...then the error names supersedes`; `Given supersedes [1], ...then it is accepted`
4. **GREEN** — enum, phase, trigger, supersedes checks.
5. **RED (evidence)** —
   - `Given evidence <shape>, when parseLesson runs, then the entry is rejected as not a repo path`
     for an absolute path, `~/x`, `a/../b`, `$HOME/x`, a 40-hex sha (one test each).
   - `Given evidence with a line or a line range suffix, when parseLesson runs, then it is accepted`
   - `Given an empty evidence list, ...then the error names evidence`
   - `Given an entry with a line range, when evidencePath runs, then it returns the path part`
     (`a/b.js:3-9`, `a/b.js:3`, `a/b.js` all give `a/b.js`)
6. **GREEN** — evidence grammar and `evidencePath`.
7. **RED (dates)** —
   - `Given an unquoted last-verified date, when parseLesson runs, then lastVerified is the YYYY-MM-DD string`
   - `Given a quoted last-verified string, ...then it is kept as is`
   - `Given an unquoted source date, ...then source.date is the YYYY-MM-DD string`
   - `Given last-verified earlier than source.date, ...then the error names last-verified`
8. **GREEN** — date normalisation and order check.
9. **RED (body)** —
   - `Given a body with no numbered H1, ...then the error names the H1`
   - `Given sections out of order, ...then the error names the sections`; same for a missing section.
   - `Given How to apply with 7 non-empty lines, ...then the error names How to apply`
   - `Given How to apply with 6 non-empty lines and blank lines between them, ...then it is accepted`
   - `Given a valid lesson, when parseLesson runs, then sections How to apply is the trimmed section text`
10. **GREEN** — body split, H1, section order, line cap.
11. **REFACTOR** — one small function per rule, each under 20 lines; named constants for
    every pattern and message.

### Gate

~~~
cd engine && node --test test/lesson.test.js
bash scripts/ci.sh
~~~

### Commit

`feat(engine): parse lesson files into a validated lesson record`

## Part 3 — lesson-lint bin and CI wiring

### Context

**Goal.** A whole-corpus form lint over one lessons directory, run in CI as its own
static-lints statement. Form errors exit 2; unresolved evidence only reports.

**Files (created/edited).**

- `engine/src/lesson-lint-main.js` (new). Mirrors engine/src/intention-lint-main.js
  (`failInvalid`, OK line). Signature:
  `export function main(argv, io, deps = {})` with
  `const { readFile, listDir, pathExists, cwd } = { ...DEFAULT_DEPS, ...deps }` where
  DEFAULT_DEPS is `{ readFile: p => readFileSync(p, 'utf8'), listDir: readdirSync, pathExists: existsSync, cwd: () => process.cwd() }`.
  - `argv.length !== 1` → stderr `usage: lesson-lint <lessons-dir>`, exit 2.
  - `dir = resolve(cwd(), argv[0])`; not a directory (`isDirectoryPath` from
    engine/src/cli-io.js) → stdout `craft-lessons: no lessons directory at <argv[0]>`, exit 0.
  - every *.md entry, sorted, fenced or not; the label for messages is
    `join(argv[0], name)`.
  - per file: filename `^(\d{3,})-([a-z0-9]+(?:-[a-z0-9]+)*)\.md$` else
    `filename must be NNN-<slug>.md`; `parseLesson` errors (Part 2); H1 `number` equals
    the filename number else `H1 number <h> does not match filename number <f>`;
    hygiene — the file text matches `\$HOME|\$\{HOME\}|~\/|\/(?:Users|home)\/[^\s/]+`
    → `home-rooted path or $HOME reference`.
  - cross-file, over parsed lessons: duplicate number → `duplicate lesson number <n>`;
    each `supersedes` target exists and has `status: superseded`; each `superseded`
    lesson is named by some `supersedes` list.
  - evidence: `repoRoot = findRepoRoot(cwd())`; for each parsed lesson and entry,
    `pathExists(join(repoRoot, evidencePath(entry)))` false → stdout
    `craft-lessons: stale-evidence <label>: <entry>`. Never affects the exit code.
  - errors → `failInvalid`: stderr `craft-lessons: INVALID corpus:` then `- <label>: <error>`
    lines, exit 2. Otherwise stdout `craft-lessons: OK — <n> lesson(s) valid.`, exit 0.
- `engine/bin/lesson-lint.js` (new) — copy of engine/bin/intention-lint.js with the import
  switched to the new main.
- `engine/test/lesson-lint-main.test.js` (new) — pattern: engine/test/intention-lint-main.test.js
  (tmp dirs collected and removed in `after`, `makeCaptureIo` from
  engine/test-helpers/capture-io.js). Each fixture root holds a .git directory so
  `findRepoRoot` stops there; pass `{ cwd: () => root }`. Build lesson text with a local
  `lessonText` helper (same shape as Part 2's).
- `engine/test/lesson-lint.bin.test.js` (new) — pattern: engine/test/intention-lint.bin.test.js
  (`spawnSync(process.execPath, [BIN, dir])`, set `cwd` to the fixture root).
- `scripts/static-lints.sh` — add ONE line, its own statement, right after
  `bash scripts/docs-structure-lint.sh --audience docs` and before the
  `sync-adapter-agents` line: `node engine/bin/lesson-lint.js docs/contributing/lessons`.
  Never join it with `&&` (errexit ignores all but the last command of a list).
- `test/static-lints-ci.test.js` — `LINT_IDS` (L26): insert
  `'lesson-lint docs/contributing/lessons'` between `'docs-structure-lint --audience docs'`
  and `'sync-adapter-agents --check'`; `NODE_STUB_NAMES` (L45) gains `'lesson-lint'`;
  the L109 title "all twelve invocations" becomes "all thirteen invocations". The
  per-position loop then fails each lint in turn, the new one included.

**Trap.** The lessons directory does not exist until Part 9: the lint must exit 0 on a
missing directory, so CI stays green from this part on.

**RED command.**

~~~
cd engine && node --test test/lesson-lint-main.test.js test/lesson-lint.bin.test.js
node --test test/static-lints-ci.test.js
~~~

### TDD steps

1. **RED (arguments)** — module absent.
   - `Given no argument, when lesson-lint runs, then it exits 2 with a usage line`
   - `Given a missing directory, when lesson-lint runs, then it exits 0 and says there is no lessons directory`
   - `Given an empty directory, when lesson-lint runs, then it exits 0 with OK and zero lessons`
2. **GREEN** — argument and directory handling, OK line.
3. **RED (per-file)** —
   - `Given one valid lesson whose evidence resolves, when lesson-lint runs, then it exits 0 with OK and one lesson`
   - `Given a lesson with an invalid kind, when lesson-lint runs, then it exits 2 with an INVALID block naming the file`
   - `Given a How to apply of 7 non-empty lines, when lesson-lint runs, then it exits 2`
   - `Given an unfenced markdown file, when lesson-lint runs, then it exits 2 with missing frontmatter`
   - `Given a README in the lessons directory, when lesson-lint runs, then it exits 2 on the filename rule`
   - `Given an H1 number that differs from the filename number, when lesson-lint runs, then it exits 2`
   - `Given a lesson body holding a home-rooted path, when lesson-lint runs, then it exits 2`
     (fixture text `/Users/alice/x`) and one each for `$HOME` and `~/`.
4. **GREEN** — per-file checks and `failInvalid`.
5. **RED (cross-file)** —
   - `Given two lessons sharing a number, when lesson-lint runs, then it exits 2 on the duplicate`
   - `Given supersedes naming no lesson, when lesson-lint runs, then it exits 2`
   - `Given supersedes naming an active lesson, when lesson-lint runs, then it exits 2`
   - `Given a superseded lesson no lesson supersedes, when lesson-lint runs, then it exits 2`
   - `Given a superseded lesson and its successor, when lesson-lint runs, then it exits 0`
6. **GREEN** — cross-file checks.
7. **RED (stale evidence)** —
   - `Given an evidence path that does not resolve, when lesson-lint runs, then it reports stale-evidence and still exits 0`
   - `Given an evidence entry with a line range, when lesson-lint runs, then it resolves by the path part`
8. **GREEN** — evidence resolution against `findRepoRoot`.
9. **RED (bin and CI)** —
   - bin: `Given a valid corpus, when the lesson-lint bin is spawned, then it exits 0`;
     `Given an invalid corpus, when the lesson-lint bin is spawned, then it exits 2`.
   - static-lints: edit `LINT_IDS`, `NODE_STUB_NAMES` and the title; the
     thirteen-invocation test and the new position test fail (the script never calls
     the lint, so the position test exits 0 instead of 3).
10. **GREEN** — the bin file and the static-lints line.
11. **REFACTOR** — small functions, early returns, named constants for every message.

### Gate

~~~
cd engine && node --test test/lesson-lint-main.test.js test/lesson-lint.bin.test.js
node --test test/static-lints-ci.test.js
bash scripts/static-lints.sh
bash scripts/ci.sh
~~~

### Commit

`feat(engine): lint the lessons corpus in CI with lesson-lint`

## Part 4 — Lessons lane in consult, sliceLessons, assertFresh rows

### Context

**Goal.** `consult` reads an injected `listLessons` lane; `sliceLessons` picks a phase's
budgeted slice; `assertFresh` lists active lessons whose subjects or evidence changed,
in a separate `lessons[]` key.

**Files (edited).**

- `engine/src/intention.js` (232 lines). Current signatures:
  `consult(scope, deps)` L34 → `{ entries, skipped }`;
  `assertFresh(change, deps)` L58 → `{ schemaVersion: 1, stale, uncovered, skipped, note? }`;
  helpers `classifySubjects` L92, `readSubjectPages(list, readPage)` L119,
  `mergeLanes` L142, `matchingPaths` L154, `buildStaleRow(page, subjects, changed, touched, waived)` L170,
  `sortBy(items, key)` L230. Import `parseLesson`, `evidencePath` from the Part 2 module.
  - `consult`: `const lessonLane = readSubjectPages(deps.listLessons?.() ?? [], deps.readPage)`;
    its `skipped` joins the merged skip list. For each subject page: `parseLesson(content)`;
    `reason` → push `{ page, reason: 'malformed-lesson' }` to skipped (regardless of
    scope); status other than `active` → drop silently (no skip); active and
    `matchingPaths(scope, lesson.subjects).length > 0` → a `LessonRow`
    `{ path, title, trigger, howToApply, phases, lastVerified }` — exactly these keys,
    `howToApply` = `lesson.sections['How to apply']`. Return
    `{ entries, skipped, lessons: sortBy(rows, 'path') }`; `lessons` is always present.
  - new `export function sliceLessons(lessons, { phase, max })`: rows whose `phases`
    include `phase`, sorted by `lastVerified` descending then `path` ascending, first
    `max`; never mutates the input.
  - `assertFresh`: `lessons: []` always; with `deps.listLessons`, active parsed lessons
    each go through `buildStaleRow(page, [...lesson.subjects, ...lesson.evidence.map(evidencePath)], changed, touched, waived)`;
    rows sorted by `page` go to `report.lessons`, never to `stale`. Lesson skips never
    join `report.skipped`. `note` is unchanged (living lane only). `schemaVersion` stays 1.
  - Update the typedefs at L13-20 (`LessonRow`, `IntentionView.lessons`,
    `FreshnessReport.lessons`) and the `deps` JSDoc of both verbs.
- `engine/test/intention.test.js` (733 lines). Helpers `page()` L9, `corpusOf()` L21,
  `governingOf()` L28. Add `lessonPage({ subjects, phases, status, lastVerified, title, trigger, howToApply })`
  producing a lesson that `parseLesson` accepts (four sections, numbered H1, evidence
  `['README.md']`, `source.date` not after `lastVerified`), and
  `lessonsOf(livingPages, lessonPages)` → `{ listCorpus, listLessons, readPage }`.
  Update the one whole-object assertion at L67 to
  `{ entries: [], skipped: [], lessons: [] }` in step 2's GREEN, together with the
  code that adds the key (it would turn red otherwise).

**RED command.**

~~~
cd engine && node --test test/intention.test.js
~~~

### TDD steps

1. **RED (consult lane)** —
   - `Given an active lesson whose subjects intersect the scope, when consult runs, then lessons holds its row`
   - `Given a lesson row, when consult runs, then the row has exactly path, title, trigger, howToApply, phases and lastVerified`
   - `Given a superseded lesson and a retired lesson, when consult runs, then neither is in lessons nor in skipped`
   - `Given a lesson with no subjects, when consult runs, then it is skipped as no-subjects`
   - `Given a malformed lesson, when consult runs, then it is skipped as malformed-lesson`
   - `Given no listLessons, when consult runs, then lessons is an empty array`
   - `Given an unreadable lesson, when consult runs, then it is omitted from lessons and skipped`
   - `Given two matching lessons inserted out of order, when consult runs, then lessons are sorted by path`
   - `Given a lesson whose subjects miss the scope, when consult runs, then lessons is empty`
   All fail: `result.lessons` is undefined.
2. **GREEN** — the lane in `consult`; update the L67 whole-object assertion.
3. **RED (slice)** — `sliceLessons` is not exported.
   - `Given rows for several phases, when sliceLessons runs, then only rows naming the phase are kept`
   - `Given more matching rows than max, when sliceLessons runs, then it keeps max rows`
   - `Given rows with different lastVerified, when sliceLessons runs, then the most recent come first`
   - `Given rows tied on lastVerified, when sliceLessons runs, then the smaller path comes first`
   - `Given max 0, when sliceLessons runs, then it returns an empty array`
   - `Given an input array, when sliceLessons runs, then the input is not mutated`
4. **GREEN** — `sliceLessons`.
5. **RED (freshness)** —
   - `Given an active lesson whose subject changed and the lesson untouched, when assertFresh runs, then lessons holds its stale row`
   - `Given a changed evidence path, when assertFresh runs, then the lesson is listed`
   - `Given the lesson file itself touched, when assertFresh runs, then it is not listed`
   - `Given a retired lesson whose subject changed, when assertFresh runs, then it is not listed`
   - `Given a listed lesson, when assertFresh runs, then stale holds no lesson row and schemaVersion is 1`
   - `Given no listLessons, when assertFresh runs, then lessons is an empty array`
   - `Given a lesson named in waived, when assertFresh runs, then its row carries waived true`
6. **GREEN** — `assertFresh` lessons rows.
7. **REFACTOR** — extract `collectLessonRows` and `lessonStaleRows`; every function under
   20 lines, nesting <= 2. GUARD: the existing 50+ tests, engine/test/intention-self-governance.test.js
   and the property test at L707 stay green.

### Gate

~~~
cd engine && node --test test/intention.test.js test/intention-self-governance.test.js
bash scripts/ci.sh
~~~

### Commit

`feat(intention): add a lessons lane to consult and assert-fresh`

## Part 5 — lessons skill and PR trailer

### Context

**Goal.** The `craft:lessons` procedure exists (the descriptor that runs it lands in
Part 7), and the PR body template carries a Lessons line.

**Files (created/edited).**

- `skills/lessons/SKILL.md` (new). Frontmatter `name: lessons` and
  `description: Craft lessons phase - harvest evidence-backed lessons from the run ledger, lint them, and commit them on the PR branch.`
  (the "Craft <name> phase - " form, like the requirements skill, so propose (10) and
  integrate (11) keep their numbers). Then `# craft:lessons`, `## Preamble (always runs — non-overridable)`,
  `## Procedure (default body; a manifest override: replaces everything below)`. Body
  text: see step 2.
- `templates/pr-body.md` — in the Provenance list (L35-40) add after the Run record line:
  `- **Lessons:** <LESSONS line, NO-OP(lessons) line, or none>`.
- `test/lessons-harvest-prose.test.js` (new, CommonJS `'use strict'`, like the other
  root tests). Use `sliceProse` and `TO_END` from test/helpers/region-slice.js
  (`sliceProse(content, startRegExp, endRegExp | TO_END)` collapses whitespace).
- `test/plugin-structure.test.js` — add two tests next to the requirements and
  architecture pair (L94-135): existence and `# craft:lessons` heading, using the file's
  `grepQ` helper.
- `test/no-op-token.test.js` — add `NO-OP(lessons): spelling pinned in lessons skill`
  after the architecture pins (L15-40 pattern).

**Read-only references.** skills/propose/SKILL.md and skills/requirements/SKILL.md (house
shape); design §Phase "Skill" for the procedure; test/craft-root-shim.test.js only pins
the files it lists, so the new skill's one shimmed `lesson-lint` call needs no count.

**RED command.**

~~~
node --test test/lessons-harvest-prose.test.js test/plugin-structure.test.js test/no-op-token.test.js
~~~

### TDD steps

1. **RED** — the skill and the trailer line are absent. Tests in the new file:
   - `Given the lessons skill, when its frontmatter is read, then it is named lessons with a Craft lessons phase description`
   - `Given the lessons skill Preamble, when read, then it waits until awaitingHarnesses is empty`
   - `Given the lessons skill Preamble, when read, then a standalone run records NO-OP(lessons): no run ledger`
   - `Given the lessons skill Procedure, when read, then its steps run harvest, draft, dedupe, re-verify, lint, record in that order`
     (indexes of `**Harvest.**`, `**Draft, only with proof.**`, `**Dedupe (merge before insert).**`,
     `**Re-verify.**`, `**Lint and commit.**`, `**Record.**` strictly ascending)
   - `Given the lessons skill draft step, when read, then a draft needs an existing evidence path and the ledger is never evidence`
   - `Given the lessons skill draft step, when read, then How to apply holds at most 6 non-empty lines`
   - `Given the lessons skill, when read, then it emits LESSONS: with the five outcomes`
   - `Given the lessons skill, when read, then it runs lesson-lint through the CRAFT_ROOT shim`
   - `Given the PR body template, when its Provenance list is read, then it carries a Lessons line`
   plus the plugin-structure pair and the NO-OP pin.
2. **GREEN** — write the skill. Preamble:
   1. Manifest read (run `manifest-lint.sh` if standalone). Resolve `<lessons-dir>` =
      `paths.lessons`, else `docs/lessons/`.
   2. **Cross-phase wait:** start only once the in-session `awaitingHarnesses` set is
      empty — every awaited executing-harness has landed, its triage is done (the
      documentation late-EXCEPTION synthesis included) and its gate is green, or it was
      released by `auto-skip`, `NO-OP` or a waiver. Not yet → wait. This phase is never
      itself awaited.
   3. **Standalone:** no run ledger for this branch → record `NO-OP(lessons): no run ledger` and stop.

   Procedure: steps 1-6 from the design §Phase "Skill" verbatim in substance — the
   harvest event table (reset-on-red, multi-round FINDINGS, triaged harness defect,
   decision deviation, environmental gate failure, `LESSON-REVERIFY(<lesson>): <path>`),
   the `assert-fresh` lessons-lane fallback when validation did not run its step 5,
   draft only with a repo path that exists at HEAD (the ledger lives in the git common
   dir and is never evidence), next number = highest existing + 1, one-line `trigger`,
   How to apply at most 6 non-empty lines; dedupe through `consult` with
   `listCorpus: () => []` and `listLessons`; re-verify bumps `last-verified`, supersedes
   or retires, never deletes; lint with
   `node "${CRAFT_ROOT:-${CLAUDE_PLUGIN_ROOT}}/engine/bin/lesson-lint.js" <lessons-dir>`,
   fix or drop a red draft, never commit a red lesson, commit
   `docs(lessons): record <n> lesson(s)` bumping a README counted link to the lessons
   directory in the same commit; record
   `LESSONS: <path> (new|refreshed|reverified|superseded|retired)[, …]` or
   `NO-OP(lessons): <reason>` and copy that line into the PR body's Lessons line.
   State that ratification is the PR review and merge, and that the phase never gates
   `propose` beyond its own lint of the drafts.
   Then add the template line.
3. **REFACTOR** — none beyond wording; re-run the three suites.

### Gate

~~~
node --test test/lessons-harvest-prose.test.js test/plugin-structure.test.js test/no-op-token.test.js test/craft-root-shim.test.js
bash scripts/ci.sh
~~~

### Commit

`feat(skills): add the lessons harvest procedure and PR trailer line`

## Part 6 — Pi role-less lessons step

### Context

**Goal.** Pi's walk calls `deps.rolelessSteps[phase.id](…)` unguarded (adapters/pi/src/run.js:211);
the new role-less phase needs a step, and the literal phase counts in the Pi engine
tests must follow the pipeline file so they survive Part 7.

**Files (edited).**

- `adapters/pi/src/roleless.js` — add
  `export async function lessons() { return recorded(true, 'lessons: no-op (headless) — no session ledger to harvest'); }`
  after `integrate`, and `rolelessSteps` (L35) becomes
  `{ workspace, decisions, lessons, propose, integrate }`.
- `adapters/pi/test/roleless.test.js` — import `lessons` and `rolelessSteps`; pattern is
  the `decisions()` no-op test (L28-36).
- `adapters/pi/test/engine.test.js` — the literals `10` (L114-138, the skip-refactoring
  test) and `11` (L163-167, the no-manifest test). Derive them: read
  pipeline/default.yml under `REPO_ROOT` (L10), `parsePipeline` from
  engine/src/descriptor.js and `enabledPhaseIds` from engine/src/phase-truth.js
  (import as `../../../engine/src/…`, the same reach adapters/pi/test/manifest.test.js
  already uses). `const ENABLED_IDS = enabledPhaseIds(parsePipeline(readFileSync(…, 'utf8')))`;
  the skip case expects `ENABLED_IDS.filter(id => id !== 'refactoring').length`.
  Retitle both tests without a number:
  `…then effective has every enabled phase except refactoring`,
  `…then effective still has every enabled phase`.

**Read-only references.** adapters/pi/test/run.test.js uses its own canned 11-phase
fixture and the real `rolelessSteps` at L638 against `ROLELESS_IDS` — unaffected.

**RED command.**

~~~
cd adapters/pi && node --test test/roleless.test.js test/engine.test.js
~~~

### TDD steps

1. **RED** —
   - `Given the lessons step, when it runs, then it returns a recorded no-op and invokes no spawn`
     — fails: `lessons` is not exported.
   - `Given the role-less step table, when lessons is looked up, then it is a function`
     — fails: `rolelessSteps.lessons` is undefined.
2. **GREEN** — the `lessons` step and the table entry.
3. **GUARD** — rewrite the two engine.test.js counts as derived values; they pass today
   (10 and 11 equal the derived counts) and stay green after Part 7 adds the phase.
4. **REFACTOR** — none.

### Gate

~~~
cd adapters/pi && node --test test/roleless.test.js test/engine.test.js test/run.test.js
bash scripts/ci.sh
~~~

### Commit

`feat(pi): record a headless no-op for the lessons phase`

## Part 7 — Phase spine (ATOMIC: one commit)

### Context

**Goal.** The default pipeline gains the `lessons` descriptor between `documentation` and
`propose`. All six files land in ONE commit: the goldens, the run-state bin and the
README phase guards turn red without the descriptor, and the descriptor turns them red
without their edits.

**Files (edited).**

- `pipeline/default.yml` — insert after the documentation block (L141-152), before
  `- id: propose` (L154):

  ~~~
  - id: lessons
    archetype: delivery
    contract:
      - delivery
    procedure: craft:lessons
    consumes:
      - change
    produces:
      - lessons
  ~~~

  No `role`, no `model`, no `gate`, no `enabled` key.
- `engine/test/descriptor.test.js` — `EXPECTED_DESCRIPTORS` (L207) gains, between the
  documentation and propose entries:
  `{ id: 'lessons', archetype: 'delivery', enabled: true, contract: ['delivery'], procedure: 'craft:lessons', role: undefined, consumes: ['change'], self_supply: [], produces: ['lessons'], turn_budget: null }`;
  the L204 comment and the L371 test become 14 descriptors.
- `engine/test/resolve.test.js` — `SC1_IDS` (L24) and `SC1_ROLES` (L39, `lessons: undefined`)
  gain `lessons` after `documentation`; the "11 enabled" titles (L23, L55, L84, L92,
  L97 message) become 12; the A1 `expected` table (L1428) gains `lessons: true`. New tests:
  - `Given no manifest, when resolvePipeline runs, then lessons has no role, an empty gate and autoSkipEligible true`
  - GUARD `Given no manifest, when resolvePipeline runs, then propose awaits only validation`
    (passes today and after: the descriptor is never a harness)
  - `Given pipeline.skip [lessons], when resolvePipeline runs, then it is ok with the manifest skip record and no waiver`
    (record `skip: lessons (manifest pipeline.skip)`, built in engine/src/edits.js:65).
- `engine/test/scenarios.test.js` — `SC1_IDS` (L69), `S_REORDER_IDS` (L959),
  `SC3_EFFECTIVE_IDS` (L990) gain `lessons` after `documentation`; the gate pins (L217,
  L238 blocks) gain `assert.equal(gateOf('lessons'), '');`.
- `engine/test/run-state.bin.test.js` — L31-40: the in-flight-documentation case now
  expects `next` = `lessons`; retitle "next propose" to "next lessons".
- `README.md` — mermaid `ship` subgraph (L27):
  `DO[documentation] --> LE[lessons] --> PR[propose] --> IN{{"integrate 🧑"}}`;
  timeline (L119-120) gains between documentation and propose:
  `lessons         → evidence-backed lessons harvested from the run, linted, committed`
  (`lessons` + 9 spaces, so the arrow sits in column 17 like its neighbours);
  adapters table pi row (L246) `full 11-phase walk` → `full 12-phase walk`.

**Read-only references.** engine/src/readme-regions.js reads the FIRST mermaid and FIRST
text block; engine/src/readme-drift-main.js `phaseNameFindings` diffs them against the
enabled ids; test/readme-drift.test.js and engine/test/readme-drift-main.test.js run on
the live tree (no edit needed once the README matches). Probed green with the
descriptor: static-lints, pipeline-lint, contracts-lint, sync-adapter-agents, every other
adapter suite; adapters/pi/test/engine.test.js is green from Part 6.

**RED command.**

~~~
cd engine && node --test test/descriptor.test.js test/resolve.test.js test/scenarios.test.js test/run-state.bin.test.js
~~~

### TDD steps

1. **RED** — apply every test edit above. Failures: 13 descriptors instead of 14,
   `lessons` missing from the effective ids, `gateOf('lessons')` undefined, the skip
   record absent, `next` is `propose`.
2. **GREEN** — add the descriptor. Now test/readme-drift.test.js and
   engine/test/readme-drift-main.test.js fail with `phase-names:mermaid` and
   `phase-names:timeline` missing lessons.
3. **GREEN** — the three README edits.
4. **GUARD** — `node engine/bin/pipeline-resolve.js pipeline/default.yml` prints
   `ok: true` and the order ends `… validation documentation lessons propose integrate`;
   `cd adapters/pi && node --test test/engine.test.js` stays green.
5. Commit all six files together, only after `bash scripts/ci.sh` is green.

### Gate

~~~
cd engine && node --test test/descriptor.test.js test/resolve.test.js test/scenarios.test.js test/run-state.bin.test.js test/readme-drift-main.test.js
node --test test/readme-drift.test.js
bash scripts/ci.sh
~~~

### Commit

`feat(pipeline): add the default-on lessons phase before propose`

## Part 8 — Run-skill, validation and spec prose

### Context

**Goal.** The orchestrator injects lessons at every phase entry, walks the new phase,
and the registries and the intention spec describe it.

**Files (edited/created).**

- `skills/run/SKILL.md` (715 lines):
  - 1c-int (L94-107): append one sentence after "`consult` is called **once per run, not per phase**.":
    the lessons lane is the exception — walk step 4's Lessons hint consults it at every
    phase entry, re-read from disk, so it holds no in-session state.
  - Run-record tokens table (L205-210): two rows —
    `LESSONS: <path> (<outcome>)[, …]`, `NO-OP(lessons): <reason>` → the `lessons` phase
    (`craft:lessons` step 6, or its standalone preamble);
    `LESSON-REVERIFY(<lesson>): <changed-path>` → the validation phase's `assert-fresh`
    lessons rows (step 5), resolved by the `lessons` phase.
  - Walk step 1 table (L221-228): a `lessons` row after `documentation` — evaluated only
    after the cross-phase wait; provably empty when the ledger holds no lesson-shaped
    event (`craft:lessons` step 1 table) and no `LESSON-REVERIFY(` line and, when
    `validation` did not run its step 5, the `assert-fresh` lessons lane over
    `<base>...HEAD` is empty. The documentation row stays as is.
  - Walk step 4 (after the Intention hint, L307-311): the **Lessons hint (advisory)**
    paragraph and its format block, text in step 2 below.
  - Walk step 5: role-less list (L338) `workspace`/`decisions`/`lessons`/`propose`/`integrate`;
    session-owned bullets (L340-355) gain, after the documentation bullet:
    `delivery` (`lessons`): harvest per `craft:lessons`; starts only once
    `awaitingHarnesses` is empty; never gates `propose` beyond its own draft lint.
  - Cross-phase invariants (L425-426, after "`documentation` (archetype: `delivery`) may
    parallel a background executing-harness; `propose` may not."): `lessons` may not
    parallel a background executing-harness — it waits for the same awaited set — and
    is never itself awaited.
  - Agent spawns slot 1 (L471-477): one clause — the lessons hint is prepended into the
    same block when the phase's lessons slice is non-empty.
  - Resume table (L589-598): a `lessons` row — a `LESSONS:` or `NO-OP(lessons):` line
    means done; otherwise re-run the harvest from step 1 (step 3 dedupes drafts already
    committed).
  - Do NOT add a `${CRAFT_ROOT:-${CLAUDE_PLUGIN_ROOT}}/` invocation: test/craft-root-shim.test.js
    pins this file at 13. Name the enumerator as plain scripts/governing-corpus.sh, as
    1c-int does.
- `skills/validation/SKILL.md` — step 5 (L98-110): append — pass `listLessons` (the
  lessons directory through scripts/governing-corpus.sh when it exists) to
  `assert-fresh`; for each `report.lessons[]` row with `waived === false`, emit one
  `LESSON-REVERIFY(<lesson>): <changed-path>` ledger line per `changedPaths` entry; these
  lines never join the drift set and never reach `intention.gate`; a row waived by
  `INTENTION-WAIVE(<lesson>)` emits nothing. Shim count stays 4.
- `docs/contributing/specs/intention.md` — frontmatter `subjects` gains
  `  - engine/src/lesson*.js` ; a new `## Lessons lane` section before
  `## Custom recipes` (L193): the optional `listLessons` dep, `LessonRow` with
  `trigger`, silent status exclusion and the `malformed-lesson` skip, `sliceLessons`
  (phase filter, `lastVerified` desc, path tie-break, `max`, `0` = off, default 3 per
  phase), the disclosure layers (frontmatter never injected; index line plus How to
  apply verbatim, at most 6 non-empty lines), `assertFresh().lessons[]` (a `StaleRow`,
  subjects plus evidence paths, never in `stale[]`, never gated, `schemaVersion` 1), the
  per-phase consult, and the file-only lane (a `custom` source does not serve lessons).
- `docs/contributing/specs/run-record.md` — the greppable-only list under
  `## Token vocabulary` (after L94) gains three bullets: `LESSONS: <path> (<outcome>)[, …]`,
  `NO-OP(lessons): <reason>` (the lessons phase's instance of `NO-OP(<phase>):`),
  `LESSON-REVERIFY(<lesson>): <changed-path>`; no regex row; `run-state` consumes none
  beyond the generic `NO-OP(<phase>):` fold.
- `test/lessons-prose.test.js` (new, CommonJS) — `sliceProse` from
  test/helpers/region-slice.js; pin pattern: test/fold-followups.test.js.

**Read-only references.** test/run-record.test.js, test/intention-token.test.js,
test/no-op-token.test.js, test/hygiene-gates-ci.test.js and test/craft-root-shim.test.js
read these files; none pins a line edited here, all must stay green.

**RED command.**

~~~
node --test test/lessons-prose.test.js
~~~

### TDD steps

1. **RED** — new tests (each RED one fails: the text is absent):
   - `Given walk step 4, when read, then a Lessons hint prepends into the SAME slot-1 prepend at every phase`
   - `Given the Lessons hint, when read, then it consults with listLessons and slices with sliceLessons`
   - `Given the Lessons hint format block, when read, then it holds the index line followed by the How to apply line`
   - `Given the Lessons hint, when read, then the frontmatter is never injected`
   - `Given 1c-int and the Agent spawns slot 1, when read, then both name the lessons hint`
   - `Given walk step 1, when read, then a lessons row names lesson-shaped events and LESSON-REVERIFY`
   - GUARD `Given walk step 1, when the documentation row is read, then it does not mention lessons`
     (passes today; keeps the edit off that row)
   - `Given walk step 5, when read, then a delivery lessons bullet waits for awaitingHarnesses`
   - `Given the cross-phase invariants, when read, then lessons is never awaited`
   - `Given the resume table, when read, then it has a lessons row`
   - `Given validation step 5, when read, then it emits LESSON-REVERIFY and says it never gates`
   - `Given both token registries, when read, then each lists LESSONS, NO-OP(lessons) and LESSON-REVERIFY`
   - GUARD `Given the run-record regex table, when read, then no row names a lessons token`
     (passes today; keeps the tokens greppable-only)
   - `Given the intention spec, when read, then it has a Lessons lane section`
2. **GREEN** — the edits above. The Lessons hint paragraph:

   > **Lessons hint (advisory).** At **every** phase entry, enumerate the lessons lane
   > (`<lessons-dir>` = `paths.lessons`, else `docs/lessons/`): if the directory exists,
   > run `scripts/governing-corpus.sh <lessons-dir>`; otherwise the lane is empty. Run
   > `consult(<phase touched set>, { listCorpus: () => [], listLessons, readPage })` and
   > slice with `sliceLessons(view.lessons, { phase: phase.id, max: lessons.max_injected ?? 3 })`.
   > If the slice is non-empty, prepend it into the SAME slot-1 prepend, after the memory
   > and intention hints. The frontmatter is never injected. One index line, then the How
   > to apply section verbatim, per lesson:
   >
   > ~~~
   > Lessons (advisory — open the path for context and evidence):
   > - <title> — when <trigger> → <path>
   >   <How to apply, verbatim, at most 6 lines>
   > ~~~
   >
   > The phase touched set is `git diff --name-only <base>...HEAD`, united with the repo
   > paths the phase's input artifact names: the brief for `design`, the design doc for
   > `planning`, the plan parts' `### Context` paths for `implementation`. An empty slice
   > adds nothing. The hint never gates.

   (In the skill file the format block is a ``` fence, as the file's other blocks are.)
3. **REFACTOR** — none. GUARD: the readers listed above stay green.

### Gate

~~~
node --test test/lessons-prose.test.js test/run-record.test.js test/intention-token.test.js test/no-op-token.test.js test/craft-root-shim.test.js test/hygiene-gates-ci.test.js test/fold-followups.test.js
bash scripts/ci.sh
~~~

### Commit

`docs(skills): inject lessons at phase entry and re-verify them in validation`

## Part 9 — Template, seed lesson, proof

### Context

**Goal.** The lesson template, this repo's first lesson (the repeated `--mutate` trap),
the characterisation test it cites, and the proof that a later validation phase on the
same subjects receives it.

**Files (created/edited).**

- `templates/lesson.md` (new):

  ~~~
  ---
  subjects:
    - <glob the lesson applies to>
  phases: [<phase id>]
  kind: <trap | technique | gotcha | anti-pattern>
  trigger: <one line - the situation in which the lesson applies>
  evidence:
    - <repo-path>[:<line>[-<line>]]
  source: { run: <run-id>, phase: <phase id>, date: <YYYY-MM-DD> }
  status: active
  supersedes: []
  last-verified: <YYYY-MM-DD>
  ---
  # NNN — <title>

  ## Context

  <what happened, in which run, and why it was costly>

  ## Lesson

  <what is true, and the worked example>

  ## How to apply

  <the rule, at most 6 non-empty lines; this section is injected verbatim>

  ## Evidence

  <the repo paths that reproduce it, and any failing output>
  ~~~

  (js-yaml loads this frontmatter; probed.)
- `docs/contributing/lessons/001-stryker-repeated-mutate-flag-keeps-last.md` (new) —
  frontmatter: subjects engine/src/**/*.js and adapters/*/src/**/*.js; `phases: [validation]`;
  `kind: trap`; trigger `composing a per-hunk Stryker run over more than one file or line range`;
  evidence test/mutation-scope.test.js and .claude/workflow.md (this part edits the first, reads the second);
  `source: { run: lessons-corpus, phase: design, date: 2026-10-19 }`; `status: active`;
  `supersedes: []`; `last-verified: 2026-10-19`. H1
  `# 001 — Stryker keeps only the last repeated --mutate flag`. Sections: Context (a
  per-hunk run passes one flag per range and runs green); Lesson (the CLI's `--mutate`
  is a single comma-separated list option, so a repeated flag overwrites the previous
  value: two flags mutate only `b.js:3-4`, and the dropped ranges are never
  instrumented); How to apply, exactly these 4 lines:

  ~~~
  - Pass ONE comma-joined flag: `--mutate "a.js:1-2,b.js:3-4"`.
  - Never repeat `--mutate`: the CLI keeps only the last value.
  - Before trusting a green run, check the instrumented mutant count
    is at least the number of hunks you scoped.
  ~~~

  Evidence (the characterisation test drives the installed CLI with an injected
  runner: two flags give `["b.js:3-4"]`, one comma-joined flag gives both ranges; the
  workflow manifest states the one-flag contract). No home path, no `$HOME`, no `~/`.
- `test/mutation-scope.test.js` (CommonJS, 2 tests today) — two characterisation tests.
  Helper:

  ~~~
  const { pathToFileURL } = require('node:url');
  const STRYKER_CLI = path.join(ROOT, 'engine', 'node_modules', '@stryker-mutator',
    'core', 'dist', 'src', 'stryker-cli.js');
  async function parsedMutate(flags) {
    const { StrykerCli } = await import(pathToFileURL(STRYKER_CLI).href);
    let captured;
    const cli = new StrykerCli(['node', 'stryker', 'run', ...flags], undefined,
      async (options) => { captured = options; });
    cli.run();
    return captured.mutate;
  }
  ~~~

  Probed against the installed Stryker 10.0.0: `run()` calls the injected runner
  synchronously; nothing mutates. The package `exports` map blocks a bare subpath
  import, so the file URL is required.
- `engine/test/lessons-self-governance.test.js` (new, ESM) — pattern:
  engine/test/intention-self-governance.test.js (reads the real file relative to
  `import.meta.url`). `LESSON` = the repo-relative lesson path; `readPage` returns its
  content.
- `README.md` — the "craft builds craft" receipts (L199-201): after
  `[659 ADRs](docs/contributing/adr/),` add `[1 lesson](docs/contributing/lessons/),`.
  (The parted-plans count is already bumped by the plan commit.)
- `docs/contributing/README.md` — table row after the plan/ row:
  `| [lessons/](lessons/) | evidence-backed lessons harvested by the lessons phase |`
  (backticked link text like its neighbours); the `paths.*` sentence (L18-20) names
  `paths.lessons` too.

**Traps.** Lesson file and README counted link MUST land in the same commit (readme-drift
corpus count). `lesson-lint` now lints a real directory in CI (static-lints, Part 3).

**RED command.**

~~~
node --test test/mutation-scope.test.js
cd engine && node --test test/lessons-self-governance.test.js
~~~

### TDD steps

1. **GUARD (characterisation; green on first run, the lesson's evidence)** —
   - `Given two --mutate flags, when the Stryker CLI parses them, then only the last range survives`
   - `Given one comma-joined --mutate flag, when the Stryker CLI parses it, then both ranges survive`
2. **RED** — engine/test/lessons-self-governance.test.js (fails: files absent):
   - `Given the lesson template, when its body is read, then it carries the four sections in order`
   - `Given the lesson template, when its frontmatter is loaded, then it carries every required key`
   - `Given the seed lesson and a change to engine source, when consult and sliceLessons run for validation, then the slice holds its row with trigger and How to apply`
     (`consult(['engine/src/intention.js'], { listCorpus: () => [], listLessons: () => [LESSON], readPage })`,
     then `sliceLessons(view.lessons, { phase: 'validation', max: 3 })`)
   - `Given the seed lesson, when its How to apply is counted, then it holds at most 6 non-empty lines`
   - `Given the seed lesson, when sliced for the design phase, then the slice is empty`
   - `Given a scope outside the lesson subjects, when consult runs, then lessons is empty`
3. **GREEN** — write the template and the lesson; bump the README link and the
   contributing README in the same working change.
4. **GUARD** — `node engine/bin/lesson-lint.js docs/contributing/lessons` prints
   `OK — 1 lesson(s) valid.` with no stale-evidence line; `bash scripts/readme-drift.sh`
   exits 0.

### Gate

~~~
node --test test/mutation-scope.test.js test/readme-drift.test.js
cd engine && node --test test/lessons-self-governance.test.js
bash scripts/ci.sh
~~~

### Commit

`docs(lessons): seed the repeated --mutate flag lesson and its template`

## Part 10 — Guides and plugin description

### Context

**Goal.** User-facing docs name the phase and the knobs.

**Files (created/edited).**

- `docs/guides/lessons.md` (new) — what a lesson is (advisory, evidence-bound, never
  gating), the file format and the 6-line How to apply rule, where it lives
  (`paths.lessons`, default docs/lessons, numbered in its own sequence, cited by path),
  how the lessons phase harvests it (evidence-carrying ledger events, dedupe, lint),
  how a run injects it (index line plus How to apply, per phase, after memory and
  intention hints), ratification by PR review and merge, `pipeline.skip: [lessons]`
  turns the harvest off, `lessons.max_injected` (default 3, `0` turns injection off),
  and a link to the sample examples/lessons-corpus. No product names.
- `docs/guides/customizing.md` — the sequence block (L23-26) gains `lessons` between
  `documentation` and `propose`; the archetype sentence (L29-33) *delivery* list becomes
  `documentation`/`lessons`/`propose`/`integrate`; the Ports heading (L228) gains
  `· lessons` and the Ports table (L230-236) a row **lessons** *(Tier 0)* naming
  `paths.lessons`, `lessons.max_injected`, `pipeline.skip: [lessons]`, the guide and the
  sample; the examples-index table (near L418-423) a lessons-corpus row.
- `docs/guides/concepts.md` — "11-phase" at L38 (box art: keep the width, `12-phase`),
  L54 (the walk gains `→ lessons` between documentation and propose) and L229.
- `docs/README.md` — the guides cell (L12) names the lessons guide.
- `.claude-plugin/plugin.json` — the description's walk gains `lessons` between
  `documentation` and `propose`.
- `test/lessons-guides.test.js` (new, CommonJS).

**RED command.**

~~~
node --test test/lessons-guides.test.js
~~~

### TDD steps

1. **RED** —
   - `Given the lessons guide, when read, then it names paths.lessons, lessons.max_injected and pipeline.skip [lessons]`
   - `Given the lessons guide, when read, then it states lessons never gate a phase`
   - `Given the customizing guide Ports table, when read, then it has a lessons row`
   - `Given the customizing sequence block, when read, then lessons sits between documentation and propose`
   - `Given the concepts walk, when read, then lessons sits between documentation and propose`
   - `Given the plugin description, when read, then lessons sits between documentation and propose`
   - `Given the docs index, when read, then it links the lessons guide`
2. **GREEN** — the edits.
3. **GUARD** — `bash scripts/docs-structure-lint.sh docs/guides` and
   `bash scripts/docs-structure-lint.sh --audience docs` exit 0; intention-lint (in ci.sh)
   stays clean over customizing and concepts.

### Gate

~~~
node --test test/lessons-guides.test.js test/concepts-frames.test.js test/living-corpus.test.js test/plugin-structure.test.js
bash scripts/ci.sh
~~~

### Commit

`docs(guides): document the lessons phase and its knobs`

## Part 11 — README loop section

### Context

**Goal.** The README presents the lessons layer as craft's compound-engineering loop.

**Files (edited/created).**

- `README.md` — a new `## Every run teaches the next` section directly after the
  "What a run looks like" section (its standalone-commands table ends before
  `## What it costs, measured`, L136) and before `## What it costs, measured`. Content:
  the design's §README block verbatim (intro paragraph, the second mermaid block with
  `RUN[run]`, `LP[lessons phase]`, `PR{{"PR review 🧑"}}`, `LD[(lessons corpus)]`,
  `C[consult at phase entry]`, `NX[next run]`, then the closing paragraph linking
  docs/guides/lessons.md). No digit anywhere in the section, no http link, no product
  name. It comes after the first mermaid and first text blocks, so the drift guard's
  regions do not move.
- `test/readme-lessons-loop.test.js` (new, CommonJS) — pattern: test/readme-comparison.test.js
  (`sectionOf`, placement check, `ANY_DIGIT`).

**RED command.**

~~~
node --test test/readme-lessons-loop.test.js
~~~

### TDD steps

1. **RED** —
   - `Given the README, when its sections are located, then the loop section sits between What a run looks like and What it costs, measured`
   - `Given the loop section, when scanned, then it holds no digit and no http link`
   - `Given the loop section, when scanned, then it holds one mermaid block naming the lessons phase`
   - `Given the README, when its first mermaid block is located, then it starts before the loop section`
   - `Given the loop section, when its links are read, then it links the lessons guide and that file exists`
   - GUARD `Given the default pipeline, when the lessons descriptor is read, then it declares no gate and no harness`
     (passes since Part 7)
   - GUARD `Given the craft builds craft section, when read, then it holds a counted link to the lessons directory and that directory exists`
     (passes since Part 9)
2. **GREEN** — the README section.
3. **GUARD** — `bash scripts/readme-drift.sh` exits 0.

### Gate

~~~
node --test test/readme-lessons-loop.test.js test/readme-drift.test.js test/readme-comparison.test.js
bash scripts/ci.sh
~~~

### Commit

`docs(readme): present the lessons loop as compound engineering`
