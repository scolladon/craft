# Design — waiver-mention-not-waiver

> Brief: a waiver token quoted in prose is a live waiver. Make the shared `collectWaived`
> honour only a line that starts with `TOKEN(<path>): <reason>` outside a fenced code
> block, so a doc that merely discusses a waiver no longer waives anything (BACKLOG "A
> waiver token quoted in prose is a live waiver").
> Status: draft → self-reviewed ×3

## Context

Three gates read waivers through one function:

| Gate | Waiver constant | Reaches `collectWaived` via | Posture |
|---|---|---|---|
| stub-lint | `engine/src/stub-lint-main.js:14` `WAIVER_PATTERN = /STUB-WAIVE\(([^)]+)\)/g` | `coreMain(argv, io, { self, waiverPattern, foundToken, scan })` (:47) → `hygiene-lint-core.js` `main` (:164) | `hygiene.gate` (advisory default, ADR-212) |
| prose-lint | `engine/src/prose-lint-main.js:21` `WAIVER_PATTERN = /SLOP-WAIVE\(([^)]+)\)/g` | `coreMain(...)` (:50) → core `main` (:164) | `hygiene.gate` |
| adr-lint | `engine/src/adr-lint-main.js:38` `WAIVER_PATTERN = /DECISION-CITE-WAIVE\(([^)]+)\)/g` | `resolveRunContext` → `collectWaived(sources, io, WAIVER_PATTERN, MAX_FILE_BYTES, repoRoot)` (:681) | always blocking |

`engine/src/hygiene-lint-core.js` `collectWaived(waiverSources, io, waiverPattern,
maxBytes = MAX_FILE_BYTES, base = process.cwd())` (:74-89, JSDoc :62-73) reads each source
through `readWithinCap` and then, at :86:

```js
for (const match of content.matchAll(waiverPattern)) waived.add(resolve(base, match[1].trim()));
```

Every match anywhere in the file counts: mid-sentence, inside an inline code span, in a
table cell, inside a fenced block.

`scripts/ci.sh` feeds it broad source sets. `run_stub_lint` (:108-122) and `run_prose_lint`
(:123-135) pass every touched `*.md` as `--waiver-source`. `run_adr_lint` (:142-163) passes
every tracked `docs/contributing/design/*.md` and `docs/contributing/plan/*.md`, plus touched
`*.md`. Design and plan docs are where waiver tokens get discussed, so the broadest source
set meets the least careful content.

Decisions this touches:

- ADR-212 (C8): waivers are "fixed greppable prose tokens" `STUB-WAIVE` / `SLOP-WAIVE`.
  This design narrows "a token anywhere in prose" to "a token that starts its own line
  outside a fence".
- ADR-357: `DECISION-CITE-WAIVE(<file>): <reason>` is collected by `collectWaived`;
  consequence "one `waiverPattern` constant; no change to `collectWaived`". This design
  changes `collectWaived` but keeps its signature and every gate constant (DC-1 (a)).
- The ADR phase records both as refinements, not reversals: token names, sources and the
  waived-path semantics stay the same.

### Reproduction (shipped tree, `2d607f5`)

Orchestrator-produced and re-pinned here in a mktemp throwaway. Commands run from the
throwaway with `<worktree>` the repo checkout:

```
$ printf '// TODO x\n' > s.js
$ printf 'We note STUB-WAIVE(s.js) in passing.\n' > m.md
$ node <worktree>/engine/bin/stub-lint.js --gate blocking --waiver-source m.md -- s.js; echo $?
0
$ printf 'We delve here.\n' > p.md
$ printf 'We note SLOP-WAIVE(p.md) in passing.\n' > pm.md
$ node <worktree>/engine/bin/prose-lint.js --gate blocking --waiver-source pm.md -- p.md; echo $?
0
# adr fixture: adr/001 superseded by adr/002, live/note.md "Restates ADR-001.", git init + add -A
$ printf 'We note DECISION-CITE-WAIVE(live/note.md) in passing.\n' > dm.md
$ node <worktree>/engine/bin/adr-lint.js adr --waiver-source dm.md; echo $?
0
```

Without the mention source each command exits 2. Unit-level red: a source holding
`We note X-WAIVE(foo.js) in passing.\n` through `collectWaived([src], io,
/X-WAIVE\(([^)]+)\)/g)` waives `foo.js`.

I pinned the shipped `collectWaived` over the full edge matrix (Design § Edge matrix): every
row, including fenced, inline-code, table-cell, list-item, no-colon and empty-reason
lines, is waived today.

### Out-of-engine consumer

`skills/propose/SKILL.md:31-38` runs
`prose-lint.js --gate <gate> --waiver-source <body-file> -- <body-file>`: the PR body is its
own waiver source, and a deliberate ban-list word is waived in-body. Pinned today: a body
`We delve here.` plus a line `SLOP-WAIVE(body.md): deliberate` (the body's own path) exits 0
under `--gate blocking`. This must keep working.

INTENTION-WAIVE is not engine-collected (`engine/src/intention.js` takes a pre-built
`waived: string[]`; the validation skill reads the token in-session). It is not this defect.

## Requirements

User-decided (recorded, not open): a waiver is a line that **starts** with
`TOKEN(<path>): <reason>` and lies **outside** a fenced code block. Mid-sentence text,
inline code spans, table cells and fenced content are mentions, and mentions are inert. The
fix lives in the shared `collectWaived`, so it covers all three tokens:
`STUB-WAIVE`, `SLOP-WAIVE` and `DECISION-CITE-WAIVE`.

| # | Requirement | Proof |
|---|---|---|
| R1 | A mid-sentence token waives nothing, for all three gates. | The three Reproduction commands exit **2** (today 0). Bin-level commands in a throwaway, not ci.sh's hygiene block: this doc itself quotes the tokens and is a waiver source on its own branch. |
| R2 | A line starting `TOKEN(<path>): <reason>` outside a fence still waives, for all three gates, including the propose self-waiver shape (waiver source = scanned file). | The existing fixtures (Test strategy § Back-compat) stay green unedited; the propose-shape pin exits 0. |
| R3 | A token line inside a fenced block is inert: ```` ``` ```` and `~~~` openers, runs longer than 3, info strings (```` ```js ````), list-indented fences, a longer opener not closed by a shorter run, a fence not closed by the other fence character, a would-be closer with text after the run (it does not close). An **unclosed** fence runs to end of file: everything after the opener is fenced. | Unit rows R3-a…R3-i. |
| R4 | A token inside an inline code span (`` `TOKEN(x): r` ``) is inert, and so is any token that does not start at column 0 (after a list marker, `>`, `\|`, or indentation). | Unit rows R4-a…R4-e. |
| R5 | A padded path (`TOKEN(  <path>  ): r`) still resolves to the trimmed path. | `stub-lint-main.test.js:204`, `prose-lint-main.test.js:253` stay green; a core row. |
| R6 | CRLF sources behave exactly like LF: an anchored CRLF line waives, a CRLF fence fences. | Unit rows R6-a, R6-b. |
| R7 | A column-0 token with no `:` (`TOKEN(<path>)`) is inert (user decision). A token with `:` but an empty reason (`TOKEN(<path>):`, LF or CRLF) is inert (DC-3 (a)). | Unit rows R7-a (decided), R7-b, R7-c (DC-3). |
| R8 | One waiver per line: only the token at column 0 counts; a second token later on the same line is a mention. | Unit row R8. |
| R9 | Back-compat: no intended waiver in the tree is dropped. | Tree survey (Design § Back-compat). |
| R10 | User-facing waiver docs say, in one sentence, that the token must start its own line outside a code fence. | Doc edits listed in Design § Docs. |

Unchanged behaviour (regression-guarded by the existing suite): unreadable source → stderr
`cannot read waiver source …` + `readError: true`; oversize source → skip note, neutral;
path resolution against `base` (`./x`, absolute, trailing slash).

## Design

### Grammar

```
waiver-line := TOKEN "(" path ")" ":" ws* non-ws  any*      — starting at column 0
path        := [^)]+                                         — trimmed after capture
```

A line is a candidate only if it is outside a fenced block (§ Fence recognizer). On a
candidate line the anchored pattern runs once (no `g`), so R8 holds by construction. A line
with leading whitespace, a list marker, `>`, `|` or a backtick never matches, so indented
code blocks, lazy continuations, list items, blockquotes, table cells and inline code spans
need no rule of their own (DC-2 (a)).

### Where it lives — `hygiene-lint-core.js` only (DC-1 (a))

The gate constants stay bare token patterns (`TOKEN\(([^)]+)\)`, group 1 = path), which is
already the documented `collectWaived` contract. The core composes the anchored form once
per call:

```js
const FENCE_OPENER = /^([ \t]*)(?:(`{3,})[^`]*|(~{3,}).*)$/;
const FENCE_CLOSER = /^([ \t]*)(`{3,}|~{3,})[ \t]*$/;
const MAX_CLOSER_EXTRA_INDENT = 3; // closer width - opener width, tabs = 4 columns
const LINE_BREAK = /\r?\n/; // content.split(LINE_BREAK): CRLF lines carry no `\r`
const WAIVER_REASON = String.raw`:\s*\S`;

function anchorWaiver(waiverPattern) {
  return new RegExp(`^(?:${waiverPattern.source})${WAIVER_REASON}`);
}

function unfencedLines(content) {
  const lines = [];
  let fence; // opener run (e.g. '````'); undefined outside a fence
  for (const line of content.split('\n')) {
    if (fence !== undefined) {
      if (closesFence(line, fence)) fence = undefined;
      continue;
    }
    fence = openedFence(line);
    if (fence === undefined) lines.push(line);
  }
  return lines;
}
```

`openedFence(line)` returns `m[1] ?? m[2]` of `FENCE_OPENER`, or `undefined`.
`closesFence(line, fence)` is true iff `FENCE_CLOSER` matches, the run uses the same
character as `fence`, and the run is at least as long as `fence`. In `collectWaived`, :86
becomes a loop over `unfencedLines(content)` that runs `anchored.exec(line)` and adds
`resolve(base, match[1].trim())` on a match. The `(?:…)` wrapper keeps the gate's capture as
group 1. `new RegExp(source)` drops the gate's `g` flag, so the anchored pattern is
stateless across lines.

Unchanged: the `collectWaived` signature and return shape, `readWithinCap`, the
`waived`/`readError` semantics, the three gate constants, the adr-lint call site at :681,
and the core `main` at :164. The JSDoc at :62-73 changes from "global regex capturing the
waived path" to "the bare token regex (path in group 1); the core anchors it to a line start
outside fences and requires `: <reason>`". The module header at :5-8 gains one clause.

### Fence recognizer

A line-based subset of CommonMark fenced code blocks, pinned against markdown-it 14.3.2
(a CommonMark implementation), installed in a mktemp throwaway:

| Input | markdown-it | This rule |
|---|---|---|
| ```` ``` ```` / `~~~` / ```` ```js ```` opener | fence | fence |
| opener indented 0-3 spaces, or inside a list item | fence | fence |
| ```` ```` ```` opener, then a ```` ``` ```` line | still fenced | still fenced (shorter run) |
| ```` ``` ```` opener, then a `~~~` line | still fenced | still fenced (other char) |
| closer with trailing text (```` ``` x ````) | still fenced | still fenced |
| ```` ``` ```` opener, then a ```` ```` ```` line | closed | closed (≥ length) |
| unclosed opener | fenced to EOF | fenced to EOF |
| ```` ```a`b ```` (backtick in info string) | not a fence | not a fence |
| CRLF opener/closer (backtick or tilde) | fence | fence (lines split on `\r?\n`, so no pattern sees `\r`) |
| closer indented 4+ columns past its opener | still fenced | still fenced (closer at most 3 columns past the opener) |
| list-nested fence (opener and closer at 4 spaces or a tab) | closed | closed |
| ```` > ``` ```` (fence inside a blockquote) | fence | not an opener, but every line inside starts with `>`, so no token there is at column 0 |

Line-level cross-check over every tracked `.md` (954 files, 114,594 lines at `2d607f5`): the
recognizer and markdown-it's `fence` token map agree on all 10,524 fenced lines, with 0
divergent lines.

Known gap (accepted): the opener allows any indentation, so a 4+-space indented line
starting with ```` ``` ```` at top level counts as an opener here but is an indented code
block in CommonMark. That over-fences, which is fail-closed (a real waiver below it is
dropped and its finding stays visible). A closer must sit at most 3 columns past its
opener's indent (tabs count 4), so a 4-space-indented fence nested in a fenced sample does
not close the outer fence early, while a list-nested fence still closes at its own indent. The only fail-open divergence needs a crafted sequence (an
over-indented opener, followed by a real fence whose opener our state reads as the closer). The threat model is accidental mention, not an adversarial author, who could
simply write a waiver.

### Edge matrix

Pinned twice: "today" is the shipped `collectWaived`, "after" is a throwaway prototype of
the sketch above. Gate pattern `/X-WAIVE\(([^)]+)\)/g`, target `p.js`, `T` = `X-WAIVE(p.js): r`.

| Row | Source | Today | After |
|---|---|---|---|
| R1 | `We note T in passing.` | waived | inert |
| R2-a | `T` | waived | waived |
| R2-b | closed ```` ``` ```` fence, then `T` | waived | waived |
| R2-c | ``~~~ a`b`` fence closed, then `T` (backtick allowed in a tilde info string) | waived | waived |
| R2-e | ```` ```` ```` fence closed by ```` ```` ````, then `T` | waived | waived |
| R2-d | ```` ```a``` x ```` (inline, not an opener), then `T` | waived | waived |
| R3-a | `T` inside ```` ``` ```` | waived | inert |
| R3-b | `T` inside `~~~` | waived | inert |
| R3-c | `T` inside ```` ```js ```` | waived | inert |
| R3-d | ```` ``` ```` opener, `T`, no closer | waived | inert |
| R3-e | ```` ```` ```` opener, ```` ``` ```` line, `T` | waived | inert |
| R3-f | ```` ``` ```` opener, `~~~` line, `T` | waived | inert |
| R3-g | ```` ``` ```` opener, ```` ``` x ```` line, `T` | waived | inert |
| R3-h | list item, blank, `  ``` `, `T`, `  ``` ` | waived | inert |
| R3-i | `T` inside ```` ```` ```` | waived | inert |
| R4-a | `` `T` `` | waived | inert |
| R4-b | `- T` | waived | inert |
| R4-c | `  T` | waived | inert |
| R4-d | `\| T \|` | waived | inert |
| R4-e | `> T` | waived | inert |
| R5 | `X-WAIVE(  p.js  ): r` | waived | waived (`p.js`) |
| R6-a | `T\r\n` | waived | waived |
| R6-b | ```` ```\r\n ```` + `T\r\n` + ```` ```\r\n ```` | waived | inert |
| R7-a | `X-WAIVE(p.js)` | waived | inert |
| R7-b | `X-WAIVE(p.js):` | waived | inert |
| R7-c | `X-WAIVE(p.js):\r\n` | waived | inert |
| R8 | `X-WAIVE(p.js): r X-WAIVE(q.js): s` | both | `p.js` only |

A multi-line HTML comment whose inner line starts with `T` is a live waiver under this rule.
It is a deliberate column-0 shape, and no tracked doc or template carries one.

### Back-compat (R9)

Survey of tracked `*.md` at `2d607f5` (the throwaway prototype run over `git ls-files`):

| Measure | Count |
|---|---|
| STUB/SLOP/DECISION-CITE waiver-token matches, today's rule | 61 |
| Lines starting at column 0 with a waiver token | 1: `docs/contributing/plan/decision-drift-propagation.md:989`, inside a ```` ``` ```` fence (markdown-it agrees) |
| Live waivers under the new rule | 0 |

All 61 are placeholders, examples or mentions. None of them is an intended waiver, so
nothing is dropped. Every test fixture that is an intended waiver is already
`TOKEN(<path>): <reason>\n` at column 0: `hygiene-lint-core.test.js:71,229,242,386`,
`stub-lint-main.test.js:91,204`, `prose-lint-main.test.js:139,253`,
`adr-lint-main.test.js:439,882`. `stub-lint-main.test.js:309` is a scan target, not a waiver
source.

### Docs (R10)

One sentence each, additive, existing token literals untouched (pinned by
`test/hygiene-gates-ci.test.js:106-113` on `skills/run/SKILL.md` and
`test/decision-tokens.test.js:32` on `skills/run/SKILL.md` + the run-record spec):

- `docs/contributing/specs/run-record.md:121-123` (the `DECISION-CITE-WAIVE` bullet, which
  already names `STUB-WAIVE`): a waiver is a line that starts with the token followed by
  `: <reason>`, outside a fenced code block. The same token mid-sentence, in an inline code
  span, a table cell or a fence is a mention and waives nothing. This applies to all three
  waiver tokens.
- `skills/propose/SKILL.md:36-38`: the in-body waiver is its own line,
  `SLOP-WAIVE(<body-file>): <reason>`, at the start of the line and outside any code fence.

`skills/run/SKILL.md` and `docs/guides/customizing.md` stay as they are. The run skill's
table lists record tokens and is not where a waiver is authored, and the guide does not
describe waivers.

### Error semantics

None added. A near-miss (indented, bulleted, reasonless, fenced) is silently inert. The
finding it was meant to clear still prints, and under `blocking` it still fails, so the
failure mode is fail-closed and visible.

## Decision candidates

| # | Choice | Alternatives (≤3) | Recommendation | Why |
|---|---|---|---|---|
| DC-1 | Where the line-anchor + `: <reason>` rule lives | (a) **Core composes it**: `collectWaived` walks unfenced lines and anchors the gate's bare pattern as `^(?:<source>):\s*\S`; gate constants unchanged. (b) **Each gate regex** becomes `^TOKEN\(([^)]+)\):\s*\S` with `m` flag; the core only strips fences. (c) **Core owns the grammar, gates pass a token name** (`waiverToken: 'STUB-WAIVE'`); `collectWaived`'s third parameter changes from RegExp to string. | (a) | The core header calls the gates "the same machine"; (a) keeps the whole waiver grammar in one place and touches one file on the engine side. No signature or call-site change (adr-lint :681, core :164), and the core tests' `WAIVER` constant keeps working. (b) copies the anchor/reason grammar into three regexes plus a fence stripper in the core, and a gate that forgets `^` reopens the hole. (c) is the cleanest end state but changes a signature, three callers and every `collectWaived` test for no behavioural gain. |
| DC-2 | Leading whitespace / list markers before the token | (a) **Column 0 only**. (b) 0-3 spaces (CommonMark paragraph indent). (c) (b) plus list/blockquote markers (`- `, `* `, `> `). | (a) | Matches the documented shape and every existing fixture. Indented code blocks, lazy continuations, bullets and blockquotes become inert without extra rules. (b) must stop at 3 spaces (4 = indented code) and adds cases nobody uses. (c) revives the defect: a design doc's bullet that explains a token (`- STUB-WAIVE(x): skips x`) would be live. |
| DC-3 | Is an empty reason accepted? | (a) **Reason required**: `):` followed by at least one non-space character on the line. (b) Colon only: `TOKEN(<path>):` with an empty reason waives. | (a) | The documented shape is `TOKEN(<file>): <reason>`. A reasonless waiver is an unexplained suppression, and the near-miss fails closed (the finding stays visible). `\s*\S` also makes `TOKEN(x):\r` inert under CRLF without special-casing. (b) is one character simpler and equally safe against the prose-mention defect. |
| DC-4 | Fence recognizer fidelity | (a) **Line-based CommonMark subset**: opener with any indentation; ```` ``` ```` or `~~~`, 3 or more; no backtick in a backtick info string; closer of the same char, at least the opener's length, whitespace-only; unclosed = fenced to EOF. (b) Column-0 openers only, any ```` ``` ````/`~~~` line toggles. (c) Parse with a markdown library (markdown-it). | (a) | Pinned at 0 divergent lines against markdown-it over all 954 tracked docs. Its one gap over-fences, which is fail-closed. (b) misses list-indented fences (R3-h) and mis-toggles on ```` ```` ```` nesting (R3-e), and both are fail-open. (c) is exact but adds a second runtime dependency to the engine (only `js-yaml` today) for one function. |

## Test strategy

TDD, London School. node:test Given/When/Then titles, AAA bodies, a `sut` variable. Each
edge-matrix row is one RED test before the code.

**Core — `engine/test/hygiene-lint-core.test.js`, `collectWaived` block (after :90).**
Helpers in place: `tmpRoot()` (:20), `writeFixture(root, name, content)` (:26), `WAIVER =
/X-WAIVE\(([^)]+)\)/g` (:32), `makeCaptureIo()` (`engine/test-helpers/capture-io.js`).
Call `sut([source], io, WAIVER, Infinity, root)` (or import `MAX_FILE_BYTES`, not imported today) so assertions use `resolve(root, 'p.js')`. Cover every
row of the edge matrix: the "inert" rows assert `waived.size === 0`, the "waived" rows assert
the exact set. Inert rows that share one assertion may share one test that loops over a row array (as
`stub-lint-main.test.js:187` loops over `MARKERS`), with the row id in each assertion message.

**Gate pins (R1 + R2 per gate, through each gate's `main`):**

- `engine/test/stub-lint-main.test.js`, next to :87-98 (helpers `tmpRoot` :15,
  `writeFixture` :21). Given a waiver source that only mentions the token mid-sentence, when
  main runs `--gate blocking`, then it exits 2 and prints `STUB-FOUND(...)`.
- `engine/test/prose-lint-main.test.js`, next to :135-146: the same mention case for
  `SLOP-WAIVE`, plus the propose self-waiver shape: one file holding a ban-list line and a
  column-0 `SLOP-WAIVE(<that file>): <reason>` line, passed as both `--waiver-source` and
  scan target, exits 0.
- `engine/test/adr-lint-main.test.js`, after :874-891 (helpers `gitTmpRoot` :45,
  `writeFixture` :34, `stageAll` :59, `writeCleanSupersession` :377). Same fixture with
  `waivers.md` = `We note DECISION-CITE-WAIVE(live/note.md) in passing.\n`: exits 2 with the
  C3 finding. A second case puts the line inside a ```` ``` ```` fence and also exits 2.

**Back-compat.** The ten fixtures listed in Design § Back-compat must pass **unedited**. Any
edit to them during implementation means R2 or R5 is broken.

**Mutation.** `engine/src/**/*.js` is in Stryker scope. Narrow the run to
`hygiene-lint-core.js` with its own suite plus the three gate suites. The matrix maps onto
the expected mutants:

| Mutant | Killed by |
|---|---|
| `{3,}` → `{3}` in the opener | R3-i |
| `{3,}` → `{3}` in the closer | R2-e |
| ``[^`]*`` dropped / negated | R2-d |
| `[ \t]*` dropped | R3-h |
| closer `[ \t]*$` → `[ \t]*` | R3-g |
| `<= MAX_CLOSER_EXTRA_INDENT` → `<` / indent check dropped | unit rows "closer indented three spaces closes" / "closer indented four spaces does not close" |
| tab width dropped (`' '.repeat(TAB_WIDTH)` → `''`) | unit row "tab-indented closer past a column-0 opener does not close" |
| `LINE_BREAK` → `'\n'` | unit row "CRLF tilde fence" |
| `>=` → `>` in `closesFence` | R2-b |
| same-char check dropped | R3-f |
| `^` dropped from the anchor template (hand-mutation: Stryker does not mutate inside a template) | R1, R4-b |
| `WAIVER_REASON` → `''` / `\S` dropped | R7-a, R7-b |
| `.trim()` dropped | R5 |
| fence state reset dropped (`fence = undefined`) | R2-b |

A Stryker survivor gets either a row or an `equivalent mutant (...)` comment in the house form
(`hygiene-lint-core.js:39`).

**Gate.** `npm --prefix engine test` per part, then `bash scripts/ci.sh` per phase. R1 is
proven by the gate-level unit pins and the Reproduction commands, not by ci.sh's quiet
hygiene block.

## Out of scope

- INTENTION-WAIVE: read in-session by the validation skill, never by `collectWaived`.
- BACKLOG "Residual prose-marker findings in tracked source": a separate rewording item.
- Which files `ci.sh` passes as `--waiver-source`: the defect is in what counts as a
  waiver, not in where the waivers are read from.
- Near-miss diagnostics (a stderr note for a bulleted or reasonless token): the unwaived
  finding already surfaces it, and a note would fire on every doc that discusses the tokens.
- A leading UTF-8 BOM before a line-1 waiver: the line does not start with the token, so
  the waiver is inert (fail-closed). No tracked doc carries a BOM-prefixed waiver.
- Paths containing `)`: unexpressible today, unchanged.
