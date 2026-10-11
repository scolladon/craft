# Plan — compaction-estimate-at-done

> Source: design doc `docs/contributing/design/compaction-estimate-at-done.md` · ADRs `455, 456,
> 457, 458, 459, 460, 461` (all hold the design's recommendations: D1(a) the emit-metrics bin
> prints the line; D2(a) only the call without `--phase`; D3(b) no `--session` → no stdout line
> plus one stderr note, run-level call only; D4(a) `Done` passes
> `--session "$CLAUDE_CODE_SESSION_ID"`; D5(a) one new export `formatCompactionEstimateLine`;
> D6(a) a separate `streamTranscriptFiles` call over the exact `<session>.jsonl` main entry, only
> when the line is wanted; D7(b) the `Done` final message relays the line verbatim)
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

## Plan shape (3 parts)

| # | Part | src delta | Files | Cycles |
|---|---|---|---|---|
| 1 | Core: export `formatCompactionEstimateLine` | yes | `usage-aggregate.js`, its test | 1 |
| 2 | Emitter: print the session's compaction line | yes | `metrics-emit-main.js`, its test | 3 |
| 3 | Prose: `Done` passes `--session` and relays the line; spec paragraph | no (docs only) | `skills/run/SKILL.md`, `telemetry.md` | 0 |

Part 1 is separate from Part 2 because Part 2 is already the largest unit (12 new tests, one
updated test, a restructure of `collectPhasedEvents` and `main`, three comment rewrites). Folding
the core export in would push it past the ~100-tool-call budget. Part 1 is also the pure-core
half and ships its own parity proof. Part 3 is docs-only and has no implementation part to
fold into.

Sequential parts share one working tree. Part 2 imports Part 1's export, and Part 3 documents
Part 2's behaviour.

## Public-surface decision

- `formatCompactionEstimateLine` (Part 1) is **engine-internal**. It is a module export of
  `engine/src/observability/usage-aggregate.js`, consumed only by
  `engine/src/observability/metrics-emit-main.js`. `@craft/engine` is `"private": true` and has
  no barrel, facade, generated API report or registry. No surface gate applies to the symbol.
- The private helpers Part 2 adds (`wantsCompactionLine`, `selectMainEntries`,
  `partitionEntries`, `streamEntries`, `collectTranscripts`, `reportCompactions`, the
  constants `MAIN_SOURCE_KIND` and `NO_SESSION_NOTE`) are **module-private** and not exported.
  `main(argv, io)` keeps its signature and exit codes.
- The **user-visible surface** is the emit-metrics bin's output: one new stdout line and one
  new stderr note. Its doc surfaces are `docs/contributing/specs/telemetry.md` (emitter
  paragraph) and `skills/run/SKILL.md` (`Done`). Part 3 pays both. README counts are not
  touched here; the orchestrator's readme-drift pass owns them.

## Decision candidates

- **DP1 — an empty `--session` (found while planning; the design does not decide it).**
  ADR-458 makes `Done` pass `--session "$CLAUDE_CODE_SESSION_ID"`. When that variable is unset
  (a runner that is not Claude Code following `skills/run/SKILL.md` verbatim, as the
  antigravity, cursor and codex `craft-run` pointer skills instruct, or a Claude CLI that does
  not export it), bash expands it to `--session ""`. `parseArgs` stores `''`, not `null`
  (`argv[++i] ?? null`). Proof, from a throwaway copy of `engine/src` with the design's
  emitter shape applied, on a tmp copy of the `proj` fixture plus a compacted `sess-c` (main and
  sub-agent): `main(['--run','run-x','--dir',<tree>,'--session',''])` returned exit 0 with
  stderr `''` and stdout = the `design` row, the `planning` row, and
  `Compactions: 1 (main 0, sub-agent 1) — estimated summary-call cost 9k–16k equiv (estimate; not in totals)`.
  `sessionFilter('')` treats `''` as absent, so rows and the sub-agent compactions come from
  **every** session in the project dir, while `''` passes the `!== null` check. The line
  therefore sums other sessions' compactions, breaking R2 ("never counts another session"), and
  the ADR-457 note never fires.
  - (a) Keep the design's literal shape: `parsed.session !== null` in both
    `wantsCompactionLine` and `reportCompactions`. `--session ""` prints a cross-session
    sub-agent sum and no note (above).
  - (b) Treat an empty `--session` as absent for the line. Both checks test truthiness
    (`Boolean(parsed.session)` / `!parsed.session`), the same truthiness `sessionFilter`
    already uses for rows. `--session ""` writes the skip note. One extra test (E13).
  - (c) Reject an empty `--session` as a config error (exit 1). This breaks R5 (exit codes
    unchanged), and it would drop `Done`'s rows wherever the variable is unset.
  - **Recommend (b).** The rows already treat `''` as absent, so the line and the note follow
    the same rule. R2 holds, and the forgotten-session case ADR-457 targets stays visible.

## Part 1 — Core: export formatCompactionEstimateLine

### Context

**Goal.** Add one pure export to the usage-aggregate core. It folds `CompactionEstimate[]` and
renders the exact `Compactions:` line `renderMarkdown` prints, or returns `null` for an empty
list. The emitter (Part 2) consumes it. `renderMarkdown` keeps calling the private formatter,
so both surfaces share one formatter and the wording cannot drift (ADR-459).

**Files this part edits (2):**

- `engine/src/observability/usage-aggregate.js` (edit)
- `engine/test/usage-aggregate.test.js` (edit)

Read-only reference: the design doc docs/contributing/design/compaction-estimate-at-done.md
(section Design → Core).

**usage-aggregate.js: anchors at HEAD `7014e26`:**

- `const THOUSAND = 1000;` L25. `EQUIV_WEIGHT_*` are imported from ./metrics-line.js (L9),
  with weights input 1, cacheRead 0.1, output 5.
- `function buildCompactionEstimate(compactions)` L312–317 (private). It returns `null` when
  `!compactions.length`, else
  `{ count, main, subagent, input, cacheRead, output, equiv, basis: 'estimate' }`.
- `function formatCompactionsLine({ count, main, subagent, equiv })` L623–627 (private). Its
  why-comment is L620–622. It returns
  `` `Compactions: ${count} (main ${main}, sub-agent ${subagent}) — estimated summary-call cost ${lo}k–${hi}k equiv (estimate; not in totals)` ``
  with `lo`/`hi` = `Math.round(equiv[i] / THOUSAND)`.
- `export function renderMarkdown(report)` L629. It stays unchanged and keeps calling
  `formatCompactionsLine` at L641 (the call site the design's "L641" points at).
- **Insert the new export between L627 (the closing `}` of `formatCompactionsLine`) and L629**,
  with one blank line on each side:

  ```js
  // The advisory line emit-metrics prints: same fold, same wording as report.md.
  export function formatCompactionEstimateLine(compactions) {
    const estimate = buildCompactionEstimate(compactions);
    return estimate ? formatCompactionsLine(estimate) : null;
  }
  ```

- No provenance refs (ADR/phase/part numbers) in source or test. Do not write the words
  `mutation`, `mutant` (outside the exact phrase `equivalent mutant`) or `stryker` anywhere in
  engine/src: root test/source-hygiene.test.js fails on them. Do not write `TODO`, `FIXME`,
  `STUB` or `PLACEHOLDER` either: ci's stub-lint scans touched source.

**usage-aggregate.test.js: conventions and anchors:**

- The import block is L7–16 (`aggregate, renderMarkdown, serializeReport, computeDrift, …`
  from `'../src/observability/usage-aggregate.js'`). Add `formatCompactionEstimateLine` to it.
- Fixtures: `makeEvent(overrides)` L30 (run `'run-1'`, phase `design`, role `designer`, model
  `model-a`). `makeCompaction(overrides)` L52 defaults to
  `{ run: 'run-1', sourceKind: 'main', cacheRead: 24715, input: [3000, 5500], output: [1014, 2366], summaryMissing: false }`.
  `PRICE_TABLE` is L24.
- Sections are numbered `// ── N. title ──`. The last is `// ── 76. …` at L1978, and the file
  ends at L1987. **Append after L1987** under `// ── 77. formatCompactionEstimateLine — the
  emitter's line, same fold and wording as report.md ──`.
- Each test has a Given/When/Then title, an AAA body, and `const sut = formatCompactionEstimateLine;`.

**Probed outputs** (throwaway copy of engine/src with the export applied):

| Input | Output |
|---|---|
| `[makeCompaction()]` | `Compactions: 1 (main 1, sub-agent 0) — estimated summary-call cost 11k–20k equiv (estimate; not in totals)` |
| `[]` | `null` |
| `[makeCompaction(), makeCompaction({ sourceKind: 'subagent', cacheRead: 30000, output: [600, 1400] })]` | `Compactions: 2 (main 1, sub-agent 1) — estimated summary-call cost 20k–35k equiv (estimate; not in totals)`, the same line `renderMarkdown(aggregate([makeEvent()], PRICE_TABLE, undefined, undefined, undefined, compactions))` prints |

Mutants these tests kill: the ternary forced `true` (`formatCompactionsLine(null)` throws on
destructuring) is killed by test 2; forced `false` (always `null`) is killed by tests 1 and 3.

Baseline: `npm --prefix engine test` at HEAD is green with `# tests 2786`. After this part:
`# tests 2789` (3 new).

### TDD steps

1. **RED 1**: `Given one main-loop compaction, when formatCompactionEstimateLine runs, then it
   returns the exact Compactions line`. Assert `assert.equal(sut([makeCompaction()]), 'Compactions: 1 (main 1, sub-agent 0) — estimated summary-call cost 11k–20k equiv (estimate; not in totals)')`.
   Fails today: the module has no export named `formatCompactionEstimateLine`, so the file
   fails to load (`SyntaxError: The requested module … does not provide an export named
   'formatCompactionEstimateLine'`), and every test in the file reports as failed.
2. **RED 2**: `Given no compactions, when formatCompactionEstimateLine runs, then it returns
   null`. Assert `assert.equal(sut([]), null)`. Fails for the same missing-export reason.
3. **RED 3**: `Given a main and a sub-agent compaction, when formatCompactionEstimateLine runs,
   then it equals the Compactions line renderMarkdown prints for the same compactions`.
   Arrange the two compactions from the table above. Compute
   `renderMarkdown(aggregate([makeEvent()], PRICE_TABLE, undefined, undefined, undefined, compactions)).split('\n').find((line) => line.startsWith('Compactions:'))`.
   Assert that `sut(compactions)` equals it, and that it equals the literal
   `'Compactions: 2 (main 1, sub-agent 1) — estimated summary-call cost 20k–35k equiv (estimate; not in totals)'`.
   Fails for the same missing-export reason.
4. **GREEN**: insert `formatCompactionEstimateLine` (shape above) after
   `formatCompactionsLine`. Run the gate: 2789 tests, 0 failures.
5. **REFACTOR**: none expected. Check that the function has no provenance ref and that its
   why-comment says why (it shares one formatter with report.md), not what. Re-run the gate.

### Gate

`npm --prefix engine test > /tmp/compaction-estimate-at-done-part1.txt 2>&1; tail -n 12 /tmp/compaction-estimate-at-done-part1.txt`.
Expect exit 0, `# tests 2789`, `# fail 0`. On failure,
`grep -n "^not ok" /tmp/compaction-estimate-at-done-part1.txt` and read only those ranges.

### Commit

`feat(telemetry): export the compaction estimate line formatter`

## Part 2 — Emitter: print the session's compaction line

### Context

**Goal.** At the run-level call (no `--phase`) of a named `--session`, `emit-metrics` prints one
`Compactions:` line to stdout after any rows. The line folds the compactions of that session's
sub-agent transcripts (already parsed today, then dropped) plus its main transcript
`<session>.jsonl` (never read today). The main transcript is read by a **separate**
`streamTranscriptFiles` call, only when the line is wanted, and its events are discarded, so
rows are byte-identical by construction (ADR-460). A run-level call without `--session` writes
one stderr note instead (ADR-457). A `--phase` call prints nothing new (ADR-456). Exit codes are
unchanged.

**Files this part edits (2):**

- `engine/src/observability/metrics-emit-main.js` (edit)
- `engine/test/metrics-emit-main.test.js` (edit)

Read-only references: engine/src/observability/usage-mine-main.js (`streamTranscriptFiles`
L267: signature
`(entries, transcriptDir, createReadStream, createInterface, containByRealpath, parseTranscriptLines, since = null, includeInline = true)`.
It returns `{ events, skipped, markers, unlabelled, refused, failed, compactions }`. It
realpath-checks each entry (`refused++` on a `null` containment result) and counts a throw as
`failed++`. Over `[]` it opens nothing and returns zeros and empty arrays.)
engine/src/observability/adapters/claude/discovery.js (`discover` L58: root *.jsonl →
`{ relPath: name, context: { sourceKind: 'main' } }` L67; sub-agents →
`{ relPath: '<session>/subagents/agent-*.jsonl', context: { sourceKind: 'subagent', agentType } }`
L102–105. Every entry carries a `context` object. Root names are walked in `.sort()` order.)
Fixtures: engine/test/fixtures/telemetry/compaction-main.jsonl (2 main compactions at 10:00 and
11:00 on 2026-03-01, 0 events under `includeInline: false`) and compaction-subagent.jsonl
(1 assistant event, 1 sub-agent compaction at 12:00:05).

**metrics-emit-main.js: anchors at HEAD `7014e26` (the design's refs hold):**

- Module JSDoc L1–49. Its paragraph L33–38 begins "Only sub-agent transcripts are parsed."
  It is rewritten in REFACTOR (text below).
- Imports L51–70. Add after L70:
  `import { formatCompactionEstimateLine } from './usage-aggregate.js';`. This module is a
  declared composition root (root test/architecture-boundaries.test.js
  `COMPOSITION_ROOT_FILES` L25–27), and the import targets the pure core, so the boundaries
  gate allows it.
- L73–74: the comment "The four config errors below are the only non-zero exits". L143: "The
  four config errors, resolved together". Both are stale: `resolveConfig` has **six** exits
  (missing `--run`, invalid `--run`, invalid `--phase`, unparseable `--since`, `--dir`,
  `--ledger`). Do **not** edit L73 or L143, because this part's code does not touch them.
  Fix the count only in the `main()` JSDoc, which this part rewrites anyway (below).
- `const SUBAGENT_SOURCE_KIND = 'subagent';` L91. Add right after it:
  `const MAIN_SOURCE_KIND = 'main';` and (GREEN 2)
  `const NO_SESSION_NOTE = 'metrics-emit: no --session, compaction estimate skipped\n';`.
- `parseArgs` L93–109: `session` is a string or `null` (`argv[++i] ?? null`). It is unchanged.
- `sessionFilter(sessionId)` L111–113: `relPath.startsWith(`${sessionId}/`)`, or `() => true`
  when `sessionId` is falsy. It is unchanged. It never matches a root `<session>.jsonl`
  (that relPath has no slash).
- `buildRows` L133–141: with `--phase` it always returns exactly one row (an empty slice
  renders `transcript=na`), so `rows.length === 0` happens only without `--phase`.
- `appendLedgerRows` L197–213 prints every appended row to stdout. It is unchanged.
- `async function collectPhasedEvents(parsed, transcriptDir, deps)` L241–266 is **replaced**
  by the functions below. It carries two equivalent-mutant comments, L244–251 (sub-agent
  filter and OptionalChaining) and L255–258 (`false` → `true`). Both move and get extended
  (text below).
- `main()` JSDoc L268–278 and `export async function main(argv, io)` L279–299. Today the
  early return at L292–295 skips everything after "no events found".

**Target shape (GREEN 1 to 3 build it up; the final form is shown, DP1 option (a)):**

```js
function wantsCompactionLine(parsed) {
  return parsed.phase === null && parsed.session !== null;
}

// Exact relPath, never a prefix: a session whose id merely starts with this one
// must never contribute. An empty result means no extra stream call opens a file.
function selectMainEntries(entries, parsed) {
  if (!wantsCompactionLine(parsed)) return [];
  const mainRelPath = `${parsed.session}.jsonl`;
  return entries.filter((entry) => entry.context.sourceKind === MAIN_SOURCE_KIND && entry.relPath === mainRelPath);
}

function partitionEntries(parsed, transcriptDir, { readdirSync, readFileSync, containByRealpath }) {
  const { entries } = discover(makeDiscoveryPorts(transcriptDir, { readdirSync, readFileSync, containByRealpath }));
  // (moved + extended equivalent-mutant comment block, see below)
  const subagentEntries = entries
    .filter((entry) => entry.context?.sourceKind === SUBAGENT_SOURCE_KIND)
    .filter(sessionFilter(parsed.session));
  return { subagentEntries, mainEntries: selectMainEntries(entries, parsed) };
}

function streamEntries(entries, parsed, transcriptDir, { createReadStream, createInterface, containByRealpath }) {
  // (rewritten `false` -> `true` equivalent-mutant comment, see below)
  return streamTranscriptFiles(
    entries, transcriptDir, createReadStream, createInterface, containByRealpath, parseLines, parsed.since, false,
  );
}

// (keep the L238–240 why-comment of collectPhasedEvents here, then:)
// Rows come from sub-agent events only; compactions come from both streams.
async function collectTranscripts(parsed, transcriptDir, deps) {
  const { stderr } = deps;
  const { subagentEntries, mainEntries } = partitionEntries(parsed, transcriptDir, deps);
  const subagent = await streamEntries(subagentEntries, parsed, transcriptDir, deps);
  const mainLoop = await streamEntries(mainEntries, parsed, transcriptDir, deps);
  const failed = subagent.failed + mainLoop.failed;
  const refused = subagent.refused + mainLoop.refused;
  if (failed > 0 || refused > 0) {
    stderr.write(`metrics-emit: ${failed} transcript(s) unreadable, ${refused} refused by containment\n`);
  }
  return {
    phasedEvents: subagent.events.filter((event) => event.phase !== null),
    compactions: [...subagent.compactions, ...mainLoop.compactions],
  };
}

function reportCompactions(parsed, compactions, { stdout, stderr }) {
  if (parsed.phase !== null) return;
  if (parsed.session === null) {
    stderr.write(NO_SESSION_NOTE);
    return;
  }
  const line = formatCompactionEstimateLine(compactions);
  if (line !== null) stdout.write(`${line}\n`);
}
```

and in `main`, replacing L290–298:

```js
  const { phasedEvents, compactions } = await collectTranscripts(parsed, config.transcriptDir, deps);
  const rows = buildRows(parsed.run, parsed.phase, phasedEvents);
  if (rows.length === 0) {
    stderr.write(`metrics-emit: no events found for run '${parsed.run}'\n`);
  } else {
    appendLedgerRows(config.ledgerPath, rows, deps);
  }
  reportCompactions(parsed, compactions, deps);
  return EXIT_OK;
```

The `selectMainEntries` filter form implements the design's `selectMainEntry`. It returns `[]`
when the line is not wanted, so no `undefined` guard and no extra branch are needed. Streaming
`[]` opens no file, which keeps "parsed only when wanted" (ADR-460). **DP1 option (b)**
changes exactly two expressions:
`return parsed.phase === null && Boolean(parsed.session);` in `wantsCompactionLine`, and
`if (!parsed.session) {` in `reportCompactions`. **Implement the DP1 option the decisions
checkpoint recorded. If none was recorded, implement (a), the design's literal shape above.**

**Comment texts (REFACTOR). Keep the house style `// equivalent mutant (…): why`:**

- In `partitionEntries`, move the L244–251 block verbatim above `subagentEntries` and append
  to its first item: "With `--session`, `sessionFilter`'s `<session>/` prefix also excludes
  every root-level main entry, so none reaches the compaction line through this scope. Without
  `--session`, no line prints." (Proven in the prototype: forcing the filter to `() => true`
  changed no test outcome.)
- In `streamEntries`, replace the L255–258 text with: "equivalent mutant (`false` -> `true`):
  for sub-agent entries parseLines's `isSubagent` is always true, so its
  `!isSubagent && includeInline === false` bail never reads this flag. For the session's main
  entry the flag only decides whether main-loop events get built. parseLines detects
  compactions before that bail, and collectTranscripts discards the main stream's events."
  (Proven in the prototype: flipping the flag changed no test outcome.)
- Module JSDoc: replace L33–38 with two paragraphs:
  " * Rows read sub-agent transcripts only. A main-loop transcript yields no event here twice
  over — `parseLines` bails on `includeInline: false`, and a main-loop event carries
  `phase: null` and is filtered out downstream — so narrowing before the parse makes the
  one-row-per-agent-spawned-phase contract structural rather than incidental, and drops the
  realpath chain and full stream-parse each discarded entry would otherwise cost."
  and
  " * The one main-loop transcript ever read is the named session's own `<session>.jsonl`,
  matched exactly, on the run-level call (no `--phase`) only, and only for its compactions.
  They feed one advisory `Compactions:` line printed after the rows. Its events are
  discarded, so it never adds a row. A run-level call without `--session` skips the line with
  one stderr note, because a forgotten flag must stay visible."
  Wrap at about 80 columns like the neighbouring lines.
- `main()` JSDoc: keep the `@param` block. Change `@returns` to "0 on every advisory path; 1
  for the six config errors caught before any I/O (a missing or malformed --run, a malformed
  --phase, an unparseable --since, an out-of-bounds --dir or --ledger)." Add one sentence above
  `@param`: "Prints the appended rows, then, on a run-level call naming --session, the
  session's advisory compaction line."
- No provenance refs. Do not write `mutation`, `stryker`, or `mutant` outside the exact phrase
  `equivalent mutant` (root test/source-hygiene.test.js). Do not write `TODO`, `STUB` or
  `PLACEHOLDER` (stub-lint). Every new function stays under 20 lines, with nesting of at most 2.

**metrics-emit-main.test.js: conventions and anchors:**

- The fs import block is L10–18 (`mkdtempSync, writeFileSync, readFileSync, createReadStream,
  rmSync, mkdirSync, cpSync`). Add `existsSync`. `join, dirname` come from `node:path` (L20),
  and `fileURLToPath` from L22.
- Helpers: `makeTmp(prefix)` L34; `makeIo(overrides)` L40 (spreads `makeCaptureIo()` from
  engine/test-helpers/capture-io.js, which gives `io.stdout.writes`/`io.stderr.writes` arrays
  and `.joined()`, plus real fs ports and `containByRealpath`; override any port);
  `ledgerPathFor(repoRoot)` L53; `readLedger(repoRoot)` L57; `runRows(repoRoot)` L61 (ledger
  lines starting `run-x `); `copyProjFixture()` L65 → `{ projectsRoot, transcriptDir }` (a tmp
  copy of fixtures/telemetry/projects/proj: sess-a.jsonl main with no compactions,
  sess-a/subagents/agent-good labelled `craft:designer` → one `design` row, plus
  bad/no-sidecar/no-type spawns that yield no row); `addReviewerSpawn` L87.
- New helpers go right after `addReviewerSpawn` (after L90), and stay pure (no shared
  mutable state):

  ```js
  const TELEMETRY_FIXTURE_DIR = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'telemetry');
  const SKIP_NOTE = 'metrics-emit: no --session, compaction estimate skipped\n';

  // Scoping is by path, so the fixture lines' own sessionId (sess-compact) is irrelevant.
  function addCompactedSession(transcriptDir, sessionId) {
    const subagentsDir = join(transcriptDir, sessionId, 'subagents');
    mkdirSync(subagentsDir, { recursive: true });
    cpSync(join(TELEMETRY_FIXTURE_DIR, 'compaction-main.jsonl'), join(transcriptDir, `${sessionId}.jsonl`));
    cpSync(join(TELEMETRY_FIXTURE_DIR, 'compaction-subagent.jsonl'), join(subagentsDir, 'agent-c.jsonl'));
    writeFileSync(join(subagentsDir, 'agent-c.meta.json'), JSON.stringify({ agentType: 'craft:planner' }), 'utf8');
  }

  function compactionLines(io) {
    return io.stdout.writes.filter((write) => write.startsWith('Compactions:'));
  }
  ```

  For an open-spy, override `createReadStream` in `makeIo`:
  `createReadStream: (path) => { opened.push(String(path)); return createReadStream(path); }`.
  The paths it sees are realpaths (`/private/var/…` on macOS), so match by suffix or by
  `includes('/subagents/')`, never by equality with `transcriptDir`.
- Sections are numbered `// ── N. … ──`. The last is `// ── 18. …` at L502, and the file ends at
  L516. Append the new tests after L516 under `// ── 19. the run-level call prints the session's
  compaction estimate line ──` (E1–E3, E6–E10, E12, E13) and `// ── 20. the skip note and the
  summed advisory counts ──` (E4, E5, E11), or one section per cycle, as you prefer. Every
  test has a Given/When/Then title, an AAA body and `const sut = main;`. Never use
  ADR/phase/backlog refs.
- **Existing test to update** (L504–516, `Given no --phase flag and a transcript dir with no
  labelled events at all…`): its exact stderr expectation at L515 becomes
  `"metrics-emit: no events found for run 'run-x'\nmetrics-emit: no --session, compaction estimate skipped\n"`.
  No other existing test asserts exact stdout or stderr on a run-level call without `--session`.
  engine/test/metrics-emit.bin.test.js and root test/emit-metrics-script.test.js use `includes`
  or `match`, so they stay green.

**Expected lines (probed by parsing the committed fixtures with the current `parseLines` and
the Part 1 fold):**

| Compactions folded | Line |
|---|---|
| sess-c main 2 + sub-agent 1 | `Compactions: 3 (main 2, sub-agent 1) — estimated summary-call cost 32k–60k equiv (estimate; not in totals)` |
| sub-agent only | `Compactions: 1 (main 0, sub-agent 1) — estimated summary-call cost 9k–16k equiv (estimate; not in totals)` |
| main only | `Compactions: 2 (main 2, sub-agent 0) — estimated summary-call cost 23k–45k equiv (estimate; not in totals)` |
| `--since 2026-03-01T10:30:00.000Z`: main 1 + sub-agent 1 | `Compactions: 2 (main 1, sub-agent 1) — estimated summary-call cost 22k–41k equiv (estimate; not in totals)` |

**Prototype evidence.** In a throwaway copy of engine/ with the target shape and E1–E12
applied, the file ran 36/36 green, with the L504 expectation updated. Against HEAD's emitter,
E1, E2, E4, E7–E11 fail, and E3, E5, E6, E12 pass (hence their GUARD labels). Mutants checked
by hand: relPath equality forced `true` is killed by E7 (count 5). Under the filter form, E1
does not kill it, because sess-a.jsonl holds no compaction. `sourceKind === MAIN_SOURCE_KIND`
forced `true` is killed by E12. `parsed.phase === null` forced `true` and `&&`→`||` are killed
by E3. `parsed.session !== null` forced `true` is killed by E4's open-spy (it selects
null.jsonl). The sub-agent filter forced `() => true` and the `false`→`true` flag are
equivalent (comments above). Without its null.jsonl arrangement, E4 does not kill the
`session !== null` mutant.

Baseline after Part 1: `# tests 2789`. After this part: `# tests 2801` (12 new), or 2802
under DP1(b) (E13).

### TDD steps

Cycle 1: the line (GREEN 1).

1. **RED E1**: `Given a session whose main and sub-agent transcripts both compacted, when the
   run-level call names it with --session, then the last stdout line is the session's
   Compactions estimate and stderr stays empty`. `copyProjFixture()` +
   `addCompactedSession(transcriptDir, 'sess-c')`; argv
   `['--run','run-x','--dir',transcriptDir,'--session','sess-c']`. Assert exit 0,
   `io.stdout.writes.at(-1)` equals the 3-compaction line + `\n`, and
   `io.stderr.joined() === ''`. Fails today: the main transcript is never read and the
   sub-agent compactions are dropped, so stdout carries only the `planning` row.
2. **RED E2**: `Given two trees that differ only by the session's main transcript, when the
   run-level call runs on each, then both ledgers are byte-identical and only the trailing
   Compactions line differs`. Build two `copyProjFixture()` trees, both with
   `addCompactedSession(…, 'sess-c')`, and `rmSync(join(transcriptDir, 'sess-c.jsonl'))` in the
   second. Use two repo roots. Assert `readLedger(repoA) === readLedger(repoB)`, that
   `ioA.stdout.writes.slice(0, -1)` deep-equals `ioB.stdout.writes.slice(0, -1)`, and that
   `ioB.stdout.writes.at(-1)` is the sub-agent-only line + `\n`. Fails today: no
   `Compactions:` write exists, so `.at(-1)` is the row.
3. **GUARD E3**: `Given --phase and --session, when main runs, then no Compactions line prints,
   no skip note prints and the session's main transcript is never opened`. Tree with sess-c,
   open-spy on `createReadStream`, argv
   `['--run','run-x','--phase','planning','--dir',transcriptDir,'--session','sess-c']`. Assert
   `compactionLines(io)` deep-equals `[]`, no opened path ends with `sess-c.jsonl`, stderr does
   not include `compaction estimate skipped`, and `runRows(repoRoot)[0]` matches
   `/^run-x planning /`. It passes today because nothing reads main transcripts or prints a
   line. After GREEN 1 it kills `phase === null`→`true`, `&&`→`||`, and the
   `reportCompactions` phase guard forced off (which would print the sub-agent-only line).
4. **GUARD E6**: `Given a named session with no compaction, when the run-level call runs, then
   stdout carries the appended rows only and stderr stays empty`. `copyProjFixture()` only;
   `--session sess-a`. Assert `io.stdout.writes` deep-equals
   `runRows(repoRoot).map((row) => `${row}\n`)`, and `io.stderr.joined() === ''`. It passes
   today (rows only). After GREEN it pins R3 and kills `line !== null`→`true` (that would
   write `null\n`).
5. **RED E7**: `Given sess-c and sess-cc both compacted, when the run-level call names sess-c,
   then only sess-c's compactions are counted`. `addCompactedSession` for both. Assert
   `compactionLines(io)` deep-equals `[<3-compaction line>\n]`. Fails today: no line. A
   prefix filter (`startsWith`) would give count 5. (The design said 6, but sess-cc's
   sub-agent is excluded by `sessionFilter`'s `sess-c/`.)
6. **RED E8**: `Given only the session's main transcript and no sub-agent of that session, when
   the run-level call runs, then it reports no events, writes no ledger, and still prints the
   main-only Compactions line`. `copyProjFixture()` +
   `cpSync(<fixture>/compaction-main.jsonl, join(transcriptDir, 'sess-c.jsonl'))`. Assert exit
   0, `io.stderr.joined() === "metrics-emit: no events found for run 'run-x'\n"`,
   `io.stdout.writes` deep-equals `[<main-only line>\n]`, and
   `existsSync(ledgerPathFor(repoRoot)) === false`. Fails today: stdout is empty (the early
   return, and the main transcript is never read).
7. **RED E9**: `Given --since between the two main-loop compactions, when the run-level call
   runs, then the line counts only boundaries at or after it`. sess-c tree; argv adds
   `'--since','2026-03-01T10:30:00.000Z'`. Assert `compactionLines(io)` deep-equals
   `[<since line>\n]`. Fails today: no line.
8. **GUARD E12**: `Given a --session naming a sub-agent transcript path, when the run-level call
   runs, then no Compactions line prints`. sess-c tree; `--session sess-c/subagents/agent-c`.
   Assert exit 0 and `compactionLines(io)` deep-equals `[]`. It passes today (no line ever).
   After GREEN it kills `entry.context.sourceKind === MAIN_SOURCE_KIND` forced `true`: that
   sub-agent entry's relPath equals `sess-c/subagents/agent-c.jsonl` and would print the
   sub-agent-only line.
9. **GREEN 1**: add the import, `MAIN_SOURCE_KIND`, `wantsCompactionLine`,
   `selectMainEntries`, `partitionEntries`, `streamEntries` and `collectTranscripts`. For now
   the advisory line keeps `subagent.failed`/`subagent.refused` alone, as today. Add
   `reportCompactions` with `if (parsed.session === null) return;` (no note yet). Restructure
   `main` as shown. Delete `collectPhasedEvents`. E1, E2, E7, E8, E9 go green, and E3, E6, E12
   stay green. The existing L504 test still passes unchanged at this step.

Cycle 2: the skip note (GREEN 2).

10. **RED (updated existing test, L504–516)**: change its exact stderr expectation to
    `"metrics-emit: no events found for run 'run-x'\nmetrics-emit: no --session, compaction estimate skipped\n"`.
    Fails after GREEN 1: no note is written, so stderr is the no-events line alone.
11. **RED E4**: `Given no --session, when the run-level call runs, then no Compactions line
    prints, no main transcript is opened, and stderr carries the skip note`. sess-c tree plus
    `cpSync(<fixture>/compaction-main.jsonl, join(transcriptDir, 'null.jsonl'))`. The
    `null.jsonl` is what the `session !== null`→`true` mutant would select. Open-spy; argv
    `['--run','run-x','--dir',transcriptDir]`. Assert `compactionLines(io)` deep-equals `[]`,
    `io.stderr.writes.includes(SKIP_NOTE)`, and
    `opened.length > 0 && opened.every((path) => path.includes('/subagents/'))`. Fails after
    GREEN 1: the note is missing.
12. **GUARD E5**: `Given --phase and no --session, when main runs, then no skip note is written`.
    `copyProjFixture()`, argv `['--run','run-x','--phase','design','--dir',transcriptDir]`.
    Assert exit 0 and `io.stderr.joined() === ''`. It passes after GREEN 1 (the phase guard
    returns first). It pins ADR-457's "run-level call only" and, after GREEN 2, kills the
    phase guard forced off on the no-session path.
13. **RED E13 (DP1(b) only; skip under (a))**: `Given an empty --session, when the run-level
    call runs, then no Compactions line prints and stderr carries the skip note`. sess-c tree,
    `'--session', ''`. Assert `compactionLines(io)` deep-equals `[]` and
    `io.stderr.writes.includes(SKIP_NOTE)`. Fails after GREEN 1: no skip note is written (and
    if GREEN 1 kept the `=== null` form, a cross-session sub-agent-only line also prints).
14. **GREEN 2**: add `NO_SESSION_NOTE` and make the session branch write it before returning.
    Under DP1(b), switch the two checks to truthiness. Updated L504, E4 (and E13) go green, and
    E5 stays green.

Cycle 3: one advisory line for both streams (GREEN 3).

15. **RED E10**: `Given the session's main transcript refused by containment, when the run-level
    call runs, then the advisory counts one refusal and the line carries the sub-agent
    compaction only`. sess-c tree; `containByRealpath: (root, candidate) =>
    (String(candidate).endsWith('sess-c.jsonl') ? null : containByRealpath(root, candidate))`.
    Assert `io.stderr.joined() === 'metrics-emit: 0 transcript(s) unreadable, 1 refused by containment\n'`
    and `compactionLines(io)` deep-equals `[<sub-agent-only line>\n]`. Fails after GREEN 2:
    the main stream's `refused` is dropped, so stderr is empty.
16. **RED E11**: `Given both the main and the sub-agent transcript of the session unreadable,
    when the run-level call runs, then one advisory line sums both failures`. sess-c tree;
    `createReadStream: (path) => { if (/(sess-c|agent-c)\.jsonl$/.test(String(path))) throw new Error('EIO'); return createReadStream(path); }`.
    Assert
    `io.stderr.joined() === "metrics-emit: 2 transcript(s) unreadable, 0 refused by containment\nmetrics-emit: no events found for run 'run-x'\n"`
    and `io.stdout.writes` deep-equals `[]`. Exact equality also pins "written once" and kills
    `+`→`-` (it would give `0`, and no line). Fails after GREEN 2: stderr starts
    `metrics-emit: 1 transcript(s) unreadable`.
17. **GREEN 3**: sum `failed`/`refused` across both streams into the single existing advisory
    write, with the wording unchanged. E10 and E11 go green.
18. **REFACTOR**: write the comment texts above (module JSDoc, `main()` JSDoc with "six",
    the moved and extended equivalent-mutant comments). Check that every function is at most
    20 lines with nesting at most 2, and that there are no `deps.x.y` chains (destructure).
    Grep the diff for `ADR-`, `mutation`, `stryker`, `TODO`. Re-run the gate.

### Gate

`npm --prefix engine test > /tmp/compaction-estimate-at-done-part2.txt 2>&1; tail -n 12 /tmp/compaction-estimate-at-done-part2.txt`.
Expect exit 0, `# tests 2801` (2802 under DP1(b)), `# fail 0`. On failure,
`grep -n "^not ok" /tmp/compaction-estimate-at-done-part2.txt` and read only those ranges.
Also run the boundaries gate: `node --test test/architecture-boundaries.test.js > /tmp/compaction-estimate-at-done-part2-arch.txt 2>&1; tail -n 8 /tmp/compaction-estimate-at-done-part2-arch.txt`
(expect `# fail 0`), and the hygiene scan:
`node --test test/source-hygiene.test.js > /tmp/compaction-estimate-at-done-part2-hyg.txt 2>&1; tail -n 8 /tmp/compaction-estimate-at-done-part2-hyg.txt`
(expect `# fail 0`).

### Commit

`feat(telemetry): print the session compaction estimate line from emit-metrics`

## Part 3 — Prose: Done passes --session and relays the line

### Context

**Goal.** Make the run skill's `Done` pass the session id to every `emit-metrics` call
(ADR-458), and have the final message relay the `Compactions:` line verbatim when one was
printed (ADR-461). Update the telemetry spec's emitter paragraph to the rows/compactions split
and describe the advisory line. This part is docs-only, with no src/ delta.

**Files this part edits (2):**

- `skills/run/SKILL.md` (edit)
- `docs/contributing/specs/telemetry.md` (edit)

Read-only reference: the design doc (section Design → Run skill `Done`, Spec).

**Adapter mirrors: none to edit.** adapters/antigravity/skills/craft-run/SKILL.md,
adapters/cursor/skills/craft-run/SKILL.md and
adapters/codex/plugins/craft-codex/skills/craft-run/SKILL.md are 22–24-line pointer skills
("Follow `skills/run/SKILL.md` in this repository verbatim"). They do not copy its text, and
none mentions `emit-metrics`. scripts/sync-adapter-agents.sh (run by
scripts/static-lints.sh as `--check`) mirrors only agents/*.md bodies into
`adapters/<adapter>/agents/craft-<role>.md`, never skills. So no mirror drifts.

**`skills/run/SKILL.md`: anchors at HEAD `7014e26`:**

- `## Done` starts at L543.
- The "Metrics ledger" paragraph is **L574–583**. The design said L574–582: it ends one line
  later, on the learnings-store path. Edit it diff-minded, in four places, leaving every other
  word as it is:
  1. L575, the once-per-run command: append ` --session "$CLAUDE_CODE_SESSION_ID"` right after
     `--run <run-id>`, inside the same backtick span, so it reads
     `bash "${CRAFT_ROOT:-${CLAUDE_PLUGIN_ROOT}}/scripts/emit-metrics.sh" --run <run-id> --session "$CLAUDE_CODE_SESSION_ID"`.
  2. L577, after "and prints what it appended.", insert: "When this session compacted, it
     then prints one advisory line,
     `Compactions: <n> (main <m>, sub-agent <s>) — estimated summary-call cost <lo>k–<hi>k equiv (estimate; not in totals)`
     — stdout only, never a ledger row."
  3. L579, the per-phase call span `--phase <phase-id> --since <iso8601>` becomes
     `--phase <phase-id> --since <iso8601> --session "$CLAUDE_CODE_SESSION_ID"`.
  4. L581, "row re-counts the first run of that phase." becomes "row re-counts the first run
     of that phase; a `--phase` call never prints the `Compactions:` line."
  Re-wrap the touched lines at about 90 columns like the neighbours.

- "Final message" is **L588–589**. The design said L589–590. Replace it with:
  "Final message: the PR URL (or branch name if no remote) + one-line summary + the run
  record + the `Compactions:` line verbatim when the run-level `emit-metrics` call printed
  one."
- **Pinned by root tests; keep them green:**
  - test/craft-root-shim.test.js L29 expects **exactly 9** occurrences of
    `${CRAFT_ROOT:-${CLAUDE_PLUGIN_ROOT}}/` in this file. Keep the one shimmed command in the
    paragraph and add no other.
  - test/run-record.test.js L297–302: the `## Done` region must contain
    scripts/emit-metrics.sh and `--run`. L304–310: it must **not** contain the segment "subagents/",
    `toolUseId` or `message.id`. Write "sub-agent", never a path.
  - test/decision-tokens.test.js L50 (`MEMORY-RETRACT` rule in Done) and the token tests: no
    edit near them.
- `skills/run/SKILL.md` is touched *.md outside docs/contributing, so ci's prose-lint scans
  it (advisory). Avoid `delve`, `leverage`, `seamless`, `robust`.

**`docs/contributing/specs/telemetry.md`: anchors at HEAD `7014e26`:**

- "**Emitter flags**" paragraph L710–719. Replace only its last sentence (L716–719, "Only
  sub-agent transcripts are parsed — a main-loop transcript is narrowed out before the parse,
  since it carries no phase label and would be filtered out downstream anyway.") with:
  "Rows read sub-agent transcripts only — a main-loop transcript is narrowed out of the row
  parse, since it carries no phase label and would be filtered out downstream anyway. The one
  main-loop transcript ever read is the named session's own `<session>.jsonl` (matched
  exactly, never by prefix), on a run-level call only, and only for its compactions; it adds
  no event and no row."
- Insert one new paragraph right after it (before "Config errors (exit 1, …" at L721):

  ```markdown
  **Compaction estimate line.** A run-level call (no `--phase`) that names `--session` folds
  every compaction of that session — its main transcript and its sub-agent transcripts, each
  boundary gated by `--since` on its own timestamp — and, when there is at least one, prints
  one line to stdout after any rows: the same `Compactions:` line the miner's markdown report
  renders under "Per run (`runs[*]`)" above, from the same formatter. It prints even when no
  row does. It is advisory: never written to the metrics ledger, never in totals, drift or the
  baseline, and exit codes are unchanged. A `--phase` call never prints it. A run-level call
  without `--session` prints no line and writes one stderr note,
  `metrics-emit: no --session, compaction estimate skipped`. This is the `emit-metrics` option
  ADR-382 left for later, taken by ADR-455.
  ```

  Under DP1(b), add to the note sentence: "(an empty `--session` counts as absent)".
- The "Unreadable transcripts…" paragraph (L733–735) stays as it is. The summed count keeps
  its wording.
- The spec lies in the source-hygiene scanned set (root test/source-hygiene.test.js): do not
  write `mutation`, `mutant` or `stryker`. It also lies in the living corpus, so ci runs
  engine/bin/intention-lint.js over it. Today it passes (`craft-intention: OK`); do not add
  `INTENTION-*` tokens. ADR references are fine in specs (the file already cites ADR-186,
  ADR-328, etc.).

### TDD steps

1. **GUARD (docs part, no new tests)**: the root process tests that pin `skills/run/SKILL.md`
   pass before the edit and must pass after it: test/run-record.test.js (Done names
   `scripts/emit-metrics.sh` and `--run`, no `subagents/`/`toolUseId`/`message.id`),
   test/craft-root-shim.test.js (9 shimmed occurrences), test/decision-tokens.test.js,
   test/gate-token.test.js, test/intention-token.test.js, test/hygiene-gates-ci.test.js. They
   pass because the edit keeps every pinned string and adds no shimmed path.
2. **GREEN (prose)**: apply the SKILL.md paragraph and final-message replacements, then the
   telemetry.md sentence replacement and the new paragraph. Keep the diff to those ranges.
3. **REFACTOR**: re-read both edits against Part 2's actual behaviour (the line follows the
   rows; the note only on the run-level call; under DP1(b), an empty `--session` counts as
   absent). Check line wrapping matches the neighbours and that no README count changed.

### Gate

`node --test $(find test -name '*.test.js' | sort) > /tmp/compaction-estimate-at-done-part3.txt 2>&1; tail -n 12 /tmp/compaction-estimate-at-done-part3.txt`
(expect `# fail 0`; on failure `grep -n "^not ok" /tmp/compaction-estimate-at-done-part3.txt`),
then `bash scripts/static-lints.sh > /tmp/compaction-estimate-at-done-part3-lints.txt 2>&1; echo "exit=$?"; tail -n 15 /tmp/compaction-estimate-at-done-part3-lints.txt`
(expect `exit=0`), then
`node engine/bin/intention-lint.js docs/contributing/specs/telemetry.md` (expect
`craft-intention: OK`).
Phase gate (orchestrator, after this part):
`bash scripts/ci.sh > /tmp/compaction-estimate-at-done-ci.txt 2>&1; tail -n 20 /tmp/compaction-estimate-at-done-ci.txt`.

### Commit

`docs(run): relay the emit-metrics compaction line at Done`
