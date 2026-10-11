# Plan — miner-compaction-uuid-dedup

> Source: design doc `docs/contributing/design/miner-compaction-uuid-dedup.md` · ADRs `none`
> (the decisions phase was a no-op: D1(a) one per-call uuid `Set`, D2(a) one set shared by
> boundary and summary lines, D3(a) any non-nullish `uuid` counts)
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

## Plan shape (1 part)

| # | Part | src delta | Files |
|---|---|---|---|
| 1 | Skip re-appended compaction lines by `uuid` | yes | `telemetry.js`, its test, one new fixture |

One part. The fixture exists only to feed this part's tests, and the four RED tests all go
green with one GREEN (the guard plus three helpers). Splitting it would create a test-only
part, which the sizing rules forbid.

## Public-surface decision

All three new functions (`compactionUuidOf`, `isReplayedCompactionLine`,
`rememberCompactionUuid`) are **internal**. They are module-private in `telemetry.js`, not
exported, and not added to any barrel. `parseLines` keeps its signature and return shape. No
surface gate applies: no barrel, facade, registry, or doc surface changes.

## Decision candidates

- **DP1 — null checks in the helper pair (found while planning; the design does not decide
  it).** The design's shape guards `null` twice: once in `isReplayedCompactionLine`
  (`uuid !== null && consumed.has(uuid)`) and once in `rememberCompactionUuid`
  (`if (uuid !== null)`). Each guard makes the other one redundant. Proof: in a throwaway copy
  of `engine/src` with the design's GREEN applied, two mutants each left all 62
  `telemetry-claude.test.js` tests green and gave the same outputs on all 5 planned test inputs:
  `return true && consumed.has(uuid)` and `if (true) consumed.add(uuid)`. Stryker would report
  these two as survivors, and no test can kill them.
  - (a) Keep the design's shape verbatim and put an `equivalent mutant` comment on each guard
    (the source-hygiene test allows that phrase in `engine/src`). Result: 2 permanent
    survivors.
  - (b) Drop the read-side guard: `isReplayedCompactionLine` returns
    `consumed.has(compactionUuidOf(parsed))`. `null` is never stored in the set, so
    `has(null)` is always false. Measured in the same throwaway: all 62 tests green, the same
    planned outputs, and the remaining `if (true) consumed.add(uuid)` mutant is killed
    (19 of 62 existing tests fail under it: once `null` is stored, every later non-compaction
    line is skipped). Result: 0 survivors.
  - (c) Drop the write-side guard: `rememberCompactionUuid` adds unconditionally and the
    read-side guard stays. Also 0 survivors, but `null` is stored in the set as a sentinel
    that every non-compaction line writes.
  - **Recommend (b).** It has the fewest branches, no equivalent mutants, and no sentinel in
    the set. It needs one short why-comment on `isReplayedCompactionLine`.

## Part 1 — Skip re-appended compaction lines by uuid

### Context

**Bug.** CLI 2.1.296 can re-append an earlier stretch of a transcript, byte-identical lines
included. `parseLines` then mines that stretch's `compact_boundary`/summary pair a second time,
so `compactions` gains a phantom estimate. Each CLI line carries its own top-level `uuid`, and
a replayed line keeps the original's `uuid`. Fix: per `parseLines` call, remember the uuids of
compaction lines already consumed, and skip a compaction line whose uuid was seen before. A
skipped line changes no state. Only compaction lines are deduplicated. Markers, events, the
`since` filter and the estimate formula are untouched.

**Files this part edits or creates (3):**

- `engine/src/observability/adapters/claude/telemetry.js` (edit)
- `engine/test/telemetry-claude.test.js` (edit)
- `engine/test/fixtures/telemetry/compaction-reappended.jsonl` (create)

Read-only references: the design doc docs/contributing/design/miner-compaction-uuid-dedup.md,
and engine/test/fixtures/telemetry/compaction-main.jsonl (the generator below reads its line 5).

**`telemetry.js`: current anchors (line numbers at HEAD `e221d0e`):**

- Constants L54–57: `SUMMARY_INPUT_TOKENS = [3000, 5500]`,
  `SUMMARY_OUTPUT_MULTIPLIERS = [1.2, 2.8]`, `SUMMARY_OUTPUT_FALLBACK = [1300, 2600]`,
  `CHARS_PER_TOKEN = 4`. Estimate: `t = ceil(chars / 4)`, `output = [round(1.2t), round(2.8t)]`.
  Checks: 3380 chars → t 845 → `[1014, 2366]`; 400 chars → t 100 → `[120, 280]`;
  800 chars → t 200 → `[240, 560]`.
- `function isCompactBoundary(parsed)` L218: returns
  `parsed?.type === 'system' && parsed?.subtype === 'compact_boundary'`. Its two
  equivalent-mutant comments (L219–229) stay unchanged and stay accurate. The new
  `compactionUuidOf` calls it with no non-optional `parsed.X` access first, so a nullish
  `parsed` still crashes at the same downstream `parsed.sessionId`/`parsed.message` site.
- `function isCompactSummary(parsed)` L239: returns `parsed?.isCompactSummary === true`. Its
  comment (L240–244) stays unchanged.
- The JSDoc block of `openCompaction` starts at L248–249 (`/**` then ` * Open a pending
  compaction…`). **Insert the three new helpers between the end of `isCompactSummary` (L246)
  and that JSDoc**, each with a short JSDoc in the module's style (`@param`/`@returns`).
- `export async function parseLines(lines, since = null, context = null)` L353. Locals start
  at L354. `let pending = null;` is at L359: add
  `const consumedCompactionUuids = new Set();` on the next line.
- In the loop, the `since` filter is L374–378. The comment "Compaction boundaries and their
  summaries are administrative lines…" is L380–382. The branches
  `if (isCompactBoundary(parsed)) {…}` (L383–387) and `if (isCompactSummary(parsed)) {…}`
  (L388–392) stay **unchanged**. Insert the two guard lines after the L380–382 comment and
  directly before L383:

  ```js
      if (isReplayedCompactionLine(parsed, consumedCompactionUuids)) continue;
      rememberCompactionUuid(parsed, consumedCompactionUuids);
  ```

- The guard must sit after the `since` filter: a line that `since` drops is never consumed.
- End of stream (L489): `if (pending) compactions.push(estimateWithoutSummary(pending));`.
  This is why a boundary still open when the stream ends closes as summary-missing (test C).
- JSDoc of `parseLines`, compaction paragraph L339–346 (ends with
  "…touches compactions — they are never billed main-loop turns."). Add this sentence at the
  end of that paragraph, wrapped at about 80 columns like its neighbours:
  "A boundary or summary line whose `uuid` was already consumed in this call is a CLI
  re-append and is skipped with no state change; a line with no `uuid` is never
  deduplicated."

**Helpers: the design's shape (DP1 option (a) is this code verbatim):**

```js
function compactionUuidOf(parsed) {
  if (!isCompactBoundary(parsed) && !isCompactSummary(parsed)) return null;
  return parsed.uuid ?? null;
}
function isReplayedCompactionLine(parsed, consumed) {
  const uuid = compactionUuidOf(parsed);
  return uuid !== null && consumed.has(uuid);
}
function rememberCompactionUuid(parsed, consumed) {
  const uuid = compactionUuidOf(parsed);
  if (uuid !== null) consumed.add(uuid);
}
```

DP1 option (b) changes only the middle helper:
`function isReplayedCompactionLine(parsed, consumed) { return consumed.has(compactionUuidOf(parsed)); }`,
with a one-line why-comment: `null` is never remembered, so a non-compaction or uuid-less line
can never match. Option (c) instead drops `if (uuid !== null)` from `rememberCompactionUuid`.
**Implement the DP1 option the decisions checkpoint recorded. If none was recorded, implement
the design's shape (a)** and add an `equivalent mutant` why-comment on each of the two `null`
guards, explaining that the other guard already excludes `null`.

**Mutants the planned tests kill** (shape (a) or (b)):
- `compactionUuidOf` returning a uuid for every line (its first `return null` removed or
  conditioned to `false`) → test E: the second marker line is skipped and `markers` drops to 1.
- Summary lines not deduplicated (`!isCompactBoundary(parsed) && true`) → test B: the
  duplicate S1 closes B2 with S1's size.
- Boundary lines not deduplicated → tests A, B.
- `?? null` removed (`uuid` becomes `undefined` and gets remembered) → existing test 42 ("Given
  two boundaries before one summary…", L1013): its second uuid-less boundary is skipped.
- `continue` removed from the guard → tests A–C.

**`telemetry-claude.test.js`: conventions and anchors:**

- Imports at L1–10 (`test` from `node:test`, `assert` from `node:assert/strict`, `parseLines`).
  Helpers: `fixtureLines(name)` (L14) reads `FIXTURE_DIR/name` split on `\n`, and
  `asyncLines(lines)` (L18) is an async generator. Blank lines are skipped by `parseLines`.
- Compaction block: L956–1183. It covers test 39 (fixture `compaction-main.jsonl`), test 42
  (inline lines built with `JSON.stringify({...})`; the pattern to copy, L1013), test 44
  (sub-agent context `{ sourceKind: 'subagent', agentType: 'craft:planner', spawnId: 0 }`,
  L1066), and the unnumbered edge tests ending at L1183. **Append the new tests after L1183,
  under one new section header with no number and no provenance ref**, e.g.
  `// ── parseLines — a re-appended compaction pair is mined once ──`.
- Every test: Given/When/Then title, AAA body, `const sut = parseLines;`, and
  `assert.deepEqual` on whole estimate objects. No ADR, backlog or phase references in titles
  or comments.
- Marker-line shape to copy (L575–578): an assistant line whose
  `message.content: [{ type: 'text', text: 'auto-skip: review — evaluated unnecessary (no source diff in scope)' }]`.
  The marker for it is `{ run: <sessionId>, phase: 'review' }`.

**New fixture `compaction-reappended.jsonl`: exact content (9 lines + trailing `\n`,
sha256 `bac8c9d153b491a7562c614809f4af0cdad94f8f0d32aa753b1c03a8efc68d64`).** Five original
lines, then lines 2–5 repeated byte-for-byte. The summary content is line 5's
`message.content` from compaction-main.jsonl: 3380 chars,
`'abcdefghijklmnopqrstuvwxyz0123456789 '.repeat(100).slice(0, 3380)`. Generate it with a
throwaway script kept OUTSIDE the worktree (e.g. `$(mktemp -d)/gen.cjs`), run from the
worktree root as
`node "$GEN" engine/test/fixtures/telemetry/compaction-main.jsonl engine/test/fixtures/telemetry/compaction-reappended.jsonl`,
then check `shasum -a 256` against the hash above:

```js
const { readFileSync, writeFileSync } = require('node:fs');
const [src, out] = process.argv.slice(2);
const summary = JSON.parse(readFileSync(src, 'utf8').split('\n')[4]).message.content;
const usage = { input_tokens: 5, cache_read_input_tokens: 100, cache_creation_input_tokens: 20, output_tokens: 15 };
const assistant = (uuid, id, timestamp) => ({ type: 'assistant', uuid, sessionId: 'sess-reappend', slug: 'reappend-fixture', timestamp, message: { id, role: 'assistant', model: 'claude-sonnet-4-6', usage } });
const original = [
  assistant('u-a1', 'msg-1', '2026-03-01T09:59:00.000Z'),
  { type: 'system', subtype: 'compact_boundary', uuid: 'u-b1', sessionId: 'sess-reappend', timestamp: '2026-03-01T10:00:00.000Z', compactMetadata: { trigger: 'auto', preTokens: 24715, postTokens: 4100, cumulativeDroppedTokens: 0, durationMs: 31000, preservedMessages: 0, preservedSegment: null } },
  { type: 'attachment', uuid: 'u-att1', sessionId: 'sess-reappend' },
  { type: 'user', uuid: 'u-s1', sessionId: 'sess-reappend', timestamp: '2026-03-01T10:00:05.000Z', isCompactSummary: true, message: { role: 'user', content: summary } },
  assistant('u-a2', 'msg-2', '2026-03-01T10:00:10.000Z'),
].map((line) => JSON.stringify(line));
writeFileSync(out, [...original, ...original.slice(1)].join('\n') + '\n');
```

Resulting line order: `u-a1/msg-1`, `u-b1` boundary, `u-att1`, `u-s1` summary, `u-a2/msg-2`,
`u-b1`, `u-att1`, `u-s1`, `u-a2/msg-2`.

**Inline lines for tests B, C (build them in-test with `JSON.stringify`):**

```js
const boundary = (uuid, preTokens, timestamp) => JSON.stringify({
  type: 'system', subtype: 'compact_boundary', uuid, sessionId: 'sess-replay', timestamp,
  compactMetadata: { trigger: 'auto', preTokens },
});
const summary = (uuid, content, timestamp) => JSON.stringify({
  type: 'user', isCompactSummary: true, uuid, sessionId: 'sess-replay', timestamp,
  message: { role: 'user', content },
});
// B1 = boundary('u-b1', 8000, '2026-03-01T10:00:00.000Z'); S1 = summary('u-s1', 'x'.repeat(800), '2026-03-01T10:00:05.000Z')
// B2 = boundary('u-b2', 9000, '2026-03-01T11:00:00.000Z'); S2 = summary('u-s2', 'x'.repeat(400), '2026-03-01T11:00:05.000Z')
```

A builder shared by B and C may be a module-level test helper placed just above the new tests.
If you share it, keep it a pure function. Do not use mutable shared fixtures.

**Probed outputs** (throwaway copy of `engine/src`, read-only against this worktree):

| Input | HEAD today | After GREEN |
|---|---|---|
| fixture (main) | 2 identical estimates `{cacheRead 24715, output [1014, 2366]}` | 1 estimate |
| fixture (sub-agent ctx) | 2 estimates | 1 |
| B1 S1 B2 B1 S1 S2 | 3: `[8000 ok [240,560]]`, `[9000 missing]`, `[8000 ok [240,560]]` | 2: `[8000 ok [240,560]]`, `[9000 ok [120,280]]` |
| B1 S1 B2 B1 S1 | same 3 as the row above | 2: `[8000 ok [240,560]]`, `[9000 missing [1300,2600]]` |
| marker line ×2, same uuid | `markers` length 2 | length 2 |

Baseline: `npm --prefix engine test` at HEAD is green, `# tests 2781`. After this part:
`# tests 2786` (5 new). scripts/ci.sh asserts no test counter, so no counter needs a bump.
engine/test/usage-mine.bin.test.js passes `--dir` on the fixture directory, but containment
rejects that directory, so the new fixture file does not change that test (it stays green).

### TDD steps

1. **RED A**: `Given compaction-reappended.jsonl whose boundary and summary are re-appended
   with their original uuids, when parseLines runs, then compactions holds one main estimate`.
   Create the fixture first (generator above). Assert
   `assert.deepEqual(result.compactions, [{ run: 'sess-reappend', sourceKind: 'main', cacheRead: 24715, input: [3000, 5500], output: [1014, 2366], summaryMissing: false }])`.
   Fails today: `compactions` has **two** identical estimates, because the replayed `u-b1`
   reopens and the replayed `u-s1` closes it again.
2. **RED B**: `Given a re-appended boundary and summary arriving while a later boundary is
   still open, when parseLines runs, then the duplicates are skipped and the later boundary
   closes on its own summary`. Lines `[B1, S1, B2, B1, S1, S2]`. Assert `compactions`
   deep-equals
   `[{ run: 'sess-replay', sourceKind: 'main', cacheRead: 8000, input: [3000, 5500], output: [240, 560], summaryMissing: false }, { run: 'sess-replay', sourceKind: 'main', cacheRead: 9000, input: [3000, 5500], output: [120, 280], summaryMissing: false }]`.
   Fails today with 3 estimates: the duplicate B1 closes B2 as summary-missing, and the
   duplicate S1 closes the reopened B1. S2 then finds nothing pending.
3. **RED C**: `Given a re-appended boundary and summary ending the stream while a later
   boundary is still open, when parseLines runs, then the later boundary closes as
   summary-missing`. Lines `[B1, S1, B2, B1, S1]`. Assert `compactions` deep-equals
   `[{ …8000, output: [240, 560], summaryMissing: false }, { run: 'sess-replay', sourceKind: 'main', cacheRead: 9000, input: [3000, 5500], output: [1300, 2600], summaryMissing: true }]`
   (write the first object in full). Fails today with 3 estimates: the third is the
   duplicate B1 sized from the duplicate S1.
4. **RED D**: `Given compaction-reappended.jsonl with a sub-agent context, when parseLines
   runs, then compactions holds one subagent estimate`. Pass context
   `{ sourceKind: 'subagent', agentType: 'craft:planner', spawnId: 0 }`. Assert deep-equal to
   `[{ run: 'sess-reappend', sourceKind: 'subagent', cacheRead: 24715, input: [3000, 5500], output: [1014, 2366], summaryMissing: false }]`.
   Fails today: two estimates.
5. **GUARD E**: `Given the same uuid-bearing auto-skip assistant line twice, when parseLines
   runs, then both markers are kept`. Two copies of one `JSON.stringify` of
   `{ type: 'assistant', uuid: 'u-m1', sessionId: 'sess-scope', message: { role: 'assistant', content: [{ type: 'text', text: 'auto-skip: review — evaluated unnecessary (no source diff in scope)' }] } }`.
   Assert `result.markers` deep-equals
   `[{ run: 'sess-scope', phase: 'review' }, { run: 'sess-scope', phase: 'review' }]`.
   It passes today because nothing deduplicates by uuid. It stays green after GREEN because
   dedup covers compaction lines only. It pins that scope and kills the mutant that widens
   `compactionUuidOf` to every line.
6. **GUARD F**: the existing compaction tests L956–1183, unchanged (their lines carry no
   `uuid`). They pass today and after GREEN because `compactionUuidOf` returns `null` for
   them, so nothing is remembered or skipped. Test 42 kills the `?? null` removal mutant.
7. **GREEN**: in `telemetry.js`, add the three helpers after `isCompactSummary` (the DP1
   option recorded, default shape (a)), add `const consumedCompactionUuids = new Set();`
   after `let pending = null;`, and add the two guard lines before
   `if (isCompactBoundary(parsed))`. Run the part gate: A–D go green, E and F stay green,
   2786 tests pass.
8. **REFACTOR**: add the JSDoc sentence to the `parseLines` compaction paragraph. Give each
   helper a short JSDoc. Under shape (a), add the two `equivalent mutant` comments. Check
   that no new function exceeds 20 lines, nesting is at most 2, and no provenance refs
   appear in source or test. Re-run the gate.

### Gate

`npm --prefix engine test > /tmp/miner-compaction-uuid-dedup-part1.txt 2>&1; tail -n 12 /tmp/miner-compaction-uuid-dedup-part1.txt`.
Expect exit 0, `# tests 2786`, `# fail 0`. On failure,
`grep -n "^not ok" /tmp/miner-compaction-uuid-dedup-part1.txt` and read only those ranges.
Phase gate (orchestrator, after this part):
`bash scripts/ci.sh > /tmp/miner-compaction-uuid-dedup-ci.txt 2>&1; tail -n 20 /tmp/miner-compaction-uuid-dedup-ci.txt`.

### Commit

`fix(telemetry): skip compaction lines whose uuid was already mined`
