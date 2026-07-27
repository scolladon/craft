# Plan — harness hygiene + prune gates

> Source: design doc `docs/design/harness-hygiene-prune-gates.md` · ADRs `207, 208, 209, 210, 211, 212`
> The plan is the implementation script AND the knowledge handoff. Part agents start
> with zero context: whatever a part block omits is paid later as agent rediscovery.
> `plan-lint.sh` enforces the schema below — the plan phase cannot close without it.

## Sizing rules

- Every part costs a full agent lifecycle (spin-up, zero-context rebuild, gate) — it
  must earn it. No standalone test-only parts for FEATURE code: coverage/interop/property
  tests fold into the implementation part whose code they exercise. EXCEPTION:
  test-infra-only and docs-only parts (tooling config, test helpers, fixtures,
  harness/ADV/property suites, docs/prose) with no `src/` delta ARE standalone.

## Workstream layout + revert contract (read before any part)

Parts are grouped **by workstream** and each workstream is **independently revertable**
(X-R1). Order: **A (Parts 1–2) → C (Parts 3–6) → B (Part 7)**. Reverting all of one
workstream's commits must leave the other two green.

- **Shared file `scripts/ci.sh`** — Part 2 (A2) rewrites the body of `run_intention_lint`
  (its region, ~L59–77). Part 6 (C4) *appends* `compute_touched`/`run_stub_lint`/
  `run_prose_lint` at the **end of the file** (after the existing L79–83 lint chain, which
  sits between the two regions as the separator). Keep the hunks non-adjacent — never edit
  `run_intention_lint` and the C block in one hunk.
- **Shared file `docs/GUIDE-customizing.md`** — only Part 6 (C4) touches it (adds one
  `hygiene.gate` subsection). Part 7 (B) documents its trigger in its own
  `skills/prune/SKILL.md` frontmatter (metrics precedent) and touches **no** GUIDE, so this
  file ends up C-only — no B/C coupling.
- **`skills/run/SKILL.md` token family** — only Part 6 (C4) appends the `STUB-*`/`SLOP-*`
  tokens. B introduces `PRUNE-CANDIDATE` **inside `skills/prune/SKILL.md` only** (never in
  `skills/run/SKILL.md`), so B reverts by deleting `skills/prune/`.
- **`docs/adapters/intention.md`** — only Part 1 (A1) touches it.
- **No workstream shares an `engine/src` module with another** (A touches none; B touches
  none; C adds its own `stub-lint-main.js`/`prose-lint-main.js` and edits only
  `manifest.js`/`manifest-vocabulary.js`, which A and B never touch).

**Binding conventions for every part**
- No provenance refs (phase/ADR/backlog numbers) in **source or test** — marker sets,
  ban-lists, messages, fixtures, comments. (This plan doc may cite ADR numbers; the code
  the implementer writes may not.)
- No suppression directives (`// stub-lint-disable`, `eslint-disable`, coverage ignores).
  C waivers are **prose tokens** only.
- No swallowed errors: an unreadable file is a loud `cannot read <path>` line, never a
  silent skip (mirror `engine/src/intention-lint-main.js` L206–210).
- Engine modules are ESM (`engine/package.json` `"type":"module"` → `import`). Repo-root
  `test/*.test.js` are CJS (`'use strict'; require(...)`).
- Engine `main(argv, io)` modules are **engine-internal**: imported only by their 6-line
  `engine/bin/<name>.js` shim (intention-lint precedent). There is **no barrel / index /
  api-report** in this repo to update, and Stryker auto-covers `engine/src/**` via a
  recursive glob (no `stryker.conf.json` edit). The only downstream surface for a new gate
  bin is the `ci.sh` wiring, deferred to Part 6.
- State-mutating probes (fixtures, empty-dir enumerator runs) use `mkdtempSync` throwaways,
  never the worktree.

---

## Part 1 — A1: self-govern the intention port via `subjects` frontmatter

### Context
**Goal (A-R1):** `docs/adapters/intention.md` currently opens at line 1 with
`# Intention adapter spec` — no frontmatter → `parseSubjects` returns `null` → the page is
skipped, so the intention port's own sources are unguarded. Add a line-1 `subjects:` block
naming the port's sources so a future edit to those sources without touching the page raises
an advisory `INTENTION-DRIFT`. The page is already in the corpus (`docs/adapters/*.md`,
already enumerated, already scanned by `source-hygiene`) — **no corpus wiring needed**.

**File to edit:** `docs/adapters/intention.md` — prepend, before the current line 1:
```
---
subjects:
  - engine/src/intention*.js   # intention.js, intention-subjects.js, intention-lint-main.js
  - engine/src/glob.js         # shared matcher — advisory over-flag trade-off
---
# Intention adapter spec
```
- The two globs (ADR-207 subject set A2-subj(a)) cover the four port sources
  (`intention.js`, `intention-subjects.js`, `intention-lint-main.js`, `glob.js`).
  `matchGlob('engine/src/intention.js', 'engine/src/intention*.js')` is `true`
  (`*` is non-crossing/single-segment; matches the empty string too).
- Comments must **not** contain any `§`/ADR/phase number (keep them descriptive), so the
  page stays clean of provenance refs even in docs.
- js-yaml strips comments on load, so `parseSubjects` yields exactly
  `['engine/src/intention*.js', 'engine/src/glob.js']` — a non-empty list of non-empty
  strings → passes `intention-lint` check 1 (`isNonEmptyStringList`,
  `engine/src/intention-lint-main.js` L154–157). The globs carry no `source-hygiene` banned
  token (no `stryker`/`gh`/`github`/vendor suffix), so the adapters scan stays green.
- **Scope boundary (keeps A independent of B/C):** govern **only** these four port sources.
  Do NOT add C's new `engine/src/{stub,prose}-lint-main.js` — coupling C into this page
  breaks revert independence.

**Dogfood test (new):** `engine/test/intention-self-governance.test.js` (ESM). It exercises
the *existing* `assertFresh` over the *real* page content, proving the real subjects govern
the real sources (a regression guard: dropping `engine/src/intention*.js` from the subjects
fails this test).
- API: `import { assertFresh } from '../src/intention.js';`
  `assertFresh(change, deps)` where `change = { changed: string[], touched: string[],
  waived: string[] }` and `deps = { readPage: (page)=>string|null, listCorpus: ()=>string[] }`.
  Returns `{ stale: [{ page, changedPaths, waived }], ... }`.
- Internals it pins (`engine/src/intention.js` L162–166 `buildStaleRow`): a changed path
  matching the page's subjects with the page **not** in `touched` → a row; `touched.includes(page)`
  → `null` (no row); `waived: waived.includes(page)`.
- Load the real page:
  `const PAGE = 'docs/adapters/intention.md';`
  `const CONTENT = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', PAGE), 'utf8');`
  (from `engine/test/` up two levels to repo root; import.meta-based → cwd-independent, so it
  works under `cd engine && node --test`).
  `const deps = { readPage: (p) => (p === PAGE ? CONTENT : null), listCorpus: () => [PAGE] };`
- Helper: reuse `engine/test-helpers/capture-io.js` `makeCaptureIo` only if you need io (not
  needed here — `assertFresh` returns a value).

### TDD steps
- **RED** `intention-self-governance.test.js` — three `node:test` cases (Given/When/Then
  titles, `sut = assertFresh`), all failing because the page has no `subjects` yet
  (`listCorpus` page parses to `null` → no stale row):
  1. changed `['engine/src/intention.js']`, `touched:[]`, `waived:[]` → `report.stale` has a
     row `{ page: PAGE, waived: false }`. Fails: no row (page not yet governing).
  2. same change but `touched:[PAGE]` → **no** row for PAGE (touched short-circuit).
  3. same change, `waived:[PAGE]` → row present with `waived: true`.
- **GREEN** Prepend the frontmatter block to `docs/adapters/intention.md`. Case 1 and 3 now
  yield a row; case 2 stays empty via `buildStaleRow`'s `touched.includes` guard.
- **REFACTOR** Confirm the YAML comments are provenance-free and the block is valid
  (`node engine/bin/intention-lint.js docs/adapters/intention.md` → `craft-intention: OK`).

### Gate
- Part: `cd engine && node --test test/intention-self-governance.test.js`
- Phase-boundary: `bash scripts/ci.sh` (runs `intention-lint` over the real corpus incl. the
  now-frontmattered page; `source-hygiene` over `docs/adapters/`).

### Commit
`feat: self-govern the intention port via subjects frontmatter on its spec page`

---

## Part 2 — A2: single-source the living-corpus enumeration

### Context
**Goal (A-R2, ADR-208):** the corpus is enumerated twice — `scripts/ci.sh`
`run_intention_lint()` (bash `find`, L59–77) and `test/intention-lint-ci.test.js`
`enumerateCorpus()`/`mdFilesIn()` (JS `readdirSync`, L15–33). Introduce one executable SoT,
`scripts/living-corpus.sh`, that both consume. Output contract (E3/E4, ADR-208 A2-ord):
**newline-separated repo-relative paths, `LC_ALL=C`-sorted**, including `BACKLOG.md`.

**Pinned live corpus (17 entries — verify with `bash scripts/living-corpus.sh` before
finalizing; stable across this branch, no part adds a corpus page):**
```
BACKLOG.md
docs/DESIGN-customizable-engine.md
docs/DESIGN-history.md
docs/DESIGN-nested-insert-fail-loud.md
docs/DESIGN-shrink-core-prune-guardrails.md
docs/DOD.md
docs/GUIDE-customizing.md
docs/adapters/backlog.md
docs/adapters/execution.md
docs/adapters/gate.md
docs/adapters/intention.md
docs/adapters/memory.md
docs/adapters/model.md
docs/adapters/pi-poc-record.md
docs/adapters/policy.md
docs/adapters/telemetry.md
docs/adapters/vcs.md
```
(`LC_ALL=C` orders `BACKLOG.md` first, then uppercase `docs/DESIGN*`/`DOD`/`GUIDE`, then
lowercase `docs/adapters/*` — differs from the old JS insertion order, so the new test
compares as a **Set**, per E3.)

**New file `scripts/living-corpus.sh`** (bash, shellcheck-clean, `set -euo pipefail`):
- Operates relative to **cwd** (does NOT `cd` — mirrors ci.sh's existing find-relative
  contract; ci.sh already `cd`s to repo root at L8 before calling; the test passes
  `cwd: ROOT`; the zero-file test passes `cwd: <empty mktemp>`).
- Discover pages:
  ```
  discovered=()
  while IFS= read -r found; do discovered+=("$found"); done < <(
    { find docs/adapters -maxdepth 1 -name '*.md'
      find docs -maxdepth 1 \( -name 'DESIGN-*.md' -o -name 'DOD.md' -o -name 'GUIDE-customizing.md' \)
    } 2>/dev/null )
  ```
- **Zero-file hard error (ADR-208):** `if [ "${#discovered[@]}" -eq 0 ]; then echo
  "living-corpus: enumerated zero living pages" >&2; exit 1; fi`.
- Emit sorted incl. BACKLOG.md: `printf '%s\n' "${discovered[@]}" "BACKLOG.md" | LC_ALL=C sort`.

**Edit `scripts/ci.sh` `run_intention_lint()` (L59–77) — replace the inline `find` block
and the `files+=("BACKLOG.md")` line** with a read of the script (belt-and-braces zero guard
stays so ci.sh still fails if the enumerator emits nothing — process substitution does not
propagate the script's exit):
```
run_intention_lint() {
  local -a files=()
  local found
  while IFS= read -r found; do files+=("$found"); done < <(bash scripts/living-corpus.sh)
  if [ "${#files[@]}" -eq 0 ]; then
    echo "ci: intention-lint corpus enumerated zero files" >&2
    exit 1
  fi
  node engine/bin/intention-lint.js "${files[@]}"
}
```
Keep this edit **inside `run_intention_lint`'s existing region** (do not move the function);
Part 6 appends its block far below — non-adjacent.

**Edit `test/intention-lint-ci.test.js` (CJS)** — delete `mdFilesIn` (L15–20) and the body
of `enumerateCorpus` (L22–33); replace with:
```
function enumerateCorpus() {
  const out = execFileSync('bash', [path.join(ROOT, 'scripts', 'living-corpus.sh')],
    { cwd: ROOT, encoding: 'utf8' });
  return out.split('\n').filter(Boolean);
}
```
The existing two tests stay: "ci.sh references intention-lint" and "intention-lint exits 0
over the real corpus" (now repo-relative paths; `intention-lint`'s `readFileSync` resolves
them against `cwd: ROOT`, already set on the `execFileSync` at L44 — E4).

**New test `test/living-corpus.test.js` (CJS)** — `require` `node:test`, `node:assert`,
`node:child_process` (`execFileSync`, `spawnSync`), `node:fs`, `node:os`, `node:path`.
`ROOT = path.resolve(__dirname, '..')`, `SCRIPT = path.join(ROOT, 'scripts', 'living-corpus.sh')`.

### TDD steps
- **RED** `test/living-corpus.test.js`:
  1. "emits exactly the pinned corpus (as a set)": `execFileSync('bash', [SCRIPT], { cwd: ROOT })`
     → `new Set(out.split('\n').filter(Boolean))` deep-equals the 17-entry `EXPECTED` Set.
     Fails: script does not exist yet.
  2. "zero-file hard error": `spawnSync('bash', [SCRIPT], { cwd: mkdtempSync(...) })` →
     `status !== 0` (empty dir → no discovered pages). Fails: script missing.
- **GREEN** Write `scripts/living-corpus.sh` (above). Both cases pass.
- **REFACTOR** Rewire `scripts/ci.sh` `run_intention_lint` and `test/intention-lint-ci.test.js`
  to consume the script (above); `enumerateCorpus` now shells out → the "intention-lint exits
  0 over the real corpus" test still passes (behavior-preserving), proving the two consumers
  share one source. Confirm `shellcheck scripts/*.sh` clean.

### Gate
- Part: `node --test test/living-corpus.test.js test/intention-lint-ci.test.js` (repo root)
- Phase-boundary: `bash scripts/ci.sh` (runs the rewired `run_intention_lint`; `shellcheck
  scripts/*.sh` covers the new script).

### Commit
`refactor: single-source the living-corpus enumeration behind scripts/living-corpus.sh`

---

## Part 3 — C1: stub-marker pre-completion gate (engine bin)

### Context
**Goal (C-R1, ADR-210):** a deterministic gate that greps a stub-marker set over the
branch's touched **source**, mirroring the `intention-lint` bin+src pattern. This part builds
the bin + module + tests **only** — the `ci.sh` wiring is Part 6, so this part's ci.sh is
untouched and the bin is inert-but-tested.

**Precedent to copy exactly:** `engine/bin/intention-lint.js` (6-line shim) →
`engine/src/intention-lint-main.js` `main(argv, io) → exitCode` (`EXIT_OK=0`,
`EXIT_INVALID=2`); tests `engine/test/intention-lint-main.test.js` (logic, ESM, uses
`../test-helpers/capture-io.js` `makeCaptureIo`) + `engine/test/intention-lint.bin.test.js`
(spawn-smoke via `spawnSync(process.execPath, [BIN, ...])`, mktemp fixtures).

**New `engine/bin/stub-lint.js`** — byte-for-byte the intention-lint shim with the import
path swapped:
```
#!/usr/bin/env node
import { fileURLToPath } from 'node:url';
import { main } from '../src/stub-lint-main.js';
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.exit(main(process.argv.slice(2), { stdout: process.stdout, stderr: process.stderr }));
}
```

**New `engine/src/stub-lint-main.js`** — pure (no git, no ambient FS beyond the argv files
and explicit `--waiver-source` files). Exports `main(argv, io)`. Constants:
- `EXIT_OK = 0`, `EXIT_FOUND = 2`.
- `MARKERS = Object.freeze(['TODO','FIXME','HACK','XXX','PLACEHOLDER','STUB'])` (ADR-210
  ratified set; a named constant, no provenance).
- `SELF = fileURLToPath(import.meta.url)` — absolute path of this module, for self-exclusion.
- argv shape (parsed by a small `parseArgs`): leading flags `--gate <advisory|blocking>`
  (default `advisory`), `--waiver-source <path>` (repeatable); every other token is a source
  file path. Files come pre-filtered from ci.sh (Part 6); the bin does no diffing.
- **Self-exclusion:** skip a file when `resolve(process.cwd(), file) === SELF` (the marker
  definitions live in this module and would self-match). `process.cwd()` is the only ambient
  read and is not git I/O.
- **Waivers:** for each `--waiver-source`, `readFileSync` (loud `cannot read waiver source
  <p>` to stderr on failure, then continue — handled, not swallowed), collect
  `/STUB-WAIVE\(([^)]+)\)/g` capture (`.trim()`) into a `Set`. A file whose path is in the
  waived set is skipped (its findings cleared). Token form is `STUB-WAIVE(<file>): <reason>`
  (design C-R1/C8: keyed by `<file>`, mirroring `INTENTION-WAIVE(<page>)`).
- **Scan:** for each remaining file, `readFileSync` (loud `cannot read <file>` accumulated on
  failure), split on `\n`; per line, match `new RegExp(\`\\b(${MARKERS.join('|')})\\b\`, 'gi')`
  (fresh regex per file); push `STUB-FOUND(<file>): <MARKER>@L<n>` (marker upper-cased,
  `n` = 1-based line). Word-boundary keeps `STUB` from firing inside `STUBBORN`/`DASHBOARD`
  and `TODO` inside `TODOLIST`; case-insensitive so `todo` matches.
- **Output + exit:** write each `STUB-FOUND` line to `io.stdout`; each `cannot read` line to
  `io.stderr`. Return `EXIT_FOUND` iff `gate === 'blocking'` AND (findings OR read-errors)
  exist; else `EXIT_OK`. Advisory therefore always returns 0 but still prints (loud, never a
  gate). No provenance refs anywhere; keep the module itself stub-marker-free (dogfood: Part 6
  will scan sibling C sources).

**New `engine/test/stub-lint-main.test.js`** (ESM) — `import { main }` and `makeCaptureIo`;
mktemp fixture files (`mkdtempSync`/`writeFileSync`/`rmSync`). Cover the behavioral matrix
(these kill the mutation targets in parseArgs/marker-match/waiver/self-exclusion/exit):
clean file → `[]`, exit 0; a file with `TODO` and `FIXME` on separate lines → two
`STUB-FOUND … @L` lines, advisory exit 0; `--gate blocking` with that file → `EXIT_FOUND`;
`--waiver-source` containing `STUB-WAIVE(<that file>): reason` → cleared, exit 0 even blocking;
word-boundary negative (`STUBBORN`/`TODOLIST` → no finding) and case-insensitive positive
(`todo`); unreadable file path → `cannot read` on stderr, advisory exit 0 / blocking
`EXIT_FOUND`; **self-exclusion** — pass the absolute path
`fileURLToPath(new URL('../src/stub-lint-main.js', import.meta.url))` as a file with
`--gate blocking` → exit 0 and empty stdout (RED without the `isSelf` guard: the module's own
`MARKERS` array self-matches → findings → `EXIT_FOUND`). Fold a lightweight generative check
(no new dep): for each `m` in `MARKERS`, a line `\`x ${m} y\`` yields a finding and a line
with the same letters glued into a larger token does not (`hit ⟺ ∃ marker matches`).

**New `engine/test/stub-lint.bin.test.js`** (ESM spawn-smoke, copy intention-lint.bin.test.js
structure): `BIN = join(dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'stub-lint.js')`;
clean mktemp fixture → `status === 0`; `--gate blocking` over a mktemp fixture containing
`TODO` → `status !== 0`.

### TDD steps
- **RED** Write both test files first (they fail: `stub-lint-main.js`/`stub-lint.js` absent).
- **GREEN** Write `engine/src/stub-lint-main.js` then `engine/bin/stub-lint.js`; iterate until
  the full matrix is green. The self-exclusion case is explicitly RED→GREEN (add `isSelf`).
- **REFACTOR** Extract `parseArgs`, `collectWaived`, `findMarkers` as small pure helpers;
  keep each function under 20 lines and early-return; confirm no stub marker leaked into the
  module (it must pass its own gate when Part 6 wires it).

### Gate
- Part: `cd engine && node --test test/stub-lint-main.test.js test/stub-lint.bin.test.js`
- Phase-boundary: `bash scripts/ci.sh` (the `run_suite engine` find picks up the new tests;
  `source-hygiene` scans `engine/src/stub-lint-main.js` — its patterns do not include the
  stub markers, so it stays green).

### Commit
`feat: stub-marker pre-completion gate over touched source`

---

## Part 4 — C2: prose anti-slop lint (engine bin)

### Context
**Goal (C-R2, ADR-211):** a deterministic gate that greps a slop ban-list over the branch's
touched **docs** (and, at propose, the PR body — passed uniformly as an argv file). Same
`main(argv, io)` shape as C1; the PR body needs no special-casing. Wiring into `ci.sh` is
Part 6; this part is bin+module+tests only.

**New `engine/bin/prose-lint.js`** — the intention-lint shim with the import swapped to
`../src/prose-lint-main.js` (identical to C1's shim modulo name).

**New `engine/src/prose-lint-main.js`** — pure; exports `main(argv, io)`. Constants:
- `EXIT_OK = 0`, `EXIT_FOUND = 2`.
- `BAN_LIST = Object.freeze(['delve','leverage','seamless','robust',"it's important to note",
  'in conclusion'])` (ADR-211 ratified seed; a named constant the user later curates; no
  provenance).
- `SELF = fileURLToPath(import.meta.url)` — self-exclusion (the ban-list lives here).
- argv shape identical to C1: `--gate` (default `advisory`), `--waiver-source` (repeatable,
  scanned for `/SLOP-WAIVE\(([^)]+)\)/g`), rest = files (docs and/or the PR-body file).
- **PR-body seam scope.** ADR-211 names two surfaces: touched docs (the `ci.sh` cadence,
  Part 6) and the PR body at propose. This part delivers the PR-body **capability** — the bin
  treats a PR-body file as just another argv file (proven by the PR-body test below). Wiring
  the propose phase to invoke the bin over its drafted body is **out of C's scoped surface**
  per the coupling map (which bounds C to `ci.sh` + `GUIDE` + the `skills/run` token family +
  the engine bins/modules/manifest — `skills/propose` is not a C surface). Keep it capability-
  only; a propose-phase invocation is a later, separate prose follow-up.
- **Match rule (design C2/ADR-211):** case-insensitive, word-boundary for single-token
  entries (`\b<word>\b` so `robust` does not fire inside `robustness`), literal
  case-insensitive substring for multi-word phrases (an entry containing whitespace →
  `content.toLowerCase().includes(entry.toLowerCase())`, so `it's important to note` matches
  regardless of `\b` around the apostrophe). One finding **per (file, entry)** — no line
  number, no per-occurrence count: `SLOP-FOUND(<file>): <entry>` (design C-R2).
- Self-exclusion + waiver + output/exit semantics identical to C1 (`SLOP-WAIVE(<file>):
  <reason>` clears a file). Advisory always exits 0 but prints; blocking → `EXIT_FOUND` on
  un-waived findings or read errors. Loud `cannot read <file>` on unreadable input.

**New `engine/test/prose-lint-main.test.js`** (ESM, mktemp fixtures, `makeCaptureIo`): a doc
with `delve` → `SLOP-FOUND(<file>): delve`, advisory exit 0; `robustness` (contains `robust`)
→ **no** finding (word-boundary); the phrase `it's important to note` → a finding;
`--gate blocking` → `EXIT_FOUND`; `SLOP-WAIVE(<file>)` in a `--waiver-source` → cleared;
unreadable file → loud `cannot read`; **PR-body surface** — pass a mktemp file standing in for
the PR body containing a banned phrase as an argv file → flagged (proves the uniform argv
treatment); **self-exclusion** — pass
`fileURLToPath(new URL('../src/prose-lint-main.js', import.meta.url))` with `--gate blocking`
→ exit 0 (RED without `isSelf`: the module's `BAN_LIST` self-matches). Fold a small
generative check: each `BAN_LIST` entry embedded in text yields exactly one finding.

**New `engine/test/prose-lint.bin.test.js`** (ESM spawn-smoke): clean mktemp doc → exit 0;
`--gate blocking` over a mktemp doc containing `seamless` → non-zero.

### TDD steps
- **RED** Write both test files (fail: modules absent).
- **GREEN** Write `engine/src/prose-lint-main.js` then `engine/bin/prose-lint.js` until the
  matrix is green; the phrase-vs-word branch and self-exclusion are explicit RED→GREEN steps.
- **REFACTOR** Share the tiny helper shapes with C1 conceptually but keep the modules
  independent (no cross-import — C1 and C2 are the same workstream but must not couple to a
  shared new module beyond node built-ins). Keep the module free of the ban-list words in any
  non-`BAN_LIST` position (dogfood).

### Gate
- Part: `cd engine && node --test test/prose-lint-main.test.js test/prose-lint.bin.test.js`
- Phase-boundary: `bash scripts/ci.sh` (new engine tests enumerated; `source-hygiene` clean
  over `engine/src/prose-lint-main.js`).

### Commit
`feat: prose anti-slop lint over touched docs and PR body`

---

## Part 5 — C3: `hygiene.gate` manifest knob

### Context
**Goal (C6, ADR-212):** one shared `hygiene: { gate: advisory|blocking }` manifest block,
validated exactly like `intention.gate` against a frozen set, fail-closed on an unknown value.
Engine-only; craft's own `.claude/workflow.md` declares no `hygiene` block (so its effective
value is the default `advisory`), and `ci.sh` does **not** read the manifest — this part adds
the schema + validation for downstream adopters and pins it under test.

**Precedent (mirror exactly):**
- `engine/src/manifest-vocabulary.js` — `TOP_KEYS` (L7–11, a frozen `Set`) and
  `INTENTION_GATES = Object.freeze(new Set(['advisory','blocking']))` (L63).
- `engine/src/manifest.js` — `validateIntention` (L227–274, `gate` check at L255–257) and the
  dispatch `switch` (L439+) with `case 'intention': validateIntention(value, fileExists,
  errors); break;`.
- `engine/test/manifest.test.js` — the intention gate tests (L2316–2334): `sut =
  validateManifest`; `sut({ intention: {...} }, { fileExists: ALWAYS_EXISTS })`; assert
  `result.ok === false` and `result.errors.some(e => e.includes('unknown intention gate'))`,
  and an `advisory`/`blocking` → `ok:true` pair.

**Edits:**
1. `engine/src/manifest-vocabulary.js` — add `'hygiene'` to the `TOP_KEYS` set; add
   `export const HYGIENE_GATES = Object.freeze(new Set(['advisory','blocking']));`.
2. `engine/src/manifest.js` — add `HYGIENE_GATES` to the existing `manifest-vocabulary.js`
   import (alongside `INTENTION_GATES` at L26); add `validateHygiene` (no `fileExists`
   needed, like `validatePolicy`):
   ```
   function validateHygiene(hygiene, errors) {
     if (typeof hygiene !== 'object' || hygiene === null || Array.isArray(hygiene)) {
       errors.push('hygiene must be an object { gate }');
       return;
     }
     for (const k of Object.keys(hygiene)) {
       if (k !== 'gate') errors.push(`unknown hygiene field: ${k}`);
     }
     const { gate } = hygiene;
     if (gate !== undefined && !HYGIENE_GATES.has(gate)) {
       errors.push(`unknown hygiene gate: ${gate} (expected one of advisory, blocking)`);
     }
   }
   ```
   Add `case 'hygiene': validateHygiene(value, errors); break;` in the dispatch `switch`.
3. `engine/test/manifest.test.js` — add, beside the intention-gate tests, the mirrored
   `validateManifest` cases for `hygiene`.

Note: `engine/test/init-emit.test.js` has its **own** local `const TOP_KEYS` (L12) — an
emit-side allowlist that `emitManifest` never populates with `hygiene`; it is independent of
the source `TOP_KEYS` and needs **no** edit here (do not conflate the two when grepping).

No new exported public API beyond `HYGIENE_GATES` (consumed only by `manifest.js`, mirroring
`INTENTION_GATES`; no barrel to update). Mutation coverage: the added acceptance/rejection
tests kill the `HYGIENE_GATES` membership mutants and the `TOP_KEYS` `'hygiene'` addition
(removing it makes `hygiene` an unknown top-level key → the acceptance test flips to `ok:false`).

### TDD steps
- **RED** Add to `engine/test/manifest.test.js` (`sut = validateManifest`, `ALWAYS_EXISTS`):
  1. `{ hygiene: { gate: 'loud' } }` → `ok:false`, error includes `unknown hygiene gate`.
  2. `{ hygiene: { gate: 'advisory' } }` → `ok:true`.
  3. `{ hygiene: { gate: 'blocking' } }` → `ok:true`.
  4. `{ hygiene: { bogus: 1 } }` → `ok:false`, error includes `unknown hygiene field`.
  5. `{ hygiene: [] }` → `ok:false`, error includes `hygiene must be an object`.
  All fail: `hygiene` is currently an unknown top-level key (or unvalidated).
- **GREEN** Apply edits 1 + 2. All five pass.
- **REFACTOR** Confirm `validateHygiene` reads like `validateIntention`'s gate branch (early
  return on non-object; accumulate, no swallow).

### Gate
- Part: `cd engine && node --test test/manifest.test.js`
- Phase-boundary: `bash scripts/ci.sh` (engine suite; `source-hygiene` over `engine/src`).

### Commit
`feat: validate a hygiene.gate advisory|blocking manifest knob`

---

## Part 6 — C4: wire stub + prose gates into `ci.sh` (+ token family + GUIDE)

### Context
**Goal (C-R3/C wiring):** run the two gates in the `ci.sh` cadence over the branch-diff
touched set, advisory (craft's default posture, C7), non-adjacent to `run_intention_lint`
(revert contract). Add the four `STUB-*`/`SLOP-*` tokens to the `skills/run/SKILL.md` token
family and one `hygiene.gate` subsection to `docs/GUIDE-customizing.md`. This part depends on
the bins from Parts 3–4 (already present).

**Append at the END of `scripts/ci.sh`** (after the L79–83 lint chain — that chain is the
separator that keeps this block non-adjacent to `run_intention_lint` at L59–77). Bash
must be macOS-`bash 3.2`-safe: guard possibly-empty arrays with `${arr[@]+"${arr[@]}"}`.
```
# --- hygiene gates (workstream C): touched-diff stub + prose lints, advisory ---
# Distinct block, non-adjacent to run_intention_lint, so each workstream reverts
# without conflicting on this file.
compute_touched() {
  local base
  base="$(git merge-base HEAD main 2>/dev/null || true)"
  [ -n "$base" ] || return 0
  git diff --no-ext-diff --name-only "$base"..HEAD 2>/dev/null | while IFS= read -r f; do
    [ -e "$f" ] && printf '%s\n' "$f"
  done
}
run_stub_lint() {
  local -a src=() waivers=()
  local f
  while IFS= read -r f; do
    case "$f" in
      *.test.js) ;;
      test/*|*/test/*|test-helpers/*|*/test-helpers/*) ;;
      *.js|*.mjs|*.cjs|*.ts|*.sh) src+=("$f") ;;
      *.md) waivers+=(--waiver-source "$f") ;;
    esac
  done < <(compute_touched)
  [ "${#src[@]}" -eq 0 ] && return 0
  node engine/bin/stub-lint.js ${waivers[@]+"${waivers[@]}"} "${src[@]}"
}
run_prose_lint() {
  local -a docs=() waivers=()
  local f
  while IFS= read -r f; do
    case "$f" in
      *.md) docs+=("$f"); waivers+=(--waiver-source "$f") ;;
    esac
  done < <(compute_touched)
  [ "${#docs[@]}" -eq 0 ] && return 0
  node engine/bin/prose-lint.js ${waivers[@]+"${waivers[@]}"} "${docs[@]}"
}
run_stub_lint
run_prose_lint
```
- **Advisory contract:** the bins default advisory (no `--gate` passed) → they return 0 even
  with findings → `ci.sh` stays green under `set -e`. Findings print to the run record. On
  trunk `git merge-base HEAD main == HEAD` → empty diff → both functions return 0 (clean
  no-op). A diff that can't be computed → empty touched set → no-op (never a crash).
- **Expected, benign advisory self-reference:** `run_stub_lint` scans `scripts/ci.sh` (a
  touched `.sh` file), which now contains the literal `engine/bin/stub-lint.js` — the marker
  `STUB` matches (`/` and `-` are word boundaries), so an advisory `STUB-FOUND(scripts/ci.sh):
  STUB@L…` prints. This is advisory-only (never blocks) and correct; do not add suppression.
- **Source/docs partition** (plan-pinned per design "plan detail"): source = touched files
  matching `*.js|*.mjs|*.cjs|*.ts|*.sh` excluding test files/dirs; docs = touched `*.md`.
  Test files are excluded so seeded test fixtures (e.g. `stub-lint-main.test.js`'s `TODO`
  fixtures) never self-flag. The stub gate's own module `engine/src/stub-lint-main.js` is
  additionally excluded inside the bin (Part 3 self-exclusion).

**Edit `skills/run/SKILL.md`** — the run-record token family is enumerated around L91–95
(`NO-OP(<phase>):`, `GATE(<phase>):`, `auto-skip:`, `WAIVER:`, `POLICY(...)`,
`INTENTION-DRIFT(<page>):`, `INTENTION-WAIVE(<page>):`). Append the four C tokens to that
family, verbatim and greppable: `STUB-FOUND(<file>):`, `STUB-WAIVE(<file>):`,
`SLOP-FOUND(<file>):`, `SLOP-WAIVE(<file>):`. Keep the sentence prose-lint-clean (no seed slop
words) since it is a touched doc.

**Edit `docs/GUIDE-customizing.md`** — add ONE short subsection near "### HOW it's checked —
gate · harness config" (L154) documenting the `hygiene.gate: advisory|blocking` knob (default
advisory; promotes both the stub and prose gates to blocking together; validated exactly like
`intention.gate`). Keep it a separate, self-contained section (only C touches this file). Keep
it free of seed slop words.

**New `test/hygiene-gates-ci.test.js` (CJS)** — read `scripts/ci.sh` and `skills/run/SKILL.md`
as text (`ROOT = path.resolve(__dirname, '..')`), assert:
1. `ci.sh` includes `run_stub_lint`, `run_prose_lint`, and calls both.
2. **Non-adjacency:** `ci.sh.indexOf('run_intention_lint') < ci.sh.indexOf('shellcheck
   scripts') < ci.sh.indexOf('run_stub_lint')` — proving the existing lint chain separates the
   A2 region from the C block (single-commit revert independence).
3. `skills/run/SKILL.md` includes all four `STUB-FOUND`/`STUB-WAIVE`/`SLOP-FOUND`/`SLOP-WAIVE`
   tokens.
(End-to-end "blocking → non-zero" is proven by the bin spawn-smokes in Parts 3–4; the ci.sh
cadence is advisory, so this test asserts wiring + separation, not a non-zero exit.)

### TDD steps
- **RED** Write `test/hygiene-gates-ci.test.js` — all three assertions fail (no wiring/tokens).
- **GREEN** Append the ci.sh block; add the four tokens to `skills/run/SKILL.md`; add the
  GUIDE subsection. The three assertions pass.
- **REFACTOR** Run `shellcheck scripts/ci.sh` (must be clean, incl. the `${arr[@]+…}` guards);
  run `bash scripts/ci.sh` end-to-end and confirm it exits 0 with advisory `STUB-FOUND`/
  `SLOP-FOUND` lines printed (not failing).

### Gate
- Part: `node --test test/hygiene-gates-ci.test.js` (repo root) and `shellcheck scripts/*.sh`
- Phase-boundary: `bash scripts/ci.sh` (now exercises `run_stub_lint`/`run_prose_lint` over
  the cumulative touched set, advisory → green; `source-hygiene` over `skills/` and `docs`).

### Commit
`feat: wire stub and prose hygiene gates into ci.sh advisory cadence`

---

## Part 7 — B: `craft:prune` standing harness-prune skill

### Context
**Goal (B-R1..R4, ADR-209):** a standalone, on-demand `craft:prune` skill —
propose-never-dispose, `contracts/core.md` as a fail-closed denylist, no engine code, no
pipeline phase, zero drag. Pure prose; reverts by deleting `skills/prune/`. This part touches
**no** `scripts/ci.sh`, **no** `skills/run/SKILL.md`, **no** `docs/GUIDE-customizing.md`, and
**no** `engine/**` — it is a single new file under a new directory.

**Precedent to model:** `skills/metrics/SKILL.md` (`craft:metrics`) — a standalone,
session-owned, on-demand skill that is NOT in `pipeline/default.yml`. Copy its shape:
frontmatter (`name`, `description` with a `Triggers —` clause, `argument-hint: []`), a
"standalone session-owned skill … ADVISORY" preamble, a Procedure, an Error-semantics table.

**New file `skills/prune/SKILL.md`** — required content:
- **Frontmatter.** `name: prune`; `description:` one-liner + `Triggers — "craft:prune",
  "harness prune review", "prune the harness", "delete the harness against the new model".`;
  `argument-hint: []`.
- **Nature.** Standalone, session-owned, on-demand; NOT a pipeline phase; an uninvoked skill
  is inert → zero drag (B-R4). Read-only: writes no harness file (B-R2).
- **Inspection scope (B6(a)).** `contracts/*.md`, the lint set (`scripts/*-lint.sh`,
  `engine/bin/*-lint.js` + their `engine/src` modules), and skill/agent prose (`skills/**`,
  `agents/**`). Flag *drag* the current model no longer needs (redundant belt-and-braces
  guidance, lints superseded by a newer mechanism, prose restating native model behavior).
  Read the current model identity from the run context / `docs/model-class-matrix.md`.
- **Output.** A **proposal only** — a structured list, each candidate carrying `{ unit,
  rationale, what-would-replace-the-safety-it-provided }`. Emit a fixed greppable advisory
  token **defined here, in this skill only** (never in `skills/run/SKILL.md`):
  `PRUNE-CANDIDATE(<unit>): <rationale>`.
- **Undroppable-core guarantee (B-R3), structural not classifier-based:**
  1. **Denylist.** Read `contracts/core.md`; refuse to emit any candidate mapping to a core
     invariant (plus the non-overridable cross-phase invariants). **Fail-closed:** if the
     denylist source is unreadable, emit **no** proposals rather than proposing against an
     empty denylist.
  2. **Propose-only.** Delete/edit nothing; a human reviews.
  3. **Enactment through the pipeline.** An approved prune is enacted only via a normal craft
     feature run (design → decisions → … → validation), where the existing gates
     (`contracts-lint`, `source-hygiene`, the mutation gate, DoD lints) protect the core.
- **Trigger.** Manual / documented (in this frontmatter) — the ratified floor; no
  auto-detection, no cadence timer, no new pipeline phase (all five balloon axes declined).
- **Error semantics table** (mirror metrics): denylist unreadable → fail-closed (no
  proposals, recorded); empty/quiet inspection surface → recorded no-op; never a blocker.
- **Prose hygiene (dogfood):** author the file free of `source-hygiene` banned tokens
  (`stryker`/`mutation`/`mutant`, bare `gh`/`github`, vendor-suffixed filenames) and of the
  seed slop words (`delve`/`leverage`/`seamless`/`robust`/"it's important to note"/"in
  conclusion") — it is scanned by `source-hygiene` (`skills/**` is in `SCANNED_PATHS`) and,
  as a touched `.md`, advisorily by `run_prose_lint`.

### TDD steps
Prose-only, no `src/` delta → no engine unit suite (design B test strategy: verify by
inspection/spawn). Treat the gate + the B-R1..R4 checklist as the acceptance harness:
- **RED** No `skills/prune/SKILL.md` exists; `source-hygiene` would also fail if any banned
  token were introduced.
- **GREEN** Author `skills/prune/SKILL.md` satisfying every bullet above. Verify by
  inspection against B-R1..R4: (a) on-demand, not a pipeline phase; (b) propose-only, writes
  no harness file; (c) `core.md` fail-closed denylist refuses core invariants; (d) uninvoked
  = inert. Confirm `PRUNE-CANDIDATE` is defined here and nowhere in `skills/run/SKILL.md`.
- **REFACTOR** Tighten prose; re-scan for banned/slop tokens; confirm the file is the only
  delta and `git status` shows just `skills/prune/SKILL.md`.

### Gate
- Part: `bash scripts/ci.sh` (no dedicated unit suite — prose-only, standalone-exception
  part; the load-bearing check is `source-hygiene` scanning `skills/prune/SKILL.md` and
  `docs-structure-lint`/`shellcheck` staying green).
- Phase-boundary: `bash scripts/ci.sh`.

### Commit
`feat: craft:prune standing harness-prune skill (propose-never-dispose)`
