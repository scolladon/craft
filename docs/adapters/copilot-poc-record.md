# Copilot PoC — on-demand smoke evidence record

> The deterministic adapter seams (the deny-tool launch-argv builder, the git-guard event
> adapter and predicate composition, the model-tier map, the probe's structural assertions, the
> config-template contract) are CI-proven by the unit tests in `adapters/copilot/test/`. This
> document records the on-demand **runtime** probe evidence — facts pinned against a live
> `copilot` binary. It is refreshed by re-running the probe.

> **Not CI-gated.** The live Copilot probe is on-demand only. The entry point is
> `runAcceptanceProbe`, exported from `adapters/copilot/src/probe.js`; it requires an injected
> `copilotRunner` that shells out to a real `copilot` binary and `fsOps` that provisions a
> throwaway working directory.

## Probe method

State-changing probes ran in `mktemp -d` throwaways with isolated `HOME`, `XDG_CONFIG_HOME`, and
`COPILOT_HOME` — no probe touched the real repository checkout or the operator's own Copilot
configuration. macOS has no `timeout`/`gtimeout`, so every run was capped with a background
watchdog (`( sleep N; kill -9 $PID )`) and all captures were truncated to bound the wait.

The decisive enabler: `COPILOT_PROVIDER_BASE_URL` (BYOK) bypasses the platform's own
authentication entirely. A local fake OpenAI-compatible SSE provider therefore drove real tool
calls end-to-end with **zero credentials used, zero AI credits consumed, and no network access**
— which is how the tool-call, hook, and containment rows below are CONFIRMED rather than
deferred. The fake provider must emit SSE chunks; a plain JSON response body fails the stream
with a finalization error.

## Verdict

**Mechanism-level probe: CONFIRMED** (2026-07-20). The 20 rows below were pinned live against
`copilot` 1.0.63 using the BYOK fake-provider method above. An end-to-end craft construction
phase driven against a real, authenticated Copilot seat has **not** run — that remains on-demand
(D2 below), consistent with the fact that it consumes paid quota and must never be CI-gated.

## CONFIRMED

| # | Dimension | Pinned result |
|---|---|---|
| 1 | Target binary | Standalone `copilot`, installed via a Homebrew **cask** (`copilot-cli`). The binary self-reports `Copilot CLI 1.0.63` while the Caskroom path reads `1.0.17` — it self-updates in place, so the cask version is *not* the running version. Trap: Homebrew's own **formula** named `copilot` is an unrelated Amazon ECS/Fargate tool. |
| 2 | GitHub CLI extension | A separate installable product from the standalone binary. Not installed on the probe machine and not probed further, to avoid altering the operator's real GitHub CLI configuration. |
| 3 | Headless mode | Yes. `-p/--prompt <text>` executes one turn and exits. `--allow-all-tools` is required for non-interactive use (env equivalent available). `-s/--silent` emits only the agent response. The exit code propagates (`rc=0` on success). |
| 4 | Machine-readable output | `--output-format json` emits JSONL, one object per line. Envelope: `{ type, data, id, timestamp, parentId, ephemeral? }`. |
| 5 | Event types (17, live-captured) | Session lifecycle (`session.mcp_servers_loaded`, `session.skills_loaded`, `session.tools_updated`, `session.background_tasks_changed`, `session.info`, `session.error`), turn/message events, tool-execution events, and a terminal `result` event. |
| 6 | Tool-call event shape | The tool-execution-start event carries `{ toolCallId, toolName, arguments, model, turnId }` with `arguments` as a **parsed object**. The completion event carries `{ toolCallId, model, interactionId, turnId, success, result: { content, detailedContent }, toolTelemetry }`. |
| 7 | Tool names + executed field | All lowercase. `bash`→`command`; `create`→`path` + `file_text`; `edit`→`path` + `old_str`/`new_str`; `view`→`path`. Also `glob`, `grep`, `task`, `skill`, `web_fetch`, `list_agents`, `read_agent`, and others. **There is no `file_path` field anywhere in Copilot's tool schemas.** |
| 8 | Token/usage reporting | Absent from `--output-format json` — the terminal `result` event's `usage` field carries request/duration/code-change counts, never token counts, even when the underlying provider returned them. Tokens live in the OTel file exporter (an env var auto-enables it and points at the output path). |
| 8a | OTel file structure | Mixed: OTLP **span** records (`{ name, kind, attributes, endTime, events, instrumentationScope, parentSpanId, resource }`) **and metric** records (no `kind`, no `instrumentationScope`). A parser must discriminate structurally, not by `name` alone, since span and metric names overlap in the same namespace. |
| 8b | Span inventory + token carriers | A `chat <model>` span exists per LLM call and carries the token-count attributes plus the request model id and a conversation id. An `invoke_agent` span carries the **same attribute names** but with **rolled-up sums** of its child `chat` spans (live-observed: one total exactly double a single child's value). An `execute_tool <toolName>` span records tool execution. Metric records separately report the same token usage, operation duration, and per-tool call counts. |
| 8c | Double-counting hazard | The same tokens appear **three times**: on leaf `chat` spans, summed again on the parent `invoke_agent` span, and again in the token-usage metric record. A parser that ingests every token-bearing record inflates cost roughly 3x. |
| 9 | Session persistence | A per-session state directory plus a local SQLite store recording sessions, turns, and trajectory events. **No token columns in any table** — the local database is not a usable telemetry source for cost. |
| 10 | Extensibility surface | Plugins extend the CLI with skills, agents, hooks, MCP servers, and LSP servers. Skills are `SKILL.md` with YAML frontmatter `name` + `description` — the same shape as craft's Claude skills. `--plugin-dir <dir>` loads a plugin from a local directory (repeatable, no install step). Built-in skills report `source: "builtin"`; plugin-loaded skills report `source: "plugin"`. A session-startup event enumerates every loaded skill with `{ name, description, source, userInvocable, enabled, path }` — a directly assertable native-surface seam. |
| 11 | Tool-call hook — exists, observational | A pre-tool-use hook **fires** when declared in the user-level config file. Payload on **stdin**: `{ sessionId, timestamp, cwd, toolName, toolArgs }` where **`toolArgs` is a JSON-encoded string, not an object**. **Deny was NOT achieved**: neither a `{"permission":"deny"}` response on stdout nor a non-zero exit blocked the tool — a destructive git command executed either way. The repo-level hooks directory (under the platform's own dotfolder) did **not** fire in the probe. |
| 12 | Enforcement that does work | A `--deny-tool` pattern (e.g. targeting `git push`) **blocks**: the tool-completion event returns `success=false`, `result=null`, and no downstream output at all. Denial rules take precedence over allow rules, **even `--allow-all-tools`**. Pattern kinds: shell-command patterns, a bare `write` pattern, MCP-server-scoped patterns, and URL-domain patterns. |
| 13 | Path containment — native | An out-of-tree `create` was **blocked** (`success=false`, target file absent) with only `--allow-all-tools` and **no** path-containment override flag. Copilot performs path verification against an allowed-directory list by default; one flag extends it, another disables it entirely. This is a native analog of craft's containment guard. |
| 14 | Execution topology | Subagent fan-out — like the opencode binding, not the role-less Pi binding. A `task` tool dispatches `{ name, prompt, agent_type, description, model?, reasoning_effort?, context_tier?, mode? }` with `mode` of `"background"` or `"sync"`; plus discovery tools to list and read configured agents. Per-subagent config sets `model`/`effortLevel`/`contextTier` (each may be `"inherit"`). A fleet mode enables parallel subagent execution. |
| 15 | Model selection | `--model <model>` (or the `auto` sentinel), with a matching environment variable. Reasoning effort: an `--effort`/`--reasoning-effort` flag with values from `none` up through `max`. Context tier: a `--context` flag with `default`/`long_context` values. BYOK via provider-scoped environment variables. |
| 16 | Config scope + context files | A home-directory override environment variable controls the config/state directory. Global user-level config; repo-level settings; MCP config resolves from a user-level file, a repo-root `.mcp.json`, or a repo-level platform-specific config path. Auto-read instructions include `AGENTS.md` and related files, plus a generated repo-level instructions file (created by an init command). A flag disables loading custom instructions; an environment variable adds extra search directories. A config flag can kill all hooks at once (repo- and user-level). |
| 17 | Auth | Required for platform-routed models: a small set of token environment variables, an interactive login command, or authenticating through the platform's own CLI. Without it: an authentication error surfaces **before** hooks/skills load. |
| 18 | Logging | A log-directory flag (with a default under the config directory) and a log-level flag spanning `none` through `all`. Debug logs contain the **full model request payload**, including every tool definition — the source used to pin row 7. |
| 19 | Skill user-invocability | **Resolved CONFIRMED** (superseding an earlier unverified status): a probe against `copilot` 1.0.63, loaded with a repo-root plugin directory, emitted a session-startup event listing **all 19 shared craft skills**, each `source: "plugin"` and **`userInvocable: true`**. The entrypoint is therefore the shared skill's own frontmatter name (`run`), directly invocable via the `skill` tool as `{ skill: "run" }`; `commands/craft-run.md` is the adapter-local command deferring to it. |
| 20 | `--deny-tool` matcher semantics | **PREFIX matching on the command string** — it does not parse argv. Pinned against `copilot` 1.0.63: `git push` and `git push --force origin main` are both **BLOCKED** by `shell(git push)`. `git -C . push` and `git clean -df` **EXECUTE (bypass)** against `shell(git push)` / `shell(git clean -fd)` respectively — an interposed global option or reordered flag defeats a literal prefix. Wildcard behaviour: `shell(git:*)` blocks **all** git (rejected as a fix — it would break craft's own git-heavy workflow); `shell(git *push*)`, `shell(*push*)`, and `shell(git)` do **not** match anything and all executed. |

## DEFERRED

| # | Dimension | Why deferred |
|---|---|---|
| D1 | Real available model ids | Requires an authenticated Copilot seat; the model catalog is served, not static. Deliberately not invented — the tier map ships the `auto` sentinel until a smoke pins real ids. |
| D2 | End-to-end craft phase on real Copilot models | Consumes paid quota. Recorded as an on-demand smoke, never CI-gated. |
| D3 | OTel record shape from a real provider run | Attribute *names* are pinned (row 8); the exact span/metric envelope under a real, platform-routed model run needs one authenticated run to confirm. |
| D4 | Repo-level hooks-directory activation | Did not fire in the probe (row 11). May require repo trust/approval or a different filename/schema than what was tried. The user-level hook is confirmed and sufficient in its place. |
| D5 | Any undocumented deny schema for the pre-tool-use hook | Two plausible shapes were tested and rejected (row 11). The absence of a *working* deny is the honest finding; a future schema would be additive, not load-bearing for this design. |
| D7 | `invoke_agent` → craft `role` attribution | The roll-up span exists (row 8b), but no probe produced a real subagent fan-out — the fake provider drove a single agent. Which attribute names the subagent identity under a real `task` call is unpinned, so `role` ships as `null` until a smoke confirms it. |

## Reproduction notes

- install `copilot` and confirm the self-reported version with its own version flag (the cask
  path is not authoritative — the binary self-updates);
- provision a throwaway `mktemp -d` with isolated `HOME`, `XDG_CONFIG_HOME`, and `COPILOT_HOME`;
- point a local fake SSE-emitting OpenAI-compatible provider at the BYOK base-url environment
  variable — no platform credentials, no AI credits, no network egress required;
- cap the run with a background watchdog (macOS has neither `timeout` nor `gtimeout` by default);
- invoke `runAcceptanceProbe` from `adapters/copilot/src/probe.js` with a `copilotRunner` that
  spawns `copilot` using the launch argv from `buildLaunchArgs` (`adapters/copilot/src/
  deny-tool-args.js`) and builds the run-trace from post-run inspection of the throwaway;
- to advance D1–D5/D7, repeat the probe against an authenticated Copilot seat and refresh the
  affected rows above with the observed values.
