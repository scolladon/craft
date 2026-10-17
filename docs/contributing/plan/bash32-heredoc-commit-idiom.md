# Plan — bash32-heredoc-commit-idiom

> Source: design doc `docs/contributing/design/bash32-heredoc-commit-idiom.md` · ADRs `605, 606, 607`
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
- Three parts, one per seam, as the design lays out. Part 1 (core contract + its marker
  pins) and Part 2 (copilot gate + its rows) each fold their tests into the code they
  exercise. Part 3 is docs-only: its prose states the form Part 1 teaches and the denial
  Part 2 ships, so it lands last. The parts touch disjoint files and share one working tree.

## Decisions (bound — no open candidates)

Every load-bearing choice is pre-decided; this plan opens no new decision candidates.

- **ADR-605** — the core contract (`contracts/core.md`) carries one `Commit form:` line;
  `CORE_MARKERS` pins it in every assembled block, agent and inline mode.
- **ADR-606** — copilot's plain-command gate stops recognising
  `"$(cat <<'EOF' … EOF)"`; it becomes ordinary double-quoted text holding `$` and is denied
  with the existing `COMPLEX_NEAR_GIT_REASON`. Shared tokeniser and predicates are unchanged.
- **ADR-607** — the fallback for a message holding `` " $ ` \ `` or `!` is `git commit -F <file>`,
  the file written outside the working tree by a separate command that does not mention git.
- **Public surface:** no part introduces a new exported symbol. Part 1 appends a value to the
  existing `CORE_MARKERS` export (a test helper). Part 2 deletes module-private code only;
  the exports `gitPlainCommandGate(command)` and `COMPLEX_NEAR_GIT_REASON` keep their
  signatures. No barrel, registry, API report or README surface gate applies.
- **BACKLOG:** no part edits BACKLOG.md. The repo convention (recent runs land a
  `docs(<slug>): backlog flip` commit from the documentation phase) puts design R8 — remove
  the open entry "Craft's heredoc commit idiom fails under macOS /bin/bash 3.2 when the
  message holds an apostrophe." at BACKLOG.md:215-219 plus its trailing blank line — in the
  documentation phase. Already done by the orchestrator, not redone here: BACKLOG.md:1161
  cites ADR-606, ADR-595 is flipped to superseded, the README ADR count (607) and design
  count (74).
- **Authored within mandate (Part 2):** beyond the design's rows, Part 2 adds one RED at the
  binding seam (`copilotGuard` on the smuggle row, the exact call the design's matrix used)
  and GUARD rows that pin the taught form, its `-F` fallback and the kept opaque-part path.
  All are test rows; none changes behaviour beyond ADR-606.
- **Mutation:** the validation phase owns the Stryker run. No implementation part runs Stryker.

## Decision candidates

None. DC-1 (b), DC-2 (b) and DC-3 (a) are ratified by ADR-605, ADR-606 and ADR-607; the
plan-level choices above follow the design or repo convention.

## Part 1 — The core contract teaches a commit form bash 3.2 and zsh both parse

### Context

Pre-chewed — do NOT re-explore. Work from the worktree root `<worktree>`; all paths are
repo-relative. Commit with `git commit -m "<message>"` (the form this part teaches), never
the heredoc idiom.

**What ships:** one new line in the core contract, right after the "Never change repo-wide
git state" line, plus one marker that pins it in every assembled block in both execution
modes. The exact line is in GREEN step 3 below; copy it byte for byte.

**FILE `contracts/core.md`** — 12 lines, 1164 bytes, every line one rule. Line 9 is
"Never change repo-wide git state — the branch, the index, … not the whole list." Line 10
is "Model: @@MODEL_RESOLUTION@@". Insert the new line between them (new line 10; Model moves
to 11). Touch no other line: `git diff --no-ext-diff -U0 -- contracts/core.md` must show
exactly one `+` line and no `-` line (design R1).
- The engine expands the core line by line with `applyCarveOuts` (engine/src/contract.js:120,
  `replaceAll` of `@@…@@` markers only); `<message>`, `<file>`, quotes, `$` and the backtick
  pass through untouched. engine/src/contract.js:216 `assembleContract` always pushes the
  core first, agent and inline mode, so this one file reaches every phase.
- engine/src/contracts-lint-main.js:38 refuses the word "retrieval" (case-insensitive) in
  any bundle. The line does not contain it — do not reword it.

**FILE `engine/test-helpers/contract-markers.js`** — `export const CORE_MARKERS = [ … ];`
lines 3-16, 12 case-insensitive substrings, last entry `'repo-relative paths',` at line 15.
Append `'Commit form',` after it. `hasCI(haystack, marker)` (line 19) lowercases both sides.
"commit form" appears nowhere in contracts/ or engine/src today (grep-verified), so the
marker is absent until the line lands.

**Consumers that go RED on the marker alone (read-only here, no edit needed):**
- engine/test/scenarios.test.js:320 — test `S2 Given phases.planning.role swapped, … then
  EVERY core marker and the producer bundle survive`; loop at :332 asserts
  `hasCI(result, marker)` for every `CORE_MARKERS` entry; message
  `swap dropped core marker: "<marker>"`. Fragments are the real contracts (`REAL_FRAGMENTS`,
  :58). Agent mode only.
- engine/test/contract-equivalence.test.js:72-84 — per-descriptor loop over
  pipeline/default.yml, one test per descriptor titled "Given descriptor "<id>", when
  assembled in agent mode, then core markers are all present"; inner loop at :78. Agent
  mode only.

**FILE `engine/test/contract-equivalence.test.js`** — add the inline-mode pin. Template:
the git-state pin at :268-288 (section comment :268-271, test :273-288). Add a sibling
directly after :288, before the `// ─── construction GUARD phrase` section at :290, same
shape: `const descriptor = DESCRIPTORS.find(d => d.id === 'planning');`, `const sut =
assembleContract;`, `agentBlock`/`inlineBlock` from `sut(descriptor, {}, FRAGMENTS, {
execution: 'agent' | 'inline' })`, two `assert.ok(hasCI(<block>, 'commit form'), …)`.
`FRAGMENTS` (:18) reads the real contracts/*.md; `DESCRIPTORS` (:28) parses
pipeline/default.yml; `CORE_MARKERS, hasCI` are already imported (:8). Title:
`Given the core commit-form line, when a descriptor is assembled in agent and inline mode,
then the commit-form line is present in both`. Messages:
`'Descriptor "planning": commit-form marker missing from agent-mode assembly'` and
`'… from inline-mode assembly'`. Optional one-line section comment in the style of :268,
e.g. `// ─── core commit-form line: must survive both execution modes ───`. Test titles
and comments carry no ADR/part/backlog numbers (test/source-hygiene.test.js scans them).

**Not touched:** engine/test/fixtures/contracts/core.md (a deliberately minimal subset);
docs/guides/customizing.md:97-118 (a partial list that never named every core line); the
agent defs and adapters (contracts/ is not mirrored). Other real-core readers stay
green unchanged: engine/test/contract.test.js:406/:425 (`Output digest:` and `Turn budget:`
lines found by prefix), engine/test/governance-invariance.test.js:47.

### TDD steps

1. **RED** — append `'Commit form',` to `CORE_MARKERS` in
   `engine/test-helpers/contract-markers.js`. Expected failures, all because the real
   contracts/core.md has no "commit form" text yet:
   - scenarios.test.js `S2 … EVERY core marker …` — `swap dropped core marker: "Commit form"`.
   - contract-equivalence.test.js, every `Given descriptor "<id>", when assembled in agent
     mode, then core markers are all present` — `core marker "Commit form" missing from
     assembled block`.
2. **RED** — add the inline-mode pin to `engine/test/contract-equivalence.test.js` (Context
   above). Fails on its first assertion: the planning agent-mode block has no "commit form"
   (`hasCI` returns false), so the agent-mode message fires.
3. **GREEN** — insert this exact line as line 10 of `contracts/core.md` (after the
   "Never change repo-wide git state" line, before "Model: @@MODEL_RESOLUTION@@"):

   ```text
   Commit form: git commit -m "<message>", one double-quoted -m per paragraph; a message holding " $ ` \ or ! goes in a file outside the working tree, committed with git commit -F <file>. Never -m "$(cat <<'EOF' … EOF)": /bin/bash 3.2 misparses it.
   ```

   The `…` is U+2026 (as in the design and ADR-605), not three dots. All RED tests above
   pass. `node engine/bin/contracts-lint.js contracts` stays green (no "retrieval").
4. **GUARD** — `git diff --no-ext-diff -U0 -- contracts/core.md` shows one `+` line and no
   `-` line; the file keeps its trailing newline.
5. **REFACTOR** — none expected; a contract line and a test constant leave nothing to extract.

### Gate

```bash
log="$(mktemp)"
(cd engine && node --test test/contract-equivalence.test.js test/scenarios.test.js test/contract.test.js test/governance-invariance.test.js test/contracts-lint-main.test.js) > "$log" 2>&1; echo "exit $?"; grep -E "^# (tests|pass|fail)" "$log"
node engine/bin/contracts-lint.js contracts
git diff --no-ext-diff -U0 -- contracts/core.md
bash scripts/ci.sh > "$log" 2>&1; echo "ci exit $?"; tail -n 5 "$log"
```

### Commit

`feat(contracts): teach a commit form that bash 3.2 and zsh both parse`

## Part 2 — The copilot gate stops recognising the heredoc idiom

### Context

Pre-chewed — do NOT re-explore. Repo-relative paths from `<worktree>`. Commit with
`git commit -m "<message>"`.

**What ships:** `gitPlainCommandGate` no longer special-cases `"$(cat <<'DELIM'⏎…⏎DELIM⏎)"`.
With the special case gone, the `"` at the idiom's start opens an ordinary double-quoted
run; `doubleQuotedEnd` meets `$` (in `DOUBLE_QUOTE_FORBIDDEN`) and returns -1, so
`quoteChunk` returns null, `commandWords` returns null and the gate returns `BLOCKED`
(`{ block: true, reason: COMPLEX_NEAR_GIT_REASON }`). This closes the bash-3.2 early-close
smuggle: today `git commit -m "$(cat <<'EOF'⏎x)"; git branch -D victim; echo "⏎EOF⏎)"` is
allowed by both `gitPlainCommandGate` and `copilotGuard` (probed: `{"block":false}`), while
plain `git branch -D victim` is denied by the destructive predicate.

**FILE `engine/src/guards/git-plain-command-gate.js`** (212 lines; current anchors):
- DELETE :32-60 inclusive — `IDIOM_HEADER_SOURCE`, `IDIOM_OPEN`, `IDIOM_CLOSE` with the
  equivalent-mutant comment between them (:32-35); `function closingEnd(command, from,
  delimiter)` with its why-comment and equivalent-mutant comment (:37-49); `function
  idiomEndAt(command, index)` with its comments (:51-59); the blank separators :36, :50, :60.
  Line :31 (blank) is then followed by `function doubleQuotedEnd(command, from) {`.
- EDIT `function quoteChunk(command, index)` (:83-90): delete :84-86 (the
  `// equivalent mutant (ConditionalExpression true): idiomEndAt …` comment, `const idiomEnd
  = …`, `if (idiomEnd !== -1) return { end: idiomEnd, text: OPAQUE_WORD_PART };`). Result:

  ```js
  function quoteChunk(command, index) {
    const end = quotedEnd(command, index);
    // equivalent mutant (ConditionalExpression false, UnaryOperator +1): an end of -1 sends the next chunkAt to command[-1], undefined, which is not plain and yields null.
    return end === -1 ? null : { end, text: command.slice(index + 1, end - 1) };
  }
  ```
- KEEP `OPAQUE_WORD_PART` (:22), `holdsOpaquePart` (:111), `isOpaqueCommand` (:112) and
  `DOUBLE_QUOTE` (:20, still used by `doubleQuotedEnd` :64 and `QUOTES` :21). They stay
  reachable: a single-quoted run keeps a literal `"` in its word text, so `'a"b' x; git status`
  and `git status; 'a"b' x` block and `echo 'a"b'; git status` passes (probed on the current
  tree). Do not rename them; removing them would change that verdict, outside this change.
- KEEP the exports unchanged: `COMPLEX_NEAR_GIT_REASON` (:7) and
  `export function gitPlainCommandGate(command)` (:206).
- After the edit `grep -n -i idiom engine/src/guards/git-plain-command-gate.js` prints
  nothing (design R5). The comment at :142 ("…no shell, wrapper, opaque, …") stays.

**FILE `engine/test/guards/git-plain-command-gate.test.js`** (256 lines): two table-driven
`describe` blocks. `COMPLEX_COMMANDS` (:7-144, closing `];` at :144) — each row asserts
`deepEqual(result, { block: true, reason: REASON })`; `PLAIN_COMMANDS` (:146-203, `];` at
:203) — each row asserts `deepEqual(result, { block: false })`. Adding a row adds a test.
- Rows to MOVE from `PLAIN_COMMANDS` to the end of `COMPLEX_COMMANDS` — current lines :152,
  :176, :177, :187. Cut each line and paste it unchanged; :152 holds a raw backtick pair
  around `ticks` inside its single-quoted literal, keep it as is:

  ```js
  'git commit -m "$(cat <<\'EOF\'\nfeat(x): don\'t break (really)\n\nbody with $VAR and `ticks`\nEOF\n)"',
  'git commit -m "$(cat <<\'EOF\'\nEOF\n)"',
  'git commit -m "$(cat <<\'EOF\'\nxEOF\nEOF\n)"',
  'git commit -m "$(cat <<\'EOF\'\nuse $VAR\nEOF\n)" -m \'plain\'',
  ```
- Rows to ADD at the end of `COMPLEX_COMMANDS` — the early-close smuggle (RED), then the two
  opaque-part rows (GUARD):

  ```js
  'git commit -m "$(cat <<\'EOF\'\nx)"; git branch -D victim; echo "\nEOF\n)"',
  "'a\"b' x; git status",
  "git status; 'a\"b' x",
  ```
- Rows to ADD at the end of `PLAIN_COMMANDS` (GUARD) — the taught form, two paragraphs, the
  file fallback, and the opaque-part counterpart outside command position:

  ```js
  "git commit -m \"fix: don't stop\"",
  "git commit -m \"fix: don't stop\" -m \"body: it's fine\"",
  'git commit -F /tmp/commit-msg.txt',
  "echo 'a\"b'; git status",
  ```
  Why the two opaque `COMPLEX_COMMANDS` rows: once the idiom is gone, no existing row reaches
  `holdsOpaquePart` (rows :44-46 and :142 now deny earlier, on `$`), so the validation
  phase's mutation run would report `isOpaqueCommand`'s `|| holdsOpaquePart(word)` as a
  survivor. These rows kill it in-part.
- Stay unchanged: the `smuggled` helper (:5) and the idiom-shaped `COMPLEX_COMMANDS` rows
  :26-28, :40-46, :82, :125, :126, :142 — they still deny, now via `$` in double quotes.
  `PLAIN_COMMANDS` :150 `'git add -A && git commit -m "feat(guards): x — y"'` stays. The
  linear-time test (:245-256) stays green.

**FILE `adapters/copilot/test/git-guard-adapter.test.js`** — the binding seam. In
`describe('copilotGuard() — destructive git first, then the tool-call guard', …)` (:287;
local helper `const bashEvent = command => ({ tool: 'Bash', tool_input: { command },
working_dir: WORKING_DIR });` at :288), add an `it` next to `Given a wrapped push, when
copilotGuard runs, then the plain-command gate reason wins` (:307-316), same shape:
`const sut = copilotGuard; const result = sut(bashEvent(<smuggle>)); assert.deepEqual(result,
{ block: true, reason: COMPLEX_NEAR_GIT_REASON });`. Command (same literal as the gate row):
`'git commit -m "$(cat <<\'EOF\'\nx)"; git branch -D victim; echo "\nEOF\n)"'`. Title:
`Given a heredoc commit idiom whose body closes the substitution before a forced branch
delete, when copilotGuard runs, then the plain-command gate reason wins`.
`COMPLEX_NEAR_GIT_REASON` and `copilotGuard` are already imported (:6-7). Wiring, read-only:
adapters/copilot/src/git-guard-adapter.js:110-117 `bashBlock` runs the gate first and
returns its verdict when it blocks, so the predicates never see the idiom on copilot.

**Not touched:** engine/test/guards/shell-tokeniser.test.js:262-270 and the rows at
engine/test/guards/git-destructive-predicate.test.js:195 and :298 — the shared tokeniser and
predicates model bash 5 and zsh, which parse the idiom as data (ADR-606 Consequences).
engine/test/guards/shell-git-invocations.differential.test.js stays as is.

**Mutation (validation phase, not this part):** `npm --prefix engine run mutation` runs
Stryker with the tap runner (engine/stryker.conf.json). Per-hunk scope is ONE combined
`--mutate "file:r1,file:r2"`. Narrow the test corpus to this module's suite plus
adapters/copilot/test/git-guard-adapter.test.js, and check each survivor against that full
covering set. The deletion removes four equivalent-mutant comments (:33, :39, :53, :84);
none is expected to be added.

### TDD steps

1. **GUARD** — add the four `PLAIN_COMMANDS` rows and the two opaque `COMPLEX_COMMANDS` rows
   (`'a"b' x; git status`, `git status; 'a"b' x`) listed in Context. They pass on the current
   tree: a double-quoted word holding none of `$`, backtick, `\` or `!` is plain, a `-F` path
   is plain, and a command-position word holding a literal `"` is opaque (probed).
2. **RED** — add the smuggle row to `COMPLEX_COMMANDS`. Fails: the gate returns
   `{ block: false }` — `idiomEndAt` matches `"$(cat <<'EOF'⏎`, `closingEnd` finds the
   `EOF` line inside the trailing `echo "⏎EOF⏎)"`, and the whole span becomes one opaque word
   part outside command position, so `git branch -D victim` is never seen.
3. **RED** — add the smuggle `it` to `adapters/copilot/test/git-guard-adapter.test.js`.
   Fails: `copilotGuard` returns `{ block: false }` — the gate allows it and the shared
   tokeniser treats the heredoc body as data, so the destructive predicate never sees the
   delete.
4. **RED** — move rows :152, :176, :177, :187 from `PLAIN_COMMANDS` to `COMPLEX_COMMANDS`.
   Each fails: the gate returns `{ block: false }` because `quoteChunk` turns the idiom into
   the opaque part `"` outside command position.
5. **GREEN** — delete the idiom code in `engine/src/guards/git-plain-command-gate.js` as
   listed in Context. All RED rows pass (denied on `$` inside double quotes); every GUARD
   row, every other row, the linear-time test and the whole copilot adapter suite stay
   green. `grep -n -i idiom engine/src/guards/git-plain-command-gate.js` prints nothing.
6. **REFACTOR** — none: the deletion leaves `quoteChunk` at three lines; do not rename the
   kept opaque-part helpers.

### Gate

```bash
log="$(mktemp)"
(cd engine && node --test test/guards/git-plain-command-gate.test.js test/guards/shell-tokeniser.test.js test/guards/git-destructive-predicate.test.js test/guards/shell-git-invocations.differential.test.js) > "$log" 2>&1; echo "exit $?"; grep -E "^# (tests|pass|fail)" "$log"
(cd adapters/copilot && node --test test/git-guard-adapter.test.js) > "$log" 2>&1; echo "exit $?"; grep -E "^# (tests|pass|fail)" "$log"
! grep -n -i idiom engine/src/guards/git-plain-command-gate.js
bash scripts/ci.sh > "$log" 2>&1; echo "ci exit $?"; tail -n 5 "$log"
```

### Commit

`fix(guards): deny the heredoc commit idiom in the copilot plain-command gate`

## Part 3 — The copilot docs state the taught commit form and drop the craft's-idiom claim

### Context

Docs-only, no `src/` delta. Repo-relative paths from `<worktree>`. Lands after Parts 1-2:
its prose states the form Part 1 teaches and the denial Part 2 ships. Commit with
`git commit -m "<message>"`.

**FILE `adapters/copilot/README.md`** — the *plain-command gate* paragraph is :67-75.
:71-75 today: "rules below. craft's" then the idiom in a code span, "commit idiom is
accepted. Anything else is denied with" the fixed reason, "the remedy is to re-issue the git
part plainly. On macOS /bin/bash 3.2, an apostrophe inside the commit-idiom body fails
bash's own parse (the hook allows it; bash reports a syntax error) — a bash limitation, not
the guard." Replace :71-75 with the README block in GREEN step 2; :67-70 stay
byte-identical. The dated re-probe at :94-96 ends "… denied by the gate; the commit idiom
executed; a forced deadline …": after "the commit idiom executed" insert
" (denied since this change)" (design R7), rewrapping that line only if it passes ~100
columns.
- README hygiene pins (adapters/copilot/test/native-surface.test.js:31-32, scanned over the
  whole README): `SHELL_INJECTION_PATTERN` refuses a `!` immediately followed by a backtick;
  `PROVENANCE_REF` refuses ADR, phase, part and backlog numbers. The new text writes the
  character set as one double-backtick code span in which `!` is followed by a space, and
  cites no ADR.
- Not touched: the residuals list (:98 on) and the intended-false-blocks line :122-123.

**FILE `docs/contributing/specs/gate.md`** — the *Plain-command gate* paragraph is
:168-174. :171 ends "…see the near-git rules below. craft's" + the idiom code span +
"commit idiom is accepted. Otherwise the"; :172-174 carry the deny reason, the remedy and
the same "apostrophe … a bash limitation, not the guard." sentence. Replace :168-174 with the
gate.md block in GREEN step 3. The re-probe at :196-198 ends "… by the gate; the commit idiom
executed; a forced deadline denied.": insert " (denied since this change)" after "the commit
idiom executed" (R7). Not touched: residuals (:200 on), :229. gate.md is in the living corpus
(scripts/living-corpus.sh), so ci.sh's intention-lint reads it.

**Not touched:** BACKLOG.md (the documentation phase removes the entry, see Decisions);
docs/contributing/specs/copilot-poc-record.md:53 ("the commit idiom executed" — a dated
live-probe record); dated design and plan docs that call it craft's idiom (design, Out of
scope); README.md:200 counts (the plan count moves with this plan's own commit).

### TDD steps

1. **RED (doc check)** — `grep -n "a bash limitation, not the guard" adapters/copilot/README.md
   docs/contributing/specs/gate.md` prints two lines today (README :75, gate.md :174), and
   `grep -n "commit idiom is accepted" adapters/copilot/README.md docs/contributing/specs/gate.md`
   prints README :72 and gate.md :171.
2. **GREEN** — replace `adapters/copilot/README.md` :71-75 with:

   ```markdown
   rules below. Anything else is denied with `craft: command too complex to verify near git — spell it
   plainly`; the remedy is to re-issue the git part plainly. The `"$(cat <<'EOF' … EOF)"` commit
   idiom that some harnesses emit is denied. On macOS `/bin/bash` 3.2 it fails to parse when the
   body holds an odd quote, an odd backtick or a `(`, and a `)` in the body ends the substitution
   early and runs the rest as shell. Commit the way craft's core contract teaches:
   `git commit -m "<message>"` (one double-quoted `-m` per paragraph), or `git commit -F <file>`
   with the file written in a separate call when the message holds `` " $ ` \ ! ``.
   ```

   Then add " (denied since this change)" after "the commit idiom executed" at :96.
3. **GREEN** — replace `docs/contributing/specs/gate.md` :168-174 with:

   ```markdown
   **Plain-command gate.** First stage of the hook. When a command mentions git, it must be plain:
   literal or quoted words; `;`, `&&`, `||`, `|`, `&` and newline separators; literal output redirects;
   none of `$ \` \ ! ( ) { } [ ] * ? < #` outside single quotes; no evaluator or wrapper in command
   position; no `GIT_CONFIG_`; see the near-git rules below. Otherwise the hook denies with
   `craft: command too complex to verify near git — spell it plainly`; the remedy is to re-issue the
   git part plainly. The `"$(cat <<'EOF' … EOF)"` commit idiom that some harnesses emit is denied. On
   macOS `/bin/bash` 3.2 it fails to parse when the body holds an odd quote, an odd backtick or a
   `(`, and a `)` in the body ends the substitution early and runs the rest as shell. Commit the way
   craft's core contract teaches: `git commit -m "<message>"` (one double-quoted `-m` per
   paragraph), or `git commit -F <file>` with the file written in a separate call when the message
   holds `` " $ ` \ ! ``.
   ```

   The first three lines are the current :168-170, unchanged. Then add
   " (denied since this change)" after "the commit idiom executed" at :198.
4. **GUARD** — both step-1 greps print nothing; adapters/copilot/test/native-surface.test.js
   stays green (hygiene pins over the README); prose-lint, intention-lint, design-lint and
   adr-lint stay green through ci.sh.
5. **REFACTOR** — none.

### Gate

```bash
log="$(mktemp)"
! grep -n -e "a bash limitation, not the guard" -e "commit idiom is accepted" adapters/copilot/README.md docs/contributing/specs/gate.md
(cd adapters/copilot && node --test test/native-surface.test.js) > "$log" 2>&1; echo "exit $?"; grep -E "^# (tests|pass|fail)" "$log"
bash scripts/ci.sh > "$log" 2>&1; echo "ci exit $?"; tail -n 5 "$log"
```

Phase gate (after Part 3): `bash scripts/ci.sh` green (design R9).

### Commit

`docs(copilot): state the commit form bash 3.2 parses and drop the craft's-idiom claim`
