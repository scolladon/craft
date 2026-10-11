# Design — centralise-region-slicer

> Brief: replace the four process-suite region slicers with one helper under `test/helpers/`
> whose only behaviour on a given-but-missing end marker is to fail loud. Test-only change.
> Status: draft → self-reviewed ×3

## Context

Four root process suites each define a function that slices a markdown file between two
line patterns, so a phrase outside the target section cannot satisfy a section-scoped pin.
They share a core (start line included, end line excluded, end searched from the line after
the start) and disagree on everything else:

| Suite | Function | Start `null` | End `null` | End given but missing | Output |
|---|---|---|---|---|---|
| `test/run-record.test.js:50-64` | `sliceRegion` | allowed → line 0 (`:70`) | EOF | **fails loud** (`:59-61`) | lines joined with `' '` |
| `test/concepts-frames.test.js:25-35` | `sliceFrom` | rejected (assert) | EOF (`:86`) | **silently widens to EOF** (`:33`) | joined with `'\n'` |
| `test/auto-compaction-docs.test.js:81-89` | `sliceFrom` | rejected | unsupported (`.test` on `null` throws) | **silently widens to EOF** (`:87`) | joined with `'\n'` |
| `test/model-retry-token.test.js:55-62` | `sliceRegion` | rejected | unsupported | **fails loud** (`:60`) | `' '` join, then `normaliseWhitespace` (`:48-50`, `/\s+/g` → `' '`) |

`run-record.test.js:53-55` records why widening is wrong: a renamed end heading turns a
region pin into a whole-file grep that passes for the wrong reason. A second widening path
exists even in the fail-loud suite: `run-record.test.js:58` and `:62` test the end pattern
for truthiness, so an omitted or `undefined` end argument also slices to EOF.

**Call sites (38, counted with `grep -n 'sliceRegion\|sliceFrom' test/*.test.js`):**

| Suite | Sites | Boundary shape | What the assertions need |
|---|---|---|---|
| `run-record.test.js` | 29: `:70` (start `null`); `:150 :175 :188 :195 :201 :208 :298 :305 :313 :321 :328` (end `null`); `:76 :86 :109 :115 :121 :128 :144 :165 :233 :244 :245 :256 :265 :274 :286 :359 :411` | `:86` and `:274` alias `sut = sliceRegion`; `:286` wraps it in an arrow; those three then apply `.replace(/\s+/gu, ' ')` (`:88`, `:276`, `:286`) | wrap tolerance: `includes` / `assert.match` / `indexOf` ordering on sentences that word-wrap |
| `model-retry-token.test.js` | 5: `:78 :80 :135 :147 :150` | `:78`/`:80` sit inside `invariantBullet` / `transientRetryBullet` | wrap **and** indent tolerance: phrases span indented bullet continuations |
| `concepts-frames.test.js` | 3: `:62`, `:86` (end `null`), `:95` | — | `:86` counts bullets with `section.match(/^- <https?:/gm)`: the `^` multiline anchor needs real line breaks |
| `auto-compaction-docs.test.js` | 1: `:102` | — | token `includes` only |

`normaliseWhitespace` in `model-retry-token.test.js` has three more users besides the
slicer: `resolutionChainOf` (`:65`) and the tests at `:129` and `:166`.

**End-marker check for the two widening suites.** Switching them to fail loud is safe today
only if every given end marker is found. Checked against `HEAD` (`cc54aa9`):

| Call site | Start line | End marker found at |
|---|---|---|
| `concepts-frames.test.js:62` | `README.md:52` | `README.md:57` `## What craft is not` (pattern `/^## /`) |
| `concepts-frames.test.js:95` | `docs/guides/concepts.md:186` | `docs/guides/concepts.md:222` `## Rosetta stone` (pattern `/^## /`) |
| `concepts-frames.test.js:86` | `docs/guides/concepts.md:241` | end `null`: explicit EOF, the Sources section is the last one |
| `auto-compaction-docs.test.js:102` | `docs/guides/customizing.md:441` | `docs/guides/customizing.md:465` `## 5. Tailor in one sitting` |

The two fail-loud suites already prove their markers by passing. Both widening suites'
given end patterns are the generic `/^## /`, so fail loud there fires only when no later
`##` heading exists. Switching exposes no latent false pass today.

**Pinned output-shape matrix.** Each suite run under each candidate output shape, in a
`git archive HEAD` throwaway copy (each slicer's `return` line rewritten, nothing else),
`node --test test/<suite>.test.js`:

| Output shape | run-record (49) | concepts-frames (7) | auto-compaction-docs (7) | model-retry-token (10) |
|---|---|---|---|---|
| Faithful: lines joined with `'\n'` | 46 / **3 fail** | 7 / 0 | 7 / 0 | 7 / **3 fail** |
| Space: lines joined with `' '` | 49 / 0 | 6 / **1 fail** | 7 / 0 | 7 / **3 fail** |
| Normalised: `' '` join, then `/\s+/g` → `' '` | 49 / 0 | 6 / **1 fail** | 7 / 0 | 10 / 0 |
| Fail-loud end, original join | — | 7 / 0 | 7 / 0 | — |

The failures: run-record under faithful, tests 17, 18, 25 (`§Done` sentences and the
inherited-edges edge wrap across lines). model-retry-token under faithful and space, tests
3, 7, 9 (bullet phrases span indented continuations). concepts-frames under space and
normalised, test 6 (the Sources URL count, the `/^…/m` bullet count).

So no single output shape keeps all four suites green. Two shapes do it together:
**faithful** for concepts-frames and auto-compaction-docs, **normalised** for run-record and
model-retry-token. run-record's plain `' '` join can become normalised with no test change.

## Requirements

- R1. One helper module, `test/helpers/region-slice.js`. No root suite keeps its own slicer
  function.
- R2. A start pattern that matches no line throws:
  `region start <pattern> not found — heading renamed?`.
- R3. An end pattern that is given and matches no line after the start throws:
  `region end <pattern> not found — heading renamed?`. This is the only behaviour; nothing
  widens to EOF unless the caller asked for EOF.
- R4. "From the top of the file" and "to the end of the file" stay expressible. Each must be
  stated explicitly. Omitting the argument must not mean EOF (spelling: DC-2).
- R5. Shared core kept: start line included, end line excluded. The end is searched from the
  line after the start, or from line 0 when slicing from the top.
- R6. Faithful and normalised output both available (shape of the API: DC-1).
- R7. Behaviour preserved: each migrated suite keeps its test count (49 / 7 / 7 / 10) and its
  assertion bodies. Allowed edits: the slicer's name and import, the boundary spelling
  (DC-2), and dropping a `.replace(/\s+/gu, ' ')` made redundant by normalised output.
- R8. Test-only: no `engine/`, `adapters/`, `skills/` or guide prose changes.

## Design

Shown with DC-1 (b) and DC-2 (b), the recommended options.

**Module** `test/helpers/region-slice.js` (CommonJS, `'use strict'`, `module.exports`, same
shape as `test/helpers/tmp-git-repo.js`):

```js
const FROM_TOP = Symbol('region: from the top of the file');
const TO_END = Symbol('region: to the end of the file');

// sliceRegion(content, start, end) → string
//   start: RegExp | FROM_TOP     end: RegExp | TO_END
//   returns the region's lines joined with '\n' (faithful: ^/m anchors still work)
// sliceProse(content, start, end) → normaliseWhitespace(sliceRegion(...))
//   word-wrapped and indented prose matches as one phrase
// normaliseWhitespace(text) → text.replace(/\s+/g, ' ')

module.exports = { FROM_TOP, TO_END, sliceRegion, sliceProse, normaliseWhitespace };
```

Internals, each a small function with early returns:

- `startIndexOf(lines, start)`: `FROM_TOP` → `0`. A `RegExp` → `findIndex`, and a miss fails
  the R2 assertion. Anything else (including `undefined` or `null`) → `TypeError`
  `region start must be a RegExp or FROM_TOP`.
- `endIndexOf(lines, searchFrom, end)`: `TO_END` → `lines.length`. A `RegExp` → `findIndex`
  over `lines.slice(searchFrom)`, and a miss fails the R3 assertion. Anything else →
  `TypeError` `region end must be a RegExp or TO_END`.
- `searchFrom` is `0` under `FROM_TOP`, else `startIdx + 1`. This is today's run-record rule
  (`:57`). The end can therefore never match the start line itself, which matters because
  `/^## /` matches the `## Frame 5` start heading.
- Misses fail through `node:assert` (`assert.notEqual(idx, -1, message)`), as all four slicers
  do today. A missing heading reads as a failed assertion, not a crash. A wrong argument
  type is a programming error, so it raises `TypeError`.
- `sliceProse` joins with `'\n'` and then normalises. That gives the same string as a `' '`
  join followed by normalisation, because `\s` covers `\n`. The leading and trailing
  whitespace is not trimmed, which matches `model-retry-token` today.
- `FROM_TOP` + `TO_END` together is the whole file. No call site does this, and it is not
  special-cased.
- Assumed: no boundary pattern carries the `g` or `y` flag (a stateful `.test` would skip
  lines). A grep of all 38 call sites shows only the `u` flag.

The rationale comment (why a miss must not widen, why prose is normalised) moves to the
helper once. The per-suite copies (`run-record.test.js:46-49,53-55`,
`concepts-frames.test.js:21-24`, `auto-compaction-docs.test.js:78-80`,
`model-retry-token.test.js:52-54`) are deleted along with their functions.

**Per-suite migration:**

| Suite | Import | Call-site edits |
|---|---|---|
| `run-record.test.js` | `const { FROM_TOP, TO_END, sliceProse } = require('./helpers/region-slice');` | all 29 → `sliceProse`; `:70` `null` → `FROM_TOP`; 11 end `null` → `TO_END`; `:86`/`:274` `sut = sliceProse`; drop the now-redundant `.replace(/\s+/gu, ' ')` at `:88`, `:276`, `:286` |
| `model-retry-token.test.js` | `const { normaliseWhitespace, sliceProse } = require('./helpers/region-slice');` | 5 → `sliceProse`; delete local `normaliseWhitespace` (`:48-50`); `:65`, `:129`, `:166` use the import |
| `concepts-frames.test.js` | `const { TO_END, sliceRegion } = require('./helpers/region-slice');` | 3 → `sliceRegion`; `:86` `null` → `TO_END`. Semantics change: a missing `/^## /` now fails loud |
| `auto-compaction-docs.test.js` | `const { sliceRegion } = require('./helpers/region-slice');` | 1 → `sliceRegion`. Same semantics change |

**Parts and pre-chewed context**

- **P1: helper + its unit suite.**
  - Code: new `test/helpers/region-slice.js`. Model the module header on
    `test/helpers/tmp-git-repo.js` (`'use strict'`, requires, one leading why-comment,
    `module.exports = { … }`). The name must not end in `.test.js`, because
    `test/every-test-file-registers.test.js` enumerates `*.test.js` and requires each to
    register tests.
  - Tests: new `test/region-slice.test.js` (`require('./helpers/region-slice')`). Discovered by
    `scripts/ci.sh`'s `test/` find and by `every-test-file-registers`. Inline fixture as a
    named constant (a small markdown string with two `##` sections, a wrapped and indented
    bullet, and two `- <https://…>` lines). Given/When/Then titles, AAA, `sut`.
- **P2: prose callers.** `test/run-record.test.js` (delete `:46-64`; sites above) and
  `test/model-retry-token.test.js` (delete `:48-62`; sites above). Gate: `node --test test/run-record.test.js test/model-retry-token.test.js` →
  49 + 10 pass.
- **P3: faithful callers.** `test/concepts-frames.test.js` (delete `:21-35`) and
  `test/auto-compaction-docs.test.js` (delete `:78-89`). Gate: `node --test` on both → 7 + 7
  pass.

P2 and P3 depend only on P1 and touch disjoint files, so they can run in parallel.

## Decision candidates

| # | Choice | Alternatives (≤3) | Recommendation | Why |
|---|---|---|---|---|
| DC-1 | Output shape (join semantics) | (a) **Named option**: `sliceRegion(content, start, end, { join: 'prose' \| 'lines' })`, one function, mode string. (b) **Two functions over one core**: `sliceRegion` returns the faithful `'\n'` slice; `sliceProse` = `normaliseWhitespace(sliceRegion(…))`. (c) **Return lines**: the helper returns `string[]` and each of the 38 call sites joins and normalises itself. | (b) | The pinned matrix shows exactly two shapes are needed: faithful (concepts `/^…/m` bullet count) and normalised (run-record + model-retry wrap/indent). (b) names each intent at the call site and keeps the core single. (a) is a mode flag in disguise, which is the boolean-parameter smell with a string. (c) pushes the join back into 38 sites, the duplication this change removes, and lets them drift again. |
| DC-2 | Spelling of "from top" / "to EOF" | (a) **Keep `null`**, today's spelling at 13 sites. `undefined` or an omitted argument must then be rejected separately, or it silently widens as `run-record.test.js:58,62` do today. (b) **Exported named sentinels** `FROM_TOP` / `TO_END` (Symbols). Any non-RegExp, non-sentinel boundary throws `TypeError`, so `null`, `undefined` and an omitted argument all fail. (c) **Separate entry points** (`sliceToEnd(content, start)`, `sliceFromTop(content, end)`) and a strict two-pattern `sliceRegion`. With the prose variant this doubles the surface to 4–6 functions. | (b) | It states intent at the call site ("to the end" is a decision, not a missing value) and closes the omitted-argument widening path with one type rule. (a) keeps an implicit, falsy-driven EOF and needs an arity special case to stay fail-loud. (c) multiplies functions by DC-1's two shapes. |

## Test strategy

**RED first (P1).** Write `test/region-slice.test.js` before the helper exists. It is red
because the `require` fails. Cases, one assertion focus each:

1. Given a start and an end pattern, the slice includes the start line and excludes the end
   line.
2. Given an end pattern that also matches the start line (`/^## /` from a `##` start), the
   end is the next matching line, not the start.
3. Given a start pattern that matches nothing, it throws
   `/region start .* not found — heading renamed\?/`.
4. Given an end pattern that matches nothing after the start, it throws
   `/region end .* not found — heading renamed\?/`, even though EOF is reachable. This is
   the core behaviour.
5. Given `TO_END`, the slice runs to the last line.
6. Given `FROM_TOP`, the slice starts at line 0 and the end is searched from line 0.
7. Given an omitted, `undefined` or `null` end (and, separately, start), it throws
   `TypeError`.
8. `sliceRegion` keeps line breaks: `/^- <https?:/gm` counts both fixture bullets.
9. `sliceProse` matches a phrase split across an indented continuation line.
10. `normaliseWhitespace` collapses a mixed run of spaces, tabs and newlines to one space.

**Migration (P2, P3): behaviour-preserving.** No assertion body changes. Each suite's pass
count must equal the baseline: run-record 49, model-retry-token 10, concepts-frames 7,
auto-compaction-docs 7, as pinned on `HEAD` `cc54aa9`. The matrix above predicts green
for this exact assignment (normalised → P2, faithful + fail-loud → P3).

Optional red-check before P3 lands: in a throwaway copy, delete the `## Rosetta stone`
heading and every later `##` heading from `docs/guides/concepts.md`. The migrated
`concepts-frames.test.js:95` must then fail with `region end … not found`. Today it passes
by widening.

**Gates.** Per part: `node --test <touched files>`. Phase: `bash scripts/ci.sh` (output to a
file, read the tail), which also runs `every-test-file-registers` and the static lints.

## Out of scope

- **A lint forbidding future local slicers in suites**: no such regression exists yet (YAGNI).
- **Other `findIndex` users** (`test/hooks.test.js:490-491`,
  `engine/test/usage-aggregate.test.js:1959`): they locate single lines in command output.
  They do not slice markdown regions.
- **`resolutionChainOf`** (`model-retry-token.test.js:64-71`): a substring slice over
  normalised text, not a line-region slice. It stays in its suite and only switches to the
  imported `normaliseWhitespace`.
- **Guarding `g`/`y` regex flags in the helper**: no call site uses them. Recorded as an
  assumption in Design.
- **Any prose change** in `skills/`, `docs/guides/` or `README.md` beyond the design-doc
  count.
