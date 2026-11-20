# Plan — doctrine-register

> Source: design doc `docs/contributing/design/doctrine-register.md` · ADRs 730, 731, 732, 733, 734, 735, 736, 737, 738, 739, 740, 741, 742
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

## Rules every part inherits

- Work in the worktree root. Use /usr/bin/git for every git command, `--no-ext-diff` on
  diff/show, stage explicit paths only (never `-a`, never `add -A`), never touch the
  branch, index of others, stash or worktree state. One atomic conventional commit per
  part, green on `nice -n 19 bash scripts/ci.sh` (pipe it to a file outside the tree, read
  only the failing lines). Stryker is not part of any gate.
- No agent reads the ADR corpus (docs/contributing/adr/) or the whole generated register.
  The only corpus reads allowed are the ones a part names explicitly (Part 6: one Decision
  paragraph and one option list per named id; aggregate grep counts anywhere).
- Provenance ban: no `R-<digits>` / `ADR-<digits>` / phase / part / backlog ids in source,
  bin, script, test comment or test title. Synthetic ids appear only as test DATA; prefer
  ids no real ruling uses (900+). From Part 1 on, `test/source-hygiene.test.js` enforces
  `R-\d{3,}` in shipped code (whole line) and in test comments and titles.
- New engine modules follow the bin-shim-over-pure-src shape: engine/bin/<name>.js is the
  six-line shim of engine/bin/lesson-lint.js (`isEntryPoint(import.meta)` from
  engine/src/cli-io.js, `process.exit(main(process.argv.slice(2), { stdout, stderr }))`);
  engine/src/<name>-main.js exports `main(argv, io, deps = {})` with a frozen
  `DEFAULT_DEPS`, `EXIT_OK = 0`, `EXIT_INVALID = 2`, repo-relative labels, control
  characters escaped as `\xNN` (the `safeLabel` idiom: `/[\u0000-\u001f\u007f]/g`).
  Main tests use in-memory deps and `makeCaptureIo` from engine/test-helpers/capture-io.js
  (see engine/test/doctrine-lint-main.test.js); bin tests spawn the bin against a mkdtemp
  tree (see engine/test/lesson-lint.bin.test.js). Test files sit directly in engine/test/
  or test/ — `ci.sh` enumerates them by `find`, nothing else registers them.
- Tests: Given/When/Then titles, AAA bodies, a `sut` variable.
- Public-surface decisions (made here, not later): the three bins `rulings-lint`,
  `rulings-hint`, `rulings-migrate` are PUBLIC plugin surfaces (consumer repos run them);
  their surface gates are the skills that call them, docs/guides/concepts.md (lint list),
  docs/guides/customizing.md (`paths.rulings`), and the CHANGELOG Unreleased entry
  (Part 21). Every export of engine/src/rulings.js and the `*-main.js` modules is
  INTERNAL: never added to engine/src/index.js (the engine barrel), exactly like lesson.js
  and doctrine.js today.

## Why parts share files

plan-lint flags files declared by more than one part. Each is deliberate: the 6-file
ceiling and the rule that every commit is green under the scripts it carries force a
surface to change in steps. `scripts/ci.sh` (Part 6 adds the register to the prose-lint
exclusion, Part 18 removes `run_adr_lint`, Part 21 drops the ADR exclusion);
`scripts/static-lints.sh` and its test (Part 6 wires rulings-lint, Part 10 switches the
doctrine-lint argument once doctrine-lint reads the register); the doctrine-lint tests
(Part 9 moves fixture ids, Part 10 moves the resolver); `skills/run/SKILL.md`,
run-record.md, decision-tokens and fold-followups tests (Part 8 hint wiring, Part 11
reversal token, Part 18/19 retire adr-lint then its waiver token — the token pin lives
in adr-lint until Part 18 deletes it); source-hygiene (Part 1 adds the token).

## Decision candidates

Choices this plan had to make that the design and ADRs 730–742 do not settle. The plan
proceeds on each recommendation; the user may overrule any before the parts run.

| # | Choice | Alternatives (≤3) | Recommendation | Why |
|---|---|---|---|---|
| P1 | Explicit chosen-option markers in ADR option lists (measured: `*(chosen)*` 42, `*(user choice)*` 28, `*(user's choice)*` present) | (a) a source in the chain: table → explicit chosen marker → adopted marker → single recommended marker → none; a chosen marker clears a suspect; table vs marker conflict refuses; (b) ignore them (design chain as written); (c) treat them as suspects needing a table entry | **(a)** | They state the user's pick verbatim; ignoring them writes the chosen option as refused wherever it differs from the recommendation. (c) inflates the hand-read table for no gain. |
| P2 | `scripts/governing-corpus.sh` and its test | (a) keep the script: skills/validation/SKILL.md:110 enumerates the LESSONS directory through it for `assert-fresh`; only the ADR use goes; its test moves to mkdtemp fixtures; (b) delete as the design says and re-wire validation's lessons enumeration; (c) rename it to a neutral name | **(a)** | Deleting it changes the validation phase (R8 forbids). (c) is churn with no behaviour gain. |
| P3 | `PROBE_PATHS`, `MARKDOWN_PROBE_PATHS`, `matchesEveryPath`, `coversEveryPath` in engine/src/glob.js | (a) delete them with their tests once `adr-lint` and `adr.frozen` are gone (no caller left); (b) retarget the example paths as the design says | **(a)** | Their only callers are adr-lint-main.js and manifest.js `adr.frozen` checks; kept, they are dead code. |
| P4 | ADRs adopted without the `adopted-as-recommended` marker (Status `accepted — adopted in review (no user judgment)`, `accepted — adopted from a verified review finding (no user judgment)`, one each) | (a) `Adopted: <status suffix without "(no user judgment)">.` (b) migrate as ratified (no `Adopted:`) | **(a)** | An absent `Adopted:` means "ratified by the user" (R1), which is false for both. |
| P5 | Bare ADR file paths in the live tier (BACKLOG.md:377, :425, docs/contributing/specs/run-record.md:254, five eval fixture lines) | (a) `cite` rewrites a bare `…adr/NNN-<slug>.md` path (not a link target) to `R-NNN`; (b) leave them to dangle after deletion; (c) hand-edit them | **(a)** | Same mechanical rule as the id rewrite, tested once, no hand edits. |
| P6 | The one supersession scope that carries a reserved marker (ADR-734's `supersedes` scope for 353 quotes `' Superseded by R-M: <scope>.'`) | (a) reword that scope in the ADR file before migrating (same meaning, no quoted marker); (b) add an escape to the line grammar | **(a)** | The grammar has no escape by design (ADR-736); one input fix beats a grammar change. |
| P7 | Where `cite` points a rewritten link target | (a) keep the link's own prefix and replace the `adr/NNN-<slug>.md` tail with `RULINGS.md` (right for craft and the consumer default); (b) add a `--register <file>` flag and compute a relative path | **(a)** | Keeps the design's `cite <file>...` signature; both shipped layouts put the register beside the old `adr/` directory's parent. |

## Part 1 — Register parser and printer

### Context

Creates the one grammar every later consumer shares (design §Line grammar), plus the
provenance token that keeps ruling ids out of code from here on.

Files:
- `engine/src/rulings.js` (new, internal, pure, no I/O).
- `engine/test/rulings.test.js` (new).
- `test/source-hygiene.test.js` — `PROVENANCE_REF_TOKENS` (line ~132, currently
  `'ADR-?\\d+|P\\d+|Part\\s+\\d+|backlog\\s*#\\d+|DC-\\d+'`) gains `R-\\d{3,}`; add one
  throwaway-repo case next to the `listProvenanceRefLines` cases (line ~584, helper
  `withThrowawayRepo(files, fn)` + `hermeticGitEnv()`): a shipped file holding a ruling id
  is reported; a test file holding it inside a string literal on a non-title line is not.
  Reword the comment above the token ("Skills and templates are not scanned: their
  decision citations are deliberate and adr-lint checks them") to name decision memory
  generically, since adr-lint goes later.

Grammar (byte-exact, design §Line grammar):

```text
ruling    = "- " id " [" paths "] " statement [refused] [adopted] [status]
id        = "R-" 3*DIGIT          ; printed zero-padded to 3 digits
paths     = "" | path *(", " path)
statement = text "."
refused   = " Refused: " item *(" · " item) "."
adopted   = " Adopted: " basis "."
status    = " Superseded by " id ": " scope "." | " Rejected: " text "."
```

Exports (signatures fixed here; later parts import them):
- `parseRulingLine(line, lineNo) → { ruling } | { error: { line, message } }`. A ruling is
  `{ id: number, line: number, paths: string[], statement: string, refused: string[],
  adopted: string|null, status: null | { kind: 'superseded', by: number, scope: string } |
  { kind: 'rejected', reason: string }, raw: string }`. Split left to right on the
  reserved markers ` Refused: `, ` Adopted: `, ` Superseded by R-`, ` Rejected: `; each at
  most once and in that order (` Superseded by R-` and ` Rejected: ` are mutually
  exclusive); each segment's own trailing `.` is stripped; empty statement, item, basis,
  scope or reason is an error. `statement` and items may hold `.`, `;`, `|`.
- `formatRulingLine(ruling) → string` — the inverse; `formatRulingLine(parseRulingLine(l).ruling) === l` for every valid line.
- `parseRegister(content) → { rulings, errors }` — layout: an H1 `# Rulings`, an intro
  (every line before the first line starting `- `), then ruling lines. After the first
  ruling line, blank lines are ignored and any other line not starting `- R-` is an error
  (`not a ruling line`). An empty register (H1 + intro, no line) is valid.
- `sliceRulings(rulings, touched) → { matched: Ruling[], pathless: number }` — a ruling is
  matched when any touched path matches any of its globs via `matchGlob(path, glob)`
  (engine/src/glob.js; same any-any rule as engine/src/intention.js `matchingPaths`);
  superseded and rejected rulings are included; a `[]` ruling is never matched and is
  counted in `pathless`; id order kept; no cap.
- `REGISTER_HEADER` (the H1 + intro, byte-exact, used by Part 3's emitter and by the
  decisions skill when it creates a register):

```text
# Rulings

What is settled, what was refused, for which paths. One line per ruling, append-only; the
decisions phase writes them, rulings-lint checks them. Why a ruling was made is not stored:
infer it from DOCTRINE.md and the code.

```

(The design's layout wraps `rulings-lint` and DOCTRINE.md in backticks inside the
intro; the plan writes them plain above only to keep this block free of backtick pairs —
the shipped constant uses the design's backticked form.)

### TDD steps

1. RED `engine/test/rulings.test.js`: Given a line with empty paths and a statement only,
   when parseRulingLine runs, then it returns id, `[]`, the statement — fails: module
   engine/src/rulings.js does not exist (import error).
2. GREEN: create rulings.js with `parseRulingLine` for `- R-NNN [paths] statement.`.
3. RED: several paths; each optional segment alone (refused with two items, adopted,
   superseded, rejected) and all combined; a statement holding `.`, `;` and `|` — fails:
   step-2 code returns the whole tail as the statement.
4. GREEN: marker split left to right, trailing-dot strip, ` · ` item split.
5. RED: refusals — markers out of order, a repeated marker, superseded plus rejected, an
   empty item / scope / statement, a malformed id (`R-12`), missing `[`…`]` — fails:
   step-4 code accepts them.
6. GREEN: error results with line numbers.
7. RED: `formatRulingLine` round-trip, as a property lens: a seeded generator (no new
   dependency; a small LCG over a fixed alphabet that excludes the reserved markers and
   ` · `) builds 200 valid lines; each round-trips byte-exact — fails: no
   `formatRulingLine` export.
8. GREEN: `formatRulingLine`, zero-padding the id to 3 digits.
9. RED: `parseRegister` (header + rulings, a stray prose line after the first ruling is
   an error, blank lines ignored, empty register valid) and `sliceRulings` (glob match
   through matchGlob, superseded and rejected included, `[]` never matched and counted,
   duplicates in touched do not duplicate output) — fails: exports absent.
10. GREEN: both exports and `REGISTER_HEADER`.
11. RED `test/source-hygiene.test.js`: Given a throwaway repo tracking a ruling id in an
    engine source file, when listProvenanceRefLines scans it, then the line is reported —
    fails: the token list has no ruling-id token.
12. GREEN: extend `PROVENANCE_REF_TOKENS`; reword the comment.
13. GUARD: the live-tree class E tests (`Given the tracked tree, when shipped code is
    scanned…` and the test-titles twin) still pass — no shipped file or test title holds
    a ruling id today (verify with `git grep -nE '\bR-[0-9]{3,}' -- engine/src engine/bin
    scripts hooks`; zero rows expected).
14. REFACTOR: functions ≤20 lines, named constants for markers and separators.

### Gate

```bash
cd engine && node --test test/rulings.test.js && cd ..
node --test test/source-hygiene.test.js
nice -n 19 bash scripts/ci.sh > "${TMPDIR:-/tmp}/ci-part1.log" 2>&1; echo "ci exit $?"; grep -nE "^not ok|ci: |FAIL" "${TMPDIR:-/tmp}/ci-part1.log" | head -40
```

### Commit

`feat(rulings): register line parser, printer and path slice`

## Part 2 — rulings-lint

### Context

Design §`rulings-lint` (RL1–RL5). Not wired into any script yet (Part 6 wires it).

Files:
- `engine/src/rulings.js` — add `registerFindings(content) → { line, message }[]`, pure:
  RL1 = `parseRegister` errors; RL2 order (an id repeats or is not greater than the
  previous line's id: `R-NNN out of order` / `duplicate id R-NNN`); RL3 paths (absolute,
  starts with `~`, contains `..`, whitespace, `,`, `[` or `]` — mirror
  engine/src/manifest.js `checkLessonsDir`; existence never checked); RL4 supersession
  (`Superseded by R-M`: M exists, M > N, M not itself superseded); RL5 basis (every
  `R-\d{3,}` inside an `Adopted:` basis names an existing line, whatever its status;
  `DOCTRINE(D-n)` bases are NOT checked here). Part 4 reuses this function to self-check
  the migrator's output.
- `engine/src/rulings-lint-main.js` (new) — `rulings-lint <register-file>`. Usage error
  (argc ≠ 1): stderr `usage: rulings-lint <register-file>\n`, exit 2. Missing or
  non-regular file (`isRegularFile` from engine/src/cli-io.js): stdout
  `rulings-lint: no such file <arg>\n`, exit 2 (the bin-entry tests of Part 18 rely on
  this loud exit 2). Finding: stdout `rulings-lint: <arg>:<line>: <message>\n`, exit 2.
  Clean: stdout `rulings-lint: <n> rulings — OK\n`, exit 0. Every label through the
  control-character escape. Model: engine/src/lesson-lint-main.js.
- `engine/bin/rulings-lint.js` (new shim).
- `engine/test/rulings-lint-main.test.js` (new, in-memory deps).
- `engine/test/rulings-lint.bin.test.js` (new spawn smoke, mkdtemp register).

### TDD steps

1. RED `rulings-lint-main.test.js`: Given no argument, when main runs, then usage on
   stderr and exit 2 — fails: module absent.
2. GREEN: main skeleton (usage, missing-file finding, clean OK line); the bin shim.
3. RED: one red and one green fixture per RL1–RL5 (RL5 red: an `Adopted:` basis naming a
   ruling id with no line; RL5 green: a basis naming a superseded line) — fails: main
   reports OK on every red fixture.
4. GREEN: `registerFindings` in rulings.js; main prints them.
5. RED: a path holding a control character is printed escaped; labels are repo-relative
   when the argument is given relative — fails: raw byte in output.
6. GREEN: escape helper.
7. GUARD `rulings-lint.bin.test.js`: Given a valid and an invalid register on disk, when
   the bin is spawned, then it exits 0 / 2 — passes: the step-2 shim already delegates to
   the step-4 main.
8. REFACTOR.

### Gate

```bash
cd engine && node --test test/rulings.test.js test/rulings-lint-main.test.js test/rulings-lint.bin.test.js && cd ..
nice -n 19 bash scripts/ci.sh > "${TMPDIR:-/tmp}/ci-part2.log" 2>&1; echo "ci exit $?"; grep -nE "^not ok|ci: |FAIL" "${TMPDIR:-/tmp}/ci-part2.log" | head -40
```

### Commit

`feat(rulings): rulings-lint gates the register form, order, paths and references`

## Part 3 — rulings-migrate register: ids, paths, chosen option, refused list, adoption

### Context

Design §Migration step 1–5 and decision candidates P1, P4 above. Status segments, the
report and the self-check come in Part 4; `cite` in Part 5.

Files:
- `engine/src/rulings-migrate-main.js` (new) — verb dispatch
  `rulings-migrate register <adr-dir> [--chosen <json>]` (Part 5 adds `cite`). Deps:
  `listDir`, `readFile`, `isRegularEntry`, `cwd` (doctrine-lint-main.js style). Output:
  `REGISTER_HEADER` from engine/src/rulings.js then one line per ADR in id order, via
  `formatRulingLine`, on stdout. Refusals are COLLECTED (all of them), printed on stderr
  as `rulings-migrate: refuse <NNN>: <reason>\n`, nothing on stdout, exit 2. Usage error:
  stderr usage line, exit 2.
- `engine/bin/rulings-migrate.js` (new shim).
- `engine/test/rulings-migrate-main.test.js` (new) — the ADR fixture directory is an
  IN-MEMORY map `{ '<NNN>-<slug>.md': content }` served by the deps (no on-disk fixture
  tree); synthetic ids 901+.
- `engine/test/rulings-migrate.bin.test.js` (new) — spawn smoke over a mkdtemp directory
  of two ADR files, stdout byte-exact.

ADR shapes the parser must map (measured by aggregate counts over the live corpus; no
text read):
- Filename `NNN-<slug>.md`; H1 `# NNN — <title>` (em dash); id = filename prefix; the H1
  number must equal it. Refuse: missing H1, number mismatch, a repeated id, a title holding
  a reserved marker (` Refused: `, ` Adopted: `, ` Superseded by R-`, ` Rejected: `).
  Statement = title + `.` (no title ends with punctuation).
- Paths: `parseSubjects(content)` from engine/src/intention-subjects.js — `null` → `[]`;
  an array of non-empty strings → those, in file order; a throw (malformed YAML) or any
  other shape → refuse.
- Status line `- **Status:** …` forms: `accepted` (523), `accepted — adopted-as-recommended
  (no user judgment)` (122), `accepted (adopted-as-recommended, no user judgment)` (2),
  `accepted — ratified by the user` (52), `accepted — adopted in review (no user
  judgment)` (1), `accepted — adopted from a verified review finding (no user judgment)`
  (1), `superseded by ADR-NNN` (41), `rejected — <reason>` (1).
- Options section heading `## Options considered` (728) or `## Options` (9); items are
  lines matching `^\d+\. `; option title = the leading bold run `**…**`, else the text
  before ` — `. Five ADRs have no options section → no options.
- Recommended markers on an option line (any of): `*(recommended)*`, `(recommended)`,
  `*(designer's recommendation)*`, `*(designer recommendation)*`, `*(designer
  recommended)*`, `*(recommended by the design)*`, `*(recommendation)*`, `*(design
  recommendation)*`. Exactly one marked option = "the recommended option"; zero or several
  = none.
- Chosen markers (decision candidate P1): `*(chosen)*`, `*(user choice)*`, `*(user's
  choice)*`.
- Decision section heading `## Decision` (738) or `## Decision — *adopted-as-recommended
  (no user judgment)*` (4); "first paragraph" = the lines after the heading up to the first
  blank line.
- Adopted forms (an ADR is adopted when ANY holds): Status line contains
  `adopted-as-recommended`; the Decision heading carries it; the Decision first paragraph
  starts `**adopted-as-recommended (no user judgment)**`. Basis: the text after that bold
  marker's ` — ` to the end of the first paragraph (joined with spaces, trailing `.`
  stripped), `ADR-(\d{3,})` rewritten to `R-$1`; no bold-marker basis → `as recommended`.
  Candidate P4: the two `adopted in review` / `adopted from a verified review finding`
  Status forms → basis `in review` / `from a verified review finding`.
- `--chosen <json>`: an object `{ "<NNN>": <positive integer> | "none" }`; malformed JSON,
  an unknown id, an out-of-range option number → usage-class refusal, exit 2.
- Chosen option, first source that answers: table entry → explicit chosen marker (P1) →
  adopted (the recommended option) → the single recommended option → none. A table entry
  that contradicts a chosen marker → refuse.
- Suspect (ratified = not adopted): the Decision first paragraph names `option N`
  (case-insensitive; an occurrence directly preceded by `recommended ` is ignored — the
  "recommended option 2 … Option 1" shape) with N ≠ the recommended option's number, or
  carries a deviation phrase (`/deviat|against the [^.]*recommendation/i`). A suspect with
  neither a table entry nor a chosen marker → refuse `suspect chosen option — add a
  --chosen entry`; the refusal lists every such id in one run.
- Refused = the option titles other than the chosen one, in option order; empty when the
  chosen option is `none`/unknown or there are fewer than two options.

### TDD steps

1. RED: Given one unfenced ratified ADR with two options, the first recommended, when
   `register` runs, then stdout is the header plus `- R-901 [] <title>. Refused: <opt 2>.`
   — fails: module absent.
2. GREEN: dispatch, directory read in id order, H1/id/statement, recommended chain,
   refused list; the bin shim.
3. RED: paths — fenced with subjects, fenced without subjects, malformed fence (refuse);
   id/title refusals (number mismatch, repeated id, reserved marker in title) — fails:
   step-2 code emits `[]` and never refuses.
4. GREEN.
5. RED: adoption — Status-line form, Decision-heading form, Decision-lead form with a basis
   citing an ADR id (rewritten to `R-`), lead form without basis (`as recommended`), the
   two review-adopted forms — fails: no `Adopted:` segment emitted.
6. GREEN.
7. RED: chosen chain — table `N`, table `none` (no refused list), explicit chosen marker,
   chosen marker vs table conflict (refuse), no recommended marker (no refused list), one
   option only, two recommended markers, an option title containing `; ` kept whole —
   fails: step-6 code always picks the recommended option.
8. GREEN.
9. RED: suspects — a ratified ADR whose lead names a non-recommended `option N` without a
   table entry refuses and lists the id; the "recommended option 2 … Option 1" shape is a
   suspect; a deviation phrase is a suspect; two suspects are both listed in one run; a
   table entry clears the refusal — fails: no suspect detection.
10. GREEN.
11. GUARD `rulings-migrate.bin.test.js`: spawn over a mkdtemp directory, byte-exact
    stdout and exit 0; a refusing directory exits 2 with empty stdout — passes: the
    step-2 shim delegates to the completed main.
12. REFACTOR: one function per source in the chain; named constants for every marker
    list; no function over 20 lines.

### Gate

```bash
cd engine && node --test test/rulings-migrate-main.test.js test/rulings-migrate.bin.test.js && cd ..
nice -n 19 bash scripts/ci.sh > "${TMPDIR:-/tmp}/ci-part3.log" 2>&1; echo "ci exit $?"; grep -nE "^not ok|ci: |FAIL" "${TMPDIR:-/tmp}/ci-part3.log" | head -40
```

### Commit

`feat(rulings): rulings-migrate derives register lines from ADR files`

## Part 4 — rulings-migrate register: statuses, self-check, report, corpus dry run

### Context

Design §Migration step 6 and the report. Builds on Part 3's module.

Files:
- `engine/src/rulings-migrate-main.js` — add:
  - superseded: Status `superseded by ADR-M` → ` Superseded by R-<T>: <scope>.` where T is
    the live tail of the chain (follow each successor's own `superseded by` until an ADR
    that is not superseded; a cycle or a missing successor → refuse); scope = the
    `scope` of the entry for N in M's (the DIRECT successor's) `supersedes` frontmatter
    (entries are `{ adr: "<zero-padded NNN>", scope: "<text>" }`, read with
    engine/src/frontmatter.js `extractFrontmatter` + js-yaml `load`, as
    intention-subjects.js does), trailing `.` stripped; no entry → `see R-<M>`.
  - rejected: `rejected — <reason>` → ` Rejected: <reason>.`.
  - self-check: the assembled register goes through `registerFindings` (Part 2) and every
    line through `formatRulingLine(parseRulingLine(line))`; any finding or mismatch →
    refuse that id with the finding text (this is how a reserved marker inside a scope,
    basis or option title is caught).
  - report on stderr (only on success): `rulings-migrate: chosen table=<n>
    chosen-marker=<n> adopted=<n> recommended=<n> none=<n>`; `rulings-migrate:
    not-recommended <R-ids comma-separated>` (every line whose chosen option is not the
    recommended one — the maintainer's PR-review list); `rulings-migrate:
    adopted-mention-unrecognised <R-ids>` (files that contain `adopted-as-recommended`
    outside the three recognised forms — measured: 37; reported, never refused).
- `engine/test/rulings-migrate-main.test.js` — extend.

Corpus dry run (read-only, last step): write a scratch chosen table OUTSIDE the tree
(`"${TMPDIR:-/tmp}/chosen.json"`) holding the design's 15 known entries — 234→2, 249→2,
257→1, 301→2, 322→2, 338→3, 375→2, 504→3, 564→3, 572→3, 719→3, 538→2, 655→2, 674→2,
263→"none" — then run
`node engine/bin/rulings-migrate.js register docs/contributing/adr --chosen "${TMPDIR:-/tmp}/chosen.json" > /dev/null 2> "${TMPDIR:-/tmp}/dry.txt"`
and read ONLY the `refuse` lines (`grep '^rulings-migrate: refuse'`). Expected refusals: suspects (at least 133, 136, 138,
140, 156, 158 — Part 6 tables them) and 353 (its scope from 734 quotes a reserved marker
— Part 6 rewords it, candidate P6). Any OTHER refusal class is a shape this plan did not
measure: add an in-memory fixture reproducing the shape (never copy ADR text — rebuild
the shape from the refusal reason), fix the mapping, re-run. If a class cannot be mapped
without guessing, stop with the blocker protocol. Nothing from the dry run is committed:
Part 6 re-runs the same command against the committed table.

### TDD steps

1. RED: Given 901 superseded by 902 with a `supersedes` scope, when `register` runs, then
   901's line ends ` Superseded by R-902: <scope>.` — fails: Part 3 emits no status.
2. GREEN.
3. RED: a chain 901→902→903 points at R-903 with 902's scope; no scope entry → `see
   R-902`; a cycle refuses; a rejected ADR gets ` Rejected: <reason>.` — fails.
4. GREEN.
5. RED: a supersession scope holding ` Superseded by R-` refuses the superseded id; a
   refused option title holding ` · ` refuses — fails: Part 3 emits the bad line.
6. GREEN: self-check through `registerFindings` and the round-trip.
7. RED: the report — counts per source, the not-recommended list, the
   unrecognised-mention list; nothing on stderr but refusals when refusing — fails: no
   report.
8. GREEN.
9. REFACTOR, then the corpus dry run above.

### Gate

```bash
cd engine && node --test test/rulings-migrate-main.test.js test/rulings.test.js && cd ..
nice -n 19 bash scripts/ci.sh > "${TMPDIR:-/tmp}/ci-part4.log" 2>&1; echo "ci exit $?"; grep -nE "^not ok|ci: |FAIL" "${TMPDIR:-/tmp}/ci-part4.log" | head -40
```

### Commit

`feat(rulings): rulings-migrate carries supersession and rejection and reports chosen-option sources`

## Part 5 — rulings-migrate cite

### Context

Design §Migration `cite` plus candidates P5 and P7.

Files:
- `engine/src/rulings-migrate-main.js` — verb `cite <file>...`: per file, in order,
  1. markdown link targets `](<prefix>adr/<NNN>-<slug>.md<#fragment>?)` →
     `](<prefix>RULINGS.md)` (P7; `<prefix>` = the target's own leading path, kept);
  2. bare paths `<prefix>adr/<NNN>-<slug>.md` not inside a link target (an optional
     `:<line>` suffix included) → `R-<NNN>` (P5);
  3. `\bADR-(\d{3,})\b` → `R-$1`; two-digit `ADR-12` untouched.
  Write a file only when its content changed (an unchanged file is never rewritten).
  Stdout one line per changed file: `rulings-migrate: cite <file>: <n> rewrites\n`.
  Unreadable or non-regular file → stdout finding, exit 2, no file written.
- `engine/test/rulings-migrate-main.test.js` — extend (in-memory `readFile`/`writeFile`
  deps; add `writeFile` to `DEFAULT_DEPS`).

### TDD steps

1. RED: Given a file citing `ADR-901`, when `cite` runs, then it reads `R-901` — fails:
   unknown verb is a usage error.
2. GREEN: verb + id rewrite.
3. RED: a link `[x](../contributing/adr/901-a-b.md#ctx)` → `[x](../contributing/RULINGS.md)`;
   a bare backticked path and a `path:1` form → `R-901`; `ADR-12` untouched; a file with no
   citation is not written (the `writeFile` dep is never called) — fails.
4. GREEN.
5. RED: an unreadable file exits 2 and writes nothing — fails: throws.
6. GREEN, REFACTOR.

### Gate

```bash
cd engine && node --test test/rulings-migrate-main.test.js test/rulings-migrate.bin.test.js && cd ..
nice -n 19 bash scripts/ci.sh > "${TMPDIR:-/tmp}/ci-part5.log" 2>&1; echo "ci exit $?"; grep -nE "^not ok|ci: |FAIL" "${TMPDIR:-/tmp}/ci-part5.log" | head -40
```

### Commit

`feat(rulings): rulings-migrate cite rewrites ADR citations to ruling ids`

## Part 6 — Generate the register and wire rulings-lint

### Context

Design §Commit outline 3 and §Migration acceptance. Docs-and-wiring part (no engine src
delta). `adr-lint` still runs and must stay green beside `rulings-lint`.

Files:
- `docs/contributing/rulings-chosen.json` (new) — the `--chosen` table (Part 4's 15
  entries + the suspects settled below). Deleted with the ADR files in Part 21.
- `docs/contributing/RULINGS.md` (new) — generated, never hand-edited.
- `docs/contributing/adr/734-a-reversed-ruling-keeps-its-line-with-a-superseded-by-pointer.md`
  — candidate P6: frontmatter line 8, the `scope` for `adr: "353"`, becomes
  `"where supersession is declared: a superseded-by segment on the superseded register line replaces the supersedes frontmatter"`
  (same meaning, no quoted marker). Edit nothing else in that file.
- `scripts/static-lints.sh` — add `node engine/bin/rulings-lint.js docs/contributing/RULINGS.md`
  on its own line, right after the `lesson-lint` line (one command per line; see the
  file's header comment).
- `test/static-lints-ci.test.js` — `LINT_IDS` gains `'rulings-lint docs/contributing/RULINGS.md'`
  after the `lesson-lint` id; `NODE_STUB_NAMES` gains `'rulings-lint'`.
- `scripts/ci.sh` — `run_prose_lint` exclusion `case` adds `docs/contributing/RULINGS.md`
  (it quotes refused wording, like the provenance docs already excluded).

Suspect resolution (the ONLY corpus read in this plan): run the Part 4 command with the
committed table path; for each id in the `refuse … suspect` lines, read exactly
- `f=$(ls docs/contributing/adr/<NNN>-*.md); sed -n '/^## Decision/,/^## /p' "$f" | head -8`
- `sed -n '/^## Options/,/^## /p' "$f" | grep -E '^[0-9]+\. ' | cut -c1-160`
and table the number of the option the Decision paragraph says the user chose, or
`"none"` when it picks no listed option. Expected ids (design measurement): 133, 136, 138,
140, 156, 158, plus any the script adds. Never read anything else.

Generation: write to a scratch file, move it in only on exit 0 (a refusing run prints
nothing):

```bash
node engine/bin/rulings-migrate.js register docs/contributing/adr --chosen docs/contributing/rulings-chosen.json > "${TMPDIR:-/tmp}/RULINGS.md" 2> "${TMPDIR:-/tmp}/report.txt" && mv "${TMPDIR:-/tmp}/RULINGS.md" docs/contributing/RULINGS.md
```

Acceptance (all computed, nothing hard-coded):
- `node engine/bin/rulings-lint.js docs/contributing/RULINGS.md` exits 0.
- `grep -c '^- R-' docs/contributing/RULINGS.md` = `ls docs/contributing/adr/*.md | wc -l`.
- lines with non-empty paths (`grep -c '^- R-[0-9]* \[[^]]' …`) = ADRs whose fence parses
  to a non-empty `subjects` list (a node one-liner over the directory using
  `parseSubjects`, printing only the count).
- `grep -c ' Superseded by R-'` = `grep -l '^- \*\*Status:\*\* superseded by ADR-' docs/contributing/adr/*.md | wc -l`;
  `grep -c ' Rejected: '` ≥ 1.
- R-730…R-742 present (this run's own rulings, ADR-742).
- Copy the report's `not-recommended` line into the part's handback message — the
  documentation phase puts it in the PR body; it is reproducible by re-running the command
  until Part 21.

### TDD steps

1. RED `test/static-lints-ci.test.js`: the expected invocation list includes
   `rulings-lint docs/contributing/RULINGS.md` — fails: static-lints.sh does not call it.
2. GREEN: the static-lints.sh line (the register must exist first — generate it in this
   step: P6 scope edit, suspect table, generation command, acceptance checks).
3. GUARD: `bash scripts/adr-lint.sh docs/contributing/adr` still exits 0 after the 734
   scope edit (C0 form only reads the scope as a non-empty string).
4. GUARD: `node engine/bin/doctrine-lint.js docs/contributing/DOCTRINE.md docs/contributing/adr`
   still exits 0 (nothing it reads changed).
5. The prose-lint exclusion line (advisory gate; no test pins the case list).

### Gate

```bash
node engine/bin/rulings-lint.js docs/contributing/RULINGS.md
node --test test/static-lints-ci.test.js
nice -n 19 bash scripts/ci.sh > "${TMPDIR:-/tmp}/ci-part6.log" 2>&1; echo "ci exit $?"; grep -nE "^not ok|ci: |FAIL|finding" "${TMPDIR:-/tmp}/ci-part6.log" | head -40
```

### Commit

`docs(rulings): generate the rulings register from the ADR corpus and gate it with rulings-lint`

## Part 7 — rulings-hint

### Context

Design §Slice delivery. Mirrors engine/src/lessons-hint-main.js (read it first: argument
loop, `NOTE_PREFIX`, advisory error handling, `parseScope`), but reads the WORKING-TREE
register (no git, no base revision).

Files:
- `engine/src/rulings-hint-main.js` (new) — `rulings-hint --register <file>`; touched paths
  on stdin (blank lines and duplicates ignored). Output only when the slice is non-empty:

```text
Rulings (settled for these paths — a proposal that re-opens one escalates):
<each matched ruling's raw line, id order>
(<n> rulings carry no paths — search <register-file> by topic)
```

  The tail line only when n > 0. Unknown flag / missing value / missing `--register` →
  stderr usage, exit 2. Any other failure (missing register, unreadable, register with
  parse errors) → stderr `craft-rulings-hint: <reason>\n`, exit 0. Uses
  `parseRegister` + `sliceRulings` from engine/src/rulings.js. Deps: `readFile`,
  `readStdin`.
- `engine/bin/rulings-hint.js` (new shim).
- `engine/test/rulings-hint-main.test.js` (new) and `engine/test/rulings-hint.bin.test.js`
  (new; spawn with stdin piped, mkdtemp register).
- `.claude/workflow.md` — `paths:` gains `rulings: docs/contributing/RULINGS.md` (after
  `lessons`). `paths.adr` stays until Part 21. `paths` keys are not validated — no
  manifest code change.

### TDD steps

1. RED: Given a register with one matching and one path-less ruling, when main runs with
   the touched path on stdin, then stdout is header + line + tail — fails: module absent.
2. GREEN, plus the shim.
3. RED: empty slice prints nothing; superseded and rejected lines print verbatim; blank
   and duplicate stdin lines; tail absent when no path-less line — fails on the cases the
   step-2 code does not cover.
4. GREEN.
5. RED: missing register → stderr note, exit 0; bad flags → exit 2 — fails.
6. GREEN, REFACTOR. GUARD bin smoke — passes: the step-2 shim delegates to main.
7. Manual check: `printf 'skills/decisions/SKILL.md\n' | node engine/bin/rulings-hint.js --register docs/contributing/RULINGS.md | head -3` prints the header (R-730 names that path). Read no more of the output than that.

### Gate

```bash
cd engine && node --test test/rulings-hint-main.test.js test/rulings-hint.bin.test.js && cd ..
nice -n 19 bash scripts/ci.sh > "${TMPDIR:-/tmp}/ci-part7.log" 2>&1; echo "ci exit $?"; grep -nE "^not ok|ci: |FAIL" "${TMPDIR:-/tmp}/ci-part7.log" | head -40
```

### Commit

`feat(rulings): rulings-hint slices the register for a phase's touched paths`

## Part 8 — Phases read the rulings hint; consult loses the governing lane

### Context

Design §Slice delivery last bullet, decision candidate P2 (keep the enumerator script).

Files:
- `engine/src/intention.js` — `consult(scope, deps)` (line ~36): drop the `governing`
  lane (`deps.listGoverning`), its `mergeLanes` merge into `subjectPages` and `skipped`;
  JSDoc `deps` type loses `listGoverning`; the comments at ~198 and ~224 that name the
  governing lane are reworded. `mergeLanes` stays only if still used (it is: lessons +
  living skipped); otherwise delete it. Living and lessons lanes byte-unchanged (R8).
- `engine/test/intention.test.js` — remove the `// consult — governing lane (ADRs)` block
  (from line ~177: helper `governingOf`, and the four cases through ~245) and the two
  `assertFresh` "Req-3 lock" cases (~247–290) that exist only to prove the governing lane
  never leaks; add ONE case: Given deps carrying a `listGoverning` that lists a matching
  page, when consult runs, then the result deep-equals the same deps without it. Living
  and lessons cases unchanged.
- `skills/run/SKILL.md` — §1c-int (lines ~94–108): drop "plus the resolved ADR directory
  for the governing lane — where scripts/governing-corpus.sh emits … not an error;".
  Step 4 (line ~320): keep **Intention hint** for living-page entries; add right after it
  a **Rulings hint (advisory).** paragraph: for `design`, `decisions`, `planning` only, one
  call with `<rulings-file>` = `paths.rulings`, else docs/RULINGS.md:
  `git diff --name-only <base>...HEAD | node "${CRAFT_ROOT:-${CLAUDE_PLUGIN_ROOT}}/engine/bin/rulings-hint.js" --register "<rulings-file>"`,
  appending the brief path (`design`) or the design doc path (`decisions`, `planning`) to
  stdin; non-empty output goes into the SAME slot-1 prepend; it reads the working tree
  so `planning` sees lines this run's `decisions` phase committed; a proposal that
  re-opens a listed ruling escalates. test/lessons-prose.test.js requires the Lessons
  hint paragraph to stay free of the enumerator script's name — do not move text into it.
- `docs/contributing/specs/intention.md` — port interface (line ~15–16): drop the optional
  `listGoverning`; replace the **Governing lane** paragraphs (~166–190) with a short
  pointer: decision memory reaches the phases through the rulings hint (design, decisions,
  planning), not through `consult`; `record` for the `file` adapter = append one line to
  the register. Keep the statement that only the living lane reaches `assert-fresh`.
- `scripts/governing-corpus.sh` — kept (P2): header comment reworded from the ADR
  governing lane to "fenced-record enumerator" (its live caller is the validation skill's
  lessons enumeration, skills/validation/SKILL.md:110 — unchanged).
- `test/governing-corpus.test.js` — the first case enumerates the repo ADR directory; move
  it to a mkdtemp fixture (two fenced, one unfenced markdown file) so nothing depends on
  docs/contributing/adr/ (deleted in Part 21). Other cases already use mkdtemp.

Parity check (one-off, BEFORE editing intention.js; results stay in TMPDIR, not
committed): for the touched sets of the last three squash merges on main
(`/usr/bin/git log --format=%h -3 main --grep='(#[0-9]*)$'`, each `git diff --name-only <sha>^ <sha>`),
compute today's governing slice ADR ids (a node script calling `consult` with
`listGoverning` = `bash scripts/governing-corpus.sh docs/contributing/adr` output and
`readPage` = readFileSync, printing ids only) and the `rulings-hint` ids for the same
stdin; assert hint ids ⊇ governing ids. Report the three set sizes in the handback. A
missing id is a defect in Parts 1–7: stop with the blocker protocol.

### TDD steps

1. Parity check (above).
2. RED `intention.test.js`: the new case — fails: consult still merges the
   `listGoverning` page into `entries`.
3. GREEN: remove the lane; delete the obsolete governing-lane cases.
4. GUARD `governing-corpus.test.js`: the fixture-based enumeration case — passes: the
   script already filters by fence; the change only removes the live-corpus dependency.
5. Prose edits (run skill, intention spec, script header). GUARD:
   `node --test test/lessons-prose.test.js` still passes.

### Gate

```bash
cd engine && node --test test/intention.test.js && cd ..
node --test test/governing-corpus.test.js test/lessons-prose.test.js
nice -n 19 bash scripts/ci.sh > "${TMPDIR:-/tmp}/ci-part8.log" 2>&1; echo "ci exit $?"; grep -nE "^not ok|ci: |FAIL" "${TMPDIR:-/tmp}/ci-part8.log" | head -40
```

### Commit

`feat(rulings): design, decisions and planning read the rulings hint instead of the governing lane`

## Part 9 — Doctrine cites ruling ids

### Context

Design §Doctrine anchor, first half: the parser and the doctrine file switch to `R-` ids
while `doctrine-lint` still resolves ids against the ADR directory by number (the number
is all `hasIdPrefix` compares, so the lint stays green).

Files:
- `engine/src/doctrine.js` — `ADR_REF` → `/R-(\d{3,})\b/g` (rename the constant
  `RULING_REF`, helper `adrRefs` → `rulingRefs`); `COUNTER_CASE_ITEM` →
  `/^R-(\d{3,}) — \S/`; message `counter-cases must be none or R-NNN — <why> items`.
  Mind the boundary: `ADR-546` must NOT parse as a citation (`\bR-` — add the `\b`).
- `engine/test/doctrine.test.js` — fixtures and expected messages to `R-` ids; add a RED
  case that an `ADR-` id is no longer read as evidence.
- `engine/test/doctrine-lint-main.test.js` — the `entry()` helper's default Evidence
  `'ADR-546 — why'` → `'R-546 — why'` and every other `ADR-` fixture string to `R-`
  (expected `ADR-NNN does not resolve` messages stay until Part 10).
- `engine/test/doctrine-lint.bin.test.js` — fixture doctrine strings to `R-`.
- `docs/contributing/DOCTRINE.md` — swept by the tested script, never by hand:
  `node engine/bin/rulings-migrate.js cite docs/contributing/DOCTRINE.md`. Acceptance:
  `grep -c 'ADR-[0-9]' docs/contributing/DOCTRINE.md` = 0 and the number of `R-` citations
  equals the 17 lines' ADR citations before the sweep (count before, compare after).

### TDD steps

1. RED `doctrine.test.js`: Given an entry whose Evidence is `R-901`, when parseDoctrine
   runs, then evidence is `['901']` — fails: `ADR_REF` only reads `ADR-`, so evidence is
   empty and the entry errors.
2. RED: an entry whose Evidence is `ADR-901` yields the empty-evidence error, and a
   counter-case `ADR-901 — why` is malformed — fails: today both parse as citations.
3. GREEN: `RULING_REF` with the leading `\b`, `COUNTER_CASE_ITEM`, the message; in the
   same step move the doctrine-lint test fixtures to `R-` ids (they would otherwise go
   red on the parser change).
4. Sweep DOCTRINE.md with `cite`; GUARD:
   `node engine/bin/doctrine-lint.js docs/contributing/DOCTRINE.md docs/contributing/adr` exits 0.

### Gate

```bash
cd engine && node --test test/doctrine.test.js test/doctrine-lint-main.test.js test/doctrine-lint.bin.test.js && cd ..
nice -n 19 bash scripts/ci.sh > "${TMPDIR:-/tmp}/ci-part9.log" 2>&1; echo "ci exit $?"; grep -nE "^not ok|ci: |FAIL" "${TMPDIR:-/tmp}/ci-part9.log" | head -40
```

### Commit

`feat(doctrine): doctrine entries cite ruling ids`

## Part 10 — doctrine-lint resolves against the register

### Context

Design §Doctrine anchor, second half.

Files:
- `engine/src/doctrine-lint-main.js` — usage `usage: doctrine-lint <doctrine-file> <register-file>\n`;
  `missingInput` checks the second argument with `isFile` (a directory is now
  `no such file <arg>`); drop `listDir`, `isDirectory`, `isRegularEntry` deps and
  `ADR_EXTENSION`, `SUPERSEDED_STATUS`, `hasIdPrefix`, `isSuperseded`;
  `citationProblem(id, rulingsById)` → `R-NNN does not resolve` /
  `R-NNN is superseded` (status kind `superseded`; a rejected line resolves);
  `orphanFindings` scans the register's `adopted` bases for `DOCTRINE\(D-(\d+)\)` naming
  no entry, label `<register-arg>:<ruling line>`; OK line
  `doctrine-lint: <n> entries, <m> ruling citations — OK\n`. Parse the register with
  `parseRegister` (engine/src/rulings.js); register parse errors are findings.
  Module header comment reworded.
- `engine/test/doctrine-lint-main.test.js` — deps become `{ cwd, isFile, readFile }`;
  fixtures a register string; new REDs below.
- `engine/test/doctrine-lint.bin.test.js` — spawn with a register file.
- `scripts/static-lints.sh` — `node engine/bin/doctrine-lint.js docs/contributing/DOCTRINE.md docs/contributing/RULINGS.md`.
- `test/static-lints-ci.test.js` — the `doctrine-lint …` id string matches the new line.
- The decisions skill's two `doctrine-lint` calls still say `<adr-dir>` until Part 11
  (prose only; this run executes the main checkout's pre-change skill, so nothing runs
  it in between).

### TDD steps

1. RED: Given a doctrine citing `R-901` and a register with an `R-901` line, when main
   runs, then exit 0 and the OK line names ruling citations — fails: main lists a
   directory.
2. GREEN.
3. RED: an `R-` id with no line → `R-NNN does not resolve`; a superseded line →
   `R-NNN is superseded`; an orphan `Adopted: DOCTRINE(D-9).` basis → finding at the
   register line; a directory as second argument → `no such file`, exit 2 — fails.
4. GREEN, REFACTOR.
5. static-lints.sh + its test; GUARD: the live
   `node engine/bin/doctrine-lint.js docs/contributing/DOCTRINE.md docs/contributing/RULINGS.md` exits 0
   (if a cited ruling is superseded, that is a real doctrine finding: re-point the
   citation to the live tail in DOCTRINE.md in this part, per the decisions skill's rule).

### Gate

```bash
cd engine && node --test test/doctrine-lint-main.test.js test/doctrine-lint.bin.test.js test/doctrine.test.js && cd ..
node --test test/static-lints-ci.test.js
nice -n 19 bash scripts/ci.sh > "${TMPDIR:-/tmp}/ci-part10.log" 2>&1; echo "ci exit $?"; grep -nE "^not ok|ci: |FAIL" "${TMPDIR:-/tmp}/ci-part10.log" | head -40
```

### Commit

`feat(doctrine): doctrine-lint resolves citations against the rulings register`

## Part 11 — The decisions phase writes register lines

### Context

Design §Decisions phase. This edits the shipped skill; it does not affect the running
craft run (the main checkout's skill executes).

Files:
- `skills/decisions/SKILL.md` (104 lines; read whole) — frontmatter description ("captured
  as ADRs" → "recorded as rulings"); Preamble 1 (lines 10–13): probe the register
  (`paths.rulings`, else docs/RULINGS.md; when absent, create it with the
  `REGISTER_HEADER` text of engine/src/rulings.js); next id = last line's id + 1; drop the
  ADR template probe. Preamble 2 (15–20): register writes route through the intention
  port's `record` (for `file`: an append to the register); "the decisions phase is the
  only register writer; it may add paths to a path-less line a settled decision touches".
  Procedure 1 (29, 35, 41–44): trigger (a) "conflicts with an existing ruling — checked
  against the rulings hint on slot 1 — or with a doctrine entry"; trigger (c) "no ruling
  or doctrine entry covers"; both `doctrine-lint` calls (41, 81) pass `<rulings-file>`;
  bases `R-NNN`, `DOCTRINE(D-<n>)` or "no trade-off". 2b (51): Evidence names "the ruling
  this becomes". 3 (58–63): adopted recommendations are still written as lines marked
  `Adopted: <basis>.`. 5 (72–75): author each settled decision as ONE line — statement in
  the phase's own words as a rule, refused list = the options not chosen (` · `
  separated), `Adopted: <basis>.` for an adopted one, paths = the decision's governed
  paths; run `rulings-lint` on the register; commit each as
  `docs(rulings): R-NNN <statement>`, one commit per line. Doctrine write: Evidence names
  `R-NNN`. Supersession obligations (87–100) → **Reversal**, one commit: append R-M;
  append ` Superseded by R-M: <scope>.` to R-N; re-point every `Superseded by R-N` pointer
  to R-M and every doctrine citation of R-N to R-M; emit
  `DECISION-REVERSAL(R-N): <scope> -> R-M`, `<scope>` verbatim from the line. 6 (102–104):
  the fresh designer gets the R-ids and the design-doc path; commit
  `docs(design): revise <slug> against rulings <range>`. Keep every other sentence.
- `test/decisions-doctrine-prose.test.js` — re-pin to the new wording: step-1 adopt bases
  (`R-NNN`), step-5 marker test (`Adopted: <basis>.` instead of the bold marker), the
  step-5 doctrine-write test's `/re-point the citation to the superseding ADR/` → the
  ruling wording, and the "no numbered id" test (~147) also refuses `/R-\d/`. Region
  anchors (`STEP_1` … `STEP_6`) must keep matching — do not renumber the steps.
- `docs/contributing/specs/run-record.md` — lines ~110–118: `DECISION-REVERSAL(R-NNN):
  <what changed> -> R-MMM`, `<what changed>` = the `Superseded by` scope verbatim from the
  register line; drop the sentence contrasting it with `adr-lint` (~118) only if it names
  adr-lint as current behaviour. `DECISION-CITE-WAIVE` stays until Part 19.
- `skills/run/SKILL.md` — token table row ~213 → `DECISION-REVERSAL(R-NNN): <what changed> -> R-MMM`
  emitted by "the `decisions` phase, one line per reversal"; wording at ~10 ("ADRs,
  escalations" → "rulings, escalations"), ~513–516, ~692, ~694 ("ADRs are committed one at
  a time" → "register lines are committed one at a time").
- `test/fold-followups.test.js` — `GREPPABLE_ONLY_TOKENS` entry
  `'DECISION-REVERSAL(ADR-NNN):'` → `'DECISION-REVERSAL(R-NNN):'`.

### TDD steps

1. RED `decisions-doctrine-prose.test.js`: re-pinned assertions (new wording present, old
   ADR wording absent, `/R-\d/` absent) — fails: the skill still says ADR.
2. GREEN: rewrite the skill sections above.
3. RED `fold-followups.test.js`: the R-form token — fails: run SKILL.md and run-record
   still carry the ADR form.
4. GREEN: run-record spec + run skill token row and wording.
5. GUARD `test/decision-tokens.test.js`: still passes (`DECISION-REVERSAL(` is a prefix
   match; CITE-WAIVE untouched).

### Gate

```bash
node --test test/decisions-doctrine-prose.test.js test/fold-followups.test.js test/decision-tokens.test.js
nice -n 19 bash scripts/ci.sh > "${TMPDIR:-/tmp}/ci-part11.log" 2>&1; echo "ci exit $?"; grep -nE "^not ok|ci: |FAIL" "${TMPDIR:-/tmp}/ci-part11.log" | head -40
```

### Commit

`feat(decisions): the decisions phase appends one register line per settled decision`

## Part 12 — Design and planning surfaces name rulings

### Context

Docs/prose part (no engine src). Agent bodies are mirrored into six adapters: after
editing agents/*.md run `bash scripts/sync-adapter-agents.sh --write` and stage the
regenerated mirrors (adapters/{aider,antigravity,codex,copilot,cursor,opencode}/agents/
craft-planner.md and craft-designer.md); `--check` runs in static-lints.

Files:
- `skills/planning/SKILL.md` — line 27: "+ the accepted ADR paths" → "+ the R-ids of the
  rulings this run's decisions phase appended (the rulings hint carries the rest)"; line
  54: "An ADR commit is not rejected here" → "A rulings commit is not rejected here".
- `agents/planner.md` — line 9 "accepted ADR paths" → "the R-ids this run appended";
  line 43 "every ADR consequence the design commits to" → "every ruling the design commits
  to".
- `agents/designer.md` — line 15 "existing design docs, ADRs" → "existing design docs, the
  rulings hint and DOCTRINE.md".
- `templates/design.md` — lines 9, 24–27: "ADRs" → "rulings"; "the ADR phase" → "the
  decisions phase".
- `templates/plan.md` — line 3 → `> Source: design doc \`<path>\` · Rulings \`<R-ids or none>\``.
- `skills/design/SKILL.md` — line 3 description "for the ADR conversation" → "for the
  decisions phase".

### TDD steps

1. Edits above, then sync the mirrors.
2. GUARD: `bash scripts/sync-adapter-agents.sh --check` exits 0; `bash scripts/design-lint.sh templates/design.md` exits 0;
   `bash scripts/plan-lint.sh docs/contributing/plan/doctrine-register.md` exits 0
   (template header change does not touch the part schema). A test that pins the old
   wording goes red in ci: re-pin it in this part (none was found by
   `grep -rln "accepted ADR\|ADR conversation\|pre-decided by existing ADRs" test engine/test`).

### Gate

```bash
bash scripts/sync-adapter-agents.sh --check
nice -n 19 bash scripts/ci.sh > "${TMPDIR:-/tmp}/ci-part12.log" 2>&1; echo "ci exit $?"; grep -nE "^not ok|ci: |FAIL" "${TMPDIR:-/tmp}/ci-part12.log" | head -40
```

### Commit

`docs(skills): design and planning surfaces read rulings instead of ADRs`

## Part 13 — PR body splits ratified from adopted rulings

### Context

Design §Context row "PR Decisions line". Prose part.

Files:
- `templates/pr-body.md` — line 35 →
  `- **Decisions:** <ratified: R-### …; adopted: R-### (R-NNN | DOCTRINE(D-n) | no trade-off) …; or none>`.
- `skills/documentation/SKILL.md` — lines ~68–74: the split is read from the register
  lines this run appended (`git diff <base>...HEAD -- <rulings-file>`): a line with an
  `Adopted: <basis>.` segment is adopted, listed `R-NNN (<basis>)`; the others are
  ratified; the trailer carries R-ids, not ADR numbers.
- `test/decisions-pr-body-prose.test.js` — both tests re-pinned to the register wording
  (`Adopted:` segment, `R-###`).

### TDD steps

1. RED: re-pinned assertions — fail: template and skill still name ADRs and the bold
   marker.
2. GREEN: template + skill edits.

### Gate

```bash
node --test test/decisions-pr-body-prose.test.js
nice -n 19 bash scripts/ci.sh > "${TMPDIR:-/tmp}/ci-part13.log" 2>&1; echo "ci exit $?"; grep -nE "^not ok|ci: |FAIL" "${TMPDIR:-/tmp}/ci-part13.log" | head -40
```

### Commit

`docs(documentation): the PR decisions line reads adopted rulings from the register`

## Part 14 — Live-tier citation sweep and guides

### Context

Design §What happens to the rest (ADR ids row, guides rows). One mechanical sweep run by
the tested script, plus the hand edits it cannot do. Docs-only.

Sweep (do not hand-edit what it rewrites):

```bash
/usr/bin/git ls-files -z -- BACKLOG.md 'docs/contributing/specs/*.md' 'docs/guides/*.md' 'skills/**/*.md' 'agents/*.md' 'templates/*.md' 'examples/**' 'evals/**' ':!evals/*/fixture/docs/adr/**' README.md CONTRIBUTING.md docs/contributing/README.md .claude/workflow.md | xargs -0 node engine/bin/rulings-migrate.js cite > "${TMPDIR:-/tmp}/cite.txt"
```

Expected rewrites (measured before planning): BACKLOG.md 130 id lines + 2 bare paths;
specs policy, memory, telemetry, run-record (incl. the bare path at :254), gate; skills
run, integrate, propose, documentation, workspace, validation, review, architecture;
examples/loop/README.md, examples/requirements/workflow.md,
examples/architecture/workflow.md; docs/guides/customizing.md; the eval fixture
DOCTRINE.md, shout-flag.md design docs and planning-plan-lints prompt.md. If agents/*.md
changed, re-sync the mirrors (Part 12 command). The eval fixture ADR files are excluded
on purpose: Parts 16–17 feed them to the migrator, which must see their original
`ADR-` status lines. Acceptance:
`git grep -nE 'ADR-[0-9]{3}|adr/[0-9]{3}-' -- <same pathspecs>` prints nothing; the
`R-` count per file equals its `ADR-` count before the sweep (record before/after counts
in TMPDIR).

Hand edits (Files):
- `BACKLOG.md` — line 9 SoT pointer docs/contributing/adr/ → docs/contributing/RULINGS.md
  (intention-lint resolves it; the sweep does not touch directory pointers); line 163
  "and docs/contributing/adr/" → "and docs/contributing/RULINGS.md". Other BACKLOG
  mentions of adr-lint or ADR paths are item history (done-item text) and stay.
- `docs/guides/concepts.md` — lines 57, 83, 87, 160, 174: ADR wording → rulings;
  `adr-lint` → `rulings-lint`; the intention-port row (87) loses the governing lane.
- `docs/guides/customizing.md` — line 10 link ../contributing/adr/ →
  ../contributing/RULINGS.md "(rulings)"; document `paths.rulings` beside the other
  `paths.*` keys (default docs/RULINGS.md). The `adr.frozen` section (~188) stays until
  Part 20.
- `CONTRIBUTING.md` — line 35 docs/contributing/adr/ → the register.
- `docs/contributing/README.md` — line 21 `paths.adr` → `paths.rulings`.

### TDD steps

1. Record before-counts; run the sweep; acceptance greps.
2. Hand edits.
3. GUARD: `node engine/bin/intention-lint.js $(bash scripts/living-corpus.sh)` exits 0
   (BACKLOG pointer resolves); `bash scripts/backlog-lint.sh BACKLOG.md` exits 0;
   `bash scripts/adr-lint.sh docs/contributing/adr` exits 0 (fewer citations only).

### Gate

```bash
nice -n 19 bash scripts/ci.sh > "${TMPDIR:-/tmp}/ci-part14.log" 2>&1; echo "ci exit $?"; grep -nE "^not ok|ci: |FAIL" "${TMPDIR:-/tmp}/ci-part14.log" | head -40
```

### Commit

`docs: cite ruling ids across the live tier and point guides at the register`

## Part 15 — README counts rulings

### Context

Design §What happens to the rest (README row). readme-drift today counts .md files in
directory-target links only (engine/src/readme-regions.js `CORPUS_CLAIM`, ~line 33;
engine/src/readme-drift-main.js `corpusCountFindings`, ~line 119).

Files:
- `engine/src/readme-regions.js` — add `rulingsClaims: Array<{file, claimed}>` to
  `extractReadmeRegions`: a counted link whose label opens with a count and whose target
  ends RULINGS.md (`/\[(\d+)\s[^\]]*\]\(([^)\s]*RULINGS\.md)\)/g`). Other file targets
  stay non-claims (the existing test "a counted link that targets a file rather than a
  directory … is not read as a corpus claim" keeps passing).
- `engine/src/readme-drift-main.js` — a `rulings-counts` guarded surface: count =
  `parseRegister(readFile(join(root, file))).rulings.length`; finding
  `rulings-counts: <file> claims <n>, register holds <m>`.
- `engine/test/readme-regions.test.js`, `engine/test/readme-drift-main.test.js` — new cases.
- `README.md` — line 228 `[742 ADRs](docs/contributing/adr/)` →
  `[<n> rulings](docs/contributing/RULINGS.md)` with n = `grep -c '^- R-' docs/contributing/RULINGS.md`;
  lines 47, 79, 113 reworded from ADRs to rulings; line 318 table row → the register file,
  "rulings register". test/readme-drift.test.js runs the live check.

### TDD steps

1. RED `readme-regions.test.js`: a `[3 rulings](docs/contributing/RULINGS.md)` link is a
   rulings claim — fails: no `rulingsClaims` key.
2. GREEN.
3. RED `readme-drift-main.test.js`: a claim that matches the register → no finding; off by
   one → finding naming both counts — fails: surface absent.
4. GREEN.
5. README edits. GUARD: `node --test test/readme-drift.test.js` passes on the live tree.

### Gate

```bash
cd engine && node --test test/readme-regions.test.js test/readme-drift-main.test.js && cd ..
node --test test/readme-drift.test.js
nice -n 19 bash scripts/ci.sh > "${TMPDIR:-/tmp}/ci-part15.log" 2>&1; echo "ci exit $?"; grep -nE "^not ok|ci: |FAIL" "${TMPDIR:-/tmp}/ci-part15.log" | head -40
```

### Commit

`feat(readme-drift): the README rulings count is checked against the register`

## Part 16 — Eval fixtures: adopts-covered-tradeoff and escalates-fork

### Context

Test-infra-only part (evals are local, never CI; the maintainer re-runs them by hand).
Part 14's sweep already rewrote the fixture DOCTRINE.md and shout-flag.md citations to
`R-` ids. Build each fixture register with the shipped migrator, never by hand:
`node engine/bin/rulings-migrate.js register evals/<case>/fixture/docs/adr > evals/<case>/fixture/docs/RULINGS.md`,
then delete the fixture's docs/adr/ directory (plain deletion; its files are not part of
this part's edit list). The fixture ADR files are small test inputs, not the craft
corpus: if the migrator refuses one (a suspect), read that fixture file and pass a
`--chosen` table written to TMPDIR. Grader frontmatter fields in use: `type: regex`,
`target: trace`, `match: not_contains`, `arm: both|with-only` (see
evals/decisions-adopts-covered-tradeoff/graders/noop-token.md).

Files:
- `evals/decisions-adopts-covered-tradeoff/fixture/docs/RULINGS.md` (new, R-001, R-002).
- `evals/decisions-adopts-covered-tradeoff/graders/ruling-authored.md` (new; replaces
  graders/adr-authored.md, deleted): `type: regex`, `target: trace`, `arm: both`,
  pattern `- R-003 \[`.
- `evals/decisions-escalates-fork/fixture/docs/RULINGS.md` (new, R-001).
- `evals/decisions-escalates-fork/graders/no-ruling.md` (new; replaces graders/no-adr.md,
  deleted): `type: regex`, `target: trace`, `match: not_contains`, `arm: both`, pattern
  `- R-002 \[` (no line written before the user rules).

### TDD steps

1. Generate both registers; `node engine/bin/rulings-lint.js <each>` exits 0.
2. Graders; delete the replaced graders and fixture docs/adr/ directories.
3. GUARD: `git grep -n 'docs/adr' -- evals/decisions-adopts-covered-tradeoff evals/decisions-escalates-fork` prints nothing.

### Gate

```bash
node engine/bin/rulings-lint.js evals/decisions-adopts-covered-tradeoff/fixture/docs/RULINGS.md
node engine/bin/rulings-lint.js evals/decisions-escalates-fork/fixture/docs/RULINGS.md
nice -n 19 bash scripts/ci.sh > "${TMPDIR:-/tmp}/ci-part16.log" 2>&1; echo "ci exit $?"; grep -nE "^not ok|ci: |FAIL" "${TMPDIR:-/tmp}/ci-part16.log" | head -40
```

### Commit

`test(evals): decisions evals read a rulings register instead of ADR files`

## Part 17 — Eval fixtures: noop-when-clear and planning-plan-lints

### Context

Same method as Part 16 (migrator-built register, fixture docs/adr/ deleted).

Files:
- `evals/decisions-noop-when-clear/fixture/docs/RULINGS.md` (new, R-001).
- `evals/decisions-noop-when-clear/graders/ruling-authored.md` (new; replaces
  graders/adr-authored.md): `type: regex`, `target: trace`, `arm: both`, pattern
  `- R-002 \[[^\]]*\] .*Adopted: ` (the adopted candidate is still written as a line).
- `evals/decisions-noop-when-clear/graders/no-escalation.md` — "names
  docs/adr/001-greet-stays-bash-3-portable.md (or ADR 001)" → "names R-001".
- `evals/planning-plan-lints/fixture/docs/RULINGS.md` (new, R-001).
- `evals/planning-plan-lints/prompt.md` — after Part 14 the decision reads `R-001`; make
  the sentence name the ruling in docs/RULINGS.md.

### TDD steps

1. Registers (rulings-lint exits 0 on each), graders, prompt; delete replaced files.
2. GUARD: `git grep -n 'docs/adr\|ADR 00' -- evals/` prints nothing.

### Gate

```bash
node engine/bin/rulings-lint.js evals/decisions-noop-when-clear/fixture/docs/RULINGS.md
node engine/bin/rulings-lint.js evals/planning-plan-lints/fixture/docs/RULINGS.md
nice -n 19 bash scripts/ci.sh > "${TMPDIR:-/tmp}/ci-part17.log" 2>&1; echo "ci exit $?"; grep -nE "^not ok|ci: |FAIL" "${TMPDIR:-/tmp}/ci-part17.log" | head -40
```

### Commit

`test(evals): noop and planning evals read a rulings register`

## Part 18 — Retire adr-lint

### Context

Design §What happens to the rest (`adr-lint` row) and candidate #6 (ADR-735).

Delete (plain list, deletions only): engine/src/adr-lint-main.js, engine/bin/adr-lint.js,
scripts/adr-lint.sh, engine/test/adr-lint-main.test.js, engine/test/adr-lint.bin.test.js,
test/adr-lint-ci.test.js.

Files:
- `scripts/ci.sh` — remove `run_adr_lint` (lines ~130–166, its comment block) and its
  call (last line). Keep `run_stub_lint`/`run_prose_lint`.
- `engine/test/bin-entry-symlink.bin.test.js` — lines 44–51: representative bin
  adr-lint.js → rulings-lint.js; the loud argv is a nonexistent register file (exit
  2, `rulings-lint: no such file …` — Part 2 contract); titles reworded.
- `engine/test/bin-entry-swap-race.bin.test.js` — header comment, `BIN_NAME`
  (`'rulings-lint.js'`), `SWAP_TRIGGER` (`'/engine/src/rulings-lint-main.js'`), the decoy
  name, the two titles (~62, ~72).
- `test/hermetic-suite.test.js` — drop engine/test/adr-lint-main.test.js from both lists
  (~41, ~78); nothing replaces it (rulings-lint resolves no defaults from cwd/HOME).
- `test/decision-tokens.test.js` — drop `ADR_LINT_MAIN_PATH` and the test at ~56.

### TDD steps

1. Retarget the two bin-entry tests (they stay green against the live rulings-lint bin —
   GUARD, the shim shape is identical).
2. Delete the files and the ci.sh function; drop the hermetic and token pins.
3. GUARD: `git grep -n 'adr-lint' -- engine scripts test hooks` prints nothing (Part 1
   already reworded the source-hygiene comment; a leftover mention found here is fixed in
   this part).

### Gate

```bash
cd engine && node --test test/bin-entry-symlink.bin.test.js test/bin-entry-swap-race.bin.test.js && cd ..
node --test test/hermetic-suite.test.js test/decision-tokens.test.js
nice -n 19 bash scripts/ci.sh > "${TMPDIR:-/tmp}/ci-part18.log" 2>&1; echo "ci exit $?"; grep -nE "^not ok|ci: |FAIL" "${TMPDIR:-/tmp}/ci-part18.log" | head -40
```

### Commit

`refactor!: retire adr-lint and its whole-tree citation sweep`

## Part 19 — Retire DECISION-CITE-WAIVE

### Context

Design §What happens to the rest (`DECISION-CITE-WAIVE` row); its only reader went in
Part 18.

Files:
- `docs/contributing/specs/run-record.md` — remove the `DECISION-CITE-WAIVE(<file>):
  <reason>` entry (~120) and any sentence pointing at it.
- `skills/run/SKILL.md` — remove the token table row (~214).
- `test/decision-tokens.test.js` — `NEW_TOKENS` loses `'DECISION-CITE-WAIVE('`.
- `test/fold-followups.test.js` — `GREPPABLE_ONLY_TOKENS` loses
  `'DECISION-CITE-WAIVE(<file>):'`.

### TDD steps

1. RED `decision-tokens.test.js`: add a case that the run skill and the run-record spec
   no longer name `DECISION-CITE-WAIVE(` — fails: both still do.
2. GREEN: remove the prose; update `NEW_TOKENS` and `GREPPABLE_ONLY_TOKENS`.
3. GUARD: `git grep -n 'DECISION-CITE-WAIVE' -- skills docs/contributing/specs docs/guides engine scripts test` prints nothing.

### Gate

```bash
node --test test/decision-tokens.test.js test/fold-followups.test.js
nice -n 19 bash scripts/ci.sh > "${TMPDIR:-/tmp}/ci-part19.log" 2>&1; echo "ci exit $?"; grep -nE "^not ok|ci: |FAIL" "${TMPDIR:-/tmp}/ci-part19.log" | head -40
```

### Commit

`refactor!: retire the DECISION-CITE-WAIVE token`

## Part 20 — Retire the adr manifest key

### Context

Design §What happens to the rest (`adr` manifest key row), candidate P3.

Files:
- `engine/src/manifest.js` — delete `validateAdr` (~389–405), the frozen-set helpers and
  errors (~410–425: `FROZEN_SET_WHOLE_TREE_ERROR`, `FROZEN_EVERY_MARKDOWN_ERROR`, the
  universal-glob check), the `case 'adr':` branch (~642), and the glob.js import of the
  probe helpers (line 12). After this a manifest with `adr:` is an unknown top-level key.
- `engine/src/manifest-vocabulary.js` — `TOP_KEYS` (line 10) loses `'adr'`.
- `engine/test/manifest.test.js` — delete the `adr` / `adr.frozen` cases; add one RED: a
  manifest with `adr: { frozen: [] }` is rejected as an unknown key.
- `engine/src/glob.js` — delete `PROBE_PATHS`, `matchesEveryPath`,
  `MARKDOWN_PROBE_PATHS`, `coversEveryPath` (no caller left — verify with
  `git grep -n 'PROBE_PATHS\|matchesEveryPath\|coversEveryPath' -- engine adapters`
  showing only glob.js and its test). `matchGlob`, `globsOverlap` stay.
- `engine/test/glob.test.js` — delete the `coversEveryPath`/`matchesEveryPath` cases
  (~94–155) and their imports.
- `docs/guides/customizing.md` — delete the `#### \`adr.frozen\` …` section (~188–200).

### TDD steps

1. RED `manifest.test.js`: Given a manifest with an `adr` key, when validated, then an
   unknown-key error — fails: `adr` is a known key.
2. GREEN: vocabulary + manifest.js removals; delete obsolete cases.
3. Dead-code removal in glob.js with its tests (GUARD: remaining glob tests pass).
4. Guide section removal. GUARD: `node --test test/readme-drift.test.js` (README yaml
   snippet holds no `adr` key).

### Gate

```bash
cd engine && node --test test/manifest.test.js test/glob.test.js test/manifest-lint-main.test.js && cd ..
nice -n 19 bash scripts/ci.sh > "${TMPDIR:-/tmp}/ci-part20.log" 2>&1; echo "ci exit $?"; grep -nE "^not ok|ci: |FAIL" "${TMPDIR:-/tmp}/ci-part20.log" | head -40
```

### Commit

`refactor!: remove the adr manifest key and its frozen-set checks`

## Part 21 — Delete the ADR corpus

### Context

Design candidate #2 (ADR-731) and the breaking-change entry (ADR-740). First, if any ADR
file was added after Part 6 (`/usr/bin/git log --format=%h <part-6-sha>..HEAD -- docs/contributing/adr`
lists a commit other than none), re-run the Part 6 generation command and commit the
regenerated register in this part before deleting.

Delete (plain list): docs/contributing/adr/ (the whole directory), templates/adr.md,
docs/contributing/rulings-chosen.json.

Files:
- `.claude/workflow.md` — remove `paths.adr`.
- `scripts/ci.sh` — `run_prose_lint` exclusion drops the docs/contributing/adr/* pattern.
- `test/docs-history.test.js` — line 18: drop the ADR representative pair (its tree no
  longer exists); keep the other representatives.
- `docs/contributing/lessons/005-readme-drift-counts-untracked-docs.md` — `subjects` loses
  docs/contributing/adr/*.md (keep the other four); the body's example of an untracked
  counted file (line ~36) names docs/contributing/plan/*.md instead (still a counted
  corpus). Nothing else changes; lesson-lint must stay green.
- `CHANGELOG.md` — Unreleased, a **Breaking** entry: decision memory is DOCTRINE.md plus a
  rulings register (`paths.rulings`, default docs/RULINGS.md); the ADR directory,
  templates/adr.md, `paths.adr`, the `adr` manifest key (`adr.frozen`), `adr-lint` and
  `DECISION-CITE-WAIVE` are gone; `doctrine-lint` takes the register file; consumers
  migrate once with `rulings-migrate register <adr-dir> [--chosen <json>]` then
  `rulings-migrate cite <files>`. Follow the file's existing entry format.

Acceptance (R7): `git grep -lE 'contributing/adr|docs/adr|templates/adr|paths\.adr|adr-lint|adr\.frozen|DECISION-CITE-WAIVE' -- . ':!docs/contributing/design' ':!docs/contributing/plan' ':!docs/contributing/archive' ':!docs/contributing/prd' ':!CHANGELOG.md' ':!docs/contributing/RULINGS.md' ':!BACKLOG.md' ':!engine/test/intention-lint-main.test.js'`
prints nothing. Excluded on purpose: the register's statements and BACKLOG's done-item
text quote retired surfaces as history; intention-lint-main.test.js uses docs/adr/ as a
synthetic SoT-pointer string in fixtures. Separately, `sed -n 9p BACKLOG.md` names
docs/contributing/RULINGS.md. `node engine/bin/rulings-lint.js docs/contributing/RULINGS.md` and the
live doctrine-lint still exit 0; README rulings claim unchanged.

### TDD steps

1. Regenerate the register if needed (above).
2. GUARD `test/docs-history.test.js`: passes after the edit (the edit only removes the
   representative pair whose tree this part deletes; the other pairs are untouched).
3. Deletions, manifest path, ci.sh exclusion, lesson subjects, CHANGELOG.
4. Acceptance grep.

### Gate

```bash
node --test test/docs-history.test.js test/readme-drift.test.js
nice -n 19 bash scripts/ci.sh > "${TMPDIR:-/tmp}/ci-part21.log" 2>&1; echo "ci exit $?"; grep -nE "^not ok|ci: |FAIL" "${TMPDIR:-/tmp}/ci-part21.log" | head -40
```

### Commit

`refactor!: delete the ADR corpus now that the rulings register replaces it`

## Evals the maintainer re-runs by hand (never CI)

- decisions-adopts-covered-tradeoff (Part 16)
- decisions-escalates-fork (Part 16)
- decisions-noop-when-clear (Part 17)
- planning-plan-lints (Part 17)

The other seven cases touch no decision memory and need no re-run.
