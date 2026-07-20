# Design — GitHub Copilot CLI adapter (fourth Execution-port binding)

> Brief: add a native GitHub Copilot CLI binding under `adapters/copilot/`, driven by the same engine core under the same engine-owned invariant contract, expanding the binding set to `{ claude, pi, opencode, copilot }` without forking the engine.
> Status: draft → self-reviewed ×3 → accepted → decisions folded (ADR-240…250)

## Context

craft has three Execution-port bindings today, all natively packaged:

| Binding | Home | Topology | Precedent ADRs |
|---|---|---|---|
| claude | repo root itself (`skills/`, `agents/`, `.claude-plugin/`, `hooks/`) | subagent fan-out | reference binding |
| opencode | `adapters/opencode/` | subagent-capable (`agents/`, `commands/`, `plugins/git-guard.ts`) | 215–228 |
| pi | `adapters/pi/` | role-less / sequential, no subagents (`prompts/`, `extensions/craft-guard/`) | 229–239 |

There is **no** `adapters/claude/` directory — the Claude binding is the repo root. This design adds a
fourth sibling under `adapters/copilot/`.

Constraints this design inherits:

- **ADR-085** — adapters live in-place under `adapters/<binding>/`, not as published packages.
- **R-G2 single-sourcing** — phase procedures are single-sourced from the shared craft skill bodies and
  never re-authored. opencode holds this by re-expressing only per-binding *frontmatter* on
  `agents/craft-*.md` while the *body* is the shared craft agent body verbatim.
- **Contract carve-outs** — `engine/src/contract.js` expands `@@ARTIFACT_HANDOFF@@` / `@@MODEL_RESOLUTION@@`
  through `AGENT_VARIANTS` / `INLINE_VARIANTS`. `engine/test/contract-equivalence.test.js` asserts that
  agent vs inline assembly differ on **exactly two** lines, and ADR-220/239 set the precedent that a new
  binding reuses the existing variant sets rather than adding a third.
- **Telemetry port** (`docs/adapters/telemetry.md`, `subjects: ['engine/src/observability/**']`) —
  `collect(opts, deps) → UsageEvent[]`; the adapter owns every runtime specific, never receives an
  absolute path, and never throws (partial data returns a partial array). `aggregate` /
  `serializeReport` are reused unchanged.
- **Reusable seams** — `adapters/pi/src/gate.js` is the binding-neutral guard predicate and is reused
  verbatim; only the event adapter is re-expressed per binding.

## Requirements

1. The engine is untouched except the additive `engine/src/observability/adapters/copilot/telemetry.js`
   sibling and generic `SOURCES` / `DEFAULT_READ_ROOTS` entries in
   `engine/src/observability/usage-mine-main.js`.
2. The invariant block under the Copilot binding differs from Claude's by **at most the two carve-out
   lines**, asserted in `engine/test/contract-equivalence.test.js`.
3. Port `Binding set` lines stay **honest per port**. **Correction to the brief's success criterion**:
   the binding sets are *not* uniform today, so "every port doc reads `{ claude, pi, opencode, copilot }`"
   is not achievable without lying about ports Copilot does not bind. The scope settled by **ADR-249**,
   verified against the tree:

   | Port doc | Current set | After this change |
   |---|---|---|
   | `execution.md` | `{ claude, pi, opencode }` | `{ claude, pi, opencode, copilot }` |
   | `model.md` | `{ claude, pi, opencode }` | `{ claude, pi, opencode, copilot }` (tier map) |
   | `telemetry.md` | `{ claude, pi, opencode }` | `{ claude, pi, opencode, copilot }` (`collect`) |
   | `gate.md` | `{ claude, pi }` | `{ claude, pi, opencode, copilot }` (ADR-249) |
   | `memory.md`, `vcs.md`, `policy.md` | `{ claude, pi }` | **unchanged** — this change binds none of them |

   `backlog.md` and `intention.md` carry **no** `Binding set` line at all and are out of scope.

   `gate.md`'s listing criterion is now explicit: **a binding is listed when it ships a guard binding**,
   regardless of enforcement strength. That resolves the pre-existing asymmetry — opencode ships
   `adapters/opencode/plugins/git-guard.ts` yet was absent from the set. Two consequences bind this
   design:

   - Because the set no longer conveys strength, **each per-binding section in `gate.md` must state its
     own enforcement profile** — including Copilot's advisory ext-diff carve-out (ADR-243).
   - **Scope grows by one doc surface not in the original brief**: `gate.md` has `Claude binding` and
     `Pi binding` sections but **no opencode section**. This change authors it, documenting
     `adapters/opencode/plugins/git-guard.ts`.
4. Phase procedures are single-sourced from the shared craft skill bodies (R-G2); only per-binding
   frontmatter is re-expressed.
5. The git-guard reuses `gate.js`'s predicate verbatim; only the event adapter is re-expressed, bound
   to `toolName` (lowercase) and the field each tool **executes on** (`command` / `path`).
6. Deterministic seams are green in `scripts/ci.sh`, with the new suite registered in `scripts/ci.sh`
   and `test/every-test-file-registers.test.js`.
7. One on-demand live smoke recorded in `docs/adapters/copilot-poc-record.md`, or an explicit
   DEFERRED row where auth/quota makes it impossible.

## Design

### Pinned external contract (empirical)

**Everything below was pinned against the live binary on 2026-07-20.** Nothing here is from prior
knowledge of Copilot CLI.

#### Probe method

State-mutating probes ran in `mktemp -d` throwaways with isolated `HOME`, `XDG_CONFIG_HOME`, and
`COPILOT_HOME`. macOS has no `timeout`/`gtimeout`, so every run was capped with a background
watchdog (`( sleep N; kill -9 $PID )`) and all captures truncated.

The decisive enabler: **`COPILOT_PROVIDER_BASE_URL` (BYOK) bypasses GitHub authentication entirely**
("GitHub authentication is not required"). A local fake OpenAI-compatible SSE provider therefore drove
real tool calls end-to-end with **zero credentials used, zero AI credits consumed, and no network
access** — which is how the tool-call, hook, and containment rows below are CONFIRMED rather than
deferred. The provider must emit **SSE chunks**; a plain JSON body fails with
`Failed to finalize chat-completions stream: request ended without sending any chunks`.

#### CONFIRMED via live probe

| # | Dimension | Pinned result |
|---|---|---|
| 1 | Target binary | Standalone `copilot` at `/opt/homebrew/bin/copilot` → Homebrew **cask** `copilot-cli`. Binary self-reports **`GitHub Copilot CLI 1.0.63`** while the Caskroom path is `1.0.17` — it self-updates in place, so the cask version is *not* the running version. Trap: the Homebrew **formula** named `copilot` is AWS ECS's tool ("CLI tool for Amazon ECS and AWS Fargate") — a different product entirely. |
| 2 | `gh copilot` extension | **Not installed**; `gh extension list` empty on `gh` 2.96.0. A separate product from the standalone CLI; not probed further (installing it would mutate the user's real gh config). |
| 3 | Headless mode | **Yes.** `-p/--prompt <text>` executes one turn and exits. `--allow-all-tools` is **required** for non-interactive (env `COPILOT_ALLOW_ALL`). `-s/--silent` emits only the agent response. Exit code propagates (`rc=0` on success). |
| 4 | Machine-readable output | `--output-format json` → **JSONL, one object per line**. Envelope: `{ type, data, id, timestamp, parentId, ephemeral? }`. |
| 5 | Event types (17, live-captured) | `session.mcp_servers_loaded`, `session.skills_loaded`, `session.tools_updated`, `user.message`, `assistant.turn_start`, `assistant.message_start`, `assistant.message_delta`, `assistant.message`, `tool.execution_start`, `tool.execution_partial_result`, `tool.execution_complete`, `session.background_tasks_changed`, `assistant.turn_end`, `session.info`, `session.error`, `model.call_failure`, `result`. |
| 6 | Tool-call event shape | `tool.execution_start.data` = `{ toolCallId, toolName, arguments, model, turnId }` — `arguments` is a **parsed object**. `tool.execution_complete.data` = `{ toolCallId, model, interactionId, turnId, success, result: { content, detailedContent }, toolTelemetry: { properties, metrics } }`. |
| 7 | Tool names + executed field | **All lowercase.** `bash`→`command`; `create`→`path` + `file_text`; `edit`→`path` + `old_str`/`new_str`; `view`→`path`. Also `glob`, `grep`, `task`, `skill`, `web_fetch`, `session_store_sql`, `sql`, `report_intent`, `list_bash`/`read_bash`/`stop_bash`, `list_agents`, `read_agent`, `fetch_copilot_cli_documentation`. **There is no `file_path` field anywhere in Copilot's tool schemas.** |
| 8 | Token/usage reporting | **Absent from `--output-format json`.** `result` = `{ type, timestamp, sessionId, exitCode, usage }` where `usage` = `{ premiumRequests, totalApiDurationMs, sessionDurationMs, codeChanges: { linesAdded, linesRemoved, filesModified } }` — no token counts, even when the provider returned them. Tokens live in **OTel**: `COPILOT_OTEL_FILE_EXPORTER_PATH=<path>` auto-enables OTel and writes JSON-lines. Attributes follow OTel GenAI Semantic Conventions. |
| 8a | OTel file structure | The file is **mixed**: OTLP **span** records (`{ name, kind, attributes, endTime, events, instrumentationScope: {name:"github.copilot"}, parentSpanId, resource }`) **and metric** records (`{ name, … }` with **no** `kind` and **no** `instrumentationScope`). A parser must discriminate on `kind`/`instrumentationScope`, not on `name` alone. |
| 8b | Span inventory + token carriers | `chat <model>` — one per LLM call, carries `gen_ai.usage.input_tokens` / `gen_ai.usage.output_tokens`, `gen_ai.request.model`, `gen_ai.conversation.id`. `invoke_agent` — carries the **same attribute names** but with **rolled-up sums** of its child `chat` spans (live-observed: `2468 = 2 × 1234`, `112 = 2 × 56`). `execute_tool <toolName>` — `gen_ai.operation.name: "execute_tool"`, `gen_ai.tool.name`. Metric records: `gen_ai.client.token.usage`, `gen_ai.client.operation.duration`, `github.copilot.tool.call.count`, `github.copilot.tool.call.duration`, `github.copilot.agent.turn.count`. |
| 8c | **Double-counting hazard** | The same tokens appear **three times**: on leaf `chat` spans, summed again on the parent `invoke_agent` span, and again in the `gen_ai.client.token.usage` metric. A parser that ingests every token-bearing record inflates cost ~3×. |
| 9 | Session persistence | `$COPILOT_HOME/session-state/<uuid>` (default `~/.copilot`), plus `session-store.db` (SQLite). Tables: `sessions(id, cwd, repository, host_type, branch, summary, created_at, updated_at)`, `turns(id, session_id, turn_index, user_message, assistant_response, timestamp)`, `forge_trajectory_events(session_id, tool_call_id, turn_index, event_type, command, output, exit_code, event_key, event_value, created_at)`, `checkpoints`. **No token columns in any table** — the DB is not a usable telemetry source for cost. |
| 10 | Extensibility surface | **Plugins** extend the CLI with "skills, agents, hooks, MCP servers, and LSP servers". Skills are `SKILL.md` with YAML frontmatter `name` + `description` — **the same shape as craft's Claude skills**. Layout: `~/.copilot/skills/<name>/SKILL.md`; plugins at `~/.copilot/installed-plugins/<repo>/<plugin>/{skills/,agents/}`. `--plugin-dir <dir>` loads a plugin from a local directory (repeatable). `copilot plugin install owner/repo:path` installs from a repo subdirectory. Built-in skills report `source: "builtin"`; a `session.skills_loaded` event enumerates every loaded skill with `{ name, description, source, userInvocable, enabled, path }` — a directly assertable native-surface seam. At design time only `userInvocable: false` had been observed (one builtin skill). **Later resolved CONFIRMED**: a repo-root plugin dir emits all 19 shared craft skills with `source: "plugin"` and **`userInvocable: true`** — see the PoC record. |
| 11 | Tool-call hook — exists, **observational** | `preToolUse` hooks **fire** when declared in `$COPILOT_HOME/config.json` under `hooks.preToolUse`. Payload on **stdin**: `{"sessionId","timestamp","cwd","toolName","toolArgs"}` where **`toolArgs` is a JSON-encoded string, not an object**. Pipeline processors `PreToolUseHooksProcessor` / `PostToolUseHooksProcessor` confirmed in the request payload. **Deny was NOT achieved**: neither `{"permission":"deny","reason":…}` on stdout nor `exit 2` blocked the tool — `git push --force` executed in both cases. Repo-level `.github/hooks/*.json` did **not** fire in the probe. |
| 12 | Enforcement that **does** work | `--deny-tool='shell(git push)'` **blocks**: `tool.execution_complete` returns `success=false`, `result=null`, and no git output at all (vs. the unguarded run which reached git's own error). Docs: "Denial rules always take precedence over allow rules, **even `--allow-all-tools`**." Pattern kinds: `shell(cmd:*)`, `write`, `<mcp-server>(tool)`, `url(domain)`. |
| 13 | Path containment — **native** | An out-of-tree `create` was **blocked** (`success=false`, target file absent) with only `--allow-all-tools` and **no** `--allow-all-paths`. Copilot performs path verification against the allowed-directory list by default; `--add-dir` extends it, `--allow-all-paths` disables it. This is a native analog of craft's containment guard. |
| 14 | Execution topology | **Subagent fan-out — like opencode, not pi.** `task` tool: `{ name, prompt, agent_type, description, model?, reasoning_effort?, context_tier?, mode? }` with `mode: "background"｜"sync"`; plus `list_agents`, `read_agent`. Config `subagents.agents.<agent-name>` sets per-subagent `model`/`effortLevel`/`contextTier` (each may be `"inherit"`). `--agent <agent>` selects a custom agent; `customAgents.defaultLocalOnly` config; `/fleet` enables parallel subagent execution; built-in `rubberDuck` subagent. |
| 15 | Model selection | `--model <model>` (or `auto`), env `COPILOT_MODEL`. Reasoning effort: `--effort/--reasoning-effort` ∈ `none｜low｜medium｜high｜xhigh｜max`. Context tier: `--context` ∈ `default｜long_context`. BYOK via `COPILOT_PROVIDER_*`. |
| 16 | Config scope + context files | `COPILOT_HOME` overrides the config/state dir (default `$HOME/.copilot`). Global `config.json`; repo `settings.json`; MCP from `~/.copilot/mcp-config.json`, `.mcp.json`, `.github/mcp.json`. Auto-read instructions: `AGENTS.md` **and related files**; `.github/copilot-instructions.md` (generated by `copilot init`). `--no-custom-instructions` disables loading them; `COPILOT_CUSTOM_INSTRUCTIONS_DIRS` adds search dirs. `disableAllHooks` config kills repo- and user-level hooks. |
| 17 | Auth | Required for GitHub-routed models: `COPILOT_GITHUB_TOKEN` / `GH_TOKEN` / `GITHUB_TOKEN`, `/login`, or `gh auth login`. Without it: `Error: No authentication information found` **before** hooks/skills load. The user's `gh` is authenticated, and `~/.copilot` is populated (real skills, plugins, 55 sessions) — so a live smoke is plausible, but it consumes a Copilot seat's credits and was deliberately **not** run. |
| 18 | Logging | `--log-dir` (default `~/.copilot/logs/`), `--log-level` ∈ `none｜error｜warning｜info｜debug｜all｜default`. Debug logs contain the **full model request payload**, including every tool definition — the source used to pin row 7. |

#### DEFERRED to the on-demand live smoke

| # | Dimension | Why deferred |
|---|---|---|
| D1 | Real available model ids | Requires an authenticated Copilot seat; the model catalog is served, not static. Docs example shows `--model gpt-5.2`. Deliberately not invented — the tier map ships with the ids the smoke pins. |
| D2 | End-to-end craft phase on real Copilot models | Consumes paid quota (`premiumRequests`). Recorded as an on-demand smoke, never CI-gated. |
| D3 | OTel record shape from a **real** provider run | Attribute *names* are pinned (row 8); exact span/metric envelope under GitHub-routed models needs one authenticated run. |
| D4 | Repo-level `.github/hooks/*.json` activation | Did not fire in the probe. May require repo trust/approval or a different filename/schema. User-level `config.json` hooks are confirmed and sufficient. |
| D5 | Any undocumented `preToolUse` deny schema | Two plausible shapes tested and rejected (row 11). Absence of a *working* deny is the honest finding; a future schema would be additive, not load-bearing for this design. |
| D6 | Whether a skill can declare `userInvocable: true` | Only `false` observed, on a builtin. Decides whether the `/craft-run` entrypoint is a user-invocable skill or must fall back to `copilot -p "/craft-run …"`. Both paths work headlessly, so this is an ergonomics question, not a blocker. |
| D7 | `invoke_agent` → craft `role` attribution | The roll-up span exists, but no probe produced a real subagent fan-out (the fake provider drove a single agent). Which attribute names the subagent identity under a real `task` call is unpinned — `role` ships as `null` until the smoke confirms it. |

### Topology decision drives the shape

Row 14 pins Copilot as **subagent-capable**. `adapters/copilot/` therefore mirrors
`adapters/opencode/` (agents + commands + a guard binding), **not** `adapters/pi/` (role-less prompts).
No subagent model is fabricated — `task`/`list_agents`/`subagents.agents.<name>` are live-confirmed.

### Layout

```
adapters/copilot/
  package.json
  README.md
  config.template.json          # $COPILOT_HOME/config.json fragment: hooks + subagents
  agents/craft-*.md             # 9 agents; craft body verbatim, Copilot frontmatter
                                # (no skills/ dir — shared craft skills load by reference)
  commands/craft-run.md         # /craft:* entrypoint analog
  hooks/craft-observer.js       # preToolUse observer (audit, NOT enforcement)
  src/craft-root.js             # CRAFT_ROOT resolver
  src/model-tier-map.js         # tier → real ids (pinned by D1)
  src/git-guard-adapter.js      # Copilot event → gate.js predicate shape
  src/deny-tool-args.js         # the enforcing --deny-tool pattern set
  src/probe.js                  # runAcceptanceProbe
  test/*.test.js
```

### Native surface (single-sourced)

Copilot's first-class discoverable + single-sourceable mechanism is the **plugin**, carrying `skills/`
and `agents/`. Its `SKILL.md` + YAML frontmatter (`name`, `description`) is shape-identical to craft's
Claude skills. **Skills are therefore not copied at all**: a repo-root plugin dir loads the shared
`skills/` tree by reference, so drift is structurally impossible rather than test-enforced — the
strongest form of the R-G2 discipline, and the same mechanism pi uses. Only **agents** are
adapter-local, with bodies byte-identical to the shared craft agent bodies and only frontmatter
re-expressed — exactly the discipline opencode holds.

Loading is two repeatable plugin dirs — `--plugin-dir <repo>` (shared skills) and
`--plugin-dir <repo>/adapters/copilot` (this binding's agents/hooks/command) — with
`copilot plugin install owner/repo:adapters/copilot` as the distribution path. The
`session.skills_loaded` event (row 10) enumerates loaded skills with name/source/path, giving the
native-surface test a real assertable seam rather than a filesystem-shape assertion.

### Entrypoint

Copilot has no `/craft:run` namespace. The nearest native affordance is a **user-invocable skill**
(`userInvocable: true` in `session.skills_loaded`) named `craft-run`, invoked via the `skill` tool
(`{ skill: "craft-run" }`) or headlessly as `copilot -p "/craft-run <input>"`. This mirrors pi's
`/craft-run` prompt-template rendering.

### Git-guard — the honest shape

This is the highest-risk fork and the probe changes its answer. Copilot has a `preToolUse` hook that
**fires but does not deny** (row 11), and two mechanisms that **do** enforce (rows 12–13). The guard
therefore binds as **three layers, only two of which are enforcing**:

| Layer | Mechanism | Enforcing? | Covers |
|---|---|---|---|
| Containment | native path verification — pass `--add-dir <worktree>`, **never** `--allow-all-paths` | **Yes** (live-proven) | out-of-tree `create`/`edit`/`view` |
| Command policy | `--deny-tool` pattern set from `src/deny-tool-args.js` | **Yes** (live-proven) | `shell(git push)` and the destructive-git set |
| Audit | `preToolUse` hook → `src/git-guard-adapter.js` → `gate.js` predicate | **No — observational** | records every violating call for the smoke record |

The audit layer still reuses `gate.js` **verbatim**, so the predicate stays single-sourced across all
four bindings; the adapter re-expresses only Copilot's event shape:

- `toolName` is **lowercase** — map `bash`→`Bash`, `create`→`Write`, `edit`→`Edit` (only the tools the
  shared predicate branches on; no inert casing entries).
- `toolArgs` is a **JSON string** and must be parsed before use — a parse failure must fail closed.
- Copilot has **no `file_path` field**. The adapter bridges the authoritative field the tool actually
  executes on — `path` → `file_path` — and must **not** write a `file_path ?? path` preference, which
  would let an in-tree decoy mask an out-of-tree `path`.

The `gate.js` git-diff/`--no-ext-diff` rule maps onto `bash.command` unchanged.

**The carve-out is real and must be documented, not papered over**: for this binding the guard's
*ext-diff* rule is advisory (audit-only), because Copilot exposes no denying hook. The *containment*
and *destructive-git* rules are enforced natively and are strictly stronger than an advisory hook.
A live probe demonstrated the failure mode concretely: under `--allow-all-tools` with a firing-but-
observational hook, `git push --force origin main` executed unimpeded.

Per ADR-243 the carve-out is written down in two places — `docs/adapters/copilot-poc-record.md` and
the new **Copilot binding** section of `docs/adapters/gate.md` — and is never implied to be enforcing.
Because ADR-249 makes `gate.md`'s `Binding set` track "ships a guard binding" rather than enforcement
strength, that per-binding enforcement profile is what carries the distinction, and the same change
authors the missing **opencode binding** section alongside it.

Launch flags are load-bearing: `--add-dir <worktree>` is required and `--allow-all-paths` is
forbidden.

### Telemetry

`engine/src/observability/adapters/copilot/telemetry.js` implements `collect` against the **OTel
JSON-lines file exporter** (row 8), not `--output-format json` — the JSONL result event carries no
token counts, and `session-store.db` has no token columns.

**The selection rule is the load-bearing part of this parser.** Because the same tokens appear on
leaf `chat` spans, again summed on the parent `invoke_agent` span, and again in the
`gen_ai.client.token.usage` metric (row 8c), the adapter counts **exactly one tier**:

> Ingest **only** span records (`instrumentationScope.name === 'github.copilot'` **and** `kind` present)
> whose `gen_ai.operation.name === 'chat'`. Ignore `invoke_agent` for token math, ignore
> `execute_tool`, ignore every metric record.

`chat` spans are the leaves, so they are the only tier that sums correctly regardless of fan-out depth;
`invoke_agent` is used for attribution only (D7), never for tokens.

Mapping to the vendor-neutral `UsageEvent` (from a `chat` span):

| UsageEvent field | Copilot OTel source |
|---|---|
| `run` | `attributes['gen_ai.conversation.id']` (falls back to `result.sessionId`) |
| `model` | `attributes['gen_ai.response.model'] ?? attributes['gen_ai.request.model']` |
| `tokens.input` | `attributes['gen_ai.usage.input_tokens']` |
| `tokens.output` | `attributes['gen_ai.usage.output_tokens']` |
| `tokens.cacheRead` / `cacheCreation` | **no Copilot equivalent pinned** → `0` |
| `role` | `null` until D7 pins subagent attribution |
| `phase` | `null` (injected by the caller, as pi does) |
| `durationMs` | derived from the span's `startTime`/`endTime` |
| `messages` | `1` per `chat` span |

`aggregate` / `serializeReport` are reused unchanged. Wiring is the existing generic seam:
`SOURCES.copilot = copilotParseLines` and a `DEFAULT_READ_ROOTS.copilot` thunk, matching the pi entry's
per-invocation read.

**One shape mismatch, settled by ADR-245**: `DEFAULT_READ_ROOTS` entries are *directories*
(`readTranscripts` iterates them), but `COPILOT_OTEL_FILE_EXPORTER_PATH` is a **single file path** —
the pi precedent (`PI_CODING_AGENT_SESSION_DIR`) does not answer this. The thunk resolves the env var
to its `dirname`:
`() => process.env.COPILOT_OTEL_FILE_EXPORTER_PATH ? dirname(...) : join(homedir(), '.copilot', 'otel')`,
so the env var stays the single source of truth without changing the port's directory contract. The
thunk re-reads the environment per invocation and is never frozen at module load.

Per the port contract the adapter never throws: malformed lines are skipped, partial data returns a
partial array, and non-finite token values coerce to `0` (mirroring `numOrZero` in the pi adapter).

### Model tier map

`adapters/copilot/src/model-tier-map.js` mirrors `resolvePiModel`: own-property lookups, explicit
overrides beating committed defaults, and an unknown tier throwing (fail-loud). The manifest stays
provider-neutral, tier-strings-only. Real ids are pinned by the smoke (D1) — the map ships with the
ids that run confirms, plus `--effort` as the tier's reasoning-effort companion.

### CRAFT_ROOT

Reuse the `${CRAFT_ROOT:-${CLAUDE_PLUGIN_ROOT}}` shim. `adapters/copilot/src/craft-root.js` mirrors
`resolveCraftRoot`: self-locate from `import.meta.url`, up-walk to the repo root, assert the root
exists and contains `engine/bin` (fail-loud on wrong depth). Up-levels depend on final file placement
(`adapters/copilot/src/` → three; `adapters/copilot/hooks/` → three) and must be asserted by test, not
assumed. The binding exports `CRAFT_ROOT` from its own launch context — for Copilot that is the hook
command's environment plus the `config.template.json` fragment, since Copilot has no plugin-root env
var of its own.

### Contract equivalence

Per the ADR-220/239 precedent, the Copilot binding **reuses the existing `AGENT_VARIANTS`** with a
zero-line diff — Copilot is agent-mode (it has subagents), so it takes the same agent-mode carve-outs
as Claude and opencode. No third variant set is introduced; `contract-equivalence.test.js` continues to
assert exactly two differing lines.

## Decision candidates

**All settled.** The decisions phase has run, so every load-bearing choice below is authored as an
ADR — this table is a decision record, not an open fork. Nine were adopted as recommended;
**ADR-243** and **ADR-249** carried a user judgment, and **ADR-249 deviates from the design's
recommendation**. The alternatives considered for each live in the ADR itself.

| # | Choice | ADR | Settled outcome |
|---|---|---|---|
| 1 | Target binary | [240](../adr/240-copilot-target-binary-standalone-cli.md) | Standalone `copilot`, pinned at the **binary self-report** 1.0.63 (not the cask's 1.0.17); `gh copilot` is out of the pinned contract. *Adopted as recommended.* |
| 2 | Home / distribution | [241](../adr/241-copilot-adapter-home-in-place.md) | In-place `adapters/copilot/` per ADR-085; loaded via `--plugin-dir`, with `copilot plugin install owner/repo:adapters/copilot` open later without relocating source. *Adopted as recommended.* |
| 3 | Native surface + entrypoint | [242](../adr/242-copilot-native-surface-plugin-skills-agents.md), refined by [251](../adr/251-copilot-shared-skills-by-reference.md) | Plugin directory carrying `agents/craft-*.md` (bodies byte-identical to the shared craft sources, frontmatter re-expressed). **Skills are NOT copied** — the shared `skills/` tree loads by reference from a repo-root plugin dir, so the entrypoint is the shared skill's own name (`run`). *242 adopted as recommended; 251 user-ratified after live evidence.* |
| 4 | **Git-guard binding** (highest risk) | [243](../adr/243-copilot-git-guard-three-layer.md) | Three layers — native containment and `--deny-tool` **enforcing**, `preToolUse` hook **advisory**; `gate.js` predicate reused verbatim, only the event adapter re-expressed. **User-ratified** (as recommended). |
| 5 | Execution topology | [244](../adr/244-copilot-execution-topology-subagent-fanout.md) | Subagent fan-out, mirroring `adapters/opencode/`; craft roles map to Copilot subagents via `task` + `subagents.agents.<name>`. *Adopted as recommended.* |
| 6 | Telemetry now vs defer | [245](../adr/245-copilot-telemetry-built-now-against-otel.md) | Build `collect` now against the **OTel JSON-lines file exporter** (not `--output-format json`, not `session-store.db`); `DEFAULT_READ_ROOTS.copilot` resolves the env var to its `dirname`. *Adopted as recommended.* |
| 7 | CRAFT_ROOT export | [246](../adr/246-copilot-craft-root-self-locate.md) | Self-locate from `import.meta.url` mirroring pi's `resolveCraftRoot`, fail-loud on wrong depth, up-level count asserted by test. *Adopted as recommended.* |
| 8 | Proof strategy | [247](../adr/247-copilot-proof-seams-plus-on-demand-smoke.md) | Deterministic seams in `scripts/ci.sh` + one on-demand live smoke; the BYOK fake-provider harness may ship as a developer-run probe, never CI-gated. Real-binary tests must prepend a fast-failing `copilot` `PATH` stub. *Adopted as recommended.* |
| 9 | Contract-equivalence framing | [248](../adr/248-copilot-contract-equivalence-variant-reuse.md) | Reuse the existing `AGENT_VARIANTS`/`INLINE_VARIANTS` → the Copilot block is byte-identical to Claude's (zero-line diff); no `contract.js` touch. *Adopted as recommended.* |
| 10 | `gate.md` binding set | [249](../adr/249-gate-binding-set-add-copilot-and-opencode.md) | **Add both `copilot` and `opencode`** → `{ claude, pi, opencode, copilot }`; the criterion is "ships a guard binding", so each per-binding section must state its own enforcement profile, and this change also authors `gate.md`'s missing opencode section. **User-ratified — DEVIATES from the design's recommendation** (which was to add neither and document `gate.md` as tracking fully-enforcing guards only). |
| 11 | Telemetry token tier | [250](../adr/250-copilot-telemetry-count-chat-spans-only.md) | Count **`chat` spans only**, discriminated structurally on `kind` / `instrumentationScope`; `invoke_agent` is attribution-only and all metric records are ignored. *Adopted as recommended.* |

## Test strategy

Deterministic seams, all runnable in CI with no auth and no quota.

**Mandatory `PATH`-stub discipline (ADR-247)**: any test that could spawn the real `copilot` binary must
assume CI **absence** and exit fast. Because `copilot` *is* installed on developer machines, such a test
would otherwise hang the suite doing real provider work — so the suite prepends a fast-failing `copilot`
stub to `PATH` to reproduce CI conditions.

| Suite | Proves | Key fixtures / edges |
|---|---|---|
| `test/git-guard-adapter.test.js` | Copilot event → `gate.js` shape | lowercase `bash`/`create`/`edit` mapping; `toolArgs` **string** parsing; malformed `toolArgs` fails **closed**; `path`→`file_path` bridge; **decoy test**: in-tree `file_path` + out-of-tree `path` must block; unknown tool passes through |
| `test/git-guard-predicate.test.js` | `gate.js` reused verbatim | byte-identical to the pi/opencode predicate suite |
| `test/deny-tool-args.test.js` | the enforcing pattern set | `shell(git push)` present; patterns well-formed per the pinned grammar; `--allow-all-paths` never emitted |
| `test/model-tier-map.test.js` | tier → id | override precedence; unknown tier throws; own-property lookup (`__proto__`/`constructor` must throw, not resolve) |
| `test/craft-root.test.js` | CRAFT_ROOT resolver | up-walk depth asserted from the real file location; non-existent root throws; missing `engine/bin` throws; non-`file://` moduleUrl throws |
| `test/native-surface.test.js` | R-G2 single-sourcing | `adapters/copilot/skills/` does **not** exist (a re-copy fails loudly); the launch contract names the repo root as a plugin dir and cites `skills/run/SKILL.md`, which must exist; agent bodies byte-identical to the shared craft agent bodies; provenance-ref and bare-`${CLAUDE_PLUGIN_ROOT}` checks apply to every adapter surface with no carve-out |
| `test/config.test.js` | `config.template.json` | declares `hooks.preToolUse` at **user level** (repo-level `.github/hooks` is unproven, D4); `disableAllHooks` not set true |
| `engine/test/observability/copilot-telemetry.test.js` | `collect` | OTel JSONL → `UsageEvent[]`; **no-double-count**: a fixture with 2 `chat` spans + their `invoke_agent` roll-up + the `gen_ai.client.token.usage` metric must total the 2 leaves, not 3×; metric records (no `kind`/`instrumentationScope`) ignored; `execute_tool` spans ignored; missing/non-finite tokens coerce to `0`; malformed line skipped not thrown; **never throws** (port contract); empty input → `[]` |
| `engine/test/observability/read-root.test.js` | `DEFAULT_READ_ROOTS.copilot` | env-set file path resolves to a **directory**; unset falls back to the default root; thunk re-reads env per invocation (never frozen at module load) |
| `engine/test/contract-equivalence.test.js` | invariant block | per ADR-248, **two** assertions: the Copilot block is byte-identical to Claude's (an actual **zero-line** diff), and agent vs inline still differ on exactly two lines |
| `test/every-test-file-registers.test.js` + `scripts/ci.sh` | wiring | `run_suite adapters/copilot adapters/copilot/test adapters/copilot` registered |
| `test/living-corpus.test.js` | doc surface stays enumerated | `docs/adapters/gate.md` is already in the pinned corpus, so the ADR-249 edits change no expectation there; the new `docs/adapters/copilot-poc-record.md` must be **added** to the pinned set alongside its `opencode-`/`pi-` siblings |

**The ADR-249 `gate.md` surface has no mechanical assertion, by nature.** Both the `Binding set` line
and the per-binding enforcement-profile prose — the new **Copilot binding** section *and* the
previously-absent **opencode binding** section documenting `adapters/opencode/plugins/git-guard.ts` —
are prose the repo lints for structure but not for content. Their correctness rides on review against
the ADR-243 layer table, not on a suite. Worth stating plainly rather than implying coverage that does
not exist: the *behaviour* those sections describe is covered by `test/git-guard-adapter.test.js` and
`test/deny-tool-args.test.js`; only the *description* is unasserted.

Property lens: the telemetry parser is a parse/aggregate pair, so a round-trip lens over
`OTel line → UsageEvent → aggregate` is warranted — token sums must equal the input sums for any
generated set of well-formed lines.

Optional (not CI-gated): the **BYOK fake-provider harness** used to pin this design can be committed
as a developer-run integration probe, giving a zero-cost end-to-end check of guard enforcement.

## Out of scope

- Forking the engine or the invariant contract — the whole point is one core, four bindings.
- Inventing a subagent model Copilot lacks — it has a real one (row 14); nothing is fabricated.
- Re-doing the claude/pi/opencode **binding code** — this change is additive. The one exception is
  documentary and settled by ADR-249: `gate.md`'s missing **opencode binding section** is authored here.
  No opencode source is touched.
- CI-gating a live Copilot run — cost and flakiness; on-demand smoke only.
- Paid-seat / quota engineering — `premiumRequests` is surfaced, not managed.
- Byte-identical Claude affordances — the nearest native affordance is the target (`/craft-run` as a
  user-invocable skill, not a `/craft:*` namespace Copilot does not have).
- The `gh copilot` extension — a separate product, not installed, and out of the pinned contract.
- `docs/adapters/backlog.md` / `intention.md` `Binding set` edits — those files carry no such line.
