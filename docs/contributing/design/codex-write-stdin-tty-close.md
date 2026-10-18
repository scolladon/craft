# Design — codex-write-stdin-tty-close

> Brief: close codex's `write_stdin` channel past the PreToolUse guard hook (BACKLOG "Close codex's
> `write_stdin` channel past the guard hook."). On codex-cli 0.162.1, text typed through
> `write_stdin` into a tty session fires no hook, so a shell opened without mentioning git runs
> anything typed into it.
> Status: draft → self-reviewed ×3

## Context

### What is open today

| Surface | File | State |
|---|---|---|
| Guard hook | `adapters/codex/src/git-guard-adapter.js` `CODEX_TOOL_NAMES` (`:26`) maps `exec_command → Bash`, `apply_patch → Write`; the comment at `:21-25` says every other tool, `write_stdin` among them, passes through | `write_stdin` never reaches the hook, so no string guard can see the text it types |
| Config template | `adapters/codex/config.template.toml` | Top-level `sandbox_mode`, `approval_policy`, then `[[hooks.PreToolUse]]` and `[agents.*]` tables. No `[features]` table |
| Launch path | `adapters/codex/src/launch-args.js` `buildLaunchArgs({ workingDir, bypassHookTrust = false })` → `['-s', 'workspace-write', '-C', workingDir]` (+ the bypass flag on opt-in). One consumer: `adapters/codex/src/probe.js:26` | Emits no feature override |
| Disclosure | `adapters/codex/README.md:192-194` ("Still open" bullet), `docs/contributing/specs/gate.md:226-229` (residual), `docs/contributing/specs/codex-poc-record.md:567` (`write_stdin` row, 0.162.1) | All three name the channel as open |

### Evidence (offline, codex-cli 0.162.1)

Method: a fresh fake Responses provider (`name = "fakeprov"`, `wire_api = "responses"`,
`approval_policy = "never"`, `sandbox_mode = "workspace-write"`), one throwaway `HOME`/`CODEX_HOME`
per case, a dumping PreToolUse hook that allows, `mktemp` git repos with no remote, a 60 s kill
watchdog. Scripted calls carried only `echo WS_MARKER > ws_marker.txt`. Isolation:
`find ~/.codex -newer <marker>` = 0 entries; no marker file in the main checkout or the worktree;
0 remotes on every probe repo.

| # | Probe | Result (0.162.1) |
|---|---|---|
| 1 | `codex features list`; bundled model catalog | `unified_exec`, `unified_exec_tty`, `shell_tool`, `write_stdin_approval`: all `stable`, default `true`. Every catalog slug (`gpt-5.5`, `gpt-5.6-sol/terra/luna`, `gpt-6-*`) has `shell_type: "shell_command"`; `gpt-5.4` / `gpt-5.4-mini` are not in it (fallback metadata) |
| 2 | `[features] unified_exec = false`; `codex features disable unified_exec`; `-c features.unified_exec=false` | Each writes the key; `features list` still reports `true`, tool list unchanged. Not switchable on 0.162.1 |
| 3 | `[features] shell_tool = false` | Takes effect, removes the shell entirely |
| 4 | Tool list read off the request body | Default (`gpt-5.5`): `exec_command(cmd\|justification\|login\|max_output_tokens\|prefix_rule\|sandbox_permissions\|shell\|tty\|workdir\|yield_time_ms)`, `write_stdin(chars\|max_output_tokens\|session_id\|yield_time_ms)`, `request_user_input`, `apply_patch`, `view_image`, `get_goal`, `create_goal`, `update_goal`, `tool_search`, `web_search`. With `[features] unified_exec_tty = false`: identical minus `tty`; `write_stdin` stays listed. Same on `gpt-5.4` / `gpt-5.4-mini`. `gpt-5.6-sol` / `gpt-5.6-terra` (the template's models) send no `tools` key at all |
| 5 | Default config: `exec_command {cmd:"sh", tty:true}` then `write_stdin {session_id, chars:"echo WS_MARKER > ws_marker.txt\nexit\n"}` | Marker written; `write_stdin` fired no hook (`gpt-5.5`, `gpt-5.6-terra`, `gpt-5.6-sol`) |
| 6 | Live non-tty session (`exec_command {cmd:"sleep 2; sh"}`) + `write_stdin` | `write_stdin failed: stdin is closed for this session; rerun exec_command with tty=true to keep stdin open`; marker absent. Default config and tty off alike |
| 7 | `unified_exec_tty = false` + a forced `exec_command {cmd:"sh", tty:true}` | Output `TTY execution is disabled by config; omit \`tty\` or set it to false.`; marker absent (`gpt-5.5`, `gpt-5.6-terra`, `gpt-5.6-sol`). The hook still fired first (`Bash {"command":"sh"}`) |
| 8 | `codex exec -c features.unified_exec_tty=false`, no config key | Same refusal, `tty` absent from the schema. The `-c` flag also overrides a config `[features] unified_exec_tty = true` |
| 9 | Hook payload with tty off | Keys `session_id, turn_id, transcript_path, cwd, hook_event_name, model, permission_mode, tool_name, tool_input, tool_use_id`; `tool_name: "Bash"`, `tool_input: {"command": …}`. Identical to `adapters/codex/test/fixtures/pre-tool-use-bash.json` |

Reading: `write_stdin` only reaches a stdin that a tty session keeps open (6). With tty sessions
switched off, no session keeps stdin open (6, 7), so `write_stdin` has nothing to type into, even
though it stays listed (4). `unified_exec` cannot be switched off (2) and `shell_tool = false`
removes the shell (3), so `unified_exec_tty` is the only lever. The payload (9) and the tool name
(4) do not change, so `CODEX_TOOL_NAMES` and the fixture stay as they are.

### Already decided (user)

The binding disables interactive tty sessions: `adapters/codex/config.template.toml` sets
`[features] unified_exec_tty = false`. Accepted cost: the model gets no REPL, no interactive shell,
no prompt-answering session.

## Requirements

- R1. `config.template.toml` carries a `[features]` table header and, inside that table,
  `unified_exec_tty = false`. The key is not commented out and does not land in another table.
- R2. The template stays valid TOML and keeps every existing pin: one hook command identical to
  `hooks.json`'s (`hook-trust.test.js:416-460`), `sandbox_mode = "workspace-write"`, no
  `danger-full-access`, only tier-map model ids, no provenance token (`PROVENANCE_REF`,
  `native-surface.test.js:40`).
- R3. `buildLaunchArgs` emits `-c` immediately followed by `features.unified_exec_tty=false`, as two
  discrete argv elements, on every call, `bypassHookTrust` true or false. No parameter turns it
  off.
- R4. `adapters/codex/README.md` states, in §Configure and in §"Guard — honest enforcement
  profile", that the template key and the launch flag close the `write_stdin` channel, and that
  dropping the key (or running codex outside the binding's launch path without it) reopens it.
  `write_stdin` no longer appears in the "Still open" bullet as open.
- R5. `docs/contributing/specs/gate.md`: the codex `write_stdin` residual moves into the "Closed, no
  longer residuals" family, carrying its config dependency. The copilot `write_bash` residual is
  untouched.
- R6. `docs/contributing/specs/codex-poc-record.md`: version-pinned rows for probes 1-9 are added to
  the "Re-probe — codex-cli 0.162.1" table after the existing `write_stdin` row. The existing row
  stays.
- R7. No change to `CODEX_TOOL_NAMES`, the hook process, `hooks.json`, `craft.rules` or the payload
  fixture.

## Design

### Part 1 — the template key (`adapters/codex/config.template.toml`)

Insert one table between `approval_policy = "on-request"` and the guard-registration comment, so
the posture keys sit together and the table cannot swallow, or be swallowed by, a later table:

```toml
sandbox_mode = "workspace-write"
approval_policy = "on-request"

# <why: write_stdin fires no PreToolUse hook; with tty sessions off no session keeps
#  stdin open, so write_stdin has nothing to type into. Removing this line reopens
#  that channel. Cost: no interactive shell or REPL for the model.>
[features]
unified_exec_tty = false

# The guard registration. …
[[hooks.PreToolUse]]
```

TOML trap avoided: a bare `unified_exec_tty = false` appended at the end would land inside the
last `[agents.craft-backlog-ticker]` table and do nothing; a dotted top-level
`features.unified_exec_tty = false` would have to sit above every table header. Both are rejected
by DC-2. The comment text says why, never names a phase, ADR or backlog number.

Merge note for the README: an operator whose `config.toml` already has a `[features]` table must
add the key to that table. A second `[features]` header is a duplicate table, which is invalid
TOML.

### Part 2 — the launch flag (`adapters/codex/src/launch-args.js`)

```js
const FLAG_CONFIG_OVERRIDE = '-c';
const DISABLE_TTY_SESSIONS = 'features.unified_exec_tty=false';

const args = [
  FLAG_SANDBOX, SANDBOX_WORKSPACE_WRITE,
  FLAG_WORKING_DIR, workingDir,
  FLAG_CONFIG_OVERRIDE, DISABLE_TTY_SESSIONS,
];
```

Signature unchanged: `buildLaunchArgs({ workingDir, bypassHookTrust = false }) → string[]`. The
module header gains one bullet: tty sessions are always switched off, because `write_stdin` into
one bypasses the guard hook, and the flag overrides a config that turns them back on (probe 8).
`probe.js` picks the flag up through its existing `buildLaunchArgs({ workingDir: targetPath })`
call; nothing else changes there. The flag goes after `exec`, as the consumer contract
(`execFile('codex', ['exec', ...args, prompt])`) already places it, which is the form probe 8 ran.

### Part 3 — disclosure

- `adapters/codex/README.md` §Configure (`:85-92`): one paragraph after the template sentence: the
  template switches tty sessions off (`[features] unified_exec_tty = false`); `buildLaunchArgs`
  also passes `-c features.unified_exec_tty=false`; why (`write_stdin` fires no hook); the cost
  (no interactive shell or REPL); the merge note from Part 1.
- `adapters/codex/README.md` §Guard (`:192-194`): the "Still open" bullet drops the `write_stdin`
  sentences. A new bullet: the `write_stdin` channel is closed on 0.162.1 by the template key and
  the launch flag (codex refuses `tty: true`, a non-tty session's stdin is closed, so
  `write_stdin` fails); `write_stdin` stays in the tool list; dropping the key, or running codex
  outside the binding's launch path without it, reopens it. The timeout sentences stay in the
  "Still open" bullet.
- `adapters/codex/README.md:146-151` and `:218`: no change (they cover the bypass flag and
  `--ephemeral`, not tty).
- `docs/contributing/specs/gate.md`: delete the bullet at `:226-229`; append to the "Closed, no
  longer residuals" bullet (`:232`): codex `write_stdin` into a tty session, closed by
  `[features] unified_exec_tty = false` in the template and `-c features.unified_exec_tty=false` on
  the launch path (offline probe 2026-10-18, 0.162.1); closed only while that config holds.
- `docs/contributing/specs/codex-poc-record.md`: nine rows after `:567`, each titled
  `… (0.162.1)` and marked `CONFIRMED (0.162.1)`, one per Context probe 1-9. The existing
  `write_stdin` row stays as the pre-change observation.
- `adapters/codex/src/git-guard-adapter.js:21-25`: no change. `write_stdin` is still a listed
  tool that passes through the predicate's `{ block: false }` tail; the comment stays true.

### Edge behaviour

| Case | Outcome |
|---|---|
| Model sends `exec_command {tty: true}` anyway | Hook judges `{command}` first (probe 7), then codex refuses with the config message; nothing runs |
| Model opens a non-tty shell and calls `write_stdin` | `stdin is closed for this session` (probe 6); nothing typed runs |
| Operator drops the template key, launches through `buildLaunchArgs` | Still closed: the `-c` flag wins (probe 8) |
| Operator sets the key to `true`, launches through `buildLaunchArgs` | Still closed: the `-c` flag overrides it (probe 8) |
| Operator drops the key and runs codex outside `buildLaunchArgs` (own `codex exec`, TUI, app-server) | Open again. Disclosed in README and gate.md |
| Template's own models (`gpt-5.6-sol/terra`) send no `tools` key | The tty refusal still applied on both (probes 5, 7) |
| Existing `[features]` table in the operator's config | Merge into it; a duplicate header breaks the config. README states it |

### Residuals (stated, not fixed)

- The closure depends on config. Codex run outside the binding's launch path without the template
  key is exposed again.
- `write_stdin` stays in the tool list; it just cannot reach any stdin.
- The interactive TUI and the app-server thread/turn path were not probed with the key set; the
  probes ran `codex exec`.
- Codex versions after 0.162.1 are unprobed; a release that makes `unified_exec_tty` a no-op, as
  `unified_exec` already is (probe 2), reopens the channel silently.

## Decision candidates

| # | Choice | Alternatives (≤3) | Recommendation | Why |
|---|---|---|---|---|
| DC-1 | Whether the launch path also forces tty off | (a) **Unconditional `-c features.unified_exec_tty=false`** in `buildLaunchArgs`, two argv elements, no opt-out. (b) **Opt-out parameter** (`allowTty = false`). (c) **Template only**, launch args unchanged | (a) | Probe 8: the flag closes the channel with no config key and overrides a config `true`, so the binding's own launch path stays closed even if the operator drops or flips the key. (b) adds a boolean parameter (a smell) whose only use is reopening the channel. (c) leaves the closure to one hand-merged config line |
| DC-2 | Where and how the key sits in the template | (a) **A `[features]` table between the top-level posture keys and `[[hooks.PreToolUse]]`**. (b) A `[features]` table appended at the end, after `[agents.*]`. (c) A dotted top-level `features.unified_exec_tty = false` under `approval_policy` | (a) | (a) keeps the posture keys together, and its own header means a later edit cannot pull it into another table. (b) is valid TOML too, but it puts the key at the far end of the file, away from the sandbox posture. (c) is valid only while it stays above every header, and it reads like a top-level key; an operator merging it into a config that already has `[features]` creates a conflicting definition |
| DC-3 | How the test pins the template key | (a) **Line-scoped section scan** in `config.test.js`: find the `[features]` header line, collect lines up to the next `[` header, assert one matches `^\s*unified_exec_tty\s*=\s*false\s*$`. Same line-shaped discipline as `hook-trust.test.js:442`. (b) A whole-file regex `/unified_exec_tty\s*=\s*false/`. (c) Parse with an external TOML parser (`python3 -I -c 'import tomllib…'` subprocess) | (a) | (b) passes when the key is commented out or sits in the wrong table, the exact trap. (c) adds a python dependency to a node-only suite. (a) catches both traps with no dependency |

## Test strategy

TDD, London School: Red → Green → Refactor per part; Given/When/Then titles; AAA bodies with a
`sut` variable; titles printable ASCII only.

### Part 1 — `adapters/codex/test/config.test.js`

New `describe('config.template.toml — tty sessions off', …)`, using the existing
`readConfigTemplate()`:

- Given the template, when the `[features]` table is read up to the next table header, then it
  holds `unified_exec_tty = false` (DC-3 a). Red today: no `[features]` header.
- Given the template, when every table header is collected, then `[features]` appears exactly once.

The existing `hook-trust.test.js:416-460` and `native-surface.test.js` provenance hygiene tests
must stay green unchanged (R2).

### Part 2 — `adapters/codex/test/launch-args.test.js`

New `describe('buildLaunchArgs() — tty-session posture', …)`:

- Given a working dir, when buildLaunchArgs runs, then `-c` is emitted as its own element
  immediately followed by `features.unified_exec_tty=false`.
- Given bypassHookTrust true, when buildLaunchArgs runs, then the same pair is still present.
- Given a working dir, when buildLaunchArgs runs, then `features.unified_exec_tty=false` appears
  exactly once (guards against a duplicated push).

Existing posture and failure-contract tests stay green; `probe.test.js` needs no change (it
asserts presence/absence of specific elements, not the full argv).

### Part 3 — `adapters/codex/test/native-surface.test.js`

In `describe('README.md — honesty pins', …)` (`:356`):

- Given README.md, when scanned, then it states the template switches tty sessions off
  (`/unified_exec_tty\s*=\s*false/`).
- Given README.md, when scanned, then it states that removing the setting reopens the
  `write_stdin` channel (a pattern requiring `write_stdin` and `reopen` in one sentence).

Docs-only edits to `gate.md` and `codex-poc-record.md` carry no test; `ci.sh` doc lint and
readme-drift cover them.

### Mutation

Stryker over `adapters/codex/src/launch-args.js`, one comma-separated `--mutate` per run. The two
new constants and the array entries must each be killed by Part 2 (the string-literal mutants on
`'-c'` and the flag value, the array-element removal). Survivors are hand-checked against the full
covering set (`launch-args.test.js` + `probe.test.js`) before a test is written.

### Gate

`bash scripts/ci.sh` green per part.

## Out of scope

- Re-probing codex: the evidence above is the pin; re-probing later versions is a future run.
- Guarding `write_stdin` text in the hook: no hook fires for it (probe 5), so there is nothing to
  judge.
- Switching off `unified_exec` (not switchable, probe 2) or `shell_tool` (removes the shell,
  probe 3).
- A launch-time check that the operator's `config.toml` carries the key: the `-c` flag already
  covers the binding's launch path, and other launch paths are outside the binding.
- Probing the TUI and app-server paths with the key set: stated as a residual.
- Copilot's `write_bash` residual in `gate.md`: a different binding.
- Ticking the BACKLOG entry: the docs phase does it.
