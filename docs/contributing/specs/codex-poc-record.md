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
| Binary self-report | `codex-cli 0.163.0` (was `codex-cli 0.162.1`, `codex-cli 0.145.0`) | CONFIRMED (0.163.0; first pinned 0.145.0) |
| npm package version | `@openai/codex@0.163.0`, platform package `0.163.0-darwin-arm64`, read from the installed package (was `@openai/codex@0.162.1`, `@openai/codex@0.145.0`) | CONFIRMED (0.163.0; first pinned 0.145.0) |
| Do they agree? | **Yes** — unlike the copilot binding, where the cask said 1.0.17 and the binary said 1.0.63. Re-check both on refresh; agreement today is not a guarantee. | CONFIRMED (re-confirmed 0.162.1; re-confirmed 0.163.0) |
| Competing/legacy CLI shadowing the name? | **No.** No Homebrew formula or cask named `codex`; no `openai` CLI installed. (`aider` is an unrelated third-party tool.) Contrast the copilot run, where the Homebrew `copilot` formula was actually AWS ECS's tool. | CONFIRMED |
| Install path | `<node-bin>/codex` → Node shim → vendored native binary at `…/@openai/codex/node_modules/@openai/codex-darwin-arm64/vendor/aarch64-apple-darwin/bin/codex`. Observed on 0.145.0; unchanged on 0.162.1 and 0.163.0. No 0.144.6 vendor path was ever recorded here, so this is a fresh observation and **not** a delta against a prior layout. | CONFIRMED (0.145.0; re-confirmed 0.162.1, 0.163.0) |

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

**Scope — this record carries several version pins at once.** Each re-probed row names its
version — rows marked `(0.145.0)`, `(0.161.0)`, `(0.162.1)` or `(0.163.0)`, and the matching
`Re-probe — codex-cli <version>` sections below, were observed on that version. Every unmarked row
remains a 0.144.6 observation and was not re-probed.

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
| **Skills by reference?** | **DISPROVEN on 0.145.0.** `plugin add` copies into `$CODEX_HOME/plugins/cache/…`, and the cached `.codex-plugin/plugin.json` drops the out-of-tree `skills` (and `hooks`) field. Ground-truthed via the app-server `skills/list` method: **0 of 19** shared craft skills load without the symlink fallback; **19 of 19** load with it (`ln -s <repo>/skills/<name> $CODEX_HOME/skills/<name>`, registered as `craft:<name>`). Re-confirmed on 0.162.1: same 0 of 19 versus 19 of 19. Re-confirmed on 0.163.0 against the then 20 shared skills: 0 of 20 versus 20 of 20. | **DISPROVEN (0.145.0; re-confirmed 0.162.1, 0.163.0)** |
| Plugin manifest | `{name, version, description, author, skills, hooks, mcpServers, apps, interface{…}}` — `skills`/`hooks`/`mcpServers`/`apps` are all path-valued | CONFIRMED |
| Plugin install | `codex plugin add` from a configured marketplace snapshot; `codex plugin marketplace add` supports local file-backed marketplaces | **CONFIRMED (0.145.0 — install exercised live; re-exercised 0.162.1 with `./adapters/codex`; re-exercised 0.163.0 with the `craft` entry rebuilt byte-for-byte from `eab55ee^` in the throwaway, the committed marketplace declaring `craft-codex` only):** marketplace registration plus `plugin add` for both entries; see the re-probe section for the source-form matrix and the cached-manifest outcome |
| MCP | `codex mcp` subcommand; `mcp_servers` config; Codex can also *be* an MCP server (`codex mcp-server`) | CONFIRMED (surface) |
| **CRAFT_ROOT export** | Codex honours **`CLAUDE_PLUGIN_ROOT`**, `PLUGIN_ROOT`, `CLAUDE_PLUGIN_DATA`, `PLUGIN_DATA` in hook command templates — a ready-made root-export lever | CONFIRMED (strings) / DEFERRED (not exercised live) |
| Claude-config migration | Codex has a first-class importer for `CLAUDE.md`, `settings.json`, `hooks.json`, `agents`, MCP servers | CONFIRMED (surface) |

## Gate port — the guard

This is the highest-risk area, and it is where Codex differs most from Copilot.

### Tool-call hook — **it can actually deny**

| Question | Answer | Status |
|---|---|---|
| Is there a pre-execution hook? | **Yes** — `PreToolUse`, plus `PermissionRequest`, `PostToolUse`, `PreCompact`, `PostCompact`, `SessionStart`, `UserPromptSubmit`, `SubagentStart`, `SubagentStop`, `Stop` | CONFIRMED |
| **Can it DENY?** | **YES — proven live.** Contrast Copilot 1.0.63, whose hook fired but could not deny (Copilot ≥ 1.0.92 denies; see the Copilot PoC record). | **CONFIRMED** |
| Denial mechanism | A `command` handler exiting **code 2** with a reason on **stderr** blocks the call | CONFIRMED |
| Observed evidence | `ERROR codex_core::tools::router: error=Command blocked by PreToolUse hook: craft-guard: denied. Command: echo CRAFT_HOOK_PROBE` | CONFIRMED |
| Is the denial fed back to the model? | **Yes** — next turn's input carried `function_call_output: "Command blocked by PreToolUse hook: …"` | CONFIRMED |
| Did the command execute? | **No** — the probe `echo` never ran | CONFIRMED |
| Alternative JSON form | `{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"allow"\|"deny"\|"ask","permissionDecisionReason":"…"}}` | CONFIRMED (schema) / DEFERRED (exit-2 path used instead) |
| `hooks.json` schema | `{"description": …, "hooks": {"<EventName>": [{"matcher": …, "hooks": [{"type":"command","command":"…"}]}]}}`. **Note the top-level `{description, hooks}` wrapper** — a flat Claude-style `{"PreToolUse": […]}` is rejected with `unknown field 'PreToolUse', expected 'description' or 'hooks'`. | CONFIRMED |
| Handler types | `command`, `prompt`, `agent`; fields `timeoutSec`, `async`, `statusMessage`, `commandWindows` | CONFIRMED (schema) |
| Hook trust | Hooks carry a trust model (`trusted`/`untrusted`/`modified`/`managed`). An `allow_managed_hooks_only` requirement exists. | CONFIRMED |
| **What happens to an UNTRUSTED hook in headless mode?** | **It silently no-ops.** Proven live: the identical run *without* `--dangerously-bypass-hook-trust` produced no denial, no warning, and `command_execution` items — **the command executed**. There is no error and no signal. Re-confirmed on 0.145.0 with the real craft guard hook left untrusted. | **CONFIRMED (0.144.6; re-confirmed 0.145.0; re-confirmed 0.162.1; re-confirmed 0.163.0) — and this is the most dangerous behaviour found in this probe** |
| Can trust be persisted? | **Yes — write path exercised headless on 0.145.0.** `hooks.state` is a `config.toml` key, not a state file or DB row. `codex app-server`'s `hooks/list` method returns each hook's `key` and `currentHash`; appending `[hooks.state."<key>"] trusted_hash = "<currentHash>"` to `$CODEX_HOME/config.toml` flips `trustStatus` to `trusted` on the next `hooks/list` call. The TUI's own `config/batchWrite` writes the same key. See the Re-probe section below for the full sequence. | CONFIRMED (0.145.0; write path exercised; re-exercised 0.162.1 via `bin/trust-hook.js`, byte-identical re-run; trust write re-exercised 0.163.0 with the same hash, idempotence not re-run) |

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
| `git -C . push` | **NO MATCH** | ⚠️ **interposed global option bypasses the rule — the same gap class that defeated Copilot**; the PreToolUse hook denies it with the push reason |
| `git --git-dir=.git push` | **NO MATCH** | ⚠️ same class; the PreToolUse hook denies it with the push reason |
| `git status`, `git commit -m x` | no match | correct — unrelated commands unaffected |
| `bash -lc 'git push'` | **NO MATCH** | shell-wrapper contents not matched by `check`; the PreToolUse hook denies it with the plain-command gate reason |

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

That is the 0.144.6 statement. **Resolved on 0.162.1, split by surface:** `codex exec` refuses to
start (exit 1, `Error loading rules: … starlark error`; it fails closed, 3/3); the app-server
thread/turn path emits a `configWarning`, skips the rules and runs the command (it fails open,
3/3); the interactive TUI runs its turns through an app-server daemon and fails open the same way,
with nothing on screen (3/3). On 0.163.0 the `codex exec` refusal re-confirmed (3/3); the app-server and TUI paths were not re-probed. Still treat a malformed `.rules` file as fail open.

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
| Filesystem isolation held | zero writes to the real `~/.codex` (3- and 15-minute mtime windows both empty); the whole session — rollout `.jsonl`, sqlite state, skills/plugins cache — landed in the throwaway `CODEX_HOME` | CONFIRMED |

The throwaway `CODEX_HOME` was seeded by copying `auth.json` + `config.toml` into it —
never touching the real home — so a real-model turn authenticated against operator
credentials without mutating operator state on disk. The `ls -la ~/.codex` listing did
shift during the run; that is ambient SQLite `-wal`/`-shm` churn, not a smoke write — the
mtime windows are the authoritative check **for filesystem writes**, and both were empty.
They are not a whole-isolation proof, and this run is exactly the case that shows why: it
copied `auth.json`, and a copied rotating credential is invisible to any mtime check. See
*Isolation-method caveat* at the end of this record.

## Open rows — closed / updated (rows 2–5: 2026-07-21 on 0.144.6; rows 0–1: revisited 2026-07-31 on 0.145.0; rows 0, 1, 3: revisited 2026-10-15 on 0.162.1; rows 0, 1, 3: revisited 2026-10-22 on 0.163.0)

Rows 2–5 were probed live against `codex-cli 0.144.6` in a throwaway `CODEX_HOME` (auth copied,
never read; watchdog = background kill; isolation = `find ~/.codex -newer <marker>` empty per
probe; trusted by independent re-run). Rows 0 and 1 carry verdicts revisited on `codex-cli 0.145.0`
under the same protocol — see the re-probe section below for their evidence. Rows 0, 1 and 3 were
revisited again on `codex-cli 0.162.1` under the same protocol; see
`Re-probe — codex-cli 0.162.1`. Rows 0, 1 and 3 were revisited on `codex-cli 0.163.0` too; see `Re-probe — codex-cli 0.163.0`. Method note: wrap
EVERY `codex` invocation — including
bare `--version`/`--help` — in the throwaway env, or set the isolation marker AFTER them; a bare
diagnostic touches the real `~/.codex` (version/cache/installation init) and false-alarms a
15-minute window. On 2026-10-22 one unwrapped `codex exec --help` did exactly this, creating 5 entries under `~/.codex/tmp/arg0-macos`; see `Re-probe — codex-cli 0.163.0`.

| # | Row | Status | Evidence |
|---|-----|--------|----------|
| 0 | Launch-time hook-trust verification | **OPEN — the codex limitation is lifted, the verification is not wired** | The guard **over-blocked every command** (real payload is Claude-shaped `tool_input.command`, not `exec_command`/`cmd`) — fixed `fb4b922`, live-verified (benign `echo` ALLOWED, `git diff` DENIED with ext-diff reason). The untrusted-hook silent no-op is CONFIRMED (0.144.6, re-confirmed 0.145.0). codex 0.144.6 exposed no scriptable hook-trust write path; **0.145.0 lifts that limitation** — `codex app-server`'s `hooks/list` plus a `config.toml` write is a scriptable read/write trust path (see the Re-probe section). What is shipped is `bin/trust-hook.js --check`, an **on-demand** read-only check. Nothing verifies trust **at launch**: no launch path calls it, so an operator who never invokes it still gets the silent no-op. The row stays open until verification is wired into a launch. On 0.162.1 the untrusted-hook silent no-op was re-confirmed, and `bin/trust-hook.js` worked end to end (trust write, `--check`, byte-identical re-run, BLOCK and ALLOW by side effect). Still no launch path calls `--check`. Silent no-op and the trusted BLOCK re-confirmed on 0.163.0. |
| 1 | Shared skills load by reference | **DISPROVEN — closed 2026-10-22 as a standing codex limitation (re-pinned 0.162.1 → 0.163.0)** | Manifest-location bug fixed (`b204182`: codex reads `.claude-plugin/marketplace.json`, not root). But `codex plugin add` copies the plugin and DROPS the out-of-tree `../../../../skills` ref — the 19 shared skills do NOT load by reference; the symlink fallback loads all 19. Re-probed on 0.145.0 via the app-server `skills/list` method: same result, 0/19 versus 19/19. Re-probed on 0.162.1 the same way: 0/19 versus 19/19, and both cached manifests are still `{description, name}`. Re-probed on 0.163.0: 0/20 versus 20/20 (the shared set grew to 20). A standing codex limitation: closed 2026-10-22, no re-probe scheduled, the symlink route stays required. |
| 2 | Sandbox modes, per mode | **CONFIRMED (DELIVERED)** | Ground-truth 3×matrix: read-only blocks all writes+network; workspace-write allows cwd + `$TMPDIR`, BLOCKS genuinely-outside write + network; danger-full-access allows all. No fail-open. |
| 3 | Malformed `.rules` fails open at runtime | **fail-open on the app-server path, fail-closed on `codex exec` (0.162.1) — treat as fail open** | Runtime loads `$CODEX_HOME/rules/`. 2026-07-21 (0.144.6): the recorded basis was the binary string `Error parsing rules; custom rules not applied.` alone; no runtime side effect was recorded. 0.162.1, by side effect: `codex exec` refuses to start (fail closed, 3/3); the app-server thread/turn path warns, skips the rules and runs the command (fail open, 3/3); the interactive TUI goes through an app-server daemon and fails open with nothing on screen (3/3). `assertRulesIntegrity` (`115bcce`) byte-compares deployed rules to the generator and refuses on drift. It is an exported, unit-tested check with no caller in the binding, kept on demand by decision (2026-10-16) because the binding launches nothing itself (operators run `codex exec`), so it protects only when something invokes it. 0.163.0: the `codex exec` refusal re-confirmed (3/3); the app-server path was not re-probed. |
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

Re-running `hooks/list` then reports `trustStatus: "trusted"` — observed live.

What `currentHash` covers was probed from both sides:

| Probe | Observation |
|---|---|
| hook `command` edited, guard script untouched | `currentHash` **changed** — `sha256:cf8ef5ea…` → `sha256:031fe4e9…` |
| guard script contents changed, hook `command` left byte-identical | `currentHash` **unchanged** — `sha256:8ef60908ec109ac294eee8de7e3accf796e5f4b28302703f5ae99cda5c6ab782` before and after |

So the hash covers the hook **definition** only. The guard script's contents are outside it — no
longer an inference from the first row, but an observation in its own right.

Two things follow, and only one of them was observed. **Observed:** a definition edit moves the
hash. **Not observed:** the trusted → `modified` transition itself. `modified` is what codex's own
`trustStatus` vocabulary denotes for a hook that was trusted once and whose definition has since
changed; that denotation is documented, not measured here, so do not cite this record as proof that
the transition fires.

**The residual, stated plainly rather than as reassurance:** an attacker who can rewrite
`craft-guard.js` moves no hash and never produces a `modified` status. Nothing in this trust
mechanism defends against that. Trust here is anchored to the hook definition, never to the guard's
behaviour.

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

What was **captured** is the clone's own failure above: `exit status: 128`, repository not found.
The stall is **inferred, not pinned**: with terminal prompting disabled the call fails fast, which
is consistent with the clone waiting on interactive credential prompting for a repository that does
not exist — but no prompt was ever observed. Either way it is a misresolution, not a hang in codex.

| Form | Result |
|---|---|
| `codex plugin marketplace add adapters/codex` | resolved as a hosted `owner/repo` shorthand → `git clone` exits 128, repository not found (observed); appears to stall without prompting disabled (cause inferred) |
| `codex plugin marketplace add ./adapters/codex` | works — returns a marketplace name and installed root |
| `codex plugin marketplace add /abs/path/to/adapters/codex` | works |

This is observed 0.145.0 behaviour, not a claimed regression — whether 0.144.6 resolved the bare
form differently was never re-probed. `adapters/codex/README.md` documents the bare relative form,
so it is a live docs defect; the minimal fix is a `./` prefix.

### Questions this re-probe raised — both answered

| Question | Status |
|---|---|
| Does `hooks/list` require an authenticated `CODEX_HOME`? | **CONFIRMED (0.145.0): yes.** With no `auth.json`, and again with a stale refresh token, `codex app-server` exits code 0 having answered only `initialize` — the `hooks/list` response never arrives. The trust helper therefore cannot run on an unauthenticated machine: not before `codex login`, and not in a CI job unless that job seeds a valid, authenticated `CODEX_HOME`. (see the 0.161.0 re-probe) |
| Does `hooks/list` report `command` raw or shell-expanded? | **CONFIRMED (0.145.0) as a single observation: shell-expanded.** The live dogfood reported `command=/Users/…/.n/bin/node /…/adapters/codex/hooks/craft-guard.js` — the `node` binary resolved to an absolute path. One observation is not a rule, and the raw form was never observed either way, so this cell does not say codex always expands. The matcher must accept both variants. (see the 0.161.0 re-probe) |

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

It happened. On 2026-10-15 a copy of the operator's `auth.json` — last written 2026-07-31, the day
of the 0.145.0 re-probe — returned HTTP 401. The 0.162.1 re-probe avoided a second rotation by
running `codex login` inside the throwaway `CODEX_HOME` instead of copying a credential (see
`Re-probe — codex-cli 0.162.1`).

## Re-probe — codex-cli 0.161.0

Method: an offline fake Responses provider (`model_providers`, `wire_api = "responses"`, no
`auth.json`) in a throwaway `CODEX_HOME` and `HOME`. Isolation proven by
`find ~/.codex -newer <marker>` = 0 files. Every row is pinned to 0.161.0; where it differs from
the 0.145.0 section above, both stay, each pinned to its version.

| Probe | Result |
|---|---|
| PreToolUse hook command execution (0.161.0) | **CONFIRMED (0.161.0).** The command runs as `<login shell> -c <command>`. Metachar probe `node <dump> 'a b' "$CRAFT_ROOT" $((1+1)) ; echo second >> <file>` gave argv `["a b", "<root>", "2"]`, the second command ran, and the parent process was `/bin/zsh -c …`. |
| Which shell runs the hook (0.161.0) | **CONFIRMED (0.161.0).** The login shell from the user database (`getpwuid_r` `pw_shell`); `$SHELL` is ignored (`SHELL=/bin/bash` and `/bin/sh` still ran `/bin/zsh`). Source rust-v0.161.0: `codex-rs/core/src/session/mod.rs` `hook_shell_program`; `codex-rs/shell-command/src/shell_detect.rs` `get_user_shell_path`. |
| Unquoted vs quoted plugin root, spaced path (0.161.0) | **CONFIRMED (0.161.0 shells).** Unquoted `node ${CRAFT_ROOT:-${CLAUDE_PLUGIN_ROOT}}/…/craft-guard.js` from a root containing a space: zsh runs the guard (no word-split); sh, bash and dash split the path (node exits 1). The quoted form runs the guard under all four. |
| `hooks/list` command echo (0.161.0) | **CONFIRMED (0.161.0).** A `config.toml`-registered command is echoed raw (quotes and `${…}` kept), source `user`. The literal and escaped TOML spellings hash identically (`sha256:38713365…`). The 0.145.0 row observed an expanded echo; the matcher accepts both. |
| `hooks/list` without credentials (0.161.0) | **CONFIRMED (0.161.0).** `hooks/list` answered from a `CODEX_HOME` with no `auth.json`. This contradicts the 0.145.0 row "requires an authenticated `CODEX_HOME`"; both stay, version-pinned. |
| Trust migration, unquoted to quoted (0.161.0) | **CONFIRMED (0.161.0).** A trusted unquoted hook edited to the quoted command reports `modified` with the same key; one `trust-hook` run re-trusts it. |
| End to end (0.161.0) | **CONFIRMED (0.161.0).** Template block copied verbatim, spaced `CRAFT_ROOT`; `trust-hook` trusted the quoted command, `--check` reported trusted/noop; `codex exec` without `--dangerously-bypass-hook-trust` had the guard deny `git diff` with its `--no-ext-diff` reason, and no command executed. |
| Hook exiting neither 0 nor 2 (0.161.0) | **CONFIRMED (0.161.0): fail-open.** Only exit 2 denies. Exit 1 (3/3 repeats), 3 and 127, `bash -c "exit 1"`, `sh -c "exit 1"`, an uncaught `node -e` throw, `node <missing>.js` and a self-SIGKILL each produced 2 `command_execution` items and turn-2 output `Process exited with code 0 … PROBE`. Controls: exit 0 ran the command; exit 2 + stderr produced 0 items and `Command blocked by PreToolUse hook: probe-deny. Command: echo PROBE`. Hook registered in a throwaway `config.toml`, trust bypassed there only, a marker file proving each hook ran. |

## Re-probe — codex-cli 0.162.1

Method: one throwaway `HOME`/`CODEX_HOME` (`<throwaway>`), with every `codex` invocation wrapped
in it, `--version` included. Isolation proven by `find ~/.codex -newer <marker>` = 0 entries,
while 185 entries landed in the throwaway. `--dangerously-bypass-hook-trust` was never used.
Every block was verified by its ground-truth side effect, never by exit code. Target repo: a
`git init` throwaway with one modified tracked file. Every row is pinned to 0.162.1; where it
differs from the 0.145.0 or 0.161.0 sections above, both stay, each pinned to its version.

| Probe | Result |
|---|---|
| Credentials (0.162.1) | **CONFIRMED (0.162.1).** The copied `auth.json` returned HTTP 401 `Could not parse your authentication token`; the real one was last written 2026-07-31 (the 0.145.0 re-probe used up that refresh token), as the isolation-method caveat predicted. Remedy: the operator ran `codex login` **inside** the throwaway `CODEX_HOME`, through the browser flow, because device-code sign-in is off for this account unless enabled in ChatGPT Security Settings. The real home was never touched and not rotated again. |
| Identity (0.162.1) | **CONFIRMED (0.162.1).** `codex-cli 0.162.1`; npm `@openai/codex` package version `0.162.1`, platform package `0.162.1-darwin-arm64` (read from the installed package, no codex run); vendored binary at `…/@openai/codex/node_modules/@openai/codex-darwin-arm64/vendor/aarch64-apple-darwin/bin/codex`, the 0.145.0 layout. Binary and package agree. |
| Plugin install (0.162.1) | **CONFIRMED (0.162.1).** `codex plugin marketplace add ./adapters/codex`, then `plugin add craft-codex@craft-codex-marketplace` and `plugin add craft@craft-codex-marketplace`. Both cached `.codex-plugin/plugin.json` are `{description, name}`: `skills` and `hooks` dropped — unchanged from 0.145.0. |
| Skills by reference (0.162.1) | **DISPROVEN (0.162.1).** App-server `skills/list` with `{"cwds":[<worktree>],"forceReload":true}` lists **0 of 19** shared skills (6 in total: `craft-codex:craft-run` at scope user, plus 5 system skills). `forceReload` is present in the 0.162.1 generated schema `SkillsListParams`; the 0.145.0 section never captured the `skills/list` params, so this is a first observation, not a delta. |
| Symlink fallback (0.162.1) | **CONFIRMED (0.162.1).** `ln -s <repo>/skills/<name> $CODEX_HOME/skills/<name>` ×19 gives **19 of 19**, registered `craft:<name>`, scope `user`, paths resolving to the repo. |
| Untrusted hook (0.162.1) | **CONFIRMED (0.162.1), fail-open reproduced.** The template `[[hooks.PreToolUse]]` block copied verbatim into the throwaway `config.toml`, `CRAFT_ROOT=<worktree>`; `trust-hook.js --check` → exit 1, `from=untrusted`; `codex exec --json -s workspace-write -C <target>` told to run `git diff > OUT.txt` ran it (`/bin/zsh -lc 'git diff > OUT.txt'`, exit 0), `OUT.txt` exists (101 B), and the JSONL stream has **zero** hook or warning items. |
| Trust write, check, idempotence (0.162.1) | **CONFIRMED (0.162.1).** `trust-hook.js` → exit 0, `trusted … from=untrusted hash=sha256:38713365…` (the 0.161.0 hash); `--check` → exit 0 `from=trusted action=noop`; a re-run → exit 0 `already trusted`, `config.toml` byte-identical (shasum unchanged). |
| BLOCK and ALLOW (0.162.1) | **CONFIRMED (0.162.1).** Trusted, `git diff > OUT.txt` → `OUT.txt` **absent**, the agent reports the call blocked by craft-guard requiring `--no-ext-diff`, no `command_execution` item; `git diff --no-ext-diff > ALLOWED.txt` → 101 B, a real unified diff. |
| Rules, well-formed control (0.162.1) | **CONFIRMED (0.162.1).** `adapters/codex/craft.rules` deployed to `$CODEX_HOME/rules/craft.rules` with the hook block removed; `codex execpolicy check` → `forbidden` (matchedPrefix `git clean`); `codex exec` told to run `git clean -f` → the untracked `VICTIM.txt` survived; app-server `thread/start` (`approvalPolicy` never, sandbox workspace-write) + `turn/start` → `VICTIM.txt` survived ("blocked by … safety policy"). |
| Tool shell (0.162.1) | **CONFIRMED (0.162.1).** An `exec_command` without a `shell` argument ran under zsh 5.9 (`ZSH_VERSION=5.9`, `BASH_VERSION` unset), the user's default shell. |
| `exec_command` schema (0.162.1) | **CONFIRMED (0.162.1).** The binary's schema text gives `shell`: "Shell binary to launch. Defaults to the user's default shell." The model chooses the shell per call. |
| Shell argument and the hook payload (0.162.1) | **CONFIRMED (0.162.1).** `exec_command {cmd, shell:"/bin/bash"}` with a dumping hook ran under bash 3.2.57; the payload's `tool_input` was `{"command": …}` only, so the `shell` argument never reaches the hook. |
| Hook timeout (0.162.1) | **CONFIRMED (0.162.1): fail-open.** Handler `timeout = 2` with a hook sleeping 6 s then exiting 2 gave `hook: PreToolUse Failed` and the command ran (marker written). |
| Default hook timeout (0.162.1) | **CONFIRMED (0.162.1).** No `timeout` key and a hook sleeping 90 s then exiting 2: the command was blocked after 91 s, so the default is above 90 s. Upper bound not probed. |
| Heredoc commit idiom (0.162.1) | **CONFIRMED (0.162.1).** With the previous hook, `exec_command {shell:"/bin/bash", cmd: git commit -m "$(cat <<'EOF' … EOF)"; git branch -D victim; …}` in a throwaway repo was allowed and bash 3.2 ran `git branch -D victim`; only the workspace-write sandbox's `.git` lock stopped it (`cannot lock ref … Operation not permitted`). The plain-command gate now denies it. |
| `write_stdin` and the hook (0.162.1) | **CONFIRMED (0.162.1), unguarded.** Offline fake provider, dumping hook that allows. `exec_command {cmd:"zsh -f -i", tty:true}` reached the hook as `tool_name: "Bash"`, `tool_input: {"command":"zsh -f -i"}` (no `tty`); the follow-up `write_stdin {session_id, chars:"echo WS_MARKER > ws_marker.txt\n"}` fired **no** PreToolUse hook, and the marker file was written. Real `~/.codex` untouched (`find -newer` = 0). |
| Feature flags (0.162.1) | **CONFIRMED (0.162.1).** Offline: fake Responses provider, one throwaway `HOME`/`CODEX_HOME` per case, dumping PreToolUse hook that allows, `mktemp` repos with no remote, benign `echo WS_MARKER > ws_marker.txt`; real `~/.codex` untouched (`find -newer` = 0). `codex features list`: `unified_exec`, `unified_exec_tty`, `shell_tool`, `write_stdin_approval` all `stable`, default `true`. Every bundled catalog slug (`gpt-5.5`, `gpt-5.6-sol/terra/luna`, `gpt-6-*`) has `shell_type: "shell_command"`; `gpt-5.4` / `gpt-5.4-mini` are not in it (fallback metadata). |
| `unified_exec` switch (0.162.1) | **CONFIRMED (0.162.1): not switchable.** `[features] unified_exec = false`, `codex features disable unified_exec` and `-c features.unified_exec=false` each write the key; `features list` still reports `true` and the tool list is unchanged. |
| `shell_tool` switch (0.162.1) | **CONFIRMED (0.162.1).** `[features] shell_tool = false` takes effect and removes the shell entirely. |
| Tool list with tty off (0.162.1) | **CONFIRMED (0.162.1).** Read off the request body. Default (`gpt-5.5`): `exec_command(cmd\|justification\|login\|max_output_tokens\|prefix_rule\|sandbox_permissions\|shell\|tty\|workdir\|yield_time_ms)`, `write_stdin(chars\|max_output_tokens\|session_id\|yield_time_ms)`, `request_user_input`, `apply_patch`, `view_image`, `get_goal`, `create_goal`, `update_goal`, `tool_search`, `web_search`. With `[features] unified_exec_tty = false`: identical minus `tty`; `write_stdin` stays listed. Same on `gpt-5.4` / `gpt-5.4-mini`. `gpt-5.6-sol` / `gpt-5.6-terra` send no `tools` key. |
| `write_stdin` into a tty shell, default config (0.162.1) | **CONFIRMED (0.162.1), unguarded.** `exec_command {cmd:"sh", tty:true}` then `write_stdin {session_id, chars:"echo WS_MARKER > ws_marker.txt\nexit\n"}`: marker written, no hook fired for `write_stdin` (`gpt-5.5`, `gpt-5.6-terra`, `gpt-5.6-sol`). |
| `write_stdin` into a non-tty session (0.162.1) | **CONFIRMED (0.162.1).** A live non-tty session (`exec_command {cmd:"sleep 2; sh"}`) then `write_stdin`: `write_stdin failed: stdin is closed for this session; rerun exec_command with tty=true to keep stdin open`; marker absent. Default config and tty off alike. |
| Forced `tty: true` with tty off (0.162.1) | **CONFIRMED (0.162.1).** `[features] unified_exec_tty = false` and a forced `exec_command {cmd:"sh", tty:true}`: output `TTY execution is disabled by config; omit tty or set it to false.` (codex quotes `tty` in backticks inside that message); marker absent (`gpt-5.5`, `gpt-5.6-terra`, `gpt-5.6-sol`). The hook still fired first (`Bash {"command":"sh"}`). |
| Launch flag `-c features.unified_exec_tty=false` (0.162.1) | **CONFIRMED (0.162.1).** `codex exec -c features.unified_exec_tty=false` with no config key: same refusal, `tty` absent from the schema. The flag also overrides a config `[features] unified_exec_tty = true`. |
| Hook payload with tty off (0.162.1) | **CONFIRMED (0.162.1).** Keys `session_id, turn_id, transcript_path, cwd, hook_event_name, model, permission_mode, tool_name, tool_input, tool_use_id`; `tool_name: "Bash"`, `tool_input: {"command": …}`. Identical to the committed codex hook fixture. |
| Project config and tty off (0.162.1) | **CONFIRMED (0.162.1).** User config `[features] unified_exec_tty = false`, a trusted `mktemp` repo whose `.codex/config.toml` sets `[features] unified_exec_tty = true`: `tty` back in the `exec_command` schema, and `exec_command {cmd:"sh", tty:true}` + `write_stdin` wrote the marker. The same with `-c features.unified_exec_tty=false`: `tty` absent, forced `tty: true` refused, marker absent. Control: a project `.codex/config.toml` with `shell_tool = false` removed `exec_command`, so the project layer is loaded. Real `~/.codex` untouched (`find -newer` = 0). |
| zsh equals expansion (0.162.1 shell) | **CONFIRMED (zsh 5.9).** With a stub `git` first on `PATH`, `zsh -c '=git push origin main'` ran git with `push origin main`; `=gi\t push` and `=G\it push` ran it too; bash 3.2 and dash print `command not found`. The guard now denies a command word that opens with `=`. |
| Handler key (0.162.1) | **CONFIRMED (0.162.1).** The binary's config schema strings name the handler key `timeout` (`type command commandWindows timeout async statusMessage`). |
| Hook payload and live denial (0.162.1) | **CONFIRMED (0.162.1).** The payload is Claude-shaped (`tool_name: "Bash"`, `tool_input.command`). A live exit-2 denial surfaced `Command blocked by PreToolUse hook: … Command: git -C . push origin main` and the command never ran. |
| Malformed rules, `execpolicy check` (0.162.1) | **CONFIRMED (0.162.1).** Last line `)` removed (a starlark parse error at line 15 of the file as deployed) → exit 1, a hard error. |
| Malformed rules, `codex exec` (0.162.1) | **CONFIRMED (0.162.1), fails closed.** 3/3 exit 1 at startup with `Error loading rules: <path>:15: starlark error: … Parse error`; zero JSONL events; `VICTIM.txt` survived. This is the binding's own launch path (`codex exec`). |
| Malformed rules, app-server thread/turn (0.162.1) | **CONFIRMED (0.162.1), fails open.** 3/3 a `configWarning` notification `{"summary":"Error parsing rules; custom rules not applied.", …}`, then `git clean -f` ran and `VICTIM.txt` was **deleted**. |
| Binary string (0.162.1) | **CONFIRMED (0.162.1).** `Error parsing rules; custom rules not applied.` still sits beside app-server code. |
| Interactive TUI rules path (0.162.1) | **CONFIRMED (0.162.1), 2026-10-21: fails open, through the app-server.** Attended: the operator drove `codex -a never -s workspace-write -C <target>` in a real terminal, with a throwaway `HOME`/`CODEX_HOME` (signed in there) and real `~/.codex` untouched (`find -newer` = 0). A stub `git` first on `PATH` logged the argv of `clean` and deleted nothing. The TUI starts a detached `codex app-server` daemon (parent pid 1, binary under `$CODEX_HOME/packages/app-server-daemon/`) and runs its turns through it. The daemon outlives the TUI, so it was killed between runs to keep each run independent. Malformed rules (committed file minus its last line): 3/3, the daemon's `app-server-daemon/daemon.stderr.log` holds `Error parsing rules; custom rules not applied.`, the screen shows nothing, and `/bin/zsh -lc 'git clean -f'` ran (exit 0, stub marker written). Control on 2026-10-22, committed rules: `exec_command failed: … Rejected(… destructive or history-rewriting git subcommands must never run unattended from this binding)`, no marker. |
| Integrity check against the probed malformed text (0.162.1) | **CONFIRMED (0.162.1)** (hermetic, no codex run). `assertRulesIntegrity(<craft.rules minus its last line>)` throws `integrity check failed`; against the committed file it returns `{ intact: true }`. Nothing in the binding calls it: kept on demand by decision (2026-10-16), because the binding launches nothing itself (operators run `codex exec`). |
| Empty rules file, `execpolicy check` (0.162.1) | **CONFIRMED (0.162.1), 2026-10-16.** Hermetic: `codex execpolicy check --rules <file> <git> push` with a throwaway `CODEX_HOME` that afterwards held only the probe's own output; no agent session. An empty file → exit 0, `{"matchedRules":[]}`: it parses cleanly and forbids nothing. Twice, same result. `assertRulesIntegrity('')` throws. |
| Comments-only rules file, `execpolicy check` (0.162.1) | **CONFIRMED (0.162.1), 2026-10-16.** Same method. `adapters/codex/craft.rules` truncated before `prefix_rule(`, so only the disclosure comment remains → exit 0, `{"matchedRules":[]}`: it parses cleanly and forbids nothing. Twice, same result. `assertRulesIntegrity` throws. Unlike the malformed variant, it raises no parse error for `codex exec` to refuse on; that `codex exec` then loads it silently is inferred from the parse result, not run. |
| Older deployed copy, `execpolicy check` (0.162.1) | **CONFIRMED (0.162.1), 2026-10-16.** Same method. The 2026-07-21 `craft.rules` (`06e1983`), whose rule body matches today's and whose disclosure comment differs → exit 0, `forbidden`, matchedPrefix `git push`, the same match as the committed file. `assertRulesIntegrity` throws on it: the check is byte-identical, so it refuses a copy whose enforcement is unchanged. |
| Copied rules file, load at startup (0.162.1) | **CONFIRMED (0.162.1), 2026-10-16: loaded.** Hermetic: a throwaway `CODEX_HOME` with no `auth.json`, so no session can reach a model; isolation proven by `find ~/.codex -newer <marker>` = 0 entries. Load detector: `craft.rules` minus its last line, so a loaded file stops `codex exec --skip-git-repo-check -s read-only -C <work> "say hi" < /dev/null` at startup, and a file that is not loaded lets it reach the model call (the session header, then `401 Unauthorized … wss://api.openai.com/v1/responses`, exit 1). A regular-file copy at `$CODEX_HOME/rules/craft.rules` → exit 1 at startup with `Error loading rules: <path>:16: starlark error … Parse error`, before any session. 3/3. |
| Symlinked rules file, load at startup (0.162.1) | **CONFIRMED (0.162.1), 2026-10-16: not loaded.** Same method. `$CODEX_HOME/rules/craft.rules` a symlink to the malformed file → no rules error; the session header, then `401 Unauthorized`, exit 1. 3/3, and 2/2 in an independent re-run: 5/5. The adapter README's deploy step copies the file for this reason. |
| Symlinked rules directory, load at startup (0.162.1) | **CONFIRMED (0.162.1), 2026-10-16: followed.** Same method. `$CODEX_HOME/rules` itself a symlink to a directory holding the malformed `craft.rules` → exit 1 at startup with `Error loading rules`. 3/3. |
| Non-`.rules` file in the rules directory (0.162.1) | **CONFIRMED (0.162.1), 2026-10-16: not parsed.** Same method. A well-formed `craft.rules` copy beside a malformed `NOTES.md` → no rules error; the session header, then `401 Unauthorized`. 2/2. Only `*.rules` files are parsed. |
| `cmp` and `execpolicy check` on a symlinked file (0.162.1) | **CONFIRMED (0.162.1), 2026-10-16: both follow the link.** File-level, one run each (`execpolicy check` is offline and deterministic). A symlink to the committed bytes: `cmp adapters/codex/craft.rules <link>` → exit 0; `codex execpolicy check --rules <link> <git> push` → exit 0, `"decision":"forbidden"`. Both pass on a layout codex does not load (the symlinked-file row above), so neither detects it. |
| `cmp` and `execpolicy check` on a copied and an absent file (0.162.1) | **CONFIRMED (0.162.1), 2026-10-16.** Same file-level method; flag form from `codex execpolicy check --help`: `--rules <PATH> <COMMAND>...`. Copied `craft.rules`: `cmp` → exit 0; `<git> push` → exit 0, `"decision":"forbidden"`, matchedPrefix `git push`; `<git> status` → exit 0, `{"matchedRules":[]}`. `execpolicy check` exits 0 on a match and on no match alike, so its verdict is on stdout. Absent file: `cmp` → exit 2, `No such file or directory`; `execpolicy check` → exit 1, `failed to read policy … No such file or directory`. |

The 2026-07-21 runtime fail-open verdict was planned as a `codex exec` run, but its only recorded
evidence is the binary string; on 0.162.1 it holds on the app-server path, the interactive TUI included, and is false on
`codex exec`, the binding's launch posture, where a malformed rules file now stops the whole run
loudly. Treat a malformed `.rules` file as fail open.

## Re-probe — codex-cli 0.163.0

Method: 2026-10-22. Throwaway `HOME`/`CODEX_HOME` homes made with `mktemp` (`<throwaway>`): one
for the skills probe, and one per case for the tool-list, `write_stdin` and payload probes. No
`auth.json` was copied into any of them, and no step needed auth. The rules-load probes reuse the
2026-10-16 load detector: with no credentials, codex either prints `Error loading rules:` and
exits, or reaches the session header and enters a reconnect loop. The tool-list, `write_stdin`,
payload and hook-trust probes drive the offline fake Responses provider.
`--dangerously-bypass-hook-trust` was used only for the tool-list, `write_stdin` and payload
probes, inside their throwaways, so that their dumping hook would fire; the hook-trust probes
never used it. Every block was verified by its ground-truth side effect, never by exit code.
Every row is pinned to 0.163.0; where an older section above records the same probe, both stay,
each pinned to its version.

Isolation: one breach, disclosed. `find ~/.codex -newer <marker>` returned 5 entries, all under
`~/.codex/tmp/arg0-macos/codex-arg0<random>/`: the directory, a `.lock`, and the `apply_patch`
and `applypatch` symlinks. The cause was reproduced: one `codex exec --help` call, used to read
the flag list, ran without the throwaway env, and run against an existing `CODEX_HOME`,
`codex exec --help` creates exactly that 5-entry shape. No config, auth, sqlite, session or log
file under `~/.codex` changed. Every other invocation was wrapped, and each throwaway grew its
own `tmp/arg0-macos` (8004 entries in the skills probe's throwaway). This is the failure the
*Open rows* method note warns about: wrap every invocation, bare `--help` included.

| Probe | Result |
|---|---|
| Identity (0.163.0) | **CONFIRMED (0.163.0).** `codex --version` = `codex-cli 0.163.0`; npm `@openai/codex` 0.163.0, platform package `0.163.0-darwin-arm64`; vendored binary at `…/@openai/codex/node_modules/@openai/codex-darwin-arm64/vendor/aarch64-apple-darwin/bin/codex`, the same layout as before. |
| `craft` entry, committed marketplace (0.163.0) | **CONFIRMED (0.163.0): absent by a repo change, not by codex.** `codex plugin add craft@craft-codex-marketplace` → ``Error: plugin `craft` was not found in marketplace `craft-codex-marketplace` ``. The committed marketplace declares `craft-codex` only since the `craft` entry was retired on 2026-10-18. |
| Rebuilt `craft` entry (0.163.0) | **CONFIRMED (0.163.0).** The throwaway holds a copy of `adapters/codex` and `skills/`, with `marketplace.json` and `plugins/craft/plugin.json` (`"skills": "../../../../skills"`) restored byte-for-byte from `eab55ee^`, the re-measure route the retirement decision names; none of it ships. `codex plugin marketplace add ./adapters/codex`, then `plugin add` for `craft-codex@craft-codex-marketplace` and `craft@craft-codex-marketplace`: both succeed. |
| Cached manifests (0.163.0) | **CONFIRMED (0.163.0), unchanged.** The cached `.codex-plugin/plugin.json` of **both** entries is `{description, name}`: `skills` and `hooks` dropped. |
| Skills by reference (0.163.0) | **DISPROVEN (0.163.0).** App-server `skills/list` with `{"cwds":[<repo copy>],"forceReload":true}`, 3/3: 6 in total, **0 of 20** shared (`craft-codex:craft-run` at scope `user`, plus 5 system skills). The shared set is 20 since `skills/lessons` landed; the older sections measured 19. |
| Symlink fallback (0.163.0) | **CONFIRMED (0.163.0).** `ln -s <worktree>/skills/<name> $CODEX_HOME/skills/<name>` ×20, `skills/list` 3/3: 26 in total, **20 of 20** shared, registered `craft:<name>` at scope `user`, paths resolving into the repo (e.g. `…/skills/lessons/SKILL.md`). Four versions (0.144.6, 0.145.0, 0.162.1, 0.163.0) measured the same result; by-reference loading is closed as a standing codex limitation, and a re-measure, if ever wanted, uses the throwaway entry above. |
| `forceReload` (0.163.0) | **CONFIRMED (0.163.0), schema only.** Present in the schema `codex app-server generate-json-schema` emits. |
| Malformed rules, `codex exec` (0.163.0) | **CONFIRMED (0.163.0): fails closed, unchanged.** `craft.rules` minus its last line `)` placed in `$CODEX_HOME/rules/`; `codex exec --skip-git-repo-check -s read-only -C <work> "say hi" < /dev/null`, 3/3: exit 1 at startup, `Error loading rules:` / `<path>:17: starlark error: … Parse error: unexpected new line, expected expression`, no session header. Control (the committed copy): no rules error, session header reached. |
| Symlinked rules file (0.163.0) | **CONFIRMED (0.163.0): not loaded, unchanged.** `$CODEX_HOME/rules/craft.rules` a symlink to the malformed copy, 3/3: no rules error, session header reached. |
| Tool list, default config (0.163.0) | **CONFIRMED (0.163.0), unchanged.** Identical to the 0.162.1 row: `exec_command(cmd\|justification\|login\|max_output_tokens\|prefix_rule\|sandbox_permissions\|shell\|tty\|workdir\|yield_time_ms)`, `write_stdin(chars\|max_output_tokens\|session_id\|yield_time_ms)`, `request_user_input`, `apply_patch`, `view_image`, `get_goal`, `create_goal`, `update_goal`, `tool_search`, `web_search`. |
| `write_stdin`, default config (0.163.0) | **CONFIRMED (0.163.0): unguarded, unchanged.** `exec_command {cmd:"sh", tty:true}`, then `write_stdin` sends `echo WS_MARKER > ws_marker.txt\nexit\n`: the marker is **present**. The hook fired once (`Bash {"command":"sh"}`) and not at all for `write_stdin`. |
| `[features] unified_exec_tty = false` (0.163.0) | **CONFIRMED (0.163.0): closed, unchanged.** 3/3: `tty` is absent from the `exec_command` schema; a forced `tty:true` → ``TTY execution is disabled by config; omit `tty` or set it to false.``; marker absent; the hook fired first. The `-c features.unified_exec_tty=false` launch flag was not re-probed. |
| Non-tty session (0.163.0) | **CONFIRMED (0.163.0).** `exec_command {cmd:"sleep 2; sh", yield_time_ms:500}`, then `write_stdin` → `stdin is closed for this session; rerun exec_command with tty=true to keep stdin open`, marker absent. Same result with tty off and with the default config. |
| Hook payload keys (0.163.0) | **CONFIRMED (0.163.0): key set unchanged.** `cwd, hook_event_name, model, permission_mode, session_id, tool_input, tool_name, tool_use_id, transcript_path, turn_id`, the same set as `adapters/codex/test/fixtures/pre-tool-use-bash.json`; `tool_name` is `Bash` and `tool_input` is `{command}`. Values were not compared, so the fixture stays the 0.162.1 capture. |
| Untrusted hook (0.163.0) | **CONFIRMED (0.163.0), fail-open reproduced.** The template `[[hooks.PreToolUse]]` block verbatim, `CRAFT_ROOT=<worktree>`, no bypass flag; `trust-hook.js --check` → exit 1, `from=untrusted`. The fake model asks for `git diff > OUT.txt`, 3/3: `OUT.txt` **present** (83 B), zero hook items, 2 `command_execution` items. |
| Trusted control (0.163.0) | **CONFIRMED (0.163.0): denied.** `trust-hook.js` → exit 0, `from=untrusted hash=sha256:38713365…` (the 0.161.0 and 0.162.1 hash). The same turn → `OUT.txt` absent, zero `command_execution` items, `blocked by PreToolUse hook: craft-guard: git diff/show must carry --no-ext-diff …`. Idempotence and ALLOW were not re-run. |

**Not re-probed** (they need auth or an attended session), so they keep their 0.162.1 pins: the
app-server and TUI malformed-rules fail-open, the hook timeout and default-timeout rows, the
`-c features.unified_exec_tty=false` launch flag, the project-config override, trust `--check`
idempotence and ALLOW, the `execpolicy check` and `cmp` rows, the `unified_exec` and
`shell_tool` switches, the tool shell, and the heredoc idiom.
