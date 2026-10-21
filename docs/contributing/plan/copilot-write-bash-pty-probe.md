# Plan — copilot-write-bash-pty-probe

> Source: design doc `docs/contributing/design/copilot-write-bash-pty-probe.md` · ADRs `664, 665, 666`
> (all ratified by the user: 664 the evidence lands as CONFIRMED row 21 of the PoC record; 665 the
> residual bullets are deleted and the closed fact joins the existing closed bullets in gate.md and
> the copilot adapter README; 666 the copilot guard design doc stays a dated record, untouched)
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

| # | Part | src delta | Files | Size | Design section |
|---|---|---|---|---|---|
| 1 | Close the copilot `write_bash` pty residual in the PoC record, gate.md and the adapter README | none (docs only) | 3 | small | Design Parts 1, 2, 3 |

How the design's choices land here:

- The change is doc-only (design R6). Three files, five text edits, all pasted verbatim from the
  design: one agent lifecycle holds them, and splitting per file would buy three spin-ups for
  ~25 lines of prose. One part, one commit.
- Untouched by instruction (R6, ADR 666): adapters/copilot/src/** (including
  `COPILOT_TOOL_NAME_CASING` and its comment in adapters/copilot/src/git-guard-adapter.js — the
  comment is still true), adapters/copilot/test/**, hook registration, launch argv, and
  docs/contributing/design/copilot-git-argv-normalising-guard.md.
- Not in this plan: the BACKLOG.md tick (BACKLOG.md "Open — B. Agent-CLI re-probes", first
  bullet; the documentation phase's ticker moves it, R7), and the root README parted-plan count
  (86 → 87), which lands with this plan commit. No part touches the root README.md.
- No new exported symbol, no public surface: nothing to pre-pay at barrels or registries.

Pre-validated in a scratch extract (`git archive HEAD` of this branch at `c954f93`), with the
exact edits below applied:

| Check | Result |
|---|---|
| Every anchor string below found exactly once in its file | yes (3 files, 5 anchors) |
| `node --test adapters/copilot/test/native-surface.test.js test/living-corpus.test.js` | 97 pass / 0 fail (README provenance and shell-injection scans included) |
| `node engine/bin/prose-lint.js --gate blocking -- adapters/copilot/README.md` | exit 0 |
| intention-lint over the living corpus (`bash scripts/living-corpus.sh`) | `craft-intention: OK — 28 path(s) valid.` |

Standing rules for the part:

- Paste the new text exactly as given; write no prose of your own. Every new sentence is already
  in the design doc and checked against the probe evidence.
- No ADR/phase/backlog/probe numbers (`ADR-664`, `Part 1`, `backlog #n`, `W1`…`W6`) in
  adapters/copilot/README.md: adapters/copilot/test/native-surface.test.js scans it with
  `PROVENANCE_REF` and `SHELL_INJECTION_PATTERN` (an exclamation mark right before a backtick).
- No absolute or home-rooted path in any touched file. Out-of-repo locations stay as
  `<cwd>`/`<marker>`/`<prompt>` placeholders.
- No sentence may claim the guard blocks or denies `write_bash` (R5): the guard passes that name
  through unjudged.
- Stage the three files by explicit path with `/usr/bin/git add <path>`; never `commit -am`
  (another agent may share the tree).
- ci.sh output goes to a file; read back the tail only. Run it niced:
  `nice -n 19 bash scripts/ci.sh > <scratch>/ci.log 2>&1; echo "exit $?"`.

## Decision candidates

None open: DC-1/DC-2/DC-3 are settled by ADRs 664/665/666, and planning surfaced no new choice.

## Part 1 — Close the copilot write_bash pty residual

### Context

Files edited: `docs/contributing/specs/copilot-poc-record.md`, `docs/contributing/specs/gate.md`,
`adapters/copilot/README.md`. Read-only reference: docs/contributing/design/copilot-write-bash-pty-probe.md
(Context "Evidence" table, rows W1-W6).

Lint scope of these files in scripts/ci.sh: `run_prose_lint` lints adapters/copilot/README.md
(specs are exempt); `run_intention_lint` reads both specs (they are in the living corpus,
test/living-corpus.test.js lists them); adapters/copilot/test/native-surface.test.js runs its
hygiene scans over the adapter README.

The re-open trigger is worded the same in all three files (R4): "a copilot version whose request
`tools` list carries `write_bash` again". Keep the phrase "carries `write_bash` again" on one line
in each file; the GREEN grep relies on it.

**Edit 1 — PoC record, Verdict paragraph** (docs/contributing/specs/copilot-poc-record.md, line 32).
Current line, verbatim:

```markdown
1.0.92 and re-confirmed on 1.0.98 (live probe 2026-10-15, same method): the hook now **denies**. An end-to-end craft construction
```

Insert one sentence between "the hook now **denies**." and " An end-to-end", so the line becomes:

```markdown
1.0.92 and re-confirmed on 1.0.98 (live probe 2026-10-15, same method): the hook now **denies**. Row 21 was pinned on 1.0.98 (live probe 2026-10-21, same method, headless and interactive pty). An end-to-end craft construction
```

Leave "The 20 rows below were pinned live against `copilot` 1.0.63" (lines 30-31) as it is: it
stays true.

**Edit 2 — PoC record, CONFIRMED row 21.** The table's last row today is row 20 (line 62, starts
`| 20 | ` and ends `| ... |`), followed by a blank line and `## DEFERRED` (line 64). Insert this
line directly after row 20, before the blank line:

```markdown
| 21 | `write_bash` into a shell — not a model tool (1.0.98) | **1.0.98 (live probe 2026-10-21, BYOK method above, headless `-p` and interactive `-i` under a real pty, 3/3 each):** every provider request's `tools` list holds `bash`, `read_bash`, `stop_bash`, `list_bash` and no `write_bash` (the interactive list adds `ask_user`). A scripted `write_bash {shellId, input, delay}` call returns `Tool 'write_bash' does not exist. Available tools that can be called are bash, read_bash, …`. An async `bash` shell's stdin is `/dev/null` (`[ -t 0 ]` false), so a `sh` in it reads EOF and exits 0. No marker file, no `push` in the stub git log. The preToolUse hook **fires** for the call (`toolName: "write_bash"`, `toolArgs` an object carrying `shellId`, `input`, `delay`) before the rejection; the guard passes that name through unjudged. Corroborated by the 1.0.62 changelog (shell commands no longer run in a pseudo-terminal; `write_bash` input no longer supported). Re-open trigger: a copilot version whose request `tools` list carries `write_bash` again. |
```

**Edit 3 — PoC record, Reproduction notes.** Current line 82, verbatim:

```markdown
- cap the run with a background watchdog (macOS has neither `timeout` nor `gtimeout` by default);
```

Insert these three lines directly after it (before the `- invoke runAcceptanceProbe …` bullet):

```markdown
- for an interactive (pty) row, spawn `copilot -i <prompt>` under `expect`, which allocates a pty;
  do not wait on a literal end marker (the TUI splits it across redraws), cap with the `expect`
  timeout and read completion off the fake provider's request log;
```

**Edit 4 — gate.md.** Delete these two lines (docs/contributing/specs/gate.md:266-267), verbatim:

```markdown
- Copilot `write_bash` into an interactive (pty) session is unguarded: headless 1.0.98 sessions
  have stdin at EOF (live probe 2026-10-15); interactive sessions are unprobed.
```

Then, in the "- Closed, no longer residuals:" bullet, the codex `write_stdin` sentences end with
this line (currently :283), verbatim:

```markdown
  release that ignores the key would reopen it silently.
```

Insert these six lines directly after it (still inside that bullet, two-space continuation
indent), before the "- Closed, not a residual: cross-call shell state." bullet:

```markdown
  Copilot `write_bash` reaches no shell: on 1.0.98 it is not a model tool in headless or
  interactive (pty) sessions (live probe 2026-10-21, 3/3 each). The request `tools` list carries
  `bash`, `read_bash`, `stop_bash`, `list_bash` only, a `write_bash` call is rejected as
  `Tool 'write_bash' does not exist`, and an async shell's stdin is `/dev/null`. The preToolUse
  hook fires for the call and the guard passes that name through unjudged. A copilot version whose
  request `tools` list carries `write_bash` again reopens it.
```

The "Closed, not a residual: cross-call shell state" bullet stays as it is.

**Edit 5 — adapter README.** Under "Residuals, stated as measured or designed:", delete these two
lines (adapters/copilot/README.md:122-123), verbatim:

```markdown
- **`write_bash` into an interactive (pty) session** is unguarded: headless 1.0.98 sessions have
  stdin at EOF (live probe 2026-10-15); interactive sessions are unprobed.
```

Then the "- **Closed, not residuals**:" bullet ends with this line (currently :131), verbatim:

```markdown
  Every fail-closed denial carries a reason.
```

Insert these four lines directly after it, before the "- **Intended false blocks**" bullet:

```markdown
  `write_bash` reaches no shell: on 1.0.98 it is not a model tool in headless or interactive (pty)
  sessions, and an async shell's stdin is `/dev/null` (live probe 2026-10-21). The hook fires for
  a `write_bash` call; the guard passes it through unjudged. A copilot version whose request
  `tools` list carries `write_bash` again reopens it.
```

The "- **No cross-call shell state**" bullet (1.0.92/1.0.98 fact about `bash`) stays as it is.

### TDD steps

Doc-only: no unit test drives this change (design Test strategy). The red/green signal is a set
of grep assertions run from the repo root.

1. RED — the residual is still stated and row 21 is absent:
   - `grep -n 'interactive sessions are unprobed' docs/contributing/specs/gate.md adapters/copilot/README.md`
     Expected now: 2 hits (gate.md:267, README.md:123) — both files still list the pty case as an
     open residual.
   - `grep -c '^| 21 |' docs/contributing/specs/copilot-poc-record.md`
     Expected now: `0` — the CONFIRMED table stops at row 20.
   - `grep -c 'carries `write_bash` again' docs/contributing/specs/copilot-poc-record.md docs/contributing/specs/gate.md adapters/copilot/README.md`
     Expected now: `0` for each file — no re-open trigger is stated anywhere.
2. GREEN — apply Edits 1-5 from Context, verbatim. Then:
   - the first grep returns no hit;
   - the row-21 grep returns `1`;
   - the trigger grep returns `1` for each of the three files;
   - `grep -c 'Row 21 was pinned on 1.0.98' docs/contributing/specs/copilot-poc-record.md` returns `1`;
   - `grep -c 'for an interactive (pty) row' docs/contributing/specs/copilot-poc-record.md` returns `1`.
   GUARD — `node --test adapters/copilot/test/native-surface.test.js test/living-corpus.test.js`:
   every row passes (pre-validated: 97/97; the new README text carries no provenance token and no
   shell-injection pattern).
   GUARD — `grep -nE 'blocks `write_bash`|denies `write_bash`|/Users/|/home/' ` over the three
   files: no hit (R5, no home-rooted path).
3. REFACTOR — none expected. If prose-lint flags a word in the README text, report it as a
   blocker rather than rewording (the text is user-ratified); pre-validation found none.

### Gate

- `node --test adapters/copilot/test/native-surface.test.js test/living-corpus.test.js`
- `nice -n 19 bash scripts/ci.sh > <scratch>/ci.log 2>&1; echo "exit $?"` then read the log tail
  and grep it for `not ok`/`ci:` lines — exit 0.

### Commit

`docs(copilot): close the write_bash pty residual on 1.0.98`
