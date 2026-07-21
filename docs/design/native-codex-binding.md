# Design — OpenAI Codex CLI adapter (fifth Execution-port binding)

> Brief: add a native OpenAI Codex CLI binding under `adapters/codex/`, driven by the same engine core under the same engine-owned invariant contract, expanding the Execution-port binding set to `{ claude, pi, opencode, copilot, codex }` without forking the engine.
> Status: draft → self-reviewed ×3 → awaiting the decisions phase (ADR-252…)

## Context

craft has four Execution-port bindings today, all natively packaged:

| Binding | Home | Topology | Guard enforcement | Precedent ADRs |
|---|---|---|---|---|
| claude | repo root itself (`skills/`, `agents/`, `.claude-plugin/`, `hooks/`) | subagent fan-out | denying PreToolUse hook | reference binding |
| opencode | `adapters/opencode/` | subagent fan-out (`agents/`, `commands/`, `plugins/git-guard.ts`) | throwing `tool.execute.before` + `permission.external_directory` | 215–228 |
| pi | `adapters/pi/` | role-less / sequential, no subagents (`prompts/`, `extensions/craft-guard/`) | `pi.on("tool_call")` veto | 229–239 |
| copilot | `adapters/copilot/` | subagent fan-out (`agents/`, `commands/`, `hooks/`) | mixed — native containment + `--deny-tool` enforce; hook is advisory | 240–251 |

There is **no** `adapters/claude/` directory — the Claude binding is the repo root. This design adds a
fifth sibling under `adapters/codex/`. Next free ADR number is **252**.

Constraints this design inherits:

- **ADR-085** — adapters live in-place under `adapters/<binding>/`, not as published packages.
- **R-G2 single-sourcing** — phase procedures are single-sourced from the shared craft skill bodies
  and never re-authored.
- **ADR-251** — shared craft skills load **by reference**, never by copy. Copying forces hygiene
  exemptions, because the shared bodies legitimately carry provenance refs and one bare
  `${CLAUDE_PLUGIN_ROOT}`. Only **agents** are adapter-local, with bodies byte-identical to the
  shared craft agent bodies and only frontmatter re-expressed.
- **Contract carve-outs** — `engine/src/contract.js` expands `@@ARTIFACT_HANDOFF@@` /
  `@@MODEL_RESOLUTION@@` through `AGENT_VARIANTS` / `INLINE_VARIANTS`.
  `engine/test/contract-equivalence.test.js` asserts agent vs inline assembly differ on **exactly
  two** lines, and ADR-220/239/248 set the precedent that a new binding reuses the existing variant
  sets rather than adding a third.
- **Telemetry port** (`docs/adapters/telemetry.md`) — `collect(opts, deps) → UsageEvent[]`; the
  adapter owns every runtime specific, never receives an absolute path, and never throws (partial
  data returns a partial array). `aggregate` / `serializeReport` are reused unchanged.
- **Reusable seams** — `adapters/pi/src/gate.js` exports the binding-neutral `toolCallGuard`
  predicate plus `WRITE_TOOLS`. `adapters/copilot/src/git-guard-adapter.js` already imports it
  across the adapter boundary; codex would be the **second** cross-adapter importer.

### The external contract is already pinned

`docs/adapters/codex-poc-record.md` (committed, `ca52661`) is the empirical evidence record for this
binding — live-probed against `codex-cli 0.144.6` on 2026-07-20 under isolated `HOME` / `CODEX_HOME`
/ `XDG_CONFIG_HOME`, with a BYOK fake-provider harness that drove real tool calls at zero
credentials and zero quota. **That record is the source of truth for every external fact in this
design; nothing here is designed from prior knowledge of Codex.** The load-bearing rows are
restated below so this document is readable standalone, each still marked CONFIRMED or DEFERRED.

**Two corrections to the brief, verified against the tree**, recorded here rather than silently
absorbed:

1. The brief states codex would be the *third* importer of `adapters/pi/src/gate.js` and that
   opencode "carries a character-for-character duplicate". Neither is exact.
   `adapters/opencode/src/git-guard-predicate.js` is **not** a duplicate of `gate.js` — it exports a
   *narrower* `gitGuardPredicate(command)` covering only the bash/ext-diff rule, with **no**
   `toolCallGuard` event shape and **no** path-containment branch. What *is* duplicated
   character-for-character is the trio `COMPLIANT_MARKERS` / `GIT_DIFF_SHOW_RE` /
   `REASON_GIT_EXT_DIFF`. Codex would be the **second** importer of `gate.js`, not the third. This
   changes the weight of decision candidate 5 but not its shape — see there.
2. `adapters/pi/stryker.conf.json` exists but is **wired into nothing**: no npm script references
   it, and `.claude/workflow.md`'s mutation probe is `test -f engine/stryker.conf.json` exclusively.
   `engine/stryker.conf.json` mutates `engine/src/**/*.js` only. So *every* adapter source in this
   repo ships with zero **executed** mutation coverage today, pi included. This is decisive for
   decision candidate 8.

### A pre-existing red gate this change must clear

`test/living-corpus.test.js` is **RED on this branch right now.** Commit `ca52661` added
`docs/adapters/codex-poc-record.md`, which `scripts/living-corpus.sh` discovers automatically, but
did not add it to the test's pinned `EXPECTED` set. Verified:

```
node --test test/living-corpus.test.js   →  # pass 2  # fail 1
```

`node engine/bin/intention-lint.js $(bash scripts/living-corpus.sh)` passes (21 paths valid), so the
failure is confined to the pinned-set assertion. Adding `'docs/adapters/codex-poc-record.md'` to
`EXPECTED` is a **one-line requirement of this change, not an optional tidy-up** — under the
never-commit-on-red rule the branch cannot land a single commit until it is done, so it belongs in
the first implementation part.

### Existing backlog items this design intersects

`BACKLOG.md` already parks three follow-ups surfaced by the copilot binding, all of which this
change re-opens. They are named here so the decision phase engages them deliberately rather than
rediscovering them:

- **Lift the binding-neutral guard predicate to a shared home** → decision candidate 5.
- **Deduplicate the acceptance-probe harness across three bindings** → codex would make it a
  fourth near-verbatim copy; see Out of scope.
- **Mutation-cover the adapter sources** → decision candidate 8.

There is **no** existing codex backlog entry.

## Requirements

1. **`engine/src/` is untouched** except the additive
   `engine/src/observability/adapters/codex/telemetry.js` sibling and generic `SOURCES` /
   `DEFAULT_READ_ROOTS` entries in `engine/src/observability/usage-mine-main.js`. `contracts/**` and
   `engine/src/contract.js` stay **byte-unchanged**. `engine/test/` necessarily gains additive
   suites (telemetry, read-root) and one added case in `contract-equivalence.test.js` — that is
   test surface, not engine logic, and the distinction is what "engine untouched" means here.
2. The invariant block under the Codex binding differs from Claude's by **at most the two carve-out
   lines**, asserted in `engine/test/contract-equivalence.test.js`.
3. Port `Binding set` lines stay **honest per port**. The sets are not uniform today and must not be
   made uniform. Verified against the tree:

   | Port doc | Current set | After this change |
   |---|---|---|
   | `execution.md` | `{ claude, pi, opencode, copilot }` | `{ claude, pi, opencode, copilot, codex }` |
   | `model.md` | `{ claude, pi, opencode, copilot }` | `{ claude, pi, opencode, copilot, codex }` (tier map) |
   | `telemetry.md` | `{ claude, pi, opencode, copilot }` | `{ claude, pi, opencode, copilot, codex }` (`collect`) |
   | `gate.md` | `{ claude, pi, opencode, copilot }` | `{ claude, pi, opencode, copilot, codex }` |
   | `memory.md`, `vcs.md`, `policy.md` | `{ claude, pi }` | **unchanged** — this change binds none of them |

   `backlog.md` and `intention.md` carry **no** `Binding set` line at all and are out of scope.

   Each of the four listed port docs also carries **per-binding sections**, so this change authors a
   **Codex binding** section in each of `execution.md` (topology + native surface), `model.md`
   (tier map), `telemetry.md` (`collect` + the read-root leaf caveat), and `gate.md` (enforcement
   profile). Per ADR-249 `gate.md`'s `Binding set` criterion is "ships a guard binding" regardless
   of enforcement strength, so the per-binding section is what carries the distinction.
4. Phase procedures are single-sourced from the shared craft skill bodies (R-G2 / ADR-251); only
   per-binding frontmatter is re-expressed. `adapters/codex/skills/` must **not** exist.
5. The git-guard reuses the shared predicate; only the event adapter is re-expressed. Every rule the
   binding claims to enforce is backed by a live-pinned mechanism, and every rule that is advisory
   is written down as advisory in both `docs/adapters/gate.md` and `adapters/codex/README.md`.
6. `test/living-corpus.test.js`'s pinned `EXPECTED` set includes
   `docs/adapters/codex-poc-record.md` — the branch is red until it does (see Context).
7. Deterministic seams are green in `scripts/ci.sh`, with the new suite registered in **both**
   `scripts/ci.sh` (`run_suite adapters/codex adapters/codex/test adapters/codex`) and
   `test/every-test-file-registers.test.js` (`SUITE_DIRS`) **in the same commit**.
8. **No test spawns the real `codex` binary.** Every seam is exercised through injected
   dependencies; any test that could reach a `codex` on `PATH` prepends a fast-failing stub, since
   `codex` *is* installed on developer machines and an un-stubbed run costs minutes and quota.
9. No probe in this change mutates the operator's real `~/.codex/`. Any state-touching probe runs
   under a `mktemp` throwaway `CODEX_HOME` — including `--help`-shaped invocations, which the PoC
   record proves fall through to the TUI and open real state databases on an unrecognized
   subcommand.
10. `docs/adapters/codex-poc-record.md` is **refreshed, not left stale**: every DEFERRED row this
    change closes (at minimum row 12c, and rows 5a / 9a / 12d depending on the decisions taken)
    flips to CONFIRMED with its evidence, and any row that stays DEFERRED stays visibly DEFERRED.
    A design that closes a row silently is indistinguishable from one that assumed it.

## Design

### Pinned external contract (condensed from `docs/adapters/codex-poc-record.md`)

| # | Dimension | Pinned result | Status |
|---|---|---|---|
| 1 | Target binary | `@openai/codex` → `codex-cli 0.144.6`. Binary self-report and npm version **agree** (unlike copilot's 1.0.17/1.0.63 split). No competing Homebrew formula shadows the name. | CONFIRMED |
| 2 | Headless mode | `codex exec [PROMPT]` (alias `codex e`) — one turn, exits. Prompt may arrive on stdin. `-C/--cd`, `--add-dir`, `--skip-git-repo-check`, `--ephemeral`, `-o/--output-last-message`, `--output-schema`. | CONFIRMED |
| 3 | Machine-readable output | `codex exec --json` → JSONL. `thread.started` → `turn.started` → `item.completed` → `turn.completed`. | CONFIRMED |
| 4 | **Token counts in-stream** | `turn.completed.usage` = `{input_tokens, cached_input_tokens, output_tokens, reasoning_output_tokens}`. **The key contrast with copilot**, whose stream carries none. | CONFIRMED |
| 5 | Session persistence | `$CODEX_HOME/sessions/YYYY/MM/DD/rollout-<ISO>-<uuid>.jsonl` | CONFIRMED |
| 5a | Rollout record shape | **Not parsed.** Whether the rollout file persists the same `turn.completed` envelope is unknown. | **DEFERRED** |
| 6 | Config | TOML at `$CODEX_HOME/config.toml`; `-c key=value` dotted overrides (value parsed as TOML); profiles via `-p <name>` layering `$CODEX_HOME/<name>.config.toml`. Layering: system → MDM → enterprise → user → project (`.codex/`) → session flags. | CONFIRMED |
| 7 | Config-home var | **`CODEX_HOME`** — the `COPILOT_HOME` analog. Isolation verified byte-for-byte. | CONFIRMED |
| 8 | Instruction auto-read | **`AGENTS.md` — CONFIRMED live.** A marker string in a project `AGENTS.md` appeared as a `user` message in `codex debug prompt-input`. | CONFIRMED |
| 9 | Skills | `$CODEX_HOME/skills/<name>/SKILL.md`; a plugin manifest may declare `"skills": "./skills/"` — a **path**. | CONFIRMED (mechanism) |
| 9a | **Skills by reference** | The manifest's `skills` field being path-valued, plus marketplace `"source": "local"`, makes referencing craft's own top-level `skills/` structurally available. **Not proven end-to-end.** | **DEFERRED — highest-value row** |
| 10 | Plugin manifest | `{name, version, description, author, skills, hooks, mcpServers, apps, interface{…}}` — `skills`/`hooks`/`mcpServers`/`apps` all path-valued. Manifest **filename** not pinned. | CONFIRMED (schema) |
| 11 | Plugin install | `codex plugin add` from a configured marketplace snapshot; `codex plugin marketplace add` supports local file-backed marketplaces. | CONFIRMED (surface) / DEFERRED (install not run) |
| 12 | **PreToolUse hook CAN DENY** | **Proven live.** A `command` handler exiting **code 2** with a reason on **stderr** blocks the call. Observed: `error=Command blocked by PreToolUse hook: craft-guard: denied.` The probe `echo` never ran, and the next turn's input carried `function_call_output: "Command blocked by PreToolUse hook: …"` — **the denial is fed back to the model.** | **CONFIRMED** |
| 12a | `hooks.json` schema | `{"description": …, "hooks": {"PreToolUse": [{"matcher": …, "hooks": [{"type":"command","command":"…"}]}]}}`. **The `{description, hooks}` wrapper is mandatory** — a flat Claude-style `{"PreToolUse":[…]}` is rejected: `unknown field 'PreToolUse', expected 'description' or 'hooks'`. | CONFIRMED |
| 12b | Hook trust | Hooks carry a trust model (`trusted`/`untrusted`/`modified`/`managed`). Automation needs `--dangerously-bypass-hook-trust`, which emits a visible warning item every run. | CONFIRMED |
| 12c | **Tool names the guard must map** | The shell tool is **`exec_command`**, taking `cmd` as a **string** (row 18). Codex's **file-write / file-edit tool names and their path field names are NOT pinned** — the PoC record explicitly warns that the registered tool set depends on resolved model metadata and must be read off the request body rather than guessed. | **DEFERRED — blocks authoring the tool-name map** |
| 12d | `matcher` semantics in `hooks.json` | The field exists in the CONFIRMED schema. What it matches against (tool name, a pattern, a namespace) is not pinned; the live denial probe did not vary it. | **DEFERRED** |
| 13 | Execpolicy `.rules` | Starlark. `prefix_rule(pattern=[…], decision="forbidden"｜"allow"｜"prompt", justification="…")`. Nested-list alternation works: `pattern=["git", ["push","clean"]]`. `codex execpolicy check --rules <PATH> <CMD>…` evaluates **deterministically, offline, no auth**. | CONFIRMED |
| 13a | **Execpolicy bypass** | Token-prefix over argv — stronger than copilot's raw-string prefix, still **not adversarial**. `git -C . push`, `git --git-dir=.git push` and `bash -lc 'git push'` all **NO MATCH** against `pattern=["git","push"]`. Same gap class that defeated copilot. | CONFIRMED |
| 13b | Malformed `.rules` at runtime | `execpolicy check` hard-errors (exit 1). The **runtime** path is unresolved; the binary contains `Error parsing rules; custom rules not applied.`, which reads like a fail-open. | **DEFERRED — treat as FAIL-OPEN** |
| 14 | Native sandbox | `-s/--sandbox <read-only｜workspace-write｜danger-full-access>` (plus `external-sandbox`); seatbelt on macOS; `writable_roots`, `network_access`, `exclude_tmpdir_env_var`, `exclude_slash_tmp`. Sandbox network proxy exists. | CONFIRMED (surface) |
| 14a | **What each mode blocks** | Not measured per mode. | **DEFERRED — claim no containment guarantee** |
| 15 | **Subagents** | `multi_agent_v1` namespace: `spawn_agent`, `send_input`, `wait_agent`, `resume_agent`, `close_agent`. **4 concurrency slots.** All agents share one cwd and filesystem; edits immediately visible. `fork_turns` propagates context. Read off the request body Codex sent the fake provider. | CONFIRMED |
| 15a | **Delegation constraint** | Codex injects `<multi_agent_mode>Do not spawn sub-agents unless the user or applicable AGENTS.md/skill instructions explicitly ask for sub-agents, delegation, or parallel agent work.` **The binding must explicitly ask**, or fan-out silently degrades to sequential. | CONFIRMED |
| 16 | Models | `gpt-5.6-sol` (frontier, priority 1), `gpt-5.6-terra`, `gpt-5.6-luna`, `gpt-5.5`, `gpt-5.4`, `gpt-5.4-mini`, `gpt-5.2`. `codex debug models` renders the catalog **with no auth**. Reasoning: `low｜medium｜high｜xhigh｜max` (+`ultra` on sol/terra) via `model_reasoning_effort`. | CONFIRMED |
| 16a | **Unknown model id** | Falls back to default metadata with a warning **and changes which tools are registered.** A wrong id can therefore silently remove `multi_agent_v1` — a topology failure that presents as "fan-out just didn't happen". | CONFIRMED |
| 17 | CRAFT_ROOT lever | Codex honours `CLAUDE_PLUGIN_ROOT`, `PLUGIN_ROOT`, `CLAUDE_PLUGIN_DATA`, `PLUGIN_DATA` in hook command templates. | CONFIRMED (strings) / **DEFERRED (not exercised)** |
| 18 | BYOK offline harness | `[model_providers.<id>] base_url / wire_api = "responses" / requires_openai_auth = false`. Zero credentials, zero quota, offline. **`wire_api = "chat"` is no longer supported.** Provider must emit **SSE chunks**. The shell tool is **`exec_command`** taking `cmd` as a **string** (an argv array yields `invalid type: sequence, expected a string`). | CONFIRMED |
| 19 | Auth for a real run | `codex login` (ChatGPT OAuth or `--with-api-key`), or `OPENAI_API_KEY`/`CODEX_API_KEY`/`CODEX_ACCESS_TOKEN`. A real-model smoke needs paid quota. | CONFIRMED / smoke DEFERRED |

### Topology drives the shape

Row 15 pins Codex as **subagent-capable with 4 concurrency slots**. `adapters/codex/` therefore
mirrors `adapters/copilot/` and `adapters/opencode/` (agents + entrypoint + guard binding), **not**
`adapters/pi/` (role-less prompts). No subagent model is fabricated.

Row 15a is the trap. Codex actively *suppresses* fan-out unless instructed, so a binding that merely
ships nine agents gets a silent degradation to sequential execution — the run still completes, the
artifacts still land, and nothing errors. The design's answer is decision candidate 3; whichever
option is chosen, **the delegation ask must be a surface Codex itself names as authoritative**
(`user` / `AGENTS.md` / *skill instructions*), and the review-phase fan-out width must be capped at
the pinned **4** slots rather than assumed unbounded.

Three consequences of the session model that are easy to get backwards:

- **"One turn" is the whole run, not one tool call.** `codex exec` is one-turn-and-exit in the sense
  that it takes one *user message* and runs to completion — many tool calls, many subagent spawns —
  then exits. The orchestrator is therefore **one `codex exec` invocation walking all phases**,
  mirroring copilot and opencode, **not** one invocation per phase (pi's shape, forced there by the
  absence of subagents). Reading "one turn" as "one step" would produce a pi-shaped binding for a
  copilot-shaped tool.
- **The 4-slot cap includes the orchestrator.** The pinned text is "up to 4 agents can be active at
  once, **including you**" — so the usable fan-out width is **3**, not 4. craft's review phase fans
  out one worker per dimension, which routinely exceeds that. What `spawn_agent` does at the
  ceiling (blocks, queues, or errors) is **not pinned**; the binding must either batch to the cap or
  pin the over-subscription behaviour before relying on it.
- **`--ephemeral` and telemetry are mutually exclusive.** `--ephemeral` suppresses session-file
  persistence (row 2), and `$CODEX_HOME/sessions/` is exactly what `--source codex` mines. A binding
  that passes `--ephemeral` for hygiene silently produces a zero-cost report. The launch args must
  not set it, and the reason belongs in a comment at the flag's construction site.

### Layout

```
adapters/codex/
  package.json
  README.md                     # launch + distribute + honest guard profile (single source)
  <plugin-manifest>.json        # filename DEFERRED (row 10) — resolve before authoring
  hooks.json                    # {description, hooks:{PreToolUse:[…]}} — the wrapper is mandatory
  config.template.toml          # $CODEX_HOME/config.toml fragment: sandbox, approval, agents
  craft.rules                   # execpolicy Starlark, defence-in-depth only
  agents/craft-*.md             # 9 agents; craft body verbatim, Codex frontmatter
                                # (no skills/ dir — shared craft skills load by reference)
  skills/…                      # MUST NOT EXIST (R-G2 / ADR-251); asserted by test
  hooks/craft-guard.js          # PreToolUse — ENFORCING (exit 2 + stderr reason)
  src/craft-root.js             # CRAFT_ROOT resolver
  src/model-tier-map.js         # tier → real pinned ids + reasoning effort
  src/git-guard-adapter.js      # Codex event → shared predicate shape
  src/execpolicy-rules.js       # generates + validates craft.rules content
  src/launch-args.js            # sandbox mode, --add-dir, hook-trust posture
  src/probe.js                  # runAcceptanceProbe
  test/*.test.js
```

The adapter-local entrypoint surface (a thin `commands/`-style file vs. a one-file adapter-authored
skill) is decision candidate 2 and is deliberately left unnamed above.

### Native surface + entrypoint

Codex's first-class discoverable mechanism is the **plugin**, whose manifest carries path-valued
`skills` and `hooks` fields (row 10). Because `skills` is a **path**, the ADR-251 by-reference
discipline is structurally available: a manifest can point at craft's own top-level `skills/` tree
rather than copying nineteen skill bodies into the adapter. Copying is rejected for the same reason
ADR-251 rejected it for copilot — the shared bodies legitimately carry provenance refs and one bare
`${CLAUDE_PLUGIN_ROOT}`, so copying forces hygiene exemptions on exactly the files most likely to
drift.

One structural difference from copilot matters: copilot takes **repeatable** `--plugin-dir` flags,
so two plugin dirs load side by side. A Codex plugin manifest declares **one** `skills` path. The
shared-skills path and the adapter's own surface therefore cannot both hang off a single manifest —
this design assumes **two plugin entries in one local marketplace** (`craft` → shared `skills/`;
`craft-codex` → this binding's hooks/agents/entrypoint), which is the direct analog of copilot's two
`--plugin-dir` flags. Whether `skills` resolves relative to the manifest is **unpinned** and must be
established before the manifest is authored.

Row 9a is DEFERRED, so the design must not assume by-reference loading works end-to-end. The
fallback if it does not: `$CODEX_HOME/skills/` is a CONFIRMED load location, so a **symlink farm**
(`$CODEX_HOME/skills/<name>` → `<repo>/skills/<name>`) preserves single-sourcing without copying.
That fallback is named in decision candidate 2 rather than assumed away.

### Delegation and the `multi_agent_v1` ask

The nine `agents/craft-*.md` files are adapter-local with **bodies byte-identical** to
`agents/*.md` at the repo root, only frontmatter re-expressed — the discipline opencode and copilot
both hold, asserted by a byte-identity test.

Codex's injected `<multi_agent_mode>` text (row 15a) names three authoritative sources for a
delegation ask: the **user**, an applicable **`AGENTS.md`**, or **skill instructions**. Of these:

- `AGENTS.md` is auto-read from the **project** (the user's worktree), not from a plugin dir. The
  binding cannot write into the user's repo, so it is not a lever this adapter controls.
- The **user** turn is `codex exec "<prompt>"` — controllable, but it puts a load-bearing invariant
  in an invocation string a human retypes, which is exactly the drift R-G2 exists to prevent.
- **Skill instructions** are the adapter's own surface and are single-sourceable.

The design therefore routes the ask through the entrypoint surface, which already defers verbatim to
the shared `skills/run/SKILL.md` for the procedure. The shared run skill's spawn step is written in
Claude vocabulary (`Task` with `subagent_type: craft:<role>`); the adapter-local entrypoint adds one
Codex-native paragraph naming `multi_agent_v1` / `spawn_agent` and the 4-slot cap, **without**
restating the procedure. That paragraph is adapter-authored, so no hygiene exemption is needed.

### Git-guard — the honest shape

This is the highest-risk fork, and Codex is materially **stronger** than copilot here. Copilot's
`preToolUse` hook fires but cannot deny, which forced the ext-diff rule to ship advisory (ADR-243).
Codex's PreToolUse hook **can genuinely deny** — proven live, with the denial fed back to the model
(row 12). The ext-diff rule is therefore **enforced** for this binding, closing copilot's carve-out.

Three layers, and they are not equal:

| Layer | Mechanism | Enforcing? | Covers |
|---|---|---|---|
| **PreToolUse hook** | `hooks.json` → `hooks/craft-guard.js` → shared `toolCallGuard` predicate; exit **2** + stderr reason | **Yes — live-proven, denial fed back to the model** | **ext-diff rule** (rides on the pinned `exec_command`); path containment **only once row 12c pins the write-tool names** — until then this layer covers shell calls, not writes |
| Execpolicy `.rules` | `prefix_rule(pattern=["git", ["push","clean",…]], decision="forbidden")` | **Partially** — token-prefix over argv; **bypassed** by `git -C . push`, `git --git-dir=… push`, `bash -lc '…'`; **may fail OPEN** on a malformed file at runtime | destructive-git set, defence-in-depth only |
| Sandbox | `-s workspace-write` + `writable_roots` + `network_access` | **Unmeasured** — the surface is CONFIRMED, per-mode blocking is **DEFERRED** | claims nothing until measured |

Four statements must survive into `docs/adapters/gate.md` and `adapters/codex/README.md` without
softening:

1. **`git -C . push` bypasses the execpolicy layer.** Live-pinned NO MATCH, same gap class as
   copilot. Enumerating flag orders cannot close it; a blanket `pattern=["git"]` would close it and
   deny *all* git, breaking craft's own git-heavy workflow. Rejected for the same reason copilot
   rejected `shell(git:*)`.
2. **A malformed `.rules` file may fail OPEN at runtime** (row 13b). The layer is therefore not a
   guarantee even for the patterns it does match. Treat as fail-open until proven otherwise, and
   validate the rules file at build time — `codex execpolicy check` is deterministic, offline, and
   auth-free, so the *generated text* can be unit-tested even though the runtime path cannot be
   CI-gated.
3. **Sandbox containment claims nothing yet.** Row 14a is unmeasured. The binding selects a mode and
   documents the selection; it does not advertise containment. This matters more than it would for
   copilot, because with row 12c unpinned the sandbox is currently the *only* path-containment
   story — and it is precisely the layer whose blocking behaviour has not been measured. Stating
   "containment rests on an unmeasured layer" is the honest position; claiming containment is not.
4. **Hook enforcement costs a trust bypass.** Automation needs `--dangerously-bypass-hook-trust`
   (row 12b), which emits a visible warning item every run. The strongest layer is thus gated behind
   a flag whose name is itself a warning. That trade — a denying guard in exchange for a bypassed
   trust prompt — is the binding's central posture and belongs in the README, not in a footnote.

Because the hook layer *can* deny, an option opens that copilot never had: the **destructive-git set
can move out of the bypassable prefix matcher and into the hook**, where a matcher can normalize
interposed global options exactly as `GIT_DIFF_SHOW_RE` already does for `diff`/`show`. The shared
`toolCallGuard` has no destructive-git branch today, so this is a composition question — a
codex-local matcher composed *alongside* the shared predicate, versus extending the shared predicate
(which changes pi/opencode/copilot behaviour). Folded into decision candidate 4.

The event adapter re-expresses only Codex's shape and reuses the predicate unmodified. Two field
disciplines carry over from the copilot binding as hard rules:

- **Bridge the field the tool actually executes on, unconditionally.** Never write
  `inspected ?? executed` — an in-tree decoy field must never be able to mask an out-of-tree
  executed field.
- **Map only the tool names the shared predicate branches on.** No inert casing entries. The map is
  null-prototype and frozen so a tool named `constructor`/`__proto__` falls through to the raw name
  rather than resolving an inherited member.

Codex's shell tool is **`exec_command`** and takes `cmd` as a **string** (row 18) — not `bash`, not
`command`, and not an argv array. A parse failure or a write-tool call with no path must fail
**closed**. Unlike copilot, failing closed here is real enforcement, not a recorded verdict, so the
fail-closed path needs its own test with an explicit "this blocks a real call" assertion.

**One prerequisite blocks authoring the map at all.** Row 12c: only the *shell* tool name is pinned.
Codex's **file-write and file-edit tool names, and the field each executes on, are unknown** — and
the PoC record warns specifically that the registered tool set varies with resolved model metadata,
so guessing them is exactly the failure this discipline exists to prevent. Worse, the failure is
**silent and fails open**: an unmapped tool name falls through the shared predicate's
`{ block: false }` tail, so a mis-guessed write-tool name yields a guard that passes every test
written against the guess while enforcing nothing on the real binary.

The map must therefore be pinned by **reading the tool list off the request body** under the BYOK
harness before the adapter is authored — the same technique that pinned `exec_command`. Until then
the honest position is: the **ext-diff rule is enforced** (it rides on `exec_command`, which *is*
pinned), and **path containment via the hook is unpinned** — it must lean on the sandbox's
`writable_roots` (row 14) and be documented as such rather than claimed. Row 12d (`matcher`
semantics) is a second, lower-stakes prerequisite: if `matcher` scopes the hook to a subset of
tools, a wrong value silently narrows enforcement, so the safest posture until pinned is the
broadest matcher the schema accepts, with the predicate — not the matcher — doing the filtering.

### Telemetry

Codex is the first binding whose stream carries token counts **directly** (row 4) — no OTel
side-channel, no three-tier double-count hazard, no SQLite dead end. `turn.completed.usage` is a
genuine source.

Two shape problems are load-bearing and must not be glossed:

**(a) The read root is nested; `usage-mine` enumerates flat.** `usage-mine-main.js` does
`readdirSync(safeTranscriptDir).filter(f => f.endsWith('.jsonl'))` — **non-recursive**. Codex
sessions live at `$CODEX_HOME/sessions/YYYY/MM/DD/rollout-*.jsonl`, so pointing `--dir` at
`sessions/` enumerates only `2026/` and yields a **silent no-op report**. This is not a bug to fix
in the engine: it is exactly the claude shape, where `DEFAULT_PROJECTS_DIR` is the *containment
root* and `--dir` names the leaf. So:

```
DEFAULT_READ_ROOTS.codex = () =>
  join(process.env.CODEX_HOME || join(homedir(), '.codex'), 'sessions')
```

serves as the containment boundary, and the caller passes `--dir $CODEX_HOME/sessions/2026/07/20`.
The thunk re-reads `process.env` per invocation, never frozen at module load — the pi/copilot
precedent. **This must be documented in `docs/adapters/telemetry.md`'s Codex section**, because the
failure mode is a zero-cost report that looks successful.

**(b) The token record shape in rollout files is DEFERRED (row 5a).** The `turn.completed` envelope
is CONFIRMED in the `codex exec --json` stream; whether the persisted rollout `.jsonl` carries the
same envelope is unknown. The parser is envelope-shaped, not location-shaped, so it works wherever
the envelope appears — but if rollout files wrap events differently, the miner reports zero. That is
the *safe* direction (never a wrong number, and detectable) but it is still a real gap. Decision
candidate 6 puts the choice on the table.

**The cache/reasoning arithmetic is the single riskiest line in the parser**, and it deserves being
spelled out rather than left to implementation. `UsageEvent` carries
`{input, cacheRead, cacheCreation, output}`; Codex supplies
`{input_tokens, cached_input_tokens, output_tokens, reasoning_output_tokens}`. Whether
`cached_input_tokens ⊂ input_tokens` is **not pinned**. The two conventions disagree: OpenAI's
Responses API reports cached as a *breakdown of* input; Anthropic's reports cache-read as
*disjoint from* input. Get it backwards and the miner inflates every reported cost.

The sum-safe mapping — correct in total under **either** convention — is subtraction with a floor:

| `UsageEvent` field | Codex source |
|---|---|
| `tokens.input` | `Math.max(0, input_tokens - cached_input_tokens)` |
| `tokens.cacheRead` | `cached_input_tokens` |
| `tokens.cacheCreation` | `0` — no Codex equivalent pinned |
| `tokens.output` | `output_tokens` |
| `run` | thread/session id from `thread.started` (held across the stream, as pi holds its session id) |
| `model` | resolved model id from the turn envelope |
| `role` | `null` until subagent attribution is pinned |
| `phase` | `null` (injected by the caller, as pi and copilot do) |
| `durationMs` | derived from turn start/end when present, else `0` |
| `messages` | `1` per `turn.completed` |

Under the subset convention this is exactly right. Under the disjoint convention the **total is
still exactly `input_tokens`** — only the input/cache-read *attribution* shifts, mis-pricing at the
cache rate rather than mis-counting. Every other mapping can be wrong in the total; this one cannot.
Recorded as decision candidate 11 because it is a real fork, with that asymmetry as the argument.

`reasoning_output_tokens` gets the mirror treatment: `output = output_tokens` alone. If reasoning is
a subset of output (the Responses-API convention) this is exact; if disjoint it under-reports, which
is the safe direction. Adding them is the option that can over-report. Same candidate.

Per the port contract the adapter **never throws**: malformed lines are skipped and counted,
partial data returns a partial array, non-finite token values coerce to `0` (`numOrZero`, mirroring
pi and copilot), and empty input returns `[]`. The `since` cutoff normalizes **both sides to epoch
ms before comparing** — comparing a raw numeric timestamp against a raw ISO string coerces to `NaN`
and fails the cutoff **open**, a trap the copilot adapter documents explicitly.

Wiring is the existing generic seam and nothing more: `SOURCES.codex = codexParseLines` plus a
`DEFAULT_READ_ROOTS.codex` thunk. Both are additive entries in lookups that already exist for this
purpose; no engine logic changes.

### Model tier map

Unlike copilot — whose real model ids were DEFERRED behind an authenticated seat, forcing
`auto` for every tier — Codex's catalog is **CONFIRMED with no auth** (`codex debug models`,
row 16). The tier map can ship real ids on day one, which makes *which* ids a genuine decision
rather than a placeholder (decision candidate 12).

`src/model-tier-map.js` mirrors `resolveCopilotModel`/`resolvePiModel`: own-property lookups
(`Object.hasOwn`, so `__proto__`/`constructor` throw rather than resolve), explicit overrides beating
committed defaults, and an unknown tier **throwing** (fail-loud). The manifest stays
provider-neutral — `.claude/workflow.md`'s `models.<role>` carries tier strings only, never a
provider/model pin. A companion `resolveCodexEffort` maps tier → `model_reasoning_effort`, the
`--effort` analog.

Row 16a raises the stakes on fail-loud: an unknown model id does not error, it **falls back with a
warning and changes which tools are registered** — potentially removing `multi_agent_v1` and
silently collapsing fan-out to sequential. A typo in the tier map is therefore a topology bug that
presents as "the run was just slower". The map must fail loud locally, and the ids it ships must be
cross-checked against `codex debug models` (auth-free, so this is cheap and repeatable).

### CRAFT_ROOT

Row 17 records that Codex honours `CLAUDE_PLUGIN_ROOT` / `PLUGIN_ROOT` in hook command templates —
but as **matched strings in the binary, not an exercised substitution**. Building the root export on
an unexercised lever would be designing from a plausible-looking artifact, which is the failure mode
this whole PoC discipline exists to prevent.

The proven alternative is already in the tree twice: `adapters/pi/src/craft-root.js` and
`adapters/copilot/src/craft-root.js` both self-locate from `import.meta.url`, up-walk a fixed number
of levels, and assert the result exists **and** contains `engine/bin` — failing loud on a wrong
depth. The up-level count depends on final file placement (`src/` → three, `hooks/` → three) and is
**asserted by test, never assumed**. Decision candidate 7 weighs the two.

Whichever wins, the existing `${CRAFT_ROOT:-${CLAUDE_PLUGIN_ROOT}}` shim stays the textual form in
any authored surface, so the adapter's hygiene check (no *bare* `${CLAUDE_PLUGIN_ROOT}`) applies
uniformly with no carve-out.

### Contract equivalence

Codex is agent-mode — it has real subagents — so it takes the same agent-mode carve-outs as Claude,
opencode, and copilot. Per the ADR-220/239/248 precedent it **reuses the existing `AGENT_VARIANTS`**
with a **zero-line diff**; no third variant set, no `contract.js` touch, `contracts/**` byte-
unchanged.

`engine/test/contract-equivalence.test.js` already carries three near-identical binding-fidelity
tests (opencode, copilot, pi) asserting that passing `{ binding: <name> }` is **ignored** and
produces byte-identical output to plain agent-mode assembly. A fourth for `codex` is one more
instance of an established pattern. Decision candidate 10 notes the alternative.

## Decision candidates

> **All settled.** The decisions phase ratified every candidate below as **ADRs 252–264**; those
> ADRs are the authoritative record, and this section is retained as the reasoning that fed them.
> Two outcomes deviate from the recommendations stated here, both on the user's explicit call:
>
> - **Candidate 5 → ADR-256.** The user chose to **lift the predicate to `engine/src/guards/` now**
>   and repoint pi, opencode, copilot and codex — overriding the recommendation to import from pi
>   again and defer the lift. This knowingly relaxes this change's own "engine untouched except
>   telemetry" criterion; ADR-256 records that trade rather than hiding it.
> - **Candidate 8 → ADR-263.** The user challenged the premise — a Stryker config is
>   JavaScript-specific, and craft is language-agnostic. Resolution: `engine/stryker.conf.json` is
>   craft-*the-consumer* declaring its own validation technique, not part of the toolchain-neutral
>   engine contract. So **no per-adapter config ships**; the existing consumer-level mutate scope is
>   extended to cover the adapter guard sources instead, avoiding a per-adapter mutation-config
>   pattern that a future non-JS adapter would inherit nonsensically.
>
> One blocking prerequisite flagged below (the unpinned write/edit tool name) was **closed before
> the decisions conversation** by live probe: the write tool is `apply_patch`, it is a **freeform
> Lark-grammar tool with no structured path field**, and the tool surface is **model-dependent**
> (`gpt-5.6-sol` sends no tool list at all). See `docs/adapters/codex-poc-record.md`.

Twelve load-bearing choices, none pre-decided by an existing ADR. The designer does not decide these
— the decisions phase does, as ADRs starting at **252**. Candidates 5 and 8 expand scope beyond the
brief and are flagged as such.

**Two couplings to decide together, not independently:**

- **1 ↔ 2.** Candidate 1's recommended load path (local marketplace) requires a plugin manifest,
  which candidate 2's option (c) discards. They are the same fallback seen from two angles: if
  row 9a (skills-by-reference via a manifest) fails, both collapse to the `$CODEX_HOME/skills/`
  symlink route. Choosing 1(a) with 2(c) is incoherent.
- **4 ↔ 5.** Candidate 4's option (c) — adding destructive-git by extending the shared predicate —
  *is* candidate 5's scope expansion arriving through a different door. If 5 stays at (a), then
  4(c) is off the table and the destructive-git matcher must be codex-local.

| # | Choice | Alternatives (≤3) | Recommendation | Why |
|---|---|---|---|---|
| 1 | **Home + how a Codex user actually loads it** | (a) In-place `adapters/codex/` per ADR-085, loaded via a **local file-backed marketplace** (`codex plugin marketplace add <local>` → `codex plugin add`), with `"source": "local"`; (b) in-place, loaded by **symlinking into `$CODEX_HOME/skills/`** + a `config.toml` hook path — no marketplace, no plugin manifest; (c) published npm/registry package | **(a)** | ADR-085 settles the home; only the *load* is open. The marketplace is Codex's first-class discoverable path and is the only one that carries `hooks` + `skills` + agents as one installable unit. (b) is the honest fallback if row 9a fails, and should be documented as such rather than chosen up front. (c) contradicts ADR-085 and buys nothing while the repo has no remote. |
| 2 | **Native surface + entrypoint** | (a) **Two plugin entries in one local marketplace** — `craft` (manifest `skills` → repo-root `skills/`, by reference) + `craft-codex` (hooks/agents/entrypoint), the direct analog of copilot's two `--plugin-dir` flags; (b) one plugin whose `skills` points at the repo root, with the entrypoint being the shared `run` skill invoked by its own name (no adapter-local entrypoint file at all); (c) `$CODEX_HOME/skills/` symlink farm + a standalone `hooks.json`, no plugin manifest | **(a)**, with **(c)** written down as the named fallback | By-reference loading is non-negotiable (ADR-251) — copying forces hygiene exemptions on the most drift-prone files. A manifest's `skills` is a single path, so the shared tree and the adapter surface need two entries. (b) is tempting and simpler, but leaves nowhere adapter-authored to put the delegation ask from candidate 3. Row 9a is **DEFERRED**, so (c) must be a documented fallback, not a rediscovery. **Resolve the manifest filename and whether `skills` is manifest-relative before authoring it.** |
| 3 | **Execution topology + satisfying the "explicitly ask" constraint** | (a) Fan-out via `multi_agent_v1`, ask carried in the **adapter-authored entrypoint** (a "skill instruction", one of the three sources Codex names), batched to the concurrency cap; (b) ask carried in the **`codex exec` prompt string** the user types; (c) ship sequential-only, mirroring `adapters/pi`, and skip fan-out entirely | **(a)** | Row 15 pins real subagents; (c) discards a live-confirmed capability and is strictly worse than opencode/copilot. (b) puts a load-bearing invariant in a string a human retypes — precisely the drift R-G2 exists to prevent. (a) uses a source Codex's own injected text names as authoritative and keeps the ask single-sourced. **Degradation to sequential is silent, so a test must assert the ask text is present.** **The cap is 4 "including you" — usable fan-out width is 3, and craft's review phase routinely wants more; what `spawn_agent` does at the ceiling is unpinned, so the binding batches to the cap rather than assuming graceful queueing.** |
| 4 | **Git-guard layering — highest risk** | (a) **Hook enforces** (ext-diff + containment via shared `toolCallGuard`, exit 2) **+ a codex-local destructive-git matcher composed alongside it** + `.rules` as defence-in-depth + sandbox mode selected but claiming nothing; (b) hook enforces the shared predicate only; destructive-git left entirely to `.rules`; (c) hook enforces + destructive-git added by **extending the shared predicate** in `gate.js` | **(a)** | Row 12 is the headline: Codex's hook genuinely denies, so **the ext-diff rule ships enforced here — copilot's ADR-243 carve-out does not carry over.** But `.rules` is bypassed by `git -C . push` (row 13a) and may **fail open** on a malformed file (row 13b), so (b) would leave destructive git protected only by a layer that is bypassable *and* possibly fail-open. Moving that set into the denying hook lets a matcher normalize interposed global options the way `GIT_DIFF_SHOW_RE` already does. (c) is cleaner but changes pi/opencode/copilot behaviour — it belongs to candidate 5, not here. **Whichever wins: the `git -C . push` bypass, the fail-open risk, the unmeasured sandbox, and the `--dangerously-bypass-hook-trust` cost all get written down verbatim. An honest carve-out beats a fake guarantee.** **Hard prerequisite (row 12c): Codex's write/edit tool names are unpinned, and an unmapped name fails *open* through the predicate's pass-through tail — so the tool-name map must be read off the request body under the BYOK harness before the adapter is authored, or path containment through this layer is decorative.** |
| 5 | **Lift the binding-neutral predicate to a shared home now?** ⚠️ **scope expansion — user call** | (a) Import `toolCallGuard` from `adapters/pi/src/gate.js` again, as copilot does — codex becomes the **second** cross-adapter importer; (b) **lift to `engine/src/guards/`**, repoint pi + opencode + copilot, leave each binding only its event adapter; (c) duplicate the predicate into `adapters/codex/src/` | **(a) now, (b) as its own scoped change** | **Correction to the brief:** codex would be the *second* importer, not the third, and `adapters/opencode/src/git-guard-predicate.js` is **not** a duplicate of `gate.js` — it is a narrower `gitGuardPredicate(command)` with no event shape and no containment branch. What *is* duplicated character-for-character is `COMPLIANT_MARKERS` / `GIT_DIFF_SHOW_RE` / `REASON_GIT_EXT_DIFF`. So the drift risk is real but narrower than stated. (b) is the right end state and `BACKLOG.md` already parks it — but it **violates this change's own success criterion** ("engine untouched except the additive telemetry sibling"), modifies three shipped bindings, and touches a security predicate that warrants its own review. Bundling it here means a guard refactor lands inside a new-binding change and neither gets reviewed on its own terms. (c) is never right. **This is the user's call and the one place this design most wants a deliberate answer.** |
| 6 | **Telemetry now vs defer** | (a) **Build `collect` + `--source codex` now** against the CONFIRMED `turn.completed` envelope, parsing it wherever it appears, with row 5a recorded as an open DEFERRED row; (b) build now, but **pin the persisted rollout shape first** — read one existing rollout `.jsonl` (read-only), or, if none exists, generate one under a `mktemp` throwaway `CODEX_HOME` with the BYOK harness — then parse that shape exactly; (c) defer the binding until a rollout file is parsed | **(b)** | The token source is CONFIRMED in-stream and Codex is the first binding with **no double-count hazard** — deferring wastes the strongest telemetry position of any binding. But (a) alone risks a parser pinned to the *stream* envelope that silently reports zero against *persisted* files, which is what `--source codex` actually reads. (b) costs one file read, or one throwaway-harness run if the operator has no history, and converts the highest-risk DEFERRED row into a pinned one before a line is written; neither path mutates the real `~/.codex/`. If the shape differs, (b) is the only option that finds out before shipping. **Whichever wins, `docs/adapters/telemetry.md` must document that `--dir` names the `YYYY/MM/DD` leaf and the default root is only the containment boundary — a flat `readdirSync` over `sessions/` silently reports zero, which reads as success.** |
| 7 | **CRAFT_ROOT export mechanism** | (a) **Self-locate from `import.meta.url`**, mirroring pi and copilot, up-walk depth asserted by test; (b) rely on Codex's `CLAUDE_PLUGIN_ROOT` / `PLUGIN_ROOT` substitution in the hook command template; (c) literal `<CRAFT_ROOT>` placeholder in `config.template.toml`, substituted by hand at install (copilot's approach) | **(a)** | Row 17 is **CONFIRMED (strings) / DEFERRED (not exercised)** — the lever was matched in the binary, never observed substituting. Building the root export on it would be designing from an artifact rather than from behaviour, the exact failure this PoC discipline prevents. (a) is proven twice in this tree, has zero external dependency, and fails loud on a wrong up-walk. (c) is strictly worse than (a) here: copilot needed it only because it has **no** plugin-root variable, whereas Codex plausibly does — so a manual placeholder buys nothing. `CLAUDE_PLUGIN_ROOT` stays available as an unproven convenience and becomes a candidate for a follow-up once exercised. |
| 8 | **Ship `adapters/codex/stryker.conf.json` now?** ⚠️ **touches the harness** | (a) Ship one for `adapters/codex/src/**`, matching pi; (b) defer, matching copilot and opencode; (c) **extend `engine/stryker.conf.json` to cover all adapter sources** and wire it into the validation probe, retiring pi's orphan | **(b) for this change; raise (c) as the real fix** | **Correction to the brief's framing:** pi "has one" but it is wired into **nothing** — no npm script references `adapters/pi/stryker.conf.json`, and `.claude/workflow.md`'s mutation probe is `test -f engine/stryker.conf.json` exclusively. So pi is not a working precedent, it is an unexecuted config file. Shipping (a) reproduces that: a file that looks like coverage and runs never. `BACKLOG.md` already parks "Mutation-cover the adapter sources" and correctly names the guard seams as the place where a weak assertion is a *security* risk. (c) is the honest fix but is a harness change, not a binding change. **Recommendation: defer here, and land (c) as its own scoped change — noting the guard seams ship un-mutation-covered in the meantime.** |
| 9 | **Proof strategy** | (a) **Deterministic seams in `scripts/ci.sh` + one on-demand smoke**, with the BYOK fake-provider harness committed as a developer-run probe (never CI-gated) and a fast-failing `codex` `PATH` stub mandatory; (b) same, plus CI-gate `codex execpolicy check` against the generated `craft.rules`; (c) deterministic seams only, no smoke, no harness | **(a)** | (b) is superficially attractive — `execpolicy check` is deterministic, offline, and auth-free, which is genuinely rare — but it needs the 248 MB `codex` binary present, which CI does not have and should not install. The right split: **CI asserts the generated rules *text*** (a pure string/structure seam), and the *matcher semantics* stay in the PoC record as an on-demand matrix. The BYOK harness makes guard **behaviour** provable at zero cost and zero auth on a developer machine — the most valuable non-CI artifact this binding can ship — but it needs the real binary, so it can never gate. (c) throws that away. **The `PATH` stub is not optional: `codex` is installed on developer machines and an un-stubbed test costs minutes and quota.** |
| 10 | **Contract-equivalence framing** | (a) **Reuse `AGENT_VARIANTS`/`INLINE_VARIANTS`** → the Codex block is byte-identical to Claude's (zero-line diff); add a fourth binding-fidelity test asserting a `codex` hint is ignored; (b) add a codex-specific variant set; (c) reuse the variants but add no new test | **(a)** | Codex is agent-mode with real subagents, so it takes the same carve-outs as Claude, opencode, and copilot. ADR-220/239/248 make this a settled pattern with a zero-line-diff precedent; (b) would introduce a third variant set and break the "exactly two differing lines" invariant that `contract-equivalence.test.js` exists to defend. (c) saves ~15 lines and forfeits the assertion that a future change never keys a variant off the binding name — the exact regression the existing three tests guard. |
| 11 | **Cache/reasoning token arithmetic** | (a) `input = max(0, input_tokens - cached_input_tokens)`, `cacheRead = cached_input_tokens`, `output = output_tokens`; (b) `input = input_tokens`, `cacheRead = cached_input_tokens` (treat as disjoint, the Anthropic convention); (c) `input = input_tokens`, `cacheRead = 0` — drop the breakdown | **(a)** | Whether `cached_input_tokens ⊂ input_tokens` is **not pinned**, and the two vendor conventions disagree. (a) is the only mapping whose **total is exactly `input_tokens` under either convention** — if the subset assumption is wrong, the attribution shifts between input and cache-read but the sum never moves. (b) **inflates every reported cost** if cached is a subset (the OpenAI Responses convention, which Codex speaks — row 18). (c) never over-reports but discards cache-hit visibility for no gain over (a). Same logic for reasoning: `output = output_tokens` alone is exact if reasoning ⊂ output and under-reports otherwise; **adding them is the only variant that can over-report**. Record both as DEFERRED rows closable by summing one real turn. |
| 12 | **Which real model ids the three craft tiers bind to** | (a) `opus → gpt-5.6-sol`, `sonnet → gpt-5.6-terra`, `haiku → gpt-5.4-mini`, with efforts `high`/`medium`/`low`; (b) all three tiers → a single mid id (e.g. `gpt-5.5`), differentiated **only** by `model_reasoning_effort`; (c) ship `auto`-equivalent placeholders and pin after a live smoke, as copilot did | **(a)** | Unlike copilot, Codex's catalog is **CONFIRMED with no auth** (`codex debug models`, row 16), so (c) — copilot's forced choice — is an unnecessary placeholder here. `gpt-5.6-sol` is the pinned frontier model at priority 1, matching the opus tier's role. (b) under-serves the opus tier on the phases where craft deliberately spends. **Row 16a makes this higher-stakes than it looks: an unknown id does not error — it falls back with a warning and *changes which tools are registered*, potentially removing `multi_agent_v1` and silently collapsing fan-out to sequential.** So the ids must fail loud locally and be cross-checked against the auth-free catalog. The `ultra` effort level exists only on `sol`/`terra` and must not be mapped to a tier that can resolve elsewhere. |

## Test strategy

Deterministic seams, all runnable in CI with no auth, no quota, and **no real `codex` binary**.

**Mandatory `PATH`-stub discipline.** `codex` *is* installed on developer machines. Any test that
could reach it must assume CI **absence** and exit fast, so the suite prepends a fast-failing `codex`
stub to `PATH` to reproduce CI conditions. Without it a test that shells out costs minutes and real
quota locally while passing vacuously in CI — the worst of both.

| Suite | Proves | Key fixtures / edges |
|---|---|---|
| `test/git-guard-adapter.test.js` | Codex event → shared predicate shape | `exec_command` with `cmd` as a **string** (never argv) maps to the Bash branch; write-tool name mapping covers only tools the predicate branches on **and only names pinned off a real request body** (row 12c — a guessed name yields a suite that passes while enforcing nothing); malformed/absent args fail **closed**; the executed path is bridged **unconditionally** — **decoy test**: an in-tree inspected field plus an out-of-tree executed field must block; unknown tool passes through; `__proto__`/`constructor` as a tool name falls through to the raw name |
| `test/git-guard-predicate.test.js` | shared predicate reused verbatim | mirrors `adapters/copilot/test/git-guard-predicate.test.js`, including the assertion that the adapter source **imports** the shared module rather than re-declaring it |
| `test/craft-guard-hook.test.js` | the hook **enforces** | exit code **2** on a block verdict with the reason on **stderr** (the live-proven denial contract); exit **0** on pass; a throwing guard exits 2, not 0 — the inverse of copilot's observer, whose always-exit-0 is deliberate. **This is the test that distinguishes a real guard from a recorded verdict** |
| `test/execpolicy-rules.test.js` | generated `craft.rules` text | `prefix_rule` form with nested-list alternation; every rule carries a `justification`; no rule degenerates to a bare `pattern=["git"]` (which would deny all git); the file parses as the pinned grammar. **A companion test asserts the README/gate.md text names the `git -C . push` bypass** — the honesty claim is load-bearing enough to assert |
| `test/launch-args.test.js` | sandbox + trust posture | sandbox mode is explicit, never defaulted; `danger-full-access` is **never** emitted; **`--ephemeral` is never emitted** — it suppresses the session files `--source codex` mines, turning telemetry into a silent zero; `--dangerously-bypass-hook-trust` appears only where hook enforcement requires it and is accompanied by its documented rationale |
| `test/model-tier-map.test.js` | tier → id + effort | override precedence; unknown tier **throws** (fail-loud, given row 16a); own-property lookup (`__proto__`/`constructor` throw, never resolve); `ultra` never maps to a tier that can resolve off `sol`/`terra` |
| `test/craft-root.test.js` | CRAFT_ROOT resolver | up-walk depth asserted **from the real file location**, never assumed; non-existent root throws; missing `engine/bin` throws; non-`file://` moduleUrl throws |
| `test/native-surface.test.js` | R-G2 / ADR-251 single-sourcing | `adapters/codex/skills/` does **not** exist (a re-copy fails loudly); agent bodies **byte-identical** to `agents/*.md`; frontmatter model/effort agree with the tier map; the launch contract names the shared `skills/` tree by reference and cites `skills/run/SKILL.md`, which must exist; **the entrypoint carries the explicit delegation ask** (candidate 3 — degradation is silent, so absence must be caught by a test); provenance-ref, shell-injection, and bare-`${CLAUDE_PLUGIN_ROOT}` checks over every adapter surface with **no carve-out** |
| `test/config.test.js` | `config.template.toml` + `hooks.json` | `hooks.json` carries the **`{description, hooks}` wrapper** — a flat `{"PreToolUse":[…]}` is rejected by Codex and must be rejected here; the PreToolUse entry is well-formed (`type: "command"`); the `matcher` is the broadest value the schema accepts while row 12d is unpinned, so filtering stays in the predicate rather than in an unverified matcher; no `danger-full-access`; provider-neutral, no model pin outside the tier map's vocabulary |
| `engine/test/observability/codex-telemetry.test.js` | `collect` | `turn.completed.usage` → `UsageEvent[]`; **cache arithmetic**: a fixture where `cached_input_tokens < input_tokens` totals exactly `input_tokens` (candidate 11's sum-safety asserted directly); reasoning tokens not double-added; session id **held across the stream** and stamped on later events (pi's pattern); malformed line skipped **and counted**, never thrown; non-finite tokens coerce to `0`; **never throws** (port contract); empty input → `[]`; `since` cutoff compares **epoch-normalized on both sides** — an ISO-vs-numeric fixture must not fail open |
| `engine/test/observability/read-root.test.js` | `DEFAULT_READ_ROOTS.codex` | `CODEX_HOME` set resolves under it; unset falls back to `~/.codex/sessions`; thunk **re-reads env per invocation**, never frozen at module load; a nested-date fixture documents that `--dir` names the leaf |
| `engine/test/contract-equivalence.test.js` | invariant block | a `codex` binding hint is **ignored** → zero-line diff vs plain agent-mode assembly; agent vs inline still differ on **exactly two** lines |
| `test/living-corpus.test.js` | doc surface stays enumerated | `docs/adapters/codex-poc-record.md` added to the pinned `EXPECTED` set — **this suite is RED on the branch today** (see Context) and must go green in the first commit |
| `test/every-test-file-registers.test.js` + `scripts/ci.sh` | wiring | `{ label: 'adapters/codex', dir: … }` in `SUITE_DIRS` **and** `run_suite adapters/codex adapters/codex/test adapters/codex` in `ci.sh` — same commit, per the success criteria |

**Property lens.** The telemetry parser is a parse/aggregate pair, so a round-trip lens over
`turn.completed → UsageEvent → aggregate` is warranted: for any generated set of well-formed turns,
`sum(input + cacheRead)` must equal `sum(input_tokens)` exactly. That single property is what makes
candidate 11's sum-safety a mechanical guarantee rather than a comment.

**What is deliberately not asserted.** `docs/adapters/gate.md`'s Codex section and the enforcement
prose in `README.md` are lints-for-structure, not for content. Their correctness rides on review
against the layer table above, not on a suite. Stating that plainly is better than implying coverage
that does not exist: the *behaviour* is covered by the guard and hook suites; only the *description*
is unasserted. The one exception is the `git -C . push` bypass disclosure, which is asserted by
grep — an honest carve-out silently deleted later would be worse than never having written it.

**Optional, never CI-gated.** The BYOK fake-provider harness (`wire_api = "responses"`, SSE chunks,
`exec_command` taking `cmd` as a string) ships as a developer-run integration probe, giving a
zero-cost, zero-auth, offline end-to-end check of hook denial and execpolicy behaviour. It requires
the real binary, so it can never gate — but it is the highest-value non-CI artifact in this change.

## Out of scope

- Forking the engine or the invariant contract — the whole point is one core, five bindings.
  `contracts/**` and `engine/src/contract.js` stay byte-unchanged.
- Inventing a topology Codex lacks — it has a real `multi_agent_v1` model with a pinned 4-slot
  concurrency limit; nothing is fabricated, and the limit is respected rather than rounded up.
- Re-doing the claude/pi/opencode/copilot bindings. **The one possible exception is decision
  candidate 5**, which would repoint three bindings at a lifted predicate — flagged there as a
  deliberate scope expansion requiring the user's explicit call, not absorbed silently.
- Deduplicating the acceptance-probe harness. `adapters/codex/src/probe.js` will be a **fourth**
  near-verbatim copy of the pi/opencode/copilot harness. `BACKLOG.md` already parks the extraction;
  doing it here would touch three sibling bindings for a cleanup unrelated to this binding.
- Extending `engine/stryker.conf.json` to cover adapter sources (candidate 8's option (c)) — the
  right fix, but a harness change rather than a binding change.
- CI-gating a live Codex run — cost, flakiness, and a 248 MB binary CI has no reason to install.
  On-demand smoke only.
- Paid-quota engineering. A real-model smoke needs `codex login` or an API key; the BYOK harness
  removes the need for it across every deterministic seam.
- Mutating the operator's real `~/.codex/`. Every state-touching probe runs under a `mktemp`
  throwaway `CODEX_HOME` — **including `--help`-shaped invocations**, which the PoC record proves
  fall through to the TUI and open real state databases on an unrecognized subcommand.
- Byte-identical Claude affordances — the nearest native affordance is the target. Codex has no
  `/craft:*` command namespace and none is simulated.
- `docs/adapters/memory.md`, `vcs.md`, `policy.md` `Binding set` edits — this change binds none of
  those ports, and a blanket uniform edit would be a lie about what ships.
- `docs/adapters/backlog.md` / `intention.md` `Binding set` edits — those files carry no such line.
