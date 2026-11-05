# Plan — decisions-doctrine-layer

> Source: design doc `docs/contributing/design/decisions-doctrine-layer.md` · ADRs 721–729
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

## Shared ground (every part reads this first)

- Already landed, never re-plan: ADR 721–729 are committed. ADR-727 already superseded
  ADR-433 (status flip, BACKLOG.md rewrite, README ADR count 729, DECISION-REVERSAL token).
  No part touches docs/contributing/adr/ or BACKLOG.md.
- Part order is load-bearing: Part 1 (parser) → Part 2 (lint bin) → Part 3 (seed file + gate
  wiring in ONE commit) → Part 4 (decisions skill) → Part 5 (PR body) → Part 6 (eval + docs).
  Parts share one working tree and build on each other.
- Conventions (binding): node:test, Given/When/Then titles, AAA body, the value under test
  bound to `sut`; named constants, early returns, functions ≤20 lines, nesting ≤2; no
  provenance refs (ADR/phase/backlog numbers, design slug) in any source, test or shipped
  prose file; no suppression directives; no swallowed errors.
- engine/ is ESM (`import`), its tests live in engine/test/ and use
  engine/test-helpers/capture-io.js `makeCaptureIo()` (io with `stdout.joined()` /
  `stderr.joined()`). Repo-root test/ is CommonJS (`'use strict'; require(...)`) and uses
  test/helpers/region-slice.js `{ FROM_TOP, TO_END, sliceProse, sliceRegion }`
  (`sliceProse(text, startRegExp|FROM_TOP, endRegExp|TO_END)` returns the region with
  whitespace collapsed; it asserts if a boundary heading is missing).
- No test file anywhere may contain the substring `evals/` or `plugin eval`
  (test/plugin-evals-local-only.test.js scans every *.test.js). Eval fixtures are verified
  by shell commands in the Gate, never by a test.
- Mutation testing (Stryker, validation phase) covers engine/src/**/*.js with no config
  change. Write engine code mutation-tight: every literal a named constant, every branch
  observable by a test. Do not run Stryker in a part.
- Commits: plain `/usr/bin/git add <explicit paths>` then `/usr/bin/git commit -m "<msg>"`
  (rtk rewrites `git`, and the worktree guard refuses the rewrite). Never `commit -am`.
- Gate: `bash scripts/ci.sh` piped to a file, read back with grep; never printed whole.

## Decision candidates (plan-level refinements; the parts follow the recommendation)

| # | Choice | Alternatives | Recommendation | Why |
|---|---|---|---|---|
| 1 | Seed ids when the verification drops an entry | (a) keep the tabled ids, gaps allowed; (b) renumber contiguously | **(a)** | The batch ratification names D-1…D-14 as tabled; keeping ids keeps the drop list traceable. The lint requires increasing and unique ids, not contiguous ones. |
| 2 | Parser error shape | (a) `{ line, message }` objects, the main prefixes `<file>:<line>:`; (b) pre-formatted strings | **(a)** | Every finding then carries a uniform `<file>:<line>:` locator; the parser stays I/O-free and file-agnostic. |
| 3 | Counter-cases shape check | (a) the bullet is `none` or holds at least one `ADR-NNN`; (b) any non-empty text | **(a)** | The entry schema states `none` or `ADR-NNN — <why>` items; a free-text counter-case would escape the live-citation check. |
| 4 | Finding stream | (a) stdout, `doctrine-lint:` prefix, usage on stderr; (b) stderr like lesson-lint | **(a)** | The design's check table states stdout. |

## Part 1 — doctrine parser

### Context

Create a pure parser module and its unit suite. No I/O, no throws, no imports.

Files:
- `engine/src/doctrine.js` (new) — exports `parseDoctrine(content) → { entries, errors }`.
- `engine/test/doctrine.test.js` (new) — ESM, `import { parseDoctrine } from '../src/doctrine.js'`.

Read-only precedent: engine/src/lesson.js (line 28 `CODE_FENCE = /^\s*(```|~~~)/`, toggled
per line at :144 — copy that fence state; do not import it, it is not exported);
engine/test/lesson.test.js for test style.

Contract to implement (exact):

- Constants (module-private unless noted): `ENTRY_HEADING = /^## D-(\d+) — (.+)$/` (the
  dash is U+2014 EM DASH with one space each side); `SECTION_HEADING_PREFIX = '## '`;
  exported `DOCTRINE_BULLETS = Object.freeze(['Trigger', 'Rule', 'Evidence', 'Counter-cases'])`;
  `BULLET = /^- \*\*([^*]+):\*\*(.*)$/`; `ADR_REF = /ADR-(\d{3})\b/g` (so `ADR-12` and
  `ADR-1234` do not match); `NO_COUNTER_CASES = 'none'`; `CODE_FENCE` as in lesson.js.
- Return shape: `entries: [{ id: number, title, trigger, rule, evidence: string[],
  counterCases: string[], line: number }]` where `evidence`/`counterCases` hold the 3-digit
  ADR numbers as strings (`'564'`), in text order, and `line` is the 1-based heading line.
  `errors: [{ line: number, message: string }]`.
- Scan lines outside code fences. A line starting with `## ` that does not match
  `ENTRY_HEADING` → error `heading must be "## D-<n> — <title>"` at that line; its body is
  skipped. `#` H1 and prose before the first entry are allowed.
- Entry body = the non-blank lines after the heading up to the next `## ` line (outside a
  fence) or EOF. It must be exactly four `BULLET` lines whose labels equal
  `DOCTRINE_BULLETS` in order and whose values are non-empty after trim; else error
  `D-<n>: bullets must be exactly, in order: Trigger, Rule, Evidence, Counter-cases`
  (at the heading line) and the entry is not returned.
- Ids: an id already seen → `duplicate id D-<n>`; an id lower than the previous entry's →
  `D-<n> out of order`. Gaps are allowed. Both at the heading line.
- Evidence with zero `ADR_REF` matches → `D-<n>: evidence is empty`.
- Counter-cases: value `none` → `[]`; otherwise its refs; zero refs →
  `D-<n>: counter-cases must be none or ADR-NNN — <why> items`.
- Public-surface decision: INTERNAL. `parseDoctrine` and `DOCTRINE_BULLETS` are engine-module
  exports consumed only by Part 2's lint main; no barrel, registry or doc surface to update.

### TDD steps

1. RED — `Given a one-entry doctrine, when parsed, then the entry carries id, title, the four bullet values, evidence ids and its heading line` — fails: module `../src/doctrine.js` not found.
   Add in the same cycle: multi-entry file returns entries in order; `Counter-cases: none` → `[]`; `ADR-546 — why; ADR-551 — why` → `['546','551']`; `ADR-12` and `ADR-1234` in Evidence are not ids.
2. GREEN — implement the line scan, heading match, bullet capture and `ADR_REF` extraction.
3. RED — `Given a heading without the em dash (or a non-integer id), when parsed, then it reports "heading must be" at that line and returns no entry` — fails: GREEN 2 ignores non-matching `## ` lines, `errors` is empty.
   Same cycle: `Given duplicate ids` → `duplicate id D-2`; `Given D-3 after D-5` → `D-3 out of order`; `Given D-1 then D-4`, no error (gaps allowed).
4. GREEN — heading error path and id tracking (seen set + previous id).
5. RED — `Given an entry with a missing / reordered / empty / extra bullet, when parsed, then it reports the bullets-in-order error and drops the entry` (one test per variant) — fails: GREEN 2 takes any bullets it finds.
6. GREEN — exact four-bullet check.
7. RED — `Given Evidence with no ADR id, when parsed, then it reports "evidence is empty"` and `Given Counter-cases holding free text, when parsed, then it reports the counter-cases shape error` — fails: no such check yet.
8. GREEN — the two reference checks.
9. RED — `Given an entry heading inside a fenced code block, when parsed, then it is not an entry and raises no error` (cover both ``` and ~~~) — fails: the scan does not track fences.
10. GREEN — fence state toggled by `CODE_FENCE`.
11. REFACTOR — functions ≤20 lines, every literal a named constant, early returns; rerun the suite.

### Gate

```bash
cd engine && node --test test/doctrine.test.js > "${TMPDIR:-/tmp}/craft-part1-unit.log" 2>&1; echo "exit=$?"; grep -E "^# (pass|fail)" "${TMPDIR:-/tmp}/craft-part1-unit.log"
bash scripts/ci.sh > "${TMPDIR:-/tmp}/craft-ci-part1.log" 2>&1; echo "exit=$?"; grep -E "^not ok|^ci: |# fail [1-9]" "${TMPDIR:-/tmp}/craft-ci-part1.log" | head -20
```

### Commit

`feat(engine): parse doctrine entries`

## Part 2 — doctrine-lint bin

### Context

Create the lint main, its bin shim and both suites. Part 1's `parseDoctrine` exists.

Files:
- `engine/src/doctrine-lint-main.js` (new) — `export function main(argv, io, deps = {}) → number`.
- `engine/bin/doctrine-lint.js` (new) — copy engine/bin/lesson-lint.js verbatim with the
  import swapped to `../src/doctrine-lint-main.js` (6 lines, `isEntryPoint(import.meta)` guard).
- `engine/test/doctrine-lint-main.test.js` (new) — in-memory deps, `makeCaptureIo()`.
- `engine/test/doctrine-lint.bin.test.js` (new) — mirror engine/test/lesson-lint.bin.test.js
  (mkdtemp root, spawnSync `process.execPath`, cleanup in `finally`, the "imported as a
  module, main does not run" test).

Read-only precedent: engine/src/lesson-lint-main.js (`EXIT_OK = 0`, `EXIT_INVALID = 2`,
`USAGE`, `DEFAULT_DEPS`, `main` resolving `{ ...DEFAULT_DEPS, ...deps }` and paths via
`resolve(deps.cwd(), argv[i])`); engine/src/cli-io.js exports `isDirectoryPath`,
`isRegularFile`, `isEntryPoint`; engine/src/adr-lint-main.js `checkC1` (target resolution
by `fileName.startsWith(\`${id}-\`)`, Status compared on `line.trim()`).

Contract (exact):
- `DEFAULT_DEPS = { readFile: (p) => readFileSync(p, 'utf8'), listDir: readdirSync,
  isFile: isRegularFile, isDirectory: isDirectoryPath, cwd: () => process.cwd() }`.
- Usage: `argv.length !== 2` → stderr `usage: doctrine-lint <doctrine-file> <adr-dir>\n`, exit 2.
- Doctrine file absent (not a regular file) → stdout `doctrine-lint: no such file <argv0>\n`,
  exit 2. ADR dir absent → stdout `doctrine-lint: no such directory <argv1>\n`, exit 2.
- Every finding is one stdout line `doctrine-lint: <label>: <message>\n`; all findings are
  collected, then exit 2 if any.
  - Parser errors: label `<argv0>:<line>`.
  - L3, per entry, per id in `evidence` then `counterCases`: ADR names = `listDir(adrDir)`
    filtered to `.md`, sorted. Matches = names starting with `<id>-`. `matches.length !== 1`
    → `D-<n>: ADR-<id> does not resolve`; the single match whose content has a line with
    `trim()` starting `- **Status:** superseded` → `D-<n>: ADR-<id> is superseded`.
    Label `<argv0>:<entry.line>`. Only the Status line is read; ADR bodies are not parsed.
  - L4: every ADR file's content scanned with `DOCTRINE_CITATION = /DOCTRINE\(D-(\d+)\)/g`
    (digits only, so the prose placeholder `DOCTRINE(D-n)` / `DOCTRINE(D-<n>)` is ignored;
    fences are NOT skipped). An id with no entry → label `<argv1>/<name>`, message
    `DOCTRINE(D-<n>) names no entry`.
- Clean → stdout `doctrine-lint: <k> entries, <m> ADR citations — OK\n`, exit 0, where `k` =
  entries returned, `m` = total ids checked by L3 (evidence + counter-cases, duplicates counted).
- Public-surface decision: PUBLIC CLI (a plugin-shipped bin, invoked by the decisions skill
  through the `${CRAFT_ROOT:-${CLAUDE_PLUGIN_ROOT}}/engine/bin/` shim in Part 4, and by
  scripts/static-lints.sh in Part 3). Surface gates it meets: engine/test/bin-entry-symlink.bin.test.js
  auto-enumerates engine/bin/*.js and spawns each with bad input expecting non-zero exit or
  output (no-arg usage → exit 2 satisfies it, no edit needed); the static-lints wiring,
  test/static-lints-ci.test.js stub list and the doc surfaces are Part 3/6 work, NOT this part
  (never wire a gate to an absent file). The engine package has no `bin` field or barrel.

### TDD steps

1. RED — `Given no arguments (and given three), when main runs, then it writes the usage line to stderr and returns 2` — fails: module not found.
   Same cycle: absent doctrine file → `no such file`, 2; absent ADR dir → `no such directory`, 2.
2. GREEN — argv and existence checks with injected `isFile` / `isDirectory`.
3. RED — `Given a valid two-entry doctrine citing live ADRs, when main runs, then it prints "doctrine-lint: 2 entries, <m> ADR citations — OK" and returns 0` and `Given a doctrine with a malformed heading, when main runs, then it prints "<file>:<line>: heading must be…" and returns 2` — fails: GREEN 2 never parses.
4. GREEN — parse, format parser errors, OK line.
5. RED — L3: `Given an evidence id with no ADR file` → `does not resolve`; `Given two files sharing the prefix 007-` → `does not resolve`; `Given a cited file whose Status is "superseded by ADR-009"` → `is superseded`; `Given a counter-case id that is superseded` → `is superseded` — fails: no resolution yet (exit 0).
6. GREEN — resolution and Status check.
7. RED — L4: `Given an ADR holding DOCTRINE(D-9) and no D-9 entry, when main runs, then it prints "<adr-dir>/<name>: DOCTRINE(D-9) names no entry" and returns 2`; `Given DOCTRINE(D-1) inside a fenced block of an ADR and no D-1 entry` → still a finding — fails: no ADR content scan, exit 0.
8. GREEN — the citation scan. Then GUARD — `Given an ADR holding only the placeholder DOCTRINE(D-n), when main runs, then it reports nothing and returns 0` (passes: the citation regex takes digits only).
9. RED — bin suite: `Given a valid doctrine and ADR dir, when the bin is spawned, then it exits 0 with the OK line`; `Given an invalid doctrine, then it exits 2`; `Given the bin imported as a module, then main does not run` — fails: engine/bin/doctrine-lint.js does not exist.
10. GREEN — the shim.
11. REFACTOR — split `main` into small helpers (`resolveCitations`, `citationFindings`, `formatFinding`), named constants for every message stem; rerun both suites.

### Gate

```bash
cd engine && node --test test/doctrine.test.js test/doctrine-lint-main.test.js test/doctrine-lint.bin.test.js test/bin-entry-symlink.bin.test.js > "${TMPDIR:-/tmp}/craft-part2-unit.log" 2>&1; echo "exit=$?"; grep -E "^# (pass|fail)" "${TMPDIR:-/tmp}/craft-part2-unit.log"
bash scripts/ci.sh > "${TMPDIR:-/tmp}/craft-ci-part2.log" 2>&1; echo "exit=$?"; grep -E "^not ok|^ci: |# fail [1-9]" "${TMPDIR:-/tmp}/craft-ci-part2.log" | head -20
```

### Commit

`feat(engine): add doctrine-lint`

## Part 3 — seed the doctrine and wire its gate

### Context

Docs plus gate wiring; no engine change. The seed file and its lint wiring land in ONE
commit (the gate is never wired to an absent file).

Files:
- `docs/contributing/DOCTRINE.md` (new).
- `scripts/static-lints.sh` — insert one line directly after
  `node engine/bin/lesson-lint.js docs/contributing/lessons`:
  `node engine/bin/doctrine-lint.js docs/contributing/DOCTRINE.md docs/contributing/adr`
  (its own statement; the file's header explains why lints are never `&&`-joined).
- `test/static-lints-ci.test.js` — add `'doctrine-lint docs/contributing/DOCTRINE.md docs/contributing/adr'`
  to `LINT_IDS` right after `'lesson-lint docs/contributing/lessons'`; add `'doctrine-lint'`
  to `NODE_STUB_NAMES`; rename the first test's title "all thirteen invocations" to
  "all fourteen invocations" (11 ids + 2 loop followers → 12 + 2).
- `.claude/workflow.md` — frontmatter `paths:` gains `doctrine: docs/contributing/DOCTRINE.md`
  (after `dod:`). manifest-lint does not validate the key (engine/src/manifest.js
  `validatePaths` checks only dod and lessons) — that is the ratified posture; add no check.
- `docs/contributing/README.md` — a table row after the DOD.md row, same shape as that row
  (link text DOCTRINE.md in a code span, target DOCTRINE.md), Holds: "principles distilled
  from user-ratified decisions, cited by the decisions phase when it adopts a
  recommendation"; the closing sentence lists `paths.doctrine` beside `paths.dod`.

File format (exact):

```markdown
# Doctrine

Principles distilled from user-ratified decisions. The decisions phase cites an entry as
`DOCTRINE(D-<n>)` when it adopts a recommendation the entry covers.

## D-1 — An input the parser does not model fails closed
- **Trigger:** <one line>
- **Rule:** <one line>
- **Evidence:** ADR-582, ADR-594, …
- **Counter-cases:** ADR-546 — <why>; ADR-551 — <why>
```

One blank line between entries; no blank line inside an entry; Trigger and Rule one line
each, written from the cited Decision text.

The ratified seed (ids, titles and citations; bold = against-recommendation ruling):

| Id | Rule title | Evidence (primary first) | Counter-cases |
|---|---|---|---|
| D-1 | An input the parser does not model fails closed | 582, 594, 684, 691, 693, 694, 695, 698, 519, 535 | 546, 551 — a fail-open the hook cannot observe is documented, not fixed |
| D-2 | Close the class of a proven hole, not the vector; no compatibility fallback | **564**, 384, 569 | none |
| D-3 | A proven defect the change exposes is fixed in the change, not filed | **234**, **338** | 325 — unreachable on every supported platform, so documented |
| D-4 | Code that cannot change behaviour is deleted | **322** | none |
| D-5 | A fixed bound beats tracked state | **719**, 313, 321 | none |
| D-6 | Run-local state stays out of the tree; no committed churn for a protection the failure mode does not need | 384 | none |
| D-7 | A proven risk earns its machinery now; an unproven one waits | **375**, 373 | 599 — no launch boundary, so the check stays on demand |
| D-8 | Ship on the confirmed contract; record the unconfirmed remainder as an open row instead of gating on it | **257** | none |
| D-9 | A listing or membership criterion is an observable property, stated explicitly | **249** | none |
| D-10 | Heuristics advise; correctness facts block | 306, 312, 324, 355 | none |
| D-11 | One verdict, one implementation, shared by every caller | 640, 487, 556, 216, 251 | none |
| D-12 | Shipped artifacts carry no provenance refs and no home-rooted paths | 485, 489, 490, 492, 466, 467, 468 | none |
| D-13 | A waiver is a fixed column-0 token line with a non-empty reason | 357, 479, 482, 483 | none |
| D-14 | Decide by measurement or probe, not assumption | 399, 686, 324 | none |

All 49 ids were verified live (Status not superseded), uniquely resolvable and carrying
"ratified by the user" at plan time.

Verification method (binding — the batch ratification allows DROP or NARROW, never ADD):
- For each cited ADR, read only its Options and Decision sections, batched, e.g.
  `for n in 582 594 …; do f=$(ls docs/contributing/adr/$n-*.md); echo "== $f"; awk '/^## Options/{p=1} /^## Consequences/{p=0} p' "$f"; done > "${TMPDIR:-/tmp}/seed-read.txt"`
  then read that file in ranges.
- An entry whose cited Decision does not support its Rule: narrow the Rule, or remove the
  unsupported ADR from Evidence; if no cited ADR supports it, drop the entry. Never add an
  entry or an ADR not in the table. Keep the remaining ids as tabled (gaps allowed).
- Hard constraints: every bold id (564, 234, 338, 322, 719, 375, 257, 249 — the 8 live
  against-recommendation rulings) stays cited as Evidence by at least one entry; D-1 must
  survive, because docs/contributing/adr/729-*.md contains the literal `DOCTRINE(D-1)` and
  doctrine-lint L4 scans the ADR dir. If verification would remove either, stop and hand back
  under the blocker protocol.
- Never write `ADR-301` (superseded) anywhere in the file: adr-lint C3 treats DOCTRINE.md as
  live tier, and L3 would flag it. D-6 cites 384 only.
- No `DOCTRINE(D-<digit>)` literal in the intro (only the placeholder above).
- Handback (mandatory): list every dropped or narrowed entry, with the ADR whose Decision
  failed it, so the documentation phase states it in the PR body. "none" if none.

### TDD steps

1. RED — edit test/static-lints-ci.test.js (`LINT_IDS`, `NODE_STUB_NAMES`, "fourteen") — `Given every stubbed lint green, when static-lints runs, then it exits 0 after all fourteen invocations in block order` fails: static-lints.sh never invokes doctrine-lint, so the logged invocations lack it; the per-lint `Given the lint "doctrine-lint …" fails` case fails the same way.
2. GREEN — write docs/contributing/DOCTRINE.md through the verification method, then add the static-lints.sh line, the manifest key and the contributing README row.
3. GUARD — `node engine/bin/doctrine-lint.js docs/contributing/DOCTRINE.md docs/contributing/adr` exits 0 with the OK line (passes because the seed cites only live ADRs and keeps D-1); `bash scripts/adr-lint.sh docs/contributing/adr` green (no superseded id cited on the live tier).
4. REFACTOR — re-read every Trigger and Rule: one line each, no ADR numbers inside Trigger/Rule text, wording drawn from the cited Decision.

### Gate

```bash
node engine/bin/doctrine-lint.js docs/contributing/DOCTRINE.md docs/contributing/adr; echo "exit=$?"
node --test test/static-lints-ci.test.js > "${TMPDIR:-/tmp}/craft-part3-unit.log" 2>&1; echo "exit=$?"; grep -E "^# (pass|fail)" "${TMPDIR:-/tmp}/craft-part3-unit.log"
bash scripts/ci.sh > "${TMPDIR:-/tmp}/craft-ci-part3.log" 2>&1; echo "exit=$?"; grep -E "^not ok|^ci: |# fail [1-9]|doctrine-lint" "${TMPDIR:-/tmp}/craft-ci-part3.log" | head -20
```

### Commit

`feat(doctrine): seed the doctrine file and gate it with doctrine-lint`

## Part 4 — decisions skill: doctrine-aware triage and harvest

### Context

Prose change to the decisions skill, pinned by a new prose suite; plus the run-record spec
entry for the new token.

Files:
- `skills/decisions/SKILL.md` — edits below.
- `docs/contributing/specs/run-record.md` — §Token vocabulary, the greppable-only bullet list
  (starts "The tokens below are greppable only", currently ends with the
  `DECISION-CITE-WAIVE(<file>):` bullet). Append a bullet:
  `DOCTRINE-HARVEST(<candidate>): D-<n> added | D-<n> amended | declined — <reason> | none — covered by D-<n> | none — one-off`
  — emitted by the `decisions` phase, exactly one line per escalated candidate after the
  user rules; `<candidate>` is `#<k> <slug>` from the design's candidate table (the ADR
  number is not yet assigned); greppable only, no `run-state` row.
- `test/decisions-doctrine-prose.test.js` (new, CommonJS, region-slice helper; model on
  test/lessons-harvest-prose.test.js).
- `test/craft-root-shim.test.js` — `TARGET_FILES` entry `{ file: 'skills/decisions/SKILL.md', count: 1 }`
  becomes `count: 2` (the new doctrine-lint invocation is the second shimmed path).

Current skill anchors (skills/decisions/SKILL.md): Preamble step 1 at lines 10-12 (ADR dir,
template, next number); Procedure step 1 at 25-30 (the "clear AND aligns with an existing ADR
or a stated craft principle … Any other candidate is a GENUINE FORK" text — replaced
wholesale); step 2 at 31-32; step 3 at 33-41; step 4 at 42-47; step 5 at 48-65; step 6 at 66-69.

Edits (exact intent; wording may wrap):
- Preamble step 1: add the doctrine probe — doctrine file = `paths.doctrine`, else
  `docs/DOCTRINE.md`; an absent file means no entries and is never an error (not created here).
- Procedure step 1 → this text:

  ```text
  1. Triage every candidate (session-owned). Read the doctrine file whole (paths.doctrine,
     else docs/DOCTRINE.md; absent = no entries). ESCALATE a candidate only when:
     (a) its recommendation conflicts with an existing ADR — checked against the governing
         slice on slot 1 (skills/run/SKILL.md's intention hint, an indexed read) — or with a
         doctrine entry;
     (b) it is irreversible or outward-facing: reverting the PR would not undo it (a release,
         a support floor, an external send, a deletion), or it changes a contract other
         repos consume;
     (c) it carries a real user-judgment trade-off that no ADR or doctrine entry covers — a
         candidate without a clear recommendation is this case.
     Any trigger escalates; a covering entry never overrides (a) or (b). An entry covers a
     candidate when its Trigger describes the candidate's trade-off and its Rule picks the
     recommended option; a Rule that picks another option is a conflict (a). Covering and
     aligning stay a session judgment. ADOPT every other candidate and cite its basis:
     ADR-NNN, DOCTRINE(D-<n>), or "no trade-off" (alternatives that differ only in mechanics).
  ```
- Step 2 heading: "Escalated candidates → user conversation" (drop "Genuine forks").
- New step 2b, between step 2 and step 4 (keep numbering 2b so steps 3–6 keep their numbers):

  ```text
  2b. Harvest. After the user rules on an escalated candidate, draft a doctrine entry (or an
      amendment to the entry concerned) when the ruling differs from the design's
      recommendation or contradicts a doctrine entry: always. When the ruling matches and no
      entry covers its rationale, draft one only if that rationale reaches beyond this
      candidate. Show the draft in the same conversation: Trigger, Rule, Evidence (the ADR
      this ruling becomes), Counter-cases. The user accepts, edits or declines. Record one
      line per ruling:
      DOCTRINE-HARVEST(<candidate>): D-<n> added | D-<n> amended | declined — <reason> | none — covered by D-<n> | none — one-off
  ```
  Place 2b directly after step 2, before step 3; it must precede step 4 (an accepted entry
  joins the cross-candidate check, and a new entry that voids an adopted candidate's premise
  re-surfaces it there).
- Step 3: "No escalated candidates (zero candidates, or every candidate adopted)"; the
  justification names each adopted candidate and its basis (ADR-NNN, DOCTRINE(D-<n>) or no
  trade-off). Keep the literal `NO-OP(decisions): no user-judgment decisions — <justification>`
  (test/no-op-token.test.js and two evals' regexes depend on it).
- Step 5: the adopted marker becomes `**adopted-as-recommended (no user judgment)** — <basis>`.
  Add a **Doctrine write** paragraph: after the evidence ADR's commit, write each accepted
  entry (`<n>` = highest id + 1; an amendment edits in place: narrow the Rule or add evidence
  / counter-cases; never delete or renumber), creating the file at the resolved path with
  the H1 `# Doctrine` and the intro line when absent; run
  `node "${CRAFT_ROOT:-${CLAUDE_PLUGIN_ROOT}}/engine/bin/doctrine-lint.js" <doctrine-file> <adr-dir>`;
  commit alone as `docs(doctrine): D-<n> <title>`. Add to the supersession sweep sentence:
  when a superseded ADR is cited as doctrine evidence, re-point the citation to the
  superseding ADR in the same commit.
- Forbidden in the skill (each pinned by a test): the phrase "stated craft principle"; any
  `ADR-<digit>`; any `DOCTRINE(D-<digit>` (a numbered example would satisfy an eval's trace
  regex just by being read).

### TDD steps

1. RED — `Given the decisions skill Procedure step 1, when read, then it names the three escalation triggers (a) conflict, (b) irreversible or outward-facing, (c) uncovered trade-off, and the adopt bases ADR-NNN, DOCTRINE(D-<n>) and "no trade-off"` — fails: step 1 holds the adopt-iff-aligned rule. Same cycle: `…then "stated craft principle" is absent` — fails: present at line 27.
2. RED — `Given the decisions skill Preamble, when read, then it resolves paths.doctrine, else docs/DOCTRINE.md, and treats an absent file as no entries` — fails: the Preamble names only the ADR dir and template.
3. GREEN — rewrite Preamble step 1 and Procedure step 1 (and the step-2 heading).
4. RED — `Given the decisions skill, when the harvest step is read, then it holds DOCTRINE-HARVEST(, "always", accepts/edits/declines, and precedes the cross-candidate check` — fails: no step 2b. Same cycle: `Given the run-record spec Token vocabulary region, when read, then it lists DOCTRINE-HARVEST(<candidate>):` — fails: absent.
5. GREEN — add step 2b and the run-record bullet.
6. RED — `Given the decisions skill step 5, when read, then the adopted marker carries "— <basis>" and the doctrine write commits "docs(doctrine): D-<n>" after running doctrine-lint through the CRAFT_ROOT shim` — fails: no basis suffix, no doctrine write. Same cycle: update test/craft-root-shim.test.js count to 2 — fails: the skill still holds one shimmed path.
7. GREEN — step 3 and step 5 edits.
8. GUARD — `Given the decisions skill, when scanned, then it holds no ADR-<digit> id and no DOCTRINE(D-<digit>` (passes: the skill uses only ADR-N / ADR-NNN / D-<n> placeholders — keep it that way); test/no-op-token.test.js and test/decision-tokens.test.js stay green.
9. REFACTOR — reread the whole skill for contradictions with the old fork wording (no remaining "GENUINE FORK" as the escalation criterion); rerun the prose suites.

### Gate

```bash
node --test test/decisions-doctrine-prose.test.js test/craft-root-shim.test.js test/no-op-token.test.js test/decision-tokens.test.js test/run-record.test.js > "${TMPDIR:-/tmp}/craft-part4-unit.log" 2>&1; echo "exit=$?"; grep -E "^# (pass|fail)" "${TMPDIR:-/tmp}/craft-part4-unit.log"
bash scripts/ci.sh > "${TMPDIR:-/tmp}/craft-ci-part4.log" 2>&1; echo "exit=$?"; grep -E "^not ok|^ci: |# fail [1-9]" "${TMPDIR:-/tmp}/craft-ci-part4.log" | head -20
```

### Commit

`feat(decisions): escalate only on conflict, irreversibility or an uncovered trade-off, and harvest doctrine`

## Part 5 — PR body splits ratified from adopted decisions

### Context

Files:
- `templates/pr-body.md` — line 35 `- **Decisions:** <ADR-### … or none>` becomes
  `- **Decisions:** <ratified: ADR-### …; adopted: ADR-### (ADR-NNN | D-n | no trade-off) …; or none>`.
- `skills/documentation/SKILL.md` — the Provenance & verification trailer sentence (lines
  68-70, "…trailer carrying decisions + ADR numbers, design doc path, …"). Add one clause:
  the Decisions line splits ratified from adopted ADRs, both read from this run's ADRs — an
  ADR whose Decision carries the `adopted-as-recommended` marker is adopted, listed with the
  `— <basis>` suffix that follows the marker; the rest are ratified. No run-record token is
  read for it (the ADRs survive a context reset).
- `test/decisions-pr-body-prose.test.js` (new, CommonJS, region-slice helper).

Do not touch skills/decisions/SKILL.md or the Part 4 test file (one owner per file).
The documentation skill's shimmed-path count (test/craft-root-shim.test.js, count 1) must
not change: add no new `${CRAFT_ROOT…}` path here.

### TDD steps

1. RED — `Given templates/pr-body.md, when the Provenance & verification region is read, then the Decisions line names "ratified:" and "adopted:" with a basis` — fails: the line reads `<ADR-### … or none>`.
2. RED — `Given skills/documentation/SKILL.md, when the PR-body step is read, then it derives the ratified/adopted split from the adopted-as-recommended marker and its "— <basis>" suffix` — fails: the trailer names only "decisions + ADR numbers".
3. GREEN — both edits.
4. REFACTOR — keep the template line one line; rerun.

### Gate

```bash
node --test test/decisions-pr-body-prose.test.js test/craft-root-shim.test.js > "${TMPDIR:-/tmp}/craft-part5-unit.log" 2>&1; echo "exit=$?"; grep -E "^# (pass|fail)" "${TMPDIR:-/tmp}/craft-part5-unit.log"
bash scripts/ci.sh > "${TMPDIR:-/tmp}/craft-ci-part5.log" 2>&1; echo "exit=$?"; grep -E "^not ok|^ci: |# fail [1-9]" "${TMPDIR:-/tmp}/craft-ci-part5.log" | head -20
```

### Commit

`feat(documentation): split ratified from adopted decisions in the PR body`

## Part 6 — covered-trade-off eval and user-facing docs

### Context

Fixture and docs only — no src delta, no test file (no test may name the evals path).

Files:
- `evals/decisions-adopts-covered-tradeoff/` (new directory) — copy of
  evals/decisions-escalates-fork/ with these contents:
  - case.yaml, scaffold.sh: byte-identical copies (`cp -p`, keep scaffold.sh executable).
  - prompt.md: same frontmatter and body, `name: decisions-adopts-covered-tradeoff`,
    `description: The decisions phase adopts a recommendation over a real trade-off that a doctrine entry covers, citing the entry.`
    (`tags: [phase]`, `max_turns: 15`, `timeout_seconds: 600`, `allowed_tools` unchanged).
  - fixture/docs/design/shout-flag.md and fixture/docs/adr/001-greet-stays-bash-3-portable.md:
    byte-identical copies.
  - fixture/docs/adr/002-quiet-applies-on-a-pipe-too.md (new): same shape as 001 (frontmatter
    `subjects:` `- greet.sh`; H1 `# 002 — --quiet applies on a pipe too`; Status accepted;
    Context / Options considered / Decision / Consequences). Decision: `--quiet` suppresses
    output on a terminal and on a pipe alike; a caller that needs pipe-specific output passes
    a separate flag.
  - fixture/docs/DOCTRINE.md (new): `# Doctrine`, the intro line, and one entry
    `## D-1 — A flag behaves the same on a terminal and on a pipe` with Trigger "a flag's
    effect could depend on whether stdout is a terminal", Rule "it does the same on both;
    pipe-specific output is a separate flag", Evidence `ADR-002`, Counter-cases `none`. The
    file must NOT contain the literal `DOCTRINE(D-1)` (use the `DOCTRINE(D-<n>)` placeholder
    in the intro).
  - graders/: drop the fork's four graders; write five:
    - fired.md — byte-identical to the fork's (`tool_used`, Skill, `craft:decisions`).
    - adopts-citing-doctrine.md — `type: llm`, `arm: both`, body: "The reply does not ask the user to choose between options. It adopts option (a) for the piped-output candidate and names D-1 (docs/DOCTRINE.md) or ADR 002 as the principle it aligns with."
    - adr-authored.md — frontmatter type file_exists, path docs/adr/003-*.md, arm both (002 is taken by the evidence ADR).
    - doctrine-cite.md — `type: regex`, `target: trace`, `arm: with-only`, body `DOCTRINE\(D-1\)`.
    - noop-token.md — byte-identical to evals/decisions-noop-when-clear/graders/noop-token.md.
- `docs/contributing/maintainer-smokes.md` — the `skills/decisions` unit row (line ~147)
  lists `decisions-adopts-covered-tradeoff` third; "the two decisions cases" (line ~152)
  becomes "the three decisions cases". No cost-table row (it lands when the user runs the
  paid pilot).
- `docs/guides/customizing.md` — section heading (line 228) `### Ports (cross-cutting) — backlog · memory · policy · DoD · intention · lessons · doctrine`;
  a row after the lessons row (line 237), columns Point / What it buys / Cost / Sample:
  Point "**doctrine** *(Tier 0)*"; What it buys "per-repo principles distilled from your
  rulings (paths.doctrine, default docs/DOCTRINE.md, each in a code span) — the decisions
  phase adopts a recommendation an entry covers and drafts new entries from rulings that
  override a recommendation; doctrine-lint keeps every citation pointing at a live ADR";
  Cost "an entry citing a superseded ADR fails the lint until re-pointed"; Sample "—".
- `docs/guides/concepts.md` — line 174 (Outer loop — sampling sub-loop row): name the
  doctrine beside the ADR read (adopted candidates cite an ADR or a doctrine entry; the
  harvest grows the doctrine from rulings). Keep the row's link column; add no ADR id.
- `README.md` — line 113 in the ```text timeline block becomes
  `decisions   🧑  → you rule on the real forks; the rest are adopted from your ADRs and doctrine and listed in the PR`.
  The block is outside every readme-drift region; engine/test/readme-regions.test.js holds a
  synthetic copy of the old line as a parser fixture, not a pin on README — leave it.
- `CHANGELOG.md` — under `## [Unreleased]`: `### Added` (the doctrine file the decisions
  phase reads and grows, and the `doctrine-lint` check) and `### Changed` (decisions escalate
  only on a conflict with an ADR or doctrine entry, an irreversible or outward-facing choice,
  or an uncovered trade-off; the rest are adopted and listed in the PR body with their
  basis). User-facing wording, no ADR ids (test/release-discipline.test.js validates the shape).

### TDD steps

1. GUARD — fixture pairing (shell, not a test): `cmp` each byte-identical copy against its
   source; `grep -c 'DOCTRINE(D-1)' evals/decisions-adopts-covered-tradeoff/fixture/docs/DOCTRINE.md`
   prints 0; `node engine/bin/doctrine-lint.js evals/decisions-adopts-covered-tradeoff/fixture/docs/DOCTRINE.md evals/decisions-adopts-covered-tradeoff/fixture/docs/adr`
   exits 0 (passes once written: D-1 cites the live ADR-002).
2. GUARD — test/plugin-evals-local-only.test.js, test/examples-lint.test.js, test/release-discipline.test.js and test/readme-drift.test.js stay green (no CI reference added; the Ports row's sample is `—`; the changelog keeps its heading order).
3. REFACTOR — reread each doc edit for an ADR id or a provenance ref; none allowed.

### Gate

```bash
d=evals/decisions-adopts-covered-tradeoff; s=evals/decisions-escalates-fork; for f in case.yaml scaffold.sh fixture/docs/design/shout-flag.md fixture/docs/adr/001-greet-stays-bash-3-portable.md graders/fired.md; do cmp "$s/$f" "$d/$f" || echo "DIFF $f"; done; cmp evals/decisions-noop-when-clear/graders/noop-token.md "$d/graders/noop-token.md" || echo "DIFF noop-token"
node engine/bin/doctrine-lint.js evals/decisions-adopts-covered-tradeoff/fixture/docs/DOCTRINE.md evals/decisions-adopts-covered-tradeoff/fixture/docs/adr; echo "exit=$?"
bash scripts/ci.sh > "${TMPDIR:-/tmp}/craft-ci-part6.log" 2>&1; echo "exit=$?"; grep -E "^not ok|^ci: |# fail [1-9]" "${TMPDIR:-/tmp}/craft-ci-part6.log" | head -20
```

### Commit

`docs: document the doctrine layer and add its covered-trade-off eval`
