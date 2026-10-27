# Plan — run-visibility-task-list

> Source: design doc `docs/contributing/design/run-visibility-task-list.md` · ADRs 710, 711, 712, 713, 714, 715, 716, 717
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

## Overview

Five sequential parts in one working tree, each building on the previous one:

| # | Part | Lands | Gate |
|---|---|---|---|
| 1 | Projection spine | run-state seams exported; projectProgress items, statuses, ledger-only fallback, background; purity guard | engine node tests + architecture-boundaries |
| 2 | Notes, children, EFFECTIVE seeding | notes (precedence, strip, cut), PART and cycle children, the seeded EFFECTIVE line + spec row | engine node tests + root prose pins |
| 3 | Mod: bind and refresh | hooks/progress module: locate binding, listing gate, status line, fail-open | claude plugin validate/test |
| 4 | Mod: attention and wiring | working / waiting on you / waiting on background; hooks.json modules entry | claude plugin validate/test + hooks.test.js |
| 5 | Mod: pane, lifecycle, docs | pane render, /craft-progress, compact/end, closed and symlink refusal; customizing + maintainer smoke | claude plugin validate/test + docs pins |

Phase gate (after Part 5): `nice -n 19 bash scripts/ci.sh` (about 10 s).

## Decision candidates (planner-level)

Choices the design left open. The parts below follow the recommendation; a reviewer who
prefers an alternative changes only the named part.

| # | Choice | Alternatives | Recommendation | Why |
|---|---|---|---|---|
| D1 | Where the mod docs land | (a) fold into Part 5 with a CI pin test · (b) a sixth docs-only part | **(a)** | The customizing section and the maintainer smoke describe exactly what Part 5 finishes (pane, command, lifecycle). A separate part would spend a whole agent lifecycle on two prose sections |
| D2 | Where the EFFECTIVE seeding lands | (a) Part 2 · (b) Part 1 | **(a)** | Part 1 already holds 6 files (the ceiling). Seeding in Part 2 is still before any consumer ships (the mod starts in Part 3), and the ledger-only fallback makes the order harmless |
| D3 | Where the purity guard lives | (a) a new rule in test/architecture-boundaries.test.js · (b) a case in engine/test/run-progress.test.js | **(a)** | That file is the repo's `boundaries` validation technique (the manifest's architecture harness), it already owns the specifier scanner and the two-sided offender idiom; (b) would duplicate the scanner |
| D4 | Extra field on the view | (a) add `next` (deriveRunState's `next`) · (b) the mod recomputes it from items | **(a)** | The status line and the attention label both need "in-flight or next"; keeping it in the pure, CI-tested core keeps the mod free of pipeline logic |
| D5 | Note of a passing part child | (a) the recorded sha · (b) empty | **(a)** | The sha is the one useful fact a landed part carries; it is hex, so it needs no strip |

## Shared knowledge (read once, every part)

- **Git.** Use `/usr/bin/git` for every git command (bare `git` is rewritten to `rtk git`
  and refused in this worktree). `--no-ext-diff` on `git diff` / `git show`. Stage only
  the paths the part names, never `commit -am`.
- **Throttle.** Prefix heavy commands with `nice -n 19`. Pipe long test output to a file in
  the scratchpad and read back only failing lines.
- **Hygiene traps (CI-gated by test/source-hygiene.test.js, scanned on tracked files).**
  - `engine/src/**` and everything under `hooks/` are *shipped code*: scanned whole-line
    **case-insensitively** for `ADR-?\d+`, `P\d+`, `Part\s+\d+`, `backlog\s*#\d+`, `DC-\d+`,
    and case-sensitively for `[RTF]\d+` (so no `R7`, `T1`, `F2`, and no lower-case
    `part 1` either, anywhere in `hooks/progress/*`, tests included — build such labels from
    a variable, e.g. a template over `n`, so no digit sits beside the word).
  - Test trees (`engine/test`, `test`) are scanned in comments and test titles only, with
    the same case-insensitive tokens: a title saying `part 2` or `p1` fails CI; test
    bodies (data, assertions) are not scanned.
  - Class A bans `stryker|mutation|mutant|...` and class B bans `gh` / `github` in
    `engine/src`, `skills`, `docs/contributing/specs`, `docs/guides/customizing.md`.
  - New files are invisible to that `git grep` until committed, so each part's gate runs
    an explicit `grep` over its new files instead.
- **No provenance** (phase, ADR, requirement or part numbers) in source, tests, comments or
  titles. No suppression directives, no swallowed errors.
- **Test style.** `node:test`, Given/When/Then titles, Arrange-Act-Assert bodies, a `sut`
  variable. Engine tests are ESM (`engine/package.json` has `"type": "module"`); root
  `test/*.test.js` are CommonJS (`'use strict'; const { test } = require('node:test')`).
  Raw control characters (NEL, U+2028, ESC, bidi) never go into a test *title*: build them
  in the body with `\u` escapes (a raw one breaks the mutation runner's tap dry run).
- **Hang safety.** No planned test spawns a process: engine tests are pure, mod tests stub
  `process.run`. If a part does add a spawning test, spawn it `detached` and on timeout
  `process.kill(-child.pid, 'SIGKILL')`, resolving on `close`. In the module, every
  `$.process.run` passes `timeoutMs`.
- **Mod authoring API.** Load the bundled `plugin-authoring` skill (Skill tool) before
  writing any `hooks/progress` code: its `reference.md` and `types/claude-code.d.ts` hold the
  exact signatures. Facts the design pinned (CLI 2.1.311): `$.plugin.root`;
  `$.fs.read(path)` (rejects over 4 MiB); `$.fs.list(dir)` returns entries
  `{ name, kind, size, mtimeMs, isLink }` (`$.fs.stat` exists too, unused);
  `$.process.run(argv, { cwd, timeoutMs })`; `$.ui.status(text)` (one line under the
  prompt); `$.ui.open({ id, title })` plus `on('ui.render', { component: 'Pane', requestId })`;
  `$.ui.log`; `atom` / `read` / `update`; `$.command.register`; events `session.start`,
  `session.compact`, `session.end`, `turn.start`, `turn.complete` (`agentId` absent on the
  main loop), `tool.call`, and the `classic.<Event>` envelope (`transcript_path`, `cwd`,
  and on `classic.PostToolUse` also `tool_name`, `tool_input`, `tool_response`,
  `agent_id` when a sub-agent made the call). Mod tests are `*.test.tsx` files importing
  their kit from the module specifier claude-code/testing, and stub host services with
  `on('process.run'…)`, `on('fs.list'…)`, `on('fs.read'…)`, `on('ui.status'…)`.
- **Mod constraints proven by the designer's probes.** The module may import the pure
  engine through a relative path inside the plugin (`../../engine/src/run-progress.js`
  from hooks/progress); a path outside the plugin folder is refused. `hooks/hooks.json`
  may carry `"modules"` beside `"hooks"`; a module path is relative to the hooks/
  folder. `claude plugin test .` from the repo root runs only the mod's `*.test.tsx`
  (node_modules are skipped; the repo has no other `.test.ts(x)`). No type-check command
  exists beyond `claude plugin validate .`; do not invent a `tsc` step.
- **Run-ledger facts the mod relies on** (scripts/run-ledger.sh, read-only):
  `run-ledger.sh dir` prints the runs dir (`<git-common-dir>/craft-runs`) and exits
  non-zero outside a git work tree; files there are `<run-id>.md` (ledger),
  `<run-id>.pointer`, `<run-id>.impacts.md`, `<run-id>.impacts.ids/`.
  `run-ledger.sh locate --transcript <path>` prints `<run-id> <ledger-path>` for the newest
  trusted pointer whose run-key the transcript holds, and prints nothing otherwise.
  `close` removes the ledger.

## Part 1 — Projection spine

### Context

Files this part creates or edits:

- `engine/src/run-state.js` — export seams, no behaviour change. Today (all module-private):
  `const PHASE_ID = '[a-z][a-z0-9-]*'` (L10), `const PHASE_START_RE` (L24),
  `const PHASE_DONE_RE` (L25), `const NO_OP_RELEASE_RE` (L30),
  `function recordsForRun(lines, runId)` (L48, returns `{ runId, phase, record }[]` of
  that run only), `function lastAwaiting(records)` (L59, returns the last
  `AWAITING(propose):` id list, `[]` for `none`, `null` when absent). Add `export` to these
  six declarations only. The public `deriveRunState(lines, runId, resolution)` (L329)
  returns `{ kind: 'state', state: { run, completed: string[], inFlight: {phase, since}[],
  next: string|null, awaitingHarnesses, parts: {n, sha, size, outcome}[] (last per n,
  ascending), findings: {dimension, cycle, path, count}[], background: {phase, technique,
  pid, out, spec}[], warnings: string[] } }`, or `{ kind: 'awaiting-mismatch', … }` when the
  resolution's propose `awaitingHarnesses` set differs from the ledger's. It warns
  `phase X is not in the effective pipeline` for a PHASE-START/DONE/auto-skip of an id
  outside `resolution.effective`, and `no AWAITING(propose) line for run X` when absent.
  Regexes have no `g` flag, so sharing them is stateless. The file's existing "equivalent
  mutant" comments stay untouched.
- `engine/src/run-progress.js` — new, pure. Imports only the sibling run-state.js (seams +
  `deriveRunState`) and observability/skip-signals.js (`autoSkipPhasesInText(text)`
  returns every phase id named by an `auto-skip:` marker in the text). No `node:` import,
  no `process`, no clock. Export `projectProgress(lines, runId)` with a JSDoc
  `ProgressView` typedef:

  ```js
  {
    run: string,                                  // runId
    source: 'effective' | 'ledger-only',
    items: { id, status: 'pending'|'in_progress'|'completed', note: string,
             children: { label, status, note }[] }[],   // notes/children stay ''/[] in this part
    inFlight: string[],                           // state.inFlight phases, pipeline order
    next: string | null,                          // state.next
    background: { phase: string, pid: number }[], // state.background of in-flight phases only
    warnings: string[],                           // EFFECTIVE warning first, then state.warnings
  }
  ```

  Algorithm: `records = recordsForRun(lines, runId)`. Effective ids: take the **last**
  record starting with the literal `EFFECTIVE:`; if it matches
  the regex built from the exported `PHASE_ID` as
  `^EFFECTIVE: (<PHASE_ID>(?:,<PHASE_ID>)*)$` (constant `EFFECTIVE_RE`), split group 1 on `,`,
  `source: 'effective'`; if it starts with the prefix but fails the regex, push
  `malformed EFFECTIVE record: <record>` and fall back; with no such record, fall back.
  Fallback (`source: 'ledger-only'`): ids named by `PHASE_START_RE`, `PHASE_DONE_RE` and
  `autoSkipPhasesInText(record)`, deduped in first-appearance order. Spine:
  `deriveRunState(lines, runId, { effective: ids.map((id) => ({ id })), gateDecisions:
  [{ phaseId: 'propose', awaitingHarnesses: lastAwaiting(records) ?? [] }] })` — feeding the
  ledger's own AWAITING list makes the mismatch branch unreachable, so read `.state`
  directly (no dead mismatch branch). Status: in `inFlight` → `in_progress`, in
  `completed` → `completed`, else `pending`. Name every constant (`EFFECTIVE_PREFIX`,
  status strings); functions ≤ 20 lines.
- `engine/test/run-progress.test.js` — new, ESM. Helpers: `readFixture(name)` (same shape
  as engine/test/run-state.test.js L35: `readFileSync(join(HERE, 'fixtures', 'run-ledger',
  name), 'utf8').split('\n')`), `RUN_ID = 'demo'`.
- `engine/test/fixtures/run-ledger/with-effective.md` — new fixture, exactly:

  ```
  # craft run record (append-only)
  other resolve EFFECTIVE: design
  demo resolve RESOLVE: none
  demo resolve EFFECTIVE: workspace,design,decisions,planning,implementation,review,validation,propose,integrate
  demo resolve AWAITING(propose): validation
  demo workspace PHASE-START(workspace): 2026-10-27T09:00:00Z
  demo workspace PHASE-DONE(workspace): worktree ../craft-demo on feat/demo
  other design PHASE-START(design): 2026-10-26T09:00:00Z
  demo design PHASE-START(design): 2026-10-27T09:05:00Z
  demo design PHASE-DONE(design): ok
  demo decisions auto-skip: decisions — evaluated unnecessary (no decision candidates)
  demo planning PHASE-START(planning): 2026-10-27T09:10:00Z
  ```

- `engine/test/run-state.test.js` — add one GUARD case at the end (helpers
  `readFixture`, `makeResolution(ids, awaiting)` already exist, L28–37).
- `test/architecture-boundaries.test.js` — add the purity rule. Reuse its
  `extractSpecifiers(sourceText)` (L55; matches `from '…'`, side-effect `import '…'` and
  `import('…')`) and `resolveSpecifier` (L61; bare → `null`). Add a pure detector
  `detectNodeBuiltinImports(entryFile, readSource)` that walks relative specifiers
  transitively from the entry (resolving with `path.posix.join(path.posix.dirname(from),
  spec)`, visiting each file once) and returns `{ visited, offenders }`: `visited` the
  files walked, `offenders` one `{ file, specifier }` per bare specifier that starts with `node:` or is in `require('node:module').builtinModules`.
  `readSource` is injected so the real tree (`fs.readFileSync(path.join(ROOT, f))`) and a
  synthetic map share one code path. Entry constant:
  `PURE_PROGRESS_ENTRY = 'engine/src/run-progress.js'`.

Read-only references: engine/src/observability/skip-signals.js (`AUTO_SKIP_RE =
/auto-skip:\s*([a-z][a-z-]*)/g`), engine/test/fixtures/run-ledger/mid-review.md and
mid-validation.md (pre-EFFECTIVE ledgers; mid-validation holds
`HARNESS-BG(validation:sample-technique): pid=4242 …` and an `auto-skip:` for
architecture), engine/stryker.conf.json (mutates `engine/src/**`, so the new module is in
the validation phase's per-hunk scope).

### TDD steps

1. **RED** — engine/test/run-progress.test.js: "Given with-effective.md, when
   projectProgress runs for demo, then items follow the EFFECTIVE order with statuses from
   the ledger". Assert `source === 'effective'`, `run === 'demo'`, item ids equal the nine
   EFFECTIVE ids in order, statuses `completed` ×3 (workspace, design, decisions via
   auto-skip), `in_progress` (planning), `pending` ×5, `inFlight` `['planning']`, `next`
   `'implementation'`, `warnings` `[]`, every `note` `''`, every `children` `[]`. Fails:
   the import throws `ERR_MODULE_NOT_FOUND` — engine/src/run-progress.js does not exist.
2. **GREEN** — export the six seams from `engine/src/run-state.js`; create
   `engine/src/run-progress.js` with the EFFECTIVE path and the spine (ledger-only can
   return no items yet).
3. **RED** — "Given mid-review.md with no EFFECTIVE record, when projectProgress runs, then
   the source is ledger-only and items list the named phases in first-appearance order":
   ids `workspace, design, decisions, planning, implementation, review`, review
   `in_progress`, the rest `completed`, `warnings` holds no `not in the effective pipeline`
   entry. Fails: step 2 returns `source: 'effective'` with an empty items list.
4. **GREEN** — the ledger-only fallback.
5. **RED** — "Given a ledger whose EFFECTIVE record is malformed, when projectProgress runs,
   then it warns once and falls back to ledger-only": with-effective lines with the demo
   EFFECTIVE line replaced by `demo resolve EFFECTIVE: Workspace, design`; expect
   `warnings[0] === 'malformed EFFECTIVE record: EFFECTIVE: Workspace, design'`, exactly one
   `malformed EFFECTIVE` warning, `source === 'ledger-only'`. Fails: the step-4 code treats
   a prefix-only match as absent and pushes no warning.
6. **GREEN** — the malformed branch.
7. **RED** — "Given mid-validation.md, when projectProgress runs, then background lists the
   in-flight phase's harness pid" → `[{ phase: 'validation', pid: 4242 }]`; and "Given the
   same ledger plus PHASE-DONE(validation), then background is empty". Fails: the view has
   no `background` field (undefined).
8. **GREEN** — map `state.background` filtered to in-flight phases.
9. **GUARD** — "Given with-effective.md plus a PHASE-START for architecture, then the
   existing out-of-pipeline warning is carried and no architecture item is invented":
   passes because `deriveRunState` already warns and items come from the EFFECTIVE ids.
   The other-run `EFFECTIVE: design` line in the fixture is ignored for the same reason
   (`recordsForRun`).
10. **GUARD** — engine/test/run-state.test.js: "Given with-effective.md, when deriveRunState
    runs with and without its EFFECTIVE line, then both states are deep-equal": passes
    because no run-state regex or prefix check matches `EFFECTIVE:`.
11. **GUARD** — test/architecture-boundaries.test.js, two-sided: (a) "Given the real
    run-progress import closure, then it imports no Node built-in" plus a non-vacuity
    assertion that the visited set contains engine/src/run-state.js and
    engine/src/observability/skip-signals.js; (b) "Given a synthetic closure whose second
    hop imports fs, then the detector reports it" (map: entry → `import { x } from
    './b.js'`, b → `import { readFileSync } from 'fs'`), and the same for a `node:path`
    specifier. Passes on the real tree because the closure is pure today.
12. **REFACTOR** — functions ≤ 20 lines, no nesting > 2, named constants; the existing
    run-state suites stay green with no edit beyond the added case.

### Gate

```
(cd engine && nice -n 19 node --test test/run-progress.test.js test/run-state.test.js test/run-state-main.test.js test/run-state.bin.test.js)
nice -n 19 node --test test/architecture-boundaries.test.js
grep -niE '\b(ADR-?[0-9]+|P[0-9]+|Part\s+[0-9]+|backlog\s*#[0-9]+|DC-[0-9]+)\b|stryker|mutation|mutant' engine/src/run-progress.js   # expect no output
grep -nE '\b[RTF][0-9]+\b' engine/src/run-progress.js   # expect no output
```

### Commit

`feat(engine): project a run ledger into a progress view`

## Part 2 — Notes, children and the seeded EFFECTIVE line

### Context

Files this part creates or edits:

- `engine/src/run-progress.js` — from Part 1. Add:
  - **Notes** on `completed` items only (pending and in-progress items keep `''`).
    Precedence: the text after the last `NO-OP(<id>):` record (match with the exported
    `NO_OP_RELEASE_RE`, take `record.slice(match[0].length).trim()`), else the signal of the
    last `auto-skip:` record naming the id (`autoSkipPhasesInText(record).includes(id)`,
    signal = the trailing parenthetical, `AUTO_SKIP_SIGNAL_RE = /\(([^()]*)\)\s*$/`; no
    parenthetical → `AUTO_SKIP_FALLBACK_NOTE = 'auto-skipped'`), else group 2 of the last
    `PHASE_DONE_RE` match for the id.
  - **Sanitise** every note (item and child): strip
    `CONTROL_CHARS_RE = /[\u0000-\u0008\u000B-\u001F\u007F-\u009F\u2028\u2029\u202A-\u202E\u2066-\u2069]/gu`
    (C0 except tab and newline, DEL, C1 incl. NEL, U+2028/2029, bidi embeddings, overrides
    and isolates — the same set as `craft_control_chars_ere` in hooks/bound-run.sh, plus the
    two line breakers; in JS the strip runs on code points, so one global pass is already a
    fixpoint), then cut to `NOTE_MAX_CHARS = 120` code points (`[...text].slice(0, 120)`,
    never splitting a surrogate pair). A record holding U+2028 or U+2029 never reaches a
    note: run-state's `LINE_RE` uses `.`, which stops at those two line terminators, so the
    whole line is dropped by `recordsForRun`; keep them in the strip set as defence, but do
    not build a test that expects them in a note.
  - **Children** of `implementation`: one per `state.parts` entry (already last-per-n,
    ascending): `{ label: 'part <n>', status: outcome === 'pass' ? 'completed' :
    'in_progress', note: outcome === 'pass' ? sha : 'blocked' }`.
  - **Children** of `review`: group `state.findings` by `cycle`, ascending; `{ label:
    'cycle <k>', note: 'n=<sum of count>' }`; every cycle but the newest `completed`; the
    newest `in_progress` when the review item is `in_progress`, else `completed`.
  - Every other item keeps `children: []`.
- `engine/test/run-progress.test.js` — extend. Add a helper `linesBefore(lines, marker)`
  returning the lines before the first line containing `marker`.
- `engine/test/fixtures/run-ledger/impacts-and-cycles.md` — new fixture, exactly:

  ```
  # craft run record (append-only)
  demo resolve RESOLVE: none
  demo resolve EFFECTIVE: workspace,planning,implementation,review,impact-triage,propose
  demo resolve AWAITING(propose): none
  demo workspace PHASE-START(workspace): 2026-10-27T09:00:00Z
  demo workspace PHASE-DONE(workspace): ok
  demo planning PHASE-START(planning): 2026-10-27T09:05:00Z
  demo planning DEFERRED(engine/src/x.js): I1 stale guard
  demo planning PHASE-DONE(planning): ok
  demo implementation PHASE-START(implementation): 2026-10-27T09:10:00Z
  demo implementation PART(1): abc1234 size=pure-module outcome=pass
  demo implementation PART(2): def5678 size=wiring outcome=blocked
  demo implementation PART(2): 0a1b2c3 size=wiring outcome=pass
  demo implementation PHASE-DONE(implementation): ok
  demo review PHASE-START(review): 2026-10-27T09:40:00Z
  demo review FINDINGS(code): c1 /tmp/craft-review.fixture/code.c1.json n=3
  demo review FINDINGS(security): c1 /tmp/craft-review.fixture/security.c1.json n=2
  demo review FINDINGS(code): c2 /tmp/craft-review.fixture/code.c2.json n=0
  demo review PHASE-DONE(review): ok
  demo impact-triage PHASE-START(impact-triage): 2026-10-27T10:00:00Z
  demo impact-triage TRIAGED(I1): file — outside the change perimeter
  demo impact-triage FILED(BACKLOG.md): I1 stale guard — not folded: outside the change perimeter
  ```

- `skills/run/SKILL.md` — §0 step 4 heredoc (L151–160): add the line
  `EFFECTIVE: <Resolution.effective[].id comma-joined>` directly after
  `RESOLVE: <craft flags verbatim, or none>` and before `<Resolution.record[] lines>`.
  `### Run-record tokens` walk-token sentence (L200–203): add `` `EFFECTIVE:` `` to the
  parenthetical list, right after `` `AWAITING(propose):` ``. The heredoc line adds no
  `${CRAFT_ROOT:-${CLAUDE_PLUGIN_ROOT}}` occurrence, so test/craft-root-shim.test.js's pinned
  count for this file (14) holds — re-run it. test/run-record.test.js slices §0 step 4 with
  `sliceProse(runSkill, /^4\. Open the \*\*run record\*\*/, /^## Phase walk/)` and asserts
  the literal chain `"$ledger" open <run-id> && "$ledger" append <run-id> resolve` — keep it
  byte-identical.
- `docs/contributing/specs/run-record.md` — `## Token vocabulary` (L74–): change
  "Seven more fixed, greppable tokens" to "Eight more"; add a table row after the
  `RESOLVE:` row:
  ``| `EFFECTIVE: <Resolution.effective[].id comma-joined>` | `^EFFECTIVE: ([a-z][a-z0-9-]*(?:,[a-z][a-z0-9-]*)*)$` (consumed by `run-progress`, not by `run-state`) | run skill §0 step 4 |``.
  After the "A record that starts with a new token's literal prefix…" sentence add a
  paragraph starting `**Derived views.**` saying `engine/src/run-progress.js`
  `projectProgress` is the only reader of `EFFECTIVE:`; a malformed one is a view warning
  plus the ledger-only fallback, never a `run-state` warning; a ledger without it (opened
  before the token existed) lists only the phases it names. No new `##` heading (the
  token-vocabulary slices end at `/^## /`).
- `test/run-record.test.js` — CommonJS; reuse `sliceProse`, `sliceRegion` (from
  ./helpers/region-slice), the module-level `runSkill` and `runRecordSpec`. Do NOT add
  `EFFECTIVE:` to `NEW_TOKENS` (L22): `RUN_SKILL_TOKENS = NEW_TOKENS.slice(0, 4)` depends
  on its order. Add standalone tests.

Read-only references: engine/test/fixtures/run-ledger/planning-no-op.md (planning has both
`NO-OP(planning): no part remains — …` and `PHASE-DONE(planning): no-op — no part remains`;
implementation has `NO-OP(implementation): no plan parts — planning recorded
NO-OP(planning)`), with-effective.md (from Part 1; decisions carries `(no decision
candidates)`).

### TDD steps

1. **RED** — "Given planning-no-op.md, when projectProgress runs, then a completed phase
   notes its NO-OP text over its PHASE-DONE outcome": planning note
   `'no part remains — R1 → 1a2b3c4, R2 → 5d6e7f8'`, implementation note
   `'no plan parts — planning recorded NO-OP(planning)'`, workspace note `'ok'`; and "Given
   with-effective.md, then an auto-skipped phase notes its signal": decisions note
   `'no decision candidates'`, workspace note `'worktree ../craft-demo on feat/demo'`,
   planning (in progress) note `''`. Fails: every note is `''` after Part 1.
2. **GREEN** — the note precedence.
3. **RED** — "Given a PHASE-DONE outcome holding control and line-breaking characters, when
   projectProgress runs, then the note comes out stripped" (inline lines, outcome built
   with escapes: `'a\u001b[31mb\u0085c\u202Ed\u2066e\tf\u007f'` → `'a[31mbcde\tf'`)
   and "Given a 500-character outcome, then the note is cut to 120 characters". Titles
   carry no raw control characters. Fails: the raw characters and the full 500 characters
   come through.
4. **GREEN** — `sanitizeNote` with the named constants.
5. **RED** — "Given impacts-and-cycles.md cut before the passing PART(2), when
   projectProgress runs, then implementation holds a completed first part and a blocked second one"
   (`[{ label: 'part 1', status: 'completed', note: 'abc1234' }, { label: 'part 2', status:
   'in_progress', note: 'blocked' }]`), and "Given the full fixture, then the later pass
   supersedes the blocked part" (the second child `completed`, note `'0a1b2c3'`). Fails: implementation
   `children` is `[]`.
6. **GREEN** — implementation children.
7. **RED** — "Given impacts-and-cycles.md cut before PHASE-DONE(review), then review holds a
   completed cycle 1 with n=5 and an in-progress cycle 2 with n=0", and "Given the full
   fixture, then both cycles are completed". Fails: review `children` is `[]`.
8. **GREEN** — review cycle children.
9. **GUARD** — "Given the full impacts-and-cycles.md, when projectProgress runs, then the
   impact tokens raise no warning and impact-triage is in progress" (`warnings` `[]`,
   impact-triage `in_progress`, review `completed`): passes because DEFERRED / TRIAGED /
   FILED match no run-state prefix and impact-triage is an EFFECTIVE id.
10. **RED** — test/run-record.test.js: "Given skills/run/SKILL.md §0 step 4, when the
    open-record region is read, then the heredoc seeds EFFECTIVE between RESOLVE and
    AWAITING" (index of `EFFECTIVE: <Resolution.effective[].id comma-joined>` is greater
    than the index of `RESOLVE: <craft flags` and lower than the index of
    `AWAITING(propose): <ids`); "Given the run-skill token sentence, then it names
    EFFECTIVE:" (slice `/^### Run-record tokens/` to `/^\| Token \|/`); "Given the
    run-record spec token table, then an EFFECTIVE row names run-progress as its reader"
    (the table line that starts with a pipe and the backticked EFFECTIVE token also holds
    the words run-progress and not by run-state). Fails: neither file mentions
    `EFFECTIVE:`.
11. **GREEN** — edit `skills/run/SKILL.md` and `docs/contributing/specs/run-record.md` as in
    Context.
12. **REFACTOR** — keep `projectProgress` a short composition of named helpers
    (`effectiveIds`, `phaseNote`, `sanitizeNote`, `partChildren`, `cycleChildren`).

### Gate

```
(cd engine && nice -n 19 node --test test/run-progress.test.js test/run-state.test.js)
nice -n 19 node --test test/run-record.test.js test/craft-root-shim.test.js test/source-hygiene.test.js
grep -niE '\b(ADR-?[0-9]+|P[0-9]+|Part\s+[0-9]+|backlog\s*#[0-9]+|DC-[0-9]+)\b|stryker|mutation|mutant' engine/src/run-progress.js   # expect no output
grep -nE '\b[RTF][0-9]+\b' engine/src/run-progress.js   # expect no output
```

### Commit

`feat(engine): note, nest and seed the effective pipeline in the progress view`

## Part 3 — Mod: bind a session and refresh the status line

### Context

Files this part creates (the module is not wired into hooks/hooks.json until Part 4, so it is
exercised only by its own tests here):

- `hooks/progress/state.d.ts` — new. Declares the plugin's atom value type and a TS mirror of
  the `ProgressView` JSDoc from engine/src/run-progress.js (`source`, `items[{ id, status,
  note, children[{ label, status, note }] }]`, `inFlight`, `next`, `background[{ phase,
  pid }]`, `warnings`). Atom state (`PluginState` declaration per the plugin-authoring
  skill):

  ```ts
  type RunsDir = { kind: 'unknown' } | { kind: 'unavailable' } | { kind: 'known'; path: string }
  type Binding = { runId: string; ledgerPath: string }
  type ProgressState = {
    envelope: { transcriptPath: string; cwd: string } | null  // last main-loop classic.* envelope
    runsDir: RunsDir                                           // resolved once per session
    binding: Binding | null
    gate: { mtimeMs: number; size: number } | null             // ledger entry at the last read
    view: ProgressView | null
    attention: string                                          // '' until Part 4
  }
  ```

- `hooks/progress/bind.ts` — new. Named constants: `LOCATE_TIMEOUT_MS = 5_000`,
  `DIR_TIMEOUT_MS = 5_000`, `POINTER_SUFFIX = '.pointer'`, `LEDGER_SUFFIX = '.md'`. Helpers
  (each ≤ 20 lines, early returns):
  - `resolveRunsDir($, cwd)` — once per session: `$.process.run` with argv
    bash, <plugin-root>/scripts/run-ledger.sh, dir (plugin root from `$.plugin.root`) and
    `{ cwd, timeoutMs: DIR_TIMEOUT_MS }`;
    exit 0 → `known` with trimmed stdout, otherwise `unavailable` (inert for the session).
  - `hasPointer(entries)` — any entry whose `name` ends with `.pointer` and is not `isLink`.
  - `locate($, envelope)` — `$.process.run` with argv bash, <plugin-root>/scripts/run-ledger.sh,
    locate, --transcript, `envelope.transcriptPath` and `{ cwd: envelope.cwd, timeoutMs:
    LOCATE_TIMEOUT_MS }`; stdout `<run-id> <ledger-path>` → `Binding`; empty → `null`.
  - `ledgerEntry(entries, runId)` — the entry named exactly `<run-id>.md` (not
    `<run-id>.impacts.md`).
  - `refresh($, state)` — one `$.fs.list(runsDir)`; if `(mtimeMs, size)` equals `state.gate`
    do nothing; else `$.fs.read(ledgerPath)` → `projectProgress(text.split('\n'), runId)` →
    `update` the atom → `$.ui.status(statusLine(...))`.
  - `statusLine(runId, view, attention)` →
    `craft <run-id> · <inFlight[0] ?? next ?? 'done'> · <completed>/<items.length>` plus
    ` · <attention>` when attention is non-empty (empty in this part).
  - `failOpen($, event, fn)` — runs `fn`, and on a thrown error logs through `$.ui.log` at
    `debug` level with plugin `craft`, the event name and the error message, keeping the
    previous view. Every hook goes through it and then calls `next(e)`: no hook guards or
    refuses an event.
- `hooks/progress/register.tsx` — new. `export const register: Register = (on) => { … }`.
  `const view = atom({ plugin: 'craft', key: 'progress' } as const, EMPTY, { shape:
  'progress-1' })` (the shape tag drops a value an older version stored, on reload).
  Imports `projectProgress` from ../../engine/src/run-progress.js. Handlers in this part:
  - `classic.SessionStart` — cache the envelope (`transcript_path`, `cwd`), then the
    trigger sequence below.
  - `classic.PostToolUse` — only when `tool_name === 'Bash'`. Main loop (no `agent_id`):
    cache the envelope, run the trigger sequence. Sub-agent (`agent_id` present): refresh
    only if already bound; never bind.
  - Trigger sequence: bind (if unbound: resolve runs dir → `$.fs.list` → no pointer → stop;
    else `locate`) → refresh.
  The `open` call's own PostToolUse cannot bind (its run-key sits in the not-yet-written
  tool result); the next trigger binds. That is expected, not a bug.
- `hooks/progress/progress.test.tsx` — new mod test, kit from claude-code/testing. Stub
  `process.run` per argv (`dir` → `{ exit 0, stdout: '<runs>\n' }`, `locate` →
  `'demo <runs>/demo.md\n'`), `fs.list` (entries for `demo.pointer`, `demo.md` with
  `mtimeMs`/`size`), `fs.read` (an inline ledger: the with-effective lines from Part 1),
  `ui.status` (capture), `ui.log` (capture). The engine import runs for real.

Read-only references: engine/src/run-progress.js (Parts 1–2), hooks/bound-run.sh
(`bound_run`, the shell twin of this binding), scripts/run-ledger.sh (`dir`,
`locate_by_transcript` L405–415).

### TDD steps

1. **RED** — "Given a main-loop Bash PostToolUse and a runs dir with no pointer, when the
   hook runs, then nothing but the dir lookup is spawned and no status is set"; and "Given
   `dir` exits non-zero, then a second trigger spawns nothing at all" (cached
   `unavailable`). Fails: hooks/progress/register.tsx does not exist (import error).
2. **GREEN** — `state.d.ts`, `bind.ts` (`resolveRunsDir`, `hasPointer`), `register.tsx` with
   `classic.PostToolUse` and `classic.SessionStart`.
3. **RED** — "Given a pointer and a locate stdout for demo, when a main-loop Bash
   PostToolUse runs, then the session binds and the status line reads
   `craft demo · planning · 3/9`". Fails: step 2 never spawns `locate`, so `ui.status` is
   never called.
4. **GREEN** — `locate`, `ledgerEntry`, `refresh`, `statusLine`.
5. **RED** — "Given a bound session and an unchanged ledger entry (mtimeMs, size), when a
   second trigger runs, then the ledger is not re-read" (`fs.read` called once), and "Given
   the entry changed, then it is re-read and the status line updates" (stub a second ledger
   text with `PHASE-DONE(planning)` → `craft demo · implementation · 4/9`). Fails: step 4
   re-reads on every trigger.
6. **GREEN** — the `(mtimeMs, size)` gate stored in `gate`.
7. **RED** — "Given an unbound session, when a PostToolUse carrying agent_id runs, then
   locate is never spawned"; "Given a bound session, when a sub-agent PostToolUse runs and
   the entry changed, then it refreshes"; "Given a non-Bash PostToolUse, then nothing is
   spawned". Fails: step 6 binds on any PostToolUse.
8. **GREEN** — the `tool_name` and `agent_id` filters.
9. **RED** — "Given `process.run` throws on locate, when the hook runs, then next is still
   called, the previous status stays and one debug log line names the event and the
   message". Fails: the error escapes the handler.
10. **GREEN** — `failOpen` around every handler body.
11. **REFACTOR** — handlers stay one-liners delegating to `bind.ts`; no nesting > 2; no
    boolean params.

### Gate

```
nice -n 19 claude plugin validate .
nice -n 19 claude plugin test .
grep -rniE '\b(ADR-?[0-9]+|P[0-9]+|Part\s+[0-9]+|backlog\s*#[0-9]+|DC-[0-9]+)\b' hooks/progress   # expect no output
grep -rnE '\b[RTF][0-9]+\b' hooks/progress   # expect no output
```

### Commit

`feat(hooks): bind a session to its run and refresh the progress status line`

## Part 4 — Mod: attention and the hooks.json wiring

### Context

Files this part creates or edits:

- `hooks/progress/bind.ts` — add `KILL_PROBE_TIMEOUT_MS = 2_000` and
  `attentionAfterTurn($, view)`: for each `view.background` entry run
  `$.process.run(['kill', '-0', String(pid)], { timeoutMs: KILL_PROBE_TIMEOUT_MS })`; exit 0
  → `waiting on background — <phase>`; otherwise (and with no entry)
  `waiting on you — <inFlight[0] ?? next>`. A throwing probe counts as not alive and is
  logged at `debug` through `failOpen`'s logger (never swallowed). Attention strings are
  named constants (`WORKING = 'working'`, `WAITING_ON_YOU = 'waiting on you'`,
  `WAITING_ON_BACKGROUND = 'waiting on background'`).
- `hooks/progress/register.tsx` — add, each through `failOpen` and ending in `next(e)`;
  on every trigger binding runs first, then refresh, then the attention update:

  | Event | attention |
  |---|---|
  | `turn.start` (main loop) | `working` |
  | `tool.call` `{ tool: 'AskUserQuestion' }` | `waiting on you — <inFlight[0] ?? next>` set before awaiting `next(e)`, back to `working` once it resolves (a `finally`, not a catch) |
  | `turn.complete` without `agentId`, bound | `attentionAfterTurn` |
  | `turn.complete` with `agentId` | unchanged |

  `turn.complete` and `turn.start` reuse the envelope cached from the last main-loop
  `classic.*` event to bind. `statusLine` now appends ` · <attention>`.
- `hooks/progress/state.d.ts` — only if the attention type needs narrowing (e.g. a union of
  the three prefixes); otherwise untouched.
- `hooks/progress/attention.test.tsx` — new mod test; same stubs as progress.test.tsx (copy
  the small stub helper or import it from a shared non-test module only if both files need
  it unchanged), plus `process.run` for `kill` (exit 0 alive, exit 1 dead).
- `hooks/hooks.json` — add a top-level `"modules": ["./progress/register.tsx"]` before the
  unchanged `"hooks"` object. test/hooks.test.js `readHooksConfig()` (L667) reads only
  `.hooks[event]`, and test/craft-root-shim.test.js pins this file's shim count at 3 — the
  new key adds no shim occurrence, both stay green.
- `test/hooks.test.js` — CommonJS; add one test next to the existing `hooks/hooks.json`
  tests (L700–740), reusing `readHooksConfig()` and `HOOKS_DIR`.

Read-only references: engine/src/run-progress.js (`background` is already limited to
in-flight phases), hooks/progress/progress.test.tsx (Part 3 stubs).

### TDD steps

1. **RED** — "Given a bound session, when turn.start runs on the main loop, then the status
   line ends with `· working`". Fails: no `turn.start` handler; the status line has no
   attention segment.
2. **GREEN** — `turn.start` handler and the attention segment in `statusLine`.
3. **RED** — "Given a bound session in planning, when turn.complete runs without agentId,
   then the status line ends with `· waiting on you — planning`"; "Given turn.complete with
   an agentId, then the attention is unchanged". Fails: no `turn.complete` handler.
4. **GREEN** — `turn.complete` with `attentionAfterTurn` (no-background path).
5. **RED** — "Given a ledger whose in-flight validation holds a HARNESS-BG pid that is
   alive, when turn.complete runs, then the status line ends with
   `· waiting on background — validation`" (inline ledger: an EFFECTIVE line naming
   workspace,validation,propose, `PHASE-DONE(workspace)`, `PHASE-START(validation)`, then
   `HARNESS-BG(validation:sample-technique): pid=4242 out=/tmp/x spec=none`; stub
   `process.run` for kill -0 4242 → exit 0); "Given the pid is dead (exit 1), then
   `waiting on you — validation`". Fails: step 4 never probes the pid.
6. **GREEN** — the `kill -0` probe.
7. **RED** — "Given a bound session, when an AskUserQuestion tool call is open, then the
   status reads waiting on you, and once it resolves, working". Fails: no `tool.call`
   handler.
8. **GREEN** — the `tool.call` handler with `finally`.
9. **RED** — test/hooks.test.js: "Given hooks/hooks.json, when parsed, then modules lists
   ./progress/register.tsx and that file exists" (`path.join(HOOKS_DIR,
   'progress/register.tsx')` is a regular file). Fails: `modules` is undefined.
10. **GREEN** — the `hooks/hooks.json` `modules` key.
11. **REFACTOR** — one attention module of named strings; handlers delegate.

### Gate

```
nice -n 19 claude plugin validate .
nice -n 19 claude plugin test .
nice -n 19 node --test test/hooks.test.js test/craft-root-shim.test.js
grep -rniE '\b(ADR-?[0-9]+|P[0-9]+|Part\s+[0-9]+|backlog\s*#[0-9]+|DC-[0-9]+)\b' hooks/progress   # expect no output
grep -rnE '\b[RTF][0-9]+\b' hooks/progress   # expect no output
```

### Commit

`feat(hooks): show who the run is waiting on and register the progress module`

## Part 5 — Mod: pane, lifecycle and docs

### Context

Files this part creates or edits:

- `hooks/progress/register.tsx` — add, each through `failOpen` and calling `next(e)`:
  - `const PANE = 'craft-progress'`. `on('ui.render', { component: 'Pane', requestId: PANE
    }, …)` renders from `read($, view)`: one row per item with glyph `✓` completed, `▸`
    in_progress, `·` pending, the id, then the note dimmed; children indented two spaces
    under their item with the same glyphs; sized to `e.props.bodyColumns`. Footer:
    `<n> warning(s)` when `warnings.length > 0`; `pipeline list unavailable` when
    `source === 'ledger-only'`.
  - Command: register `craft-progress` with `$.command.register` from the
    `classic.SessionStart` handler; `on('command.run', { command: 'craft-progress' }, …)`
    → `$.ui.open({ id: PANE, title: 'craft run' })`.
  - Auto-open: right after a bind, once per bound run, open the pane only where the surface
    docks panes (`viewport.isFullscreen`, per the plugin-authoring types); elsewhere only the
    command opens it.
  - `session.compact` — after `await next(e)`: clear `gate` and re-run bind + refresh, so the
    view is re-projected from the ledger even when the entry is unchanged.
  - `session.end` — unbind (`binding`, `gate`, `view` reset), clear the status line.
    The /clear command arrives here with `reason: 'clear'`; the new transcript lacks the run-key, so
    no rebind follows.
- `hooks/progress/bind.ts` — in `refresh`: a missing `<run-id>.md` entry means the run
  closed → attention `closed`, status updated once, and the next `turn.start` unbinds and
  clears the status line; an entry with `isLink` → refused like run-ledger.sh's symlink
  refusal: unbind, clear the status, one debug log line; a `$.fs.read` rejection (over
  4 MiB, a race with `close`) keeps the previous view and logs at debug.
- `hooks/progress/pane.test.tsx` — new mod test, same stubs as the Part 3/4 tests.
- `docs/guides/customizing.md` — new subsection
  `### Run progress — pane and status line (Claude Code)` inserted after the
  "Long sessions — auto-compaction (Claude Code)" subsection (L447) and before the `---`
  rule preceding `## 5. Tailor in one sitting`. Content: what the status line shows
  (`craft <run-id> · <phase> · <done>/<total> · <attention>`), the attention values
  (working, waiting on you — <phase>, waiting on background — <phase>, closed), the nested
  pane and the /craft-progress command, that mods must be turned on in Claude Code, that it is
  read-only and fail-open (nothing drawn outside a craft run), and that a run opened before
  the `EFFECTIVE:` line existed shows only the phases it has reached plus
  `pipeline list unavailable`. test/auto-compaction-docs.test.js slices the previous
  subsection up to the next `/^#{2,3} /`, so the new `###` heading ends that slice cleanly.
  This file is class-A/B scanned: no `gh`, `github`, `mutation`, `mutant`, `stryker`.
- `docs/contributing/maintainer-smokes.md` — new section at the end:
  `## Run-progress mod smoke — not CI-gated`. Content: why it is not CI-gated (CI has no
  `claude` binary); the two local commands, fenced: `claude plugin validate .` and
  `claude plugin test .` from the repo root; the live check — in a throwaway git repo run
  `claude --plugin-dir <worktree>`, turn mods on when asked, have the session run
  `run-ledger.sh open demo` then append a seeded block holding `EFFECTIVE:` and some
  `PHASE-START` / `PHASE-DONE` lines, confirm the status line and pane follow and survive
  /compact; then turn mods off and confirm the craft command hooks still fire (the
  PreToolUse guard refuses a `git diff` without `--no-ext-diff`). Never write the
  `claude plugin eval` command here: test/plugin-evals-local-only.test.js requires every
  fenced eval command in this file to carry its cost flags.
- `test/run-progress-docs.test.js` — new, CommonJS, reuses `sliceRegion` from
  ./helpers/region-slice.

Read-only references: hooks/progress/progress.test.tsx and attention.test.tsx (stubs),
test/devcontainer.test.js (reads maintainer-smokes headings), the design doc's "Edge
behaviour" list.

### TDD steps

1. **RED** — pane.test.tsx: "Given a bound session in review with two cycles, when the
   craft-progress pane renders, then it lists every item with its glyph and nests the
   cycles"; "Given a ledger-only view with one warning, then the footer shows the warning
   count and pipeline list unavailable". Fails: no `ui.render` handler for the pane.
2. **GREEN** — the pane render.
3. **RED** — "Given a session start, then the craft-progress command is registered, and
   running it opens the craft-progress pane"; "Given a docked surface, when the session
   binds, then the pane opens once and not again on the next trigger". Fails: no command
   and no auto-open.
4. **GREEN** — command registration, `command.run`, once-per-bind auto-open.
5. **RED** — "Given a bound session and an unchanged ledger entry, when session.compact
   runs, then the ledger is re-read and re-projected"; "Given session.end, then the status
   line is cleared and the next trigger re-runs locate". Fails: no compact or end handler
   (the read count stays 1; the binding survives).
6. **GREEN** — `session.compact`, `session.end`.
7. **RED** — "Given a bound session whose ledger entry is gone from the listing, when a
   trigger runs, then the status shows closed, and at the next turn.start the session
   unbinds"; "Given the ledger entry is a link, then it is not read, the session unbinds and
   a debug line is logged". Fails: `refresh` reads a missing or linked entry (the stub
   rejects) and keeps the stale view.
8. **GREEN** — the closed and link branches in `refresh`.
9. **RED** — test/run-progress-docs.test.js: "Given the customizing guide, when the
   run-progress subsection is sliced, then it names /craft-progress, the status line, the
   attention values and that mods must be on" (slice from
   `/^### Run progress — pane and status line \(Claude Code\)$/` to `/^#{2,3} |^---$/`,
   tokens `/craft-progress`, `waiting on you`, `waiting on background`, `mods`,
   `pipeline list unavailable`); "Given the maintainer smokes, then a not-CI-gated
   run-progress smoke names claude plugin validate, claude plugin test, --plugin-dir and
   the mods-off check" (slice from its heading to the next `/^## /` or the end). Fails: neither
   heading exists.
10. **GREEN** — the two docs sections.
11. **REFACTOR** — render helpers small (`itemRow`, `childRow`, `footer`); no magic strings.

### Gate

```
nice -n 19 claude plugin validate .
nice -n 19 claude plugin test .
nice -n 19 node --test test/run-progress-docs.test.js test/auto-compaction-docs.test.js test/plugin-evals-local-only.test.js test/devcontainer.test.js test/source-hygiene.test.js
grep -rniE '\b(ADR-?[0-9]+|P[0-9]+|Part\s+[0-9]+|backlog\s*#[0-9]+|DC-[0-9]+)\b' hooks/progress   # expect no output
grep -rnE '\b[RTF][0-9]+\b' hooks/progress   # expect no output
```

Live proof (user-run, not a part gate): the maintainer smoke above, run once after merge;
the first real craft run after merge is the dogfood.

### Commit

`feat(hooks): render the run progress pane and document the mod`
