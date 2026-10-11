# Design — compaction-estimate-at-done

> Brief: print one advisory `Compactions:` line at a craft run's `Done`, reusing the miner's
> formatter, so a run's estimated compaction cost is visible without mining by hand.
> Status: draft → self-reviewed ×3

## Context

ADR-382 put the compaction-cost estimate in the miner report only (`runs[*].compactionEstimate`,
rendered by `report.md` as one `Compactions:` line). It named a third option and left it for
later: "one advisory line from `emit-metrics` at `Done`". This design takes that option. It does
not reopen options 1 and 2. Nothing reaches `.claude/craft-metrics.md`, totals, drift or the
baseline (ADR-369 comparability). The estimate formula is unchanged.

What exists today:

- `engine/src/observability/usage-aggregate.js` (pure core) holds two private functions:
  `buildCompactionEstimate(compactions)` (L312) folds `CompactionEstimate[]` into
  `{ count, main, subagent, input, cacheRead, output, equiv, basis }`, or `null` when the list is
  empty. `formatCompactionsLine({ count, main, subagent, equiv })` (L623) renders
  `Compactions: N (main M, sub-agent S) — estimated summary-call cost Xk–Yk equiv (estimate; not in totals)`.
  `renderMarkdown` (L641) is the only caller of the formatter.
- `parseLines` (`adapters/claude/telemetry.js`) detects compactions right after the `since`
  filter, before the `includeInline` skip. So an `includeInline: false` parse of a main-loop
  transcript returns compactions and zero events.
- `emit-metrics` (`scripts/emit-metrics.sh` → `engine/bin/metrics-emit.js` →
  `engine/src/observability/metrics-emit-main.js` `main(argv, io)`) narrows the discovered
  entries to `context.sourceKind === 'subagent'`, then applies `sessionFilter(--session)`
  (`relPath.startsWith('<session>/')`). It calls `streamTranscriptFiles(..., parseLines, since, false)`.
  That call already returns `compactions`, and `collectPhasedEvents` (L241) drops them.
  **The session's main transcript (`<session>.jsonl`) is never read**, so the orchestrator's own
  compactions are invisible to it. `sessionFilter` would not match that file anyway: its relPath
  has no `/`.
- Without `--session`, discovery covers every session in the project dir.
- The run skill's `Done` (`skills/run/SKILL.md` L574–582) calls
  `emit-metrics.sh --run <run-id>` once, with **no `--session`**. It adds one
  `--phase X --since <iso>` call per phase that ran twice.

**Pinned empirically** (CLI 2.1.296, read-only except one throwaway `claude -p` in a `mktemp`
dir, whose transcript was deleted afterwards):

| Probe | Observed |
|---|---|
| `printenv CLAUDE_CODE_SESSION_ID` in a top-level `claude -p` Bash call | equals the JSON result's `session_id`; transcript at `<projects>/<dashed-cwd>/<id>.jsonl` |
| same in a sub-agent's Bash call | the **parent** session id; the sub-agent's transcript is `<id>/subagents/agent-*.jsonl` |
| `CLAUDE_JOB_DIR` basename in a background job | differs from the session id (the trap recorded in the user's notes) |
| `sessionId` on sub-agent transcript lines | the parent session id |
| real probe-run session, main transcript, `includeInline: false` | 0 events, 1 compaction (`main`, preTokens 41684) — today invisible to `emit-metrics` |
| real probe-run session, 1 sub-agent transcript | 7 events, 3 compactions (`subagent`) — today parsed by `emit-metrics`, then dropped |

## Requirements

- R1. When a session's transcripts hold at least one compaction, the run-level `emit-metrics` call
  prints exactly one line to stdout, after any rows. The line is byte-identical to what
  `renderMarkdown` prints for the same compactions.
- R2. The line counts main-loop and sub-agent compactions of the `--session` session only. It
  never counts another session, including one whose id has `--session` as a prefix.
- R3. With `--session` given and no compaction in that session → no line and no stderr text
  about it.
- R4. Ledger rows are byte-identical to today's for every invocation. The main transcript adds
  no event and no row.
- R5. Exit codes are unchanged: 0 on every advisory path, 1 on the existing config errors.
- R6. The line goes to stdout only. It is never written to `.claude/craft-metrics.md`, totals,
  drift or the baseline.
- R7. `--since` gates the compactions the same way it gates events (by each boundary's own
  timestamp).

## Design

**Core — one new pure export** in `usage-aggregate.js`, next to `formatCompactionsLine` (D5):

```js
// The advisory line emit-metrics prints: same fold, same wording as report.md.
export function formatCompactionEstimateLine(compactions) {
  const estimate = buildCompactionEstimate(compactions);
  return estimate ? formatCompactionsLine(estimate) : null;
}
```

`renderMarkdown` keeps calling the private `formatCompactionsLine`. Both surfaces share one
formatter, so the wording cannot drift.

**Emitter — `metrics-emit-main.js`** (D1, D2, D3, D6):

```
main()
  config ─► collectTranscripts ─► { phasedEvents, compactions }
                │  subagent entries (session-filtered) ─► streamTranscriptFiles (unchanged call) ─► events + sub-agent compactions
                │  main entry <session>.jsonl, only if wantsCompactionLine(parsed)
                │                                    ─► streamTranscriptFiles([main], …, false) ─► compactions only (events discarded)
  rows ─► appendLedgerRows   |  or "no events found" on stderr (both unchanged)
  reportCompactions(parsed, compactions, deps)   ◄── new, runs after either branch
  return EXIT_OK
```

- `wantsCompactionLine(parsed)` is `parsed.phase === null && parsed.session !== null`. The
  `--phase X --since` calls never print a line, so the line appears once per run (D2).
- Main entry selection works on the discovered entries, never on a built path:
  `entry.context.sourceKind === 'main' && entry.relPath === \`${session}.jsonl\``
  (`discover` always attaches a `context`, so no optional chaining). Exact
  equality rules out the prefix case (R2). Containment stays in `streamTranscriptFiles`
  through `containByRealpath`, as it does today.
- `discover` runs once. Its entries are partitioned into the existing sub-agent scope and the
  optional main entry.
- `failed`/`refused` from the main-entry call are summed into the existing advisory line
  (`<n> transcript(s) unreadable, <m> refused by containment`). Its wording is unchanged.
- `reportCompactions`:
  - `--phase` set → no output.
  - no `--session`, no `--phase` → one stderr line,
    `metrics-emit: no --session, compaction estimate skipped` (D3).
  - otherwise `formatCompactionEstimateLine(compactions)` → when non-null,
    `stdout.write(line + '\n')`.
- `main()` restructure: the `rows.length === 0` early return becomes an if/else, so the
  compaction line still prints when there are no rows (an all-inline run can still compact).
  `main` stays under 20 lines.
- Comments to update:
  - the module JSDoc paragraph "Only sub-agent transcripts are parsed" (L33–38): rows read
    sub-agent transcripts only, and the session's main transcript is read for compactions only;
  - the `main()` JSDoc.
  The equivalent-mutant notes at L244–258 stay accurate, because the sub-agent call is
  unchanged. The main-entry call passes `includeInline: false` only to skip building events
  it discards. A `false → true` mutant there is therefore equivalent, and that needs one
  comment in the existing house style.

**Run skill `Done`** (D4, D7): the once-per-run call becomes
`emit-metrics.sh --run <run-id> --session "$CLAUDE_CODE_SESSION_ID"`. The `--phase … --since`
calls also get `--session`. The final message adds the `Compactions:` line verbatim when one was
printed. This also scopes rows to this session, which the prose already claims ("this session's
sub-agent transcripts"). Today the bin only does that when the caller adds `--session` by hand.

**Spec** — `docs/contributing/specs/telemetry.md`, "Emitter flags" paragraph (L710–719):
replace "Only sub-agent transcripts are parsed…" with the rows/compactions split above, and add
one paragraph for the advisory line (when it prints, where, and that it refines ADR-382 option 3).

**Parts and pre-chewed context**

- **P1 — core export.**
  - Code: `engine/src/observability/usage-aggregate.js`. Add `formatCompactionEstimateLine`
    after `formatCompactionsLine` (L623–627). It reuses `buildCompactionEstimate` (L312) and
    `THOUSAND` (L25).
  - Tests: `engine/test/usage-aggregate.test.js`. Extend the import block (L6–16). Append after
    the last test (L1980–1987). Use `makeCompaction(overrides)` (L52) and the `aggregate`/
    `renderMarkdown` imports already present.
- **P2 — emitter.**
  - Code: `engine/src/observability/metrics-emit-main.js`. Change `collectPhasedEvents`
    (L241–266) into `collectTranscripts` returning `{ phasedEvents, compactions }`. Add
    `wantsCompactionLine`, `selectMainEntry` and `reportCompactions`. Restructure `main`
    (L279–299). Import `formatCompactionEstimateLine` from `./usage-aggregate.js`. This module
    is a declared composition root (`test/architecture-boundaries.test.js`
    `COMPOSITION_ROOT_FILES`, L25), and importing the pure core is allowed.
  - Tests: `engine/test/metrics-emit-main.test.js`. Helpers to reuse: `makeIo`, `makeTmp`,
    `copyProjFixture` (L65), `runRows`, `readLedger`. Add one helper,
    `addCompactedSession(transcriptDir, sessionId)`. It copies
    `fixtures/telemetry/compaction-main.jsonl` to `<sid>.jsonl` and
    `compaction-subagent.jsonl` to `<sid>/subagents/agent-c.jsonl`, plus a
    `{"agentType":"craft:planner"}` sidecar. The fixture lines' own `sessionId`
    (`sess-compact`) is irrelevant, because scoping is by path.
- **P3 — prose.** Edit `skills/run/SKILL.md` `Done` → "Metrics ledger" paragraph (L574–582) and
  "Final message" (L589–590), plus the `telemetry.md` paragraph above. README counts are not
  touched here.

## Decision candidates

- **D1 — where the line is printed.**
  - (a) The `emit-metrics` bin prints it after the rows. This is an engine change, unit-tested,
    and needs the main-transcript compaction parse.
  - (b) The `Done` prose has the orchestrator run `mine-transcripts.sh` and grep the
    `## Run: <session>` block's `Compactions:` line. There is no engine change, but the miner
    has no `--session` flag: it re-parses every session in the project dir (165 MB here). It
    also writes `report.json`/`report.md` into the repo root, the result depends on the LLM
    following the prose, and nothing is tested.
  - (c) A separate bin (`compaction-estimate --session <id>`) and a second `Done` call. It is
    testable, but it adds a third composition root and a second discovery/stream wiring for one
    line.
  - **Recommend (a).** It is the option ADR-382 names, it reuses the discovery and stream path
    `emit-metrics` already owns, and the sub-agent half of the data is already in hand.
- **D2 — which invocation prints when `emit-metrics` runs several times at `Done`.**
  - (a) Only the call without `--phase`, which is the once-per-run call.
  - (b) Every call, so a `--phase X --since` call prints a partial, `since`-cut figure next to
    the full one.
  - (c) A new opt-in flag (`--compactions`) passed only on the once-per-run call. It is
    explicit, but it adds a flag and one more thing the prose must remember.
  - **Recommend (a).** It matches the existing call pattern with no new surface.
- **D3 — behaviour without `--session`.**
  - (a) Print nothing, silently.
  - (b) Print nothing on stdout and one stderr line naming the skipped estimate.
  - (c) Fold across all sessions in the dir, either one line per `run` (sessionId) or one
    summed line. This sums unrelated runs, which is the same defect the rows have today.
  - **Recommend (b).** A forgotten `--session` is the most likely way the line goes missing, and
    (a) would hide that again. The note fires only on the run-level call. Cost of (b): the
    existing test "no labelled events at all" (`metrics-emit-main.test.js` L504–516) asserts
    stderr with exact equality and no `--session`, so its expected string gains the note line.
- **D4 — where `--session` comes from at `Done`.**
  - (a) The prose passes `--session "$CLAUDE_CODE_SESSION_ID"` (pinned above for both
    top-level and sub-agent Bash on 2.1.296).
  - (b) The bin defaults `--session` from that env var when the flag is absent. This changes
    row scoping for every caller, including hand runs from another session.
  - (c) The bin resolves the session by grepping main transcripts for the run-key that
    `run-ledger.sh open` printed. That couples the bin to the ledger's pointer format.
  - **Recommend (a).** It is explicit, has no engine coupling, and stays Claude-specific in
    prose that already uses `CLAUDE_PLUGIN_ROOT`.
- **D5 — core surface.**
  - (a) A new export, `formatCompactionEstimateLine(compactions) → string | null`, composing
    the two private functions.
  - (b) Export both `buildCompactionEstimate` and `formatCompactionsLine`, and let the emitter
    compose them.
  - (c) The emitter calls `aggregate()` + `renderMarkdown()` and extracts the line. That breaks
    when there are no events (`aggregate` returns no runs) and needs a price table it does not
    have.
  - **Recommend (a).** One export, the fold stays private, and wording parity holds by
    construction.
- **D6 — how the main transcript is parsed.**
  - (a) A second `streamTranscriptFiles` call over the main entry only, made only when the line
    is wanted. The existing sub-agent call is untouched.
  - (b) Widen the single call's scope to include the main entry. That relies on
    `includeInline: false` plus the `phase !== null` filter to keep rows identical, and it
    parses the main transcript on `--phase` calls too.
  - **Recommend (a).** R4 then holds by construction, not through two filters, and the
    multi-MB main transcript is read only when it is needed.
- **D7 — making the line reach the user.**
  - (a) The line stays in the `emit-metrics` tool output only.
  - (b) The `Done` final message relays it verbatim when it was printed.
  - **Recommend (b).** Tool output is collapsed by default, and (a) leaves the cost visible only
    to someone who expands it, which is close to today's problem.

## Test strategy

All new tests are red first. They use node:test, Given/When/Then titles, AAA, and a `sut`
variable. Expected lines below come from parsing the committed fixtures with the current code.

Core (`usage-aggregate.test.js`):

1. `formatCompactionEstimateLine([makeCompaction()])` equals
   `Compactions: 1 (main 1, sub-agent 0) — estimated summary-call cost 11k–20k equiv (estimate; not in totals)`.
2. `formatCompactionEstimateLine([])` is `null`.
3. Parity: for `[makeCompaction(), makeCompaction({ sourceKind: 'subagent', cacheRead: 30000, output: [600, 1400] })]`,
   the `Compactions:` line of `renderMarkdown(aggregate([makeEvent()], …, compactions))` equals
   `formatCompactionEstimateLine(compactions)`.

Emitter (`metrics-emit-main.test.js`, tmp copy of the `proj` fixture plus
`addCompactedSession(dir, 'sess-c')`):

4. `--run run-x --dir D --session sess-c` → exit 0. The last stdout line is
   `Compactions: 3 (main 2, sub-agent 1) — estimated summary-call cost 32k–60k equiv (estimate; not in totals)`.
   There is no line about compactions on stderr.
5. R4 byte-identity: same call on a second tree without `sess-c.jsonl` → the ledger files are
   identical, and only the stdout `Compactions:` line differs (`count 1`, sub-agent only).
6. `--phase planning --session sess-c` → no `Compactions:` on stdout.
7. No `--session` → no `Compactions:` on stdout. stderr includes
   `metrics-emit: no --session, compaction estimate skipped`. Update the L504–516 test's exact
   stderr expectation to `no events found …\n` followed by this note.
8. `--session sess-a` (fixture session, no compactions) → stdout is rows only and there is no
   skip note (R3).
9. Prefix isolation: `sess-c` and `sess-cc` both compacted, `--session sess-c` → `count 3`, not
   6. This pins exact-match selection against a prefix implementation; test 4 kills an
   equality-forced-`true` mutant, because `find` would then return `sess-a.jsonl` first.
10. Only `sess-c.jsonl`, no sub-agents → stderr `no events found for run 'run-x'`, stdout
    `Compactions: 2 (main 2, sub-agent 0) — … 23k–45k …`, no ledger written, exit 0.
11. `--since 2026-03-01T10:30:00.000Z --session sess-c` →
    `Compactions: 2 (main 1, sub-agent 1) — estimated summary-call cost 22k–41k equiv …` (R7).
12. A `containByRealpath` override refusing `sess-c.jsonl` → the advisory line reports
    `1 refused`, and stdout carries the sub-agent-only line.

Gates: part = `npm --prefix engine test`; phase = `bash scripts/ci.sh`. Mutation: Stryker over
the touched hunks of `usage-aggregate.js` and `metrics-emit-main.js`, with one comma-separated
`--mutate` and a narrowed per-module test corpus.

## Out of scope

- Ledger rows, columns, totals, drift and the baseline (ADR-382 option 2, ADR-369).
- The estimate bands and the formula.
- Scoping the line to the run's time window inside a session (for example, activity before
  `/craft:run` in the same session). It uses the same session scoping as the rows.
- A run that spans several sessions (a `/clear` mid-run). To prove the gap, check whether
  `CLAUDE_CODE_SESSION_ID` changes across `/clear` in one interactive session.
- Changing `usage-mine` (a `--session` flag, its report shape).
- README counts, which the orchestrator's readme-drift pass handles.
