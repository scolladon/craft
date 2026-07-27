# Design — native pi binding: convert the headless `craft-pi` adapter into a discoverable pi package

> Brief: upgrade the **pi** Execution-port binding from a headless `craft-pi` subprocess bin into a
> NATIVE, `pi install`-able package (skills + prompt-template entrypoints + a git-guard extension +
> a provider-neutral settings template + a telemetry sibling), driving the SAME engine core under the
> SAME engine-owned invariant contract — no engine fork. The binding set stays `{ claude, pi, opencode }`;
> this upgrades pi's SHAPE, not the set.
> Status: draft → self-reviewed ×3 → accepted

## Context

### The as-is: a proven headless pi binding, no discoverable surface

Craft is a hexagonal feature-delivery engine (`docs/DESIGN-customizable-engine.md`): a thin
orchestrator walks a declarative phase-descriptor list behind explicit ports (Execution, Model,
Memory, Telemetry, VCS, Policy, Backlog, Intention). The engine core — `engine/bin/*` shims over
`engine/src/**`, `contracts/*.md`, `pipeline/default.yml`, `templates/`, the `scripts/*.sh` lints —
is runtime-neutral plain Node/bash and **self-locates** (every bin computes its root from
`import.meta.url`; `grep -r CLAUDE_PLUGIN_ROOT engine/` returns nothing).

The pi binding already exists as a headless subprocess adapter under `adapters/pi/`
(ADR-085…091). It PROVES the Execution/Model/Gate seams on a non-Claude runtime, with deterministic
unit-tested seams and one on-demand live smoke (`docs/adapters/pi-poc-record.md`, Gemini free tier,
`@earendil-works/pi-coding-agent@0.79.8`). What it lacks is a **discoverable native surface**: there is
no `pi install`-able package, no pi-native skills, no `/craft:*`-equivalent entrypoint. A pi user
cannot install craft and drive it interactively the way an opencode user now can.

Meanwhile the **opencode** binding (`adapters/opencode/`, ADR-215…228) landed a full native packaging:
`opencode.json`, thin `commands/craft-*.md` dispatchers, `agents/craft-*.md` subagents, a
`plugins/git-guard.ts`, pure unit-tested `src/*.js` seams, a telemetry sibling, and an on-demand live
smoke record. This design ports that *native-packaging* pattern to pi — reusing everything the pi
adapter already proves, adding only the discoverable surface, mirroring opencode section-for-section
where pi's primitives permit and carving out where they differ (pi has **no subagents**).

### The precedents this design mirrors (binding, not beside)

- **`docs/adapters/execution.md`** — the Execution port. `spawn(role, ctx)` / `runInline(ctx)`; core
  policy (when to spawn, fan-out, dead-worker-respawn) is NOT a port verb. The Pi section already
  documents: pi omits subagents → **sequential per-phase runs**; the artifact-handoff invariant
  carries state where Claude would fan out. This design keeps that verbatim and does not fabricate a
  subagent model.
- **`docs/adapters/model.md`** — the Model port. `select` / `isAvailable`; resolution ORDER
  (`manifest models.<role>` → descriptor `model:` → `models.fallback` → engine default `sonnet` →
  session model) is core policy, restated nowhere. The Pi section maps tier → `provider/model` via a
  registry; this design keeps the map adapter-local and the manifest tier-string-only.
- **`docs/adapters/telemetry.md`** — vendor-neutral `UsageEvent[]`; the `collect` binding lives at
  `engine/src/observability/adapters/<binding>/telemetry.js`. `aggregate` + `serializeReport`
  (`JSON.stringify(sortDeep(report), null, 2) + '\n'`, byte-stable) are the pure reused core. A `Pi`
  binding section is **RESERVED** there (§D6 reconciles its current wording); the front-door
  `usage-mine-main.js` carries a `--source claude|opencode` selector this design extends to `pi`.
- **`contracts/core.md`** + `engine/src/contract.js` — the two substitution markers
  `@@ARTIFACT_HANDOFF@@` / `@@MODEL_RESOLUTION@@`, expanded line-by-line by `applyCarveOuts` against
  `AGENT_VARIANTS` / `INLINE_VARIANTS`. `engine/test/contract-equivalence.test.js` proves agent vs
  inline differ by **exactly two lines** per descriptor. A new runtime binding adds **no** variant
  (the pi headless bin already assembles in agent mode and introduces zero carve-out variants).
- **`adapters/pi/**`** — the seams this design REUSES (do not re-author): `gate.js#toolCallGuard`
  (the pure git-diff + path-containment predicate), `tool-call-hook.js#adaptPiEvent` (pi tool-event
  wiring + `symlinkRecheck`), `execution.js#buildPiArgs` (reused; `parseUsage` is **aligned** to
  pi 0.80.10's `message.usage`, not reused verbatim — R-10/ADR-234/§D6b), `roleless.js` +
  `roleless-probes.js` (pi has no subagents — role-less steps for workspace/decisions/propose/
  integrate), `probe.js#runAcceptanceProbe`, `engine.js` (engine-bin invocation wrapper),
  `run.js`, `cli.js`, `.claude/workflow.md` (provider-neutral manifest fixture).

### Constraints inherited from the codebase (binding — do not re-open)

- **ADR-085**: adapter code lives under top-level `adapters/<name>/`; `engine/**` stays core-only —
  **except** the telemetry `collect` binding, whose established home is
  `engine/src/observability/adapters/<binding>/`. Both precedents apply; §D6 reconciles them.
- **ADR-086/090**: the pi adapter is selected via a separate entrypoint and executes via CLI
  subprocess; the ports are documented seams only (ADR-087/091). The native surface is **additive** to
  the headless bin, not a replacement (Non-goal below).
- **Engine-bin shim convention**: bins are ~5-line shims over `engine/src/<name>-main.js`; ALL logic in
  `engine/src/**` (Stryker mutates `engine/src/**` only); bin spawn-smoke in
  `engine/test/<name>.bin.test.js`. The telemetry sibling honours this.
- **Provenance is one-way**: no phase/ADR/backlog refs inside source or test; this design doc and the
  PR body carry provenance. The adapter code must not.
- **Advisory ports never gate**: telemetry is advisory (`telemetry.md` "never gates a run").
- **Injected contract is engine-owned**: `contracts/core.md` floors are preserved verbatim;
  binding-specific wording enters ONLY at the two carve-out markers.
- **`.claude/workflow.md` + `.claude/craft-*.md`** are repo-local markdown the engine roots at the repo
  ROOT (never `${CLAUDE_PLUGIN_ROOT}`). pi discovers `.pi/`; the engine reads `.claude/` via `fs`
  regardless of any harness's context loader.

### External contract — pinned empirically against the live binary (never designed from memory)

pi's extensibility is an **external contract** and was pinned against the **live binary** installed at
`/Users/scolladon/.n/bin/pi` (`@earendil-works/pi-coding-agent@0.80.10`, `dist/cli.js`) plus the docs
that ship *with that exact version* (`node_modules/@earendil-works/pi-coding-agent/docs/*.md`) and real
`--mode json` / `--list-models` runs. Every state-mutating probe (`pi install`, `pi config`) was run
under an isolated `HOME=$(mktemp -d)` + `PI_CODING_AGENT_DIR=$(mktemp -d)` so the user's real pi config
was never touched. The full CONFIRMED-via-live vs DEFERRED-to-smoke matrix is Design §D2.

Provenance for this design: `docs/design/opencode-adapter.md` + `docs/adapters/opencode-poc-record.md`
(native-packaging pattern) · `docs/adapters/{execution,model,telemetry}.md` (port shape) ·
`adapters/pi/**` + `docs/adapters/pi-poc-record.md` (binding precedent) ·
`engine/src/observability/adapters/{claude,opencode}/telemetry.js` + `usage-mine-main.js` +
`usage-aggregate.js` (telemetry seam) · `engine/src/contract.js` + `contracts/core.md` (carve-out
seam) · ADR-085…091 (pi decisions) / ADR-215…228 (opencode decisions; the pi ADRs parallel these, next
free number **229**) · **pi 0.80.10 live binary + shipped docs (probed 2026-07-19)** (external matrix §D2).

## Requirements

Each success criterion below is a verifiable statement.

- **R-1 — Engine untouched except additively.** `git diff` shows no *functional* change under
  `engine/` (excluding the additive `engine/src/observability/adapters/pi/telemetry.js` sibling and a
  generic, binding-neutral `--source pi` selector + source-aware read-root — §D6), `contracts/`,
  `pipeline/`, `templates/`, and the lint logic in `scripts/`. Any engine touch is generic (benefits
  every source) and named as its own decision — never a pi special-case.
- **R-2 — Native discoverable surface, single-sourced.** A pi user can `pi install` the adapter and
  invoke a `/craft:*`-equivalent for the phases; the invariant procedure text is single-sourced from
  the shared craft skill bodies / contract, NOT re-authored (the R-G2 rule opencode already holds).
- **R-3 — Git-guard reused as the native guard.** The git-diff-and-path guard is bound via pi's real
  `tool_call` extension event, reusing `gate.js`'s pure predicate — no new predicate authored (§D7).
  Because the guard predicate keys off Claude tool names/fields, the pi event adapter bridges pi's real
  0.80.10 shapes (`event.toolName`, lowercase tool names, `path` write field, return-to-block).
- **R-4 — Provider-agnostic model binding.** A committed default tier→`provider/model` map (Anthropic
  ids confirmed present in `pi --list-models`), fully swappable, keeping `.claude/workflow.md`
  provider-neutral (tier strings only); proven against one reachable provider in the smoke.
- **R-5 — Telemetry sibling built + `--source pi`.** `engine/src/observability/adapters/pi/telemetry.js`
  parses the pinned `pi --mode json` event shape → the vendor-neutral `UsageEvent[]`, reusing
  `aggregate`/`serializeReport` unchanged; `usage-mine-main.js` accepts `--source pi` (§D6).
- **R-6 — Contract-equivalence, provable.** The assembled injected block under the pi native binding
  differs from the Claude binding's, per phase+mode, by **at most the two carve-out lines**
  (`@@ARTIFACT_HANDOFF@@` / `@@MODEL_RESOLUTION@@`) — asserted mechanically against
  `engine/test/contract-equivalence.test.js` (§D5). Reusing the same variant sets makes the actual
  diff zero.
- **R-7 — Role-less/sequential preserved.** pi has no subagents; the design keeps the documented
  role-less per-phase-run semantics and fabricates no subagent model (Execution port Pi section, §D4).
- **R-8 — Deterministic seams green in CI.** The git-guard (predicate + pi event adapter), the tier
  map, the telemetry parser, the CRAFT_ROOT resolver, and the contract-equivalence assertion have
  `node --test` coverage with no new engine-level runtime dependency (§Test strategy).
- **R-9 — On-demand live smoke.** One construction phase end-to-end through the native pi surface on a
  reachable provider, recorded by extending `docs/adapters/pi-poc-record.md` (not CI-gated; ADR-089
  parity) (§Test strategy).
- **R-10 — Headless `parseUsage` aligned to the installed pi.** `adapters/pi/src/execution.js#parseUsage`
  reads pi 0.80.10's assistant `message.usage` shape (`{input,output,cacheRead,cacheWrite,…}`, §D2 row 15)
  — the SAME pinned shape the telemetry sibling (R-5) consumes — so the headless bin's usage extraction
  works against the installed pi (it was dead against the removed `{type:"usage"}` event). Proven by a
  RED→GREEN `node --test` over the pinned `message.usage` (§D6b, §Test strategy; ADR-234).

## Design

### D1 — Two-layer split

Same split as every binding: the **engine-owned protocol** (unchanged, self-locating) and the **pi
binding** (native in shape). The native pi binding is a set of declarative resources (skills,
prompt templates, a settings template) plus exactly two real code seams (the git-guard extension and
the tier map) plus a telemetry sibling — driven by pi itself reading its `packages`/`skills`/
`prompts`/`extensions` resources, NOT by a JS pipeline driver (that is the headless bin, kept
additive). The headless `craft-pi` bin (`run.js`) remains the subprocess Execution binding; the native
surface adds interactive discoverability on top of the same engine.

```
ENGINE-OWNED (unchanged, reused byte-for-byte)          PI NATIVE BINDING (new + reused)
────────────────────────────────────────────           ─────────────────────────────────────
engine/bin/*  → engine/src/**   (self-locating)         adapters/pi/
contracts/*.md  (core + bundles)                          package.json          (+ `pi` manifest, keyword pi-package)
pipeline/default.yml                                      settings.template.json (provider-neutral resources)
templates/*                                               prompts/craft-*.md    (thin /craft-* dispatchers)
scripts/*.sh   (lints, worktree-setup)                    skills/               (single-sourced procedure bodies)
.claude/workflow.md + .claude/craft-*.md (repo-local)     extensions/craft-guard/  (tool_call guard + flag + CRAFT_ROOT export)
                                                          src/  (REUSED: gate.js, tool-call-hook.js, execution.js,
engine/src/observability/                                       roleless*.js, engine.js, run.js, cli.js, probe.js;
  usage-aggregate.js (pure aggregate)                          NEW: model-tier-map.js, craft-root.js)
  serializeReport (byte-stable)                           test/*.test.js         (node --test seams)
  usage-mine-main.js (+ `--source pi` + read-root)       engine/src/observability/adapters/pi/
                                                            telemetry.js         (collect binding — NEW)
                                                          docs/adapters/pi-poc-record.md  (extend)
```

### D2 — Pinned external pi matrix (the spine)

Probed against **pi 0.80.10** (live binary + shipped `docs/*.md` + real `--mode json`/`--list-models`
runs, 2026-07-19). `C` = CONFIRMED-via-live; `D` = DEFERRED-to-live-smoke (pin at implementation time
in the throwaway smoke, mirroring how pi deferred its `@0.79.8` run and opencode its `1.18.3` run).

| # | Fact (load-bearing) | Value pinned against 0.80.10 | Status |
|---|---|---|---|
| 1 | Binary / package | `pi 0.80.10`, `@earendil-works/pi-coding-agent`, bin `dist/cli.js`; ships `docs/*.md` for the exact version | C |
| 2 | Config / isolation env | `PI_CODING_AGENT_DIR` (default `~/.pi/agent`), `PI_CODING_AGENT_SESSION_DIR`, `PI_PACKAGE_DIR`, `PI_OFFLINE` — the state-mutating-probe isolation seam | C |
| 3 | Settings scope | global `~/.pi/agent/settings.json`, project `.pi/settings.json`; project overrides global (nested objects deep-merged) | C |
| 4 | Resource settings keys | `packages[]`, `extensions[]`, `skills[]`, `prompts[]`, `themes[]`, `enableSkillCommands`; arrays take globs + `!excl` + `+incl`/`-excl` | C |
| 5 | Package install sources | `pi install <npm:@s/p@v \| git:host/u/r@ref \| https:// \| ssh:// \| /abs \| ./rel>`; `-l/--local`→`.pi/settings.json`, default→user; **local path added to settings WITHOUT copying**; `-e/--extension` = temp one-run | C |
| 6 | Package manifest | `package.json` `pi` key `{extensions,skills,prompts,themes}` + `keywords:["pi-package"]`; OR convention dirs `extensions/`(.ts/.js), `skills/`(SKILL.md dirs + top-level .md), `prompts/`(.md), `themes/`(.json) | C |
| 7 | Skill discovery | `~/.pi/agent/skills/`, `~/.agents/skills/`, `.pi/skills/`, `.agents/skills/` (walk to git root), package `skills/`, settings `skills[]`, `--skill` (additive even with `--no-skills`); SKILL.md dirs found recursively | C |
| 8 | Skill frontmatter | `name`(≤64, `^[a-z0-9]+(-[a-z0-9]+)*$`), `description`(≤1024); optional `license`/`compatibility`/`metadata`/`allowed-tools`/`disable-model-invocation`; **pi allows `name` ≠ dir name** (unlike the Agent-Skills standard); unknown fields ignored; missing `description`→not loaded | C |
| 9 | Skill invocation + cross-harness reuse | `/skill:name [args]` (args appended `User: <args>`); `enableSkillCommands` toggles; `skills:["~/.claude/skills","../.claude/skills"]` reads Claude/Codex skill dirs directly | C |
| 10 | Prompt templates (the `/craft-*` seam) | dirs `~/.pi/agent/prompts/*.md`, `.pi/prompts/*.md`, package `prompts/`, settings `prompts[]`, `--prompt-template`; `/<filename>` command; `$1`/`$@`/`$ARGUMENTS`/`${1:-default}`/`${@:N:L}`; frontmatter `description`/`argument-hint`; **non-recursive; NO shell-injection at expansion** (unlike opencode `` !`cmd` ``) | C |
| 11 | Extension locations / shape | `~/.pi/agent/extensions/*.ts\|*/index.ts`, `.pi/extensions/*.ts\|*/index.ts`, settings `extensions[]`/`packages[]`; `export default function(pi){}` (sync/async), loaded via jiti (TS, no compile); imports `@earendil-works/pi-coding-agent`,`typebox`,`@earendil-works/pi-ai`,`@earendil-works/pi-tui`, node builtins | C |
| 12 | Extension API | `pi.on(event,h)`, `pi.registerTool`, `pi.registerCommand(name,{description,handler})` (real `/name` slash cmd, arbitrary name), `pi.registerFlag(name,{type,default})` (the `--plan` mechanism), `pi.registerShortcut`, `pi.exec(cmd,args,opts)`, `pi.get/setActiveTools`, `pi.setModel`; `ctx.cwd`, `ctx.mode`∈`{tui,rpc,json,print}`, `ctx.hasUI`, `ctx.isProjectTrusted()`, `CONFIG_DIR_NAME` export | C |
| 13 | `tool_call` event (git-guard) | `pi.on("tool_call",(event,ctx))` fires before execution, **blocks by RETURN `{block:true,reason?}`**; `event.toolName` (lowercase `bash\|read\|write\|edit\|grep\|find\|ls`), `event.toolCallId`, `event.input` (mutable; bash `{command,timeout?}`, read `{path,offset?,limit?}`); `isToolCallEventType` narrows | C |
| 14 | write/edit tool input field | `path` + `content` (**NOT** Claude's `file_path`) — pinned from the shipped tool schema | C |
| 15 | `--mode json` event stream | typed lines: `session`(header `{version,id,timestamp,cwd}`)/`agent_start`/`turn_start`/`message_start`/`message_update`/`message_end`/`turn_end`(`{message,toolResults}`)/`agent_end`(`{messages}`)/`agent_settled`/`tool_execution_{start,update,end}`; assistant `message.usage={input,output,cacheRead,cacheWrite,totalTokens,cost{…}}`, `message.model`, `message.provider`, `message.stopReason`; **NO top-level `{type:"usage"}` event** | C |
| 16 | Tool control flags | `--no-tools/-nt`, `--no-builtin-tools/-nbt`, `--tools/-t`, `--exclude-tools/-xt`; built-ins read/bash/edit/write (grep/find/ls off by default) | C |
| 17 | Model binding | `--provider`, `--model provider/id[:thinking]`, `--models`, env keys; `pi --list-models` shows `anthropic claude-haiku-4-5 / claude-sonnet-4-5 / claude-opus-4-5 / …` → tier map feasible; default provider `google` | C |
| 18 | Context files | reads `AGENTS.md` + `CLAUDE.md`; `--no-context-files/-nc` | C |
| 19 | **Project trust (operationally load-bearing)** | non-interactive `-p`/`--mode json`/`--mode rpc` show NO trust prompt; use `defaultProjectTrust` (`ask` default & `never` **ignore** project resources; `always` trusts); `--approve/-a` overrides per-run; saved in `~/.pi/agent/trust.json` | C |
| 20 | headless `-p` stdin | pi hangs on an open stdin pipe in `-p` mode → must spawn with stdin `/dev/null` (pi-poc note; re-confirmed) | C |
| 21 | CRAFT_ROOT export feasibility | an extension factory runs Node before `session_start` → can `process.env.CRAFT_ROOT = <resolved>`; `CONFIG_DIR_NAME` for `.pi`; extension self-locates via its module path (adapters/pi → repo root) | C |
| 22 | live `--mode json` run | a real Anthropic `--mode json` run emitted the pinned envelope; usage numbers were `0` (account credit-balance error) — envelope/fields pinned, **real non-zero usage values deferred** | C/D |
| 23 | bash tool inherits `process.env.CRAFT_ROOT` set by an extension end-to-end | the export→`${CRAFT_ROOT:-…}`-in-skill-body path resolving through pi's bash tool | **D** |
| 24 | non-error `--mode json` usage numbers + canonical usage line choice | which of `message_end`/`turn_end` carries settled per-turn usage without double-count, with real values | **D** |
| 25 | persisted pi session-file line schema parity with `--mode json` | the telemetry `--dir` source (session `.jsonl` under `~/.pi/agent/sessions`) vs the live stream | **D** |
| 26 | `/craft:*` entrypoint carries per-phase dynamics | whether a prompt-template/skill/`registerCommand` cleanly threads phase id + part text + gate + artifact paths in a live TUI | **D** |
| 27 | trusted native install end-to-end | `pi install ./adapters/pi -l` + `.pi/settings.json` + `--approve` loads craft skills+extension and runs a construction phase (the smoke itself) | **D** |
| 28 | `edit` tool full arg schema beyond `path`/`content` | old/new-string field names (only needed if a path guard inspects edit args) | **D** |

**Tally: 21 CONFIRMED-via-live (row 22 straddles C/D), 6 DEFERRED-to-smoke.** The D-rows are the
live-smoke agenda for `docs/adapters/pi-poc-record.md` (R-9), pinned to an exact pi version at
implementation time.

### D3 — Native surface (skills + prompt-templates + one extension)

pi exposes **three** first-class discoverable mechanisms (row 10, 12, 9). The design uses all three by
concern, single-sourcing every load-bearing rule:

- **Procedure bodies = skills, single-sourced.** The craft phase procedures live in the repo's craft
  skill bodies. pi reads them via a `skills[]` settings entry pointing at the craft skill directories
  (row 9 lets pi consume `.claude/skills`-style dirs and arbitrary paths). No procedure text is
  re-authored — this is the exact R-G2 rule opencode holds. Skills surface as `/skill:<name>` and are
  loaded on-demand (progressive disclosure).
- **`/craft:*` entrypoints = thin prompt templates.** `adapters/pi/prompts/craft-run.md` (and one per
  exposed phase) is a thin dispatcher: `description` + `$ARGUMENTS`, whose body instructs the model to
  load the corresponding craft skill and run the phase with the given arguments. This is the closest
  native analog to opencode's `commands/craft-run.md` thin dispatcher. Because pi prompt templates do
  **not** run shell at expansion (row 10, unlike opencode's `` !`cmd` ``), the template carries no
  engine-bin invocation itself — the *skill body* tells the model to run
  `node ${CRAFT_ROOT}/engine/bin/*.js` via the bash tool. Filename `craft-run.md` → `/craft-run`
  (colon-in-filename is avoided; `/craft-run` is the pi-native rendering of `/craft:run`).
- **Code seam = one extension.** `adapters/pi/extensions/craft-guard/index.ts` carries the three code
  responsibilities pi routes through an extension: the `tool_call` git-guard (§D7), the CRAFT_ROOT
  export (§D8), and any craft flags via `pi.registerFlag` (the `--profile`/`--skip` analog). It is a
  thin TS wrapper importing the reused `../src/*.js` seams (jiti imports JS transparently).

The whole tree ships as a **pi package** (row 5/6): `adapters/pi/package.json` gains a `pi` manifest
`{ extensions, skills, prompts }` + `keywords:["pi-package"]`, so `pi install ./adapters/pi` (or
`-l` for project scope) registers all three resource kinds. Local-path install adds to settings
**without copying** (row 5), so the in-place repo layout (DC-2) needs no build/emit step.

**Operational gate — project trust (row 19).** Because craft's native run is non-interactive-capable
(`-p`/`--mode json`), project-local `.pi/` resources and the project extension load only when trust is
satisfied: pass `--approve` per-run, OR set `defaultProjectTrust:"always"`, OR save a trust decision.
The install/README documents `--approve` as the smoke path and `defaultProjectTrust` as the
committed-repo path. This is the pi analog of opencode's config-load ordering and is called out
because a silent trust-default of `ask`/`never` would drop the guard extension (a safety regression).

### D4 — Execution & Model port pi-binding sections (already present; keep + tighten)

The Execution and Model port docs already carry a **Pi binding** section (`{ claude, pi, opencode }`).
This design keeps them and tightens the wording to the native surface — no new port verbs.

**`docs/adapters/execution.md` — Pi binding (unchanged in substance).** `spawn(role, ctx)` = a fresh
`pi -p "<injectedBlock + dynamics>"` per phase (execFile, argv array, stdin `/dev/null` — row 20);
`runInline` = sequential per-phase subprocess. **pi omits subagents → sequential per-phase runs; the
artifact-handoff invariant carries state where Claude would fan out** (ADR-090: execution via CLI
subprocess). The native surface changes *discoverability*, not this topology: the interactive
`/craft-run` orchestrates the SAME proven sequential per-phase walk (reusing `run.js`/`cli.js` +
`engine.js`'s engine-bin invocation), never spawning a nested worker, with the TUI session carrying the
interactive decision/escalation prompts (the `AskUserQuestion` analog). The carve-out mode (agent vs
inline) is assigned per phase by core policy, not by this binding. No subagent model is fabricated
(R-7). Failure → blocker split (startup vs mid-phase) is inherited unchanged.

**`docs/adapters/model.md` — Pi binding (unchanged in substance).** `select` maps the craft tier
(`opus|sonnet|haiku`) → a `provider/model` pair; `isAvailable` checks the mapped provider is
configured. The tier→provider mapping is the adapter's concern; the resolution ORDER is core policy,
restated nowhere. The tier map is now a pure unit-tested seam (§D8) rather than prose.

### D5 — Contract-equivalence proof (R-6)

`engine/src/contract.js` expands `@@ARTIFACT_HANDOFF@@` / `@@MODEL_RESOLUTION@@` via `applyCarveOuts`
against `AGENT_VARIANTS` (agent) or `INLINE_VARIANTS` (inline). The current agent variants read:

- artifact-handoff → `the agent commit is the handoff; a dead agent respawns from the artifact`
- model → `the role model resolved from manifest→agent-pin→fallback`

Both are **binding-neutral prose**. pi's per-phase fresh-run handoff (commit is handoff; a dead run
respawns from the artifact) and resolution order are identical to Claude's. The headless pi bin already
assembles in **agent mode** (`run.js` → `assembleBlock(phase.id, manifestPath)`) and introduces **zero**
carve-out variants. Therefore the pi native binding's assembled block, per phase+mode, is **byte-identical**
to the Claude binding's for the same phase+mode; the two carve-out markers are the ONLY binding-nameable
slots, and they carry identical prose for pi. So the R-6 statement ("differs by at most the two carve-out
lines") is satisfied with an actual **zero-line** diff — the strongest form.

The assertion rides the existing harness: extend `engine/test/contract-equivalence.test.js` to assert
that the block the pi binding feeds `pi -p` (agent-mode `assembleBlock` output) equals the Claude
agent block, and that the diff set ⊆ the two carve-out lines. No `contract.js` touch (R-1). The
zero-vs-two-line framing is DC-11.

### D6 — Telemetry sibling (`collect` binding) + `--source pi`

A new `engine/src/observability/adapters/pi/telemetry.js` exports `parseLines(lines, since)` mapping
the pinned `pi --mode json` event lines → the vendor-neutral `UsageEvent` shape, mirroring the
claude/opencode bindings. The pure `aggregate` + `serializeReport` core is **reused unchanged**; the
produced `report.json` is byte-identical in schema (deep-sorted, 2-space, single trailing newline).

**Field mapping (pinned, row 15) — the pi carve-out from claude/opencode:**

| `UsageEvent` field | pi `--mode json` source |
|---|---|
| `run` | session-header `id` (first line `{type:"session","id":…}`) |
| `slug` | injected by caller (null default) |
| `phase` | **injected by caller** (the per-phase run knows its phase) — pi has no `agentType`/`agent`; null default |
| `role` | **null** — pi has no subagents (role-less; no per-event role to derive) |
| `model` | assistant `message.model` |
| `tokens.input` | `message.usage.input` |
| `tokens.cacheRead` | `message.usage.cacheRead` |
| `tokens.cacheCreation` | `message.usage.cacheWrite` (pi's cache-write == cache-creation) |
| `tokens.output` | `message.usage.output` |
| `cacheCreationTtl` | `null` (pi does not split 5m/1h TTL) |
| `messages` | tool/assistant-message count (`turn_end.toolResults.length` / message count) |
| `durationMs` | derived from message timestamps (or `0`) |

The claude and opencode bindings derive `phase`/`role` from `agentType`/`agent`; **pi cannot** — there
is no subagent attribution field in the event stream (R-7). So `role` is `null` and `phase` is supplied
by the caller (the same injection pattern claude uses for `sessionId`). Canonical usage line = one
`UsageEvent` per assistant `message_end` (equivalently `turn_end`); the exact canonical choice and real
non-zero values are DEFERRED (rows 22/24). Malformed-line skip, synthetic-model exclusion, and
whitelist-only redaction (no paths/`$HOME`/prompt text) match the claude binding exactly.

**Front-door (`usage-mine-main.js`).** Two touches, both generic:
1. Add `pi: piParseLines` to the `SOURCES` map (the `Object.hasOwn` fail-closed gate already guards it).
2. Make the **READ root source-aware**: the containment root is currently the claude `~/.claude/projects`
   default; a `--source pi` run's `--dir` points at pi's session dir (`~/.pi/agent/sessions`, or
   `PI_CODING_AGENT_SESSION_DIR`), which fails containment against the claude root. Either add a
   source→default-read-root map (claude→`~/.claude/projects`, pi→`~/.pi/agent/sessions`) so containment
   is checked against the right root, OR capture the `pi --mode json` stream to a repo-local `.jsonl`
   the existing WRITE-root already contains and mine that. This is a generic capability (any file-based
   source needs its own read root), named here, not a pi special-case; the choice folds into DC-5.

**RESERVED-section reconciliation (DC-10 — intention-drift flag).** `telemetry.md`'s current *Pi binding*
section reserves `--source pi` but describes a **Raspberry-Pi / single-board-computer** metrics source
("bind a Raspberry Pi… device's equivalent of Claude Code transcript records"). The brief mandates the
`pi` source be the **pidev coding-agent** (`pi --mode json`) binding. The design **repurposes the reserved
`pi` slot** for the pidev binding and rewrites that section to match — this is the honest reconciliation,
surfaced as DC-10 rather than decided here, because it edits an invariant-bearing port page.

### D6b — One pinned `message.usage` shape, two consumers (ADR-234)

The pinned assistant `message.usage` shape (§D2 row 15: `{input,output,cacheRead,cacheWrite,totalTokens,cost}`;
**no** top-level `{type:"usage"}` event) is the **single source** feeding two consumers in this change:

1. the telemetry sibling `engine/src/observability/adapters/pi/telemetry.js` (§D6, R-5), and
2. the headless `adapters/pi/src/execution.js#parseUsage` alignment (R-10, ADR-234).

`parseUsage` was pinned to the 0.79.8 `{type:"usage"}` event and is **dead against 0.80.10** (that event
no longer exists — §D2 row 15). Aligning it now to read `message.usage` is a real latent-bug fix,
thematically adjacent to the new telemetry sibling and keyed off the identical pinned shape — **one shape,
two consumers, no second pin**. Both get RED→GREEN cover over the same fixtures (§Test strategy). The
native surface stays additive — the headless bin is not replaced (DC-6/ADR-234; Out of scope) — but its
usage parser is no longer dead. This deviates from the design's original recommendation (log the staleness
as a follow-up); the user ratified the in-scope fix as ADR-234.

### D7 — Git-guard reuse (the one mandatory code seam) — pinned, not assumed

The reuse target is `gate.js#toolCallGuard` (the pure predicate: `GIT_DIFF_SHOW_RE` + the write-path
containment) and `tool-call-hook.js` (`adaptPiEvent` + `symlinkRecheck` + the fail-safe try/catch).
The native binding wires them into pi's real `tool_call` extension event. Empirical pinning (rows 13/14)
surfaces three shape mismatches that the brief's "reuse as-is" must be honest about — the **predicate is
reused verbatim; the event adapter is re-expressed for 0.80.10**:

1. **Event field name.** 0.80.10 emits `event.toolName`; `adaptPiEvent` reads `event.tool ?? event.name`
   (pinned to 0.79.8) — it must also read `event.toolName`.
2. **Tool-name casing.** pi tool names are lowercase (`bash`/`write`/`edit`); the predicate keys off
   Claude's capitalized `'Bash'` and `WRITE_TOOLS={'Write','Edit','NotebookEdit'}`. The adapter must
   bridge the casing (normalize pi → predicate names) — the git-diff branch never fired against a real
   pi event before because the pi live smoke did not exercise the guard (the opencode smoke did). DC-9.
3. **Write field.** pi's write/edit input uses `path`, not `file_path`; `guardWritePath`/`symlinkRecheck`
   read `tool_input.file_path` — the adapter must map pi's `path`.

Blocking is by **RETURN** `{block:true,reason}` (row 13) — which is exactly what `toolCallHook()`'s
returned function already produces, so the extension handler body is `return toolCallHook(...)( adapted, ctx )`.
(opencode blocks by *throw*; pi blocks by *return* — pi matches the existing hook's contract.) The pure
predicate stays binding-neutral and unit-tested; the pi event adapter gets its own `node --test` over the
pinned 0.80.10 shapes. Whether `GIT_DIFF_SHOW_RE` is single-sourced across bindings or re-expressed
per-binding is settled by the pi precedent: re-expressed + a test matching bash behaviour (DC-4).

### D8 — Model tier map + CRAFT_ROOT resolver (pure seams)

**Tier map** — `adapters/pi/src/model-tier-map.js`: `resolvePiModel(tier, overrides) → provider/model`,
unit-tested. The committed default maps `opus|sonnet|haiku → anthropic/claude-{opus-4-5,sonnet-4-5,haiku-4-5}`
(ids confirmed present in `pi --list-models`, row 17). Overrides come from settings and (portably)
manifest `models.<role>`. `.claude/workflow.md` stays **provider-neutral** — `models.<role>` carries TIER
strings only, never `provider/model` (matching the existing manifest's "No provider/model pinned here").
Provider-agnosticism (R-4) is proven by mapping a tier to a reachable provider in the live smoke.

**CRAFT_ROOT resolver** — `adapters/pi/src/craft-root.js`: a pure `(moduleUrl) → absolute existing
contained root` (adapters/pi → repo root, mirroring `engine.js`'s `join(__dir,'..','..','..')`),
unit-tested. The extension factory calls it and sets `process.env.CRAFT_ROOT` before `session_start`
(row 21); the craft skill bodies invoke `${CRAFT_ROOT:-${CLAUDE_PLUGIN_ROOT}}/engine/bin/*` — the shim
already on the surface, behaviour-preserving for Claude (defaults to `CLAUDE_PLUGIN_ROOT`). Whether pi's
bash tool inherits the exported env end-to-end is the one DEFERRED export item (row 23). DC-7.

### D9 — File layout

```
adapters/pi/
  package.json                      # + `pi` manifest {extensions,skills,prompts} + keyword pi-package
  settings.template.json            # provider-neutral: skills[]/prompts[]/extensions[], defaultProjectTrust guidance
  README.md                         # pi install ./adapters/pi [-l] + --approve / defaultProjectTrust
  prompts/
    craft-run.md  craft-review.md  craft-validation.md  craft-init.md  …   # thin /craft-* dispatchers
  extensions/
    craft-guard/index.ts            # tool_call guard + registerFlag + CRAFT_ROOT export (wraps ../src/*.js)
  src/
    gate.js  tool-call-hook.js  roleless.js  roleless-probes.js
    engine.js  run.js  cli.js  probe.js                                     # REUSED verbatim
    execution.js                                                            # REUSED; parseUsage aligned to 0.80.10 message.usage (R-10, ADR-234)
    model-tier-map.js  craft-root.js                                        # NEW pure seams
  test/
    …existing… + model-tier-map.test.js  craft-root.test.js  git-guard-pi-adapter.test.js
    + execution-parseusage.test.js       # RED→GREEN over pinned 0.80.10 message.usage (R-10, ADR-234)
  .claude/workflow.md               # provider-neutral manifest fixture (reused)
engine/src/observability/adapters/pi/
  telemetry.js                      # collect binding (NEW; mirrors claude/opencode)
engine/src/observability/usage-mine-main.js   # + `--source pi` + source-aware read root
docs/adapters/pi-poc-record.md       # extended with the native-surface smoke
docs/adapters/{execution,model,telemetry}.md  # Pi binding sections tightened (telemetry reconciled, DC-10)
```

## Decision candidates

Every load-bearing choice not pre-decided by an existing ADR. ≤3 alternatives each, a recommendation,
and — now that the decisions phase has run — the **ratified outcome** (this table is a decision record,
not open forks). All eleven were ratified as ADR-229…239: **ten adopted the designer's recommendation**;
**DC-6 deviated** — the user folded the `parseUsage` alignment into scope (ADR-234, see §D6b/R-10).
Rows DC-1…DC-8 were the brief's expected forks; DC-9…DC-11 were discovered during live pinning.

| # | Choice | Alternatives (≤3) | Recommendation | Why |
|---|---|---|---|---|
| DC-1 | Native surface mechanism | (a) prompt-template `/craft-*` thin dispatchers + skills (single-sourced procedure bodies via `skills[]`) + one extension (guard/flag/CRAFT_ROOT); (b) skills only (`/skill:craft-*`), no prompt templates; (c) extension `registerCommand("craft:run")` handlers driving everything in JS | **(a)** → ADR-229 (adopted) | Uses pi's first-class discoverable + single-sourceable surfaces; skills carry the single-sourced rules (R-2); prompt template is the closest native analog to opencode's thin `commands/`; extension is the minimal code seam. (b) loses a clean `/craft-*` entrypoint; (c) re-authors procedure text in JS (drift) |
| DC-2 | Binding home & distribution | (a) extend `adapters/pi/` in place + a `pi` package manifest so `pi install ./adapters/pi` works (local-path, no copy); (b) sibling `adapters/pi-native/`; (c) a separately-published `@craft/pi` npm/git package | **(a)** → ADR-230 (adopted) | ADR-085 (adapter tree) + local-path-install-without-copy (row 5) means no second release surface, no build/emit; the headless bin and native surface share one tree |
| DC-3 | `/craft:*` command entrypoint (live-pinned) | (a) prompt-template `/craft-run` (thin, `$ARGUMENTS`) that loads the craft-run skill; (b) skill `/skill:craft-run`; (c) extension `pi.registerCommand("craft:run", handler)` | **(a)** → ADR-231 (adopted) | pi **does** expose in-session slash commands (rows 10/12, CONFIRMED); the prompt template is thin + arg-templated + single-sourceable, and defers procedure text to the skill. (c) can keep the literal `craft:run` name but pulls logic into JS. Exact per-phase-dynamics threading is DEFERRED (row 26) |
| DC-4 | Git-guard binding & predicate sourcing | (a) reuse `gate.js` predicate verbatim, re-express the pi event adapter for 0.80.10 (`toolName`/casing/`path`/return-to-block) + a test matching bash behaviour; (b) author a fresh pi predicate; (c) extract a shared predicate all bindings import | **(a)** → ADR-232 (adopted) | The predicate is proven and binding-neutral; only the *event adapter* must track pi's real 0.80.10 shape (rows 13/14). (b) duplicates a tested regex; (c) needs a shared home the engine or a new package owns (scope creep) |
| DC-5 | Telemetry: build now vs defer | (a) build `engine/src/observability/adapters/pi/telemetry.js` + `--source pi` now (mirror opencode ADR-227); (b) defer telemetry, metrics via existing paths only | **(a)** → ADR-233 (adopted) | The `--mode json` usage shape is pinned (row 15); mirroring the opencode telemetry ADR keeps the three bindings symmetric and gives the `report.json`-parity SC. (b) forfeits parity |
| DC-6 | Keep vs evolve the headless `craft-pi` bin | (a) keep it; the native surface is additive; (b) replace it with the native surface; (c) keep it but align its stale `execution.js#parseUsage` (expects a `{type:"usage"}` event that 0.80.10 does not emit — row 15) to the real shape | **RATIFIED → ADR-234: (a)+(c) — keep the bin additive AND align `parseUsage` now** *(user's choice; DEVIATES from the designer's original "(a) with (c) as a flagged follow-up")* | ADR-086/090 keep the subprocess binding (native is additive, not a replacement); the `parseUsage` staleness is a **real latent bug** against 0.80.10 (a dead usage parser), thematically adjacent to the telemetry sibling (ADR-233) and keyed off the SAME pinned `message.usage` shape (§D2 row 15, §D6b), so it is fixed in THIS change with RED→GREEN cover (R-10) |
| DC-7 | CRAFT_ROOT export mechanism (live-pinned) | (a) extension factory self-locates (module path) + `process.env.CRAFT_ROOT`, bash tool inherits (`${CRAFT_ROOT:-${CLAUDE_PLUGIN_ROOT}}` shim); (b) launch-context shell `export CRAFT_ROOT` before `pi`; (c) a settings/manifest knob | **(a)** → ADR-235 (adopted) | Robust under `pi install` (engine lives at the package root, not the target cwd); the shim is behaviour-preserving for Claude. End-to-end bash-tool env inheritance is DEFERRED (row 23) |
| DC-8 | Proof & CI strategy | (a) deterministic seams unit-tested (`adapters/pi/test/` + telemetry in `engine/test/`) + one on-demand live smoke recorded in `docs/adapters/pi-poc-record.md`; (b) CI-gate a live pi run; (c) manual-only | **(a)** → ADR-236 (adopted) | Exact pi/opencode precedent (ADR-088/089, ADR-226/228); (b) couples CI to a pi install + provider key; (c) forfeits regression cover |
| DC-9 (discovered) | pi tool-name casing bridge | (a) normalize pi's lowercase `bash/write/edit` → predicate names inside the pi event adapter; (b) make the `gate.js` predicate case-insensitive; (c) add lowercase aliases to the predicate's tool sets | **(a)** → ADR-237 (adopted) | Keeps the shared predicate binding-neutral (Claude names); the pi-specific casing lives in the pi adapter where it belongs. (b)/(c) leak pi specifics into a shared seam |
| DC-10 (discovered) | Telemetry `pi` source-name reconciliation | (a) repurpose telemetry.md's reserved `pi` slot for the pidev binding + rewrite the Raspberry-Pi wording; (b) name the pidev source `pidev` and leave `pi` reserved for hardware; (c) keep both under `pi` conceptually | **(a)** → ADR-238 (adopted) | The brief mandates `--source pi` == pidev; the reserved slot's purpose was extensibility. (b) diverges from the brief's selector; (c) is ambiguous. Flagged as intention-drift because it edits an invariant-bearing port page |
| DC-11 (discovered) | Contract-equivalence framing (R-6) | (a) reuse the agent/inline variants → pi block byte-identical to Claude (zero-line diff), assert via `contract-equivalence.test.js`; (b) add `PI_VARIANTS` + a `--binding` flag → exactly-two-line diff | **(a)** → ADR-239 (adopted) | Matches the pi/opencode precedent (a runtime binding adds no variant), no `engine/src/contract.js` touch (R-1), stronger than "two lines". (b) touches the engine for wording that is already binding-neutral |

## Test strategy

Deterministic seams in CI; one on-demand live smoke. No new engine-level runtime dependency
(bash + node built-ins; the extension uses pi's bundled `@earendil-works/*` peer deps). The design is
partitioned for the planner to cut into small TDD parts; suggested part shapes in brackets.

**Deterministic (CI, `node --test`):**

- **git-guard predicate** [`validator`]: `gate.js` — reused; existing table-driven RED→GREEN over the
  `GIT_DIFF_SHOW_RE` matrix (matches `git diff`/`git show`, global-opt forms; exempts `--no-ext-diff`,
  `rtk proxy`, `git stash show`, `git show-ref`, `git difftool`). Property lens preserved: any command
  carrying `--no-ext-diff` never blocks; any bare `git diff/show` always blocks.
- **pi git-guard event adapter** [`jsonl-parse-binding`/`validator`]: NEW test over the pinned 0.80.10
  `tool_call` shape — `event.toolName` lowercase bridging, `event.input.command` (bash),
  `event.input.path` (write/edit), return-to-block `{block,reason}`, fail-safe try/catch. Fixtures are
  the real 0.80.10 event shapes (rows 13/14).
- **tier→model map** [`validator`]: `model-tier-map.js` — `resolvePiModel(tier, overrides)` over
  `{opus,sonnet,haiku}`, override precedence (settings/manifest > default), unknown-tier handling,
  confirmed-present anthropic ids.
- **CRAFT_ROOT resolver** [`bash-helper`]: `craft-root.js` — resolves an absolute, existing,
  containment-checked root from a module-url stub; rejects a root that escapes; the
  `${CRAFT_ROOT:-${CLAUDE_PLUGIN_ROOT}}` default-expansion asserted at the bash layer.
- **telemetry parser** [`jsonl-parse-binding`]: `observability/adapters/pi/telemetry.js` —
  `--mode json` event fixtures → `UsageEvent[]`; `message.usage`→tokens mapping (`cacheWrite`→
  `cacheCreation`); `run` from the session header; `role` null, `phase` injected; malformed-line skip;
  synthetic/zero-cost exclusion; redaction (whitelist-only). Fixtures frozen from the live capture,
  re-pinned for non-zero values in the smoke (rows 22/24).
- **headless `parseUsage` alignment** [`jsonl-parse-binding`]: `adapters/pi/src/execution.js#parseUsage` —
  RED→GREEN over the pinned 0.80.10 assistant `message.usage` (`{input,output,cacheRead,cacheWrite,…}`,
  §D2 row 15): the RED asserts the old `{type:"usage"}`-only parser returns null against a real 0.80.10
  stream; the GREEN reads `message.usage`. **Same pinned shape as the telemetry parser** — one shape, two
  consumers (§D6b, R-10, ADR-234). Its own TDD part, distinct from the telemetry-sibling part.
- **report byte-match** [`pure-aggregate-core`]: pi `UsageEvent[]` → `aggregate` → `serializeReport`
  yields a `report.json` byte-identical in schema to the claude path (deep-sorted, 2-space, single
  trailing newline).
- **front-door selector** [`cli-streaming-entrypoint`]: `usage-mine-main.js` `--source pi` dispatch
  (claude default; pi routes to the new binding; unknown source rejected at startup) + source-aware
  read-root containment.
- **contract-equivalence** [`validator`]: extend `contract-equivalence.test.js` to assert the pi
  agent-mode assembled block ⊆ Claude's + the two carve-out lines (zero-line under DC-11a).
- **docs structure** [`adapter-port-doc`/`docs-prose`]: `docs/adapters/{execution,model,telemetry}.md`
  Pi binding sections well-formed; `Binding set` reads `{ claude, pi, opencode }`; the reconciled
  telemetry Pi section (DC-10) validates; existing `docs-structure-lint.sh`/`design-lint.sh` families
  stay green.

**On-demand live smoke (not CI-gated, ADR-089 parity):** drive one construction-bearing phase
end-to-end through the native pi surface in a `mktemp` throwaway repo (state-mutating-probe rule):
`pi install ./adapters/pi -l` + `.pi/settings.json` + `--approve` (row 19/27), a `/craft-run`-driven
construction phase on a reachable provider (row 17), gate green before commit, mutations confined to
the throwaway, committed artifact = handoff, and the guard blocking a non-compliant `git diff` (the
item the pi PoC never exercised live). The acceptance-probe shape reuses
`adapters/pi/src/probe.js#runAcceptanceProbe` (injected `piRunner` + `fsOps.mktemp`), so the structural
assertions are unit-testable without a live pi. Record version, provider/model, ports exercised,
per-phase outcome, and the resolved D-rows (23–28) in `docs/adapters/pi-poc-record.md`.

## Out of scope

- **Forking the engine or the invariant contract** — floors in `contracts/core.md` are preserved; the
  only engine touches are the additive `observability/adapters/pi/telemetry.js` sibling and the generic
  `--source pi` selector + source-aware read root (DC-5/DC-10).
- **Inventing a subagent model pi does not have** — pi is role-less/sequential; `role` is `null` in
  telemetry and no fan-out is introduced (R-7).
- **Re-doing or relocating the opencode binding** — this port parallels it, does not touch it.
- **Replacing the headless `craft-pi` bin** — the native surface is additive (DC-6/ADR-234); the
  subprocess Execution binding (ADR-086/090) stays. Its `parseUsage` **is** aligned to 0.80.10 in this
  change (R-10, §D6b) — keeping the bin does not mean leaving its usage parser dead; the alignment is
  in-scope, not a follow-up.
- **CI-gating a live pi run** — on-demand smoke only (ADR-089 parity).
- **Provider free-tier / quota quirk engineering** — documented (pi-poc precedent), not built.
- **Byte-identical Claude affordances** — nearest pi-native affordance is the target (`/craft:run` →
  `/craft-run` prompt template; PreToolUse deny → `tool_call` return-to-block).
- **Raising or faking a pi subagent depth** — pi has no subagents; the design does not simulate one.
