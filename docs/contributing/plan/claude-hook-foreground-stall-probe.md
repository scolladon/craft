# Plan — Claude Code binding: a git guard hook stalled in a foreground command at its timeout fails open

> Source: design doc `docs/contributing/design/claude-hook-foreground-stall-probe.md` · ADRs 551, 552, 553, 554, 555
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
part changes executable code and no part adds or edits a test (ADR-554). Each part edits exactly
one file. Part 1 goes first because `bash scripts/ci.sh` is red until the README corpus counts
match the tree, and every later part gate is `ci.sh`.

What the foreground-stall probe found (the design's matrix, pinned on Claude Code 2.1.299): at a
PreToolUse hook's `timeout` Claude Code sends SIGTERM to the hook's whole process tree, walked by
parent pid (not the process group, not the pid alone). A foreground child that dies on TERM dies
at once, the hook's deferred TERM trap runs, and its crash deny is ignored (2/2). A tree that
survives TERM is SIGKILLed about 1.2–1.7 s later (3/3, timed on 2). The call runs every time, the
model sees a clean result, and Claude Code does not hang. The shipped hook's own children (`cat`,
`jq`, `grep`, `sed`) all die on TERM. Nothing here is a fail-open the hook can act on, so the
change is document-only: the "a stall in a foreground command was not probed" qualifier is
replaced by the measured behaviour in the hook header and the gate spec, and the BACKLOG entry is
marked delivered.

Decisions already ratified, so not re-opened here:

- ADR-551: the foreground-stall fail-open is documented, not fixed; it refines ADR-546. The TERM
  and HUP traps (hooks/git-no-ext-diff.sh lines 51-54 today) stay. No hook code changes.
- ADR-552 (DC-1 (b), ratified by the user): both the header and `gate.md` state the mechanism —
  SIGTERM to the whole process tree, so a stalled foreground child dies, and SIGKILL for what
  survives. Only `gate.md` adds the by-parent-pid walk and the 1.2–1.7 s bracket. So the design's
  "After (DC-1 (b), DC-2 (a))" texts are the ones applied, verbatim.
- ADR-553 (DC-2 (a)): per-claim version labels — 2.1.296 on the background-wait claims (both
  deny channels), 2.1.299 on the foreground and tree-signal claims. Header line 10 (the crash
  path, 2.1.296) is NOT re-labelled.
- ADR-554 (DC-4 (a)): no new test; no test file is edited.
- ADR-555 (DC-3 (a)): ADR-551 refines ADR-546 on its Design line; no `supersedes`. ADRs 541 and
  546-550 are not edited.

Baseline measured before planning (this worktree at commit 888ec6f, node v22.22.3; a local `main`
branch exists at db0840d, the base):

- `bash scripts/readme-drift.sh .` → exit 1:
  `docs/contributing/design/ claims 62, tree holds 63` and
  `docs/contributing/adr/ claims 550, tree holds 555`. The plan directory holds 61 files and the
  README claims 61; this plan is the 62nd, so once it is committed the plan count drifts too.
- `bash scripts/ci.sh` → exit 1. The engine suite has one red test,
  engine/test/readme-drift-main.test.js:304 "Given no root argument, when main runs, then it
  resolves DEFAULT_ROOT against the real repo root and finds no unusable-input errors", and
  `ci.sh` stops there (`ci: engine node --test failed (exit 1)`), so no later suite runs. The
  commit that lands this plan is still red for the same reason; Part 1 turns it green.

Prototype run during planning, in a throwaway `git clone` of this branch under mktemp (never the
worktree; engine/node_modules symlinked in; a local `main` created from origin/main), with a
placeholder 62nd plan file and all four parts applied exactly as written below:

- Part 1 alone: `bash scripts/readme-drift.sh .` exit 0, `bash scripts/ci.sh` exit 0.
- All four parts: `bash scripts/ci.sh` exit 0, with no `not ok`, no `^ci:` failure line, no
  `SLOP-FOUND` and no `STUB-FOUND`; `node --test test/hooks.test.js` pass 78 / fail 0;
  `bash scripts/backlog-lint.sh BACKLOG.md` OK; the R1 diff below printed nothing; every
  verification grep below printed the value stated.

Repo gates the parts touch (all run by `bash scripts/ci.sh`; facts, do not re-verify):

- shellcheck over `hooks/*.sh` (via scripts/static-lints.sh) reads the new header lines as
  comments. test/hooks.test.js anchors its hook-copy edits on the code lines starting `trap `
  (line 358) and `IN=${IN%` (line 391); a `# ` comment line can never match them. No test or
  script reads the header prose or the gate.md paragraph (a grep of test/ and scripts/ for
  `not probed`, `foreground command` and `2.1.296` finds nothing).
- test/source-hygiene.test.js scans docs/contributing/specs (so gate.md) and README.md:
  case-sensitive bans on a few tool and VCS-host words and on absolute home-rooted paths. The new
  prose carries none (the prototype ran it green).
- intention-lint (`node engine/bin/intention-lint.js` over `bash scripts/living-corpus.sh`)
  reads gate.md (frontmatter `subjects: engine/src/gates.js`, `engine/src/guards/**`, both
  unchanged) and BACKLOG.md (the `> SoT —` block at lines 7-8 is not touched).
- prose-lint is advisory and runs over touched `*.md` outside docs/contributing/{adr,design,
  archive,specs,prd,plan}, so over README.md and BACKLOG.md. Filler words it flags: delve,
  leverage, seamless, robust, "it's important to note", "in conclusion". The texts below use none.
- `git diff`/`git show` for machine reading always take `--no-ext-diff`.
- Run every gate from the worktree root itself, never through a symlinked path: from a
  symlinked cwd (macOS `/var` → `/private/var`) `bash scripts/readme-drift.sh .` exits 0 with no
  output even on a drifting tree, because engine/bin/readme-drift.js line 4 compares
  `process.argv[1]` with the realpath of its own URL. The worktree path has no symlink.
- No ADR, phase, plan or backlog reference goes into hooks/git-no-ext-diff.sh. Claude Code
  version strings (`2.1.296`, `2.1.299`) are measurement labels, not provenance references; the
  header already carries one.
- Dated docs stay byte-identical (design R7): docs/contributing/design/claude-hook-timeout-probe.md,
  docs/contributing/plan/claude-hook-timeout-probe.md,
  docs/contributing/design/claude-hook-nonzero-exit-probe.md, this plan's design doc, and every
  ADR (1-555). hooks/hooks.json and everything under test/ are not edited.
- The delivery date for Part 4 is the commit day, `date +%F` (expected 2026-10-14).

## Decision candidates

None open. Every load-bearing choice is settled by ADRs 551-555 or by the design's exact text,
which this plan lands verbatim. Checked and found settled: how much mechanism the texts carry
(ADR-552, DC-1 (b)), the version labels (ADR-553, DC-2 (a)), whether a test pins anything
(ADR-554), the ADR-546 relation (ADR-555), the BACKLOG house format and in-place delivery
(design R4 and the delivered neighbour at BACKLOG.md lines 192-201), the ADR range in the BACKLOG
entry (551-555, the five ADRs the decisions phase wrote), and the part order (README counts first,
as the precedent did, because every later gate needs `ci.sh` green).

## Part 1 — README corpus counts match the tree

### Context

File edited: `README.md` (repo root). Only three numbers change.

Lines 200-201, section `## craft builds craft`, the receipts sentence. Today:

```
receipts: [62 design docs](docs/contributing/design/), [61 parted plans](docs/contributing/plan/),
[550 ADRs](docs/contributing/adr/), and [raw telemetry for 25 runs](docs/contributing/metrics-baseline.report.json)
```

After (expected, with this plan committed):

```
receipts: [63 design docs](docs/contributing/design/), [62 parted plans](docs/contributing/plan/),
[555 ADRs](docs/contributing/adr/), and [raw telemetry for 25 runs](docs/contributing/metrics-baseline.report.json)
```

readme-drift (scripts/readme-drift.sh → engine/bin/readme-drift.js, corpus-counts sub-guard)
compares each bracketed number with the file count of the linked directory. Set each number to
the "tree holds" count `bash scripts/readme-drift.sh .` reports at commit time. When this plan
was committed the tree held 63 design docs, 62 plans (this plan included) and 555 ADRs. Take the
numbers from the tool, not from this text: a later commit may add a file. The tool prints one
line per drifting directory (`readme-drift: corpus-counts: <dir> claims <n>, tree holds <m>`); a
directory it does not name already matches. Leave the telemetry count (25 runs) and every other
byte of the two lines alone: it counts runs in docs/contributing/metrics-baseline.report.json,
which this change does not refresh.

Tests that read these numbers (all run by `ci.sh`; none is edited):
engine/test/readme-drift-main.test.js (the DEFAULT_ROOT live-tree test, line 304) and
test/readme-drift.test.js (line 98, "Given the live repo tree, when readme-drift runs, then it
exits 0 with no findings", anchored on the counted directory links, never on line numbers).

Public surface: none (prose only).

### TDD steps

No code delta and no new test.

1. RED (existing test, already failing) — engine/test/readme-drift-main.test.js "Given no root
   argument, when main runs, then it resolves DEFAULT_ROOT against the real repo root and finds
   no unusable-input errors", and `bash scripts/readme-drift.sh .` exiting 1. Both fail at the
   start of this part because the README claims 62 design docs, 61 plans and 550 ADRs while the
   tree holds 63, 62 and 555 (see the baseline). The live-tree test in test/readme-drift.test.js
   is red for the same reason but is never reached, because `ci.sh` stops at the engine suite.
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
git diff --no-ext-diff README.md | grep -cE '^-[^-]'
bash scripts/ci.sh > "$LOG/ci.log" 2>&1; echo "exit=$?"; grep -nE '^not ok|^# fail [1-9]|^ci:|SLOP-FOUND|STUB-FOUND' "$LOG/ci.log" | head -40; tail -3 "$LOG/ci.log"
```

Expected: readme-drift exits 0 with no output, the diff count prints `2`, `ci.sh` exits 0 and the
grep prints nothing. Never commit on a red gate.

### Commit

`docs(readme): refresh the design, plan and adr corpus counts`

## Part 2 — hook header states the foreground-stall timeout behaviour

### Context

File edited: `hooks/git-no-ext-diff.sh`, inside its leading header comment only (lines 2-21
today; `set -euo pipefail` is line 22). Every line from `set -euo pipefail` down stays
byte-identical (design R1). No executable line changes. Lines 10-21 are the crash-path
paragraph; line 10 (`# Crash path: Claude Code (2.1.296) runs the Bash call on every hook exit
status except 2,`) is NOT touched and NOT re-labelled (ADR-553). Lines 51-54 hold the trap
comment and the TERM/HUP traps and are not touched (they move down one line, to 52-55).

Edit: the timeout sentence (ADR-547) runs lines 17-21; line 17 stays, lines 18-21 are replaced
by five lines. Today (lines 15-16 shown for anchoring, unchanged):

```bash
# TERM and HUP deny the same way. Still fails open, because no code here runs to catch it:
# /bin/bash missing, this file missing or not executable, SIGKILL or any other untrapped
# signal. A run past Claude Code's hook timeout (600 s; hooks.json sets none) fails open
# too, though code here does run: Claude Code (2.1.296) sends SIGTERM at the deadline, then
# runs the call whatever this hook exits with or prints (probed with the hook interrupted in
# a background wait; a stall in a foreground command was not probed). The TERM and HUP traps
# still deny either signal from any other sender.
```

After (lines 15-17 unchanged, lines 18-21 replaced by lines 18-22):

```bash
# TERM and HUP deny the same way. Still fails open, because no code here runs to catch it:
# /bin/bash missing, this file missing or not executable, SIGKILL or any other untrapped
# signal. A run past Claude Code's hook timeout (600 s; hooks.json sets none) fails open
# too, though code here does run: at the deadline Claude Code sends SIGTERM to this hook's
# whole process tree, so a stalled cat, jq, grep or sed dies with it (whatever survives is
# SIGKILLed), then runs the call whatever this hook exits with or prints (2.1.296 with the
# hook in a background wait, 2.1.299 stalled in a foreground command). The TERM and HUP
# traps still deny either signal from any other sender.
```

The header grows from 20 to 21 comment lines; `set -euo pipefail` moves to line 23. Every new
line starts with `# `, and `cat`, `jq`, `grep`, `sed` stay unquoted words in the comment (no
backticks: this is a shell comment). No ADR, phase or backlog reference goes into the comment.
Keep the file mode (100755): edit in place, do not recreate the file.

Tests that touch this file, none edited: test/hooks.test.js (78 tests; it spawns the hook and
hook copies; its anchors `trap ` and `IN=${IN%` match code lines only; the two
`Given a ${signal} while the hook reads stdin…` tests at line 366 keep pinning exit 2 for TERM
and HUP from a pid-only sender). hooks/hooks.json is NOT edited (ADR-548), so its
`deepStrictEqual` pin at test/hooks.test.js:546 stays green.

Public surface: none (comment only).

### TDD steps

No code delta and no new test (ADR-554).

1. RED (verification) — `grep -c 'not probed' hooks/git-no-ext-diff.sh` prints 1: the answered
   qualifier is still in the header (line 20).
2. RED (verification) — `grep -c '2.1.299' hooks/git-no-ext-diff.sh` prints 0 and exits 1: the
   foreground-stall measurement is not stated yet.
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
grep -c 'not probed' hooks/git-no-ext-diff.sh
grep -c '2.1.299' hooks/git-no-ext-diff.sh
diff <(git show main:hooks/git-no-ext-diff.sh | sed -n '/^set -euo pipefail$/,$p') <(sed -n '/^set -euo pipefail$/,$p' hooks/git-no-ext-diff.sh); echo "r1-exit=$?"
git diff --no-ext-diff main -- hooks/git-no-ext-diff.sh | grep -E '^[-+][^-+]' | grep -vE '^[-+]# '; echo "non-comment-lines-exit=$?"
node --test test/hooks.test.js > "$LOG/hooks.log" 2>&1; echo "exit=$?"; grep -nE '^not ok|^# (pass|fail)' "$LOG/hooks.log"
bash scripts/ci.sh > "$LOG/ci.log" 2>&1; echo "exit=$?"; grep -nE '^not ok|^# fail [1-9]|^ci:|SLOP-FOUND|STUB-FOUND' "$LOG/ci.log" | head -40; tail -3 "$LOG/ci.log"
```

Expected: `0`, `1`, `r1-exit=0`, `non-comment-lines-exit=1`, hooks suite pass 78 / fail 0,
`ci.sh` exits 0 and its grep prints nothing.

### Commit

`docs(hooks): state the tree sigterm and sigkill escalation in the git guard timeout note`

## Part 3 — gate spec: the Claude binding's timeout paragraph

### Context

File edited: `docs/contributing/specs/gate.md`. Section `## Claude binding` (line 41), the
hooks/git-no-ext-diff.sh bullet at line 47. Its `On a crash:` paragraph runs lines 58-70 and is
NOT touched (design R3). Line 71 is blank. The `On a timeout:` paragraph is lines 72-80, indented
two spaces. Line 81 is blank; line 82 starts the `**gate-command**` paragraph. Only lines 72-80
change: they are replaced by a 14-line paragraph at the same two-space indent; the blank lines
71 and 81 stay.

Today (lines 72-80):

```markdown
  On a timeout: Claude Code 2.1.296 sends SIGTERM to a hook that runs past its `timeout`
  (documented default 600 s; `hooks/hooks.json` sets none), then runs the Bash call whatever
  the hook exits with or prints, and the model sees a clean result with no hook event. The
  probe tried both deny channels after the TERM: exit 2 with a stderr reason, and a JSON
  `permissionDecision: "deny"` on stdout. Both were ignored. The probe hook was interrupted in
  a background wait; a hook stalled in a foreground command was not probed. So a timeout fails
  open, and nothing the hook does after the deadline is read. The TERM and HUP traps stay: they
  deny either signal from any other sender. The timeout matrix is in
  [the design doc](../design/claude-hook-timeout-probe.md).
```

After (lines 72-85; `**gate-command**` moves to line 87):

```markdown
  On a timeout: Claude Code sends SIGTERM to a hook that runs past its `timeout` (documented
  default 600 s; `hooks/hooks.json` sets none), then runs the Bash call whatever the hook exits
  with or prints, and the model sees a clean result with no hook event. On 2.1.296, with the
  hook interrupted in a background wait, the probe tried both deny channels after the TERM:
  exit 2 with a stderr reason, and a JSON `permissionDecision: "deny"` on stdout. Both were
  ignored. On 2.1.299, with the hook stalled in a foreground command, the SIGTERM reached the
  hook's whole process tree, found by parent pid, so a foreground child that dies on TERM
  (`cat`, `jq`, `grep` and `sed` all do) died at the deadline, the TERM trap ran at once, and
  its crash deny was ignored the same way. A tree that survived the TERM was SIGKILLed about
  1.2–1.7 s later. Claude Code did not hang. So a timeout fails open, and nothing the hook does
  after the deadline is read. The TERM and HUP traps stay: they deny either signal from any
  other sender. The timeout matrices are in
  [the background-wait design doc](../design/claude-hook-timeout-probe.md) and
  [the foreground-stall design doc](../design/claude-hook-foreground-stall-probe.md).
```

The `1.2–1.7` range uses an en dash (U+2013), as the design writes it. Both relative links
resolve from docs/contributing/specs/: docs/contributing/design/claude-hook-timeout-probe.md and
docs/contributing/design/claude-hook-foreground-stall-probe.md both exist. hooks/hooks.json is
named in prose only; it is NOT edited.

Gates that read this file: test/source-hygiene.test.js (scans docs/contributing/specs; the new
prose has no banned word and no home-rooted path) and intention-lint (frontmatter unchanged).
prose-lint skips docs/contributing/specs.

Public surface: none (prose only).

### TDD steps

No code delta and no new test (ADR-554).

1. RED (verification) — `grep -c 'not probed' docs/contributing/specs/gate.md` prints 1 (line
   77, its only hit): the answered qualifier is still there.
2. RED (verification) — `grep -c 'foreground-stall design doc' docs/contributing/specs/gate.md`
   prints 0 and exits 1: the second matrix link does not exist yet.
3. GREEN — apply the edit. The first grep prints 0, the second prints 1.
4. GUARD — `git diff --no-ext-diff -U0 main -- docs/contributing/specs/gate.md | grep '^@@'`
   prints exactly one hunk header, `@@ -72,9 +72,14 @@`: only the `On a timeout:` paragraph
   changed, the `On a crash:` paragraph is byte-identical. Both link targets exist:
   `test -f docs/contributing/design/claude-hook-timeout-probe.md && test -f docs/contributing/design/claude-hook-foreground-stall-probe.md`.

REFACTOR: none.

### Gate

```bash
LOG="$(mktemp -d)"
grep -c 'not probed' docs/contributing/specs/gate.md
grep -c 'foreground-stall design doc' docs/contributing/specs/gate.md
git diff --no-ext-diff -U0 main -- docs/contributing/specs/gate.md | grep '^@@'
test -f docs/contributing/design/claude-hook-timeout-probe.md && test -f docs/contributing/design/claude-hook-foreground-stall-probe.md; echo "links-exit=$?"
bash scripts/ci.sh > "$LOG/ci.log" 2>&1; echo "exit=$?"; grep -nE '^not ok|^# fail [1-9]|^ci:|SLOP-FOUND|STUB-FOUND' "$LOG/ci.log" | head -40; tail -3 "$LOG/ci.log"
```

Expected: `0`, `1`, the single hunk header `@@ -72,9 +72,14 @@ hook set:`, `links-exit=0`,
`ci.sh` exits 0 and its grep prints nothing.

### Commit

`docs(gate): record the foreground-stall timeout behaviour in the claude binding spec`

## Part 4 — BACKLOG: the foreground-stall probe entry is delivered

### Context

File edited: `BACKLOG.md`. One entry is replaced in place; it stays in its section
`### Open (scoped 2026-10-13 — follow-ups surfaced by the claude-hook-timeout-probe run, not yet scheduled)`
(line 178), as the delivered timeout-probe entry in the next section did (design R4). Line 179 is
blank; the entry is lines 180-188; line 189 is blank; the next section heading is line 190. The
delivered timeout-probe entry at lines 192-201 is NOT touched.

Lines 180-188 today (the entry to replace, 9 lines):

```
**Probe a Claude Code hook timeout while the hook is stalled in a foreground command.** The
timeout probe interrupted its hook in a background `wait`, so the TERM trap ran at once. A real
stall sits in a foreground `cat`/`jq`/`grep`, where bash defers the TERM trap until the child
exits, and whether Claude Code signals the process group or only the hook pid was not observed.
The hook header and the gate spec now say "a stall in a foreground command was not probed".
Prove it with the same throwaway `claude -p` harness: the overrun row with `sleep <n>` in the
foreground plus a `ps -g <pgid>` snapshot at the deadline, then check MARKER (1-3 haiku turns).
If the call runs, drop the qualifier; if the session hangs instead, write that down. See the Out
of scope list in [claude-hook-timeout-probe](docs/contributing/design/claude-hook-timeout-probe.md).
```

Replace with (10 lines; `<date>` is the commit day, `date +%F`, expected 2026-10-14):

```
**Probe a Claude Code hook timeout while the hook is stalled in a foreground command — delivered <date>**
(fix/claude-hook-foreground-stall-probe). The call runs and Claude Code does not hang: at the
deadline Claude Code 2.1.299 sends SIGTERM to the hook's whole process tree (by parent pid, not
by process group), so a foreground `sleep` died, the deferred TERM trap ran and its crash deny was
ignored (2/2), and a tree that survived TERM was SIGKILLed about 1.2–1.7 s later (3/3, timed on
2); the model saw a clean result every time (live `claude -p` probe, 5 haiku turns, a 3 s
`timeout`). Nothing the hook can act on, so the change is document-only: the hook header and the
gate spec drop the "not probed" qualifier and state the tree TERM and the SIGKILL escalation
(ADRs 551-555).
Design context: [claude-hook-foreground-stall-probe](docs/contributing/design/claude-hook-foreground-stall-probe.md).
```

This is the design's Part 4 text under DC-1 (b) with `<range>` resolved to 551-555 (the five
ADRs the decisions phase wrote). House format, from the delivered neighbour at lines 192-201:
bold title ending `— delivered <date>**`, the branch in parentheses on the next line, the ADR
range in parentheses at the end of the last sentence before `Design context:`, then the design
link. The `1.2–1.7` range uses an en dash (U+2013). The blank lines before (line 179) and after
(line 189) the entry stay.

Gates that read this file: `bash scripts/backlog-lint.sh BACKLOG.md` (only checks the five
required headings `## Status`, `## Candidate phases`, `## Parked`, `### Condition-gated`,
`### Closed`, none of which moves), intention-lint (the `> SoT —` block at lines 7-8 is not
touched), prose-lint (advisory; the text carries none of the filler words).

Public surface: none (prose only).

### TDD steps

No code delta and no new test.

1. RED (verification) — `grep -c 'stalled in a foreground command — delivered' BACKLOG.md`
   prints 0 and exits 1: the entry is still open.
2. GREEN — replace lines 180-188 with the 10-line block above. The grep prints 1, and
   `grep -c 'stalled in a foreground command\.\*\*' BACKLOG.md` prints 0 (the open title is
   gone).
3. GUARD — `bash scripts/backlog-lint.sh BACKLOG.md` prints
   `backlog-lint: 5 required sections present — structure OK.` before and after.
4. GUARD — `git diff --no-ext-diff -U0 main -- BACKLOG.md | grep '^@@'` prints exactly one hunk
   header, `@@ -180,9 +180,10 @@`: the delivered entry at lines 192-201 is untouched.

REFACTOR: none.

### Gate

```bash
LOG="$(mktemp -d)"
bash scripts/backlog-lint.sh BACKLOG.md; echo "exit=$?"
grep -c 'stalled in a foreground command — delivered' BACKLOG.md
grep -c 'stalled in a foreground command\.\*\*' BACKLOG.md
git diff --no-ext-diff -U0 main -- BACKLOG.md | grep '^@@'
bash scripts/ci.sh > "$LOG/ci.log" 2>&1; echo "exit=$?"; grep -nE '^not ok|^# fail [1-9]|^ci:|SLOP-FOUND|STUB-FOUND' "$LOG/ci.log" | head -40; tail -3 "$LOG/ci.log"
git diff --no-ext-diff main --stat -- docs/contributing/design/claude-hook-timeout-probe.md docs/contributing/plan/claude-hook-timeout-probe.md docs/contributing/design/claude-hook-nonzero-exit-probe.md hooks/hooks.json test/
git diff --no-ext-diff main --name-status -- docs/contributing/adr/
git diff --no-ext-diff main -- README.md hooks/git-no-ext-diff.sh docs/contributing/specs/gate.md BACKLOG.md | grep -E '^\+' | grep -E '/Users/|/home/'; echo "home-paths-exit=$?"
```

Expected: backlog-lint exit 0, `1`, `0`, the single hunk header
`@@ -180,9 +180,10 @@ Beyond the PRD program. …`, `ci.sh` exits 0 and its grep prints nothing.
After this last part design R7 and R8 also hold: the `--stat` prints nothing; the `--name-status`
prints exactly five `A` lines, the ADRs 551-555 added on this branch before planning (no ADR is
modified); `home-paths-exit=1`.

### Commit

`docs(backlog): mark the claude hook foreground-stall probe delivered`
