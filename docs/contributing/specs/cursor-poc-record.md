# Cursor PoC — feasibility + contract-discovery record

> This document records the **Phase 0 feasibility gate** for a native Cursor binding of the
> craft harness — the analog built for codex/copilot/opencode/pi and attempted for antigravity.
> Facts are pinned against the **real `cursor-agent` CLI on this machine** (Cursor Agent
> `2026.07.20-8cc9c0b`), read from the shipped webpack bundle and confirmed with **isolated,
> authenticated live runs**. Every row is CONFIRMED (observed live), SOURCE (read from the
> shipped bundle, not executed), or OPEN (not exercised; stated as unknown, never assumed).

> **One verdict: GO — build the full port-binding adapter.** Cursor ships **both** load-bearing
> surfaces a runnable binding needs: a headless one-turn-and-exit CLI with machine-readable output
> (`cursor-agent -p --output-format json|stream-json`) **and** a deny-capable pre-execution hook
> (`beforeShellExecution`, stdout-JSON `permission:"deny"`, live-proven to block a command). This is
> the codex/copilot analog, not a GUI-only declination. The adapter lives at `adapters/cursor/`.

## Verdict: **GO** (2026-07-22)

`cursor-agent` is Anysphere Cursor's headless agent CLI (a Node webpack bundle installed under
`~/.local/share/cursor-agent/versions/<ver>/`, exposed on `PATH` as both `cursor-agent` and `agent`).
It runs a single non-interactive turn with `-p/--print`, emits a machine-readable result envelope
(`--output-format json`), takes a per-invocation `--model` (with an effort bracket syntax), controls
the working dir via cwd/`--workspace`, and enforces a `.cursor/hooks.json` `beforeShellExecution`
hook whose stdout `{"permission":"deny"}` **blocks the shell call before it runs** — proven live,
and not bypassed by `--force`/`--yolo`. Every surface a craft port-binding needs is present and was
exercised under isolation.

**Recommendation:** build the adapter (done — `adapters/cursor/`). The guard binds the shell/git
path (`beforeShellExecution`) and **must** register with `failClosed: true` — a crashing/malformed
guard otherwise **fails open** (measured). Per-agent model tiers ride the launch `--model` arg, not
subagent frontmatter (Cursor's `.cursor/agents/*.md` schema accepts only `name`/`description`).

## Probe method

The CLI is a webpack-bundled Node app; its numbered `*.index.js` chunks were read directly for the
hook contract (event names, config paths, the deny-wire parse, the fail-open branch) — stronger than
a black-box `--help`. Live confirmation ran under the mandated isolation protocol:

- **Throwaway HOME** (`$SCRATCH/home`) so every write (`~/.cursor/chats`, sessions, config) landed in
  scratch, never the operator's real `~/.cursor`.
- **Auth seed = a `Library/Keychains` symlink, not a file copy.** cursor-agent stores its token in the
  **macOS keychain** (`svce=cursor-access-token`, `acct=cursor-user`), and derives the keychain path
  from `$HOME`; a throwaway HOME therefore reports "Not logged in" even with `~/.cursor/cli-config.json`
  copied in. Seeding is `ln -s ~/Library/Keychains $HOME_throwaway/Library/Keychains` (read-only login
  keychain; a token refresh writes back the operator's own token). This is the Cursor-specific form of
  the brief's "copy the auth in" step — the auth is not a copyable file.
  See *Isolation-method caveat* below.
- **Background-kill watchdog** `( cmd & PID=$!; ( sleep N; kill -9 $PID ) & wait $PID )` (macOS has no
  `timeout`; a perl-alarm watchdog does not reliably kill the agent).
- **Isolation verified, not assumed:** `find ~/.cursor -type f -newer <marker>` returned **empty** after
  the live turns (marker set after the bare `--version`/`--help`/`status`/`--list-models`, which touch
  real state and would false-alarm the window). Trust is an independent re-run, never the tool's report.

## Product identity

| Question | Answer | Status |
|---|---|---|
| Which product? | **Anysphere Cursor Agent CLI** — the headless agent of the Cursor editor (a VS Code-lineage fork). Endpoint `https://api2.cursor.sh`. | CONFIRMED |
| Version | `cursor-agent --version` → **`2026.07.20-8cc9c0b`**. Installed at `~/.local/share/cursor-agent/versions/2026.07.20-8cc9c0b/cursor-agent`. | CONFIRMED (live) |
| Headless CLI vs editor launcher vs GUI | The **headless CLI is `cursor-agent`** (also `agent`, same symlink target). The **editor launcher `cursor`** is a dangling symlink to a removed `/Applications/Cursor.app/.../bin/code` (the VS Code-fork `code` bin) — a *different* binary (opens the GUI), never the agent. No legacy CLI shadows `cursor-agent`. | CONFIRMED |
| Auth | `cursor-agent status` → `✓ Logged in as <account>`. Token in macOS keychain (`cursor-access-token`/`cursor-refresh-token`), **not** a HOME file. `--api-key`/`CURSOR_API_KEY` is the alternate seed. | CONFIRMED (live) |

## Headless execution port (CONFIRMED live)

| Surface | Finding | Status |
|---|---|---|
| One-turn-and-exit | `cursor-agent -p/--print "<prompt>"` — "for scripts or non-interactive use. Has access to all tools, including write and shell." | CONFIRMED |
| Machine-readable output | `--output-format text\|json\|stream-json` (+ `--stream-partial-output` for stream-json). | CONFIRMED |
| Result envelope (json) | `{"type":"result","subtype":"success","is_error":false,"duration_ms":N,"result":"<text>","session_id":"<uuid>","request_id":"<uuid>","usage":{"inputTokens":N,"outputTokens":N,"cacheReadTokens":N,"cacheWriteTokens":N}}` — captured live. | CONFIRMED (live) |
| Working dir | cwd IS the workspace; `--workspace <path-or-name>`, `--add-dir <path>` (multiple), `-w/--worktree [name]` (isolated git worktree under `~/.cursor/worktrees/`). | CONFIRMED |
| Non-repo + git-repo | Ran against a `git init`-ed dir; also runs in a non-repo cwd. | CONFIRMED |
| Auto-approve / non-interactive | `-f/--force` (alias `--yolo`) "Force allow commands unless explicitly denied"; `--auto-review` (server classifier); `--trust` (trust workspace); `--approve-mcps`. **`--force` auto-approves the interactive prompt but does NOT bypass a `deny` hook** (measured). | CONFIRMED (live) |
| Model + effort | `--model <id>`; effort via bracket params, e.g. `claude-opus-4-8[context=1m,effort=high,fast=false]`; named variants (`claude-opus-4-8-high`, `claude-sonnet-5-high`, …) from `--list-models`. `--mode plan\|ask`, `--plan`. | CONFIRMED (live) |
| Available models (relevant tiers) | `claude-opus-4-8*`, `claude-sonnet-5*`, `composer-2.5*`, `cursor-grok-4.5*`, `gpt-5.*`, `auto`. **No `haiku`** — craft's haiku tier maps to `composer-2.5` (Cursor's fast in-house model). | CONFIRMED (live) |
| **Plan gate on named models** | On a **Free plan**, a named `--model` (`claude-sonnet-5-high`, …) is REJECTED live — `ActionRequiredError: Named models unavailable. Free plans can only use Auto.` — and only `auto` runs. The tier map is still correct (the ids are real; paid plans accept them); this is a plan-gated availability constraint, handled by the model-down → fallback protocol (degrade the tier to `auto`). | CONFIRMED (live) |

## Guard / hook mechanism (the decisive surface — CONFIRMED live)

| Question | Answer | Status |
|---|---|---|
| PreToolUse-equivalent that can DENY? | **Yes** — `beforeShellExecution` (also `afterShellExecution`, `beforeReadFile`, `beforeMCPExecution`, `beforeSubmitPrompt`, `afterFileEdit`, `stop`, `subagentStop`, plus a Claude-Code `preToolUse`/`postToolUse` compat layer). | CONFIRMED |
| Manifest path | Project `.cursor/hooks.json`; user `~/.cursor/hooks.json`; team `.cursor/managed/active-team-hooks/hooks.json`; enterprise `/Library/Application Support/Cursor/hooks.json`; **plus Claude interop `~/.claude/settings.json`** (`dedupeClaudeHooksAgainstCursorHooks`). | SOURCE + CONFIRMED (project path proven live) |
| Manifest schema | `{ "version": 1, "hooks": { "beforeShellExecution": [ { "command": "<shell>", "failClosed": <bool> } ] } }`. | CONFIRMED (live) |
| **Real payload** (dumped live via a fd-0-sync hook) | `{"conversation_id","generation_id","model","command":"echo …","cwd":"","sandbox":false,"session_id","hook_event_name":"beforeShellExecution","cursor_version","workspace_roots":["/…/proj"],"user_email","transcript_path":null}` — snake_case. **The command is top-level `payload.command`, NOT `tool_input.command`.** `cwd` may be empty → fall back to `workspace_roots[0]`. | CONFIRMED (live) |
| **Deny wire** | Hook writes **stdout JSON** `{"permission":"deny"\|"ask"\|"allow","user_message":"…","agent_message":"…"}`. On `deny` the CLI throws `HookDeniedError` and the shell call **does not run** (agent saw `user_message` and reported "Blocked by a hook … no retry or workaround"). craft's guard uses this stdout wire, not an exit code; exit 2 with a stderr message is also a deny (Claude-compat; see *Re-probe — cursor-agent 2026.07.20-8cc9c0b (2026-10-13)*). `ask` prompts; anything else = allow. | CONFIRMED (live) |
| **Fail-open behavior** | A crashing/invalid-JSON hook with **no** `failClosed` → the command **RAN** (fail-OPEN; the probed hook exited non-zero — invalid JSON on exit 0 blocks, see *Re-probe — cursor-agent 2026.07.20-8cc9c0b (2026-10-13)*). With `failClosed: true` → the command was **BLOCKED** ("exited with code 3. The hook is fail-closed"). **The craft guard must set `failClosed: true`.** | CONFIRMED (live) |
| Env-var substitution in hook command | `${VAR}` in the `command` template **resolves** (proven: `node ${CRAFT_PROBE_DIR}/hook.js` fired). | CONFIRMED (live) |
| Deliver-before-exit | The deny JSON must be flushed before the hook exits; the binding writes it **synchronously to fd 1** (`fs.writeSync(1, …)`) then returns — no async-write truncation. | CONFIRMED (design) |

## Customization surface (agents / rules / commands / skills / MCP)

| Surface | Finding | Status |
|---|---|---|
| Subagents | `.cursor/agents/*.md` (project) / `~/.cursor/agents/*.md` (user); YAML frontmatter **`name` + `description` only** (name = lowercase+hyphens); body = system prompt. **No `model`/`effort` field in the schema** — per-role tier rides the launch `--model` (do not fabricate a rejected field). | CONFIRMED (schema doc) |
| Rules | `.cursor/rules/*.mdc` (frontmatter + body); `AGENTS.md`. | CONFIRMED (schema doc) |
| Commands | `.cursor/commands/`. | SOURCE |
| Skills | Cursor ships built-in skills under `~/.cursor/skills-cursor/` (create-subagent, review, review-security, …) and syncs them per-run; craft's shared skills load **by reference** through the plugin/skill path (symlink fallback if a copy would drop out-of-tree refs — the codex `$CODEX_HOME/skills` lesson). | SOURCE |
| Plugins | `--plugin-dir <path>` (load a local plugin dir, repeatable); `plugin marketplace` subcommand. | CONFIRMED |
| MCP | `mcp` subcommand; `.cursor/mcp.json`; `--approve-mcps`. | SOURCE |

## Sandbox / permission model

| Surface | Finding | Status |
|---|---|---|
| Sandbox flag | `--sandbox enabled\|disabled` (overrides config). Approval spectrum: default prompt → `--auto-review` (server classifier) → `-f/--force`/`--yolo` (allow unless denied). | CONFIRMED (flag) |
| What each mode blocks (ground truth) | Measured via side-effects (file-write outside workspace, loopback listener) — see Phase B row. | See Phase B |

## Telemetry / persisted rollout

| Surface | Finding | Status |
|---|---|---|
| Persisted transcript | `~/.cursor/projects/<sanitized-workspace-path>/agent-transcripts/<conversationId>/<conversationId>.jsonl` — **Anthropic-Messages-shaped** (`{role,message:{content:[{type:"text"}\|{type:"tool_use",name:"Shell",input:{command,description}}]}}`) + a terminal `{"type":"turn_ended","status":"success"}`. Plus `~/.cursor/chats/<md5(workspace)>/<id>/{store.db,meta.json}` (store.db = opaque `blobs(id,data)` SQLite). | CONFIRMED (live) |
| **Token-bearing record** | The **persisted transcript carries NO token usage** — the `usage` block lives **only in the live `--output-format json` result envelope** (`usage.{inputTokens,outputTokens,cacheReadTokens,cacheWriteTokens}`). Persisted envelope ≠ live stream. The telemetry binding parses the persisted transcript for turn/tool structure and reads tokens from the result envelope (the craft "usage block the spawn returns" model). Fixture: `engine/test/fixtures/cursor/`. | CONFIRMED (live) |

## Phase B — live-evidence rows

| B-item | Evidence | Status |
|---|---|---|
| Guard denies the targeted command | Guard returned `permission:"deny"` for `GHOST_CMD_marker_run`; agent reported "Blocked by a hook (craft probe guard). Stopping — no retry or workaround"; command did not run. | CLOSED (live) |
| Guard allows benign commands (not fail-closed-on-everything) | Same guard returned `permission:"allow"` for `echo …`; command ran (exit 0, output produced). | CLOSED (live) |
| Guard fires under `--force`/`--yolo` | Deny still blocked with `--force`; `--force` does not override a deny hook. | CLOSED (live) |
| Fail-open vs failClosed | Crashing guard, no failClosed → command ran (fail-open); `failClosed:true` → command blocked. | CLOSED (live) |
| Env-var substitution in hook command | `${CRAFT_PROBE_DIR}` in the `command` resolved and the hook fired. | CLOSED (live) |
| Real rollout captured; token shape pinned | Persisted transcript jsonl + live result envelope captured; tokens pinned to the result envelope `usage`. | CLOSED (live) |
| Isolation (nothing touched real state) | `find ~/.cursor -newer <marker>` empty after every live turn. | CLOSED (live) |
| Hook-trust / activation (silent no-op?) | A hook fires reliably on first use in a clean workspace and across repeat/changed runs; one workspace subjected to ~7 rapid successive differing-hook runs went quiet (suspected chat-lease/state artifact) and a fresh workspace restored firing. craft installs ONE stable `.cursor/hooks.json` and never rewrites it per-run, so this edge does not affect production; documented as an OPEN robustness note. | CLOSED (live) + OPEN note |
| Sandbox modes — ground-truth side effects | **Measured:** with the craft non-interactive posture (`--force`), `--sandbox enabled` did NOT block a shell `touch` OUTSIDE the workspace root — the file was created under BOTH `enabled` and `disabled` (ground-truth existence check). So `--sandbox` is not a filesystem-containment guarantee here; the guard hook is the enforcement layer. This is why launch-args does not emit `--sandbox` by default. | CLOSED (live, measured) |
| Shared skills/rules/commands load end-to-end | **Measured:** a `.cursor/rules/*.mdc` with `alwaysApply:true` loaded end-to-end (the response ended with the rule's exact marker token). The shared craft skills + the 9 `craft-<role>` agents load BY REFERENCE via **symlinks** into `.cursor/skills/` and `.cursor/agents/` — Cursor follows the links, so out-of-tree refs are preserved (the symlink fallback, mirroring the codex `$CODEX_HOME/skills` route). | CLOSED (live, measured) |
| Malformed rules/permission file fails OPEN at runtime | **Measured:** a malformed (invalid-JSON) `.cursor/hooks.json` fails **OPEN** — the guard silently does not load and `git diff` (no `--no-ext-diff`) ran UNGUARDED. This binding ships no separate permission-ruleset file; the manifest IS `hooks.json`, so the install MUST validate it is well-formed (a broken manifest drops the guard silently). | CLOSED (live, measured) |
| **Live construction proof (GoL)** | The delivered binding (real guard `failClosed:true` + the 9 role agents + `craft-run` skill, installed by symlink) drove a real `cursor-agent` turn — launched via the adapter's OWN `buildLaunchArgs` + `resolveCursorModel` — to build Conway's Game of Life. Result: a working `step()` + tests; **independently ground-truthed** (`node --test` = 2/2, plus my own blinker period-2 / block-still-life / lone-cell-death checks — genuinely correct, not a tautological test). The guard was **live throughout**: it allowed the benign `node --test` build commands and **denied** `git diff HEAD` in the same workspace (`craft-guard: git diff/show must carry --no-ext-diff`). Real usage confirmed the disjoint-token mapping again (`cacheReadTokens 34432 > inputTokens 28693`). Isolation held (`find ~/.cursor -newer` empty). A binding isn't done until a real build dogfoods it end to end — this closes that. | CLOSED (live) |

## Isolation-method caveat — the mtime proof has a blind spot

This record's isolation proof is an mtime-find over the real `~/.cursor`, and it reported
zero filesystem writes there. The auth seed is outside that window: it is a symlink from the
throwaway HOME to the operator's real `~/Library/Keychains`, so the probe reads and writes
the operator's own login keychain. Any token refresh during a probe writes the operator's
real keychain entry, and no filesystem check over `~/.cursor` can see it.

Whether Cursor's refresh token rotates server-side on use was not probed. Assume it does.
If it does, any copy of the pre-refresh token held elsewhere stops working once a probe
refreshes it.

Rule for any refresh of this record: mtime-find proves *filesystem* isolation only. Treat
seeded credentials as consumed, keep probe windows short enough to stay inside the access
token's lifetime, and expect a re-login may be needed afterwards.

## Re-probe — cursor-agent 2026.07.20-8cc9c0b (2026-10-13)

Scope: what Cursor does with a `beforeShellExecution` hook that exits non-zero, dies by a signal,
or writes nothing, and whether craft's guard can crash that way. Same binary as the rows above, so
nothing above is re-pinned; this section extends **Fail-open behavior** (Guard / hook mechanism)
and **Fail-open vs failClosed** (Phase B), which pinned the `failClosed` switch but not the exit
classes. Method: `-p --output-format json --model auto --force --trust`, throwaway `HOME` with the
`Library/Keychains` symlink, a fresh `git init` workspace per case, a project `.cursor/hooks.json`
with ONE `beforeShellExecution` hook and `failClosed: true`. The hook first touches a `HOOK_RAN`
marker; the agent is asked to run one `touch <ws>/PROBE_RAN`. One turn per row.

| Probe | Result | Status |
|---|---|---|
| How a command hook's exit is read | Runs as `<command> <<'CURSOR_HOOK_EOF'` + payload. In order: executor throws (spawn error, timeout) → block if `failClosed`, else allow; exit 2 → deny, **whatever `failClosed` says** (the message is stdout if non-empty, else stderr, else a fixed no-reason text); other non-zero exit → block if `failClosed` (`exit_nonzero`), else allow; empty stdout → block if `failClosed` (`empty_stdout`), else allow; stdout that does not parse as a hook response (when the whole stdout is not JSON and ends with `}`, the parser tries each `{…}` suffix from the end backward) → block **whatever `failClosed` says**, because `beforeShellExecution` is a permission step; `permission` `deny` → deny, `ask` → handed back to the caller (it prompts, see **Deny wire**); anything else → allow. A signal death has exit code `null`, so it lands on the empty-stdout branch. Bundle `3143.index.js`, `executeCommandHook`, and `index.js` (`../hooks/dist/index.js`: `j`, `F`/`N`, `U`, `G`). | SOURCE |
| Exit 0 + `{"permission":"allow"}` (control) | HOOK_RAN yes, PROBE_RAN yes; the agent saw `Exit code: 0`. | CONFIRMED (live) |
| Exit 2 + stderr (control) | HOOK_RAN yes, PROBE_RAN no; `Command execution was blocked by a hook: Hook blocked with message: probe-deny-exit2`. Observed with `failClosed: true`; that exit 2 also denies without it is SOURCE. | CONFIRMED (live) + SOURCE |
| Exit 1: craft's guard with `engine/src/` absent | HOOK_RAN yes, PROBE_RAN no; `Tool blocked because this hook is configured to fail closed (block when it fails). Hook "…craft-guard.js" failed with exit code 1: <node stack>`. | CONFIRMED (live) |
| Exit 127 (command not found) | HOOK_RAN yes, PROBE_RAN no; `… configured to fail closed … failed with exit code 127: (eval):1: command not found …`. | CONFIRMED (live) |
| Signal death (the hook shell runs `kill -9 $$`) | HOOK_RAN yes, PROBE_RAN no; `… configured to fail closed … Hook "…" returned no output.` | CONFIRMED (live) |
| craft's guard crashes before its own `try` | `craft-guard.js` imports `cursor-guard-adapter.js`, which imports `engine/src/guards/tool-call-guard.js`, both statically. With `engine/src/` absent the guard exits 1 with empty stdout and `ERR_MODULE_NOT_FOUND` on stderr; the unmodified tree exits 0 with `{"permission":"allow"}`. Under `failClosed: true` that crash is blocked (row above). Direct run, node v22.22.3. | CONFIRMED |
| Hook shell | zsh (`(eval):1:` prefix on stderr). `node` resolved by that shell was v24.5.0 on the probe host, while the operator shell had v22.22.3. | CONFIRMED (live, host-specific) |
| Isolation and auth | `find ~/.cursor -type f -newer <marker>` returned 0 files after the five turns. Auth was stale before the turns (`Authentication required`) and needed a re-login, as the caveat above predicts. Cost: 5 turns, about 32k input and 1.6k output tokens. | CONFIRMED (live) |

Verdict: with `failClosed: true`, every crash class reached here blocks the call; exit 2 denies on
its own. No fail-open was observed, so the guard keeps today's code. `failClosed: true` stays the
load-bearing property (see **Fail-open behavior** above).
