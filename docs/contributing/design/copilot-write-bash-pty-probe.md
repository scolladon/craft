# Design — copilot-write-bash-pty-probe

> Brief: probe Copilot `write_bash` into an interactive (pty) session (BACKLOG "Copilot
> `write_bash` into an interactive (pty) session is unprobed."). The guard never sees `write_bash`
> text; headless 1.0.98 sessions were known to have stdin at EOF, the pty case was not probed.
> Status: draft → self-reviewed ×3

## Context

### What the docs say today

| Surface | File | State |
|---|---|---|
| Guard hook | `adapters/copilot/src/git-guard-adapter.js` `COPILOT_TOOL_NAME_CASING` (`:23-25`) maps `bash → Bash`, `create → Write`, `edit → Edit`; the comment at `:14-19` says unmapped names pass through to the predicate's `{ block: false }` tail | A `write_bash` call reaching the hook is allowed unjudged |
| Gate spec | `docs/contributing/specs/gate.md:266-267` | Residual: "`write_bash` into an interactive (pty) session is unguarded … interactive sessions are unprobed" |
| Adapter README | `adapters/copilot/README.md:122-123`, under "Residuals, stated as measured or designed" | Same residual, bold-lead bullet style |
| PoC record | `docs/contributing/specs/copilot-poc-record.md`, CONFIRMED table rows 1-20; row 11 already says only `bash` takes shell text | No `write_bash` row |
| Prior design | `docs/contributing/design/copilot-git-argv-normalising-guard.md:77-78`, `:487-488` | Records the pty case as unprobed (as of 2026-10-15) |
| Backlog | `BACKLOG.md:189-192`, "Open — B. Agent-CLI re-probes", first bullet | Open |

### Evidence (offline, copilot 1.0.98, live probe 2026-10-21)

Method: the PoC record's BYOK method. A fake OpenAI-compatible SSE provider
(`COPILOT_PROVIDER_BASE_URL`, `COPILOT_OFFLINE=true`, `COPILOT_ALLOW_ALL=true`) scripts the turn
`bash {command, async: true, shellId: "wbprobe"}` → `write_bash {shellId, input: "touch WB_REACHED;
git push origin main\n", delay: 3}` → `read_bash` → `stop_bash` → text. Throwaway `mktemp` `HOME`,
`XDG_CONFIG_HOME`, `COPILOT_HOME`; a stub `git` first on `PATH` that only appends its argv to a log;
a preToolUse hook in `$COPILOT_HOME/settings.json` that only logs its stdin and exits 0. The async
shell records its stdin kind (`[ -t 0 ]`, `ls -l /dev/fd/0`), then runs `sh` and records its exit.
Headless: `copilot -p … --allow-all-tools --allow-all-paths --output-format json`, 90 s watchdog.
Interactive: `expect` spawns `copilot -i "run the probe" --allow-all-tools --allow-all-paths` in a
real pty, 90 s timeout, then two Ctrl-C.

| # | Probe | Result (1.0.98), headless 3/3 and interactive 3/3 alike |
|---|---|---|
| W1 | `tools` list on every provider request | `bash`, `read_bash`, `stop_bash`, `list_bash`; no `write_bash`. The interactive list also carries `ask_user`, which shows the session was interactive |
| W2 | Scripted `write_bash` call | Tool result: `Tool 'write_bash' does not exist. Available tools that can be called are bash, read_bash, stop_bash, list_bash, apply_patch, view, …` |
| W3 | Async shell stdin | `/dev/fd/0` is the character device `0x3000002` (`/dev/null`); `[ -t 0 ]` false; `sh` read EOF and exited 0 at once; `read_bash` reports `<shellId: wbprobe completed with exit code 0>` |
| W4 | Side effects | No `WB_REACHED` file. The stub git log holds only copilot's startup calls (`--version`, `rev-parse --show-toplevel`, `-C <cwd> remote -v`); no `push` |
| W5 | preToolUse hook | Fired for `write_bash` before the rejection: `toolName: "write_bash"`, `toolArgs: {"shellId":"wbprobe","input":"touch WB_REACHED; git push origin main\n","delay":3}` |
| W6 | Isolation | `find ~/.copilot -newer <marker> -type f` empty after every run; no orphaned process |

Harness note: `expect` never matched the literal end marker (the TUI splits it across redraws) and
hit its timeout; the provider log shows all five requests through the `stop_bash` result, so the
turn completed.

Static corroboration: the copilot changelog for 1.0.62 says shell commands run through plain
process spawning instead of a pseudo-terminal and that interactive input via `write_bash` is no
longer supported. The 1.0.98 bundle still classifies a `write_bash`/`write_powershell` name as a
`write_shell` display kind (schema `{shellId, input, delay?}`), but does not register the tool for
the model.

Reading: on 1.0.98 `write_bash` is not a model tool in either mode (W1, W2), and even an async
shell has no stdin to type into (W3). Nothing reaches a shell (W4). The hook does see the call
(W5), so a guard could judge it, but there is no live channel for it to close.

### Already decided (user)

A guard change is designed only if `write_bash` reached a live shell. It does not, so this change
is doc-only: no guard, hook, launch-argv or test change.

## Requirements

- R1. `docs/contributing/specs/copilot-poc-record.md` records W1-W6 as version-pinned evidence:
  method (both modes, 3/3 each), the tool list, the rejection text, stdin `/dev/null`, no side
  effect, the hook firing with the `write_bash` payload, and the re-open trigger. The record's
  Verdict paragraph names the new evidence and its date. Reproduction notes gain the pty step.
  Repo-relative paths only; `<cwd>`/`<marker>` placeholders for out-of-repo locations.
- R2. `docs/contributing/specs/gate.md`: the bullet at `:266-267` is deleted, and the closed fact
  joins the "Closed, no longer residuals" family with its version pin (1.0.98, live probe
  2026-10-21) and its re-open trigger.
- R3. `adapters/copilot/README.md`: the bullet at `:122-123` is deleted, and the closed fact joins
  the "**Closed, not residuals**" bullet (`:127-131`) with the same pin and trigger.
- R4. The re-open trigger, worded the same in R1-R3: a copilot version whose request `tools` list
  carries `write_bash` again reopens the channel and needs a re-probe and a guard decision.
- R5. Every edit states the hook-sees-`write_bash` fact (W5) and that the guard passes that name
  through unjudged; none claims the guard blocks `write_bash`.
- R6. No change to `adapters/copilot/src/**`, `adapters/copilot/test/**`, hook registration or
  launch argv. `COPILOT_TOOL_NAME_CASING` and its comment stay as they are: the comment is still
  true.
- R7. `BACKLOG.md:189-192` is resolved. The documentation phase's backlog ticker moves it; this
  run files no new BACKLOG entry.
- R8. `README.md:226` design-doc count goes from 88 to 89 in the same commit as this doc
  (`scripts/readme-drift.sh` counts the files on disk).

## Design

### Part 1 — PoC record (`docs/contributing/specs/copilot-poc-record.md`)

Per DC-1 (a): one new CONFIRMED row after row 20, in the table's existing `| # | Dimension |
Pinned result |` shape.

```markdown
| 21 | `write_bash` into a shell — not a model tool (1.0.98) | **1.0.98 (live probe 2026-10-21, BYOK method above, headless `-p` and interactive `-i` under a real pty, 3/3 each):** every provider request's `tools` list holds `bash`, `read_bash`, `stop_bash`, `list_bash` and no `write_bash` (the interactive list adds `ask_user`). A scripted `write_bash {shellId, input, delay}` call returns `Tool 'write_bash' does not exist. Available tools that can be called are bash, read_bash, …`. An async `bash` shell's stdin is `/dev/null` (`[ -t 0 ]` false), so a `sh` in it reads EOF and exits 0. No marker file, no `push` in the stub git log. The preToolUse hook **fires** for the call (`toolName: "write_bash"`, `toolArgs` an object carrying `shellId`, `input`, `delay`) before the rejection; the guard passes that name through unjudged. Corroborated by the 1.0.62 changelog (shell commands no longer run in a pseudo-terminal; `write_bash` input no longer supported). Re-open trigger: a copilot version whose request `tools` list carries `write_bash` again. |
```

Verdict paragraph: after the sentence ending "the hook now **denies**.", add one sentence: "Row 21
was pinned on 1.0.98 (live probe 2026-10-21, same method, headless and interactive pty)." The
"The 20 rows below were pinned live against `copilot` 1.0.63" sentence stays true and is not
edited.

Reproduction notes: one bullet after the watchdog bullet: "for an interactive (pty) row, spawn
`copilot -i <prompt>` under `expect`, which allocates a pty; do not wait on a literal end marker
(the TUI splits it across redraws), cap with the `expect` timeout and read completion off the fake
provider's request log."

### Part 2 — gate spec (`docs/contributing/specs/gate.md`)

Delete `:266-267`. Per DC-2 (a), append to the "Closed, no longer residuals" bullet, after the
codex `write_stdin` sentences ending "would reopen it silently." (`:283`):

```markdown
  Copilot `write_bash` reaches no shell: on 1.0.98 it is not a model tool in headless or
  interactive (pty) sessions (live probe 2026-10-21, 3/3 each). The request `tools` list carries
  `bash`, `read_bash`, `stop_bash`, `list_bash` only, a `write_bash` call is rejected as
  `Tool 'write_bash' does not exist`, and an async shell's stdin is `/dev/null`. The preToolUse
  hook fires for the call and the guard passes that name through unjudged. A copilot version whose
  request `tools` list carries `write_bash` again reopens it.
```

### Part 3 — adapter README (`adapters/copilot/README.md`)

Delete `:122-123`. Append to the "**Closed, not residuals**" bullet, after "Every fail-closed
denial carries a reason." (`:131`):

```markdown
  `write_bash` reaches no shell: on 1.0.98 it is not a model tool in headless or interactive (pty)
  sessions, and an async shell's stdin is `/dev/null` (live probe 2026-10-21). The hook fires for
  a `write_bash` call; the guard passes it through unjudged. A copilot version whose request
  `tools` list carries `write_bash` again reopens it.
```

The "**No cross-call shell state**" bullet (`:124-126`) stays: it is a 1.0.92/1.0.98 fact about
`bash`, unchanged by this probe.

### Part 4 — prior design doc

Per DC-3 (a): `docs/contributing/design/copilot-git-argv-normalising-guard.md` is left as written.
Its `:77-78` and `:487-488` lines describe the state as of 2026-10-15. This doc supersedes them.

### Part 5 — backlog and README count

- `BACKLOG.md:189-192`: named here as resolved; the ticker moves it. No other BACKLOG edit.
- `README.md:226`: `[88 design docs]` → `[89 design docs]`, committed with this doc.

### Edge behaviour

| Case | Outcome |
|---|---|
| Model calls `write_bash` on 1.0.98, either mode | Hook fires, guard allows (unmapped name), copilot rejects the tool as nonexistent; nothing typed runs (W2, W4, W5) |
| Model opens an async `bash` shell running `sh` | `sh` reads `/dev/null`, exits 0; the `bash` command itself was judged by the guard as usual (W3) |
| Model drives an async shell with `read_bash` / `stop_bash` | Neither takes input (row 11); unchanged |
| A later copilot registers `write_bash` again | Re-open trigger (R4): the docs say the closure no longer holds; a re-probe decides whether a guard change is needed |

### Residuals (stated, not fixed)

- The closure rests on copilot's tool registration, not on the guard. A release that registers
  `write_bash` again reopens the channel with no change on craft's side.
- Only 1.0.98 was probed; versions between 1.0.62 and 1.0.98 are inferred from the changelog, not
  pinned.

## Decision candidates

| # | Choice | Alternatives (≤3) | Recommendation | Why |
|---|---|---|---|---|
| DC-1 | Where the PoC record pins W1-W6 | (a) **New CONFIRMED row 21** (`write_bash` into a shell, 1.0.98). (b) Extend row 11's shell-surface sentence. (c) A new "Re-probe — copilot 1.0.98" section with W1-W6 as rows, as `codex-poc-record.md` does | (a) | Row 11 is a hook-enforcement row already carrying three versions' worth of results; the tool-registration fact is a different dimension. The copilot record has no re-probe section, and a six-row section for one finding splits the record's single numbered table. (a) keeps one table, one row per dimension, greppable as row 21 |
| DC-2 | Where the closed fact lands in `gate.md` and the adapter README | (a) **Append to the "Closed, no longer residuals" bullet** (gate) and the "**Closed, not residuals**" bullet (README), after the existing closures. (b) Fold into the adjacent "Closed, not a residual: cross-call shell state" bullet (gate) / "**No cross-call shell state**" bullet (README), both copilot shell-surface facts. (c) A standalone "Closed, not a residual: Copilot `write_bash`" bullet in each | (a) | It mirrors how the codex `write_stdin` residual was closed (`codex-write-stdin-tty-close.md` R5) and keeps every closed residual in one family. (b) mixes a tool-registration fact into a shell-state fact with a different version pin. (c) is clean but adds a third "closed" bullet shape to a list that already has two |
| DC-3 | Whether the prior design doc is amended | (a) **Leave `copilot-git-argv-normalising-guard.md` as a dated record.** (b) Append a dated "Superseded on 2026-10-21" note under its two lines. (c) Rewrite the two lines in place | (a) | Design docs are not edited after merge in this repo: that file's only commits are its creation (`ebda35f`) and a repo-wide home-path scrub (`ee287dd`), and the codex `write_stdin` close left prior docs untouched. Living state lives in the specs and the adapter README, which this change updates. (b) starts a back-patching practice the corpus does not have; (c) rewrites history the doc dates itself to |

## Test strategy

Doc-only. No unit test: there is no code change to drive, and the evidence is the live probe above
(W1-W6), not a test. The gate is `bash scripts/ci.sh`: `readme-drift` (the design-doc count, R8),
`design-lint` (the six headings), and the doc and prose lints over the touched files. Before each
commit, check the touched docs by hand for an absolute or home-rooted path and for a claim that the
guard blocks `write_bash` (R5).

## Out of scope

- A deny-by-name hardening for `write_bash` in `COPILOT_TOOL_NAME_CASING` or the predicate: the
  hook does see the call (W5), but on 1.0.98 there is no reachable channel to close, so the rule
  would guard nothing. The re-open trigger (R4) is where that decision comes back.
- Re-running any copilot probe: the evidence above is the pin.
- Probing `write_powershell`, versions other than 1.0.98, or an authenticated (non-BYOK) seat.
- Editing `copilot-git-argv-normalising-guard.md` (DC-3).
- Filing a new BACKLOG entry: findings fold into this run.
