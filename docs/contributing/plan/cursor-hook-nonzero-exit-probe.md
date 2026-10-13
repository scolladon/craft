# Plan — cursor binding: a crashing guard hook is blocked by `failClosed`

> Source: design doc `docs/contributing/design/cursor-hook-nonzero-exit-probe.md` · ADRs 543, 544, 545
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

Shape of this plan: four docs/comment-only parts, one commit each, in the design's order. No
part changes executable code and no part adds a test (ADR-544). Each part edits exactly one
file. Part 1 goes first because `bash scripts/ci.sh` is red until the README corpus counts
match the tree, and every later part gate is `ci.sh`.

Decisions already ratified, so not re-opened here:

- ADR-543 (DC-1 option b): the guard header comment is corrected (Part 4); the cursor adapter
  README is NOT edited. The design's DC-1 (c) README sentence is out.
- ADR-544 (DC-2 option a): no new test. The design's DC-2 (b) test table is out.
- ADR-545 (DC-3 option b): the re-probe **Hook shell** row keeps its second sentence (the
  `node` v24.5.0 observation), marked host-specific. No BACKLOG entry for it.
- ADR-320: the POC record appends a re-probe section and corrects in place only the falsified
  **Deny wire** row. The **Fail-open behavior** row and the Phase B **Fail-open vs failClosed**
  row stay byte-identical.

Baseline measured before planning (this worktree at commit 3a711ef, node v22.22.3):

- `bash scripts/readme-drift.sh .` → exit 1:
  `docs/contributing/design/ claims 60, tree holds 61` and
  `docs/contributing/adr/ claims 542, tree holds 545`. This plan adds a 60th plan file, so once
  it is committed the plan count (README claims 59) drifts too.
- `bash scripts/ci.sh` → exit 1. The engine suite has one red test,
  engine/test/readme-drift-main.test.js "Given no root argument, when main runs, then it
  resolves DEFAULT_ROOT against the real repo root and finds no unusable-input errors", and
  `ci.sh` stops there (`ci: engine node --test failed (exit 1)`), so no later suite runs.

Prototype run during planning, in a throwaway `git clone` of this branch under mktemp (never
the worktree), with all four parts applied exactly as written below and committed there:
`bash scripts/readme-drift.sh .` exit 0, `bash scripts/backlog-lint.sh BACKLOG.md` OK,
`node --test test/craft-guard-hook.test.js` (cwd adapters/cursor) pass 5 / fail 0, and
`bash scripts/ci.sh` exit 0 with no `not ok`, no `SLOP-FOUND` and no `STUB-FOUND` line.
Part 1 alone was also measured: `ci.sh` exit 0.

Repo gates every part touches (all run by `bash scripts/ci.sh`; facts, do not re-verify):

- test/source-hygiene.test.js scans docs/contributing/specs (so the POC record) and README.md:
  case-sensitive bans on the words `stryker`, `mutation`, `mutant`, `gh`, `github` (and a few
  tool names), and on absolute home-rooted paths that name a user. The `~/.cursor` and
  `<ws>`/`<marker>` spellings in the design text are allowed (the record already uses
  `~/.cursor`). BACKLOG.md and adapters/ are not scanned by it.
- intention-lint (`node engine/bin/intention-lint.js` over `bash scripts/living-corpus.sh`)
  reads docs/contributing/specs/*.md and BACKLOG.md. The POC record has no `subjects:`
  frontmatter, so Check 1 skips it; Check 2 resolves the backticked pointers in BACKLOG.md's
  `> SoT —` block (lines 7-8). No part touches that block.
- prose-lint is advisory and runs over touched `*.md` outside docs/contributing/{adr,design,
  archive,specs,prd,plan}, so over README.md and BACKLOG.md. Filler words it flags: delve,
  leverage, seamless, robust, "it's important to note", "in conclusion". Use none.
- stub-lint is advisory and runs over touched `*.js`, so over the guard in Part 4. The new
  comment lines carry no TODO/FIXME/stub marker.
- `git diff`/`git show` for machine reading always take `--no-ext-diff`.

## Decision candidates

Not settled by ADRs 543-545. The recommendation is what this plan follows; the orchestrator
may flip it before Part 4 starts.

| # | Choice | Options | Recommendation |
|---|---|---|---|
| PC-1 | The guard header's lines 7-9 ("The deny wire is stdout JSON, NOT an exit code (… Cursor denies with a stdout permission object)") stay next to the new sentence that says exit 2 also denies | (a) Land the design's Part 4 text verbatim: only lines 9-10 and 15-17 change. (b) Also reword lines 7-9 to "craft's deny wire is stdout JSON, not exit 2", so no sentence in the header says Cursor denies only via stdout. | **(a).** ADR-543 ratified the design's exact replacement, which edits the one sentence the probe falsified ("a stray exit code is ignored"). Read with the new next sentence ("Exit codes are not ignored: Cursor treats exit 2 as a deny …"), lines 7-9 describe the wire craft chose, not the only wire Cursor reads. (b) is more precise but edits text the ratified design left alone. |

## Part 1 — README corpus counts match the tree

### Context

File edited: `README.md` (repo root). Only three numbers change.

Lines 200-201, section `## craft builds craft`, the receipts sentence. Today:

```
receipts: [60 design docs](docs/contributing/design/), [59 parted plans](docs/contributing/plan/),
[542 ADRs](docs/contributing/adr/), and [raw telemetry for 25 runs](docs/contributing/metrics-baseline.report.json)
```

readme-drift (scripts/readme-drift.sh → engine/bin/readme-drift.js, corpus-counts sub-guard)
compares each bracketed number with the file count of the linked directory. Set each number to
the count `bash scripts/readme-drift.sh .` reports at implementation time. When this plan was
committed the tree held 61 design docs, 60 plans (this plan included) and 545 ADRs. Take the
numbers from the tool, not from this text: a later commit may add a file. Leave the telemetry
count (25 runs) and every other byte of the line alone.

Tests that read these numbers (all run by `ci.sh`; none is edited):
engine/test/readme-drift-main.test.js (the DEFAULT_ROOT live-tree test) and
test/readme-drift.test.js (the live-tree test, anchored on the counted directory links, never
on line numbers).

Public surface: none (prose only).

### TDD steps

No code delta and no new test.

1. RED (existing test, already failing) — engine/test/readme-drift-main.test.js "Given no root
   argument, when main runs, then it resolves DEFAULT_ROOT against the real repo root and finds
   no unusable-input errors", and `bash scripts/readme-drift.sh .` exiting 1. Both fail at the
   start of this part because the README claims 60 design docs, 59 plans and 542 ADRs while
   the tree holds more (see the baseline). The live-tree test in test/readme-drift.test.js is
   red for the same reason but is never reached, because `ci.sh` stops at the engine suite.
2. GREEN — run `bash scripts/readme-drift.sh .`, set the three README numbers to the "tree
   holds" values it prints, re-run it: exit 0, no output lines naming a corpus count.
3. GUARD — test/source-hygiene.test.js and prose-lint over README.md: the edit changes digits
   only.

REFACTOR: none.

### Gate

Run from the worktree root. Write output to a file and read back only the summary and failures:

```bash
LOG="$(mktemp -d)"
bash scripts/readme-drift.sh .; echo "exit=$?"
bash scripts/ci.sh > "$LOG/ci.log" 2>&1; echo "exit=$?"; grep -nE '^not ok|^# fail [1-9]|^ci:|SLOP-FOUND|STUB-FOUND' "$LOG/ci.log" | head -40; tail -3 "$LOG/ci.log"
```

Expected: readme-drift exits 0, `ci.sh` exits 0 and the grep prints nothing. Never commit on a
red gate.

### Commit

`docs(readme): refresh the design, plan and adr corpus counts`

## Part 2 — POC record: the exit-status re-probe section and the Deny wire correction

### Context

File edited: `docs/contributing/specs/cursor-poc-record.md` (145 lines today, ends with a
newline). Two edits, nothing else in the file changes.

**2a. Append a section at the end of the file**, after the *Isolation-method caveat* section
(which ends at line 145 with "…expect a re-login may be needed afterwards."). The codex record
(docs/contributing/specs/codex-poc-record.md) appends its re-probes at the end the same way.

- One blank line, then the heading on ONE line, exactly:
  `## Re-probe — cursor-agent 2026.07.20-8cc9c0b (2026-10-13)` (the dash is an em dash, U+2014,
  as in the record's other headings).
- One blank line, then the body: copy verbatim lines 155-178 of
  docs/contributing/design/cursor-hook-nonzero-exit-probe.md (the contents of the fenced
  `markdown` block under "2a. Append after line 145"; line 154 is the opening fence and line
  179 the closing fence, neither is copied). The body is a Scope/Method paragraph, a 9-row
  `| Probe | Result | Status |` table, and a Verdict paragraph.
- Keep the **Hook shell** row (design line 173) whole, BOTH sentences, including the `node`
  v24.5.0 / v22.22.3 sentence (ADR-545). Do not shorten it.
- The file still ends with exactly one newline after the Verdict paragraph.

A copy that does not hand-retype the text (run from the worktree root):

```bash
D=docs/contributing/design/cursor-hook-nonzero-exit-probe.md
R=docs/contributing/specs/cursor-poc-record.md
{ printf '\n## Re-probe — cursor-agent 2026.07.20-8cc9c0b (2026-10-13)\n\n'; sed -n 155,178p "$D"; } >> "$R"
```

Check first that design line 155 starts with "Scope: what Cursor does" and line 178 ends with
"load-bearing property (see **Fail-open behavior** above)." — if the design file moved, find
the fenced block by those two anchors instead of the line numbers.

**2b. Correct the Deny wire row in place** (line 84, section `## Guard / hook mechanism`). The
row is one table line; it stays one line. Replace the substring
`**Not an exit-code wire.**` (it occurs once in the file) with:

```
craft's guard uses this stdout wire, not an exit code; exit 2 with a stderr message is also a deny (Claude-compat; see *Re-probe — cursor-agent 2026.07.20-8cc9c0b (2026-10-13)*).
```

The design wraps this text over two lines for reading; in the record it is on the row's single
line. It contains no `|`, so the table stays intact. The rest of the row (the stdout JSON
shape, `HookDeniedError`, "`ask` prompts; anything else = allow.") and its `CONFIRMED (live)`
status are unchanged.

Rows that must stay byte-identical: line 85 **Fail-open behavior** and line 121 Phase B
**Fail-open vs failClosed**. The re-probe section names both as the rows it extends.

Gates that read this file: test/source-hygiene.test.js (it scans docs/contributing/specs) and
intention-lint (the record is in the living corpus, no `subjects:` frontmatter). The body's
only home-ish path is `~/.cursor`, already used by the record, and it carries none of the
banned words. prose-lint skips docs/contributing/specs.

Public surface: none (prose only).

### TDD steps

No code delta and no new test (ADR-544). The checks are verification commands, not committed
tests.

1. RED (verification) — `grep -c '^## Re-probe — cursor-agent 2026.07.20-8cc9c0b (2026-10-13)$' docs/contributing/specs/cursor-poc-record.md`
   prints 0 and exits 1: the section does not exist yet.
2. RED (verification) — `grep -c 'Not an exit-code wire' docs/contributing/specs/cursor-poc-record.md`
   prints 1: the falsified sentence is still there.
3. GREEN — apply 2a, then 2b. The first grep prints 1; the second prints 0.
4. GUARD — `git diff --no-ext-diff docs/contributing/specs/cursor-poc-record.md` shows exactly
   one changed line (84) plus the appended block; no `-` line other than the old line 84.
   test/source-hygiene.test.js and intention-lint stay green.

REFACTOR: re-read the appended table: 9 rows, each ending in a status cell (`SOURCE`,
`CONFIRMED (live)`, `CONFIRMED (live) + SOURCE`, `CONFIRMED`, `CONFIRMED (live, host-specific)`).

### Gate

```bash
LOG="$(mktemp -d)"
grep -c '^## Re-probe — cursor-agent 2026.07.20-8cc9c0b (2026-10-13)$' docs/contributing/specs/cursor-poc-record.md
grep -c 'Not an exit-code wire' docs/contributing/specs/cursor-poc-record.md
git diff --no-ext-diff docs/contributing/specs/cursor-poc-record.md | grep -E '^-[^-]'
bash scripts/ci.sh > "$LOG/ci.log" 2>&1; echo "exit=$?"; grep -nE '^not ok|^# fail [1-9]|^ci:|SLOP-FOUND|STUB-FOUND' "$LOG/ci.log" | head -40; tail -3 "$LOG/ci.log"
```

Expected: `1`, `0`, exactly one `-` line (the old line 84), `ci.sh` exits 0 and its grep prints
nothing.

### Commit

`docs(cursor): record the hook exit-status re-probe and correct the deny-wire row`

## Part 3 — BACKLOG: the cursor crash-probe entry is delivered

### Context

File edited: `BACKLOG.md`. One entry is replaced in place; it stays in its section
`### Open (scoped 2026-10-13 — follow-ups surfaced by the codex-hook-nonzero-exit-probe run, not yet scheduled)`
(line 188), as the delivered Claude Code entry right below it (line 198) did.

Lines 190-196 today (the entry to replace, 7 lines):

```
**Probe whether the cursor guard fails open on a crash.** The codex guard exited 1 when its
import graph failed to load, and codex runs the tool call on any status but 2. Whether
`adapters/cursor/hooks/craft-guard.js` has the same static-import gap, and what Cursor does with a
hook that exits 1, was never measured. Prove it with the codex fixture (a throwaway copy whose
engine import does not resolve) plus Cursor's own exit-status matrix; harden only on a proven
fail-open. See the Out of scope list in
[codex-hook-nonzero-exit-probe](docs/contributing/design/codex-hook-nonzero-exit-probe.md).
```

Replace with (9 lines; `<date>` is the commit day, `date -u +%F`, expected 2026-10-13):

```
**Probe whether the cursor guard fails open on a crash — delivered <date>**
(fix/cursor-hook-nonzero-exit-probe). The cursor guard has the codex static-import gap: with its
engine predicate unresolvable it exits 1 with no stdout. cursor-agent 2026.07.20-8cc9c0b blocks
that call under the shipped `failClosed: true`, as it does exit 127 and a SIGKILL death; exit 2
denies whatever `failClosed` says (live `cursor-agent -p` probe, 5 turns; the matrix and the hook
branch order are in the POC record). No fail-open is proven, so the guard is not hardened;
`failClosed: true` stays load-bearing and test-pinned. Still fail-open, as already recorded: an
install without `failClosed`, and a malformed `hooks.json` (ADRs 543-545). Design context:
[cursor-hook-nonzero-exit-probe](docs/contributing/design/cursor-hook-nonzero-exit-probe.md).
```

House format, taken from the two delivered neighbours (lines 198-208 and 212-220): bold title
ending `— delivered <date>**`, the branch in parentheses on the next line, the ADR range in
parentheses at the end of the last sentence before `Design context:`, then the design link on
its own line. The blank lines before and after the entry stay.

Gates that read this file: `bash scripts/backlog-lint.sh BACKLOG.md` (only checks the five
required headings `## Status`, `## Candidate phases`, `## Parked`, `### Condition-gated`,
`### Closed`, none of which moves), intention-lint (the `> SoT —` block at lines 7-8 is not
touched), prose-lint (advisory; the text carries none of the filler words).

Public surface: none (prose only).

### TDD steps

No code delta and no new test.

1. RED (verification) — `grep -c 'Probe whether the cursor guard fails open on a crash — delivered' BACKLOG.md`
   prints 0 and exits 1: the entry is still open.
2. GREEN — replace lines 190-196 with the 9-line block above. The grep prints 1, and
   `grep -c 'Probe whether the cursor guard fails open on a crash\.\*\*' BACKLOG.md` prints 0
   (the open title is gone).
3. GUARD — `bash scripts/backlog-lint.sh BACKLOG.md` prints
   `backlog-lint: 5 required sections present — structure OK.` before and after.

REFACTOR: none.

### Gate

```bash
LOG="$(mktemp -d)"
bash scripts/backlog-lint.sh BACKLOG.md; echo "exit=$?"
grep -c 'Probe whether the cursor guard fails open on a crash — delivered' BACKLOG.md
bash scripts/ci.sh > "$LOG/ci.log" 2>&1; echo "exit=$?"; grep -nE '^not ok|^# fail [1-9]|^ci:|SLOP-FOUND|STUB-FOUND' "$LOG/ci.log" | head -40; tail -3 "$LOG/ci.log"
```

Expected: backlog-lint exit 0, the grep prints 1, `ci.sh` exits 0 and its grep prints nothing.

### Commit

`docs(backlog): mark the cursor guard crash probe delivered`

## Part 4 — guard header names the measured exit handling

### Context

File edited: `adapters/cursor/hooks/craft-guard.js`, inside its leading `/** … */` header
comment only (lines 1-23 today; `import { readFileSync, writeSync } from 'node:fs';` is line
24). Every line from that first `import` down stays byte-identical. No executable line changes
(ADR-543). No phase, ADR, plan or backlog reference goes into the comment.

Edit 1, lines 9-10. Today:

```
 * with exit-2; Cursor denies with a stdout permission object). A future reader must not
 * "port" the exit-2 form here: Cursor reads stdout, and a stray exit code is ignored.
```

After (line 9 unchanged, line 10 replaced by three lines):

```
 * with exit-2; Cursor denies with a stdout permission object). A future reader must not
 * "port" the exit-2 form here: the stdout object carries the user and agent messages.
 * Exit codes are not ignored: Cursor treats exit 2 as a deny, and any other non-zero
 * exit as a hook failure that layer 2 below turns into a block.
```

Edit 2, lines 15-17 (layer 2 of "Two fail-closed layers"). Today:

```
 *   2. hooks.json registers this hook with `failClosed: true`, so a process-level
 *      crash BEFORE this handler writes anything is also blocked by Cursor. Measured:
 *      without failClosed, a crashing hook fails OPEN (the command runs).
```

After (lines 15-16 unchanged, line 17 replaced by three lines):

```
 *   2. hooks.json registers this hook with `failClosed: true`, so a process-level
 *      crash BEFORE this handler writes anything is also blocked by Cursor. Measured:
 *      an import that fails to load (exit 1), a missing binary (exit 127) and a
 *      SIGKILL (no output) are all blocked; without failClosed, a crashing hook fails
 *      OPEN (the command runs).
```

Lines 7-8 ("The deny wire is stdout JSON, NOT an exit code (the exact wire the codex binding
could not assume — codex denies") stay as they are under PC-1 (a). The header grows from 23 to
27 lines.

Tests that touch this file, none edited: adapters/cursor/test/craft-guard-hook.test.js spawns
the hook as a real subprocess (5 tests: benign allow, git-ext-diff deny, unparseable stdin
deny, missing command deny, deny exits 0); its title "(the wire is stdout JSON, not an exit
code)" stays true for craft's own wire. adapters/cursor/test/native-surface.test.js only
checks that the hook path exists (GUARD_HOOK_PATH); its provenance and README scans cover
hooks.json, the craft-run SKILL.md, README.md and config.template.json, not the guard. The
cursor adapter README, hooks.json, config.template.json and
adapters/cursor/src/cursor-guard-adapter.js are NOT edited (design R1, ADR-543).

Public surface: none (comment only).

### TDD steps

No code delta and no new test (ADR-544).

1. RED (verification) — `grep -c 'a stray exit code is ignored' adapters/cursor/hooks/craft-guard.js`
   prints 1: the falsified sentence is still in the header.
2. RED (verification) — `grep -c 'missing binary (exit 127)' adapters/cursor/hooks/craft-guard.js`
   prints 0 and exits 1: layer 2 does not name the measured classes yet.
3. GREEN — apply Edit 1 and Edit 2. The first grep prints 0, the second prints 1.
4. GUARD — `node --test test/craft-guard-hook.test.js` run with cwd adapters/cursor: pass 5,
   fail 0, before and after. The header is a comment, so the subprocess behaviour cannot move.
5. GUARD — every changed line is a comment line:
   `git diff --no-ext-diff adapters/cursor/hooks/craft-guard.js | grep -E '^[-+][^-+]' | grep -vE '^[-+] \*'`
   prints nothing.

REFACTOR: none.

### Gate

```bash
LOG="$(mktemp -d)"
git diff --no-ext-diff adapters/cursor/hooks/craft-guard.js | grep -E '^[-+][^-+]' | grep -vE '^[-+] \*'; echo "non-comment-lines-exit=$?"
(cd adapters/cursor && node --test test/craft-guard-hook.test.js test/native-surface.test.js > "$LOG/cursor.log" 2>&1); echo "exit=$?"; grep -nE '^not ok|^# (pass|fail)' "$LOG/cursor.log"
bash scripts/ci.sh > "$LOG/ci.log" 2>&1; echo "exit=$?"; grep -nE '^not ok|^# fail [1-9]|^ci:|SLOP-FOUND|STUB-FOUND' "$LOG/ci.log" | head -40; tail -3 "$LOG/ci.log"
```

Expected: the non-comment grep prints nothing (`non-comment-lines-exit=1`), the cursor suites
report fail 0, `ci.sh` exits 0 and its grep prints nothing.

### Commit

`docs(cursor): name the measured exit handling in the guard header`
