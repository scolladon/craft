# Plan — progress-status-line-bar

> Source: design doc `docs/contributing/design/progress-status-line-bar.md` · ADRs 718, 719, 720
> The plan is the implementation script AND the knowledge handoff. Part agents start
> with zero context: whatever a part block omits is paid later as agent rediscovery.
> `plan-lint.sh` enforces the schema below — the plan phase cannot close without it.

## Sizing rules

- Every part costs a full agent lifecycle (spin-up, zero-context rebuild, gate) — it
  must earn it. No standalone test-only parts for FEATURE code: tests fold into the
  implementation part whose code they exercise. EXCEPTION: test-infra-only and docs-only
  parts with no `src/` delta ARE standalone.
- A part should land in ~100 tool calls. More than ~5 RED→GREEN cycles, or more than 6
  files in its `### Context` block, is two parts. What counts is a backticked path:
  backtick the files the part CREATES, EDITS or DELETES, and write read-only reference
  paths in plain text.

## Overview

Three sequential parts in one working tree, each ending green on its own gate:

| # | Part | Lands | Gate |
|---|---|---|---|
| 1 | Segmented bar renderer, wired | new pure hooks/progress/status-line.ts (bar, `▸` phase, `next`, 80-cell fitting); `statusText` dispatches effective → new line, ledger-only → today's line; every binding test's expected string moves to the new format | claude plugin validate/test + ci.sh |
| 2 | Remove the pane surface | pane.tsx, pane.test.tsx, `/craft-progress`, `command.run`, both `ui.render` handlers, `Surface`, `openPaneOnce`, `isPaneOpened`; `SHAPE` → `progress-3` | claude plugin validate/test + ci.sh |
| 3 | Guide subsection + its docs pin | customizing.md run-progress subsection rewritten for the bar; test/run-progress-docs.test.js pins the new heading and tokens | ci.sh |

Order rationale: Part 1 changes only what the line says, with the pane still present, so
pane.test.tsx stays green through it. Part 2 deletes pane.tsx and every importer of it in
the same commit, so no part leaves a dangling `./pane` import. Part 3 is docs-only.

Phase gate (after Part 3): `nice -n 19 bash scripts/ci.sh` plus
`nice -n 19 claude plugin validate . && nice -n 19 claude plugin test .`.

Left to the documentation phase (not a part): docs/contributing/maintainer-smokes.md
L477–504 (the run-progress smoke's live check still names the `/craft-progress` pane and the
auto-open record; add the 80-cell checks U1/U2 per the design's Test strategy; its
`SMOKE_TOKENS` pin is unchanged, so nothing goes red meanwhile) and the BACKLOG.md L270 entry
text that still says "a pane (`/craft-progress`)".

## Decision candidates (planner-level)

Choices the design left open. The parts below follow the recommendation; a reviewer who
prefers an alternative changes only the named part.

| # | Choice | Alternatives | Recommendation | Why |
|---|---|---|---|---|
| D1 | Where the pinned guide text changes | (a) a docs-only Part 3 right after the removal · (b) fold into Part 2 · (c) leave to the documentation phase | **(a)** | test/run-progress-docs.test.js pins the guide heading and `/craft-progress`, so the plan owns the change. (b) puts Part 2 at 8 files, over the ceiling of 6. (c) leaves the pin green over prose that documents a removed command. (a) lands it before the phase gate, in its own small lifecycle |
| D2 | `next` between phases in a long pipeline | (a) R4 literally: first `pending` item not named by `▸` (9-item ledger, planning done → `▸ implementation · next review`) · (b) never show `next` while nothing is in flight | **(a)** | R4 is the decided rule; the design's 3-item "between phases" example (`▸ implementation`, no `next`) is (a) applied to a pipeline whose only pending item is already named |
| D3 | The duplicate `done` fallback and done count | (a) status-line.ts exports `DONE_LABEL` and `completedCount`; bind.ts imports them and keeps `currentPhase` · (b) each file keeps its own copy | **(a)** | Both renderers need the same count and fallback word; one home keeps them from drifting. `currentPhase` stays in bind.ts as the design says |
| D4 | Where the removal tests live | (a) hooks/progress/lifecycle.test.tsx, its rig extended · (b) a new surface test file | **(a)** | Keeps Part 2 at 6 files; lifecycle already owns session-level behaviour (start, end, compact) |

## Shared knowledge (read once, every part)

- **Git.** Use `/usr/bin/git` for every git command (bare `git` is rewritten to `rtk git`
  and refused in this worktree). `--no-ext-diff` on `git diff` / `git show`. Stage only
  the paths the part names (deletions via `/usr/bin/git rm <path>`), never `commit -am`.
- **Throttle.** Prefix heavy commands with `nice -n 19`. Pipe long test output to a file in
  the scratchpad and read back only failing lines.
- **Mod test command.** `claude plugin test .` from the repo root runs only the
  `hooks/progress/*.test.tsx` files. `claude plugin validate .` is the only type check; do
  not invent a `tsc` step. `bash scripts/ci.sh` does not run the mod tests; it runs the
  node suites (test/hooks.test.js pins `"modules": ["./progress/register.tsx"]` — keep
  hooks/hooks.json untouched), source-hygiene, intention-lint over docs/guides/customizing.md,
  and touched-file stub-lint (.ts) and prose-lint (.md).
- **Hygiene traps (CI-gated by test/source-hygiene.test.js).** Everything under `hooks/` is
  shipped code and is scanned whole-line, tests and data included: case-insensitive
  `\b(ADR-?\d+|P\d+|Part\s+\d+|backlog\s*#\d+|DC-\d+)\b` and case-sensitive
  `\b[RTF]\d+\b`. So no `p1`, `R6`, `T1` anywhere in hooks/progress (a review cycle label
  `c2` and `cycle 2` are fine). New files are invisible to that `git grep` until committed,
  so each part's gate greps its files explicitly. No provenance (requirement, ADR, part
  numbers) in code, comments or titles; no suppression directives; no swallowed errors.
- **Mod authoring.** Load the bundled `plugin-authoring` skill before editing hooks/progress
  code. Repo rules: a helper that takes `$` is a `function` declaration; a render may not
  write state; one `on('<service>')` per service per test (the rig registers the stubs, a
  test must not register the same service again); a failure is simulated with
  `{ deny: '…' }`. Mod tests import `{ expect, test }` from `claude-code/testing`;
  binding tests drive `$.classic.PostToolUse(...)`, `$.turn.start/complete(...)`,
  `$.session.compact/end(...)`, `$.ui.mount(...)`. A pure module (no `$`) is imported and
  unit-tested directly from a `*.test.tsx` (designer's probe on the CI pin 2.1.311).
- **Test style.** Given/When/Then titles, Arrange-Act-Assert bodies, the unit under test
  (or the rig capture) in a `sut` variable.
- **Glyph and cell facts.** `■` U+25A0, `▶` U+25B6, `□` U+25A1, `▸` U+25B8, `∥` U+2225,
  `·` U+00B7, `—` U+2014: each one BMP code point, none East-Asian Wide, so one cell each.
  The budget is the constant 80, no terminal width is read anywhere (ADR-719: no
  `viewport`, no `ui.render` hook).
- **Projection facts** (engine/src/run-progress.js, read-only, unchanged). `projectProgress`
  gives `ProgressView { run, source: 'effective' | 'ledger-only', items[{ id, status:
  'pending' | 'in_progress' | 'completed', note, children[{ label, status, note }] }],
  inFlight: string[], next: string | null, background[{ phase, pid }], warnings }`. Review
  gets one child per FINDINGS cycle, `{ label: 'cycle <n>', status, note: 'n=<k>' }`, the
  newest `in_progress` while review is in flight. A ledger with no `EFFECTIVE:` line is
  `source: 'ledger-only'` with items only for phases reached and `next: null` (probed: the
  ledger workspace done + planning started gives items workspace completed, planning
  in_progress, `inFlight: ['planning']`).

## Part 1 — Segmented bar renderer, wired into the status line

### Context

Files this part creates or edits:

- `hooks/progress/status-line.ts` — new, pure: imports only types from ./state (no `$`, no
  claude-code import). **Internal to the mod**: its exports are consumed by bind.ts and its
  own test only; not a public surface (no barrel; .claude-plugin/plugin.json `types` keeps
  naming only state.d.ts; hooks/hooks.json `modules` keeps naming only register.tsx), so no
  downstream surface gate applies. Shape (each helper ≤ 20 lines, early returns, named
  constants):

  ```ts
  const STATUS_LINE_CELLS = 80
  const PREFIX = 'craft'
  const SEPARATOR = ' · '
  const PARALLEL = ' ∥ '
  const PHASE_MARK = '▸ '
  const NEXT_LABEL = 'next '
  export const DONE_LABEL = 'done'
  const REVIEW = 'review'
  const CYCLE_LABEL = /^cycle (\d+)$/
  const BAR_GLYPHS: Record<ProgressItem['status'], string> = {
    completed: '■', in_progress: '▶', pending: '□',
  }
  export function completedCount(view: ProgressView): number
  export function statusLine(view: ProgressView, attention: string): string
  ```

  Private helpers: `bar(items)`; `phaseToken(view, id)` → `review c<n>` when
  `id === REVIEW` and the review item has an `in_progress` child whose label matches
  `CYCLE_LABEL`, else `id`; `namedPhases(view)` → `view.inFlight` when non-empty, else
  `[view.next ?? DONE_LABEL]`; `phaseSegment(view)` → `PHASE_MARK +
  namedPhases(view).map(token).join(PARALLEL)`; `nextSegment(view)` → `NEXT_LABEL + id` of
  the first `pending` item whose id is not in `namedPhases(view)` (compare ids, never
  substrings), else `null`; `cells(text)` → `[...text].length`; `join(segments)` drops
  `null` / `''` and joins with `SEPARATOR`; `forms(view, attention)` → `[full, withoutNext,
  minimal]` where the head is `craft <bar> <done>/<total>` (full, withoutNext) or
  `craft <done>/<total>` (minimal). `statusLine` returns
  `forms.find(form => cells(form) <= STATUS_LINE_CELLS) ?? minimal`.
  The budget is a module constant, never a parameter.
- `hooks/progress/status-line.test.tsx` — new, pure: imports `statusLine` from
  ./status-line and `{ expect, test }` from claude-code/testing; no `$` stubs, no `on`.
  Build views with small local builders, e.g. `item(id, status, children = [])` and
  `view(items, inFlight, next)` (source `'effective'`, `background: []`, `warnings: []`,
  `run: 'demo'`). Use the literal 80/81 lengths below, never the module constant (a mutant
  of the constant must turn a test red).
- `hooks/progress/bind.ts` — today: `const DONE_LABEL = 'done'` (L17);
  `currentPhase(view)` (L113, `inFlight[0] ?? next ?? DONE_LABEL`, kept: the attention
  strings use it); `completedCount(view)` (L117); `export function statusLine(runId, view,
  attention)` (L121–128, today's `craft <run-id> · <phase> · <done>/<total>[ · <attention>]`);
  `export function statusText(state)` (L130–134, `undefined` while `binding` or `view` is
  null). Change: rename today's `statusLine` to module-private `legacyStatusLine` (same
  body, no export — nothing else imports it); `statusText` keeps its signature and returns
  `statusLine(view, state.attention)` from ./status-line when `view.source ===
  'effective'`, else `legacyStatusLine(binding.runId, view, state.attention)`. Drop the
  local `DONE_LABEL` and `completedCount`, import both from ./status-line (D3).
- `hooks/progress/progress.test.tsx` — rig `rig(on, opts)` (L46; opts `entries`, `text`,
  `locateStdout`, `runsDir`, …; captures `statuses`). Nine-item `LEDGER_LINES` (L11):
  workspace, design, decisions (auto-skip) completed, planning in flight. Expected strings to
  move: L97 and L179 → `craft ■■■▶□□□□□ 3/9 · ▸ planning · next implementation` (54 cells);
  L119 and L140 (after `PLANNING_DONE`) → `craft ■■■■□□□□□ 4/9 · ▸ implementation · next
  review` (52; D2); L273 → `craft ■■■▶□□□□□ 3/9 · ▸ planning · waiting on you — planning`
  (the full form is 82 cells, so `next` drops: the degradation pinned through the binding).
  Add the ledger-only cases here (no binding test seeds a ledger without `EFFECTIVE:`).
- `hooks/progress/attention.test.tsx` — `PLANNING_LEDGER` (workspace, planning,
  implementation; planning in flight) and `VALIDATION_LEDGER` (workspace, validation,
  propose; validation in flight, HARNESS-BG pid 4242). Expected strings to move (L68, 78, 90,
  109, 118, 127, 138, 139, 150, 161, 171, 193):
  `craft demo · planning · 1/3 · working` → `craft ■▶□ 1/3 · ▸ planning · next implementation · working` (58);
  `… planning · 1/3 · waiting on you — planning` → `craft ■▶□ 1/3 · ▸ planning · next implementation · waiting on you — planning` (76);
  `… validation · 1/3 · waiting on background — validation` → `craft ■▶□ 1/3 · ▸ validation · next propose · waiting on background — validation` (exactly 80: pins the `<=` edge through the binding);
  `… validation · 1/3 · waiting on you — validation` → `craft ■▶□ 1/3 · ▸ validation · next propose · waiting on you — validation` (73).
- `hooks/progress/lifecycle.test.tsx` — same three-item ledger as attention's planning one.
  L57, L108 → `craft ■▶□ 1/3 · ▸ planning · next implementation` (48); L81 →
  `craft ■▶□ 1/3 · ▸ planning · next implementation · closed` (57).

Read-only references: hooks/progress/state.d.ts (`ProgressItem`, `ProgressView`),
hooks/progress/register.tsx (`showStatus` compares `statusText(before)` with
`statusText(after)`: unchanged, it already pushes only on change), engine/src/run-progress.js
`cycleChildren` (L116–128). hooks/progress/pane.test.tsx is untouched here and stays green
(it asserts pane rows, not status strings).

### TDD steps

1. **RED** — status-line.test.tsx:
   "Given an effective view with a completed, an in-progress and a pending item, when the
   line renders, then it reads `craft ■▶□ 1/3 · ▸ planning · next implementation · working`";
   "Given two in-progress items among completed and pending ones, when the bar renders, then
   it holds one glyph per item in pipeline order, `▶▶` included" (e.g. 12 items, 8 done,
   validation ∥ documentation in flight, next lessons, `working` →
   `craft ■■■■■■■■▶▶□□ 8/12 · ▸ validation ∥ documentation · next lessons · working`, 79);
   "Given nothing in flight and next implementation as the only pending item, then the line
   is `craft ■■□ 2/3 · ▸ implementation` with no `next` segment";
   "Given every item completed and an empty attention, then the line is `craft ■■■ 3/3 · ▸
   done` with no trailing separator".
   Fails: ./status-line does not exist (import error).
2. **GREEN** — status-line.ts with `bar`, `namedPhases`, `phaseSegment` (plain ids, no
   cycle token yet), `nextSegment`, `join`, `completedCount`, and `statusLine` returning the
   full form (no fitting yet).
3. **RED** — "Given review in flight with cycle 1 completed and cycle 2 in progress, when the
   line renders, then the phase reads `▸ review c2`" — the 11-item worked example: workspace,
   design, decisions, planning, implementation completed; review in progress; refactoring,
   validation, documentation, lessons, propose pending; attention `waiting on you` →
   `craft ■■■■■▶□□□□□ 5/11 · ▸ review c2 · next refactoring · waiting on you` (72).
   Fails: step 2 prints `▸ review`.
   In the same step, two GUARDs (pass on step 2's code, and must keep passing once the token
   lands): "Given review in flight with no cycle child, then the phase reads `▸ review`";
   "Given review completed with cycle children, then no `c<n>` appears".
4. **GREEN** — `phaseToken` with `CYCLE_LABEL`.
5. **RED** — the degradation, on the view workspace completed / validation in progress /
   propose pending (`next propose`), padding the attention with `'x'.repeat(n)`:
   "Given a full line of 81 cells whose form without next fits, then next is dropped"
   (n = 35: full 81, without-next 66);
   "Given a line without next of 81 cells, then the bar is dropped too" (n = 50: without-next
   81, minimal `craft 1/3 · ▸ validation · <x×50>` 77);
   "Given a minimal form of 81 cells, then the minimal form is printed anyway" (n = 54).
   Fails: step 4 returns the full form whatever its length.
6. **GREEN** — `cells`, `forms`, and the `find(… <= STATUS_LINE_CELLS) ?? minimal` fit.
   GUARDs after it (each kills a boundary mutant): "Given a full line of exactly 80 cells,
   then it is kept whole" (n = 34); "Given a line without next of exactly 80 cells, then it
   is kept" (n = 49); "Given a 12-glyph bar and a full line of exactly 80 code points, then
   it is kept whole" (the 8/12 view with attention `working!`: 80 code points, 110 UTF-8
   bytes — the count is code points, not bytes).
7. **RED** — move every expected status string in progress.test.tsx, attention.test.tsx and
   lifecycle.test.tsx to the values listed in Context. Fails: `statusText` still builds
   today's `craft demo · planning · …` line.
8. **GREEN** — bind.ts: `legacyStatusLine` rename, the `source` dispatch in `statusText`,
   imports from ./status-line.
   GUARDs in progress.test.tsx (today's behaviour, kept by decision): "Given a bound ledger
   with no EFFECTIVE line, when a trigger runs, then the pushed line is today's
   `craft demo · planning · 1/2`, with no bar glyph and no next" (ledger: header,
   `demo workspace PHASE-START(workspace): …`, `demo workspace PHASE-DONE(workspace):
   worktree`, `demo planning PHASE-START(planning): …`); "Given a ledger-only run whose id
   pushes the old line past 80 cells, when a trigger runs, then the line is pushed whole"
   (a run id of 70+ `[a-z-]` characters held in a constant; `locateStdout` →
   `<id> /runs/<id>.md`, entries `[POINTER, { name: '<id>.md', … }]`, ledger lines prefixed
   with the id; expect the template `craft ${id} · planning · 1/2`).
9. **REFACTOR** — no helper over 20 lines, no nesting over 2, no magic strings (every
   glyph and separator a named constant); bind.ts keeps `currentPhase` for the attention
   strings only.

### Gate

```
nice -n 19 claude plugin validate .
nice -n 19 claude plugin test .
nice -n 19 bash scripts/ci.sh
grep -rniE '\b(ADR-?[0-9]+|P[0-9]+|Part\s+[0-9]+|backlog\s*#[0-9]+|DC-[0-9]+)\b' hooks/progress   # expect no output
grep -rnE '\b[RTF][0-9]+\b' hooks/progress   # expect no output
```

### Commit

`feat(progress): show the run as a segmented bar in the status line`

## Part 2 — Remove the pane, the command and the docking hook

### Context

Files this part edits or deletes:

- `hooks/progress/register.tsx` — today (221 lines): L16 `import { PANE, PANE_TITLE,
  progressPane } from './pane'`; L19 `const SHAPE = 'progress-2'`; L22–26 `COMMAND_NAME`,
  `COMMAND`; L27–36 `EMPTY` holding `isPaneOpened: false`; L43 `type Surface = { isDocked:
  boolean }`; L73–78 `openPaneOnce($, surface)`; L80–84 `bindAndRefresh($, surface)`; the
  `surface` parameter on `onTurnStart` (L106), `onSessionCompact` (L113), `onTurnComplete`
  (L125), `onAsk` (L131), `onMainLoop($, surface, e)` (L136), `onBash($, surface, e)` (L141);
  in `register` (L151): the docking comment and `const surface` (L152–154),
  `await $.command.register(COMMAND)` inside `classic.SessionStart` (L158; the handler keeps
  `onMainLoop($, e)`), `on('command.run', …)` (L206–209), `on('ui.render', { component:
  'AbovePrompt' }, …)` (L211–214), `on('ui.render', { component: 'Pane', requestId: PANE },
  …)` (L216–220). Remove all of these; `bindAndRefresh($)` keeps its two commits and loses
  the pane step; every handler call drops its `surface` argument. `SHAPE = 'progress-3'`
  (dropping a field changes the stored value's shape; an old `progress-2` value then reads
  as absent and the next trigger rebinds). `showStatus` and `commit` are unchanged.
  `register` then holds no closure state.
- `hooks/progress/bind.ts` — `UNBOUND` (L31–37): drop `isPaneOpened: false`.
- `hooks/progress/state.d.ts` — `ProgressState` (L29–38): drop `isPaneOpened: boolean`.
  `ProgressView` and the `PluginState` augmentation are unchanged.
- `hooks/progress/pane.tsx` — delete (`/usr/bin/git rm`).
- `hooks/progress/pane.test.tsx` — delete. Before deleting, copy its `PANE` fixture (L24–38,
  `component: 'Pane', requestId: 'craft-progress'`), its `BAND` fixture (L102–107,
  `component: 'AbovePrompt'`) and `docked(isFullscreen)` (L108) into lifecycle.test.tsx.
- `hooks/progress/lifecycle.test.tsx` — rig `rig(on, entries, readFails)` (L23) captures
  `spawned`, `statuses`, `logs`, `reads`. Extend the rig (D4) with `registered: string[]`
  and `opened: string[]` captures and these stubs, each registered once in the rig:
  `on('command.register', (_, e) => { registered.push(e.name); return { value: { command:
  e.name } } })`, `on('ui.open', (_, e) => { opened.push(e.id); return { value: { isPlaced:
  true } } })`, `on('ui.render', ($, e) => { const { Text } = $.ui.resolve(e); return
  <Text>engine</Text> })`, `on('classic.SessionStart', (_, e) => e)` — exactly as
  pane.test.tsx's `rig` (L45–62) does.

Read-only references: the design's "Binding changes" and "Edge behaviour" sections;
hooks/hooks.json and .claude-plugin/plugin.json (unchanged: neither names the command or
the pane).

### TDD steps

1. **RED** — lifecycle.test.tsx:
   "Given a session start, when it runs, then no command is registered" (`sut.registered`
   is `[]`). Fails: `classic.SessionStart` registers `craft-progress`.
   "Given a fullscreen AbovePrompt band was drawn, when the session binds, then no pane is
   opened" (mount `{ ...BAND, surface: 'terminal', viewport: docked(true) }`, then one
   main-loop Bash PostToolUse; `sut.opened` is `[]`). Fails: `openPaneOnce` opens
   `craft-progress`.
   "Given a bound session, when the craft-progress Pane is mounted, then the engine's own
   content renders" (`await sut.find({ type: 'Text', text: 'engine' })` defined). Fails: the
   mod's `Pane` handler renders the progress rows.
   GUARD: "Given a fullscreen band, when it mounts, then neither a status nor a pane is
   pushed by the mount" (`statuses` and `opened` both `[]`) — passes today (the handler only
   records docking) and pins that no render path pushes.
2. **GREEN** — every removal listed in Context, the `SHAPE` bump, and the deletion of
   pane.tsx and pane.test.tsx in the same commit (no `./pane` importer survives).
3. **REFACTOR** — handler bodies stay one-line delegations; no unused import
   (`PANE*`, `progressPane`), type (`Surface`) or constant (`COMMAND*`) remains:
   `grep -n "pane\|Surface\|surface\|COMMAND\|isPaneOpened\|isDocked\|AbovePrompt" hooks/progress/register.tsx hooks/progress/bind.ts hooks/progress/state.d.ts`
   prints nothing.

### Gate

```
nice -n 19 claude plugin validate .
nice -n 19 claude plugin test .
nice -n 19 bash scripts/ci.sh
grep -rn "isPaneOpened\|craft-progress\|from './pane'" hooks/   # expect hits only in lifecycle.test.tsx (the PANE fixture and the Pane test title)
grep -rniE '\b(ADR-?[0-9]+|P[0-9]+|Part\s+[0-9]+|backlog\s*#[0-9]+|DC-[0-9]+)\b' hooks/progress   # expect no output
grep -rnE '\b[RTF][0-9]+\b' hooks/progress   # expect no output
```

### Commit

`feat(progress)!: drop the progress pane and the craft-progress command`

## Part 3 — Guide subsection and its docs pin

### Context

Docs-only part (no hooks/ delta). Files this part edits:

- `test/run-progress-docs.test.js` — CommonJS, `sliceRegion` from ./helpers/region-slice
  (asserts the start heading exists: "region start … not found — heading renamed?").
  Today: `GUIDE_START = /^### Run progress — pane and status line \(Claude Code\)$/` (L15),
  `GUIDE_END = /^#{2,3} |^---$/` (L16), `GUIDE_TOKENS` (L19–25: `/craft-progress`,
  `waiting on you`, `waiting on background`, `mods`, `pipeline list unavailable`); the
  guide test (L28–32) is titled "…then it names /craft-progress, the status line, the
  attention values and that mods must be on". Change: `GUIDE_START` →
  `/^### Run progress — status line \(Claude Code\)$/`; `GUIDE_TOKENS` → `■`, `next`,
  `waiting on you`, `waiting on background`, `mods`, `craft <run-id>`
  (`pipeline list unavailable` was the pane footer's text; `craft <run-id>` is the guide's
  spelling of the ledger-only line); a `GUIDE_GONE` list `['/craft-progress', 'pane']`
  asserted absent from the slice; retitle the test to name the bar, the attention values,
  the ledger-only line and mods. `SMOKE_START`, `SMOKE_TOKENS` and the CI-workflow test are
  unchanged.
- `docs/guides/customizing.md` — the subsection L469–490
  (`### Run progress — pane and status line (Claude Code)` up to the `---` before
  `## 5. Tailor in one sitting`). Rewrite it under the heading
  `### Run progress — status line (Claude Code)`. Content: the line inside a craft run,
  `craft <bar> <done>/<total> · ▸ <phase> · next <next> · <attention>`, with a worked example
  (`craft ■■■■■▶□□□□□ 5/11 · ▸ review c2 · next refactoring · waiting on you`); the bar
  glyphs (`■` done, `▶` in progress, `□` pending), parallel phases joined with `∥`, the
  review cycle `c<n>`; `next` names the first pending phase not already shown after `▸`;
  the line fits an 80-cell budget whatever the terminal: past it `next` goes first, then the
  bar, and `<done>/<total> · ▸ <phase> · <attention>` always stays (a terminal narrower than
  80 columns may clip or wrap it); the four attention values (kept from today's text);
  a run opened before the `EFFECTIVE:` line existed shows today's
  `craft <run-id> · <phase> · <done>/<total> · <attention>` with no bar and no `next`; for
  detail, ask Claude in the chat; mods must be on (with mods off the command hooks keep
  working and only the status line is missing); read-only and fail-open (keep today's
  sentence). No `/craft-progress`, no pane. The preceding auto-compaction subsection is
  sliced by test/auto-compaction-docs.test.js up to the next `###` heading, so keep a `###`
  heading here. This file is in the living corpus: intention-lint (ci.sh) and class-A/B
  scans (no `gh`, `github`, `mutation`, `mutant`, `stryker`) apply.

Read-only references: the design's "Docs impact" table and worked-examples table.

### TDD steps

1. **RED** — test/run-progress-docs.test.js: the new `GUIDE_START`, `GUIDE_TOKENS` and the
   absent `GUIDE_GONE` assertion. Fails: `sliceRegion` finds no
   `### Run progress — status line (Claude Code)` heading.
2. **GREEN** — the customizing.md subsection rewrite.
3. **REFACTOR** — prose terse, one fact per sentence; no provenance (no ADR or requirement
   numbers) in the guide.

### Gate

```
nice -n 19 node --test test/run-progress-docs.test.js test/auto-compaction-docs.test.js test/source-hygiene.test.js test/lessons-guides.test.js
nice -n 19 bash scripts/ci.sh
```

### Commit

`docs(guides): describe the run-progress status line bar`
