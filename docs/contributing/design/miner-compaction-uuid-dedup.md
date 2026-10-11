# Design — miner-compaction-uuid-dedup

> Brief: stop the Claude telemetry miner from counting a compaction twice when the CLI
> re-appends an earlier stretch of a transcript.
> Status: draft → self-reviewed

## Context

`parseLines` (`engine/src/observability/adapters/claude/telemetry.js`) opens a pending
compaction on every `compact_boundary` line and closes it on the next `isCompactSummary` line.
It never looks at the line's `uuid`. CLI 2.1.296 can re-append an earlier stretch of a
transcript, and that stretch can contain a boundary/summary pair that was already mined. The
pair is then mined a second time, and `compactionEstimate` (ADR-382) gains one extra summary
call. Billed events are not affected because they fold by `message.id`. Only `compactions` is
wrong.

**Pinned on a real transcript** (main session of the 2026-10-11 plugin-hook live smoke,
main-session transcript, 165 lines, `version: "2.1.296"`, read-only):

| Line | Kind | `uuid` | Note |
|---|---|---|---|
| 63 | boundary `auto`, preTokens 75467 | `51787519…` | original |
| 67 | summary | `ed3b8041…` | original, closes 63 |
| 101 / 102 | boundary `manual` / summary | `ea7d05b1…` / `9fbc8ec5…` | real second compaction |
| 131 | boundary | `51787519…` | byte-identical to 63 |
| 132–134 | attachments | dup of 64–66 | |
| 135 | summary | `ed3b8041…` | byte-identical to 67 |
| 136–158 | assistant/user/attachment | dup of 54–95 | rest of the re-appended stretch |

The current `parseLines` mines this file as 3 compactions:
`[75467 ok, 34793 ok, 75467 ok]`. The correct count is 2. Boundary and summary lines each
carry their own top-level `uuid`. The existing fixtures (`compaction-main.jsonl`,
`compaction-subagent.jsonl`) carry none.

## Requirements

- R1. A `compact_boundary` whose `uuid` was already consumed in this `parseLines` call is
  skipped: it does not open a compaction and does not close the one already pending.
- R2. An `isCompactSummary` line whose `uuid` was already consumed is skipped. It does not
  close a different pending compaction, for example a real boundary that is still open when
  the re-appended pair arrives.
- R3. Lines with no `uuid` keep today's behaviour exactly.
- R4. The estimate formula, `emit-metrics`, the `since` filter, the marker scan and the event
  fold are unchanged. Dedup applies to compaction lines only.

## Design

Add one per-call `Set`, `consumedCompactionUuids`, next to `pending` in `parseLines`. Add a
guard right after the `since` filter and before the two existing compaction branches, which
stay untouched:

```js
if (isReplayedCompactionLine(parsed, consumedCompactionUuids)) continue;
rememberCompactionUuid(parsed, consumedCompactionUuids);
if (isCompactBoundary(parsed)) { /* unchanged */ }
if (isCompactSummary(parsed)) { /* unchanged */ }
```

Three small module-private helpers sit beside `isCompactSummary` (around L239). The query and
the command stay separate (CQS):

```js
function compactionUuidOf(parsed) {            // null for non-compaction lines and no-uuid lines
  if (!isCompactBoundary(parsed) && !isCompactSummary(parsed)) return null;
  return parsed.uuid ?? null;
}
function isReplayedCompactionLine(parsed, consumed) {
  // null is never added (see below), so a no-uuid line can never match
  return consumed.has(compactionUuidOf(parsed));
}
function rememberCompactionUuid(parsed, consumed) {
  const uuid = compactionUuidOf(parsed);
  if (uuid !== null) consumed.add(uuid);
}
```

- One set serves both line kinds. Each CLI line has its own uuid, so a boundary and a summary
  never collide (D2).
- A skipped line changes no state: `pending` and `compactions` are not touched. So a
  duplicate summary cannot close a real pending boundary (R2), and a duplicate boundary cannot
  close that boundary as summary-missing (R1).
- No uuid → `compactionUuidOf` returns `null` → nothing is remembered or skipped (R3). The
  existing test with two no-uuid boundaries pins this.
- Null-safety: `parsed.uuid` is read only after `isCompactBoundary` or `isCompactSummary`
  returned true, which implies `parsed` is non-null. The existing equivalent-mutant comments
  on those two predicates (L219–229, L240–244) stay accurate. A nullish `parsed` still reaches
  the same downstream crash site.
- `since` runs first, so a line it drops is never consumed. In the pinned transcript a replayed
  line keeps the original's timestamp, so the original and its replay are both dropped or both
  kept.
- JSDoc of `parseLines` (L339–346): add one sentence after the boundary/summary paragraph. "A
  boundary or summary line whose `uuid` was already consumed in this call is a CLI re-append
  and is skipped with no state change; a line with no `uuid` is never deduplicated."
- Files touched: `engine/src/observability/adapters/claude/telemetry.js`,
  `engine/test/telemetry-claude.test.js`, and the new
  `engine/test/fixtures/telemetry/compaction-reappended.jsonl`.

## Decision candidates

- **D1 — dedup mechanism.** (a) A per-call `Set` of consumed boundary and summary uuids. Any
  replayed compaction line is skipped. (b) A "skip the next summary" flag armed by a duplicate
  boundary. If a re-append ever drops the summary, the flag swallows the next real summary.
  (c) Dedup every uuid-bearing line before any processing. This also changes the marker scan
  and the event path, which breaks R4. **Recommend (a).**
- **D2 — set shape.** (a) One set shared by boundary and summary lines. (b) Two separate sets.
  Uuids are unique per line, so (b) adds state and buys nothing. **Recommend (a).**
- **D3 — what counts as a uuid.** (a) Any non-nullish `uuid` (`?? null`). (b) Non-empty
  strings only. The CLI always writes a UUID string. (b) adds branches and mutants to cover
  input that has never been observed. **Recommend (a).**

## Test strategy

All new tests are red first and extend `engine/test/telemetry-claude.test.js` at the end
of the compaction block (after L1183). They use node:test, Given/When/Then titles, AAA, and
`const sut = parseLines;`, with the `fixtureLines` / `asyncLines` helpers (L14–18).

1. **Fixture `compaction-reappended.jsonl`.** Every line carries a `uuid` and `sessionId: 'sess-reappend'`. The lines are:
   assistant `msg-1`, boundary `u-b1` (preTokens 24715), attachment, summary `u-s1` (copy the
   first summary content of `compaction-main.jsonl`), assistant `msg-2`. Then boundary,
   attachment, summary and `msg-2` are repeated verbatim. Expect `compactions` deep-equal to
   `[{ run: 'sess-reappend', sourceKind: 'main', cacheRead: 24715, input: [3000, 5500], output: [1014, 2366],
   summaryMissing: false }]`.
2. **Inline: a duplicate summary does not close a real pending boundary.** Lines: B1 `u-b1`,
   S1 `u-s1`, B2 `u-b2` (preTokens 9000), B1 again, S1 again, S2 `u-s2` (`'x'.repeat(400)`).
   Expect 2 estimates, and the second is `{ cacheRead: 9000, output: [120, 280],
   summaryMissing: false }`. Today this mines 3.
3. **Inline: a duplicate pair is the last thing in the stream while B2 is pending.** Expect
   B2 to close as summary-missing (`[1300, 2600]`), not sized from the duplicate S1.
4. **Sub-agent.** Feed the fixture from test 1 with
   `{ sourceKind: 'subagent', agentType: 'craft:planner', spawnId: 0 }`. Expect 1 estimate
   with `sourceKind: 'subagent'`.
5. **Scope pin (R4).** Inline: a uuid-bearing main-loop assistant line with
   `auto-skip: review — …` text, repeated with the same uuid. Expect `markers.length === 2`,
   which is today's behaviour. This kills a mutant that widens `compactionUuidOf` to every
   line.
6. **No-uuid regression.** The existing compaction tests (L956–1183) stay green unchanged.
   Test 42 (two no-uuid boundaries) kills the `?? null` removal mutant.

Gates: part = `npm --prefix engine test`; phase = `bash scripts/ci.sh`. Mutation: Stryker over
the touched `telemetry.js` hunk during validation, with one comma-separated `--mutate`.

## Out of scope

- Deduplicating replayed non-compaction lines: markers, attachments, user turns.
- Deduplicating across transcript files, for example the same uuid in main and sub-agent files.
- The summary line's timestamp predating its boundary's timestamp (seen at L63/L67), and how
  that interacts with a `--since` cutoff placed between the two.
- Any change to the estimate bands, `emit-metrics`, or ADR-382.
