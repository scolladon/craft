# Plan — waiver-mention-not-waiver

> Source: design doc `docs/contributing/design/waiver-mention-not-waiver.md` · ADRs `479, 480, 481, 482, 483, 484`
> (all six take the design's recommended options: a waiver is a column-0
> `TOKEN(<path>): <reason>` line outside a fenced block (479); the rule covers
> `DECISION-CITE-WAIVE` too (480); DC-1 (a) the core composes the anchored pattern (481);
> DC-2 (a) column 0 only (482); DC-3 (a) a non-empty reason is required (483); DC-4 (a) a
> line-based CommonMark fence subset (484))
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

## Plan shape (2 parts)

| # | Part | Size class | src delta | Files |
|---|---|---|---|---|
| 1 | Honour only anchored waiver lines outside fenced blocks | pure-module | `engine/src/hygiene-lint-core.js` (+85 / −6) | the core, its suite, the three gate `main` suites |
| 2 | State the anchored waiver rule in the waiver docs | docs-prose | none | the run-record spec, the propose skill |

The gate-level pins (one mid-sentence mention per gate, the propose self-waiver shape, a
fenced `DECISION-CITE-WAIVE`) are folded into Part 1, not a separate test part. They
exercise Part 1's code, and five of the six are RED against the shipped tree, so they are
Part 1's own RED entries; a standalone pin part after Part 1 would be a pure test pass over
landed code. Part 1 then holds 5 files and 2 RED→GREEN cycles. The docs edits stay apart:
folding them in would put 7 files in one Context block.

Every edit below was applied to a throwaway `git clone` of the branch tip (`c306650`) and
checked there:

| Check | Shipped src | After Part 1 step 8 (anchor) | After Part 1 step 12 (fences) | After Part 2 |
|---|---|---|---|---|
| the four touched engine suites | 156 pass / 10 fail (the 10 new RED) | 164 / 2 fail (the two fence REDs) | 166 / 0 | — |
| `npm --prefix engine test` | — | — | 2825 / 0 fail | — |
| Part 2's doc pins (four suites) | — | — | — | 63 / 0 fail |
| `bash scripts/ci.sh` (after committing in the clone) | — | — | — | exit 0 |
| bin-level repro (Part 1 Gate), stub / prose mention | exit 0 / 0 | — | exit 2 / 2 | — |
| bin-level anchored waiver / propose self-waiver | exit 0 / 0 | — | exit 0 / 0 | — |

Mutants run by hand against the final core suite (same edit, one at a time). All killed
except the one documented equivalent:

| Mutant | Killed by (row) |
|---|---|
| opener backtick `{3,}` → `{3}` | fenced: four-backtick fence |
| opener tilde `{3,}` → `{3}` | fenced: shorter tilde run does not close |
| closer `{3,}` → `{3}` | closes: four-backtick fence closed |
| opener ``[^`]*`` dropped or negated | closes: inline triple backticks are not an opener |
| opener `[ \t]*` dropped or negated | fenced: list-indented fence |
| closer `[ \t]*` dropped | closes: indented fence closed by an indented closer |
| opener `^` dropped | closes: inline triple backticks are not an opener |
| closer `^` dropped | fenced: run after text does not close |
| opener `$` dropped | closes: inline triple backticks are not an opener |
| closer `$` dropped | fenced: closer with trailing text does not close |
| closer `\s*` dropped or `\s*` → `\S*` | closes: CRLF fence closed |
| tilde `.*` dropped | closes: tilde fence with a backtick info string |
| `>=` → `>` in `closesFence` | closes: backtick fence closed |
| same-char check dropped | fenced: other character does not close |
| length check dropped | fenced: shorter run does not close |
| `closesFence` body → `true`, `&&` → `\|\|` | fenced rows |
| `match[1] ?? match[2]` → `&&` | fenced: backtick fence |
| `fence = undefined` reset dropped | closes: backtick fence closed |
| `continue` dropped | fenced: backtick fence |
| `fence !== undefined` → `===` | fenced rows |
| `if (match === null) return false;` dropped | fenced and closes tests (a non-closer line throws) |
| `^` dropped from the anchor template | not-start-of-line: indented |
| `WAIVER_REASON` → empty, `\S` dropped, `\s*` dropped | no-reason rows |
| `.trim()` dropped | anchored: padded path |
| `if (match)` → `true` | every collectWaived test (a non-waiver line throws) |
| `split('\n')` → `split('')` | anchored: bare line |
| `if (fence === undefined) lines.push(line)` → `if (true)` | SURVIVES — equivalent; comment pre-paid beside it |

## Public-surface decision

No new exported symbol. `FENCE_OPENER`, `FENCE_CLOSER`, `WAIVER_REASON`, `anchorWaiver`,
`openedFence`, `closesFence`, `unfencedLines` and `waivedPaths` are module-private in
`engine/src/hygiene-lint-core.js`. `collectWaived` keeps its exported signature
`(waiverSources, io, waiverPattern, maxBytes = MAX_FILE_BYTES, base = process.cwd())` and
return shape `{ waived: Set<string>, readError: boolean }`. The three gate constants, the
adr-lint call site and the core `main` are unchanged. The core suite starts importing the
already-exported `MAX_FILE_BYTES`. No barrel, README surface, registry or API report is
touched, so no surface gate applies.

## Decision candidates

None. Every load-bearing choice is ratified by ADR 479 to ADR 484, and the plan follows
them. Details the design left implicit are fixed here, not by a decision:

- The per-line loop lives in a private `waivedPaths(content, anchored)` so `collectWaived`
  keeps two nesting levels (a `for` over sources, a `for` over paths) instead of three.
- Four rows join the design's edge matrix, each to kill a mutant the matrix leaves alive
  (proven by the hand-mutation run above): run after text does not close (closer `^`),
  shorter tilde run does not close (tilde `{3,}`), indented fence closed by an indented
  closer (closer `[ \t]*`), CRLF fence closed (closer `\s*`).
- The one equivalent mutant (`if (fence === undefined)` forced true) gets its house-form
  `equivalent mutant (...)` comment in Part 1, since it is already proven.

## Validation-phase notes

- Stryker: `engine/src/**/*.js` is in scope (engine/stryker.conf.json, runner `tap`, not
  vitest). Mutate only the Part 1 hunks of `engine/src/hygiene-lint-core.js`, passed as ONE
  comma-separated `--mutate` value (repeated flags drop all but the last). Narrow the test
  corpus with an override of engine/stryker.conf.json whose `tap.testFiles` lists only
  engine/test/hygiene-lint-core.test.js, engine/test/stub-lint-main.test.js,
  engine/test/prose-lint-main.test.js and engine/test/adr-lint-main.test.js. Hand-check
  any survivor against that full set. Stryker does not mutate inside the anchor template
  literal; the `^` drop there was hand-mutated (killed).
- Pre-existing advisory findings: `node engine/bin/stub-lint.js --gate blocking --
  engine/src/hygiene-lint-core.js` reports `STUB@L7` (header text `SLOP/STUB-WAIVE`) and
  `STUB@L18` (`stub/prose target`) on the shipped tree (`STUB@L19` after Part 1, same
  line shifted). `hygiene.gate` is `advisory` here, so `ci.sh` stays green. Out of scope:
  do not reword them, and do not add new marker words in Part 1 comments.
- Bin-level proof trap: on macOS `$TMPDIR` is a symlink, and the bins only run `main`
  when `process.argv[1]` equals their realpath. Invoke them through a realpath'd checkout
  path (`$(pwd -P)`), or a throwaway run exits 0 silently and proves nothing.
- R1 is proven by the unit pins and the bin commands in the Part 1 Gate, not by `ci.sh`'s
  quiet hygiene block: this branch's design doc and ADRs quote the tokens and are waiver
  sources on their own branch.
- BACKLOG.md entry "A waiver token quoted in prose is a live waiver." (:180) is flipped by
  the orchestrator in the documentation phase; no part edits BACKLOG.md.

## Part 1 — Honour only anchored waiver lines outside fenced blocks

### Context

**What changes.** `collectWaived` counts every waiver-token match anywhere in a
`--waiver-source` file (shipped :86,
`for (const match of content.matchAll(waiverPattern)) waived.add(resolve(base, match[1].trim()));`).
After this part, a waiver is a line that starts at column 0 with the gate's token followed
by `:` and a non-empty reason, and lies outside a fenced code block. Every other occurrence
(mid-sentence, inline code span, bullet, indented, table cell, blockquote, fenced, no colon,
empty reason, second token on a line) waives nothing. The fix covers all three gates
(stub-lint, prose-lint, adr-lint), because all three reach this one function.

**Files edited.**

- `engine/src/hygiene-lint-core.js` (shipped 175 lines, ESM).
  - :1-10 module header; :5-9 describe the gates' `ctx`. Step 13 extends the last
    sentence (:9) with the waiver grammar.
  - :15-19 `EXIT_OK`, `EXIT_FOUND`, exported `MAX_FILE_BYTES = 5_000_000`.
  - :39 the house equivalent-mutant comment form:
    `// equivalent mutant (<Mutator> <what>): <why>` on one line.
  - :62-73 `collectWaived` JSDoc; :74-89 `export function collectWaived(waiverSources, io,
    waiverPattern, maxBytes = MAX_FILE_BYTES, base = process.cwd())`; it calls
    `readWithinCap(source, io, maxBytes, label)` (exported, :102) per source, sets `readError`, skips
    oversize (`content === undefined`), then the faulty :86.
  - Insert the new private block between `parseArgs` (ends :60) and the `collectWaived`
    JSDoc (:62). Leave `parseArgs`, `readWithinCap`, `scanFile`, `main`, `escapeRegExp`
    untouched.
- `engine/test/hygiene-lint-core.test.js` (394 lines, node:test ESM).
  - :6-14 import list from ../src/hygiene-lint-core.js; add `MAX_FILE_BYTES` after
    `escapeRegExp`.
  - Helpers: `tmpRoot()` (:20, mkdtemp `hygienecore-`, cleaned in `after`),
    `writeFixture(root, name, content)` (:26, returns the absolute path),
    `WAIVER = /X-WAIVE\(([^)]+)\)/g` (:32), `makeCaptureIo()` (imported from
    engine/test-helpers/capture-io.js; `io.stderr.joined()` / `io.stdout.joined()`).
  - `collectWaived` block :66-90. Insert the new block after :90 (the closing `});` of
    the unreadable-source test), before the `// ─── scanFile` banner.
  - Existing waiver fixtures that MUST stay green unedited: :71, :229, :242, :386.
- `engine/test/stub-lint-main.test.js` (335 lines). Helpers `tmpRoot()` :15,
  `writeFixture(root, relPath, content)` :21 (creates parent dirs). Model test :87-98
  (anchored waiver clears a blocking finding). Insert the new test after :98. Finding
  format: `STUB-FOUND(<abs path>): TODO@L1`. Keep :91, :204 (padded path) unedited.
- `engine/test/prose-lint-main.test.js` (260 lines). Same helpers (:15, :21); imports
  `join` from node:path already. Model test :135-146. Insert after :146. Finding format:
  `SLOP-FOUND(<abs path>): <ban-list entry>` (ban list: delve, leverage, seamless,
  robust, it's important to note, in conclusion). Keep :139, :253 unedited.
- `engine/test/adr-lint-main.test.js` (1623 lines). Helpers: `writeFixture` :34,
  `gitTmpRoot()` :45 (realpath'd mkdtemp), `stageAll(root)` :59 (git init + add -A),
  `writeCleanSupersession(root, targetId, superId)` :377. Model test :874-891 (a
  repo-relative waiver for live/note.md, exit 0). Insert two tests after :891. Finding
  format: `DECISION-CITE-FOUND(live/note.md): ADR-001@L1` (see :400-415). Keep :439 and
  :882 unedited.

**Read-only references.** engine/src/stub-lint-main.js :14, engine/src/prose-lint-main.js
:21 and engine/src/adr-lint-main.js :38 hold the bare gate constants (path in group 1,
`g` flag) — do NOT edit them; engine/src/adr-lint-main.js :681 calls
`collectWaived(sources, io, WAIVER_PATTERN, MAX_FILE_BYTES, repoRoot)` — unchanged.
engine/test-helpers/capture-io.js. The design's § Edge matrix maps each row id used below.

**Style.** node:test, Given/When/Then titles, AAA bodies with blank lines between phases,
`const sut = <function>;` in every test, no provenance numbers in titles or comments.
Table rows share one test per assertion shape, the row name in each assertion message.

### TDD steps

1. **RED — the proven repro (R1).** Add `MAX_FILE_BYTES` to the import list first, then
   append this scaffolding and test after :90:
   ~~~js

   // ─── collectWaived: a waiver is an anchored line outside a fenced block ────

   const WAIVED_PATH = 'p.js';
   const ANCHORED_WAIVER = 'X-WAIVE(p.js): r';
   const BACKTICK_FENCE = '```';

   function waivedFrom(sut, content) {
     const root = tmpRoot();
     const source = writeFixture(root, 'w.md', content);
     const { waived } = sut([source], makeCaptureIo(), WAIVER, MAX_FILE_BYTES, root);
     return { waived: [...waived], root };
   }

   test('Given a waiver token quoted mid-sentence, when collectWaived runs, then nothing is waived', () => {
     const sut = collectWaived;
     const root = tmpRoot();
     const source = writeFixture(root, 'w.md', 'We note X-WAIVE(foo.js) in passing.\n');
     const io = makeCaptureIo();

     const { waived, readError } = sut([source], io, WAIVER, MAX_FILE_BYTES, root);

     assert.equal(readError, false);
     assert.deepEqual([...waived], []);
   });
   ~~~
   Fails today: `matchAll` over the whole content waives `<root>/foo.js`.

2. **RED — a token that does not start its line is inert (R4-a…e).**
   ~~~js
   test('Given a waiver token that does not start its line, when collectWaived runs, then each one is inert', () => {
     const sut = collectWaived;
     const rows = [
       ['inline code span', `\`${ANCHORED_WAIVER}\`\n`],
       ['bullet', `- ${ANCHORED_WAIVER}\n`],
       ['indented', `  ${ANCHORED_WAIVER}\n`],
       ['table cell', `| ${ANCHORED_WAIVER} |\n`],
       ['blockquote', `> ${ANCHORED_WAIVER}\n`],
     ];

     for (const [row, content] of rows) {
       const { waived } = waivedFrom(sut, content);

       assert.deepEqual(waived, [], `${row}: waived ${waived}`);
     }
   });
   ~~~
   Fails today at `inline code span`: `<root>/p.js` is waived.

3. **RED — no colon or an empty reason is inert (R7-a…c).**
   ~~~js
   test('Given a column-0 waiver token without a non-empty reason, when collectWaived runs, then each one is inert', () => {
     const sut = collectWaived;
     const rows = [
       ['no colon', 'X-WAIVE(p.js)\n'],
       ['empty reason', 'X-WAIVE(p.js):\n'],
       ['empty reason, CRLF', 'X-WAIVE(p.js):\r\n'],
     ];

     for (const [row, content] of rows) {
       const { waived } = waivedFrom(sut, content);

       assert.deepEqual(waived, [], `${row}: waived ${waived}`);
     }
   });
   ~~~
   Fails today at `no colon`: the bare token waives `<root>/p.js`.

4. **RED — one waiver per line (R8).**
   ~~~js
   test('Given two waiver tokens on one line, when collectWaived runs, then only the column-0 one is waived', () => {
     const sut = collectWaived;

     const { waived, root } = waivedFrom(sut, 'X-WAIVE(p.js): r X-WAIVE(q.js): s\n');

     assert.deepEqual(waived, [resolve(root, WAIVED_PATH)]);
   });
   ~~~
   Fails today: both `<root>/p.js` and `<root>/q.js` are waived.

5. **GUARD — anchored lines keep waiving (R2-a, R5, R6-a).**
   ~~~js
   test('Given an anchored waiver line, when collectWaived runs, then exactly its trimmed path is waived', () => {
     const sut = collectWaived;
     const rows = [
       ['bare line', `${ANCHORED_WAIVER}\n`],
       ['padded path', 'X-WAIVE(  p.js  ): r\n'],
       ['CRLF line', `${ANCHORED_WAIVER}\r\n`],
     ];

     for (const [row, content] of rows) {
       const { waived, root } = waivedFrom(sut, content);

       assert.deepEqual(waived, [resolve(root, WAIVED_PATH)], row);
     }
   });
   ~~~
   Passes today: `matchAll` matches each line once and trims the capture. It constrains
   the GREEN (step 8) so the anchor keeps the trim, tolerates `\r`, and keeps group 1.

6. **RED — gate-level mention pins (R1 per gate).**
   - engine/test/stub-lint-main.test.js, after :98:
     ~~~js

     test('Given a waiver source that only quotes the token mid-sentence, when main runs with --gate blocking, then the finding stands and it exits 2', () => {
       const sut = main;
       const root = tmpRoot();
       const seeded = writeFixture(root, 'seeded.js', '// TODO fix this\n');
       const waiverSource = writeFixture(root, 'mention.md', `We note STUB-WAIVE(${seeded}): tracked elsewhere in passing.\n`);
       const io = makeCaptureIo();

       const result = sut(['--gate', 'blocking', '--waiver-source', waiverSource, seeded], io);

       assert.equal(result, 2, `stderr: ${io.stderr.joined()}`);
       assert.ok(io.stdout.joined().includes(`STUB-FOUND(${seeded}): TODO@L1`), `stdout was: ${io.stdout.joined()}`);
     });
     ~~~
   - engine/test/prose-lint-main.test.js, after :146 (the same mention case, plus the
     propose self-waiver written mid-sentence; the body file is both waiver source and
     scan target, as skills/propose/SKILL.md runs it):
     ~~~js

     test('Given a waiver source that only quotes the token mid-sentence, when main runs with --gate blocking, then the finding stands and it exits 2', () => {
       const sut = main;
       const root = tmpRoot();
       const seeded = writeFixture(root, 'seeded.md', 'A seamless integration.\n');
       const waiverSource = writeFixture(root, 'mention.md', `We note SLOP-WAIVE(${seeded}): tracked elsewhere in passing.\n`);
       const io = makeCaptureIo();

       const result = sut(['--gate', 'blocking', '--waiver-source', waiverSource, seeded], io);

       assert.equal(result, 2, `stderr: ${io.stderr.joined()}`);
       assert.ok(io.stdout.joined().includes(`SLOP-FOUND(${seeded}): seamless`), `stdout was: ${io.stdout.joined()}`);
     });
     ~~~
     ~~~js

     test('Given a body that is its own waiver source quoting the token mid-sentence, when main runs with --gate blocking, then the finding stands and it exits 2', () => {
       const sut = main;
       const root = tmpRoot();
       const body = join(root, 'body.md');
       writeFixture(root, 'body.md', `We delve here. We note SLOP-WAIVE(${body}): deliberate in passing.\n`);
       const io = makeCaptureIo();

       const result = sut(['--gate', 'blocking', '--waiver-source', body, '--', body], io);

       assert.equal(result, 2, `stderr: ${io.stderr.joined()}`);
       assert.ok(io.stdout.joined().includes(`SLOP-FOUND(${body}): delve`), `stdout was: ${io.stdout.joined()}`);
     });
     ~~~
   - engine/test/adr-lint-main.test.js, after :891:
     ~~~js

     test('Given a waiver source that only quotes DECISION-CITE-WAIVE mid-sentence, when main runs, then the citation finding stands', () => {
       const sut = main;
       const root = gitTmpRoot();
       writeCleanSupersession(root, '001', '002');
       writeFixture(root, 'live/note.md', 'Restates ADR-001.\n');
       const waiverSource = writeFixture(
         root,
         'waivers.md',
         'We note DECISION-CITE-WAIVE(live/note.md): deliberate historical quote in passing.\n',
       );
       stageAll(root);
       const io = makeCaptureIo();

       const result = sut([join(root, 'adr'), '--waiver-source', waiverSource], io);

       assert.equal(result, 2, `stdout was: ${io.stdout.joined()}`);
       assert.ok(io.stdout.joined().includes('DECISION-CITE-FOUND(live/note.md): ADR-001@L1'), `stdout was: ${io.stdout.joined()}`);
     });
     ~~~
   All four fail today: the mid-sentence token waives the target, so `main` returns 0
   (expected 2) and prints no finding.

7. **GUARD — the propose self-waiver shape keeps working (R2).** In
   engine/test/prose-lint-main.test.js, between the two prose tests of step 6:
   ~~~js

   test('Given a body that is its own waiver source with an anchored waiver line, when main runs with --gate blocking, then it exits 0', () => {
     const sut = main;
     const root = tmpRoot();
     const body = join(root, 'body.md');
     writeFixture(root, 'body.md', `We delve here.\nSLOP-WAIVE(${body}): deliberate\n`);
     const io = makeCaptureIo();

     const result = sut(['--gate', 'blocking', '--waiver-source', body, '--', body], io);

     assert.equal(result, 0, `stdout: ${io.stdout.joined()} stderr: ${io.stderr.joined()}`);
     assert.equal(io.stdout.joined(), '');
   });
   ~~~
   Passes today (any match waives). It pins that the GREEN keeps a column-0 line in the
   scanned file itself live. The anchored-waiver pins per gate already exist (stub :91,
   prose :139, adr :882) and stay unedited.

8. **GREEN — anchor the pattern per line.** In `engine/src/hygiene-lint-core.js`, insert
   after `parseArgs` (:60):
   ~~~js
   // A waiver states why it waives: the token is followed by `:` and a non-empty reason.
   const WAIVER_REASON = String.raw`:\s*\S`;

   function anchorWaiver(waiverPattern) {
     return new RegExp(`^(?:${waiverPattern.source})${WAIVER_REASON}`);
   }

   function waivedPaths(content, anchored) {
     const paths = [];
     for (const line of content.split('\n')) {
       const match = anchored.exec(line);
       if (match) paths.push(match[1].trim());
     }
     return paths;
   }
   ~~~
   and in `collectWaived`: first line `const anchored = anchorWaiver(waiverPattern);`, and
   :86 becomes
   `for (const path of waivedPaths(content, anchored)) waived.add(resolve(base, path));`
   (keep the two-line why-comment above it). Steps 1-7 go green; the full core suite and
   the four existing gate waiver tests stay green.

9. **RED — a fenced anchored line is inert (R3-a…i, R6-b, plus two mutant-killing rows).**
   ~~~js
   test('Given an anchored waiver line inside a fenced block, when collectWaived runs, then it is inert', () => {
     const sut = collectWaived;
     const rows = [
       ['backtick fence', `${BACKTICK_FENCE}\n${ANCHORED_WAIVER}\n${BACKTICK_FENCE}\n`],
       ['tilde fence', `~~~\n${ANCHORED_WAIVER}\n~~~\n`],
       ['info string', `\`\`\`js\n${ANCHORED_WAIVER}\n${BACKTICK_FENCE}\n`],
       ['unclosed fence', `${BACKTICK_FENCE}\n${ANCHORED_WAIVER}\n`],
       ['shorter run does not close', `\`\`\`\`\n${BACKTICK_FENCE}\n${ANCHORED_WAIVER}\n\`\`\`\`\n`],
       ['other character does not close', `${BACKTICK_FENCE}\n~~~\n${ANCHORED_WAIVER}\n${BACKTICK_FENCE}\n`],
       ['closer with trailing text does not close', `${BACKTICK_FENCE}\n\`\`\` x\n${ANCHORED_WAIVER}\n${BACKTICK_FENCE}\n`],
       ['run after text does not close', `${BACKTICK_FENCE}\nx \`\`\`\n${ANCHORED_WAIVER}\n${BACKTICK_FENCE}\n`],
       ['list-indented fence', `- item\n\n  ${BACKTICK_FENCE}\n${ANCHORED_WAIVER}\n  ${BACKTICK_FENCE}\n`],
       ['four-backtick fence', `\`\`\`\`\n${ANCHORED_WAIVER}\n\`\`\`\`\n`],
       ['shorter tilde run does not close', `~~~~\n~~~\n${ANCHORED_WAIVER}\n~~~~\n`],
       ['CRLF fence', `${BACKTICK_FENCE}\r\n${ANCHORED_WAIVER}\r\n${BACKTICK_FENCE}\r\n`],
     ];

     for (const [row, content] of rows) {
       const { waived } = waivedFrom(sut, content);

       assert.deepEqual(waived, [], `${row}: waived ${waived}`);
     }
   });
   ~~~
   Fails after step 8 at `backtick fence`: the line loop has no fence state, so the
   column-0 line inside the fence waives `<root>/p.js`.

10. **RED — a fenced `DECISION-CITE-WAIVE` line does not waive (gate level).** In
    engine/test/adr-lint-main.test.js, after the step-6 adr test:
    ~~~js

    test('Given an anchored DECISION-CITE-WAIVE line inside a fenced block, when main runs, then the citation finding stands', () => {
      const sut = main;
      const root = gitTmpRoot();
      writeCleanSupersession(root, '001', '002');
      writeFixture(root, 'live/note.md', 'Restates ADR-001.\n');
      const waiverSource = writeFixture(
        root,
        'waivers.md',
        '```\nDECISION-CITE-WAIVE(live/note.md): deliberate historical quote\n```\n',
      );
      stageAll(root);
      const io = makeCaptureIo();

      const result = sut([join(root, 'adr'), '--waiver-source', waiverSource], io);

      assert.equal(result, 2, `stdout was: ${io.stdout.joined()}`);
      assert.ok(io.stdout.joined().includes('DECISION-CITE-FOUND(live/note.md): ADR-001@L1'), `stdout was: ${io.stdout.joined()}`);
    });
    ~~~
    Fails after step 8: the fenced line is at column 0 with a reason, so it waives and
    `main` returns 0.

11. **GUARD — a closed fence releases the lines after it (R2-b…e, plus two rows).**
    ~~~js
    test('Given a fence that closes before an anchored waiver line, when collectWaived runs, then the line waives', () => {
      const sut = collectWaived;
      const rows = [
        ['backtick fence closed', `${BACKTICK_FENCE}\nx\n${BACKTICK_FENCE}\n${ANCHORED_WAIVER}\n`],
        ['tilde fence with a backtick info string', `~~~ a\`b\nx\n~~~\n${ANCHORED_WAIVER}\n`],
        ['inline triple backticks are not an opener', `\`\`\`a\`\`\` x\n${ANCHORED_WAIVER}\n`],
        ['four-backtick fence closed', `\`\`\`\`\nx\n\`\`\`\`\n${ANCHORED_WAIVER}\n`],
        ['indented fence closed by an indented closer', `  ${BACKTICK_FENCE}\nx\n  ${BACKTICK_FENCE}\n${ANCHORED_WAIVER}\n`],
        ['CRLF fence closed', `${BACKTICK_FENCE}\r\nx\r\n${BACKTICK_FENCE}\r\n${ANCHORED_WAIVER}\r\n`],
      ];

      for (const [row, content] of rows) {
        const { waived, root } = waivedFrom(sut, content);

        assert.deepEqual(waived, [resolve(root, WAIVED_PATH)], row);
      }
    });
    ~~~
    Passes after step 8 (no fence state, so the last line always waives). It constrains
    step 12 against over-fencing: each row fails if the recognizer misses its closer or
    mistakes a non-opener for an opener.

12. **GREEN — the fence recognizer.** Insert above the `WAIVER_REASON` why-comment:
    ~~~js
    // A fenced code block opens on 3+ backticks (no backtick in the info string) or
    // 3+ tildes, at any indentation; the run is captured to match its closer.
    const FENCE_OPENER = /^[ \t]*(?:(`{3,})[^`]*|(~{3,}).*)$/;
    const FENCE_CLOSER = /^[ \t]*(`{3,}|~{3,})\s*$/;

    function openedFence(line) {
      const match = FENCE_OPENER.exec(line);
      return match ? (match[1] ?? match[2]) : undefined;
    }

    function closesFence(line, fence) {
      const match = FENCE_CLOSER.exec(line);
      if (match === null) return false;
      const run = match[1];
      return run[0] === fence[0] && run.length >= fence.length;
    }

    function unfencedLines(content) {
      const lines = [];
      let fence; // the open fence's run; undefined outside a fence
      for (const line of content.split('\n')) {
        if (fence !== undefined) {
          if (closesFence(line, fence)) fence = undefined;
          continue;
        }
        fence = openedFence(line);
        if (fence === undefined) lines.push(line);
      }
      return lines;
    }
    ~~~
    and `waivedPaths` iterates `unfencedLines(content)` instead of `content.split('\n')`.
    `\s*` / `.*` absorb a trailing `\r`, so CRLF needs no special case. Steps 9-11 go
    green; everything earlier stays green.

13. **REFACTOR — docs and the equivalent mutant.** No behaviour change.
    - JSDoc on each new function: `anchorWaiver` ("Anchor a gate's bare waiver pattern to
      the start of a line and require a reason. Rebuilding from `source` drops the gate's
      `g` flag, so `exec` keeps no state between lines; the `(?:…)` wrapper keeps the
      waived path in group 1." `@param {RegExp}` / `@returns {RegExp}`); `openedFence`
      (`@returns {string|undefined}` the opener's run); `closesFence` ("A closer uses the
      opener's character, is at least as long, and carries no text."); `unfencedLines`
      ("The lines of `content` outside fenced code blocks. An unclosed fence runs to the
      end of the content."); `waivedPaths` (`@returns {string[]}` the trimmed path of
      every waiver line).
    - Directly above `if (fence === undefined) lines.push(line);`, one line:
      `// equivalent mutant (ConditionalExpression forced true): it also keeps the opener line, which starts with whitespace, a backtick or a tilde, so no anchored waiver pattern can match it`
    - `collectWaived` JSDoc (:62-73): first sentence becomes "Collect waived file paths
      from `--waiver-source` files. A waiver is a line that starts with the gate's token
      followed by `: <reason>`, outside a fenced code block; the token anywhere else is a
      mention and waives nothing." (keep the unreadable-source sentence); the
      `waiverPattern` param line becomes "the gate's bare token regex, waived path in
      group 1; collectWaived anchors it to a line start and requires `: <reason>`".
    - Module header :9 "Everything else lives here once." becomes "Everything else lives
      here once, including the waiver grammar: a waiver is a line that starts with the
      token and `: <reason>`, outside a fenced code block."
    - Check: no function over 20 lines, no nesting over two levels in `collectWaived`.

### Gate

```
(cd engine && node --test test/hygiene-lint-core.test.js test/stub-lint-main.test.js test/prose-lint-main.test.js test/adr-lint-main.test.js)
npm --prefix engine test
```

R1 bin-level proof, in a mktemp throwaway (realpath the checkout; see Validation-phase
notes). `<worktree>` is the repo checkout:

```
cd "$(mktemp -d)" && W="$(cd <worktree> && pwd -P)"
printf '// TODO x\n' > s.js
printf 'We note STUB-WAIVE(s.js) in passing.\n' > m.md
node "$W/engine/bin/stub-lint.js" --gate blocking --waiver-source m.md -- s.js; echo $?   # expect 2
printf 'We delve here.\n' > p.md
printf 'We note SLOP-WAIVE(p.md) in passing.\n' > pm.md
node "$W/engine/bin/prose-lint.js" --gate blocking --waiver-source pm.md -- p.md; echo $?  # expect 2
```

### Commit

`fix: honour only anchored waiver lines outside fenced blocks`

## Part 2 — State the anchored waiver rule in the waiver docs

### Context

**What changes.** One sentence in each user-facing place a waiver is authored, saying the
token must start its own line, with `: <reason>`, outside a fenced code block. Additive
only: every existing token literal stays byte-identical.

**Files edited.**

- `docs/contributing/specs/run-record.md`. The `DECISION-CITE-WAIVE` bullet is :121-127.
  Line :123 currently reads:
  ~~~
    for `STUB-WAIVE` and `INTENTION-WAIVE`. It belongs to the `ci.sh` hygiene cadence
  ~~~
  Replace that one line with these five (2-space continuation indent):
  ~~~
    for `STUB-WAIVE` and `INTENTION-WAIVE`. A `STUB-WAIVE`, `SLOP-WAIVE` or
    `DECISION-CITE-WAIVE` waiver is a line that starts with the token followed by
    `: <reason>`, outside a fenced code block; the same token mid-sentence, in an inline
    code span, a table cell or a fence is a mention and waives nothing. It belongs to the
    `ci.sh` hygiene cadence
  ~~~
  The next line (`  family, not to a phase procedure. ...`) continues the sentence as
  today. `INTENTION-WAIVE` is deliberately left out of the new sentence: the validation
  skill reads it in-session, not `collectWaived`.
- `skills/propose/SKILL.md`. :36-39 describe the PR-body prose-lint; :38 ends
  `body is its own waiver source, so a deliberate ban-list word can be waived in-body).`
  Insert after :38, before `   PR body only — never the ci.sh touched-docs cadence.`
  (3-space list indent):
  ~~~
     The in-body waiver is its own line, `SLOP-WAIVE(<body-file>): <reason>`, starting at
     column 0 and outside any code fence; the token mid-sentence or inside a fence waives
     nothing.
  ~~~

**Pinned bytes that must not move.** test/decision-tokens.test.js:32 requires
`DECISION-CITE-WAIVE(` in the run-record spec. test/hygiene-gates-ci.test.js:106-113 pins
the STUB/SLOP token literals in skills/run/SKILL.md (not edited here).
engine/test/propose-prose-lint-wiring.test.js reads the FIRST line of the propose skill
containing `prose-lint.js` (keep that string out of the new sentence) and requires
`SLOP-WAIVE`, `SLOP-FOUND`, `hygiene-gate.js` and "PR body only". test/run-record.test.js
reads the spec at several points. skills/run/SKILL.md and docs/guides/customizing.md stay
as they are (design § Docs).

**Prose constraints.** skills/propose/SKILL.md is a touched `*.md` outside the excluded
doc dirs, so `ci.sh` prose-lints it: no ban-list word (delve, leverage, seamless, robust,
it's important to note, in conclusion). No new line may start with a waiver token at
column 0 (both files are waiver sources on this branch).

### TDD steps

No RED: a prose-only part with no behaviour to drive.

1. **GUARD — doc pins before the edit.**
   `node --test test/hygiene-gates-ci.test.js test/decision-tokens.test.js test/run-record.test.js engine/test/propose-prose-lint-wiring.test.js`
   passes today (63 tests).
2. **Edit** docs/contributing/specs/run-record.md :123 as given in Context.
3. **Edit** skills/propose/SKILL.md after :38 as given in Context.
4. **GUARD — doc pins after the edit.** Rerun step 1's command (still 63 pass, 0 fail),
   and `node engine/bin/prose-lint.js --gate blocking -- skills/propose/SKILL.md` exits 0.

### Gate

```
node --test test/hygiene-gates-ci.test.js test/decision-tokens.test.js test/run-record.test.js engine/test/propose-prose-lint-wiring.test.js
node engine/bin/prose-lint.js --gate blocking -- skills/propose/SKILL.md
bash scripts/docs-structure-lint.sh docs/contributing && bash scripts/docs-structure-lint.sh docs/guides && bash scripts/docs-structure-lint.sh --audience docs
npm --prefix engine test
```

Phase gate after this part: `bash scripts/ci.sh` (exit 0 in the throwaway clone).

### Commit

`docs: state the anchored waiver line rule`
