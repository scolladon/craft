# Plan — transient-model-retry

> Source: design doc `docs/contributing/design/transient-model-retry.md` · ADRs `462, 463, 464, 465`
> (all four take the design's recommended options: DC-1 (a) classified bounded retry, DC-2 (a)
> per-spawn allowance, DC-3 (a) two prose-family tokens, DC-4 (a) no session-side wait)
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
| 1 | Retry a transient overload once before degrading the tier | none (prose + one process test) | run SKILL.md, model.md, run-record.md, new test |

One part. The change is prose plus one new process suite: 4 files, 4 RED→GREEN cycles and
one GUARD. A split (SKILL.md in one part, the two specs in another) would put SKILL.md in a
commit without docs/contributing/specs/run-record.md. That spec is a living intention page
whose `subjects:` frontmatter names `skills/run/SKILL.md`, so the two belong in one commit.
Every edit below was applied to a throwaway copy of HEAD `5a63e08` and checked there:
the new suite passed 7/7, and the existing suites that read these docs stayed green
(test/run-record, decision-tokens, gate-token, intention-token, no-op-token, run-ledger,
living-corpus, concepts-frames, craft-root-shim, hygiene-gates-ci, every-test-file-registers:
211/211; the four adapter
`native-surface` suites: all pass). `intention-lint` reported OK, and `prose-lint --gate
blocking` on SKILL.md was clean. Against the untouched tree, 6 of the 7 tests fail and the
sync guard passes.

## Public-surface decision

No code symbol is added. The new suite exports nothing and imports no other test file.
There are two new **public** ledger tokens: `MODEL-RETRY(<role>): <tier> overload` and
`MODEL-DEGRADED(<tier>): fallback=<tier> cause=<overload|unavailable>`. Their surface gates
are paid in Part 1:

- the walk-token list in skills/run/SKILL.md `### Run-record tokens` ("Besides the walk's own (…)");
- the run-record family list in docs/contributing/specs/run-record.md `## Token vocabulary`;
- **not** the parsed Token-vocabulary table, and no change to `engine/src/run-state.js`
  (design DC-3 (a): nothing consumes these lines). Neither prefix collides with a parsed
  prefix (`RESOLVE:`, `AWAITING(propose):`, `PHASE-START(`, `PHASE-DONE(`, `PART(`,
  `FINDINGS(`, `HARNESS-BG(`), so no `run-state` `warnings[]` entry can fire.
- README.md:105 and docs/guides/customizing.md:117 still hold ("model degradation" is still
  recorded) and stay untouched. docs/contributing/specs/intention.md:98 has its own family
  list, which covers the intention tokens only, and stays untouched.

## Decision candidates

The design leaves two load-bearing choices open. The plan below is written for each
**Recommend** option. If you pick another option, the change noted under that DP applies.

- **DP1: model.md sentences the design did not list that still describe the failure branch.**
  The design edits Core-policy (new bullet), Runtime errors, and the Claude and Copilot
  `isAvailable` lines. Four more lines in docs/contributing/specs/model.md describe an
  availability error as going straight to fallback (line numbers at `5a63e08`):
  (i) Port interface `select` post, :9-11, "raises a model-down signal, which core handles
  via fallback re-resolution";
  (ii) Core policy bullet **model-down is not a task blocker**, :30-32, "it triggers core
  fallback re-resolution + respawn from artifact";
  (iii) `## Failure → blocker`, :112-114, "A spawn that fails on a model-availability error
  triggers core fallback re-resolution + respawn-from-artifact";
  (iv) the Codex `isAvailable` line, :107-108, "an absent id marks the tier degraded and
  returns `false`".
  Two more lines, the opencode binding (:73) and Pi, describe opencode/Pi. Those bindings
  have no pinned overload strings, so degrade-at-once stays true for them.
  - (a) Design scope only: leave all four. Then (ii) and (iii) sit beside the new retry
    bullet and still read as "an availability error degrades at once", which is the
    contradiction R1 forbids.
  - (b) Reword (ii) and (iii) to "the core retry-then-degrade policy". Leave (i): "core
    handles" stays true. Leave (iv): an absent catalog id is a permanent error, so it still
    degrades at once.
  - (c) Do (b), and also reword (i) and (iv) to "the probe reports, core decides".
  - **Recommend (b).** It is the smallest edit that leaves no model.md sentence
    contradicting the new rule. (iv) is accurate under the new rule, and (c) adds wording
    churn for no change in meaning. If you pick (a), drop the GREEN 4 edits marked DP1 and
    the two `triggers core fallback re-resolution` phrases from `RETIRED_MODEL_SPEC_PHRASES`.
- **DP2: the negative guard over model.md.** The design's test strategy pins only the
  SKILL.md retired phrase (pin 6). Nothing would then pin the model.md `isAvailable` and
  Runtime-errors rewrites.
  - (a) The design's 6 pins only. The model.md rewrites ship unpinned, except for the new
    Core-policy bullet.
  - (b) Add one negative test over normalised model.md. It asserts that the retired phrases
    of the rewritten sentences are gone.
  - **Recommend (b).** It is one test, red on today's tree (every phrase was measured
    present at least once; see RED 4b), and it stops a later edit from reintroducing the old rule in
    the spec. If you pick (a), drop RED 4b.

## Part 1 — Retry a transient overload once before degrading the tier

### Context

**What changes.** A spawn that dies on a transient overload (`529` / `overloaded_error`) is
now respawned **once on the same tier** from the artifact, and a `MODEL-RETRY` line is
recorded. These degrade the tier for the rest of the run: any other availability error
(model unknown, no access, switched off), an error that cannot be classified, or an overload
on that one retry. A degradation records `MODEL-DEGRADED`, then follows the old fallback
path. The resolution chain, degraded-tier memory, and the ADR-041 fallback order do not
change. There is no session-side wait before the retry. All of it is orchestrator prose; no
engine source changes.

**Files this part creates or edits (4):**

- `test/model-retry-token.test.js` (create)
- `skills/run/SKILL.md` (edit)
- `docs/contributing/specs/model.md` (edit)
- `docs/contributing/specs/run-record.md` (edit)

Read-only references: the design doc docs/contributing/design/transient-model-retry.md
(sections Design, Test strategy), test/run-record.test.js:47-63 (the `sliceRegion` idiom
this suite copies locally, with one difference: it adds whitespace normalisation),
test/every-test-file-registers.test.js.

**Registration and discovery.** scripts/ci.sh `run_suite process test` finds every
test/*.test.js by `find`, so a new file needs no wiring. test/every-test-file-registers.test.js
requires each `*.test.js` to call `test(`/`it(`/`describe(`/`suite(` outside comments and
strings at least once, and this suite does. Use `node:test` + `node:assert` in CommonJS
(`'use strict'; const { test } = require('node:test');`), the same as every root suite. Do
not import from another test file. Tests use Given/When/Then titles, an AAA body, a `sut`
variable, and no ADR or backlog numbers anywhere in the file.

**Suite skeleton** (written at GUARD 0; each RED step adds one `test(...)`):

```js
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const RUN_SKILL_PATH = path.join(ROOT, 'skills', 'run', 'SKILL.md');
const MODEL_SPEC_PATH = path.join(ROOT, 'docs', 'contributing', 'specs', 'model.md');
const RUN_RECORD_SPEC_PATH = path.join(ROOT, 'docs', 'contributing', 'specs', 'run-record.md');

const RETRY_TOKEN = 'MODEL-RETRY(';
const DEGRADED_TOKEN = 'MODEL-DEGRADED(';
const MODEL_TOKENS = [RETRY_TOKEN, DEGRADED_TOKEN];
const SAME_TIER_RETRY_PHRASE = 'retried ONCE on the same tier';
const TRANSIENT_RETRY_BULLET = '**Transient-overload retry**';
const RETIRED_SKILL_PHRASE = '(model down/overloaded/unknown';
const RETIRED_MODEL_SPEC_PHRASES = [
  'a model-availability error marks the tier degraded',
  'the model is down, overloaded, or returns an availability error',
  'it triggers core fallback re-resolution',
  'error triggers core fallback re-resolution',
];
const CHAIN_START = "→ the descriptor's `model:` field";
const CHAIN_END = '→ session model';

function normaliseWhitespace(text) {
  return text.replace(/\s+/g, ' ');
}

// Bounded slice so a token mentioned in an unrelated section cannot satisfy a
// region-scoped pin; a missing boundary fails loudly rather than widening to the
// whole file. Whitespace is collapsed so indented, word-wrapped bullets still match.
function sliceRegion(content, startPattern, endPattern) {
  const lines = content.split('\n');
  const startIdx = lines.findIndex((line) => startPattern.test(line));
  assert.notEqual(startIdx, -1, `region start ${startPattern} not found — heading renamed?`);
  const relativeEnd = lines.slice(startIdx + 1).findIndex((line) => endPattern.test(line));
  assert.notEqual(relativeEnd, -1, `region end ${endPattern} not found — heading renamed?`);
  return normaliseWhitespace(lines.slice(startIdx, startIdx + 1 + relativeEnd).join(' '));
}

function resolutionChainOf(content) {
  const text = normaliseWhitespace(content);
  const startIdx = text.indexOf(CHAIN_START);
  assert.notEqual(startIdx, -1, `chain start ${CHAIN_START} not found`);
  const endIdx = text.indexOf(CHAIN_END, startIdx);
  assert.notEqual(endIdx, -1, `chain end ${CHAIN_END} not found`);
  return text.slice(startIdx, endIdx + CHAIN_END.length);
}

const runSkill = fs.readFileSync(RUN_SKILL_PATH, 'utf8');
const modelSpec = fs.readFileSync(MODEL_SPEC_PATH, 'utf8');
const runRecordSpec = fs.readFileSync(RUN_RECORD_SPEC_PATH, 'utf8');
```

**Region boundaries** (each start pattern is unique in its file; checked at `5a63e08`):

| Region | File | start | end (exclusive) |
|---|---|---|---|
| invariant bullet | SKILL.md | `/^- \*\*Model resolution & fallback\*\*/` (:460) | `/^- \*\*Blockers\*\*/` (:473) |
| walk step 9 | SKILL.md | `/^9\. \*\*On model-down\*\*/` (:372) | ``/^`design` and `review` are already concern-named/`` (:375) |
| walk token list | SKILL.md | `/^### Run-record tokens/` (:187) | `/^\| Token \| Emitted by \|/` (:194) |
| family list | run-record.md | `/^## Token vocabulary/` (:73) | `/^\| Token \| Regex over/` (:80) |
| core policy | model.md | `/^## Core policy retained/` (:16) | `/^## Binding set/` (:34) |

**Prose rules for the edits.** Never break a backticked token across lines: the whole
`MODEL-DEGRADED(<tier>): fallback=<tier> cause=<overload|unavailable>` code span stays on one
line, which is why the GREEN 1 text gives it a line of its own. Wrap at about 90 columns,
following the surrounding text. Keep the 2-space bullet continuation indent in SKILL.md and
the 3-space step indent in step 9. Do not change the `(This is the Model port's
select/isAvailable …)` line at SKILL.md:471. Do not change the resolution chain in either file:
GUARD 0 pins it.

**Out of this part.** engine/src (run-state.js, resolve.js), the parsed Token-vocabulary
table, README.md, docs/guides/customizing.md, BACKLOG.md, and the opencode/Pi/Codex lines of
model.md (DP1). The backlog entry is closed at integrate, not here.

### TDD steps

1. **GUARD 0: resolution chain stays in sync.** Write the skeleton above and add:

   ```js
   test("Given skills/run/SKILL.md and docs/contributing/specs/model.md, when the resolution chain from the descriptor's model field to the session model is normalised, then both files state it identically", () => {
     const sut = resolutionChainOf(runSkill);

     const expected = resolutionChainOf(modelSpec);

     assert.strictEqual(sut, expected);
   });
   ```

   It passes now and must still pass after every later step. After whitespace
   normalisation, SKILL.md:461-463 and model.md:21-23 already carry the identical chain
   ``→ the descriptor's `model:` field (the canonical per-role tier; the agent-def frontmatter
   pin is the Claude binding of that same tier) → `models.fallback` → engine default
   `sonnet` → session model``.

2. **RED 1a: the invariant names both tokens and the same-tier retry.** Title:
   `Given the Model resolution & fallback bullet of skills/run/SKILL.md, when it is read, then it names MODEL-RETRY( and MODEL-DEGRADED( and says an overload is retried ONCE on the same tier`.
   `sut = sliceRegion(runSkill, <invariant start>, <invariant end>)`. Assert `sut.includes`
   for each `MODEL_TOKENS` entry and for `SAME_TIER_RETRY_PHRASE`. It fails because the
   bullet today (:464-470) marks the model degraded on any availability error. It names no
   token and has no same-tier retry.

   **RED 1b: the retired wording is gone.** Title:
   `Given skills/run/SKILL.md, when it is read, then it no longer says a bare model down/overloaded/unknown error degrades the tier`.
   `assert.ok(!sut.includes(RETIRED_SKILL_PHRASE))` with `sut = runSkill`. It fails
   because SKILL.md:465 still reads `(model down/overloaded/unknown — NOT a task blocker`.

3. **GREEN 1: rewrite the invariant body.** In skills/run/SKILL.md, replace :464-470.
   Line :464 is the one that starts `  tier as the spawn's model param). If a spawn dies…`,
   and :470 ends `…never pay the same dead spawn twice.`. Replace them with:

   ```text
     tier as the spawn's model param). If a spawn dies on a model-availability error
     (NOT a task blocker, which uses the blocker protocol), classify it. A transient
     overload (`529` / `overloaded_error`) is retried ONCE on the same tier,
     respawned from the artifact, recording `MODEL-RETRY(<role>): <tier> overload`.
     Any other availability error (model unknown, no access, switched off), an
     unclassifiable one, or an overload on that retry marks the model **degraded for
     the rest of the run**: record
     `MODEL-DEGRADED(<tier>): fallback=<tier> cause=<overload|unavailable>`,
     re-resolve to `models.fallback` if declared, else the engine default `sonnet`,
     else the session's own model (guaranteed available), then respawn from the
     artifact. Once a tier is known degraded this run, later spawns skip straight to
     the fallback — never pay the same dead spawn twice.
   ```

   RED 1a, RED 1b and GUARD 0 pass.

4. **RED 2: step 9 names both tokens.** Title:
   `Given step 9 of the skills/run/SKILL.md phase walk, when it is read, then it names MODEL-RETRY and MODEL-DEGRADED`.
   `sut = sliceRegion(runSkill, <step-9 start>, <step-9 end>)`. Assert that it includes
   `'MODEL-RETRY'` and `'MODEL-DEGRADED'`. It fails because step 9 (:372-373) reads
   `mark tier degraded; re-resolve to fallback; respawn from artifact. Record degradation
   in run record.` and names no token.

5. **GREEN 2: rewrite step 9.** Replace SKILL.md:372-373 with:

   ```text
   9. **On model-down** (not a task blocker): an overload retries once on the same
      tier (`MODEL-RETRY`); otherwise, or on a second overload, mark the tier degraded
      and re-resolve to fallback (`MODEL-DEGRADED`); respawn from artifact.
   ```

6. **RED 3: both token lists carry the two prefixes.** Title:
   `Given the run skill's Run-record tokens list and the run-record spec's family list, when each is read, then each names MODEL-RETRY( and MODEL-DEGRADED(`.
   Slice both regions (walk token list and family list). For every `MODEL_TOKENS` entry,
   assert that each slice includes it, with a message that names the file. It fails
   because neither list has a model token today: SKILL.md:189-191 ends at
   `` `AWAITING(propose):` ``, and run-record.md:75-78 ends at `` `SLOP-WAIVE(<file>):` ``.

7. **GREEN 3: add the prefixes to both lists.**
   - SKILL.md:190-191. Replace these two lines:

     ```text
     (`PHASE-START`, `PHASE-DONE`, `NO-OP(<phase>):`, `GATE(<phase>):`, `auto-skip:`, `WAIVER:`,
     `POLICY(...)`, `AWAITING(propose):`), these are emitted elsewhere — full definitions in
     ```

     with:

     ```text
     (`PHASE-START`, `PHASE-DONE`, `NO-OP(<phase>):`, `GATE(<phase>):`, `auto-skip:`, `WAIVER:`,
     `POLICY(...)`, `AWAITING(propose):`, `MODEL-RETRY(<role>):`, `MODEL-DEGRADED(<tier>):`),
     these are emitted elsewhere — full definitions in
     ```

     Line :192 (`` `docs/contributing/specs/run-record.md` Token vocabulary: ``) and the
     table below it are unchanged. test/run-record.test.js only checks that its own tokens
     are present, so this rewrap keeps it green.
   - run-record.md:78. Replace the whole line
     `` `SLOP-FOUND(<file>):`, `SLOP-WAIVE(<file>):`), all anchored at the start of `<record>`: ``
     with these two lines:

     ```text
     `SLOP-FOUND(<file>):`, `SLOP-WAIVE(<file>):`, `MODEL-RETRY(<role>):`,
     `MODEL-DEGRADED(<tier>):`), all anchored at the start of `<record>`:
     ```

     Keep the "Seven more fixed, greppable tokens…" sentence as it is. Those seven are the
     parsed-table tokens, and the two model tokens join the family, not the table.

8. **RED 4a: model.md Core policy carries the retry bullet.** Title:
   `Given the Core policy retained section of docs/contributing/specs/model.md, when it is read, then it carries a Transient-overload retry bullet`.
   `sut = sliceRegion(modelSpec, <core start>, <core end>)`; assert
   `sut.includes(TRANSIENT_RETRY_BULLET)`. It fails because the section (:16-32) has
   Resolution order, Degraded-tier memory, Supported class and model-down bullets, and no
   retry bullet.

   **RED 4b (DP2): model.md retires the degrade-at-once wording.** Title:
   `Given docs/contributing/specs/model.md, when it is normalised, then none of the retired degrade-at-once phrases remain`.
   `sut = normaliseWhitespace(modelSpec)`. For each `RETIRED_MODEL_SPEC_PHRASES` entry,
   assert `!sut.includes(phrase)`, with the phrase as the message. It fails because every
   phrase is present today. Counts on normalised text at `5a63e08`:

   | Phrase | Count | Where |
   |---|---|---|
   | `a model-availability error marks the tier degraded` | 2 | Claude `isAvailable` :45-46 (wraps across lines, so it matches only after normalisation), Copilot `isAvailable` :90 |
   | `the model is down, overloaded, or returns an availability error` | 1 | Runtime errors :127-128 |
   | `it triggers core fallback re-resolution` | 1 | Core policy :30 |
   | `error triggers core fallback re-resolution` | 1 | `## Failure → blocker` :112-113 |

   Two lines are deliberately not caught. The opencode line :73 reads
   `model-down triggers core fallback re-resolution`, which is still true for a binding with
   no pinned overload strings. The Codex line :107-108 reads
   `absent id marks the tier degraded`.

9. **GREEN 4: model.md edits.** All are in docs/contributing/specs/model.md. Each block
   below replaces whole lines, and every replacement was checked on a throwaway copy
   (suite 7/7, the adapter `native-surface` suites green).
   - Core policy: insert before `- **Degraded-tier memory**:` (:26):

     ```text
     - **Transient-overload retry**: a spawn that dies on a transient overload is respawned once on
       the same tier before the tier is degraded; any other availability error degrades at once.
       Keep identical to the "Model resolution & fallback" block in `skills/run/SKILL.md`.
     ```

   - (DP1) Core policy :30-32 (`- **model-down is not a task blocker**: it triggers core
     fallback re-resolution + respawn from` … `  runtime blocker.`) becomes:

     ```text
     - **model-down is not a task blocker**: it triggers the core retry-then-degrade policy above
       (one same-tier retry on a transient overload, else fallback re-resolution) + respawn from
       artifact. Only a tier that resolves to no provider/key with no fallback available is a
       runtime blocker.
     ```

   - Claude `isAvailable` :45-46 becomes:

     ```text
     `isAvailable`: attempt a minimal probe against the Claude API for the given tier; a
     model-availability error returns `false`; core decides whether that degrades the tier.
     ```

   - Copilot `isAvailable` :89-90 becomes:

     ```text
     `isAvailable`: probe whether the tier-mapped model is reachable for the configured seat or BYOK
     provider; a model-availability error returns `false`; core decides whether that degrades the
     tier.
     ```

   - (DP1) `## Failure → blocker` :112-114 (`**model-down is NOT a task blocker.** A spawn
     that fails …` through `core handles the rest.`) becomes:

     ```text
     **model-down is NOT a task blocker.** A spawn that fails on a model-availability error triggers
     the core retry-then-degrade policy (Core policy retained, above) + respawn-from-artifact. The
     adapter raises the model-down signal; core handles the rest.
     ```

   - Runtime errors :127-129 (`**Runtime errors** (knowable only at spawn time): …` through
     `…does the run escalate a blocker.`) becomes:

     ```text
     **Runtime errors** (knowable only at spawn time): an overloaded model gets one same-tier retry,
     then the degraded-tier path above; a model that is down, unknown, or refuses access takes the
     degraded-tier path above at once. These are not blockers. Only when no tier in the entire
     resolution order is reachable does the run escalate a blocker.
     ```

   - Leave these untouched: the Port interface :3-14, Pi :48-60, opencode :62-76 (including
     :73), and Codex :92-108.

   After GREEN 4, RED 4a, RED 4b and GUARD 0 pass, and the suite is 7/7.

10. **REFACTOR.** Look for duplicated assertion loops and fold them into one helper
    (for example, `assertNamesEveryToken(sut, label)`) only if two or more tests repeat it.
    Check that no comment in the test cites an ADR or the backlog. Run the gate, then
    `git --no-pager diff --no-ext-diff --stat`: it must list exactly the 4 files above.

### Gate

```bash
node --test test/model-retry-token.test.js
node --test test/run-record.test.js test/decision-tokens.test.js test/intention-token.test.js test/every-test-file-registers.test.js
```

Pipe each run to a file and read only the `# pass` / `# fail` lines. The phase gate,
`bash scripts/ci.sh`, runs at the phase boundary, not in this part.

### Commit

`fix(run): retry a transient model overload once before degrading the tier`
