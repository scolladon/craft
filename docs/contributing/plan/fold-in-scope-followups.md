# Plan — fold in-scope follow-ups

> Source: design doc `docs/contributing/design/fold-in-scope-followups.md` · ADRs 608, 609, 610, 611, 612
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

This change is prose plus prose pins. No `engine/src` delta, no new bin, no new exported
symbol, so there is no public-surface gate to pre-pay and no mutation scope. Two parts,
sequential, on one working tree:

| Part | What | Files | RED→GREEN cycles |
|---|---|---|---|
| 1 | the fold step (documentation step 3), the frontmatter description, the run skill's `delivery` (`documentation`) bullet | 3 | 3 |
| 2 | the `FOLDED` / `FILED` tokens, plus the design's fold candidate: the three greppable-only bullets move into `## Token vocabulary` | 4 | 2 |

Why the fold candidate (the bullet move) is merged into Part 2 instead of being its own
part: the new `FOLDED` / `FILED` bullets land in the same region as the moved ones, so
writing them in the right section first needs that section to hold the greppable-only
bullets. A standalone move would be one RED and one cut-paste, and that does not earn an
agent lifecycle. Merging keeps Part 2 at 2 cycles and 4 files.

Why Parts 1 and 2 stay separate even though both edit skills/documentation/SKILL.md and
skills/run/SKILL.md (plan-lint's cognitive-locality warning). Part 1 lands the fold rule
(ADRs 608, 609, 612), and Part 2 lands its record (ADRs 610, 611). Each commit stays
self-consistent and can be reverted on its own. Merged, the part would carry 4 GREEN
cycles, 9 RED/GUARD entries and 5 files, which sits at the sizing ceilings. Part 2's edits
to the two shared files are one table row and two appended sentences, at anchors Part 1
leaves fixed.

## Decision candidates

None. ADRs 608–612 decide every load-bearing choice this plan makes. The parts quote
their wording. The plan adds no choice of its own.

## Part 1 — The fold step in documentation synthesis, the frontmatter and the run delivery bullet

### Context

Files this part creates or edits:

- `test/fold-followups.test.js`: NEW. Sibling of test/decision-tokens.test.js and
  test/model-retry-token.test.js. ci.sh picks it up through `run_suite process test`, with
  no registration step.
- `skills/documentation/SKILL.md`: 54 lines. Edit the frontmatter line 3 and procedure step 3
  (L45–54, the end of the file).
- `skills/run/SKILL.md`: edit the phase-walk step-5 bullet at L334–335 only.

Read-only references (plain text on purpose):

- test/helpers/region-slice.js exports `{ FROM_TOP, TO_END, sliceRegion, sliceProse,
  normaliseWhitespace }`. `sliceProse(content, startRegExp, endRegExp | TO_END)` returns
  lines from the first start match up to (excluding) the first end match after it,
  joined, with whitespace runs collapsed to one space. A start or end that is not found
  throws an assertion error ("region start … not found — heading renamed?"). It never
  falls back to the whole file.
- Test style to copy: test/model-retry-token.test.js L1–12. `'use strict'`,
  `const { test } = require('node:test')`, `node:assert`, `node:fs`, `node:path`,
  `ROOT = path.resolve(__dirname, '..')`, then every literal as a named constant at the
  top. Titles are `Given …, when …, then …`, the body is AAA, and the value under test
  is named `sut`.
- test/craft-root-shim.test.js L19 and L29 pin exactly **1** `${CRAFT_ROOT:-…}/` shim in
  skills/documentation/SKILL.md (the one on L49, the PR-body template path) and **9** in
  skills/run/SKILL.md. The edits must keep the L49 shim line once, verbatim, and add none.
- ADR 608 (boundary), 609 (placement), 612 (fold reach) are under docs/contributing/adr/.
  The wording below is taken from them.

Current bytes being replaced.

skills/documentation/SKILL.md L3:

```text
description: Craft phase 9 - refresh affected documentation pages, tick the backlog entry under guard, author follow-ups; runs in parallel with the background validation run.
```

skills/documentation/SKILL.md L45–47 (L47 ends mid-sentence; L47's tail "The PR body
drafts here" through L54 stays byte-identical):

```text
3. **Synthesis — session-owned, never delegated:** new backlog follow-up entries
   surfaced during the run (full context, cross-links, placed per the repo's ordering
   convention); they are what a future craft run resolves from. The PR body drafts here
```

skills/run/SKILL.md L334–335:

```text
   - `delivery` (`documentation`): synthesis (follow-ups, backlog guard) — may
     parallel a running executing-harness
```

Target bytes.

New L3:

```text
description: Craft phase 9 - refresh affected documentation pages, tick the backlog entry under guard, fold in-scope findings into the PR and file the rest as follow-ups; runs in parallel with the background validation run.
```

New step 3. It replaces L45 up to the words "The PR body drafts here" on L47. Those
words open the final paragraph below, and everything after them is unchanged. Wrap
lines at about 90 columns, as the file does:

```text
3. **Synthesis — session-owned, never delegated.** Fold before file: every finding the
   run surfaced is triaged before any backlog entry is authored.
   1. **Inventory** every finding no phase resolved: out-of-scope lines in agent
      handbacks, triage EXCEPTIONs, the session's own observations, and discoveries from
      step 1. Read them from the ledger and the handbacks; nothing new is written for it.
   2. **Triage** each finding to one verdict, folded or filed:
      - A finding the brief or the design lists as out of scope is filed, whatever the
        boundary says.
      - It is in scope when its locus file is in `git diff --name-only <base>...HEAD`, or
        when it concerns a claim or behaviour the diff edits, or a statement that
        contradicts what the diff now makes true, in at most one file outside the diff.
        The run's own design, plan and ADR docs and `BACKLOG.md` are in the diff. A
        finding out of scope is filed.
      - An in-scope finding whose fix needs a new decision goes to the user through the
        blocker protocol `{ unit, reason, ≤3 options }`: fold it with an ADR authored
        through the decisions flow, or file it. It is never folded or filed silently.
      - An in-scope finding whose fix needs a paid or live probe, waits on an external
        trigger, or adds feature behaviour is filed.
      - Every other finding is folded.
   3. **Fold:** the session makes each fix itself, in prose, or in source and tests that
      add no feature behaviour. One commit per fold, typed by what it changes
      (`docs(<scope>):`, `fix(<scope>):`, `test(<scope>):`). A fold beyond prose commits
      only on a green `gates.part`. A fold that turns red is reverted and filed with
      `Not folded: the fix did not pass <gate> — <first failing line>`. The PR trailer
      names any source fold as outside the executing-harness run.
   4. **File** the rest as new backlog follow-up entries (full context, cross-links,
      placed per the repo's ordering convention); they are what a future craft run
      resolves from. Each entry carries one sentence that opens `Not folded: ` and gives
      the reason: out of scope, needs its own decision, needs a probe, or waits on an
      external trigger.

   No findings → the fold step records nothing. The PR body drafts here
```

The original L47 tail then continues, and it and L48–54 stay byte-identical: "too, per
the default template (repo's own templates/pr-body.md, else", then the L49 shim line, then
L50–54. They keep their 3-space indent and become step 3's trailing paragraph.

New run skill bullet (L334–336):

```text
   - `delivery` (`documentation`): synthesis (fold in-scope findings into this PR, file
     the rest as follow-ups, backlog guard) — may parallel a running
     executing-harness
```

Pins (constants at the top of the new suite, exact JS):

```js
const DOC_SKILL_PATH = path.join(ROOT, 'skills', 'documentation', 'SKILL.md');
const RUN_SKILL_PATH = path.join(ROOT, 'skills', 'run', 'SKILL.md');
const SYNTHESIS_START = /^3\. \*\*Synthesis/;
const DESCRIPTION_START = /^description: /;
const FRONTMATTER_END = /^---$/;
const DOC_BULLET_START = /^\s+- `delivery` \(`documentation`\):/;
const PROPOSE_BULLET_START = /^\s+- `delivery` \(`propose`\):/;
const NOT_FOUND = -1;
const VERDICT_PHRASES = ['folded', 'filed', '`Not folded: `', 'blocker protocol',
  'the brief or the design lists as out of scope'];
const BOUNDARY_PHRASES = ['git diff --name-only <base>...HEAD',
  'in at most one file outside the diff', 'contradicts what the diff now makes true',
  'add no feature behaviour', 'gates.part', 'outside the executing-harness run',
  'Not folded: the fix did not pass'];
const FOLD_STEP_PHRASE = 'Fold before file';
const AUTHORING_PHRASE = 'new backlog follow-up entries';
const FOLD_PHRASE = 'fold in-scope findings';
const RETIRED_DESCRIPTION_PHRASE = 'author follow-ups';
const FILE_REST_PHRASE = 'file the rest';
```

### TDD steps

1. RED: `Given the documentation skill's synthesis step, when its region is read, then it
   names both verdicts, the Not folded sentence, the user route for a decision and the
   brief-exclusion rule`. `sut = sliceProse(doc, SYNTHESIS_START, TO_END)`. Assert that
   it includes every entry of `VERDICT_PHRASES`.
   Fails because: step 3 today only says "new backlog follow-up entries …" and holds no
   verdict word, no `Not folded: ` and no blocker protocol. The only blocker-protocol
   mention in the file is in the Preamble (L17), which is outside the region.
2. RED: `Given the documentation skill's synthesis step, when its region is read, then it
   states the scope boundary and what a fold may change`. Same `sut`. Assert that it
   includes every entry of `BOUNDARY_PHRASES`.
   Fails because: step 3 states no boundary and no fold reach. None of these phrases is
   anywhere in the file.
3. RED: `Given the documentation skill's synthesis step, when the fold step and the
   entry-authoring phrase are located, then the fold step comes first`. Same `sut`.
   `foldIdx = sut.indexOf(FOLD_STEP_PHRASE)`,
   `authorIdx = sut.indexOf(AUTHORING_PHRASE)`. Assert `foldIdx !== NOT_FOUND`,
   `authorIdx !== NOT_FOUND` and `foldIdx < authorIdx`.
   Fails because: `'Fold before file'` is absent (`foldIdx` is `-1`). The authoring
   phrase sits at the head of step 3.
4. GREEN: replace documentation L45–47's head with the new step 3 from Context. Run
   `node --test test/fold-followups.test.js` and steps 1–3 pass.
5. RED: `Given the documentation skill's frontmatter, when its description is read, then
   it names folding in-scope findings and no longer says author follow-ups`.
   `sut = sliceProse(doc, DESCRIPTION_START, FRONTMATTER_END)`. Assert that it includes
   `FOLD_PHRASE` and does not include `RETIRED_DESCRIPTION_PHRASE`.
   Fails because: L3 still reads "… under guard, author follow-ups; …".
6. GREEN: replace L3 with the new description.
7. RED: `Given the run skill's delivery documentation bullet, when it is read up to the
   propose bullet, then it names the fold step`.
   `sut = sliceProse(run, DOC_BULLET_START, PROPOSE_BULLET_START)`. Assert that it
   includes `FOLD_PHRASE` and `FILE_REST_PHRASE`.
   Fails because: the bullet reads "synthesis (follow-ups, backlog guard)" and holds
   neither phrase. The only "fold" in the run skill is L64, which is outside the region.
8. GREEN: replace run skill L334–335 with the new bullet.
9. GUARD: `node --test test/craft-root-shim.test.js`. It passes because the L49 shim line
   is kept once, verbatim, and the run-skill bullet carries no shim (counts stay 1 and 9).
10. REFACTOR: hoist the repeated `sliceProse(doc, SYNTHESIS_START, TO_END)` into one
    top-level `const synthesis = …` read once, if more than two tests use it. Keep each
    test's assertions on its own requirement. No other refactor.

### Gate

Targeted first: `node --test test/fold-followups.test.js test/craft-root-shim.test.js`.
Then the part gate: `bash scripts/ci.sh > <scratch>/ci.out 2>&1; echo $?` must print `0`.
`<scratch>` is a `mktemp -d` directory outside the worktree. On non-zero, read only the
failing lines (`grep -n "not ok\|^ci:\|FOUND" <scratch>/ci.out`) and the tail. Never
commit on a red gate.

### Commit

`docs(documentation): fold in-scope findings before filing follow-ups`

Stage exactly `test/fold-followups.test.js`, `skills/documentation/SKILL.md` and
`skills/run/SKILL.md` with `/usr/bin/git add <paths>`, then
`/usr/bin/git commit -m "<message>"`. One-line message, no body, no trailers.

## Part 2 — The FOLDED and FILED ledger tokens, and the greppable-only bullets moved into the Token vocabulary

### Context

Builds on Part 1's committed tree. Files this part edits:

- `test/fold-followups.test.js`: extend it (Part 1 created it). Add constants
  `RUN_RECORD_SPEC_PATH = path.join(ROOT, 'docs', 'contributing', 'specs',
  'run-record.md')`, `FOLDED_TOKEN = 'FOLDED(<file>):'`, `FILED_TOKEN = 'FILED(<file>):'`,
  `VOCABULARY_START = /^## Token vocabulary/`, `COMPACTION_START = /^## Compaction
  survival/`, `NEXT_H2 = /^## /`, `RUN_TOKENS_START = /^### Run-record tokens/`,
  `GREPPABLE_ONLY_TOKENS = ['DECISION-REVERSAL(ADR-NNN):', 'DECISION-CITE-WAIVE(<file>):',
  'MEMORY-RETRACT(<concern>):']`.
- `docs/contributing/specs/run-record.md`: sections today are `## Token vocabulary` L73,
  `## Compaction survival` L94 and `## The absent-file case` L149. The vocabulary region
  (L73–93) holds the intro family list, the parsed-token table (header
  "| Token | Regex over `<record>` | Emitted by |", 7 rows) and the paragraph "A record
  that starts with a new token's literal prefix … instead of parsing." The three
  greppable-only bullets sit at L111–147, after the Compaction survival hook text (L96–109,
  ending "…/findings/background."). They open with the DECISION-REVERSAL(ADR-NNN),
  DECISION-CITE-WAIVE(file) and MEMORY-RETRACT(concern) code spans, and the last one
  carries its indented "On-ledger rendering." paragraph (L138–147). L148 is blank.
- `skills/run/SKILL.md`: `### Run-record tokens` (L187–203). Its `| Token | Emitted by |`
  table has 5 rows and ends at L203 with the `MEMORY-RETRACT(<concern>)` row. The next H2
  is `## Phase walk (driven by Resolution.effective[])`.
- `skills/documentation/SKILL.md`: Part 1's step 3, sub-steps 3 (**Fold**) and 4 (**File**).

Read-only references:

- ADR 610 (tokens, greppable-only, documented in the vocabulary and the run skill's token
  table, templates/pr-body.md unchanged) and ADR 611 (the parameter is the finding's
  repo-relative locus file, one line per file).
- Suites that must stay green, and why they do:
  - test/run-record.test.js L108 slices `## Token vocabulary` → `/^## /` and needs the 7
    parsed tokens. Adding bullets keeps them.
  - test/run-record.test.js L125 slices `## Compaction survival` → `/^## /` and needs
    hooks/reorient-after-compact.sh and hooks/steer-compact-summary.sh. Those
    paragraphs do not move.
  - test/model-retry-token.test.js L130 slices both files only up to their table headers,
    so a new row or a new bullet after the table is invisible to it.
  - test/decision-tokens.test.js greps whole files for `DECISION-REVERSAL(`,
    `DECISION-CITE-WAIVE(` and `MEMORY-RETRACT(`, so the move keeps them in the file.
  - test/craft-root-shim.test.js counts stay 1 and 9, because this part adds no shim.

Target bytes.

run-record.md. Cut L111–147 (the three bullets, verbatim, including the indented
**On-ledger rendering.** paragraph and its blank line) from under `## Compaction
survival`. Paste them into `## Token vocabulary` after the "A record that starts with a new
token's literal prefix …" paragraph, behind this one-line lead-in, and append two new
bullets after the `MEMORY-RETRACT` bullet's block:

```text
These tokens are greppable only: no regex row, and `run-state` does not consume them.

<the three moved bullets, verbatim>
- `FOLDED(<file>): <finding> -> <sha>` — emitted by the `documentation` phase's
  synthesis fold step, one line per folded finding, appended after its fold commit.
  `<file>` is the finding's repo-relative locus file; a fold that spans several files
  writes one line per file. `<sha>` is the fold commit. Nothing splits on the ` -> `.
- `FILED(<file>): <finding> — not folded: <reason>` — emitted by the same step, one line
  per finding filed as a backlog entry, appended after the entry commit. `<file>` is keyed
  as for `FOLDED`, so both verdicts on one file grep by the same key; `<reason>` is the
  entry's `Not folded: ` sentence. Both tokens reach the PR trailer as run-record lines.
```

Leave one blank line before `## Compaction survival`. The Compaction survival section
then ends at its "Rebuild … restore …" paragraph.

skills/run/SKILL.md. Append one row after the `MEMORY-RETRACT` row (L203):

```text
| `FOLDED(<file>): <finding> -> <sha>`, `FILED(<file>): <finding> — not folded: <reason>` | the `documentation` phase's synthesis fold step, one line per finding and locus file |
```

skills/documentation/SKILL.md. Add a final sentence to sub-step 3 (**Fold**): "After each
fold commit, append `FOLDED(<file>): <finding> -> <sha>` to the ledger, one line per locus
file." Add a final sentence to sub-step 4 (**File**): "After each entry commit, append
`FILED(<file>): <finding> — not folded: <reason>` to the ledger." Both sentences are
session-written. Only the orchestrator appends to the ledger (skills/run/SKILL.md
L182–185), and synthesis is session-owned, so the two rules agree.

### TDD steps

1. RED: `Given the run-record spec, the run skill's token table and the documentation
   synthesis step, when each region is read, then each names both fold tokens`. Build
   three `sut`s: `sliceProse(spec, VOCABULARY_START, NEXT_H2)`,
   `sliceProse(run, RUN_TOKENS_START, NEXT_H2)` and
   `sliceProse(doc, SYNTHESIS_START, TO_END)`. Assert that each includes `FOLDED_TOKEN`
   and `FILED_TOKEN`. Report the failing surface in the assertion message.
   Fails because: no file in the tree holds `FOLDED(` or `FILED(`
   (`grep -rn "FOLDED\|FILED" skills docs/contributing/specs test` prints nothing).
2. RED: `Given the run-record spec, when the token-vocabulary and compaction-survival
   regions are read, then the greppable-only tokens sit in the vocabulary and not under
   compaction survival`. Build `vocabulary = sliceProse(spec, VOCABULARY_START, NEXT_H2)`
   and `compaction = sliceProse(spec, COMPACTION_START, NEXT_H2)`. For each of
   `GREPPABLE_ONLY_TOKENS`, assert `vocabulary.includes(token)` and
   `!compaction.includes(token)`.
   Fails because: the three bullets sit at L111–147, inside `## Compaction survival`
   (L94–148), so the vocabulary region (L73–93) lacks them.
3. GREEN: move the bullets and add the lead-in plus the two new bullets in run-record.md,
   append the run skill row, and add the two documentation sentences, all from Context.
   Steps 1–2 pass.
4. GUARD: `Given the run-record spec's parsed-token table, when its rows are read, then
   neither fold token has a regex row`. Use `sliceRegion(spec, VOCABULARY_START,
   NEXT_H2)` (import `sliceRegion` too), split it into lines, keep only the lines that
   start with `|`, and assert that none includes `'FOLDED('` or `'FILED('`. It passes
   because ADR 610 makes both tokens greppable-only: the bullets go after the table and
   no row is added. It pins that decision against a later regex row.
5. GUARD: `node --test test/run-record.test.js test/model-retry-token.test.js
   test/decision-tokens.test.js test/craft-root-shim.test.js`. These pass for the reasons
   listed in Context.
6. REFACTOR: none beyond keeping the new constants grouped with Part 1's at the top of
   the suite.

### Gate

Targeted first: `node --test test/fold-followups.test.js test/run-record.test.js
test/model-retry-token.test.js test/decision-tokens.test.js test/craft-root-shim.test.js`.
Then the part gate (also the phase gate):
`bash scripts/ci.sh > <scratch>/ci.out 2>&1; echo $?` must print `0`. `<scratch>` is a
`mktemp -d` directory outside the worktree. On non-zero, read only
`grep -n "not ok\|^ci:\|FOUND" <scratch>/ci.out` and the tail. Never commit on a red
gate.

### Commit

`docs(run-record): add the FOLDED and FILED ledger tokens beside the greppable-only family`

Stage exactly `test/fold-followups.test.js`, `docs/contributing/specs/run-record.md`,
`skills/run/SKILL.md` and `skills/documentation/SKILL.md` with
`/usr/bin/git add <paths>`, then `/usr/bin/git commit -m "<message>"`. One-line message,
no body, no trailers.
