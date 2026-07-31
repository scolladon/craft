# Plan — scheduled backlog sweep

> Source: design doc `docs/contributing/design/scheduled-backlog-sweep.md` · ADRs `321, 322, 323, 324, 325, 326`
> The plan is the implementation script AND the knowledge handoff. Part agents start
> with zero context: whatever a part block omits is paid later as agent rediscovery.
> `plan-lint` enforces the schema — every `## Part` carries `### Context`, `### TDD steps`,
> `### Gate`, `### Commit`.

## Sizing rules

- Every part costs a full agent lifecycle (spin-up, zero-context rebuild, gate) — it
  must earn it. No standalone test-only parts for FEATURE code: coverage/interop/property
  tests fold into the implementation part whose code they exercise. EXCEPTION:
  test-infra-only and docs-only parts (tooling config, test helpers, fixtures,
  harness/ADV/property suites, docs/prose) with no `src/` delta ARE standalone.
- A part that would be a pure test pass over already-landed code merges into its
  neighbour.

## How the design's twelve seams became ten parts

The design's `### Part-partition seams` table (design doc line 879) names twelve seams,
A–L. **Seams D and E produce no code part.** D (locality-advisory specificity) is settled
by ADR-324 with the detector unchanged; E (Windows path separators) is settled by ADR-325
as documented-not-implemented. Their deliverable is the measurement, which already lives in
the design doc and in the two ADRs. **Their closure belongs to the documentation phase**
(backlog entries ticked, references linked) — not to any code part here, and no part below
should try to "implement" them.

The remaining ten seams map one-to-one onto Parts 1–10. **Nothing was merged and nothing
was split**, and the two candidates that were weighed and rejected are:

- **Merging Part 4 (F) into Part 5 (G).** F is small — one glob in a `case` arm plus one
  order-locked regex. But the design's own rule applies: F and G are two unrelated failure
  modes (prose-lint excuse coverage vs. a report-completeness bug in a different script),
  and folding them behind one commit destroys the revert granularity that keeps these lint
  scripts safe to touch. A byte-pinned two-file pair is a proven part size in this repo.
- **Splitting Part 3 (C) into "delete the guards" and "triage the survivors".** Rejected:
  the mutation accounting spans both halves. C takes three measurement points in one
  sequence (entering the part, after the deletions, after the comments), and the middle one
  — the instrumented total dropping by exactly 16 — is only meaningful inside a single
  part's gate. A deletion-only part would land a change whose whole justification lives in
  the next part's measurement.

## Ordering — binding, not stylistic

1. **Parts 1 → 2 → 3 (seams A → B → C) are strictly sequential.** All three edit
   `engine/src/findings.js`. Never run them in parallel.
2. **Part 3 lands last of the three.** It triages the file's FINAL shape; its mutation hunk
   ranges are only valid post-edit, and it re-edits `parseLineShape`, which Part 1 already
   touched.
3. **Part 6 (H) lands after Part 4 (F)**, so the plan-doc edits stop emitting advisory
   prose-lint noise.
4. **Part 10 (L) lands last overall.** The README plan count is not final until this plan
   doc is committed, and the ADR count moved by six when ADRs 321–326 landed.
5. **Parts 4 and 7 both edit `scripts/ci.sh`, in different functions** — F edits the
   `run_prose_lint` case arm (line 134), I appends to the lint chain (ends line 85). This
   is a deliberate, declared overlap. `plan-lint`'s cognitive-locality advisory will warn
   on `scripts/ci.sh` across Parts 4 and 7, and on `engine/src/findings.js` +
   `engine/test/findings.test.js` across Parts 1–3. **All of those warnings are expected
   and correct.** The advisory never blocks (ADR-306).

Two ordering facts discovered while planning, beyond the design's table:

- **Part 2 invalidates two existing tests' mutation rationale** (`engine/test/findings.test.js:489`
  and `:503`). They probe an embedded newline inside a scope entry to kill the
  `SCOPE_ENTRY_PATTERN` / `WHOLE_FILE_ENTRY_PATTERN` `^`-anchor mutants. Once
  `parseScopeSpec` splits on `\n`, no entry can contain a newline, so the probe no longer
  reaches the anchor and the `^` mutants become unkillable. Part 2 must retarget those
  tests and hand the two anchor mutants to Part 3's triage as **new** survivors (they are
  not among today's 33).
- **Part 10 is only final if no later phase adds a counted doc.** `scripts/readme-drift.sh`
  recounts the tree behind each counted *directory* link. If the documentation phase adds
  an ADR or a design doc after Part 10 lands, the guard goes red again in CI. The docs
  phase must re-run `bash scripts/readme-drift.sh` before the pre-PR gate.

## Harness discipline — read this before running ANY gate

`scripts/ci.sh` spawns real agent binaries. **`aider`, `codex`, `copilot`, `cursor-agent`,
`opencode` and `pi` are all genuinely installed on this machine**, and several suites shell
out to them: an unstubbed `bash scripts/ci.sh` hangs for tens of minutes. Every gate
invocation below — targeted `node --test` runs included, without exception — runs under a
prepended PATH of fast-failing stubs. Establish them once per part, in the shell you gate
from:

```bash
STUBS="${TMPDIR:-/tmp}/craft-agent-stubs"
mkdir -p "$STUBS"
for b in aider codex copilot cursor-agent opencode pi; do
  printf '#!/bin/sh\nexit 2\n' > "$STUBS/$b"; chmod +x "$STUBS/$b"
done
```

Then every gate line reads `PATH="$STUBS:$PATH" …`. **No new test added by this change may
spawn a real agent CLI.**

Two gates in this repo run only in GitHub Actions and are invisible to both the per-part
gate and the phase gate:

- `bash scripts/readme-drift.sh` — its own job (`.github/workflows/ci.yml`). Part 10 runs it
  explicitly.
- `lychee --offline --include-fragments --no-progress --exclude-path engine/node_modules './**/*.md'`
  — the `links` job. `lychee 0.24.2` IS installed locally; Part 6 runs it explicitly.

**Mutation runs (Part 3 only)** happen in a `mktemp` copy of the worktree, never in the
worktree — Stryker writes `engine/.stryker-tmp` in-tree. The copy must include
`engine/node_modules` (Stryker and the tap runner live there).

## Rules every part obeys

- **No provenance refs in source or test code.** No ADR numbers, no phase numbers, no
  backlog ids, no part numbers in `engine/src/**`, `adapters/**/src/**`, `scripts/**` or any
  `*.test.js`. The plan and the design carry provenance; the code carries the reason in its
  own terms. `adapters/opencode/test/agents.test.js` even greps its own mirrors for
  `PROVENANCE_REF`.
- **No suppression directives** — no `@ts-ignore`, no `eslint-disable`, no coverage-ignore
  pragmas, no lint-silencing comments.
- **Equivalent-mutant comments use the exact house phrasing.**
  `// equivalent mutant (<Kind>): <why no caller can observe it>`.
  `test/source-hygiene.test.js` bans the class-A token set (`mutation|mutant|stryker|…`)
  across `engine/src` and allowlists **only** the literals `equivalent mutant`,
  `EQUIVALENT-MUTANT` and `mutant unreachable`. Any other phrasing fails that gate.
- **Test style is the file's own.** `engine/**` and `adapters/**` use ESM
  (`import { test } from 'node:test'; import assert from 'node:assert/strict';`), Given/When/Then
  titles, AAA bodies, a `sut` variable. `test/**` is CommonJS (`require`), same title style.
- **New `test/*.test.js` files need no registration** — `run_suite process test`
  (`scripts/ci.sh:60`) enumerates them by `find`, and `test/every-test-file-registers.test.js`
  requires each one to register at least one test.
- **New `scripts/*.sh` files need no registration** — `shellcheck scripts/*.sh hooks/*.sh`
  (`scripts/ci.sh:80`) covers them by glob. They still must be wired into the run explicitly
  if they are meant to gate anything.

## Part 1 — A: linear pipe delimiter and a 16,384-character per-line cap

### Context

**Surface.** `engine/src/findings.js` (283 lines; exports `normalizeFindings`,
`parseScopeSpec`, `filterFindings`). Consumed by `engine/bin/normalize-findings.js` and
`engine/src/filter-findings-main.js`. Call chain: `normalizeFindings` (line 185) →
`parseLineShape` (149) → `parseLine` (117).

**Three edits, all in that file.**

1. **`PIPE_DELIMITER`, line 17.** Today:
   ```js
   const PIPE_DELIMITER = /\s+\|\s+/u;
   ```
   Becomes the linear lookaround form `/(?<=\s)\|(?=\s)/u` — single-character lookbehind and
   lookahead, no quantifier, no backtracking shape. `String.prototype.split` restarts the
   match at every position; with `\s+` leading, each position inside a whitespace run
   consumes to the end of the run, fails on `\|`, and backtracks. Measured in this tree on
   Node 22: an 80,000-space run costs 6,070 ms today and 0.038 ms at 16,384 under the
   lookaround; at 200,000 characters, 38,959 ms → 0.62 ms.

2. **The per-part trim, `parseLine` line 123.** Today `const parts = remainder.split(PIPE_DELIMITER);`
   becomes `const parts = remainder.split(PIPE_DELIMITER).map(p => p.trim());`.
   **This is mandatory, not cosmetic.** The shipped delimiter's leading `\s+` ate the
   whitespace before the pipe, so `parts[0]` never carried a trailing space. The lookaround
   matches the pipe alone, so `'HIGH a.js:1 — f | fix'` splits to `['HIGH a.js:1 — f ', ' fix']`
   — and `LINE_HEAD_PATTERN` (line 18) ends `(.*\S)$`, which cannot match a string ending in
   a space. Without the trim every line carrying a fix stops parsing. The trim is what
   restores the shipped delimiter's parts, and it is part of the equivalence claim.

3. **The cap, in `parseLineShape` (line 149).** Add a module constant next to the other
   constants (`const MAX_LINE_CHARS = 16384;`), hoist the existing 120-character `shown`
   truncation above both throws, and raise a dedicated cap-named error **before** the
   `parseLine(line)` call. The exact composed body, verified green against the full
   committed suite while designing — note the `nonBlank.length === 0` early return at
   151–153 **stays in this part** (Part 3 deletes it):
   ```js
   function parseLineShape(raw) {
     const nonBlank = raw.split('\n').filter(l => l.trim() !== '');
     if (nonBlank.length === 0) {
       return [];
     }

     const results = [];
     for (const line of nonBlank) {
       // Truncate the echoed content — input may be long or carry sensitive text.
       const shown = line.length > 120 ? `${line.slice(0, 120)}…` : line;
       if (line.length > MAX_LINE_CHARS) {
         throw new Error(
           `Cannot parse findings: line exceeds the ${MAX_LINE_CHARS}-character cap`
           + ` (${line.length} characters): ${JSON.stringify(shown)}`,
         );
       }
       const finding = parseLine(line);
       if (finding === null) {
         throw new Error(
           `Cannot parse findings: line does not match the per-line format: ${JSON.stringify(shown)}`,
         );
       }
       results.push(finding);
     }
     return results;
   }
   ```
   Three properties are load-bearing: the cap check sits **before** `parseLine`, which is the
   whole point (it bounds the input reaching the split even if the delimiter ever
   regresses); `shown` is computed once per line so both messages echo identically; and the
   cap measures `line` **as split from `raw`**, before `parseLine`'s own `trim()`.

**Why 16,384.** The longest per-line record in `engine/test/fixtures/findings/` is 78
characters; the module's echo truncation is 120. 16,384 is 200× the largest observed record
and sits **above the quadratic's knee**, so the existing ReDoS guards can be raised past
10,000 and still exercise the split rather than terminating at the cap.

**Public-surface decision: `MAX_LINE_CHARS` stays module-private.** It is not exported. The
module's export list is unchanged, so there is no barrel, no facade, no registry and no
generated API surface to update — this repo has none for `engine/src`. The tests declare
their own `const MAX_LINE_CHARS = 16384;` and additionally assert the literal cap value
inside the thrown message, so a drift between the two fails loudly on the message
assertion rather than silently.

**Message-prefix hazard.** Both throws keep the `Cannot parse findings: ` prefix, so every
existing `/Cannot parse findings/` assertion still passes — including the two ReDoS guards,
which would keep passing while silently changing what they prove. That is why both are
retargeted below.

**Tests.** `engine/test/findings.test.js` (61 top-level `test(` calls, 65 cases with the
loops; ESM, `assert/strict`, `sut` variable, fixtures read via `readFixture(name)` from
`engine/test/fixtures/findings/`).

- **`:352`** `'Given a status-prefixed pathological line…'` — `' '.repeat(5000)`, asserts only
  `/Cannot parse findings/`.
- **`:396`** `'Given a per-line input with thousands of spaces before a lone pipe…'` — same
  shape, same loose assertion.

Both must be raised so the **whole line** is exactly `MAX_LINE_CHARS` characters (compute
the run as the cap minus the prefix length — never hardcode a literal 16,384 spaces) and
must assert `/line does not match the per-line format/` specifically. That is the largest
input that still reaches the split.

**No wall-clock assertion anywhere.** Timing assertions are flaky under load; the guarantee
here is structural.

### TDD steps

1. **RED (pin-first, deliberately green).** Add the directed delimiter table as one
   parameterised block of cases asserted **through `normalizeFindings`**, and run it against
   the **shipped** delimiter. All 14 must pass — this run is the pin, not the proof. Shapes:
   no fix; one fix; multiple spaces around the pipe; a tab-delimited pipe; a status prefix
   plus a fix; two delimiters (must throw); a pipe inside the finding (must throw); a pipe
   inside the **fix** (must throw — uncovered today); `|` with no leading space; `|` with no
   trailing space; adjacent delimited pipes `a | | b` (must throw); trailing whitespace in
   the fix; an en-dash separator; multiple spaces around the separator.
   Expected failure reason if any case is red here: the table mis-describes today's
   behaviour and must be corrected before the delimiter is touched.
2. **RED (genuine).** Add the cap test: a per-line record of `MAX_LINE_CHARS + 1` characters
   asserts a message matching `/line exceeds the 16384-character cap/` **and** containing the
   actual length. Expected failure: today it throws
   `Cannot parse findings: line does not match the per-line format: …` — a well-formed
   oversized line is reported as a *format* error.
3. **RED (boundary).** Add: a **well-formed** line of exactly `MAX_LINE_CHARS` characters
   parses successfully (the cap is inclusive at the boundary). Expected failure after a naive
   `>=` implementation; green under `>`.
4. **GREEN.** Apply the three edits above (`PIPE_DELIMITER`, the `.map(p => p.trim())`, the
   cap block with `MAX_LINE_CHARS` and the hoisted `shown`).
5. **GREEN.** Retarget `:352` and `:396` to a whole-line length of exactly `MAX_LINE_CHARS`
   with the format-message assertion.
6. **REFACTOR.** Re-run the whole `engine/test/findings.test.js` suite: the 14-shape table
   must be **identically green** before and after the delimiter swap — that is the committed
   differential. Update the module header comment (lines 9–15) so it describes the
   lookaround delimiter and the trim rather than the retired backtracking shape. No
   provenance refs in the comment.

### Gate

```bash
PATH="$STUBS:$PATH" node --test engine/test/findings.test.js engine/test/filter-findings-main.test.js
```

### Commit

`perf(findings): linear pipe delimiter and a per-line size cap`

## Part 2 — B: newline-delimited scope specs

### Context

**Surface.** `engine/src/findings.js`, `parseScopeSpec` at line 233 in the shipped file
(shifted down by Part 1's added constant and cap block — locate it by name, not by line):

```js
export function parseScopeSpec(spec) {
  if (spec === '') {
    return [];
  }
  // A spec is hand-authored as often as generated, so "a.js:1-9, b.js:1-9" is a
  // likely form. Untrimmed, the space joins the filename and every finding for
  // that file drops silently.
  return spec.split(',').map(entry => parseScopeEntry(entry.trim()));
}
```

`split(',')` becomes `split('\n')`. **Per-entry trimming stays** — a newline-joined spec
carries trailing spaces just as easily. Replace the retired comment with the actual reason
in the code's own terms (a path may contain a comma but can never contain a newline;
splitting on the newline removes the ambiguity at the root) — **no ADR number in the
comment**.

**JSDoc that becomes wrong, in two files:**
- `engine/src/findings.js:227` — `Parses a single comma-joined scope spec into ScopeRange[].`
- `engine/src/filter-findings-main.js:69` — `and a single comma-joined scope spec, and emits the findings falling …`

**Live prose that becomes wrong (the design flags this as the follow-through that turns a
dated example into an incorrect one):**
- `skills/validation/SKILL.md:136` — "Build the **comma-joined** scope spec from the same
  `git diff -U0` walk…". The surrounding mechanics need no change: the spec is already
  written to a `mktemp` `$specfile` and read with `spec="$(cat "$specfile")"` (`:156`), and
  command substitution strips only *trailing* newlines, so interior newlines survive into
  the single `--scope` argv value intact. One argument is still the binding requirement.

Historical documents are **left alone**: `docs/contributing/adr/305-*.md`,
`docs/contributing/design/orchestrator-tax-hardening.md:467,750` and
`docs/contributing/plan/orchestrator-tax-hardening.md:624` are dated records that ADR-323
refines rather than rewrites.

**Tests that must change — this is the deliberate, ratified loss.**
`engine/test/findings.test.js`:

| Line | Today | After |
|---|---|---|
| `:451` | `sut('src/a.js:3-9,src/a.js:20-25')` | newline-joined, same expectation |
| `:462` | `sut('src/a.js:3-9,src/b.js:1-2')` | newline-joined, same expectation |
| `:595` | `'a.js:1-9, b.js:2-4 ,\tc.js:3-3'`, titled "spaces after its commas" | newline-joined with the same surrounding spaces/tab; retitle to name the newline |
| `:607` | `sut('a.js:1-9,   ')` whitespace-only entry rejected | `sut('a.js:1-9\n   ')`, same rejection |

**Two tests whose kill rationale this part destroys — handle them explicitly.**
`:489` (`sut('junk\na.js:1-9')`) and `:503` (`sut('junk\na.js:*')`) sit under a block comment
claiming they kill the `^`/`$` anchor mutants on `SCOPE_ENTRY_PATTERN` (line 34) and
`WHOLE_FILE_ENTRY_PATTERN` (line 38), because `.` never matches `\n`. Once the spec splits
on `\n`, **no entry can contain a newline**, so the probe never reaches the anchor: the
entry `junk` now throws on its own merits and the tests keep passing while proving something
else. Two consequences, both mandatory:

- Retarget both to assert the exact message `malformed scope entry: "junk"` — that pins the
  split point (the first entry, not the whole string), which is the real new behaviour.
  Correct the block comment accordingly; the `$`-anchor probes at `:495` (`'a.js:1-9extra'`)
  and `:509` (`'a.js:*extra'`) are unaffected and still kill the `$` mutants.
- Record for **Part 3**: the two `^`-anchor mutants become unkillable after this part
  (without a newline in the entry, an unanchored `(.+):(\d+)-(\d+)$` matches exactly where
  the anchored one does, because `.+` absorbs any prefix). They are **new** survivors, not
  part of today's 33, and Part 3 documents them in place.

Add to `engine/test/filter-findings-main.test.js` (CommonJS-free ESM file; existing tests
call `main([path, '--scope', 'a.js:1-10'], io)` with a fake `io` whose `stderr.joined()` is
asserted): one test proving a **newline-joined two-entry spec survives the argv round trip**
— one `--scope` value containing a newline, two files' findings kept.

**Public surface unchanged.** `parseScopeSpec` keeps its name, arity and return type; no new
export, no barrel, no registry.

### TDD steps

1. **RED.** `parseScopeSpec('a.js:1-9\nb.js:2-4')` returns both ranges. Expected failure:
   today the whole string is one entry, `SCOPE_ENTRY_PATTERN` cannot match across the
   newline, and it throws `malformed scope entry: "a.js:1-9\nb.js:2-4"`.
2. **RED.** `parseScopeSpec('a,b.js:1-9')` returns one range for the comma-bearing path
   `a,b.js`. Expected failure: today it splits and throws `malformed scope entry: "a"`.
3. **RED.** A comma-joined spec `'a.js:1-9, b.js:1-9'` now throws `malformed scope entry` —
   the deliberate loss, pinned so it is never a surprise. Expected failure: today it parses
   into two ranges.
4. **GREEN.** `split('\n')`, comment replaced, per-entry trim kept.
5. **GREEN.** Retarget `:451`, `:462`, `:595`, `:607` to the newline form; retarget `:489`,
   `:503` and their block comment as described above. Confirm the empty spec still returns
   `[]` and the whole-file `:*` form still requires its marker.
6. **GREEN.** Add the `filter-findings-main` argv round-trip test.
7. **REFACTOR.** Update the two JSDoc blocks (`findings.js` `parseScopeSpec`,
   `filter-findings-main.js:69`) and `skills/validation/SKILL.md:136`. Re-read the SKILL
   snippet end to end to confirm the `$specfile` mechanics still describe what the code does.

### Gate

```bash
PATH="$STUBS:$PATH" node --test engine/test/findings.test.js engine/test/filter-findings-main.test.js
PATH="$STUBS:$PATH" node --test test/validation-digest-pipe.test.js
```

### Commit

`refactor(findings): split scope specs on the newline instead of the comma`

## Part 3 — C: delete three redundant guards and close the mutation baseline

### Context

**This part lands LAST of the three `engine/src/findings.js` parts.** It triages the file's
final shape; every line number below is from the **shipped** file and will have moved after
Parts 1 and 2. Locate every site by function and construct, then re-derive line numbers from
the post-edit file.

**Three deletions, ratified byte-for-byte (this is the one ruling that deviated from the
design's recommendation — the user rejected the reachability carve-out and ruled all three
out).**

| Site | Shipped lines | Why it goes |
|---|---|---|
| `parseJsonShape`'s `if (!Array.isArray(parsed))` throw | 104–106 | Unreachable: private, only called after `looksLikeJsonArray`; `JSON.parse` of a `[`-leading string either throws or yields an array. Probed with `'['`, `'[]x'`, `'[[]]'`, `'[1,2]'`, `'[null]'`. |
| `parseLineShape`'s `if (nonBlank.length === 0) return [];` | 151–153 | Redundant: the `results`/loop pair already returns `[]` when `nonBlank` is empty — the deletion is safe *because* the loop body never runs. |
| `normalizeFindings`'s `if (trimmed === '') return [];` | 187–189 | Reachable but redundant: `parseLineShape` returns `[]` for the same input with or without it. |

**Behaviour after all three are gone, traced:** `normalizeFindings('')` → `raw.trim()` → `''`
→ `looksLikeJsonArray('')` is a bare `startsWith('[')` → `false` → `parseLineShape('')` →
`''.split('\n')` is `['']` → `.filter(…)` is `[]` → the loop never executes → `[]`. Same
value, one indirection deeper. Verified while designing over `''`, `'   '`, `'\n'`, `'\t'`,
`'\n\n'`, `' \t\n '`, `'  \n  \t  \n '`, `'\r\n'` and the five JSON probes: zero mismatches,
values and thrown messages alike.

**Nothing else in the tree references the deleted branches.** The message
`Cannot parse findings: JSON input must be an array` appears exactly once, on the source line
being removed — no test asserts it. `nonBlank` appears only inside `parseLineShape`. All
three deletions are pure removals with **no assertion to update and no test deleted**.

**`engine/test/findings.test.js:108` and `:116` must survive BYTE-UNCHANGED.** They are
`normalizeFindings('')` → `[]` and `normalizeFindings('   \n\n  ')` → `[]`. After the
deletion nothing in `normalizeFindings` says "empty in, `[]` out" in code; the JSDoc
`Zero findings → [].` (shipped line 179) states the contract and **these two tests are its
only executable proof**. The JSDoc line stays. Deleting, merging or weakening either test is
a requirement violation, not a test-suite tidy-up.

**`parseJsonShape`'s resulting shape** is the `try`/`catch` around `JSON.parse` followed
directly by `return parsed.map(mapJsonItem)`. Do not tidy it further — that is out of scope.

**Two measured traps this part MUST encode.**

1. **The instrumented total drops by 16, NOT by 9.** Nine is the count of *unkilled* mutants
   on the three guards; the guards also carry mutants that are killed today and vanish with
   the lines. Per guard, instrumented today: array guard **5**, `parseLineShape` empty guard
   **5**, `normalizeFindings` empty guard **6** — 16, of which 9 are unkilled and **7 are
   currently killed**. Measured on shipped `HEAD`: 224 instrumented → 208 after the three
   deletions alone. An implementer expecting −9 will read the real result as a mis-specified
   range and start debugging a correct run.
2. **After the array-guard deletion, mutant `101:17`'s kill rationale changes.** Today the
   swallowing mutant falls through to the array-guard message, which the loose
   `/Cannot parse findings/` assertion also matches. With the guard gone, `parsed` is
   `undefined` and `parsed.map` raises `TypeError: Cannot read properties of undefined (reading 'map')`,
   which the loose regex does **not** match. Assert the specific `invalid JSON` message
   anyway — it pins the operator-facing diagnostic on its own merits rather than resting on
   either fallthrough. (That `TypeError` path is unreachable in the unmutated module: the
   `catch` always rethrows.)

**The triage work list — 20 killed / 3 documented / 10 removed, summing to exactly 33.**
(33 = today's 34 unkilled minus the one already documented at `filterFindings`, shipped line
271, which is unchanged.)

| Site (shipped coords) | Mutants | Action |
|---|---|---|
| `PIPE_DELIMITER` 17:24 | 1 Regex | **Removed** — Part 1 replaced the construct |
| `LINE_HEAD_PATTERN` 18:27 — `^` dropped | 1 Regex | **Kill**: `'a b HIGH x.js:1 — f'` must throw (the unanchored pattern matches it as `HIGH`/`x.js`/`1`/`f`) |
| `LINE_HEAD_PATTERN` 18:27 — `$` dropped, `\s+`→`\s` | 2 Regex | **Document** — `(.*\S)` is greedy and `toFinding` trims `finding` |
| `toFinding` 54:14 `.trim()` dropped | 1 | **Kill** via the JSON path: a payload whose `finding` carries padding (the per-line path already trims via `\s+(.*\S)$`) |
| `mapJsonItem` guard 80:7 ×3, 80:23, 80:49, 81:21 | 6 | **Kill** with two tests: `normalizeFindings('[null]')` and `normalizeFindings('[1]')`, each asserting the exact `Finding at index 0 is not an object` |
| `parseJsonShape` catch 101:17, 102:77 | 2 | **Kill**: assert the specific `invalid JSON` message, and assert `err.cause` is the original error (the no-swallowed-errors floor rests on that chain) |
| `parseJsonShape` array guard 104:7, 104:31, 105:21 | 3 | **Removed by deletion** |
| `parseLine` 125:7, 125:25 | 2 | **Kill**: `'HIGH a.js:1 — a | b | c'` must throw (no test produces three parts today) |
| `parseLine` 133:15 | 1 Conditional | **Document** — with the `parts.length > 2` guard above, `parts.length ∈ {1,2}` and `parts[1]` is `undefined` when length is 1 |
| `parseLine` 135:33 | 1 Conditional | **Kill**: `'HIGH a.js:1 — f | a|b'` (a pipe in the *fix*; only the *finding* case is covered today) |
| `parseLineShape` blank filter 150:20, 150:48 ×2, 150:61 | 4 | **Kill** with two inputs: an interior empty line and an interior whitespace-only line, each asserting the surviving finding count |
| `parseLineShape` empty guard 151:7, 151:30, 152:12 | 3 | **Removed by deletion** |
| `parseLineShape` echo truncation 160:21 ×2 | 2 | **Kill**: a short unparseable line echoes in full with no `…` (Conditional); an **exactly 120-character** unparseable line echoes in full (EqualityOperator `>`→`>=`) |
| `normalizeFindings` 186:19 `raw.trim()` dropped | 1 | **Kill**: a JSON array with leading whitespace parses today (`normalizeFindings('  [{…}]')`) and would route to the per-line shape under the mutant |
| `normalizeFindings` empty guard 187:7, 187:19, 187:23 | 3 | **Removed by deletion** |

20 + 3 + 10 = 33.

**Beyond the 33 — the change's own code is in scope too.** Part 1 adds roughly +9 instrumented
mutants (the lookaround delimiter, `MAX_LINE_CHARS`, the `>` comparison, the cap message, the
`.map(p => p.trim())`) and Part 2 adds more in `parseScopeSpec`. Every mutant Stryker
instruments on those new lines obeys the same rule — killed by a real test, or documented in
place. **Two are known in advance**, handed over by Part 2: the `^`-anchor mutants on
`SCOPE_ENTRY_PATTERN` and `WHOLE_FILE_ENTRY_PATTERN` become equivalent once no scope entry
can contain a newline (an unanchored `(.+):…$` matches exactly where the anchored one does,
since `.+` absorbs any prefix). Document both in place. Baselining against the 33 and
stopping there would leave this change's own code unmeasured.

**Three in-place equivalent-mutant comments this part adds** (not six — the
`normalizeFindings` empty-guard trio no longer exists to carry any), plus the two anchor
comments above. Form, matching `engine/src/findings.js:271` and the nine in
`engine/src/plan-lint-main.js`:
`// equivalent mutant (<Kind>): <why no caller can observe it>`. Two mutants sitting on one
line take two comment lines directly above the constant. **Read the mutant's exact reported
form in the report before writing its comment** — the rationale must describe the mutant
Stryker actually produced, not the one the table predicts.

**Mutation runner constraints, verified in this tree.**
- Per-hunk runs need **ONE comma-separated `--mutate`**. Repeated flags silently drop all but
  the last and report a clean score over a fraction of the file: measured 27 mutants across
  two repeated flags vs. **53** for the identical comma-joined form.
- Deleting the guard blocks and inserting comment lines both shift every line below them, so
  **re-derive hunk ranges from the post-edit file before every re-run.**
- `engine/stryker.conf.json` declares no `thresholds`, so no run breaks on score. The
  `mutation` script is `cd .. && stryker run engine/stryker.conf.json`.

**Public surface is unchanged by this part.** No symbol is added, renamed or exported;
`normalizeFindings`, `parseScopeSpec` and `filterFindings` keep their names, arities and
return types, so neither consumer named in Part 1 needs a corresponding edit. The one
contract that changes custody is `Zero findings → []`, which moves from an executable guard
to the JSDoc plus the two pinned tests above.

**Regression floor.** Before the guards come out the whole of `engine/test/findings.test.js`
must be green; after, all the same tests must still be green with **none rewritten**. That was
verified while designing (65 cases, 65 pass) against a variant carrying the Part 1
delimiter/trim/cap and all three deletions — so a red test in this part means the
implementation diverged from the ruling, not that the ruling was wrong.

### TDD steps

1. **RED (measurement 1 — the baseline).** In a `mktemp` copy of the worktree, stub PATH
   prepended:
   ```bash
   T="$(mktemp -d)"; tar -cf - --exclude=./.git . | (cd "$T" && tar -xf -)
   PATH="$STUBS:$PATH" npm --prefix "$T/engine" run mutation -- --mutate "engine/src/findings.js"
   ```
   Record the instrumented total and the full survivor list entering this part (post-Parts
   1 and 2). The named survivors ARE the red condition — these tests are mutation-red, not
   assertion-red, and most will be green on arrival against unmutated code. That is expected;
   the proof is each survivor's transition to killed.
2. **GREEN (kills).** Add the 13 test cases the table calls for:
   `'a b HIGH x.js:1 — f'` throws · a JSON payload with a padded `finding` trims ·
   `'[null]'` and `'[1]'` each assert the exact `Finding at index 0 is not an object` ·
   invalid JSON asserts `/invalid JSON/` · invalid JSON asserts `err.cause` ·
   `'HIGH a.js:1 — a | b | c'` throws · `'HIGH a.js:1 — f | a|b'` throws ·
   an interior empty line and an interior whitespace-only line each assert the surviving
   count · a short unparseable line echoes with no `…` · an exactly-120-character
   unparseable line echoes in full · a JSON array with leading whitespace parses.
3. **GREEN (deletions).** Remove the three guard blocks. Run the full
   `engine/test/findings.test.js` — every test must still pass, `:108` and `:116` byte-unchanged.
4. **RED→GREEN (measurement 2 — the −16 pin).** Re-run the full-file mutation in a fresh
   `mktemp` copy. The instrumented total must drop from measurement 1 by **exactly 16**. Any
   other shrink is a mis-specified range or an unintended deletion — stop and reconcile
   before continuing. **Do not accept −9.**
5. **REFACTOR (documentation).** Add the three equivalent-mutant comments (`LINE_HEAD_PATTERN`
   `$`-drop, `LINE_HEAD_PATTERN` `\s`-narrowing, `parseLine` `parts.length === 2`) plus the two
   scope-anchor comments Part 2 handed over. Use the exact house phrasing — `test/source-hygiene.test.js`
   allowlists only `equivalent mutant` / `EQUIVALENT-MUTANT` / `mutant unreachable`.
6. **GREEN (measurement 3).** Re-run the mutation once more. The instrumented total must be
   **unchanged from measurement 2** — comments are not instrumented — and every remaining
   survivor must be one of the documented ones.

### Gate

```bash
PATH="$STUBS:$PATH" node --test engine/test/findings.test.js engine/test/filter-findings-main.test.js
PATH="$STUBS:$PATH" node --test test/source-hygiene.test.js test/mutation-scope.test.js
```

### Commit

`test(findings): delete three redundant guards and close the mutation baseline`

## Part 4 — F: excuse `docs/contributing/plan/` from the prose lint

### Context

**A byte-pinned pair. Both files change in the SAME commit, no exceptions** — the test regex
is order-locked and anchorless, so the two are only ever consistent together.

**`scripts/ci.sh:134`**, inside `run_prose_lint` — six-space indent, `) ;;` with two spaces
before the comment, U+2014 em dash:

```
      docs/contributing/adr/*|docs/contributing/design/*|docs/contributing/archive/*|docs/contributing/specs/*|docs/contributing/prd/*) ;;  # provenance/design docs necessarily quote ban-list words — advisory noise
```

Append `|docs/contributing/plan/*` **after `prd/*`**, keeping the arm empty and the trailing
comment byte-unchanged.

**`test/hygiene-gates-ci.test.js:77`**, four-space indent, inside the test
*"then run_prose_lint excludes provenance/design docs in a skip arm"* (lines 69–80). It reads
the file, extracts `functionBody(content, 'run_prose_lint')`, and matches:

```
    /docs\/contributing\/adr\/\*\|docs\/contributing\/design\/\*\|docs\/contributing\/archive\/\*\|docs\/contributing\/specs\/\*\|docs\/contributing\/prd\/\*\)\s*;;/,
```

Extend it to six globs in the same order. Add a **second assertion** so a future edit cannot
turn the skip arm into an inclusion arm: assert that `docs/contributing/plan/*` occurs exactly
once inside the `run_prose_lint` body and that the arm it sits in is empty (the `\)\s*;;`
tail). The file is CommonJS (`require('node:test')`).

**Measured impact, this tree.** `node engine/bin/prose-lint.js` over all 24 plan files: **7
files, 32 findings** — `close-hygiene-lint-followups.md` (6), `codex-0145-limitation-reprobe.md` (6),
`communication-revamp-four-frames.md` (6), `despecialize-craft-sources.md` (1),
`docs-audience-split.md` (1), `harness-hygiene-prune-gates.md` (6),
`orchestrator-tax-hardening.md` (6). Five of the seven emit all six ban-list entries — they
are the plans that enumerate the ban list while documenting the lint, which is precisely the
self-reference the excuse arm exists for. Re-running the ci.sh-faithful way (every doc also
passed as `--waiver-source`) gives the identical 32/7: there are zero `SLOP-WAIVE(…)` markers
anywhere in the live docs.

**No sibling gap.** Full-repo scan, 673 markdown files, 61 findings: `adr/` 10, `design/` 16,
`archive/` 2, `prd/` 1, `specs/` 0 — all excused — plus `plan/` 32, not excused. `plan/` is the
only un-excused path in the repo producing `SLOP-FOUND`. `docs/guides/` and the loose
`docs/contributing/{README,DOD}.md` are audience-facing prose and stay un-excused.

**Declared overlap.** Part 7 also edits `scripts/ci.sh`, at the end of the lint chain
(line 85) — a different function entirely. `plan-lint`'s locality advisory will warn on the
shared file across Parts 4 and 7; that warning is expected and correct.

**No new public surface.** One glob in an existing arm, one regex extension.

### TDD steps

1. **RED.** Extend the regex at `test/hygiene-gates-ci.test.js:77` to the six-glob form.
   Expected failure: `provenance dirs must be a skipped case arm inside run_prose_lint: …` —
   the shipped `ci.sh` arm lists five globs.
2. **RED.** Add the second assertion (the plan glob appears exactly once in the
   `run_prose_lint` body, in an empty arm). Expected failure: zero occurrences today.
3. **GREEN.** Append `|docs/contributing/plan/*` to the arm at `scripts/ci.sh:134`.
4. **REFACTOR / verify.** Confirm the excuse actually takes effect the way `ci.sh` invokes
   the lint: run `node engine/bin/prose-lint.js` the ci.sh-faithful way over the seven
   offending plan files (each also passed as `--waiver-source`) and confirm zero
   `SLOP-FOUND` lines once they route through the skip arm.

### Gate

```bash
PATH="$STUBS:$PATH" node --test test/hygiene-gates-ci.test.js
shellcheck scripts/ci.sh
```

### Commit

`fix(ci): excuse plan docs from the prose lint`

## Part 5 — G: `--audience` dedupe must compare elements, not token runs

### Context

**Surface.** `scripts/docs-structure-lint.sh`, lines 31–34, inside the `--audience` branch:

```bash
    case " ${top_level[*]:-} " in
      *" $entry "*) : ;;
      *) top_level+=("$entry") ;;
    esac
```

`IFS=` on line 28 is a command prefix scoped to `read`, so inside the loop body `IFS` is the
default and `${top_level[*]}` joins on a space. The membership test therefore matches any
contiguous space-delimited **token run**, not any element: an element containing a space
injects extra internal boundaries.

**Demonstrated against the real script** in a throwaway `git init` tree, top-level entries
`README.md`, `a b`, `b`, `contributing`, `guides`:

```
entry=[README.md]     joined=[  ]                              -> kept
entry=[a b]           joined=[ README.md ]                     -> kept
entry=[b]             joined=[ README.md a b ]                 -> DROPPED (matched " b " at the a·b boundary)
entry=[contributing]  joined=[ README.md a b ]                 -> kept
entry=[guides]        joined=[ README.md a b contributing ]    -> kept
```

Output: `unexpected top-level entry under docs:` / `  a b`, exit 2. `b` is a genuine offender
and is missing from the report. **A false pass stays impossible** — a dropped entry is never
appended so it cannot mask a later one, and any masking name containing a space fails the
spaceless allowlist at line 40 (`README.md|guides|contributing`) and is itself an offender.
This is a report-completeness fix.

**The fix.** The file targets bash 3.2 (stated at line 26), which has no associative arrays.
Use an element-exact loop over `top_level`, and keep the guarded-expansion form the file
already uses at line 38 (`${top_level[@]+"${top_level[@]}"}`) so `set -u` stays happy on an
empty array. `shellcheck scripts/*.sh` must stay clean.

**The test cost the design flags — budget for it.** `test/docs-structure-lint.test.js`
(7 tests, CommonJS, `execFileSync('bash', [SCRIPT, …])`) drives committed fixture subtrees
under `test/fixtures/docs-audience-*` through the repo's own `git ls-files`. **That style
cannot express this bug**: a fixture directory named `a b` under `test/` is invisible to
`--audience docs`, and one under `docs/` would itself trip `scripts/ci.sh:85`. The test needs
a throwaway `git init` tmpdir helper. **Keep the existing seven tests unchanged.**

**Helper, new: `test/helpers/tmp-git-repo.js`** (CommonJS to match the suite; `test/helpers/`
currently holds only `.bash` helpers, and a non-`.test.js` file there is not enumerated by
`test/every-test-file-registers.test.js`). It must:
- `fs.mkdtempSync(path.join(os.tmpdir(), '…'))` **and then `fs.realpathSync()` the result.**
  This is load-bearing on macOS: `$TMPDIR` is `/var/folders/…`, a symlink to
  `/private/var/folders/…`. The script computes `root="$(git rev-parse --show-toplevel)"`
  (physical) and `rel="$(cd "$dir" && pwd)"` (logical); without the realpath the prefix strip
  at line 22 silently no-ops, every path keeps its `docs/` head, and the test measures the
  wrong thing entirely.
- Build the tree, then `git init` and `git add -A` — `git ls-files` reads the **index**, so no
  commit is needed. Run git with `-c user.email=… -c user.name=…` so a bare environment
  cannot fail.
- Return the realpath'd root and clean up with `fs.rmSync(root, { recursive: true, force: true })`.

**Public-surface decision:** the helper is **internal test infrastructure** — required only
by `test/docs-structure-lint.test.js`, not exported through any barrel or index (this repo
has none for `test/`). It is auto-covered by no gate and needs no registration.

### TDD steps

1. **RED.** New test: a throwaway repo with top-level `README.md`, `a b/`, `b/`,
   `contributing/`, `guides/` under `docs/`; run `bash scripts/docs-structure-lint.sh --audience <tmp>/docs`;
   assert exit 2 and that stderr names **both** `a b` and `b`. Expected failure: only `a b` is
   reported — `b` is swallowed by the token-run match at the `a`·`b` boundary.
2. **RED.** The symmetric case: entries `x/`, `y/`, then `x y/` — assert all three are named.
   Expected failure: the same dedupe drops one.
3. **GREEN.** Replace the `case`-on-joined-string dedupe with an element-exact loop, bash
   3.2-compatible, guarded expansion, shellcheck-clean.
4. **REFACTOR.** Re-run the seven existing tests unchanged, including the one that drives the
   live `docs/contributing` tree, and confirm `bash scripts/docs-structure-lint.sh --audience docs`
   still passes against the real repo.

### Gate

```bash
PATH="$STUBS:$PATH" node --test test/docs-structure-lint.test.js
shellcheck scripts/docs-structure-lint.sh
bash scripts/docs-structure-lint.sh --audience docs
```

### Commit

`fix(docs-lint): report every top-level offender when a name contains a space`

## Part 6 — H: rebalance the runaway fence and correct the prose that misdiagnosed it

### Context

**Lands after Part 4**, so these plan-doc edits no longer emit advisory `SLOP-FOUND` noise.

**The mechanism, isolated by bisect with the real tool (`lychee 0.24.2`, installed here).**
`docs/contributing/plan/readme-drift-guards.md` quotes the README's mermaid block verbatim,
fences included. CommonMark cannot express that nesting: a fence opened with N backticks is
closed by the first line whose backtick run is ≥ N and carries no info string.

| line | today | role |
|---|---|---|
| 97 | bare ``` ``` ``` | **opens** |
| 98 | ` ```mermaid ` | info string — cannot close, so it is content |
| 112 | bare ``` ``` ``` | **closes the block line 97 opened** — one line early |
| 113 | bare ``` ``` ``` | therefore **flips from closer to opener** |

Every later fence role inverts: 113→125 swallows prose 114–124; 126–128 leaks the yaml body
as a paragraph; **129→361 is a code block swallowing 130–360, including the link at 134**;
471→EOF is an unclosed block. Probe links inserted after 16 chosen lines matched the
prediction **16 of 16**.

**The fix, two characters, verified in a throwaway copy of the file (never the worktree):**
change **line 97** and **line 113** from ``` ``` ``` to ```` ```` ```` (three backticks → four).
A CommonMark-faithful scan then reports the file balanced; before the fix it reports
`UNCLOSED … opened at line 471`. That is the entire structural fix — no other line moves.

**The second half is the point.** Rebalancing alone turns a silent bug into a red `links` job:
line 134 is the file's only `](` and reads

```
> **What does a run cost?** Across the [27 telemetered runs](docs/metrics-baseline.report.json)
```

It is a **verbatim README quote of a pre-audience-split README**. The file now lives at
`docs/contributing/plan/`, lychee resolves relative links file-relative, and
`docs/metrics-baseline.report.json` does not exist from there — after the fence fix lychee
reports `File not found` at `134:40`. Since the line is a quotation, the honest resolution is
to **de-link it**, not to retarget a quote to something the README does not say: wrap the whole
markdown link in a code span, exactly as the design doc's own copy does —
`` `[27 telemetered runs](docs/metrics-baseline.report.json)` ``. **Verified with the real
tool:** lychee extracts zero links from a code span and still extracts a live link on the same
page, so the quote survives verbatim and the `links` job stays green for a real reason.

**The wrong prose lives in a different file than the backlog entry implies.**
`docs/contributing/plan/readme-drift-guards.md` contains **zero** occurrences of "lychee". The
incorrect claim is at `docs/contributing/plan/docs-audience-split.md:356-360`:

> **LEAVE (Category-3, lychee-invisible):** the `[27 telemetered runs](docs/metrics-baseline.report.json)`
> quote inside `docs/plan/readme-drift-guards.md` sits inside a fenced/code block quoting the README
> verbatim — lychee extracts ZERO links from that file (confirmed), so it is NOT a dangler and needs
> no rewrite.

Wrong on the mechanism (the invisibility was a fence-inversion bug, not a deliberate fenced
quote) and wrong on the conclusion (the target is stale **and** wrong for a file-relative
resolver — it *is* a dangler). Correct it to the measured cause and record it as debt that has
since been paid, keeping the surrounding "LEAVE"/"Category" vocabulary of that document intact.

**The guard, new: `test/plan-doc-fences.test.js`** (CommonJS, `test/` suite). Scan every
`docs/contributing/plan/*.md` under a CommonMark-faithful reading and assert none ends inside
an open fence. Algorithm: an opener is `^ {0,3}(`{3,}|~{3,})`; a closer is the same fence
character, a run **at least as long** as the opener's, and an **empty info string**; report the
opening line number of anything still open at EOF.
**Measured now:** exactly one offender across the 24 plan docs —
`readme-drift-guards.md`, block opened at line 471 — and zero after the two-character fix.
`docs-audience-split.md` has an odd raw count of column-zero fences and is nonetheless
**balanced** under this reading; a naive parity check would flag it falsely, so do not write
one.

**Public-surface decision:** the new test file is internal test infrastructure, auto-discovered
by `run_suite process test` (`scripts/ci.sh:60`) and auto-covered by
`test/every-test-file-registers.test.js`. No registration, no barrel, no docs surface.

**This is a docs-plus-guard part with no `src/` delta** — legitimately standalone under the
sizing rules.

### TDD steps

1. **RED.** Add `test/plan-doc-fences.test.js` with the CommonMark fence scan over
   `docs/contributing/plan/*.md`. Expected failure: one offender,
   `readme-drift-guards.md`, unclosed block opened at line 471.
2. **GREEN.** Change lines 97 and 113 of `docs/contributing/plan/readme-drift-guards.md` from
   three backticks to four. Re-run: zero offenders.
3. **RED (link oracle).** Run the real tool over the file:
   `lychee --offline --include-fragments --no-progress docs/contributing/plan/readme-drift-guards.md`.
   Expected failure after step 2: `File not found` at `134:40` — the link is now visible and
   is a dangler.
4. **GREEN.** De-link line 134 by wrapping the whole markdown link in a code span, leaving the
   quoted sentence otherwise byte-identical. Re-run lychee: zero links extracted, zero errors.
5. **GREEN (prose).** Correct `docs/contributing/plan/docs-audience-split.md:356-360` to state
   the fence-inversion mechanism and the dangling target, and to record it as debt now paid.
   No gate exists for "this sentence states the right mechanism" — this one is checked by
   reading.
6. **REFACTOR.** Run the full CI links command locally as the end-to-end oracle:
   `lychee --offline --include-fragments --no-progress --exclude-path engine/node_modules './**/*.md'`.

### Gate

```bash
PATH="$STUBS:$PATH" node --test test/plan-doc-fences.test.js
lychee --offline --include-fragments --no-progress --exclude-path engine/node_modules './**/*.md'
```

### Commit

`fix(docs): rebalance the readme-drift-guards fences and correct the misdiagnosed prose`

## Part 7 — I: adapter mirror sync tool, plus opencode's missing byte-identity guard

### Context

**Inventory, verified live.** Nine shared bodies in `agents/*.md` — `backlog-ticker`,
`designer`, `docs-writer`, `harness-triager`, `part-implementer`, `planner`,
`refactor-executor`, `requirements-writer`, `reviewer`. Six adapters mirror them at
`adapters/<adapter>/agents/craft-<role>.md`: **aider, antigravity, codex, copilot, cursor,
opencode** — 54 mirrors, all byte-in-sync right now. **`adapters/pi` has no `agents/`
directory** and must not be treated as a drifted adapter; discover mirroring adapters by the
existence of `adapters/*/agents/`, never by a hardcoded list.

**Extraction rule — line-exact, not a string split.** All six guards do:

```js
const lines = content.split('\n');
if (lines[0] !== '---') throw new Error('missing opening frontmatter fence');
const closeIndex = lines.indexOf('---', 1);
if (closeIndex === -1) throw new Error('missing closing frontmatter fence');
const body = lines.slice(closeIndex + 1).join('\n').replace(/^\n+/, '');
```

A line must be **exactly** `---`. `grep -c '^---$' agents/*.md` returns 2 for all nine, so a
naive `split('---')` happens to agree today — implement the line-exact form to match the
guards, not the coincidence.

**The two write shapes.**
- **aider** (`adapters/aider/agents/craft-<role>.md`): the shared body **alone**, no
  frontmatter fence, no leading blank line. Its guard
  (`adapters/aider/test/native-surface.test.js:65-81`) compares the mirror's **raw bytes** to
  `bodyOf(sharedAgentPath(role))` and separately asserts `doesNotMatch(sut, /^---/)`. Verified:
  zero of the nine aider mirrors start with `---` or with a newline.
- **The other five**: preserve the mirror's own frontmatter byte-for-byte and replace only the
  body. **Preserve the existing separator run too** — measured across all 45:

  | adapter | blank lines between the closing `---` and the body |
  |---|---|
  | antigravity, codex, cursor, opencode | 1 for all 9 |
  | **copilot** | **0 for 8 of 9; 1 for `craft-reviewer.md`** |

  A writer that always emits `fence + "\n\n" + body` therefore rewrites eight copilot mirrors
  and **fails its own idempotence test**. The correct rule: keep everything up to and including
  the closing fence **plus the existing run of blank lines after it**, then append the shared
  body with its own leading newlines stripped. That is byte-preserving, idempotent, and
  guard-equivalent (the guards strip leading newlines on both sides).

**The tool: `scripts/sync-adapter-agents.sh` (new).** Bash, `set -euo pipefail`, resolving the
repo root from its own location the way `scripts/ci.sh:8` does. Contract:
- `--check` is the **default** read-only mode; `--write` must be explicit. A mistyped
  invocation can never write. An unknown flag is a usage error on stderr, exit 2.
- `--check` prints one line per problem — `sync-adapter-agents: <adapter>/<role>: drifted` — and
  exits non-zero; clean means no output and exit 0. This matches the house check-only shape
  (`scripts/readme-drift.sh` → one `<tool>: <surface>: <detail>` line per finding, aggregate,
  exit 1 if any). There is no other `--check` flag in the repo today; this establishes it.
- A role present in `agents/` but **absent** from a mirror directory is **reported**
  (`: missing`), never silently created and never silently ignored — in both modes.
- `--root <dir>` is an optional documented flag so the tests can drive a fixture tree.
- The tool spawns no agent binary and needs no node dependency (pure fs/awk).

**Public-surface decision: the script IS new public surface.** It is a repo-level tool, so it
pre-pays every downstream gate this repo has for one, in this part:
`shellcheck scripts/*.sh` (`scripts/ci.sh:80`) covers it by glob with no registration;
`run_suite process test` (`:60`) picks up its new test file by `find`;
`test/every-test-file-registers.test.js` requires that file to register a test; and the
**check mode must be wired into `scripts/ci.sh`** — append it as a continuation of the lint
chain that ends at line 85 (`&& bash scripts/docs-structure-lint.sh --audience docs`). There is
no barrel, no facade, no exhaustiveness switch, no generated API report and no command
registry in this repo for scripts. `--root` is documented in the script's usage block as the
test seam it is.

**Declared overlap.** Part 4 edits the same file at line 134, inside `run_prose_lint`. This
part appends at the end of the lint chain, ~line 85. `test/hygiene-gates-ci.test.js` also
asserts that the hygiene block "sits after the lint chain and non-adjacent to
run_intention_lint" using `indexOf('shellcheck scripts')` and `indexOf('run_stub_lint')` —
appending inside the chain keeps that ordering true; re-run that suite to confirm.

**opencode's missing guard — closing it is IN scope for this part.**
`adapters/opencode/test/agents.test.js` is the only mirror guard with **no byte-identity
assertion**. Its sole directory constant is `AGENTS_DIR` (line 8), pointing at the mirror
itself; there is no `REPO_ROOT`, no `SHARED_AGENTS_DIR`, no `sharedAgentPath`. Its five
describe blocks (lines 81, 93, 121, 133, 171) cover existence, frontmatter contract,
model-tier consistency, permission capabilities and body provenance hygiene — the last two only
via `assert.doesNotMatch` regex scans, never an equality against the shared source. It already
carries its own `parseFrontmatter` (lines 27–49, the exact line-exact form above) and
`readAgentDef(role)` (51–55). Add a describe block mirroring the cursor shape
(`adapters/cursor/test/native-surface.test.js:75-85`): for each of the nine roles, compare the
mirror's parsed body to the shared file's parsed body with `assert.equal`. **Leave the other
five adapters byte-unchanged.**

**Why the duplication stays.** The six per-adapter guards are the tool's oracle. If the tool's
extraction and a guard's extraction were refactored into a shared helper, a bug in that helper
would pass both — which is exactly the silent corruption this tooling exists to prevent.
**Do not consolidate `bodyOf`/`parseFrontmatter` anywhere.**

**Anti-tax constraint.** No seam in this run edits a shared agent body, so `--check` must be
green at the end of this part. Never leave the tree half-synced.

### TDD steps

1. **RED.** New `test/sync-adapter-agents.test.js`, every case against a fixture tree built in
   `fs.mkdtempSync` (**never** the worktree): `--check` on a clean fixture exits 0 and prints
   nothing. Expected failure: the script does not exist.
2. **RED.** `--check` on a tampered mirror exits non-zero and names **exactly** that mirror.
3. **RED.** `--write` restores byte-identity; a second `--write` changes nothing (idempotence —
   this is the case the copilot separator finding above exists to protect).
4. **RED.** After `--write`, the aider output starts with neither `---` nor a blank line.
5. **RED.** A role present in `agents/` but absent from a mirror directory is reported, not
   created and not ignored. An adapter directory with no `agents/` (the `pi` shape) is not
   reported as drifted.
6. **GREEN.** Write `scripts/sync-adapter-agents.sh` implementing the extraction and both write
   shapes, `--check` default / `--write` explicit / `--root` optional, shellcheck-clean.
7. **GREEN.** Append `bash scripts/sync-adapter-agents.sh --check` to the `scripts/ci.sh` lint
   chain ending at line 85, as a continuation.
8. **GREEN.** Add the byte-identity describe block to `adapters/opencode/test/agents.test.js`.
   **Prove it is not vacuous without touching the worktree**: copy the repo to a `mktemp` dir,
   tamper one opencode mirror body there, run the suite in the copy and confirm it fails, then
   discard the copy.
9. **REFACTOR.** Run `bash scripts/sync-adapter-agents.sh --check` against the real tree — it
   must be silent and exit 0, since all 54 mirrors are in sync.

### Gate

```bash
PATH="$STUBS:$PATH" node --test test/sync-adapter-agents.test.js test/hygiene-gates-ci.test.js test/every-test-file-registers.test.js
PATH="$STUBS:$PATH" node --test adapters/opencode/test/agents.test.js
shellcheck scripts/sync-adapter-agents.sh scripts/ci.sh
bash scripts/sync-adapter-agents.sh --check
```

### Commit

`feat(adapters): sync agent mirrors from the shared bodies with a check-by-default tool`

## Part 8 — J: the usage miner's zero-file note names the right filename

### Context

**Surface.** `engine/src/observability/usage-mine-main.js`. Every line number below is exact
in the shipped file.

- `DEFAULT_READ_ROOTS` — **line 57**, the parallel per-source seam to mirror (frozen object,
  thunk values, `resolveDefaultReadRoot` exported as a unit-test seam with an `Object.hasOwn`
  own-property check and a comment explaining why a bare index would resolve inherited members).
- `SOURCE_FILE_MATCHERS` — **85–87**, exactly one entry:
  `aider: (f) => f === '.aider.chat.history.md'`. Deliberately exact-equality, not a suffix
  match: the working dir also holds `.aider.input.history` and `.aider.llm.history`.
- `DEFAULT_FILE_MATCHER = (f) => f.endsWith('.jsonl')` — **88**.
- `resolveFileMatcher(source)` — **94**, exported, `Object.hasOwn` fallback to the default.
- `NO_FILES_NOTE = 'no .jsonl transcript files found'` — **121**, with a three-line comment
  above it (**118–120**) recording the gap as deliberately out of scope at the time. **That
  comment is removed with the literal it explains.**
- Discovery — **303**: `jsonlFiles = readdirSync(safeTranscriptDir).filter(resolveFileMatcher(source));`
- Emit site — **312**: `if (!jsonlFiles.length) { writeNoOp(NO_FILES_NOTE); return EXIT_OK; }`
- `source` binds at **281**, `writeNoOp` is declared at **293** — `source` is already in scope at
  both the closure and the call site. **No restructuring is needed.**
- Vocabulary: `SOURCES` (**44–51**) — `claude` (default), `opencode`, `pi`, `copilot`, `codex`,
  `aider`.

**Mechanism — couple the label to the matcher; do NOT run a parallel table.** The defect class
here is a matcher and a message that disagree, and a second independent map drifts the same
way. Widen each `SOURCE_FILE_MATCHERS` entry from a bare predicate to `{ match, label }`, keep
`resolveFileMatcher(source)` returning `entry.match` (external contract and its four existing
seam tests untouched), add a sibling `resolveFileLabel(source)` returning `entry.label` with the
same `Object.hasOwn` discipline and the same rationale comment, and add a `DEFAULT_FILE_LABEL`
beside `DEFAULT_FILE_MATCHER`. `NO_FILES_NOTE` becomes
`` noFilesNote(source) → `no ${resolveFileLabel(source)} transcript files found` ``.

**The pin that must keep passing, byte-unchanged:** `engine/test/usage-mine-main.test.js:491-503`
invokes `main(['--dir', emptyDir], io)` with **no** `--source`, falls to `DEFAULT_SOURCE`
(`claude`), and asserts the exact string `no .jsonl transcript files found`. No test asserts the
note under any non-default source, so the change is purely additive: claude keeps its exact
wording, `--source aider` gains `no .aider.chat.history.md transcript files found`, and the four
other sources keep `.jsonl` because that is genuinely what their matcher looks for.

**Confirmed in advance so this part does not have to re-check it:** none of the four existing
`resolveFileMatcher` seam tests (`engine/test/usage-mine-main.test.js:1271`, `:1279`, `:1287`,
`:1295`) asserts function *identity* against `DEFAULT_FILE_MATCHER` — all four invoke the
returned matcher with filenames. They stay unchanged.

**Public-surface decision: `resolveFileLabel` is a NEW export, and it is deliberate.** It is the
established unit-test-seam convention of this module (`resolveDefaultReadRoot`,
`resolveFileMatcher`). Downstream surfaces to pre-pay in this part: the import list at
`engine/test/usage-mine-main.test.js:23` gains it. There is no barrel, no index re-export, no
generated API report and no registry for `engine/src/observability`. Nothing else imports this
module's seams.

### TDD steps

1. **RED.** `--source aider` over an empty transcript directory yields the report note
   `no .aider.chat.history.md transcript files found`. Expected failure: today the note is the
   frozen literal `no .jsonl transcript files found`.
2. **RED.** New `resolveFileLabel` seam tests mirroring the four existing `resolveFileMatcher`
   cases: `aider` → `.aider.chat.history.md`; `claude` → `.jsonl`; the inherited-member source
   `constructor` falls back to the default label rather than resolving an inherited member.
   Expected failure: `resolveFileLabel` is not exported.
3. **GREEN.** Widen `SOURCE_FILE_MATCHERS` entries to `{ match, label }`, add
   `DEFAULT_FILE_LABEL`, add `resolveFileLabel`, replace `NO_FILES_NOTE` with `noFilesNote(source)`
   at the line-312 emit site, delete the stale 118–120 comment with the literal it explained.
4. **GREEN.** `--source codex` over an empty directory still yields the `.jsonl` wording.
5. **REFACTOR.** Confirm `engine/test/usage-mine-main.test.js:491-503` and the four
   `resolveFileMatcher` seam tests are byte-unchanged and green.

### Gate

```bash
PATH="$STUBS:$PATH" node --test engine/test/usage-mine-main.test.js
```

### Commit

`fix(usage-mine): name the per-source transcript filename in the zero-file note`

## Part 9 — K: `--file` editable targets in the aider launch args

### Context

**Surface.** `adapters/aider/src/launch-args.js`. Current signature and emission:

```js
export function buildLaunchArgs({ model, readFiles = [], message })
```

emitting `--yes-always --no-gitignore --no-check-update --no-show-release-notes --no-analytics
--model <model> [--read <f>]* --message <message>`. `buildReadPairs` (lines 42–47) flat-maps
each entry to a discrete `[FLAG_READ, file]` pair after
`assertNonEmptyString(file, 'each readFiles entry')` (21–25). Flag constants are module-level
(`FLAG_YES_ALWAYS` … `FLAG_MESSAGE`, lines 12–19).

**Change.** Add `FLAG_FILE = '--file'` and an **optional** `editFiles = []` parameter emitting
one `--file <path>` pair per entry, via a `buildFlagPairs(flag, files, label)` generalisation of
`buildReadPairs` — the existing function is already the right shape; only the flag constant and
the error label vary. Keep the house posture: **discrete flag/value pairs, never interpolated**,
with a per-entry `assertNonEmptyString`.

**Meaning.** `--read` keeps its meaning — role body and read-only context. `--file` names the
**editable targets** of an edit phase.

**Ordering.** `--file` pairs sit **after** the `--read` pairs and **before** `--message`, so
`--message` stays last — the property two existing tests assert positionally.

**The pins that must stay byte-unchanged.** `adapters/aider/test/launch-args.test.js:13-25` and
`:50-64` are full-array `assert.deepEqual` literals that break the instant anything new is
emitted. **Omitting `editFiles` must produce byte-identical argv to today.**

**Wiring cost is zero production call sites.** `adapters/aider/src/probe.js:38` passes
`readFiles: []` and simply does not pass the new key.

**Public-surface decision: this widens an exported function's options object with an OPTIONAL
key.** The default `[]` keeps every existing caller's argv byte-identical, which is the whole
compatibility contract and is pinned by the two full-array literals above. There is no barrel,
no facade, no adapter registry and no generated API report for `adapters/aider/src`. The one
surface that DOES need pre-paying in this part is the honesty record below.

**The honesty record.** `docs/contributing/specs/aider-poc-record.md` (184 lines). The final
line is the `**Full-pipeline dogfood (craft orchestrator drives aider per-part)**` row of the
`## Phase B — live-evidence rows` table, which already carries the finding inline: an
incremental edit to an existing file **no-op'd on a 7B local model even with `--file` added**.
Extend that row's Evidence cell to state the conclusion plainly — **`--file` is necessary and
not sufficient; a capable model is also required** — so nobody later reads the new surface as a
fix for the edit-reliability problem. **That file is in the intention-lint living corpus**
(`scripts/living-corpus.sh` enumerates `docs/contributing/specs/*.md`, and `scripts/ci.sh`
hard-errors on a zero-file enumeration), so `node engine/bin/intention-lint.js` must stay green
over it. It is exempt from prose-lint via the `specs/*` glob at `scripts/ci.sh:134`.

**Test style follows the file:** ESM, `describe`/`it`, `node:assert/strict`,
`const sut = buildLaunchArgs({…})`, constants `MODEL`, `READ_FILE`, `MESSAGE` at the top.

### TDD steps

1. **RED.** A third full-array `assert.deepEqual` showing `--file` pairs after `--read` and
   before `--message`. Expected failure: `editFiles` is not a recognised key, so no `--file`
   token is emitted at all.
2. **RED.** Two `editFiles` entries emit two discrete `--file` pairs; an empty `editFiles`
   emits no `--file` token and `--message` stays last.
3. **RED.** An empty-string entry throws `/non-empty string/`; a non-string entry throws the
   same. Expected failure: no validation path exists yet.
4. **GREEN.** Add `FLAG_FILE`, generalise `buildReadPairs` into
   `buildFlagPairs(flag, files, label)`, use it for both `--read` and `--file`, and add
   `editFiles = []` to the destructured options with the emission slotted between the read
   pairs and `--message`. Update the function's JSDoc `@param` type.
5. **GREEN.** Confirm `:13-25` and `:50-64` are byte-unchanged and green — that is the
   "today's argv exactly" proof.
6. **REFACTOR.** Amend the final `aider-poc-record.md` row with the necessary-not-sufficient
   conclusion, keeping the table's column shape and its `CLOSED (live) + finding` status cell.

### Gate

```bash
PATH="$STUBS:$PATH" node --test adapters/aider/test/launch-args.test.js adapters/aider/test/native-surface.test.js
PATH="$STUBS:$PATH" node engine/bin/intention-lint.js docs/contributing/specs/aider-poc-record.md
```

### Commit

`feat(aider): emit --file editable targets alongside --read context`

## Part 10 — L: re-derive the README receipts counts

### Context

**This part lands LAST.** The parted-plan count is not final until this plan document is
committed, and the ADR count moved by six when ADRs 321–326 landed.

**Surface.** `README.md`, the receipts sentence under `## craft builds craft`, lines 118–120:

```
receipts: [25 design docs](docs/contributing/design/), [24 parted plans](docs/contributing/plan/),
[320 ADRs](docs/contributing/adr/), and [raw telemetry for 27 runs](docs/contributing/metrics-baseline.report.json)
```

**Measured in this tree while planning — treat as orientation, NOT as the values to write:**

| Counted link | README claims | Tree at planning time |
|---|---|---|
| `docs/contributing/design/` | 25 | **26** |
| `docs/contributing/plan/` | 24 | 24, flipping to **25** once this plan doc is committed |
| `docs/contributing/adr/` | 320 | **326** |
| `docs/contributing/metrics-baseline.report.json` | 27 | never recounted — that link targets a **file**, and the sub-guard only recounts **directory** links |

**Re-derive all four from a live `bash scripts/readme-drift.sh` run at land time.** Every part
before this one may have added a doc; write exactly what the tool reports and nothing else. The
guard emits one line per drifted surface in the form
`readme-drift: corpus-counts: <dir> claims <n>, tree holds <m>`.

**The gate is not in `scripts/ci.sh`.** `scripts/readme-drift.sh` is its own GitHub Actions job
(grep-confirmed: zero references in `scripts/`), so every per-part gate and the phase-boundary
gate stay green while the guard is red, and the failure only surfaces after push. This part runs
it explicitly.

**Downstream risk to flag onward:** if the documentation phase adds any file under
`docs/contributing/design/`, `docs/contributing/plan/` or `docs/contributing/adr/` after this
part lands, the guard goes red again. The docs phase must re-run `bash scripts/readme-drift.sh`
before the pre-PR gate.

**No public surface, no code delta** — a docs-only part, legitimately standalone under the
sizing rules. `README.md` is in `test/source-hygiene.test.js`'s scanned set (class-B
`gh|github` with a canonical-URL exemption); changing four integers cannot trip it, but the
gate below re-runs it anyway.

### TDD steps

1. **RED.** `bash scripts/readme-drift.sh` — expected failure: it exits 1 and names each drifted
   counted directory with its claimed and actual counts. Capture the output verbatim; it is the
   specification for step 2.
2. **GREEN.** Edit only the integers on `README.md` lines 119–120 to the counts the tool
   reported. Leave the link targets, the sentence and the telemetry count untouched.
3. **GREEN.** Re-run `bash scripts/readme-drift.sh` — exit 0, no output lines.
4. **REFACTOR.** Run `node --test test/readme-drift.test.js` to confirm the guard's own suite is
   green, and re-read the sentence to check it still parses as English after the substitution.

### Gate

```bash
PATH="$STUBS:$PATH" bash scripts/readme-drift.sh
PATH="$STUBS:$PATH" node --test test/readme-drift.test.js test/source-hygiene.test.js
```

### Commit

`docs(readme): re-derive the corpus counts after the sweep`

## Phase-boundary gate

After Part 10 lands, once for the whole change:

```bash
PATH="$STUBS:$PATH" bash scripts/ci.sh
PATH="$STUBS:$PATH" bash scripts/readme-drift.sh
lychee --offline --include-fragments --no-progress --exclude-path engine/node_modules './**/*.md'
```

The second and third commands are the two GitHub Actions jobs that `scripts/ci.sh` does not
cover. Running them here is the only local chance to catch what CI would otherwise catch after
push.
