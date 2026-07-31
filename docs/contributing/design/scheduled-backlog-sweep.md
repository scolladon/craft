# Design — scheduled backlog sweep

> Brief: close the eleven remaining scheduled backlog items in one pass, grouped by the
> code they touch — the findings normalizer, plan-lint/scope-spec, the hygiene and docs
> lints, and the adapter tooling.
> Status: draft → self-reviewed ×3 → accepted

## Context

Eleven open entries sit under the dated `### Open (scoped …)` headings in `BACKLOG.md`
(lines 178–294). The surrounding sections are mostly delivered records kept for
provenance; these eleven are genuinely open. They are not one feature — they are the
residue of six prior runs. What makes them one change is the code: **five** of them land in
`engine/src/findings.js` (1a, 1b, 1c, 2a, 2c), one in `engine/src/plan-lint-main.js` (2b),
two in the hygiene and docs lints (3a, 3b), and three in the adapter surface (4a, 4b, 4c).

### The surfaces

**`engine/src/findings.js`** (282 lines) is the canonical-findings boundary. It exports
three functions — `normalizeFindings(raw)`, `parseScopeSpec(spec)`,
`filterFindings(findings, ranges, repoRoot = '')` — and keeps eight private helpers:
`toFinding`, `looksLikeJsonArray`, `mapJsonItem`, `parseJsonShape`, `parseLine`,
`parseLineShape`, `parseScopeEntry`, `canonicalPath`. It is consumed by
`engine/bin/normalize-findings.js` and by `engine/src/filter-findings-main.js`
(ADR-304: the filter consumes canonical findings, never raw technique output). The
validation skill pipes them together at
`skills/validation/SKILL.md:160-168`:

```
normalize-findings "$out" | filter-findings --scope "$spec" --repo-root "$(git rev-parse --show-toplevel)"
```

`$spec` is read from a `mktemp` file outside the worktree, then passed as one argv value
(ADR-305: the scope spec is one comma-joined `<file>:<start>-<end>` string).

**`engine/src/plan-lint-main.js`** carries the cognitive-locality advisory
(`overlapWarnings`, `declaredFiles`, `resolveDeclaredFile`, `BACKTICK_PATTERN`,
`MERGEABLE_PART_LIMIT`). ADR-306 fixes it as advisory, never blocking. ADR-307 fixes
path detection at backticked spans in a part's `### Context` block. ADR-308 puts it in
`engine/bin` + `engine/src`.

**`scripts/ci.sh`** is the substrate gate: a lint chain at lines 80–85, then
`compute_touched` (92–103), the `hygiene_gate` resolution (104–107), and the two hygiene
lints `run_stub_lint` / `run_prose_lint` (108–142). Its own header sanctions appending:
new binaries append to this file so CI never references a binary before it exists.
`shellcheck scripts/*.sh` at line 80 covers any new script with no registration, and
`run_suite process test` at line 60 auto-discovers any new `test/*.test.js`.

**`adapters/`** holds seven adapter directories plus a `README.md`; six of the seven carry
an `agents/` directory mirroring the nine shared `agents/*.md` bodies. `pi` has a
`native-surface.test.js` but **no** `agents/` directory — a sync tool must not assume that
every adapter with a native-surface test mirrors.

### House patterns this change must follow

- **bin shim over pure `-main.js`.** `scripts/<name>.sh` → `engine/bin/<name>.js`
  (≈5 lines) → `engine/src/<name>-main.js` (`export function main(argv, io) → number`).
- **Check-only guards.** There is no `--check` flag anywhere in the repo today
  (`grep -rn -- "--check" engine/src engine/bin scripts hooks` returns nothing). The
  house shape is a tool that prints one finding line per problem and exits non-zero.
  `scripts/readme-drift.sh` → `engine/src/readme-drift-main.js` is the nearest precedent:
  four sub-guards, all findings aggregated, one line each as
  `readme-drift: <surface>: <detail>`, exit 1 if any.
- **Equivalent-mutant comments in place.** A well-established convention — over a hundred
  instances across `engine/src` and `adapters/*/src`, including
  `engine/src/findings.js:271`, nine in `engine/src/plan-lint-main.js` (34, 50, 84, 97,
  121, 124, 160, 170, 200) and two in `engine/src/filter-findings-main.js` (85, 92). Form:
  `// equivalent mutant (<Kind>): <why no caller can observe it>`.
- **`Object.hasOwn` per-source lookups.** `DEFAULT_READ_ROOTS` +
  `resolveDefaultReadRoot`, `SOURCE_FILE_MATCHERS` + `resolveFileMatcher`, each exported
  as a unit-test seam, each rejecting inherited members explicitly.
- **Discrete flag/value argv pairs, never interpolated**, with a per-entry
  `assertNonEmptyString` — `adapters/aider/src/launch-args.js`.

### Premises re-measured before designing

Every entry's premise was checked against the live tree. Five did not survive intact.

| Item | Recorded premise | Measured |
|---|---|---|
| 1a/1b | trigger is "a long whitespace run **before a trailing `\|`**" | **Narrower than reality.** Any interior contiguous whitespace run not immediately followed by `\|`+whitespace is quadratic. `'…f' + ' '×80000 + 'x'` (no pipe at all) costs 6.07s; `'…f' + ' '×80000 + '\| fix'` (a *successful* split) costs 0.10ms. The pipe is irrelevant; the unmatched run is the cost. |
| 1c | "~20 pre-existing survivors" | **34 unkilled**: 27 survived + 7 no-coverage, of 224 instrumented mutants (score 84.82% total / 87.56% covered). One is already documented (`:271`), so **33 to triage**. |
| 2b | 49 warnings, 14 of 23 plans, 37 two-part | **Stale by exactly one plan.** Today: 24 plans, 15 emitting, **54** warnings (49 mergeable + 5 shared-infrastructure), 41 two-part. Subtracting `codex-0145-limitation-reprobe.md` (added 2026-07-31, commit `2fbfd29`, contributing 5) reproduces 23/14/49/37 exactly. Trap: today's `49` is the *mergeable subtotal*, not the total — the two coincide by accident. |
| 2c | "`parseScopeEntry` rejects any colon-bearing whole-file path (`C:\repo\a.js:*`)" | **False, and probably always was.** `WHOLE_FILE_ENTRY_PATTERN = /^(.+):\*$/u` has a greedy head, so `C:\repo\a.js:*` parses to `{file:'C:\\repo\\a.js', start:0, end:MAX}` and `C:\repo\a.js:1-9` parses to `{file:'C:\\repo\\a.js', start:1, end:9}`. The module comment at lines 30–33 says so explicitly. **Half of item 2c is closed by evidence.** |
| 3b-ii | "the doc's own prose claims a fenced-block rationale" | **The wrong prose is in a different file.** `readme-drift-guards.md` contains zero occurrences of "lychee". The incorrect claim lives at `docs/contributing/plan/docs-audience-split.md:356-360`. `BACKLOG.md:227-232` already states the correct diagnosis. |
| 4c | backlog cites `docs/adapters/aider-poc-record.md` | **Stale path.** `docs/adapters/` does not exist; the file is `docs/contributing/specs/aider-poc-record.md`. |

Everything else held. In particular: all **54** adapter mirrors are byte-in-sync right
now; `docs/contributing/plan/*` is genuinely absent from the prose-lint excuse globs; the
`--audience` dedupe genuinely under-lists a co-offender; and the byte-pinned pair —
`scripts/ci.sh:134` and the case-arm regex at `test/hygiene-gates-ci.test.js:77` — matches
the recorded bytes exactly, em dash and indentation included.

Baseline is green: `bash scripts/ci.sh` exits 0 under a prepended PATH of fast-failing
stubs for `aider`, `codex`, `copilot`, `cursor-agent`, `opencode`, `pi`. Without those
stubs the gate spawns the real binaries — all six are installed on this machine — and
hangs for tens of minutes.

## Requirements

1. `normalizeFindings` costs no more than linear time in the length of any single line.
   The pathological input measured at 200,000 characters (39.0s today) completes in
   milliseconds, and the shape of the fix is proven behaviour-identical, not asserted.
2. Any oversized per-line record produces an operator-facing error that names the cap and
   the measured length — never a message that says the line failed the *format* when the
   only thing wrong with it is its size. The message keeps the existing
   `Cannot parse findings: ` prefix and the existing 120-character echo truncation.
3. `engine/src/findings.js` carries no unkilled mutant that is neither killed by a real
   test nor documented in place as provably unobservable. No survivor is dismissed as not
   worth testing. Every reduction in the instrumented mutant count maps to a line the
   change deliberately deleted.
4. The scope-spec delimiter question is settled by decision, and whatever is settled is
   recorded in an ADR that refines ADR-305.
5. The cognitive-locality advisory's specificity question is settled by measurement.
   Whatever the outcome, the check stays advisory (ADR-306) and no overlap is suppressed
   to improve the statistic.
6. The Windows path-separator question is settled by decision, with the two halves of the
   original entry distinguished: the `canonicalPath` prefix defect (real) and the
   colon-rejection claim (false).
7. `docs/contributing/plan/*` stops producing advisory `SLOP-FOUND` noise, and the
   `scripts/ci.sh` glob clause and the `test/hygiene-gates-ci.test.js` case-arm regex move
   in the same commit.
8. `scripts/docs-structure-lint.sh --audience` lists every co-offender, including when an
   earlier top-level entry name contains a space. A false pass stays impossible.
9. `docs/contributing/plan/readme-drift-guards.md` no longer hides two thirds of its
   content inside a runaway code block, the metrics quote no longer presents a stale
   target as a live link, `lychee --offline` over the repo still passes, and the prose
   asserting the wrong reason for the invisibility is corrected to the measured one.
10. A single command syncs all 54 adapter agent mirrors from the shared bodies, and a
    read-only mode of that same tool runs in `scripts/ci.sh`. The tool cannot silently
    corrupt a mirror: the six per-adapter byte-identity guards remain, independently
    implemented, and opencode gains the one it lacks.
11. The usage miner's zero-file note names the filename the resolved source actually looks
    for. The existing exact-string pin for the claude/default source keeps passing
    unchanged.
12. `buildLaunchArgs` can emit `--file <path>` editable targets for edit-phases, keeping
    `--read` for role and context only; omitting the new parameter emits exactly today's
    argv. `docs/contributing/specs/aider-poc-record.md` records honestly that `--file` is
    necessary and not sufficient.
13. No new test spawns a real agent CLI binary.
14. `bash scripts/readme-drift.sh` exits 0 when the change lands. Adding this design doc
    already breaks it (`corpus-counts: docs/contributing/design/ claims 25, tree holds
    26`), and the plan and the ADRs this run ratifies move two more counts.

## Design

### Cluster 1 — `engine/src/findings.js`

#### 1a+1b — the `parseLine` quadratic (one defect, two entries)

**What it is.** `parseLine` (line 117) does `remainder.split(PIPE_DELIMITER)` where
`const PIPE_DELIMITER = /\s+\|\s+/u` (line 17). `String.prototype.split` restarts the
match at every position; at each position inside a whitespace run, `\s+` consumes to the
end of the run and then fails on `\|`, so the engine backtracks across the run and
retries one character later. Cost is quadratic in the run length.

**Measured, this tree, Node 22.** Input `'HIGH a.js:1 — f' + ' '×n + <tail>`:

| n | tail `\|` | tail `x` (no pipe) | tail `\| fix` (matches) |
|---|---|---|---|
| 10,000 | 93.1 ms | 94.1 ms | 0.0 ms |
| 40,000 | 1,520.6 ms | 1,522.3 ms | 0.1 ms |
| 80,000 | 6,070.4 ms | 6,067.0 ms | 0.1 ms |
| 200,000 | 38,959.6 ms | — | — |

Two corrections to the recorded framing follow from this. The trailing pipe is not the
trigger — a run followed by *anything that is not* `|`+whitespace is equally quadratic,
so the reachable input class is much wider than recorded (any progress bar or
column-padded reporter line). And line length alone is not the cost: 80,000 non-whitespace
characters cost 0.3 ms. The contiguous whitespace run is the cost driver.

**The trigger is real.** The validation digest at `skills/validation/SKILL.md:160-168`
pipes a third-party technique's own stdout through `normalizeFindings`. A `cut`-style cap
at the shell pipe stays rejected: canonical findings payloads are JSON and commonly one
long line, and truncating there corrupts valid input. The fix belongs inside the module.

**The delimiter has a linear equivalent.** Replacing `/\s+\|\s+/u` with
`/(?<=\s)\|(?=\s)/u` — single-character lookbehind and lookahead, no quantifier, no
backtracking shape — and trimming each resulting part removes the pathology at the root:

| n (whitespace run) | shipped `\s+\|\s+` | lookaround | ratio |
|---|---|---|---|
| 4,096 | 16.0 ms | 0.027 ms | 590× |
| 16,384 | 243.6 ms | 0.038 ms | 6,400× |
| 200,000 | 38,959.6 ms | 0.62 ms | 62,800× |
| 5,000,000 | (not run) | 12.09 ms | — |

**The per-part trim is mandatory, not cosmetic.** The shipped delimiter's leading `\s+`
consumed the whitespace before the pipe, so `parts[0]` never carried trailing whitespace.
The lookaround matches only the pipe itself, so `'HIGH a.js:1 — f | fix'` splits into
`['HIGH a.js:1 — f ', ' fix']` — and `LINE_HEAD_PATTERN` ends `(.*\S)$`, which cannot match
a string ending in a space. Without `.map(p => p.trim())` every line carrying a fix would
stop parsing. The trim is precisely what restores the shipped delimiter's parts, and it is
therefore part of the equivalence claim, not an afterthought.

The lookaround form is behaviour-identical at the `parseLine` decision level, pinned
empirically rather than argued: a differential harness ran both splits through a faithful
copy of `parseLine` over **2,000,000 random strings** drawn from an alphabet chosen to
stress the delimiter (`a | ⟨two spaces⟩ \t x — – - : 1 HIGH a.js VERIFIED: fix`) plus 14
directed cases, comparing the returned `Finding | null`. **Zero mismatches.** A
split-array-level differential does find divergences, all of one shape — adjacent
whitespace-delimited pipes (`a | | b`), where the shipped split yields two parts whose
second contains a `|` (rejected by the `fix.includes('|')` guard) and the lookaround split
yields three parts (rejected by `parts.length > 2`). Both return `null`; the outcome is
identical and only the rejection path differs. That is exactly why the differential is run
at the outcome level, not the split level.

**The cap.** Independently of the split, an oversized line is worth rejecting up front: it
bounds the worst reachable input even if the delimiter ever regresses, and it bounds what
a hostile or broken technique can push through the boundary. A cap is a behaviour change
and wants its own ADR.

Placement: `parseLineShape` (line 149), inside the existing loop, **before** the
`parseLine(line)` call. `parseLineShape` already owns the "this line is unusable, throw
with a truncated echo" discipline (lines 158–164), and this keeps `parseLine` total —
`null` continues to mean *shape mismatch* and never *too long*, so the two rejection
reasons stay distinguishable at the one place that reports them.

```js
const MAX_LINE_CHARS = 16384;
// … inside the loop, before parseLine:
if (line.length > MAX_LINE_CHARS) {
  throw new Error(
    `Cannot parse findings: line exceeds the ${MAX_LINE_CHARS}-character cap`
    + ` (${line.length} characters): ${JSON.stringify(shown)}`,
  );
}
```

`shown` is the existing 120-character truncation, hoisted above both throws. The cap
measures the line **as split from `raw`**, before `parseLine`'s `trim()` — that is what
the module received and what the reported length should mean, and it matches the untrimmed
`line` the echo already uses.

**Why 16,384, and why the threshold is coupled to the tests.** The longest line in the four
per-line fixtures under `engine/test/fixtures/findings/` is **78 characters** (48 / 78 / 71
/ 56); the module's own echo truncation is 120 and `filter-findings-main.js`'s is 120.
16,384 is over 200× the largest observed record and 136× the echo cap, so no legitimate
line is near it. It is also **above the knee of the quadratic**, which matters for the test
strategy: the existing ReDoS guards use 5,000 characters and would be rejected outright by
any cap below that, converting a guard that exercises the split into a guard that exercises
the cap. At 16,384 the largest input that still reaches the split costs 243.6 ms under the
shipped delimiter and 0.038 ms under the lookaround one — the guard stays a real guard, runs
green in microseconds, and a regression shows as a 6,400× jump rather than as a hang.

**Message-prefix compatibility.** Both throws keep the `Cannot parse findings: ` prefix,
so every existing `/Cannot parse findings/` assertion still passes. That is a hazard, not
a convenience: two tests today assert only that prefix on 5,000-character pathological
input and would keep passing while silently changing what they prove. The test strategy
below requires them to assert the specific message.

**Callers.** `normalizeFindings` (line 185) → `parseLineShape` (149) → `parseLine` (117).
`normalizeFindings` routes any input whose trimmed form starts with `[` to
`parseJsonShape`, so JSON payloads never reach `parseLine` and the cap cannot truncate a
one-line JSON array. Verified: `normalizeFindings('  [{…}]')` parses, because
`raw.trim()` at line 186 runs before the shape sniff.

#### 1c — mutation-baseline hardening

**Measured baseline**, full-file scoped run in a `mktemp` copy of the worktree, stub PATH
prepended, `npm --prefix engine run mutation -- --mutate "engine/src/findings.js"`:

```
File         |  total | covered | # killed | # timeout | # survived | # no cov | # errors
 findings.js |  84.82 |   87.56 |      190 |         0 |         27 |        7 |        0
```

224 instrumented, 34 unkilled, one already documented (`:271`) → **33 to triage**.

| Site | Mutants | Triage |
|---|---|---|
| `PIPE_DELIMITER` (17:24) | 1 Regex (`\s+\|\s+` → `\s+\|\s`) | **Vanishes** if the lookaround delimiter ships — the mutated construct no longer exists. |
| `LINE_HEAD_PATTERN` (18:27) | 3 Regex: `^` dropped; `$` dropped; `\s+`→`\s` after the dash | `^` dropped is **killable**, verified both directions: `'a b HIGH x.js:1 — f'` throws today, and the unanchored pattern matches it as `HIGH`/`x.js`/`1`/`f`. `$` dropped and `\s`: `(.*\S)` is greedy and `toFinding` trims `finding`, so neither is observable — **document**. |
| `toFinding` (54:14) | 1 MethodExpression (`.trim()` dropped) | **Killable** via the JSON path: a fixture whose `finding` carries padding. Unreachable via the per-line path, where `\s+(.*\S)$` already trims. |
| `mapJsonItem` guard (80:7 ×3, 80:23, 80:49, 81:21) | 6 (2 no-coverage) | **All six killed by two tests**: `normalizeFindings('[null]')` and `normalizeFindings('[1]')`, each asserting the exact `Finding at index 0 is not an object` message. |
| `parseJsonShape` catch (101:17, 102:77) | 2 | **Killable.** 101 needs an assertion on the *invalid JSON* message specifically (the swallowing mutant falls through to the array-guard message, which the current `/Cannot parse findings/` assertion also matches). 102 needs `err.cause` asserted — the no-swallowed-errors guardrail rests on that chain. |
| `parseJsonShape` array guard (104:7, 104:31, 105:21) | 3 (2 no-coverage) | **Unreachable.** `parseJsonShape` is private and only called after `looksLikeJsonArray`; `JSON.parse` of a `[`-leading string either throws or yields an array. Probed with `'['`, `'[]x'`, `'[[]]'`, `'[1,2]'`, `'[null]'`. See DC-2. |
| `parseLine` (125:7, 125:25) | 2 (1 no-coverage) | **Killable** — no test today produces three parts. `'HIGH a.js:1 — a \| b \| c'` must throw. |
| `parseLine` (133:15) | 1 ConditionalExpression | **Equivalent** given the 125 guard: `parts.length ∈ {1,2}` at that point and `parts[1]` is `undefined` when length is 1. **Document.** |
| `parseLine` (135:33) | 1 ConditionalExpression | **Killable** — `'HIGH a.js:1 — f \| a\|b'` (a pipe in the *fix*; only the *finding* case is covered today). |
| `parseLineShape` blank filter (150:20, 150:48 ×2, 150:61) | 4 | **All killable** with two inputs: an interior empty line and an interior whitespace-only line, each asserting the surviving finding count. |
| `parseLineShape` empty guard (151:7, 151:30, 152:12) | 3 (2 no-coverage) | **Unreachable.** `normalizeFindings` returns `[]` before calling it whenever `trimmed === ''`, so a non-empty trimmed input always yields ≥1 non-blank line. See DC-2. |
| `parseLineShape` echo truncation (160:21 ×2) | 2 | **Killable.** ConditionalExpression: a short unparseable line must echo in full with no `…`. EqualityOperator (`>` → `>=`): an exactly-120-character unparseable line must echo in full — a boundary test. |
| `normalizeFindings` (186:19) | 1 MethodExpression (`raw.trim()` dropped) | **Killable** — a JSON array with leading whitespace parses today (`normalizeFindings('  [{…}]')` verified) and would be routed to the per-line shape under the mutant. Worth pinning on its own merits: technique stdout routinely carries a leading newline. |
| `normalizeFindings` empty guard (187:7, 187:19, 187:23) | 3 | **Equivalent**, and equivalent *because* `parseLineShape` returns `[]` for the same input with or without its own guard. Reachable but redundant — see DC-2, which separates that from the two unreachable guards above. |
| `filterFindings` (271:61) | 1 StringLiteral | Already documented. Unchanged. |

**Three empty/shape guards are mutually redundant**, and 9 of the 33 unkilled mutants sit
on them. `normalizeFindings('')`, `'   '`, `'\n\n'` and `' \t\n '` all return `[]` today;
each of the three guards can be removed individually without changing that, because
`parseLineShape`'s loop over an empty `nonBlank` already returns `[]`. Two of the three are
*unreachable* (private helpers, guarded by their only caller); the third is *reachable but
redundant* at a public entry point. DC-2 is where that distinction is ruled on.

Net, under the recommended rulings (DC-1 (a), DC-2 (c)), the 33 resolve as: **1** mutant
disappears with the replaced delimiter, **6** disappear with the two deleted unreachable
guards, **20** die to new tests, **6** are documented in place
(`LINE_HEAD_PATTERN`'s `$`-drop and `\s`-narrowing, `parseLine`'s 133:15, and the
`normalizeFindings` empty-guard trio). 1 + 6 + 20 + 6 = 33.

**The runner constraint, verified in this tree.** Per-hunk runs need ONE comma-separated
`--mutate`. Repeated flags silently drop all but the last and report a clean score over a
fraction of the file:

| Invocation | killed | survived | no-cov | total |
|---|---|---|---|---|
| `--mutate "…:117-139" --mutate "…:149-168"` | 18 | 7 | 2 | **27** |
| `--mutate "…:117-139,…:149-168"` | 40 | 10 | 3 | **53** |

Two consequences the plan must carry. Inserting equivalent-mutant comment lines shifts
every subsequent line, so hunk ranges must be re-derived from the post-edit file before
any re-run. And the instrumented total must be compared before and after: it may only
shrink by the count attributable to deliberately deleted lines, never by an unexplained
amount, because an unexplained shrink is the signature of a mis-specified range.

`engine/stryker.conf.json` declares no `thresholds`, so no run breaks on score.

### Cluster 2 — plan-lint and scope-spec

#### 2a — scope-spec delimiter

`parseScopeSpec` (line 233) splits on `,`. A legal path containing a comma fails **loudly**
today — verified: `parseScopeSpec('a,b.js:1-9')` throws `malformed scope entry: "a"`, and
`parseScopeSpec('a,b.js:*')` throws the same. Nothing is silently mis-scoped. This is a
supported-form question, not a defect.

Newline is available at the root because the spec is no longer interpolated: the
validation skill writes it to a `mktemp` file outside the worktree, reads it into `$spec`,
and passes it as one argv value. Paths cannot contain newlines, so a newline delimiter
removes the ambiguity entirely. It deviates from ADR-305's ratified comma-joined form and
wants its own ADR. Note that ADR-305's substantive ground — *one* argument, so the
repeated-flag hazard cannot recur — survives a newline join untouched; only the cosmetic
symmetry with Stryker's `--mutate` comma form is lost.

The cost of switching: the code comment at lines 237–239 protects hand-authored
`"a.js:1-9, b.js:1-9"`, which would become one malformed entry (loudly). No tracked path
in this repo contains a comma (`git ls-files | grep ','` is empty). See DC-3; the design
does not decide it.

#### 2b — locality-advisory specificity

**Re-measured baseline**, real bin over every file in `docs/contributing/plan/`:

| Metric | Measured |
|---|---|
| Plan files | 24 |
| Plans emitting ≥1 warning | 15 (62.5%) |
| Total warnings | 54 |
| …mergeable shape (≤3 parts) | 49 |
| …shared-infrastructure shape (>3 parts) | 5 |
| …exactly two parts | 41 |
| Exit codes | 0 on all 24 — no plan fails the schema check |

**Both named candidates were simulated over the whole corpus**, with the simulator first
reproducing the shipped bin row-for-row (54/54, zero differences).

*Candidate A — skip paths declared only inside quoted snippets.* Fenced blocks only:
**Δ = 0**. Fenced plus list-aware indented code: **Δ = 0**. Fenced plus a naive
four-space/tab reading: **Δ = −1**, and that one removal is wrong — the Part 8 mention in
`native-copilot-binding.md:1265` is a markdown table row indented five spaces because it is
nested under a list item, not a quoted snippet. The premise is already satisfied by
accident: `overlapWarnings` runs `BACKTICK_PATTERN` over the `### Context` block *joined
into one string*, so a fence is an odd backtick run that re-pairs every backtick after it,
and fenced content is therefore largely invisible to the detector already. (Matching
per-line instead yields 111 rows, not 54.)

*Candidate B — weight edited versus merely referenced.* Defining "edits" as a path
appearing in `### TDD steps`, `### Commit`, or the part heading: **54 → 8 warnings, an 85%
reduction**, and only 6 of the 41 two-part overlaps survive. Three findings disqualify it:

- `### Commit` contains zero resolvable repo paths in **163 of 163 parts** — it is a
  one-line conventional-commit subject. Half of B's stated input channel does not exist.
- Only 102 of 163 parts (62.6%) name any resolvable path in `### TDD steps`, so **25 of
  B's 46 removals (54%) rest on absent evidence**, not on evidence of non-editing.
- At least one confirmed genuine edit-edit overlap is destroyed:
  `close-hygiene-lint-followups.md | engine/src/prose-lint-main.js | Part 1, Part 2` —
  both parts genuinely edit it; B kills the warning only because Part 1 spelled the path
  as a brace-expansion glob and Part 2 in English. A loose-substring variant does not
  rescue it, and introduces a false positive of its own
  (`orchestrator-tax-hardening.md | contracts/core.md`, matched inside a quoted
  Given/When/Then test title).

*A+B combined* is identical to B alone under all three A variants.

The data does point somewhere, weakly: the dominant noise class is a **prose idiom** —
"Pattern to mirror", "precedent", "template", "Do NOT add to", "unaffected", "already
clean". Silencing only when *every* overlapping part's mention carries such a cue removes
4 of 54 rows, and all four are true noise by manual reading. That is ~7% at near-zero
collateral — the opposite trade from B — but it is a direction, not a result: it would
need a properly labelled sample before anyone commits to it.

The remedy must be specificity; the check must never be downgraded from advisory
(ADR-306) and the widest overlaps must never be suppressed to improve the statistic —
that was tried once and reverted. Under the measurement, neither named candidate delivers
specificity. See DC-4.

#### 2c — Windows path separators

Two claims; they do not share a fate.

**Real.** `canonicalPath` (line 253) builds `${repoRoot}/` and does a textual
`startsWith`. Verified by direct probe:

| finding path | ranges | repoRoot | kept |
|---|---|---|---|
| `/repo/a.js` | `a.js:1-9` | `/repo` | yes |
| `C:\repo\a.js` | `a.js:1-9` | `C:\repo` | **no** |
| `C:\repo\a.js` | `a.js:1-9` | `C:\repo\` | **no** |
| `src\a.js` | `src/a.js:1-9` | *(none)* | **no** |

So `--repo-root` is inert on a Windows root, and a separator mismatch drops every
finding. Not silently, though: `filter-findings-main.js` names every drop on stderr,
capped and escaped, with the "check that the technique emits repo-relative paths" hint.

**False.** The colon-rejection half is closed by evidence — see the premise table above.

**Unverifiable end to end.** There is no Windows CI: all three jobs in
`.github/workflows/ci.yml` are `runs-on: ubuntu-latest`. A normalization *is* unit-provable
at the string level, because `canonicalPath` is pure over two strings — but the toolchain
around it is not: `scripts/*.sh` under bash with `shellcheck` and `bats`, `hooks/*.sh`,
`git rev-parse` path forms. Shipping a correct `canonicalPath` into a tree where nothing
else runs buys nothing and creates the appearance of support. See DC-5.

### Cluster 3 — hygiene and docs lint

#### 3a — prose-lint excuse coverage for `docs/contributing/plan/`

The pair, verified byte-for-byte. `scripts/ci.sh:134`, six-space indent, two spaces before
the comment, U+2014 em dash:

```
      docs/contributing/adr/*|docs/contributing/design/*|docs/contributing/archive/*|docs/contributing/specs/*|docs/contributing/prd/*) ;;  # provenance/design docs necessarily quote ban-list words — advisory noise
```

`test/hygiene-gates-ci.test.js:77`, four-space indent, inside the test *"then
run_prose_lint excludes provenance/design docs in a skip arm"*:

```
    /docs\/contributing\/adr\/\*\|docs\/contributing\/design\/\*\|docs\/contributing\/archive\/\*\|docs\/contributing\/specs\/\*\|docs\/contributing\/prd\/\*\)\s*;;/,
```

The regex is anchorless and order-locked: it pins the five globs in order with literal `|`
separators, so inserting `docs/contributing/plan/*` anywhere in the run breaks it. Both
files change in one part.

**Measured impact.** Running `engine/bin/prose-lint.js` over all 24 plan files: **7 files,
32 findings**, exit 2 under `--gate blocking`. Five of the seven emit all six ban-list
entries — they are the plan docs that enumerate the ban list while documenting the lint,
which is precisely the self-reference the excuse arm exists for. Re-running the
ci.sh-faithful way (every doc also passed as `--waiver-source`) gives the identical 32/7:
there are zero `SLOP-WAIVE(…)` markers anywhere in the live docs, so waivers absorb
nothing today.

**No sibling gap.** Full-repo scan, 673 markdown files, 61 findings:
`adr/` 10, `design/` 16, `archive/` 2, `prd/` 1, `specs/` 0 — all excused — plus
`plan/` 32, not excused. 29 + 32 = 61 closes exactly. `plan/` is the only un-excused path
in the repo producing `SLOP-FOUND`. `docs/guides/` and the loose
`docs/contributing/{README,DOD}.md` are also un-excused and currently clean; they are
audience-facing prose and should stay un-excused.

**Why it is not urgent and still worth closing.** `run_prose_lint` only sees the touched
set (`compute_touched`, lines 92–103), and the posture is `advisory`:
`node engine/bin/hygiene-gate.js .claude/workflow.md` prints `advisory` because
`.claude/workflow.md` contains no `hygiene` key at all, and `hygiene-lint-core.js:174`
returns `EXIT_OK` regardless. The 32/7 is standing latent debt that becomes a hard red on
whichever of those seven files a branch touches, the day the knob flips.

#### 3b-i — the `--audience` dedupe

`scripts/docs-structure-lint.sh:31-34`:

```
    case " ${top_level[*]:-} " in
      *" $entry "*) : ;;
      *) top_level+=("$entry") ;;
    esac
```

`IFS=` on line 28 is a command prefix scoped to `read`, so inside the loop body `IFS` is
the default and `${top_level[*]}` joins on a space. The membership test therefore matches
any contiguous space-delimited *token run*, not any element: an element containing a space
injects extra internal boundaries.

Demonstrated against the real script in a throwaway `git init` tree (not the worktree),
with top-level entries `README.md`, `a b`, `b`, `contributing`, `guides`:

```
entry=[README.md]     joined=[  ]                              -> kept
entry=[a b]           joined=[ README.md ]                     -> kept
entry=[b]             joined=[ README.md a b ]                 -> DROPPED (matched " b " at the a·b boundary)
entry=[contributing]  joined=[ README.md a b ]                 -> kept
entry=[guides]        joined=[ README.md a b contributing ]    -> kept
```

Script output: `unexpected top-level entry under docs:` / `  a b`, exit 2. `b` is a genuine
offender and is missing from the report.

**A false pass stays impossible**, on two legs, both verified. A dropped entry is never
appended, so it can never mask a later one; and any masking name containing a space fails
the spaceless allowlist at line 40 (`README.md|guides|contributing`), so it is itself an
offender and the script exits 2. The only remaining hole would be a multi-token offender
matching a haystack built purely from allowlisted names — all four candidates
(`README.md contributing`, `contributing guides`, `README.md contributing guides`,
`guides contributing`) were run through the real script and all four fail loudly, because
git's byte ordering (`' '` 0x20 < `'/'` 0x2F) places each before the entries that would
mask it. This is a report-completeness fix, not a correctness hole.

**The fix.** The file targets bash 3.2 (stated in the comment at line 26), which has no
associative arrays, so the portable form is an element-exact loop over `top_level`.

**The non-obvious cost.** The existing test file `test/docs-structure-lint.test.js`
(7 tests) drives committed fixture subtrees under `test/fixtures/docs-audience-*` through
the repo's own `git ls-files`. That style cannot express this bug: a fixture directory
named `a b` under `test/` is invisible to `--audience docs`, and one under `docs/` would
itself trip `scripts/ci.sh:85`. A regression test needs a throwaway `git init` tmpdir
helper, or the dedupe extracted to a testable seam. The plan must budget for that.

#### 3b-ii — the lychee-invisible metrics link

**The actual cause, isolated by bisect with the real tool** (`lychee 0.24.2`, installed
here). It is not a fenced-block rationale. `docs/contributing/plan/readme-drift-guards.md`
lines 96–113 quote the README's mermaid block verbatim, fences included:

```
97	```
98	```mermaid
…
112	```
113	```
```

CommonMark cannot express that nesting. A fence opened with N backticks is closed by the
first line whose backtick run is ≥ N and carries no info string. Line 97 opens; line 98
has the info string `mermaid` and cannot close, so it is content; **line 112's bare fence
closes the block line 97 opened**, one line earlier than intended; line 113 therefore
flips from closer to **opener**. Every later fence role inverts:

| span | role |
|---|---|
| 113 → 125 | code block, swallows prose 114–124 |
| 126–128 | the yaml body leaks out and renders as a paragraph |
| **129 → 361** | **code block spanning 130–360 — swallows line 134** |
| 368 → 428 | code |
| 433 → 457 | code |
| 471 → EOF | unclosed code block, 472–499 |

Line 134 is the file's only `](` and sits in a blockquote at column 0 with no fence marker
anywhere near it — the first tell that the recorded rationale was wrong.

**Evidence.** Probe links were inserted after 16 chosen lines and the file re-dumped with
`lychee --offline --include-fragments --no-progress --dump`; **16 of 16 matched the
prediction** (visible at 74, 90, 128, 365, 430, 460, 470; invisible at 117, 123, 137, 300,
360, 400, 455, 480, 495). A nine-line minimal reduction reproduces it, and widening only
the outer fence to four backticks makes the link visible — a single-variable bisect. On
the real file, changing **only lines 97 and 113** from three to four backticks (two
characters) makes lychee extract the link.

**The fix is two-part, and the second part is the point.** Rebalancing the fence alone
turns a silent bug into a red `links` job: line 134 quotes a pre-audience-split README and
targets `docs/metrics-baseline.report.json`, while the file lives at
`docs/contributing/metrics-baseline.report.json` and lychee resolves relative links
file-relative — so from `docs/contributing/plan/` the correct target is
`../metrics-baseline.report.json`. Confirmed: after the fence fix, lychee reports
`File not found` at `134:40`. Since line 134 is a *verbatim README quote*, the honest
resolution is to de-link it (backtick the path, as the design doc's copy already does)
rather than retarget a quotation to something the README does not say. Both land together.

**The prose correction goes in a different file than the entry implies.**
`docs/contributing/plan/docs-audience-split.md:356-360` asserts the link "sits inside a
fenced/code block quoting the README verbatim … so it is NOT a dangler and needs no
rewrite". That claim is wrong on the mechanism and wrong on the conclusion: the
invisibility is accidental and load-bearing on a bug, and the target is stale *and* wrong
for a file-relative resolver. The correction states the fence-inversion mechanism and
records it as debt, not as a deliberate exclusion.

**Which gate would have caught it.** Only the GitHub Actions `links` job
(`.github/workflows/ci.yml:54-65`, `--offline --include-fragments --no-progress
--exclude-path engine/node_modules './**/*.md'`, `fail: true`). `scripts/ci.sh` does not
run lychee at all, so no craft per-part or phase gate sees links. After this change the
`links` job stops passing vacuously over this file.

### Cluster 4 — adapter tooling

#### 4a — agent-mirror sync tooling

**Inventory, verified live.** Six adapters mirror; `pi` does not (no `agents/` dir).
Nine roles × six adapters = **54 mirrors, all byte-in-sync right now**.

| Adapter | Frontmatter keys | Per-role variation |
|---|---|---|
| aider | *(none — body only, no fence)* | n/a |
| antigravity | `name`, `description` | none (no model key by decision) |
| cursor | `name`, `description` | none |
| copilot | `name`, `description`, `model`, `effort` | `effort` varies (high/medium/low) |
| codex | `name`, `description`, `model`, `effort` | model **and** effort vary |
| opencode | `description`, `mode`, `model`, `hidden`, `permission` (no `name`) | `model` varies; `permission` is a nested 10-key map with three distinct shapes across the roles |

Frontmatter is keys-uniform per adapter, values-varying per role. That asymmetry decides
the tool's shape: a **preserve-frontmatter, replace-body-only** writer needs zero schema
knowledge; a regenerate-from-a-table writer would have to encode five dialects plus
opencode's per-role permission matrix. See DC-6.

**One correction to the extraction rule as recorded.** The guards do not string-split on
`---`; they do a **line-exact fence scan**:

```js
const lines = content.split('\n');
if (lines[0] !== '---') throw new Error('missing opening frontmatter fence');
const closeIndex = lines.indexOf('---', 1);
if (closeIndex === -1) throw new Error('missing closing frontmatter fence');
const body = lines.slice(closeIndex + 1).join('\n').replace(/^\n+/, '');
```

A line must be exactly `---`. `grep -c '^---$' agents/*.md` returns 2 for every shared
file, so a naive `split('---')` happens to agree today — the tool must implement the
line-exact form to match the guards, not the coincidence.

**The aider variant is the trap.** `adapters/aider/agents/craft-<role>.md` is the shared
body with **no frontmatter fence at all** and leading blank lines stripped. Its guard
(`adapters/aider/test/native-surface.test.js:65-81`) compares the mirror's *raw bytes* to
`bodyOf(sharedAgentPath(role))` and separately asserts `doesNotMatch(sut, /^---/)`.

**How the tool is proven not to corrupt.** Four independent legs, and the fourth is the
one that matters:

1. Two modes on one script: `--check` (default, read-only — prints one
   `sync-adapter-agents: <adapter>/<role>: drifted` line per mirror and exits non-zero)
   and `--write`. Check is the default so a mistyped invocation cannot write.
2. Idempotence: `--write` over a clean tree leaves `git status --porcelain adapters`
   empty. Asserted in the tool's own tests against a fixture tree, never by mutating the
   real worktree.
3. Fixture coverage of the aider variant specifically: after `--write`, the aider output
   must not start with `---` and must not start with a blank line.
4. **The six per-adapter byte-identity guards stay, with their own independent
   implementations.** They are the oracle. If the tool's extraction and the guard's
   extraction were refactored into a shared helper, a bug in that helper would pass both,
   which is exactly the silent corruption this tooling is supposed to prevent. The
   duplication between the six adapters' `bodyOf`/`parseFrontmatter` helpers is therefore
   deliberate and stays.

**The opencode gap is real, and closing it is IN scope for this run.**
`adapters/opencode/test/agents.test.js` is the only mirror guard with **no byte-identity
assertion**. Its sole directory constant is `AGENTS_DIR` (line 8), pointing at the mirror
itself; there is no `REPO_ROOT`, no `SHARED_AGENTS_DIR`, no `sharedAgentPath`. Its five
describe blocks cover existence, frontmatter contract, model-tier consistency, permission
capabilities, and body provenance hygiene — the last two only via `assert.doesNotMatch`
regex scans, never an equality against the shared source. The other five adapters all
assert byte-identity in their `native-surface.test.js`. So opencode is precisely the one
mirror a writer bug would corrupt undetected, and it must gain the assertion in the same
part as the tool — otherwise the run ships a writer whose weakest target has no oracle.

**Wiring.** `scripts/ci.sh` line 85 is the end of the lint chain; the check appends as a
continuation there. It needs no node dependency (pure fs) and `shellcheck scripts/*.sh` at
line 80 covers a new script with no registration.

**Anti-tax constraint.** `adapters/*/agents/*.md` are byte-identity mirrors, so any shared
agent-body edit syncs all six in the same part. No seam here plans to touch a shared body,
so the constraint is a guard rather than a task — but the tree must not be left half-synced
while the very tool that removes that tax is being built.

#### 4b — per-source zero-file note in the usage miner

`engine/src/observability/usage-mine-main.js`. Every recorded line number is exact:

- `NO_FILES_NOTE = 'no .jsonl transcript files found'` — line 121, with a three-line
  comment above it (118–120) recording the gap as deliberately out of scope at the time.
- `if (!jsonlFiles.length) { writeNoOp(NO_FILES_NOTE); return EXIT_OK; }` — line 312.
- `jsonlFiles = readdirSync(safeTranscriptDir).filter(resolveFileMatcher(source));` — 303.
- `resolveFileMatcher(source)` — 94, over `SOURCE_FILE_MATCHERS` (85–87), which holds
  exactly one entry: `aider: (f) => f === '.aider.chat.history.md'`. Default:
  `(f) => f.endsWith('.jsonl')`.
- `DEFAULT_READ_ROOTS` — 57, the parallel per-source seam to mirror.
- Vocabulary: `SOURCES` (44–51) — `claude` (default), `opencode`, `pi`, `copilot`,
  `codex`, `aider`.

`source` binds at line 281 and `writeNoOp` is declared at 293, so `source` is already in
scope at both the closure and the call site. No restructuring is needed.

**Mechanism — couple the label to the matcher, do not run a parallel table.** The defect
class here is a matcher and a message that disagree; a second independent map can drift
the same way. Widen each `SOURCE_FILE_MATCHERS` entry from a bare predicate to
`{ match, label }`, keep `resolveFileMatcher(source)` returning `entry.match` (so its
external contract and its four existing seam tests are untouched), and add a sibling
`resolveFileLabel(source)` returning `entry.label`, with the same `Object.hasOwn`
own-property discipline and the same rationale comment. `NO_FILES_NOTE` becomes
`noFilesNote(source)` → `` `no ${resolveFileLabel(source)} transcript files found` ``.
The plan must first confirm that none of the four existing `resolveFileMatcher` tests
asserts function *identity* against `DEFAULT_FILE_MATCHER`; if one does, it moves to a
behavioural assertion in the same part.

**The pin that must keep passing**, `engine/test/usage-mine-main.test.js:491-503`, invokes
`main(['--dir', emptyDir], io)` with no `--source`, so it falls to `DEFAULT_SOURCE` and
asserts the exact string `no .jsonl transcript files found`. It is claude/default-scoped;
no test asserts the note under any non-default source. The change is therefore purely
additive: claude keeps its exact wording, `--source aider` gains
`no .aider.chat.history.md transcript files found`, and the four other sources keep
`.jsonl` because that is genuinely what their matcher looks for.

The stale comment at lines 118–120 is removed with the literal it explains.

#### 4c — `--file` editable targets in launch-args

`adapters/aider/src/launch-args.js`, current signature:

```js
export function buildLaunchArgs({ model, readFiles = [], message })
```

emitting `--yes-always --no-gitignore --no-check-update --no-show-release-notes
--no-analytics --model <model> [--read <f>]* --message <message>`. `buildReadPairs`
(42–47) flat-maps each entry to a discrete `[FLAG_READ, file]` pair after
`assertNonEmptyString(file, 'each readFiles entry')` (21–25).

**Change.** Add an optional `editFiles = []` parameter emitting one `--file <path>` pair
per entry, via a `buildFlagPairs(flag, files, label)` generalisation of `buildReadPairs`
(the existing function is already the right shape; only the flag constant and the error
label vary). `--read` keeps its meaning: role body and read-only context. `--file` names
the editable targets of an edit-phase.

**Ordering.** `--file` pairs sit after the `--read` pairs and before `--message`, so
`--message` stays last — the property two existing tests assert positionally.

**Wiring cost is one production call site.** `adapters/aider/src/probe.js:38` passes
`readFiles: []` and simply does not pass the new key. Omitting `editFiles` must produce
byte-identical argv to today, because the two load-bearing pins
(`adapters/aider/test/launch-args.test.js:13-25` and `:50-64`) are full-array
`assert.deepEqual` literals that break the instant anything new is emitted.

**Honest record.** `docs/contributing/specs/aider-poc-record.md` (184 lines; the last line
is the full-pipeline row in the `## Phase B — live-evidence rows` table) already carries
the finding inline: an incremental edit to an existing file no-op'd on a 7B local model
*even with `--file` added*. The amendment extends that row to state the conclusion
plainly — `--file` is **necessary and not sufficient**; a capable model is also required —
so nobody later reads the new surface as a fix for the edit-reliability problem. That file
is in the intention-lint living corpus (`scripts/living-corpus.sh`) and exempt from
prose-lint (`scripts/ci.sh:134`).

### Part-partition seams (input to the planning phase)

| Seam | Surfaces | Coupling / order |
|---|---|---|
| A — normalizer performance + cap | `engine/src/findings.js` (`PIPE_DELIMITER`, `parseLine`, `parseLineShape`); `engine/test/findings.test.js` | first of the `findings.js` seams; needs its own ADR under DC-1 (a)/(c) |
| B — scope-spec delimiter | `engine/src/findings.js` (`parseScopeSpec`); `skills/validation/SKILL.md`; `engine/test/findings.test.js`, `engine/test/filter-findings-main.test.js` | conditional on DC-3; same file as A and C — sequential, not parallel |
| C — mutation-baseline triage | `engine/src/findings.js` (whole file); `engine/test/findings.test.js` | **must land last** among A/B/C: it triages the final shape of the file, and its hunk ranges are only valid post-edit |
| D — locality advisory | `engine/src/plan-lint-main.js` | expected no-op under DC-4 (a); conditional |
| E — Windows normalization | none (docs/ADR only) | expected no-op under DC-5 (a); conditional |
| F — prose-lint plan excuse | `scripts/ci.sh:134`; `test/hygiene-gates-ci.test.js:77` | the byte-pinned pair moves together; shares `scripts/ci.sh` with I |
| G — `--audience` dedupe | `scripts/docs-structure-lint.sh:31-34`; `test/docs-structure-lint.test.js` (+ a throwaway-repo helper) | independent |
| H — fence rebalance + prose correction | `docs/contributing/plan/readme-drift-guards.md` (97, 113, 134); `docs/contributing/plan/docs-audience-split.md:356-360` | land after F, so the plan-doc edits stop emitting advisory noise |
| I — adapter mirror sync tool | `scripts/sync-adapter-agents.sh` (new); `scripts/ci.sh` (chain, ~line 85); `adapters/opencode/test/agents.test.js` (byte-identity); `test/` (tool tests) | shares `scripts/ci.sh` with F — a deliberate, declared overlap in different functions |
| J — usage-miner per-source note | `engine/src/observability/usage-mine-main.js` (57, 85–98, 118–121, 312); `engine/test/usage-mine-main.test.js` | independent |
| K — `--file` editable targets | `adapters/aider/src/launch-args.js`; `adapters/aider/test/launch-args.test.js`; `docs/contributing/specs/aider-poc-record.md` | independent |
| L — README receipts counts | `README.md:119-120` | **must land last** — the ADR count is not known until the decisions phase has ratified |

F and I both edit `scripts/ci.sh` and will produce a cognitive-locality warning. It is
correct and unavoidable — F edits the `run_prose_lint` case arm, I appends to the lint
chain — and the plan should state why they are separate rather than merge two unrelated
failure modes behind one commit.

**Seam L is not optional and the local gate will not find it.** `README.md:119-120` carries
a receipts sentence with four counted markdown links — design docs, parted plans, ADRs, and
telemetered runs — currently claiming 25, 24, 320 and 27. The fourth sub-guard added by the
readme-drift run recounts the tree behind any counted *directory* link, so this document
alone already turns the guard red — verified: `bash scripts/readme-drift.sh` prints
`readme-drift: corpus-counts: docs/contributing/design/ claims 25, tree holds 26` and
exits 1. This run moves three of the four: design docs 25 → 26, parted plans 24 → 25, and
ADRs 320 → 320 + however many the decisions phase ratifies. The telemetry count is derived
from the committed report, not the tree, and is untouched.

`readme-drift` is a **separate GitHub Actions job**, not part of `scripts/ci.sh`
(grep-confirmed: zero hits in `scripts/`). So every per-part and phase gate stays green
while the guard is red, and the failure only appears after push. The plan must run
`bash scripts/readme-drift.sh` explicitly in the final part's gate rather than relying on
`scripts/ci.sh`. The same is true of the `links` job that seam H makes newly meaningful:
neither lychee nor readme-drift runs locally.

## Decision candidates

Six. Four are the ones the brief names; two more are load-bearing enough that deciding
them in the design would be deciding them for the user.

| # | Choice | Alternatives (≤3) | Recommendation | Why |
|---|---|---|---|---|
| DC-1 | How the `parseLine` quadratic is removed, and what the module does with an oversized line | (a) linear lookaround delimiter `/(?<=\s)\|(?=\s)/u` **and** a 16,384-character per-line cap raised in `parseLineShape` with a dedicated cap-named error naming the cap and the measured length; (b) linear delimiter only — no cap, no behaviour change, no ADR; (c) cap only, keeping the backtracking delimiter, with the oversized line returning `null` into the existing generic "does not match the per-line format" throw | **(a)** | The delimiter rewrite is behaviour-identical — 2,000,000-case differential at the `parseLine` outcome level, zero mismatches — and removes the pathology at the root: 38,959 ms → 0.62 ms at 200,000 characters. The cap is worth its ADR on its own grounds: it bounds the worst reachable input to 243.6 ms even if the delimiter ever regresses, and it bounds what a broken technique can push through a boundary that exists to bound things. 16,384 is over 200× the longest per-line record in the committed corpus (78 characters) and, critically, sits *above* the quadratic's knee, so the ReDoS guards can be raised past 10,000 and still exercise the split rather than the cap. (c) is the option the entry originally described, and it is the weakest: it leaves the quadratic in place and reports a 200,000-character well-formed line as a *format* error, sending the operator to hunt a syntax bug that is not there. (b) is honest and cheap and would be the right answer if the only goal were performance — it forgoes the input bound and the accurate diagnostic. |
| DC-2 | What to do with the three mutually-redundant empty/shape guards carrying 9 of the 33 unkilled mutants | (a) delete all three — `parseJsonShape`'s `!Array.isArray` (104–106), `parseLineShape`'s `nonBlank.length === 0` (151–153) and `normalizeFindings`'s `trimmed === ''` (187–189) — removing all 9; (b) keep all three and document 9 equivalent mutants in place; (c) delete only the two *unreachable* private guards (6 mutants removed) and keep `normalizeFindings`'s guard as the executable form of its documented public contract, documenting its 3 as equivalent | **(c)** | The distinction is reachability, and it is verified rather than argued. `parseJsonShape` is private and only called after `looksLikeJsonArray`, and `JSON.parse` of a `[`-leading string either throws or yields an array — probed with `'['`, `'[]x'`, `'[[]]'`, `'[1,2]'`, `'[null]'`; `parseLineShape` is private and only called with a non-empty trimmed string, so it always sees at least one non-blank line. Neither branch can execute: that is the no-dead-code guardrail, and the mutation report is what surfaced it. `normalizeFindings`'s guard is different in kind — it *does* execute, it is the module's public entry, and its JSDoc already states "Zero findings → []"; the guard is that sentence in executable form. Reachable-but-redundant is exactly what the equivalent-mutant comment convention exists for, and three comments at a public contract boundary are cheaper to read than an implicit path through two helpers. (a) is defensible and leaves `normalizeFindings` a clean two-line dispatch, at the cost of making the empty-input contract inferable rather than stated. (b) spends six comments defending code no caller can reach. |
| DC-3 | The scope-spec delimiter (refines ADR-305) | (a) newline-only — `parseScopeSpec` splits on `\n`; comma stops being a delimiter; (b) newline **or** comma — split on `/[\n,]/`, both accepted; (c) status quo, with the comma-bearing-path limitation documented in the ADR trail | **(a)** | ADR-305's substantive ground was *one* argument so the repeated-flag hazard cannot recur; that survives a newline join untouched, and only the cosmetic symmetry with Stryker's comma form is lost. The spec is already written to a `mktemp` file and read into a variable before being passed, so a newline delimiter costs nothing at the call site and removes the ambiguity at the root — paths cannot contain newlines. (b) looks like the compromise and is not: keeping comma as a delimiter keeps the comma hazard for every spec, so it buys an option without fixing anything. (c) is the honest YAGNI answer and is genuinely defensible — no tracked path in this repo contains a comma, and the current failure is loud rather than a mis-scope — so a ruling for (c) costs only an ADR line. The cost of (a) to weigh: hand-authored `"a.js:1-9, b.js:1-9"`, which the code comment at lines 237–239 explicitly protects, becomes one malformed entry. |
| DC-4 | The locality advisory's specificity | (a) leave the detector unchanged; record the re-measured baseline and the negative result for both named candidates in the ADR trail; (b) ship candidate B (edit-versus-reference weighting); (c) ship the cue-based filter, after building a labelled sample to calibrate it | **(a)** | Measured over the whole corpus, not estimated. Candidate A removes **0** warnings under both defensible readings, and its single removal under the literal reading is wrong (a five-space-indented table row nested under a list item, read as a code block). Its premise is already satisfied by accident, because the detector matches backticks over the joined block and a fence re-pairs everything after it. Candidate B is not a specificity change but a near-disable: 54 → 8, only 6 of 41 two-part overlaps survive, `### Commit` carries zero resolvable paths in **163 of 163** parts so half its stated input channel does not exist, 54% of its removals rest on absent rather than contrary evidence, and it destroys at least one confirmed genuine edit-edit overlap purely because the two parts spelled the same path differently. (c) is the one direction the data supports — 4 of 54 removed, all four true noise by manual reading — but a 7% filter validated on an unlabelled sample is a hypothesis, not a result, and the honest place to record it is the backlog. Under all three the check stays advisory (ADR-306) and no wide overlap is suppressed. |
| DC-5 | Windows path separators | (a) document and do not implement: record that the colon-rejection half is false, that `canonicalPath` is genuinely inert on a Windows root, and close the entry by evidence; (b) implement separator normalization in `canonicalPath`, proven by string-level unit tests on POSIX; (c) add a `windows-latest` CI job and implement against it | **(a)** | Half the entry is already closed: `C:\repo\a.js:*` and `C:\repo\a.js:1-9` both parse correctly today, because `SCOPE_ENTRY_PATTERN` and `WHOLE_FILE_ENTRY_PATTERN` use a greedy head deliberately. What remains is real but unreachable: `canonicalPath` is inert on a Windows root, on a platform where none of `scripts/*.sh`, `hooks/*.sh`, `bats` or `shellcheck` runs. (b) is *more* verifiable than the entry assumed — `canonicalPath` is pure over two strings, so a POSIX test pins the normalization exactly — but that is the trap, not the escape: it would ship a correct function into a toolchain that cannot run, and a half-Windows-capable filter reads as a claim of Windows support. (c) is the only honest way to implement and is far outside this run's scope. A ruling for (b) is defensible if the intent is to pre-position for a future Windows port; it should then say so explicitly rather than present as a fix. |
| DC-6 | The shape of the adapter mirror sync tool | (a) `scripts/sync-adapter-agents.sh` with `--check` as the default read-only mode and an explicit `--write`, replacing **body only** and preserving each mirror's existing frontmatter byte-for-byte; (b) check-only — no writer; CI names every drifted mirror at once, humans still edit 54 files; (c) writer that **regenerates** frontmatter from a declared per-adapter table, so a new role needs one table entry rather than six hand-written files | **(a)** | The frontmatter survey decides it: keys are uniform per adapter but values vary per role — codex varies model *and* effort, copilot varies effort, opencode carries a nested 10-key `permission` map with three distinct shapes across the nine roles. (c) must encode five dialects plus that matrix, and a bug there corrupts a mirror in the exact way the tool exists to prevent; the cost it saves (adding a tenth role) is paid roughly never. (a) needs zero schema knowledge — split at the line-exact `---` fences, take the body, `replace(/^\n+/, '')`, and for aider write the body alone with no fence. (b) removes the discovery tax but not the edit tax, which is the larger half. Under all three, the six per-adapter byte-identity guards stay with their own independent implementations: the tool must never be the only thing checking itself, and opencode's missing assertion is added in the same part. |

DC-1 and DC-3 each want their own ADR — the first because a cap rejects input that is
accepted today, the second because it refines the ratified ADR-305 form. DC-2, DC-4, DC-5
and DC-6 want ADRs as records of the reasoning even where the ruling is "no code change",
because in three of those four cases the valuable output *is* the measurement.

## Test strategy

### Cluster 1

**Delimiter equivalence (A).** The 2,000,000-case differential fuzz is a design probe, not
a committed test — it compares against an implementation that will no longer exist. What
lands instead is a directed table of the 14 shapes the probe covered, asserted through
`normalizeFindings`: no fix; one fix; multiple spaces around the pipe; a tab-delimited
pipe; a status prefix plus a fix; two delimiters (must throw); a pipe inside the finding
(must throw); a pipe inside the **fix** (must throw — uncovered today); `|` with no
leading space; `|` with no trailing space; adjacent delimited pipes `a | | b` (must
throw); trailing whitespace in the fix; an en-dash separator; multiple spaces around the
separator.

**Cap behaviour (A).** Three tests, and the first is a correction to existing ones. The
two ReDoS guards (`engine/test/findings.test.js:353` and `:400`) currently assert only
`/Cannot parse findings/`, which the cap error *also* matches — so they would keep passing
while silently changing what they prove. Both must be raised so the **whole line** is
exactly `MAX_LINE_CHARS` (the whitespace run is therefore the cap minus the prefix, not
the cap itself — the test must compute it, never hardcode 16,384 spaces) and must assert
the **format** message specifically. That is the largest input that still reaches the
split, and it is above the quadratic's knee. Then: a line one character over the cap
asserts the **cap** message, including the literal cap value and the actual length; and a
*well-formed* line of exactly `MAX_LINE_CHARS` parses successfully, pinning that the cap
is inclusive at the boundary.

No wall-clock assertion is made anywhere. Timing assertions are flaky under load and the
guarantee here is structural: the delimiter has no backtracking shape, and the cap bounds
the largest reachable input to a measured 243.6 ms even under the old delimiter.

**Mutation triage (C).** Run `npm --prefix engine run mutation -- --mutate
"engine/src/findings.js"` full-file after A and B have landed, under the stub PATH, in a
`mktemp` copy of the worktree. Record the before/after instrumented total; any shrink must
map line-for-line to deliberately deleted code. For per-hunk re-runs: one comma-separated
`--mutate`, ranges re-derived from the post-edit file after every comment insertion. The
triage outcome per site is tabulated in the Design section above; the plan carries it as
the work list. Documented survivors use the in-place form already present at
`engine/src/findings.js:271` and throughout `engine/src/plan-lint-main.js`.

**The triage covers the post-change mutant set, not the pre-change one.** The 33 tabulated
above are today's. Seam A removes one construct and adds several — the lookaround
delimiter, `MAX_LINE_CHARS`, the `>` comparison, the cap message, the `.map(p => p.trim())`
— and seam B, if DC-3 rules for a change, adds another. Every mutant Stryker instruments on
those new lines is subject to the same rule: killed by a real test, or documented in place.
Baselining against the 33 and stopping there would leave the change's own code unmeasured.

New tests the triage requires, beyond the delimiter and cap tables:
`[null]` and `[1]` (exact `is not an object` message); a JSON fixture with a padded
`finding` (pins `toFinding`'s trim); invalid JSON asserting the **`invalid JSON`** message
specifically and asserting `err.cause`; three parts (`a | b | c`); a pipe in the fix; an
interior empty line and an interior whitespace-only line; a short unparseable line echoed
in full with no ellipsis; an exactly-120-character unparseable line echoed in full; a JSON
array with leading whitespace; a leading-token-noise line (`'a b HIGH x.js:1 — f'`) that
must throw.

### Cluster 2

**Scope-spec (B).** Under DC-3 (a): a newline-joined two-entry spec parses; a path
containing a comma parses as one entry; a comma-joined spec now throws
`malformed scope entry` (the deliberate loss, pinned so it is never a surprise); an empty
spec still returns `[]`; the whole-file `:*` form still requires the marker. Plus a
`filter-findings-main` test proving the newline spec survives the argv round trip.

**Locality (D).** Under DC-4 (a) there is no code change and therefore no new test. The
measurement is the artifact and lives in this document and the ADR.

**Windows (E).** Under DC-5 (a), no test. Under (b), string-level unit tests on
`canonicalPath` with Windows-shaped literals — and an explicit note in the test file that
they prove the function, not the platform.

### Cluster 3

**Prose-lint excuse (F).** The existing test at `test/hygiene-gates-ci.test.js:69-80`
extends its order-locked regex to six globs. A second assertion checks the arm is still
*empty* (a skip arm), so a future edit cannot turn it into an inclusion arm. Verify by
running `engine/bin/prose-lint.js` over the seven offending plan files through the ci.sh
path and confirming zero `SLOP-FOUND` lines.

**Dedupe (G).** The bug is not expressible in the committed-fixture style: a fixture
directory named `a b` under `test/` is invisible to `--audience docs`, and one under
`docs/` trips `scripts/ci.sh:85`. The test needs a throwaway `git init` tmpdir helper
(build the tree, `git add`, run the real script, assert both offenders are named). Add the
symmetric case too — entries `x`, `y`, then `x y` — since that direction fails for the
same reason. Keep the existing seven tests unchanged.

**Fence and link (H).** Assert with the real tool where it is available, and structurally
where it is not: a test that the file's fence markers balance under a CommonMark reading,
plus the `links` CI job as the end-to-end oracle. The corrected prose is checked by
reading, not by a lint — no gate exists for "this sentence states the right mechanism".

### Cluster 4

**Sync tool (I).** Tests run against a fixture tree in a `mktemp` directory, never the
worktree: `--check` on a clean tree exits 0 and prints nothing; `--check` on a tampered
mirror exits non-zero and names exactly that mirror; `--write` restores byte-identity;
`--write` is idempotent (a second run changes nothing); the aider output carries no
leading `---` and no leading blank line; a role present in `agents/` but absent from a
mirror is reported rather than silently created or silently ignored; `pi`, which has no
`agents/` directory, is not treated as a drifted adapter. Plus the new byte-identity
assertion in `adapters/opencode/test/agents.test.js`, matching the shape the other five
adapters use, with those five left byte-unchanged — so all six guards exist and none of
them shares an implementation with the tool. The tool spawns no agent binary.

**Usage miner (J).** The existing exact-string pin at
`engine/test/usage-mine-main.test.js:491-503` stays byte-unchanged and must still pass. New:
`--source aider` over an empty directory yields
`no .aider.chat.history.md transcript files found`; `--source codex` still yields the
`.jsonl` wording; `resolveFileLabel` seam tests mirroring the four existing
`resolveFileMatcher` cases, including the inherited-member (`constructor`) fallback.

**Launch args (K).** The two full-array `deepEqual` pins
(`adapters/aider/test/launch-args.test.js:13-25`, `:50-64`) stay byte-unchanged — omitting
`editFiles` must emit exactly today's argv. New: a third full-array `deepEqual` showing
`--file` pairs after `--read` and before `--message`; two `--file` entries emit two
discrete pairs; an empty `editFiles` emits no `--file` token; an empty-string entry throws
`/non-empty string/`; a non-string entry throws the same. Test style follows the file:
`node:test` + `node:assert/strict`, `const sut = buildLaunchArgs({…})`.

### Harness discipline

Every gate run, and every mutation run, uses a prepended PATH of fast-failing stubs for
`aider`, `codex`, `copilot`, `cursor-agent`, `opencode` and `pi`. Without them
`scripts/ci.sh` spawns the real binaries — all six are installed here — and hangs for tens
of minutes. No test added by this change spawns a real agent CLI. Mutation runs happen in
a `mktemp` copy of the worktree, never in the worktree itself.

## Out of scope

- **The scripted, CI-regenerable README demo** (`BACKLOG.md:258`). Needs a new tool
  dependency, a committed binary artifact and a live run to record against — none of which
  this change establishes.
- **The public front-door completion set** (`BACKLOG.md:265`). Four distinct sub-items
  (comparison table, devcontainer badge, community scaffolding, release discipline); each
  is its own run.
- **README corpus-count freshness.** Delivered 2026-07-31 (commits `2ee76be`, `b2f42ea`).
  Not re-delivered here.
- **Stronger destructive-git denial for the Copilot binding** (`BACKLOG.md:353`). Open,
  but not among this run's eleven.
- **A Windows CI matrix.** Named as DC-5 option (c) and rejected as far larger than this
  change; a POSIX-only toolchain needs bats, shellcheck and the hook scripts ported before
  a `windows-latest` job means anything.
- **Refactoring the six adapters' duplicated `bodyOf`/`parseFrontmatter` helpers into a
  shared module.** Deliberately not done: that duplication is what makes the guards an
  independent oracle for the sync tool. Consolidating it would let one extraction bug pass
  both the writer and its checker.
- **A cue-based locality filter.** Named as DC-4 option (c) with its measurement (4 of 54
  removed, all true noise); it needs a labelled sample before it is a result, so it belongs
  in the backlog rather than in this change.
- **`normalize-findings` total-input bounds.** The cap in DC-1 bounds a single *line*. A
  payload of many lines is unbounded, as it is today; the file-size question belongs to the
  callers that read the file.
- **The stale backlog reference to `docs/adapters/aider-poc-record.md`**
  (`BACKLOG.md:293`). Recorded here as drift; correcting `BACKLOG.md` prose is the
  documentation phase's work, not a design change.
