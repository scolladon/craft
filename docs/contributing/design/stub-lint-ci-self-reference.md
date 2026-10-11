# Design — stub-lint-ci-self-reference

> Brief: stop `stub-lint` from flagging `scripts/ci.sh`'s own mentions of the stub lint
> (BACKLOG "`stub-lint` flags `scripts/ci.sh`'s own mentions of `stub-lint`"), while a real
> stub marker added to `ci.sh` is still caught.
> Status: draft → self-reviewed ×3

## Context

`stub-lint` is the touched-diff stub-marker gate (ADR-210, posture ADR-212). It is a thin
adapter over the shared hygiene core:

- `engine/bin/stub-lint.js` — argv shim → `main(argv, io)`.
- `engine/src/stub-lint-main.js` — the stub-specific parts: `MARKERS` (:12,
  `TODO FIXME HACK XXX PLACEHOLDER STUB`), `SELF` (:13), `WAIVER_PATTERN` (:14),
  `FOUND_TOKEN` (:15), `MARKER_PATTERN` (:18, `\b(<markers>)\b`, flags `gi`), and
  `scan(content)` (:24-32), which emits `<MARKER>@L<n>` for every match on every line.
- `engine/src/hygiene-lint-core.js` `scanFile(file, waived, io, ctx)` — skips the whole
  file when `resolved === ctx.self` (the lint's own module) or when the path is waived.
  Otherwise it prints `STUB-FOUND(<file>): <finding>` for each `ctx.scan` result.

`scripts/ci.sh` is the only caller. ADR-429 moved the static lints into
`scripts/static-lints.sh`, but the hygiene block stayed in `ci.sh`: the comment at :82,
`run_stub_lint()` at :108-122, the invocation at :121, and the call at :165. `run_stub_lint`
passes touched `*.js|*.mjs|*.cjs|*.ts|*.sh` files as scan targets. It passes touched `*.md`
files as `--waiver-source` (:116-118). A `STUB-WAIVE(<path>)` token is read only from those
waiver sources, and it skips the whole file.

ADR-210 ratified the marker set as **case-insensitive and word-boundary** (C1). Its
consequence line states the intent of the boundary rule: "keeps a marker embedded in a
larger identifier from firing". This design refines how that rule meets the lint's own
name. It does not change the marker set or the case rule. The ADR phase records it as a
refinement of ADR-210.

### Reproduction (shipped tree)

```
$ node engine/bin/stub-lint.js -- scripts/ci.sh
STUB-FOUND(scripts/ci.sh): STUB@L82
STUB-FOUND(scripts/ci.sh): STUB@L121
exit 0          # advisory; exit 2 under --gate blocking
```

| ci.sh line | Text | Why it fires |
|---|---|---|
| :82 | `# --- hygiene gates (workstream C): touched-diff stub + prose lints ---` | prose word `stub` |
| :121 | `node engine/bin/stub-lint.js --gate "$hygiene_gate" …` | `-` is a word boundary, so `stub` in `stub-lint` matches |
| :108, :165 | `run_stub_lint` | does not fire: `_` is a word character |

### Whole-file skips also hide real markers (pinned in a mktemp throwaway)

I copied `ci.sh` into a throwaway with `# TODO: x` appended at L168 and ran
`--gate blocking`:

| Setup | Output | Exit |
|---|---|---|
| no waiver | `STUB@L82`, `STUB@L121`, `TODO@L168` | 2 |
| `--waiver-source w.md` holding `STUB-WAIVE(scripts/ci.sh)` | nothing (TODO hidden) | 0 |
| `# STUB-WAIVE(scripts/ci.sh)` written inside `ci.sh` | the three above **plus** `STUB@L169` (the waiver line itself) | 2 |

A path exemption works the same way as the `.md` waiver row (`scanFile`'s `ctx.self`
branch), so it would hide the real TODO too.

## Requirements

- **R1** — `node engine/bin/stub-lint.js --gate blocking -- scripts/ci.sh` on the shipped
  tree prints nothing and exits 0. This assumes DC-2 (a); under DC-2 (b), `STUB@L82`
  remains.
- **R2 (hard constraint)** — a real marker line added to `ci.sh` (`# TODO: x`,
  `# stub: fill in`, `# FIXME`) is still reported with its line number, and the run exits
  2 under `--gate blocking`.
- **R3** — the exemption covers the lint's own name token only, never a whole line or
  file. Another marker on the same line still fires (`stub-lint TODO` → `TODO`;
  `stub-lint stub` → `STUB`).
- **R4** — ADR-210 C1 semantics are otherwise unchanged: same marker set,
  case-insensitive, word-boundary, same `<MARKER>@L<n>` output. Near-miss forms still fire:
  `stub-linter`, `stub-lints`, `stub -lint`, `STUB-WAIVE(x)`.
- **R5** — no change to `hygiene-lint-core.js`, `prose-lint`, the waiver mechanism, or
  `ci.sh`'s wiring. No suppression directive and no waiver token is added anywhere.

## Design

Two edits (recommended shapes; DC-1 to DC-4 put the alternatives to the user).

### 1. `engine/src/stub-lint-main.js` — strip the lint's own name before matching

```js
// The lint's own name: `-` is a word boundary, so `stub` inside `stub-lint` would
// otherwise read as a STUB marker at every call site that names the lint.
const OWN_NAME_PATTERN = /\bstub-lint\b/gi;

function scan(content) {
  const findings = [];
  content.split('\n').forEach((line, idx) => {
    for (const match of line.replace(OWN_NAME_PATTERN, ' ').matchAll(MARKER_PATTERN)) {
      findings.push(`${match[1].toUpperCase()}@L${idx + 1}`);
    }
  });
  return findings;
}
```

- `MARKERS`, `MARKER_PATTERN`, `SELF`, `WAIVER_PATTERN`, `main` and the core stay
  untouched. `scan`'s signature `(content: string) => string[]` is unchanged.
- The replacement is a single space, so line numbers, which are the only positional data
  in a finding, are unaffected. `\b` on both sides of the name means its neighbours are
  non-word characters or line edges. Removing it can never glue two fragments into a new
  marker. `TODOstub-lint` is not stripped (no boundary before `s`) and stays a non-finding,
  exactly as today.
- `OWN_NAME_PATTERN` is a regex literal, compiled once. `String.prototype.replace` with a
  global regex resets `lastIndex`, so reusing it across lines carries no state. This is
  the same reasoning as the existing `MARKER_PATTERN` comment.
- The `i` flag mirrors the marker rule's case-insensitivity, so `STUB-LINT` is the name
  too.

### 2. `scripts/ci.sh:82` — name the lints instead of describing them

```diff
-# --- hygiene gates (workstream C): touched-diff stub + prose lints ---
+# --- hygiene gates (workstream C): touched-diff stub-lint + prose-lint ---
```

A bare prose `stub` is indistinguishable from a real `# stub: fill in` (R2), so the line
is reworded rather than exempted. No test anchors on this comment: `test/hygiene-gates-ci.test.js`
anchors on `run_stub_lint`, the `stub-lint.js` invocation line, and the static-lints call.
The plan docs that quote the old comment (`docs/contributing/plan/harness-hygiene-prune-gates.md:494`,
`docs/contributing/plan/ci-lint-chain-fail-closed.md:112`) are dated ledgers and stay frozen.

### Pinned matrix (Node v22.22.3, real `MARKER_PATTERN` vs the proposed strip)

| Line | Today | Name-strip rule | Case-sensitive (rejected) |
|---|---|---|---|
| `# --- hygiene gates (workstream C): touched-diff stub + prose lints ---` | STUB | STUB | — |
| `# --- hygiene gates (workstream C): touched-diff stub-lint + prose-lint ---` | STUB | — | — |
| `  node engine/bin/stub-lint.js --gate "$hygiene_gate" -- "${src[@]}"` | STUB | — | — |
| `run_stub_lint() {` | — | — | — |
| `# TODO: x` | TODO | TODO | TODO |
| `# stub: fill in` | STUB | STUB | **—** (misses R2) |
| `# FIXME` | FIXME | FIXME | FIXME |
| `stub-lint TODO later` | STUB,TODO | TODO | TODO |
| `stub-lint stub` | STUB,STUB | STUB | — |
| `stub-lint stub-lint` | STUB,STUB | — | — |
| `STUB-LINT` | STUB | — | STUB |
| `Stub-Lint` | STUB | — | — |
| `stub-linter` | STUB | STUB | — |
| `stub-lints` | STUB | STUB | — |
| `stub -lint` | STUB | STUB | — |
| `stub--lint` | STUB | STUB | — |
| `xstub-lint` | — | — | — |
| `TODOstub-lint` | — | — | — |
| `stub-lintTODO` | STUB | STUB | — |
| `import { main } from "../src/stub-lint-main.js";` | STUB | — | — |
| `STUB-WAIVE(x)` | STUB | STUB | STUB |
| `STUB-FOUND(x)` | STUB | STUB | STUB |

I rejected case-sensitive matching without making it a candidate. It misses
`# stub: fill in`, which fails R2, and it reverses the case rule ADR-210 ratified.

A pure **invocation-line** rule (exempt lines that run `engine/bin/stub-lint.js`) clears
:121 only and leaves :82 firing. The token rule above clears both and is no wider, so the
line-shape variant is not carried forward.

### Incidental effect outside ci.sh (measured, not targeted)

Scanning every tracked non-test source file today
(`git ls-files -z '*.js' '*.mjs' '*.cjs' '*.ts' '*.sh'`, minus the `ci.sh`-excluded test
paths, through `xargs -0 node engine/bin/stub-lint.js --`) gives 10 findings. The
name-strip rule also clears two of them, both literal `stub-lint` tokens:
`engine/bin/stub-lint.js:3` (the shim's import of `stub-lint-main.js`; the shim is not
`ctx.self`) and `engine/src/hygiene-lint-core.js:2`. The other six are listed in Out of scope.

## Decision candidates

| # | Choice | Alternatives (≤3) | Recommendation | Why |
|---|---|---|---|---|
| DC-1 | Exemption mechanism | (a) **Token-shape rule**: the lint's own name `stub-lint` is not a marker; strip it per line before matching (user option 2, token form). (b) **Path exemption**: treat `scripts/ci.sh` as a known call site next to `ctx.self` in `scanFile` (user option 1). (c) **`STUB-WAIVE(scripts/ci.sh)`** (user option 3). | (a) | (b) and (c) skip the whole file, and the throwaway pin shows a real `# TODO: x` at L168 hidden, which fails R2. (b) also hard-codes one repo's script path into the shared engine core. (c) cannot live in `ci.sh` (it is a scan target, not a waiver source, and the waiver line itself adds `STUB@L169`). It would have to be re-supplied in a touched `.md` on every change that touches `ci.sh`. (a) is per-token, keeps every row in the R2/R3 matrix, and changes only `stub-lint-main.js` on the engine side. |
| DC-2 | `ci.sh:82` prose `stub` | (a) **Reword** the comment to `touched-diff stub-lint + prose-lint`. (b) **Leave it**: one advisory finding remains on every `ci.sh`-touching change. (c) **Widen the rule** to exempt prose phrasings (`stub + prose`, `stub/prose`). | (a) | (b) fails R1. (c) cannot be told apart from `# stub: fill in` without phrase-matching prose, which is the over-generalisation the brief forbids. (a) is a one-line comment edit that no test anchors on. |
| DC-3 | Breadth of the exempt token family | (a) **`stub-lint` only**. (b) `stub-lint` plus the lint's own run-record tokens `STUB-WAIVE` / `STUB-FOUND`. (c) Any `<marker>-lint` (generic lookahead on every marker). | (a) | `ci.sh` contains neither `STUB-WAIVE` nor `STUB-FOUND`. (b) would only clear `hygiene-lint-core.js:7` (out of scope). (c) exempts lint names that do not exist (`todo-lint`), which YAGNI rules out. |
| DC-4 | Where the rule lives in `stub-lint-main.js` | (a) **Separate `OWN_NAME_PATTERN` stripped in `scan`** before `matchAll`. (b) Per-marker negative lookahead built into `MARKER_PATTERN` (`STUB(?!-lint\b)` special-cased in the alternation). (c) Post-filter each match by peeking at `line.slice(match.index)`. | (a) | `MARKERS` and `MARKER_PATTERN` stay as ADR-210 ratified them. The exemption is a named, separately testable constant, and the regex literal gives Stryker a mutation surface the matrix rows kill. (b) couples the marker list to one exception inside a template-built regex. (c) adds index arithmetic to a 9-line function. |
| DC-5 | Guard over the shipped `ci.sh` | (a) **Fixture-only unit tests** (ci.sh-shaped lines in `engine/test/stub-lint-main.test.js`). (b) Fixtures **plus** a process test in `test/hygiene-gates-ci.test.js` that runs the bin over the real `scripts/ci.sh` and asserts zero findings. | (a) | (b) makes any stub marker in `ci.sh` a hard test failure regardless of `hygiene.gate`, which silently promotes one file to blocking against the ADR-212 advisory default. Choose (b) if `ci.sh` should be stub-free as a matter of policy. |

## Test strategy

All new cases go in `engine/test/stub-lint-main.test.js`. They reuse its `tmpRoot()`,
`writeFixture(root, relPath, content)`, `makeCaptureIo()` (`engine/test-helpers/capture-io.js`)
and the `MARKERS` mirror, follow node:test Given/When/Then titles, use the AAA body, and set
`const sut = main`. Each fixture is written as `scripts/ci.sh` under the tmp root, so the
finding prefix reads `STUB-FOUND(<root>/scripts/ci.sh):`.

1. **RED repro.** Given a ci.sh-shaped fixture holding the reworded :82 line and the :121
   invocation line, when `main` runs `--gate blocking`, then exit 0 with empty stdout.
   Today it prints `STUB@L1`, `STUB@L2` and exits 2.
2. **R2 pin.** Given the same fixture plus `# TODO: x`, `# stub: fill in` and `# FIXME`
   lines, when `main` runs `--gate blocking`, then it reports exactly `TODO@L3`,
   `STUB@L4`, `FIXME@L5` and exits non-zero. This passes before and after the fix and is
   the regression guard for the hard constraint.
3. **No over-generalisation pin.** Given the **original** :82 wording
   (`touched-diff stub + prose lints`), when `main` runs, then `STUB@L1` is still
   reported. This documents that prose `stub` remains a marker.
4. **Token, not line (R3).** Given `stub-lint TODO later` and `stub-lint stub`, then
   exactly `TODO@L1` and `STUB@L2`, one finding each.
5. **Name-boundary matrix (R4, mutant-killing).** Each row asserts the finding set from the
   pinned matrix:
   - `stub-linter`, `stub-lints`, `stub -lint`, `stub--lint` → `STUB`. Kills the dropped
     trailing `\b`.
   - `STUB-LINT`, `Stub-Lint` → none. Kills the dropped `i` flag.
   - `stub-lint stub-lint` → none. Kills the dropped `g` flag.
   - `TODOstub-lint` → none. Kills the dropped leading `\b`: the mutant strips the
     name and exposes `TODO`.
   - `STUB-WAIVE(x)` → `STUB`.
   - The `' '` replacement-string mutant (`''` or any marker-free text) is equivalent: the
     name is stripped only between non-word characters or line edges, so no replacement
     can create or hide a marker. Record it as equivalent, with that reason, in a comment
     beside the code, the way `hygiene-lint-core.js` documents its own equivalent mutants.
6. **Existing suites unchanged.** The standalone-vs-glued marker loop (:183), `STUBBORN` /
   `TODOLIST` (:117), the lowercase `todo` (:131) and self-exclusion (:170) stay green
   untouched. `engine/test/hygiene-lint-core.test.js` and
   `engine/test/stub-lint.bin.test.js` need no change, since the core is untouched.

Gates: `bash scripts/ci.sh` green, and R1 checked by hand with
`node engine/bin/stub-lint.js --gate blocking -- scripts/ci.sh` (empty output, exit 0).
Stryker mutates the `stub-lint-main.js` hunk. Narrow the corpus to
`engine/test/stub-lint-main.test.js`, `engine/test/stub-lint.bin.test.js` and
`engine/test/hygiene-lint-core.test.js`. Rows 4-5 exist to kill the `OWN_NAME_PATTERN` and
`replace` mutants, and any survivor is hand-checked against that full set. `ci.sh` is
outside the mutate scope.

## Out of scope

- **Other prose-`stub` self-references** (proven by the full-tree scan above):
  `engine/src/hygiene-lint-core.js:18` ("stub/prose target") and
  `engine/src/hygiene-gate-main.js:3` ("stub/prose lints"). They fire only when those files
  are touched, and fixing them means rewording, not a rule.
- **`STUB-WAIVE` in source**, `engine/src/hygiene-lint-core.js:7` (`SLOP/STUB-WAIVE`):
  this is DC-3 (b), not taken by default.
- **Prose `placeholder` in comments**: `engine/src/gates.js:25`, `adapters/pi/src/run.js:29`,
  `engine/src/observability/adapters/aider/telemetry.js:137`. This is the general
  false-positive class of ADR-210's case-insensitive rule, not self-reference.
- **`prose-lint`**: `run_prose_lint` (`ci.sh:123-135`) scans only touched `.md` files, so
  `ci.sh` is never one of its targets.
- **ADR-210's `STUB-WAIVE(<marker>)` wording vs the implemented `STUB-WAIVE(<path>)`**: a
  doc mismatch, unrelated to this fix.
