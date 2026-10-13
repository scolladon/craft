# Plan — Claude Code binding: a git guard hook that outlives its timeout fails open

> Source: design doc `docs/contributing/design/claude-hook-timeout-probe.md` · ADRs 546, 547, 548, 549, 550
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
part changes executable code and no part adds or edits a test (ADR-549). Each part edits exactly
one file. Part 1 goes first because `bash scripts/ci.sh` is red until the README corpus counts
match the tree, and every later part gate is `ci.sh`.

What the hook-timeout probe found (the design's matrix, pinned on Claude Code 2.1.296): at a
PreToolUse hook's `timeout` Claude Code sends SIGTERM, then runs the Bash call whatever the hook
exits with or prints, and the model sees a clean result. The hook's TERM trap runs and exits 2
with the craft reason (3/3), and a JSON deny printed from the TERM trap (1/1) is ignored too.
Nothing the hook does after the deadline is read. The change is document-only.

Decisions already ratified, so not re-opened here (all adopted as the design recommended):

- ADR-546: the timeout fail-open is documented, not fixed. The TERM and HUP traps
  (hooks/git-no-ext-diff.sh lines 47-50) stay as they are. No hook code changes.
- ADR-547 (DC-1 a): the timeout gets its own sentence in the hook header (Part 2) and its own
  `On a timeout:` paragraph in `gate.md` (Part 3). The "unprobed" / "not probed" parenthetical
  is removed from the existing "no code here runs to catch it" list in both places.
- ADR-548 (DC-2 a): hooks/hooks.json gets no `timeout` field; it stays byte-identical. The
  prose names the documented 600 s default and says hooks.json sets none.
- ADR-549 (DC-3 a): no new test; test/hooks.test.js is not edited.
- ADR-550 (DC-4 a): ADR-546 refines ADR-541 on its Design line. ADR-541 and ADR-537 are not
  edited, and neither is the dated design doc claude-hook-nonzero-exit-probe.md (design R7).

Baseline measured before planning (this worktree at commit 3c28dfc, node v22.22.3):

- `bash scripts/readme-drift.sh .` → exit 1:
  `docs/contributing/design/ claims 61, tree holds 62` and
  `docs/contributing/adr/ claims 545, tree holds 550`. The plan directory holds 60 files and the
  README claims 60; this plan is the 61st, so once it is committed the plan count drifts too.
- `bash scripts/ci.sh` → exit 1. The engine suite has one red test,
  engine/test/readme-drift-main.test.js "Given no root argument, when main runs, then it
  resolves DEFAULT_ROOT against the real repo root and finds no unusable-input errors", and
  `ci.sh` stops there (`ci: engine node --test failed (exit 1)`), so no later suite runs.

Prototype run during planning, in a throwaway `git clone` of this branch under mktemp (never
the worktree; engine/node_modules symlinked in), with a placeholder 61st plan file and all four
parts applied exactly as written below:

- Part 1 alone: `bash scripts/readme-drift.sh .` exit 0, `bash scripts/ci.sh` exit 0.
- All four parts: `bash scripts/ci.sh` exit 0, with no `not ok`, no `^ci:` failure line, no
  `SLOP-FOUND` and no `STUB-FOUND`; `node --test test/hooks.test.js` pass 78 / fail 0;
  `bash scripts/backlog-lint.sh BACKLOG.md` OK; the R1 diff below printed nothing.

Repo gates the parts touch (all run by `bash scripts/ci.sh`; facts, do not re-verify):

- shellcheck over `hooks/*.sh` (via scripts/static-lints.sh) reads the new header lines as
  comments. test/hooks.test.js anchors its hook-copy edits on the code lines starting `trap `
  (line 358) and `IN=${IN%` (line 391); a `# ` comment line can never match them. No test or
  script reads the header prose or the gate.md residual text (a grep of test/ and scripts/
  for `untrapped`, `unprobed`, `not probed`, `timeout sends` finds nothing).
- test/source-hygiene.test.js scans docs/contributing/specs (so gate.md) and README.md:
  case-sensitive bans on the words `stryker`, `mutation`, `mutant`, `gh`, `github` (and a few
  tool names), and on absolute home-rooted paths. The new prose carries none.
- intention-lint (`node engine/bin/intention-lint.js` over `bash scripts/living-corpus.sh`)
  reads gate.md (frontmatter `subjects: engine/src/gates.js`, `engine/src/guards/**`, both
  unchanged) and BACKLOG.md (the `> SoT —` block at lines 7-8 is not touched).
- prose-lint is advisory and runs over touched `*.md` outside docs/contributing/{adr,design,
  archive,specs,prd,plan}, so over README.md and BACKLOG.md. Filler words it flags: delve,
  leverage, seamless, robust, "it's important to note", "in conclusion". Use none.
- `git diff`/`git show` for machine reading always take `--no-ext-diff`. A local `main` branch
  exists in this worktree (the base, a6002df).
- No ADR, phase, plan or backlog reference goes into hooks/git-no-ext-diff.sh. The Claude Code
  version string `2.1.296` is not a provenance reference; the header already carries it.

## Decision candidates

None open. Every load-bearing choice is settled by ADRs 546-550 or by the design's exact text,
which this plan lands verbatim. Checked and found settled: the wording and placement of the
residual (ADR-547, design Parts 2-3 text), whether hooks.json gets a `timeout` (ADR-548),
whether a test pins the prose (ADR-549), the ADR-541 relation (ADR-550), the BACKLOG house
format and in-place delivery (design R4, the two delivered neighbours), and the part order
(README counts first, as the cursor precedent did, because every later gate needs `ci.sh`
green).

## Part 1 — README corpus counts match the tree

### Context

File edited: `README.md` (repo root). Only three numbers change.

Lines 200-201, section `## craft builds craft`, the receipts sentence. Today:

```
receipts: [61 design docs](docs/contributing/design/), [60 parted plans](docs/contributing/plan/),
[545 ADRs](docs/contributing/adr/), and [raw telemetry for 25 runs](docs/contributing/metrics-baseline.report.json)
```

After (expected, with this plan committed):

```
receipts: [62 design docs](docs/contributing/design/), [61 parted plans](docs/contributing/plan/),
[550 ADRs](docs/contributing/adr/), and [raw telemetry for 25 runs](docs/contributing/metrics-baseline.report.json)
```

readme-drift (scripts/readme-drift.sh → engine/bin/readme-drift.js, corpus-counts sub-guard)
compares each bracketed number with the file count of the linked directory. Set each number to
the "tree holds" count `bash scripts/readme-drift.sh .` reports at implementation time. When
this plan was committed the tree held 62 design docs, 61 plans (this plan included) and 550
ADRs. Take the numbers from the tool, not from this text: a later commit may add a file. The
tool prints one line per drifting directory (`<dir> claims <n>, tree holds <m>`); a directory
it does not name already matches. Leave the telemetry count (25 runs) and every other byte of the
two lines alone: it counts runs in docs/contributing/metrics-baseline.report.json, which this
change does not refresh.

Tests that read these numbers (all run by `ci.sh`; none is edited):
engine/test/readme-drift-main.test.js (the DEFAULT_ROOT live-tree test, line 304) and
test/readme-drift.test.js (the live-tree test, anchored on the counted directory links, never
on line numbers).

Public surface: none (prose only).

### TDD steps

No code delta and no new test.

1. RED (existing test, already failing) — engine/test/readme-drift-main.test.js "Given no root
   argument, when main runs, then it resolves DEFAULT_ROOT against the real repo root and finds
   no unusable-input errors", and `bash scripts/readme-drift.sh .` exiting 1. Both fail at the
   start of this part because the README claims 61 design docs, 60 plans and 545 ADRs while the
   tree holds 62, 61 and 550 (see the baseline). The live-tree test in
   test/readme-drift.test.js is red for the same reason but is never reached, because `ci.sh`
   stops at the engine suite.
2. GREEN — run `bash scripts/readme-drift.sh .`, set the README numbers to the "tree holds"
   values it prints, re-run it: exit 0, no output.
3. GUARD — test/source-hygiene.test.js and prose-lint over README.md: the edit changes digits
   only. `git diff --no-ext-diff README.md` shows exactly two `-` lines (200 and 201).

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

## Part 2 — hook header names the timeout fail-open

### Context

File edited: `hooks/git-no-ext-diff.sh`, inside its leading header comment only (lines 2-17
today; `set -euo pipefail` is line 18). Every line from `set -euo pipefail` down stays
byte-identical (design R1). No executable line changes. Lines 10-17 are the crash-path
paragraph; lines 47-50 hold the trap comment and the TERM/HUP traps and are not touched.

Edit, lines 16-17. Today (line 15 shown for anchoring, unchanged):

```bash
# TERM and HUP deny the same way. Still fails open, because no code here runs to catch it:
# /bin/bash missing, this file missing or not executable, SIGKILL or any other untrapped
# signal (which one Claude Code's hook timeout sends is unprobed).
```

After (lines 15-16 unchanged, line 17 replaced by four lines):

```bash
# TERM and HUP deny the same way. Still fails open, because no code here runs to catch it:
# /bin/bash missing, this file missing or not executable, SIGKILL or any other untrapped
# signal. A run past Claude Code's hook timeout (600 s; hooks.json sets none) fails open
# too, though code here does run: Claude Code (2.1.296) sends SIGTERM at the deadline, then
# runs the call whatever this hook exits with or prints. The TERM and HUP traps still deny
# either signal from any other sender.
```

The header grows from 16 to 19 comment lines; `set -euo pipefail` moves to line 21. Every new
line starts with `# `. No ADR, phase or backlog reference goes into the comment.

Tests that touch this file, none edited: test/hooks.test.js (78 tests; it spawns the hook and
hook copies; its anchors `trap ` and `IN=${IN%` match code lines only; the TERM/HUP tests at
line 366 keep pinning exit 2 for those signals). hooks/hooks.json is NOT edited (ADR-548), so
its `deepStrictEqual` pin at test/hooks.test.js:546-557 stays green.

Public surface: none (comment only).

### TDD steps

No code delta and no new test (ADR-549).

1. RED (verification) — `grep -c 'unprobed' hooks/git-no-ext-diff.sh` prints 1: the answered
   parenthetical is still in the header.
2. RED (verification) — `grep -c 'hook timeout (600 s; hooks.json sets none) fails open' hooks/git-no-ext-diff.sh`
   prints 0 and exits 1: the timeout residual is not stated yet.
3. GREEN — apply the edit. The first grep prints 0, the second prints 1.
4. GUARD — R1: from `set -euo pipefail` down the file equals main's:
   `diff <(git show main:hooks/git-no-ext-diff.sh | sed -n '/^set -euo pipefail$/,$p') <(sed -n '/^set -euo pipefail$/,$p' hooks/git-no-ext-diff.sh)`
   prints nothing. It passes because only header lines change.
5. GUARD — every changed line is a comment line:
   `git diff --no-ext-diff main -- hooks/git-no-ext-diff.sh | grep -E '^[-+][^-+]' | grep -vE '^[-+]# '`
   prints nothing. `node --test test/hooks.test.js`: pass 78, fail 0, before and after.

REFACTOR: none.

### Gate

```bash
LOG="$(mktemp -d)"
grep -c 'unprobed' hooks/git-no-ext-diff.sh
diff <(git show main:hooks/git-no-ext-diff.sh | sed -n '/^set -euo pipefail$/,$p') <(sed -n '/^set -euo pipefail$/,$p' hooks/git-no-ext-diff.sh); echo "r1-exit=$?"
git diff --no-ext-diff main -- hooks/git-no-ext-diff.sh | grep -E '^[-+][^-+]' | grep -vE '^[-+]# '; echo "non-comment-lines-exit=$?"
node --test test/hooks.test.js > "$LOG/hooks.log" 2>&1; echo "exit=$?"; grep -nE '^not ok|^# (pass|fail)' "$LOG/hooks.log"
bash scripts/ci.sh > "$LOG/ci.log" 2>&1; echo "exit=$?"; grep -nE '^not ok|^# fail [1-9]|^ci:|SLOP-FOUND|STUB-FOUND' "$LOG/ci.log" | head -40; tail -3 "$LOG/ci.log"
```

Expected: `0`, `r1-exit=0`, `non-comment-lines-exit=1`, hooks suite pass 78 / fail 0, `ci.sh`
exits 0 and its grep prints nothing.

### Commit

`docs(hooks): name the hook-timeout fail-open in the git guard header`

## Part 3 — gate spec: the Claude binding's timeout paragraph

### Context

File edited: `docs/contributing/specs/gate.md`. Section `## Claude binding` (line 41), the
hooks/git-no-ext-diff.sh bullet at line 47; its `On a crash:` paragraph runs lines 58-71,
indented two spaces. Line 72 is blank; line 73 starts the
`**gate-command**` paragraph. Only the end of the `On a crash:` paragraph changes, plus one new
paragraph after it.

Today (lines 67-71; line 67 shown for anchoring, unchanged):

```markdown
  path. With `jq` missing from `PATH`, every Bash call is denied. Still fail-open, because no
  code in the hook can catch them: `/bin/bash` missing, the hook file missing or not
  executable, and SIGKILL or any other untrapped signal (which one Claude Code's hook timeout
  sends is not probed). The probe matrix is in
  [the design doc](../design/claude-hook-nonzero-exit-probe.md).
```

After (lines 67-68 unchanged; lines 69-70 become one line; line 71 unchanged; then one blank
line and an 8-line paragraph at the same two-space indent; the existing blank line before
`**gate-command**` stays):

```markdown
  path. With `jq` missing from `PATH`, every Bash call is denied. Still fail-open, because no
  code in the hook can catch them: `/bin/bash` missing, the hook file missing or not
  executable, and SIGKILL or any other untrapped signal. The probe matrix is in
  [the design doc](../design/claude-hook-nonzero-exit-probe.md).

  On a timeout: Claude Code sends SIGTERM to a hook that runs past its `timeout` (documented
  default 600 s; `hooks/hooks.json` sets none). Claude Code 2.1.296 then runs the Bash call
  whatever the hook exits with or prints, and the model sees a clean result with no hook event.
  The probe tried both deny channels after the TERM: exit 2 with a stderr reason, and a JSON
  `permissionDecision: "deny"` on stdout. Both were ignored. So a timeout fails open, and
  nothing the hook does after the deadline is read. The TERM and HUP traps stay: they deny
  either signal from any other sender. The timeout matrix is in
  [the design doc](../design/claude-hook-timeout-probe.md).
```

Both relative links resolve from docs/contributing/specs/: docs/contributing/design/
claude-hook-nonzero-exit-probe.md and docs/contributing/design/claude-hook-timeout-probe.md
both exist. hooks/hooks.json is named in prose only; it is NOT edited.

Gates that read this file: test/source-hygiene.test.js (scans docs/contributing/specs; the new
prose has no banned word and no home-rooted path) and intention-lint (frontmatter unchanged).
prose-lint skips docs/contributing/specs.

Public surface: none (prose only).

### TDD steps

No code delta and no new test (ADR-549).

1. RED (verification) — `grep -c 'not probed' docs/contributing/specs/gate.md` prints 1 (line
   70, its only hit): the answered parenthetical is still there.
2. RED (verification) — `grep -c '^  On a timeout:' docs/contributing/specs/gate.md` prints 0
   and exits 1: the timeout paragraph does not exist yet.
3. GREEN — apply the edit. The first grep prints 0, the second prints 1.
4. GUARD — `git diff --no-ext-diff docs/contributing/specs/gate.md | grep -E '^-[^-]'` prints
   exactly the two old lines 69-70 and nothing else. Both link targets exist:
   `test -f docs/contributing/design/claude-hook-timeout-probe.md && test -f docs/contributing/design/claude-hook-nonzero-exit-probe.md`.

REFACTOR: none.

### Gate

```bash
LOG="$(mktemp -d)"
grep -c 'not probed' docs/contributing/specs/gate.md
grep -c '^  On a timeout:' docs/contributing/specs/gate.md
git diff --no-ext-diff docs/contributing/specs/gate.md | grep -E '^-[^-]'
test -f docs/contributing/design/claude-hook-timeout-probe.md && test -f docs/contributing/design/claude-hook-nonzero-exit-probe.md; echo "links-exit=$?"
bash scripts/ci.sh > "$LOG/ci.log" 2>&1; echo "exit=$?"; grep -nE '^not ok|^# fail [1-9]|^ci:|SLOP-FOUND|STUB-FOUND' "$LOG/ci.log" | head -40; tail -3 "$LOG/ci.log"
```

Expected: `0`, `1`, exactly two `-` lines (the old 69-70), `links-exit=0`, `ci.sh` exits 0 and
its grep prints nothing.

### Commit

`docs(gate): record the claude hook-timeout fail-open in the binding spec`

## Part 4 — BACKLOG: the hook-timeout probe entry is delivered

### Context

File edited: `BACKLOG.md`. One entry is replaced in place; it stays in its section
`### Open (scoped 2026-10-13 — follow-ups surfaced by the claude-hook-nonzero-exit-probe run, not yet scheduled)`
(line 178), as its delivered neighbours in the next section did (design R4).

Lines 180-186 today (the entry to replace, 7 lines):

```
**Probe what Claude Code does when a PreToolUse hook times out.** `hooks/git-no-ext-diff.sh`
now denies on TERM and HUP, but which signal Claude Code sends a hook that overruns its timeout,
and whether it then runs the call, was never observed. Prove it with the same throwaway
`claude -p` harness (a hook copy that sleeps past a short `timeout`, a marker-file command); if
the timeout uses SIGKILL or ignores the exit status, write it into the hook header and the gate
spec's residual list. See the Out of scope list in
[claude-hook-nonzero-exit-probe](docs/contributing/design/claude-hook-nonzero-exit-probe.md).
```

Replace with (10 lines; `<date>` is the commit day, `date -u +%F`, expected 2026-10-13):

```
**Probe what Claude Code does when a PreToolUse hook times out — delivered <date>**
(fix/claude-hook-timeout-probe). At a hook's `timeout`, Claude Code 2.1.296 sends SIGTERM, then
runs the Bash call whatever the hook exits with or prints, and the model sees a clean result: the
TERM trap's exit 2 with its stderr reason (3/3) and a JSON deny printed from the TERM trap (1/1)
were both ignored (live `claude -p` probe, 6 haiku turns, a 3 s `timeout`). Nothing the hook does
after the deadline is read, so the change is document-only: the hook header and the gate spec now
list the timeout as fail-open, and the TERM and HUP traps stay, denying either signal from any
other sender.
`hooks/hooks.json` sets no `timeout`, so the documented 600 s default applies (ADRs 546-550).
Design context: [claude-hook-timeout-probe](docs/contributing/design/claude-hook-timeout-probe.md).
```

This is the design's Part 4 text with `<range>` resolved to 546-550 (the five ADRs the
decisions phase wrote). House format, from the delivered neighbours at lines 190-198 and
200-210: bold title ending `— delivered <date>**`, the branch in parentheses on the next line,
the ADR range in parentheses at the end of the last sentence before `Design context:`, then
the design link. The blank lines before (line 179) and after (line 187) the entry stay.
hooks/hooks.json is named in prose only; it is NOT edited.

Gates that read this file: `bash scripts/backlog-lint.sh BACKLOG.md` (only checks the five
required headings `## Status`, `## Candidate phases`, `## Parked`, `### Condition-gated`,
`### Closed`, none of which moves), intention-lint (the `> SoT —` block at lines 7-8 is not
touched), prose-lint (advisory; the text carries none of the filler words).

Public surface: none (prose only).

### TDD steps

No code delta and no new test.

1. RED (verification) — `grep -c 'Probe what Claude Code does when a PreToolUse hook times out — delivered' BACKLOG.md`
   prints 0 and exits 1: the entry is still open.
2. GREEN — replace lines 180-186 with the 10-line block above. The grep prints 1, and
   `grep -c 'hook times out\.\*\*' BACKLOG.md` prints 0 (the open title is gone).
3. GUARD — `bash scripts/backlog-lint.sh BACKLOG.md` prints
   `backlog-lint: 5 required sections present — structure OK.` before and after.

REFACTOR: none.

### Gate

```bash
LOG="$(mktemp -d)"
bash scripts/backlog-lint.sh BACKLOG.md; echo "exit=$?"
grep -c 'Probe what Claude Code does when a PreToolUse hook times out — delivered' BACKLOG.md
grep -c 'hook times out\.\*\*' BACKLOG.md
bash scripts/ci.sh > "$LOG/ci.log" 2>&1; echo "exit=$?"; grep -nE '^not ok|^# fail [1-9]|^ci:|SLOP-FOUND|STUB-FOUND' "$LOG/ci.log" | head -40; tail -3 "$LOG/ci.log"
```

Expected: backlog-lint exit 0, `1`, `0`, `ci.sh` exits 0 and its grep prints nothing. After
this last part, design R7 also holds:
`git diff --no-ext-diff main --stat -- docs/contributing/design/claude-hook-nonzero-exit-probe.md docs/contributing/adr/537-*.md docs/contributing/adr/541-*.md hooks/hooks.json test/`
prints nothing.

### Commit

`docs(backlog): mark the claude hook-timeout probe delivered`
