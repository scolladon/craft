# Codex PoC — live probe evidence record

> This document records the **runtime** probe evidence for the OpenAI Codex CLI binding — facts
> pinned against a live `codex` binary, not from prior knowledge. Every row is marked CONFIRMED
> (observed live) or DEFERRED (not yet observed; stated as unknown rather than assumed).
> It is refreshed by re-running the probe.

> **Not CI-gated.** No test spawns the real `codex` binary. The deterministic adapter seams are
> CI-proven by unit tests through injected dependencies; this record is the on-demand runtime
> counterpart.

## Product identity

| Question | Answer | Status |
|---|---|---|
| Which product is `codex`? | `@openai/codex` — OpenAI Codex CLI | CONFIRMED |
| Binary self-report | `codex-cli 0.145.0` | CONFIRMED (0.145.0) |
| npm package version | `@openai/codex@0.145.0` | CONFIRMED (0.145.0) |
| Do they agree? | **Yes** — unlike the copilot binding, where the cask said 1.0.17 and the binary said 1.0.63. Re-check both on refresh; agreement today is not a guarantee. | CONFIRMED |
| Competing/legacy CLI shadowing the name? | **No.** No Homebrew formula or cask named `codex`; no `openai` CLI installed. (`aider` is an unrelated third-party tool.) Contrast the copilot run, where the Homebrew `copilot` formula was actually AWS ECS's tool. | CONFIRMED |
| Install path | `/Users/scolladon/.n/bin/codex` → Node shim → vendored native binary at `…/@openai/codex/node_modules/@openai/codex-darwin-arm64/vendor/aarch64-apple-darwin/bin/codex` (0.145.0; the vendor path moved under `@openai/codex/node_modules/` versus the 0.144.6 layout) | CONFIRMED (0.145.0) |

## Probe method

State-changing probes ran in throwaway directories with isolated `HOME`, `CODEX_HOME`, and
`XDG_CONFIG_HOME`, in a non-repo cwd, each capped by a background watchdog
(`( sleep N; kill -9 $PID )` — macOS has no `timeout`), with all captures truncated.

Isolation was **verified, not assumed**: `~/.codex` was hashed before and after the first isolated
run and was byte-identical, with all writes landing in the throwaway `CODEX_HOME`.

### Deviation recorded honestly

Isolation held for every probe that used the harness. It did **not** hold for a batch of
un-isolated `--help` calls, which at 16:18:08 opened and wrote three runtime databases in the
operator's real `~/.codex`: `goals_1.sqlite`, `logs_2.sqlite`, `memories_1.sqlite` (plus `-wal`/`-shm`).

Root cause: **an unrecognized subcommand falls through to the interactive TUI.** `codex execpolicy
--help` is not a recognized form, so Codex began launching the TUI — opening the real state
databases — before failing with `Error: stdin is not a terminal`.

Scope was verified rather than assumed: `auth.json`, `config.toml`, `installation_id`,
`models_cache.json`, `skills/` and `version.json` all retained their pre-probe mtimes; zero session
files were created; nothing was deleted. The writes are append-only runtime logs, not credentials,
config, or user data.

**Rule for any refresh of this record: isolate every `codex` invocation, including `--help`.**

### 0.145.0 re-probe method

Two throwaway `CODEX_HOME`s (auth copied in, never the real home) backed the 0.145.0 re-probe.
Isolation was proven by `find ~/.codex -newer <ref marker>` returning **0 entries**, while 111 and
139 entries newer than the marker landed inside the two throwaway homes.
`--dangerously-bypass-hook-trust` was never used across the re-probe.

## Execution port

| Question | Answer | Status |
|---|---|---|
| Headless / one-turn-and-exit? | **Yes** — `codex exec [PROMPT]` (alias `codex e`). Prompt may also arrive on stdin. Not a blocker. | CONFIRMED |
| Machine-readable output? | **Yes** — `codex exec --json` emits JSONL. | CONFIRMED |
| Event schema | `thread.started` → `turn.started` → `item.completed` (`item.type` ∈ `agent_message`, `error`, `command_execution`, …) → `turn.completed`. Real sample captured. | CONFIRMED |
| Working dir control | `-C/--cd <DIR>`; `--add-dir` for extra writable roots | CONFIRMED |
| Structured final output | `--output-schema <FILE>` (JSON Schema); `-o/--output-last-message <FILE>` | CONFIRMED |
| Non-repo runs | `--skip-git-repo-check` | CONFIRMED |
| Session-free runs | `--ephemeral` (no session files persisted) | CONFIRMED |

## Execution topology — subagent-capable

| Question | Answer | Status |
|---|---|---|
| Subagents / fan-out? | **Yes.** Codex ships a first-class multi-agent model. Mirror `adapters/copilot` \| `adapters/opencode`, **not** `adapters/pi`. | CONFIRMED |
| Tool surface | Namespace `multi_agent_v1` with `spawn_agent`, `send_input`, `wait_agent`, `resume_agent`, `close_agent` — read directly off the request body Codex sent to the fake provider | CONFIRMED |
| Concurrency | "There are 4 available concurrency slots, meaning that up to 4 agents can be active at once, including you." | CONFIRMED |
| Filesystem model | All agents share one cwd and filesystem; edits are immediately visible to all agents | CONFIRMED |
| Context propagation | `fork_turns` parameter on spawn | CONFIRMED |
| **Constraint** | Codex injects `<multi_agent_mode>Do not spawn sub-agents unless the user or applicable AGENTS.md/skill instructions explicitly ask for sub-agents, delegation, or parallel agent work.` — **the craft binding must explicitly ask for delegation**, or fan-out silently degrades to sequential. | CONFIRMED |
| Agent roles | `[agents]` TOML with per-role config (`AgentRoleToml`); built-ins reference `explorer.toml` / `awaiter.toml` | DEFERRED (shape not exercised) |

## Model port

| Question | Answer | Status |
|---|---|---|
| Selection | `-m/--model <MODEL>` flag; `model` config key; `-p/--profile` layering | CONFIRMED |
| Available ids | `gpt-5.6-sol` (frontier, priority 1), `gpt-5.6-terra`, `gpt-5.6-luna`, `gpt-5.5`, `gpt-5.4`, `gpt-5.4-mini`, `gpt-5.2` (+ hidden `codex-auto-review`) | CONFIRMED |
| Catalog access | `codex debug models` renders the raw catalog as JSON — **works with no auth** | CONFIRMED |
| Reasoning levels | `low`/`medium`/`high`/`xhigh`/`max` (+`ultra` on sol/terra) via `model_reasoning_effort` | CONFIRMED |
| Unknown model id | Falls back to default metadata with a warning; **changes which tools are registered** (see Guard) | CONFIRMED |

## Telemetry port

| Question | Answer | Status |
|---|---|---|
| Does the JSON stream carry token counts? | **Yes.** `turn.completed.usage` = `{input_tokens, cached_input_tokens, output_tokens, reasoning_output_tokens}`. **This is the key contrast with Copilot**, whose stream carries none — a naive parser there silently reported zero cost. Here the stream is a genuine source. | CONFIRMED |
| Session/transcript persistence | `$CODEX_HOME/sessions/YYYY/MM/DD/rollout-<ISO>-<uuid>.jsonl` | CONFIRMED |
| Telemetry read root | `$CODEX_HOME/sessions/` (default `~/.codex/sessions/`) | CONFIRMED |
| OTel support | Config surface exists (`OtelConfigToml`: `trace_exporter`, `span_attributes`, TLS, `log_user_prompt`) | DEFERRED — not exercised; **if enabled, assume the ~3× leaf/rollup/metric double-count hazard until disproven structurally** |
| Rollout file schema | **Still not parsed — no local sample existed to read.** A read-only glob of `~/.codex` found **no `sessions/` directory at all**: zero local rollout history. Generating one requires running the `codex` binary, which is forbidden for this record. `engine/src/observability/adapters/codex/telemetry.js` is written envelope-shaped rather than location-shaped so a shape match with the confirmed live-stream envelope is plausible, but that is an engineering choice, not a confirmation — the persisted record's actual shape remains unobserved. Do not read this row as "probably fine": it stays open until a real rollout file is read. | DEFERRED |

## Native surface / extensibility

| Question | Answer | Status |
|---|---|---|
| Config format | **TOML** at `$CODEX_HOME/config.toml`; `-c key=value` dotted overrides (value parsed as TOML) | CONFIRMED |
| Config-home env var | **`CODEX_HOME`** — the `COPILOT_HOME` analog. Verified: isolation works. | CONFIRMED |
| Config layering | system → MDM → enterprise → user → project (`.codex/` folders between cwd and repo root) → session flags | CONFIRMED |
| Profiles | `-p <name>` layers `$CODEX_HOME/<name>.config.toml` over the base user config | CONFIRMED |
| Instruction file auto-read | **`AGENTS.md` — CONFIRMED live.** A marker string in a project `AGENTS.md` was observed in `codex debug prompt-input` output as a `user` message. | CONFIRMED |
| Skills | `$CODEX_HOME/skills/<name>/SKILL.md`; a plugin manifest may declare `"skills": "./skills/"` | CONFIRMED (mechanism) |
| **Skills by reference?** | **DISPROVEN on 0.145.0.** `plugin add` copies into `$CODEX_HOME/plugins/cache/…`, and the cached `.codex-plugin/plugin.json` drops the out-of-tree `skills` (and `hooks`) field. Ground-truthed via the app-server `skills/list` method: **0 of 19** shared craft skills load without the symlink fallback; **19 of 19** load with it (`ln -s <repo>/skills/<name> $CODEX_HOME/skills/<name>`, registered as `craft:<name>`). | **DISPROVEN (0.145.0)** |
| Plugin manifest | `{name, version, description, author, skills, hooks, mcpServers, apps, interface{…}}` — `skills`/`hooks`/`mcpServers`/`apps` are all path-valued | CONFIRMED |
| Plugin install | `codex plugin add` from a configured marketplace snapshot; `codex plugin marketplace add` supports local file-backed marketplaces | **CONFIRMED (0.145.0 — install exercised live):** marketplace registration plus `plugin add` for both entries; see the re-probe section for the source-form matrix and the cached-manifest outcome |
| MCP | `codex mcp` subcommand; `mcp_servers` config; Codex can also *be* an MCP server (`codex mcp-server`) | CONFIRMED (surface) |
| **CRAFT_ROOT export** | Codex honours **`CLAUDE_PLUGIN_ROOT`**, `PLUGIN_ROOT`, `CLAUDE_PLUGIN_DATA`, `PLUGIN_DATA` in hook command templates — a ready-made root-export lever | CONFIRMED (strings) / DEFERRED (not exercised live) |
| Claude-config migration | Codex has a first-class importer for `CLAUDE.md`, `settings.json`, `hooks.json`, `agents`, MCP servers | CONFIRMED (surface) |

## Gate port — the guard

This is the highest-risk area, and it is where Codex differs most from Copilot.

### Tool-call hook — **it can actually deny**

| Question | Answer | Status |
|---|---|---|
| Is there a pre-execution hook? | **Yes** — `PreToolUse`, plus `PermissionRequest`, `PostToolUse`, `PreCompact`, `PostCompact`, `SessionStart`, `UserPromptSubmit`, `SubagentStart`, `SubagentStop`, `Stop` | CONFIRMED |
| **Can it DENY?** | **YES — proven live.** Contrast Copilot, whose hook fires but cannot deny. | **CONFIRMED** |
| Denial mechanism | A `command` handler exiting **code 2** with a reason on **stderr** blocks the call | CONFIRMED |
| Observed evidence | `ERROR codex_core::tools::router: error=Command blocked by PreToolUse hook: craft-guard: denied. Command: echo CRAFT_HOOK_PROBE` | CONFIRMED |
| Is the denial fed back to the model? | **Yes** — next turn's input carried `function_call_output: "Command blocked by PreToolUse hook: …"` | CONFIRMED |
| Did the command execute? | **No** — the probe `echo` never ran | CONFIRMED |
| Alternative JSON form | `{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"allow"\|"deny"\|"ask","permissionDecisionReason":"…"}}` | CONFIRMED (schema) / DEFERRED (exit-2 path used instead) |
| `hooks.json` schema | `{"description": …, "hooks": {"<EventName>": [{"matcher": …, "hooks": [{"type":"command","command":"…"}]}]}}`. **Note the top-level `{description, hooks}` wrapper** — a flat Claude-style `{"PreToolUse": […]}` is rejected with `unknown field 'PreToolUse', expected 'description' or 'hooks'`. | CONFIRMED |
| Handler types | `command`, `prompt`, `agent`; fields `timeoutSec`, `async`, `statusMessage`, `commandWindows` | CONFIRMED (schema) |
| Hook trust | Hooks carry a trust model (`trusted`/`untrusted`/`modified`/`managed`). An `allow_managed_hooks_only` requirement exists. | CONFIRMED |
| **What happens to an UNTRUSTED hook in headless mode?** | **It silently no-ops.** Proven live: the identical run *without* `--dangerously-bypass-hook-trust` produced no denial, no warning, and `command_execution` items — **the command executed**. There is no error and no signal. Re-confirmed on 0.145.0 with the real craft guard hook left untrusted. | **CONFIRMED (0.144.6; re-confirmed 0.145.0) — and this is the most dangerous behaviour found in this probe** |
| Can trust be persisted? | **Yes — write path exercised headless on 0.145.0.** `hooks.state` is a `config.toml` key, not a state file or DB row. `codex app-server`'s `hooks/list` method returns each hook's `key` and `currentHash`; appending `[hooks.state."<key>"] trusted_hash = "<currentHash>"` to `$CODEX_HOME/config.toml` flips `trustStatus` to `trusted` on the next `hooks/list` call. The TUI's own `config/batchWrite` writes the same key. See the Re-probe section below for the full sequence. | CONFIRMED (0.145.0; write path exercised) |

### Consequence for the binding — do not skip this

The two obvious postures are both wrong:

- **Always pass `--dangerously-bypass-hook-trust`** — the flag is *not* scoped to craft's own hook. It disables the trust gate for **every** hook in the invoking environment, so installing craft would silently downgrade an unrelated security control.
- **Never pass it, and assume the hook runs** — an untrusted hook silently no-ops, so the guard is **absent while appearing installed**. Every test passes, the hook file exists, and nothing is enforced.

The correct posture is therefore: **trust the craft guard hook once at install time** (persisted via `hooks.state`/`trusted_hash`), run headless with **no bypass flag**, and **verify trust state at launch, failing loudly when the hook is not trusted** — never inferring enforcement from the hook file merely being present.

`buildLaunchArgs` ships with `bypassHookTrust` defaulting to **false** and opt-in only. On
0.145.0 the scriptable path exists: `codex app-server`'s `hooks/list` method is a read-only trust
check, and the `config.toml` write above is the scriptable trust step. Launch-time verification is
now a delivery choice, not a codex capability gap — the open row below is updated accordingly.

### Execpolicy `.rules` — argv-aware, but with a real gap

Codex ships a second, independent denial surface: **Starlark** `.rules` files
(`--ignore-rules` disables user/project ones). `codex execpolicy check --rules <PATH> <COMMAND>…`
evaluates a command against a policy **deterministically, offline, with no auth** — an ideal
matcher-semantics prober.

Rule form: `prefix_rule(pattern=[…], decision="forbidden"|"allow"|"prompt", justification="…")`.

Matcher semantics, pinned empirically against `pattern=["git","push"]`:

| Command | Result | Note |
|---|---|---|
| `git push` | **forbidden** | exact prefix |
| `git push --force origin main` | **forbidden** | trailing args do not defeat it |
| `git -C . push` | **NO MATCH** | ⚠️ **interposed global option bypasses the rule — the same gap class that defeated Copilot** |
| `git --git-dir=.git push` | **NO MATCH** | ⚠️ same class |
| `git status`, `git commit -m x` | no match | correct — unrelated commands unaffected |
| `bash -lc 'git push'` | **NO MATCH** | shell-wrapper contents not matched by `check` |

Alternation **is** supported via a nested list — `pattern=["git", ["push","clean"]]` forbids both
`git push` and `git clean` while leaving `git status` alone. (The dict form `{"any_of": […]}` and
the builtins `any_of(…)` / `pattern(…)` all fail to parse; `any_of` belongs to `requirements.toml`,
a *different* policy surface. Two surfaces, do not conflate them.)

Honest summary: Codex's matcher is **token-prefix over argv**, which is stronger than Copilot's
raw-string prefix match, and it supports per-position alternation. It is **still not adversarial** —
interposed global options slip past. Do not overclaim.

A malformed `.rules` file is a hard error (exit 1) in `execpolicy check`. Whether the **runtime**
path fails open is unresolved — the binary contains the string
`Error parsing rules; custom rules not applied.`, which reads like a fail-open. **DEFERRED, and it
should be treated as fail-open until proven otherwise.**

### Sandbox / containment — likely the strongest layer

| Question | Answer | Status |
|---|---|---|
| Native sandbox? | **Yes** — `-s/--sandbox <read-only\|workspace-write\|danger-full-access>` (plus `external-sandbox`) | CONFIRMED |
| macOS implementation | Seatbelt | CONFIRMED |
| Tunables | `writable_roots`, `network_access`, `exclude_tmpdir_env_var`, `exclude_slash_tmp` | CONFIRMED (schema) |
| Network containment | Sandbox network proxy — `Network access was denied by the Codex sandbox network proxy.` | CONFIRMED (string) |
| Permission profiles | `[permissions.<id>]` with `extends`; `default_permissions`; built-in `:workspace`; `CODEX_PERMISSION_PROFILE` env var; `permissions.filesystem.deny_read` | CONFIRMED (schema) |
| Approval policy | `approval_policy` ∈ `untrusted`/`on-request`/`granular`/`never`/`on-failure`; granular sub-toggles for `sandbox_approval`, `rules`, `skill_approval`, `mcp_elicitations` | CONFIRMED |
| **What each mode actually blocks** | Not measured per mode | **DEFERRED** — measure before claiming any containment guarantee |

## BYOK / offline harness — the technique that made this cheap

**It works, and it is the reason most Gate rows above are CONFIRMED rather than DEFERRED.**

```toml
model_provider = "fakeprov"
approval_policy = "never"

[model_providers.fakeprov]
base_url = "http://127.0.0.1:8765/v1"
wire_api = "responses"
requires_openai_auth = false
```

Zero credentials, zero quota, fully offline. Gotchas pinned the hard way:

1. **`wire_api = "chat"` is no longer supported.** The fake provider must speak the **Responses**
   API. A from-memory chat-completions harness fails outright — exactly the class of stale
   assumption this record exists to prevent.
2. The provider must emit **SSE chunks**; a plain JSON body fails.
3. **The shell tool is named `exec_command`, not `shell_command`**, and it takes `cmd` as a
   **string** (an argv array yields `invalid type: sequence, expected a string`). The registered
   tool set depends on resolved model metadata, so an unknown model id changes the tool names.
   Read the tool list off the request body rather than guessing it.
4. Safety: the probe provider was written fresh and could only ever emit `echo CRAFT_HOOK_PROBE` —
   harmless if executed. A prior run reused a harness that fired `git push --force origin main`
   against a real repo (harmless only by luck: no remote).

## Tool surface — model-dependent, and `apply_patch` is freeform

Read directly off the request bodies Codex sent to the fake provider.

| Model | Tools sent in the request |
|---|---|
| `gpt-5.4`, `gpt-5.2` | `exec_command`, `write_stdin`, `update_plan`, `request_user_input`, **`apply_patch`**, `view_image`, `get_goal`, `create_goal`, `update_goal`, `tool_search`, `web_search` |
| unknown id (fallback metadata) | as above **minus `apply_patch` and `tool_search`**, plus namespace `multi_agent_v1` |
| `gpt-5.6-sol` | **no `tools` key at all** — the newest first-party model receives its tools server-side |

Three consequences the guard design must absorb:

1. **The tool surface varies by model.** A guard whose tool-name map is derived from one probe is
   blind on another model. In particular `gpt-5.6-sol` sends no tool list at all.
2. **Key the guard off the PreToolUse hook payload, not the request body.** The hook fires with
   `tool_name` / `tool_input` regardless of how the tool was delivered — it fired on `exec_command`
   in the denial probe. That is the only surface present across all three cases above.
3. **`apply_patch` is a `custom` freeform grammar tool** (Lark), not a JSON-parameters function:
   `"Use the apply_patch tool to edit files. This is a FREEFORM tool, so do not wrap the patch in JSON."`
   Its payload is raw patch text:

   ```
   *** Begin Patch
   *** Update File: <path>
   *** Add File: <path>
   *** Delete File: <path>
   *** Move to: <path>
   *** End Patch
   ```

   There is **no structured `file_path` field**. Path containment must parse the filenames out of
   the patch body — and a single patch may carry **multiple hunks touching multiple files**, so
   **every** filename must be checked. Checking only the first reproduces the known decoy hazard
   (an in-tree leading hunk masking an out-of-tree later one) in a new shape.

   **Shipped**: `adapters/codex/src/apply-patch-paths.js` extracts every `*** Add File:` /
   `*** Update File:` / `*** Delete File:` / `*** Move to:` path from the patch body in document
   order (over-extraction is safe; under-extraction is the hazard); `adapters/codex/src/git-guard-
   adapter.js` runs the shared containment predicate once per extracted path and blocks on the
   first violation, with zero extracted paths from a non-empty patch treated as fail-closed.

| Tool | Argument shape | Status |
|---|---|---|
| `exec_command` | `cmd` — a **string** (an argv array is rejected: `invalid type: sequence, expected a string`) | CONFIRMED |
| `apply_patch` | freeform Lark grammar; paths embedded in patch text; multi-file capable | CONFIRMED |
| Write/edit tool name on `gpt-5.6-sol` | unknown — no tool list is sent | DEFERRED |

## Auth

| Question | Answer | Status |
|---|---|---|
| What a real run needs | `codex login` (ChatGPT OAuth or `--with-api-key`), or `OPENAI_API_KEY` / `CODEX_API_KEY` / `CODEX_ACCESS_TOKEN` | CONFIRMED |
| Does a live smoke need paid quota? | **Yes** — a real-model run does, and one was run (see End-to-end construction). The BYOK harness still removes the need for it across every deterministic seam. | CONFIRMED |

## End-to-end construction (live)

One isolated live run drove the real `codex` through the binding's own
`buildLaunchArgs` posture — `codex exec -s workspace-write -C <throwaway>`, a seeded
throwaway `CODEX_HOME`, `--ephemeral` deliberately **not** passed — and asked it to
build Conway's Game of Life. This is the construction counterpart to the pi record's
row: proof the binding drives real codex to a working artifact, not just that its
seams unit-test through injected dependencies.

| Question | Answer | Status |
|---|---|---|
| Model observed | `gpt-5.6-terra` (provider `openai`); one-turn `codex exec`, `approval: never`, `sandbox: workspace-write [workdir, /tmp, $TMPDIR]` | CONFIRMED |
| Artifact produced | `gol.js` — a correct Conway `step(grid)`: B3/S23, out-of-range neighbours read as dead (bounds-checked), returns a new grid (input not mutated) | CONFIRMED |
| Test produced | `gol.test.js` — a `node:test` asserting a blinker's period-2 oscillation both ways (`step(vertical)` deep-equals horizontal, `step(horizontal)` deep-equals vertical) | CONFIRMED |
| Independent re-run | `node --test` re-run by the operator — not codex's self-report — passed: 1 test, 0 fail | CONFIRMED |
| Isolation held | zero writes to the real `~/.codex` (3- and 15-minute mtime windows both empty); the whole session — rollout `.jsonl`, sqlite state, skills/plugins cache — landed in the throwaway `CODEX_HOME` | CONFIRMED |

The throwaway `CODEX_HOME` was seeded by copying `auth.json` + `config.toml` into it —
never touching the real home — so a real-model turn authenticated against operator
credentials without mutating operator state. The `ls -la ~/.codex` listing did shift
during the run; that is ambient SQLite `-wal`/`-shm` churn, not a smoke write — the
mtime windows are the authoritative check and both were empty.

## Open rows — closed / updated (2026-07-21, harden-prove-codex-binding)

All six probed live against `codex-cli 0.144.6` in a throwaway `CODEX_HOME` (auth copied,
never read; watchdog = background kill; isolation = `find ~/.codex -newer <marker>` empty per
probe; trusted by independent re-run). Method note: wrap EVERY `codex` invocation — including
bare `--version`/`--help` — in the throwaway env, or set the isolation marker AFTER them; a bare
diagnostic touches the real `~/.codex` (version/cache/installation init) and false-alarms a
15-minute window.

| # | Row | Status | Evidence |
|---|-----|--------|----------|
| 0 | Launch-time hook-trust verification | **DELIVERED (0.145.0)** | The guard **over-blocked every command** (real payload is Claude-shaped `tool_input.command`, not `exec_command`/`cmd`) — fixed `fb4b922`, live-verified (benign `echo` ALLOWED, `git diff` DENIED with ext-diff reason). The untrusted-hook silent no-op is CONFIRMED (0.144.6, re-confirmed 0.145.0). codex 0.144.6 exposed no scriptable hook-trust write path; **0.145.0 lifts that limitation** — `codex app-server`'s `hooks/list` plus a `config.toml` write is a scriptable read/write trust path (see the Re-probe section). |
| 1 | Shared skills load by reference | **DISPROVEN (re-pinned 0.144.6 → 0.145.0)** | Manifest-location bug fixed (`b204182`: codex reads `.claude-plugin/marketplace.json`, not root). But `codex plugin add` copies the plugin and DROPS the out-of-tree `../../../../skills` ref — the 19 shared skills do NOT load by reference; the symlink fallback loads all 19. Re-probed on 0.145.0 via the app-server `skills/list` method: same result, 0/19 versus 19/19. Still a codex limitation; stays OPEN. |
| 2 | Sandbox modes, per mode | **CONFIRMED (DELIVERED)** | Ground-truth 3×matrix: read-only blocks all writes+network; workspace-write allows cwd + `$TMPDIR`, BLOCKS genuinely-outside write + network; danger-full-access allows all. No fail-open. |
| 3 | Malformed `.rules` fails open at runtime | **CONFIRMED fail-open (mitigated)** | Runtime loads `$CODEX_HOME/rules/`; binary carries `Error parsing rules; custom rules not applied.` → rules not applied on parse error. Mitigation `115bcce`: `assertRulesIntegrity` byte-compares deployed rules to the generator, refuses on drift. |
| 4 | `CLAUDE_PLUGIN_ROOT` substitution | **CONFIRMED (DELIVERED)** | With `CRAFT_ROOT` unset + `CLAUDE_PLUGIN_ROOT` set, the hook command `node ${CRAFT_ROOT:-${CLAUDE_PLUGIN_ROOT}}/…/craft-guard.js` resolved — guard fired + denied `git diff`. codex expands `${CLAUDE_PLUGIN_ROOT}` AND the POSIX `:-` default, and runs hook commands through a shell. |
| 5 | Rollout fixture + telemetry pin | **CONFIRMED gap (fixed)** | The persisted rollout does NOT carry the live `turn.completed` envelope — token record is `event_msg`/`token_count`/`info.last_token_usage`, session id on `session_meta`. The binding parsed only `turn.completed` → mined ZERO from real rollouts. Fixed `9accb03` (parse both envelopes, `last_token_usage` per-turn not cumulative), pinned by real fixture `engine/test/fixtures/codex/real-rollout.jsonl`. |

## Re-probe — codex-cli 0.145.0

Probe environment: two throwaway `CODEX_HOME`s, auth copied in, never the real home. Isolation
proven by `find ~/.codex -newer <ref marker>` → **0 entries**; 111 and 139 entries newer than the
marker landed in the throwaway homes. `--dangerously-bypass-hook-trust` was never used.

### Hook trust — scriptable read and write path (lifts open row 0 above)

Headless read: `codex app-server` speaks newline-delimited JSON-RPC on stdio.

```json
{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"clientInfo":{"name":"…","version":"…"}}}
{"jsonrpc":"2.0","id":2,"method":"hooks/list","params":{"cwds":["<repo>"]}}
```

The id-2 response envelope — pinned against both the live response and the generated protocol
schema (`HooksListResponse.json`) — is `result.data[]`, one entry per requested cwd, each entry
`{cwd, hooks, warnings, errors}` with all four fields required. A non-empty `errors[]` means codex
failed to load some hook config — the case where a guard could be silently missing — and its
elements are `{message, path}`:

```json
{"id":2,"result":{"data":[{"cwd":"<abs>","hooks":[ /* HookMetadata */ ],"warnings":[],"errors":[]}]}}
```

Each `hooks[]` entry is a `HookMetadata` carrying: `key` (e.g.
`"<CODEX_HOME>/config.toml:pre_tool_use:0:0"`), `currentHash` (e.g. `"sha256:031fe4e9…"`),
`trustStatus` (`managed | untrusted | trusted | modified`), plus `enabled`, `source`
(`user`/`project`/`plugin`/…), `sourcePath`, `handlerType`, `matcher`, `timeoutSec`, `isManaged`,
`command`.

The write path is a `config.toml` append, not a state file or DB row:

```toml
[hooks.state."<key from hooks/list>"]
trusted_hash = "<currentHash from hooks/list>"
```

Re-running `hooks/list` then reports `trustStatus: "trusted"` — observed live. The hash covers the
hook definition: editing the hook `command` after trusting changes `currentHash`, and the next
`hooks/list` reports `trustStatus: "modified"` — the tamper signal.

### Fail-closed proof — both directions

The real `adapters/codex/hooks/craft-guard.js`, wired and trusted via the path above, was exercised
against a git repo with an uncommitted change:

| Case | Command codex was told to run | Ground truth | Verdict |
|---|---|---|---|
| BLOCK | `git diff > OUT.txt` | `OUT.txt` **absent** | denied — command never ran |
| ALLOW | `git diff --no-ext-diff > ALLOWED.txt` | `ALLOWED.txt` non-empty, contains the real unified diff | allowed — ran normally |

Recording only the denial would repeat the earlier over-blocking regression this binding shipped
once — both directions are recorded deliberately.

### `PreToolUse` payload — additive fields only

```json
{
  "session_id": "019fb4ab-cc5a-7003-b1e1-504f572e162d",
  "turn_id": "019fb4ab-ccf8-73b3-b3d6-d898422695fb",
  "transcript_path": "<CODEX_HOME>/sessions/2026/07/30/rollout-….jsonl",
  "cwd": "<workspace>",
  "hook_event_name": "PreToolUse",
  "model": "gpt-5.6-terra",
  "permission_mode": "bypassPermissions",
  "tool_name": "Bash",
  "tool_input": { "command": "touch GROUNDTRUTH.txt" },
  "tool_use_id": "exec-8d9a6751-9ec7-45a0-b442-55efedf9a35d"
}
```

Still Claude-shaped: `tool_name` + `tool_input.command` + `cwd`. The adapter's existing
`bridgeExecutedCommand` (reads `tool_input.command`) is correct against 0.145.0 — no adapter logic
change needed. New fields versus the 0.144.6 dump: `model`, `permission_mode`, `tool_use_id`,
`turn_id`.

**Two vocabularies — do not conflate.** The hook payload's `hook_event_name` is `"PreToolUse"`
(PascalCase); the app-server protocol's `HookEventName` enum is `"preToolUse"` (camelCase):
`preToolUse, permissionRequest, postToolUse, preCompact, postCompact, sessionStart, sessionEnd,
userPromptSubmit, subagentStart, subagentStop, stop`.

### Shared skills by reference — still does not work (re-pins open row 1 above)

`codex plugin add craft@craft-codex-marketplace` still copies into
`$CODEX_HOME/plugins/cache/craft-codex-marketplace/craft/local/`, and the generated
`.codex-plugin/plugin.json` drops every out-of-tree field:

| Source `plugin.json` | Cached `.codex-plugin/plugin.json` |
|---|---|
| craft: `{name, version, description, author, skills:"../../../../skills"}` | `{description, name}` — `skills` dropped |
| craft-codex: `{…, hooks:"../../hooks.json", skills:"./skills"}` | `{description, name}` — `hooks` AND `skills` dropped |

Ground truth via the app-server `skills/list` method: without the symlink fallback, **0 of 19**
shared craft skills load (only the local `craft-codex:craft-run` appears, whose files were
physically copied into the cache); with the documented symlink fallback
(`ln -s <repo>/skills/<name> $CODEX_HOME/skills/<name>`), **19 of 19** load, registered as
`craft:<name>` at scope `user`. Keep the symlink fallback in the adapter README.

### Marketplace source form — bare relative path resolves as a hosted shorthand

`codex plugin marketplace add --help` documents the SOURCE argument as "a local path,
owner/repo[@ref], HTTPS Git URL, or SSH Git URL." A bare `adapters/codex` matches the `owner/repo`
form, so 0.145.0 resolves it against **GitHub**, not as a local directory:

```
Error: git clone https://<host>/adapters/codex.git … failed with status exit status: 128
fatal: repository '…/adapters/codex.git/' not found
```

It appears to hang because the clone stalls on interactive credential prompting for a
non-existent repository; with prompting disabled it fails fast instead — a misresolution, not a
hang.

| Form | Result |
|---|---|
| `codex plugin marketplace add adapters/codex` | resolved as a hosted `owner/repo` shorthand → clone fails / stalls on credential prompt |
| `codex plugin marketplace add ./adapters/codex` | works — returns a marketplace name and installed root |
| `codex plugin marketplace add /abs/path/to/adapters/codex` | works |

This is observed 0.145.0 behaviour, not a claimed regression — whether 0.144.6 resolved the bare
form differently was never re-probed. `adapters/codex/README.md` documents the bare relative form,
so it is a live docs defect; the minimal fix is a `./` prefix.

### Open questions from this re-probe

| Question | Status |
|---|---|
| Does `hooks/list` require an authenticated `CODEX_HOME`? | **CONFIRMED (0.145.0): yes.** With no `auth.json`, and again with a stale refresh token, `codex app-server` exits code 0 having answered only `initialize` — the `hooks/list` response never arrives. The trust helper therefore cannot run on an unauthenticated machine, which rules out CI. |
| Does `hooks/list` report `command` raw or shell-expanded? | **CONFIRMED (0.145.0): shell-expanded.** The live dogfood reported `command=/Users/…/.n/bin/node /…/adapters/codex/hooks/craft-guard.js` — the `node` binary resolved to an absolute path. Matching on the `/adapters/codex/hooks/craft-guard.js` path tail covers this and the raw form both; do not narrow it to one variant on the strength of this single observation. |

### `app-server` stdin must stay open — CONFIRMED (0.145.0)

`codex app-server` treats **stdin EOF as a shutdown signal**. Writing the request lines and then
closing stdin makes the server exit having answered only `initialize`: the awaited response never
arrives and the caller sees an exit-before-responding error. Measured both ways against the same
`CODEX_HOME` and cwd:

| stdin handling after writing both requests | outcome |
|---|---|
| closed | child exits code 0, 532 bytes of stdout, **no id-2 response** |
| left open | id-2 response received |

A client must therefore bound the call with a **timeout and a kill**, never with an EOF. This is a
live-only fact: a unit test whose fake child ignores `stdin.end()` passes either way, so the fake
must model EOF-as-shutdown or the regression is invisible.

### Isolation-method caveat — the mtime proof has a blind spot

This record's isolation protocol is an mtime-find over the real `CODEX_HOME`, and it correctly
reported zero filesystem writes for every probe here. But copying `auth.json` into a throwaway home
shares a **refresh token that rotates server-side on use**. During this re-probe the throwaways
rotated it, which silently invalidated the token still sitting in the operator's real `auth.json` —
a `refresh_token_reused` failure on next use, requiring `codex login`. No filesystem check can
observe this, because nothing on the real filesystem changed.

Rule for any refresh of this record: mtime-find proves *filesystem* isolation only. Treat copied
credentials as consumed, keep probe windows short enough to stay inside the access token's lifetime,
and expect a re-login may be needed afterwards.
