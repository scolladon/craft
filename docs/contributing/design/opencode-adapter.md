# Design — opencode adapter: a native opencode binding of the craft delivery harness

> Brief: add **opencode** as the third Execution-port binding (`{ claude, pi } → { claude, pi, opencode }`)
> by native packaging (commands + subagents + a git-guard plugin + `opencode.json` + a telemetry
> sibling), driving the SAME engine core under the SAME engine-owned invariant contract — no fork,
> no second copy of any load-bearing rule.
> Status: draft → self-reviewed ×3 → accepted

## Context

### The as-is: a ported engine, a Claude-only user surface

Craft is a hexagonal feature-delivery engine (`docs/DESIGN-customizable-engine.md`): a thin
orchestrator (`skills/run/SKILL.md`) walks a declarative phase-descriptor list behind explicit
ports. The engine core — `engine/bin/*` shims over `engine/src/**`, `contracts/*.md`,
`pipeline/default.yml`, `templates/`, and the `scripts/*.sh` lints — is runtime-neutral plain
Node/bash. The **Harness-as-a-Service** pattern already names the seams (Execution, Model, Memory,
Telemetry, VCS, Policy, Backlog, Intention) and already ships a *second* binding for the Execution
port: `adapters/pi/` (ADR-085/086/087/088/089/090/091) proves the Execution port runs on a
non-Claude runtime.

Two facts pinned by exploration shape this whole design:

1. **The engine self-locates.** `grep -r CLAUDE_PLUGIN_ROOT engine/` returns **nothing**. Every
   engine bin computes its own root from `import.meta.url`
   (`contract-assemble-main.js`: `const REPO_ROOT = join(__dir, '..', '..')`). `${CLAUDE_PLUGIN_ROOT}`
   is a **binding-surface** token, not an engine token — it appears only where the *Claude binding*
   (skill bodies, the hook manifest) needs to LOCATE the bins. See the seam analysis in Design §D3.

2. **A new Execution binding adds no contract variant.** `adapters/pi/src/run.js` calls
   `assembleBlock(phase.id, manifestPath)` in agent mode and feeds the byte-identical assembled
   block to `pi -p`. Pi introduces **zero** new carve-out variants in `engine/src/contract.js`.
   The substitution dimension is `{ agent, inline }` (execution topology), never
   `{ claude, pi }` (runtime). This is the precedent SC5 must be read against (Design §D5).

Everything a **user** touches is Claude-bound (PRD §1): 19 `skills/<phase>/SKILL.md` invoked as
`/craft:<skill>` (14 of them invoke engine bins — §D3); 9 `agents/<role>.md` files with Claude SKU
pins (the PRD's "10" counts the `validation-triager` alias, which has no own file); `hooks/hooks.json`
PreToolUse deny;
`.claude-plugin/plugin.json` + `marketplace.json`; the tier→Claude-SKU map; `AskUserQuestion`.
The engine is portable; the **binding layer is not**. opencode is the target because it has a rich
native extensibility surface *and* partial Claude-compat (it reads `.claude/skills/` and
`~/.claude/CLAUDE.md`), so a faithful native port is tractable without forking the engine.

### The precedents this design mirrors (binding, not beside)

- **`docs/adapters/execution.md`** — the Execution port. `spawn(role, ctx)`/`runInline(ctx)`; core
  policy (when to spawn, fan-out parallelism, dead-worker-respawn) is NOT a port verb. `Binding set`
  is `{ claude, pi }`; this design adds an **opencode binding** section. The Claude binding IS the
  "Agent spawns" invariant in `skills/run/SKILL.md`.
- **`docs/adapters/model.md`** — the Model port. `select(model)`/`isAvailable(model)`; the
  resolution ORDER (`manifest models.<role>` → descriptor `model:` → `models.fallback` → engine
  default `sonnet` → session model) is **core policy, restated nowhere**. The Claude binding maps a
  tier to a SKU via agent frontmatter; the Pi binding maps tier → `provider/model` via a registry.
- **`docs/adapters/telemetry.md`** — vendor-neutral `UsageEvent[]`; the `collect` binding lives at
  `engine/src/observability/adapters/<binding>/telemetry.js` (the claude binding is there today; the
  Pi binding is RESERVED there). `aggregate` + `serializeReport` are the pure, reused core;
  `serializeReport` is `JSON.stringify(sortDeep(report), null, 2) + '\n'` — byte-stable.
- **`contracts/core.md`** + `engine/src/contract.js` — the two substitution markers
  `@@ARTIFACT_HANDOFF@@` / `@@MODEL_RESOLUTION@@`, expanded line-by-line by `applyCarveOuts` against
  `AGENT_VARIANTS` / `INLINE_VARIANTS`. `engine/test/contract-equivalence.test.js` proves agent vs
  inline differ by **exactly two lines** per descriptor.
- **`adapters/pi/`** — the reference binding shape: a pure predicate (`gate.js#toolCallGuard` with
  `GIT_DIFF_SHOW_RE`), a runtime wiring of that predicate (`tool-call-hook.js#adaptPiEvent`), an
  arg-shaper + usage parser (`execution.js`), an acceptance probe (`probe.js#runAcceptanceProbe`
  run in a `mktemp` throwaway), and unit tests per seam. Its live run is recorded in
  `docs/adapters/pi-poc-record.md` (Gemini free tier, `@earendil-works/pi-coding-agent@0.79.8`),
  on-demand, not CI-gated (ADR-088/089).

### Constraints inherited from the codebase (binding — do not re-open)

- **ADR-085**: adapter code lives under top-level `adapters/<name>/`; `engine/**` stays core-only —
  **except** the telemetry `collect` binding, whose established home is
  `engine/src/observability/adapters/<binding>/` (bound to the `UsageEvent` contract). Both
  precedents apply; §D6 reconciles them.
- **Engine-bin shim convention**: bins are ~5-line shims over `engine/src/<name>-main.js`; ALL logic
  in `engine/src/**` (Stryker mutates `engine/src/**` only); bin spawn-smoke in
  `engine/test/<name>.bin.test.js`. Honour this for any new src/bin.
- **Provenance is one-way** (`skills/run/SKILL.md` "Provenance"; `test/source-hygiene.test.js`):
  no phase/ADR/backlog refs inside source or test — **this design doc and the PR body carry
  provenance; the adapter code must not.**
- **Advisory ports never gate**: telemetry is advisory (`telemetry.md` "never gates a run").
- **Injected contract is engine-owned**: the floors in `contracts/core.md` are preserved verbatim;
  binding-specific wording enters ONLY at the two carve-out markers.
- **`.claude/workflow.md` + `.claude/craft-*.md` are repo-local markdown** the engine roots at the
  repo ROOT (`skills/run/SKILL.md` step 1c-mem: "NEVER `${CLAUDE_PLUGIN_ROOT}`"). opencode also reads
  `.claude/`. `adapters/pi/.claude/workflow.md` is the provider-neutral precedent (no model pinned).

### External contract — pinned empirically (never designed from memory)

opencode's extensibility surface is an **external contract**. Per the designer's mandate it was
re-fetched from `opencode.ai/docs/{skills,agents,commands,plugins,config,permissions,cli,rules}` on
**2026-07-17** and confirmed against the PRD's researched baseline. The full pinned matrix — every
fact marked CONFIRMED-via-docs vs DEFERRED-to-live-smoke — is Design §D9. Facts a running opencode
alone can settle (event schemas, exact tool-input fields, plural/singular dir names honoured by the
target version, subagent-depth behaviour under a command-driven flow) are OPEN items deferred to the
implementation-phase live smoke, mirroring how Pi deferred its live run.

Provenance for this design: `docs/PRD-opencode-port.md` (intent, §6 forks, §7 constraints) ·
`docs/DESIGN-customizable-engine.md` (architecture) ·
`docs/adapters/{execution,model,telemetry}.md` (port shape) · `adapters/pi/**` +
`docs/adapters/pi-poc-record.md` (binding precedent) · ADR-085/086/087/088/089/090/091 (Pi
adapter decisions) · `engine/src/contract.js` + `engine/test/contract-equivalence.test.js`
(carve-out seam) · opencode docs @ 2026-07-17 (external matrix §D9).

## Requirements

Sourced from the PRD (no separate requirements artifact this run). Each is a verifiable statement.

**Goals (testable form).**

- **R-G1 — Engine untouched (additive).** `git diff` shows no *functional* change under `engine/`
  (excluding the additive `engine/src/observability/adapters/opencode/` sibling and a generic,
  binding-neutral telemetry-source selector — see §D6), `contracts/`, `pipeline/`, `templates/`,
  and the lint logic in `scripts/`. Any engine touch is generic (benefits every binding) and
  named as its own decision — never an opencode special-case.
- **R-G2 — One binding seam, not a fork.** No phase's invariant procedure text is copy-pasted. The
  injected contract is assembled by the same `contract-assemble` bin; opencode commands are thin
  dispatchers; load-bearing rules stay single-sourced.
- **R-G3 — Faithful primitive map.** Every craft primitive maps to its nearest opencode-native
  affordance (§D2), preserving behaviour, not just shape.
- **R-G4 — Portable root seam.** The 15 operational `${CLAUDE_PLUGIN_ROOT}` references (§D3) resolve
  under both bindings without the engine special-casing a runtime.
- **R-G5 — Provider-agnostic model binding.** A committed default tier→`provider/model` map
  (Anthropic SKUs), fully swappable, proven against one non-Anthropic provider.
- **R-G6 — Invariant fidelity, provable.** The assembled injected block under the opencode binding
  carries the identical core floors as the Claude binding — asserted mechanically (§D5).
- **R-G7 — Zero-config parity.** A repo with a discoverable test command and no manifest runs the
  default pipeline on opencode; a repo with no test command hits the identical gate-floor refusal.

**Success criteria (testable form).**

- **R-SC1** Zero-config parity (= R-G7), proven by the live smoke + the engine's existing
  toolchain-neutral resolution (already CI-proven by the `SC5` fixture).
- **R-SC2** Engine untouched (= R-G1); the only allowed engine touches are the additive telemetry
  sibling and one generic source selector, both behaviour-preserving for existing bindings.
- **R-SC3** A live opencode run drives ≥1 construction phase end-to-end (RED→GREEN→commit) through
  the opencode subagent binding: gate green before commit, mutations confined to the worktree,
  committed artifact = handoff. Recorded in `docs/adapters/opencode-poc-record.md` (pi-poc parity);
  provider may be non-Anthropic.
- **R-SC4** The git-guard predicate, the tier→model map, the `CRAFT_ROOT` resolver, and the
  telemetry parser have `node --test` coverage (plus the plugin's own runtime test), with no new
  engine-level runtime dependency.
- **R-SC5** The opencode-binding assembled block differs from the Claude-binding block by at most
  the two carve-out lines — asserted mechanically against `engine/test/contract-equivalence.test.js`
  (§D5 elaborates whether that difference is zero lines or two).
- **R-SC6** At least `/craft:run`, `/craft:review`, `/craft:validation`, `/craft:init` are
  invocable in the opencode TUI and dispatch the corresponding phase(s); flags
  (`--profile`/`--skip`/`--config`/`--harness`/`--policy`) parse identically to the Claude binding.

**Non-goals (from PRD §4).** Rewriting the engine or the invariant contract; the headless pi-style
subprocess adapter as the deliverable; byte-identical Claude affordances (nearest native is the
target); CI-gating a live opencode run; a general Claude-Code→opencode migration tool; engineering
around provider free-tier quirks (documented, not built).

## Design

### D1 — Two-layer split

Same split as every existing binding: the **engine-owned protocol** (unchanged) and the **opencode
binding** (new, opencode-native in shape). The opencode binding is a set of declarative artifacts
plus exactly one real code seam (the guard) plus a telemetry sibling — NOT a JS pipeline driver
(that is the pi-style subprocess adapter, explicitly a non-goal). opencode itself drives the walk by
reading `commands/`, `agents/`, `plugins/`, and `opencode.json`; the "execution binding" is the
documented subagent-dispatch semantics, not a `buildArgs` function.

```
ENGINE-OWNED (unchanged, reused byte-for-byte)          OPENCODE BINDING (new)
────────────────────────────────────────────           ───────────────────────────────
engine/bin/*  → engine/src/**   (self-locating)         adapters/opencode/
contracts/*.md  (core + bundles)                          opencode.json          (config template)
pipeline/default.yml                                      commands/craft-*.md    (thin dispatchers)
templates/*                                               agents/craft-*.md      (mode: subagent)
scripts/*.sh   (lints, worktree-setup)                    plugins/git-guard.ts   (tool.execute.before)
.claude/workflow.md + .claude/craft-*.md (repo-local)     src/*.js               (pure seams: guard
                                                                                   predicate, root
engine/src/observability/                                                          resolver, tier map)
  usage-aggregate.js (pure aggregate)                     test/*.test.js         (node --test seams)
  serializeReport (byte-stable)                          engine/src/observability/adapters/opencode/
                                                            telemetry.js         (collect binding)
                                                          docs/adapters/opencode-poc-record.md
                                                          docs/adapters/{execution,model}.md  (+section)
```

### D2 — Primitive map (craft → opencode) and file layout

| Craft primitive | opencode-native target | Preserved behaviour |
|---|---|---|
| `skills/<phase>` procedures + `skills/run` orchestrator | `adapters/opencode/commands/craft-<phase>.md` thin dispatchers; invariant procedure text single-sourced via the shared contract + the Skills surface (`.claude/skills/` compat and/or native `skills/`) | commands carry `$ARGUMENTS`; the injected contract is assembled by `contract-assemble`, never re-authored (R-G2) |
| `agents/<role>.md` (`model: <tier>`) | `adapters/opencode/agents/craft-<role>.md` — `mode: subagent`, `model: <provider/model>`, `permission:` map | frontmatter `description` drives dispatch; body reused; `hidden`/`permission.task` control invocation |
| `hooks/hooks.json` + `git-no-ext-diff.sh` | `adapters/opencode/plugins/git-guard.ts` — `tool.execute.before` throws on a `git diff/show` lacking `--no-ext-diff` | pure predicate re-expressed + unit-tested (§D7); a `permission.bash` pattern CANNOT express "flag absent" (pinned, §D9) |
| `engine/` bins, `scripts/*.sh`, `contracts/`, `templates/`, `pipeline/default.yml` | invoked verbatim via `` !`…` `` shell injection in commands and Bun `$` in the plugin | root located via the `CRAFT_ROOT` seam (§D3) |
| `.claude-plugin/plugin.json` + `marketplace.json` | `adapters/opencode/opencode.json` (`agent`/`command`/`permission`/`plugin`/`instructions`/`mcp`/`subagent_depth`) + directory conventions | opencode merge order pinned in §D9 |
| tier → Claude SKU (agent frontmatter) | tier → `provider/model` map (Model port opencode binding, §D8) | default Anthropic, swappable via `opencode.json` `agent.<role>.model` or manifest `models.<role>` |
| Execution `spawn(role,ctx)` = Task subagent | opencode subagent via task tool / `@craft-<role>`, gated by `permission.task`; review fan-out = N subagents | artifact-is-the-handoff + dead-worker-respawn hold (commit is the handoff) |
| `runInline(ctx)` = in-session | opencode primary-agent in-session execution | inline carve-outs already in the assembled block |
| `AskUserQuestion` (ADRs, escalations, merge confirm) | opencode interactive session prompt / `question` permission | native session is interactive; reachability from a command flow is an OPEN item (§D9) |
| Telemetry (`observability/adapters/claude/`) | new `observability/adapters/opencode/telemetry.js` reading `opencode run --format json` events | same `UsageEvent` shape → same `aggregate`/`serializeReport`; sink unchanged (`.claude/craft-metrics.md`) |
| `.claude/workflow.md`, `.claude/craft-*.md` | reused verbatim (repo-local, engine-rooted at repo root; opencode reads `.claude/`) | zero divergence (§D3 root seam is separate from these) |

**`adapters/opencode/` layout** (bias to many small files, cohesive by concern):

```
adapters/opencode/
  opencode.json                     # config template (agents, commands, permission, plugin[], subagent_depth)
  README.md                         # install/copy-into-.opencode instructions
  commands/
    craft-run.md  craft-review.md  craft-validation.md  craft-init.md  ...  # one per exposed phase
  agents/
    craft-designer.md  craft-planner.md  craft-part-implementer.md
    craft-reviewer.md  craft-harness-triager.md  craft-docs-writer.md
    craft-backlog-ticker.md  craft-requirements-writer.md  craft-refactor-executor.md
  plugins/
    git-guard.ts                    # tool.execute.before wiring; imports the pure predicate
  src/
    git-guard-predicate.js          # pure: (command) → { block, reason? }  (node-testable)
    craft-root.js                   # pure: (ctx) → absolute root  (node-testable)
    model-tier-map.js               # pure: (tier, overrides) → provider/model  (node-testable)
  test/
    git-guard-predicate.test.js  craft-root.test.js  model-tier-map.test.js
  .claude/workflow.md               # provider-neutral manifest fixture (pi precedent)
```

Telemetry lives in the engine tree per the telemetry-port precedent (§D6), not here.

### D3 — The `CRAFT_ROOT` seam (the central problem)

**Enumerated classification of the 35 `${CLAUDE_PLUGIN_ROOT}` references** (`grep -rl`, excluding
`node_modules`/`.stryker-tmp`/`.git`):

| Class | Count | Files | Needs runtime resolution under opencode? |
|---|---|---|---|
| **Operational — Claude binding surface** | **15** | 14 `skills/<phase>/SKILL.md` (decisions, design, documentation, init, integrate, metrics, planning, promote-config, requirements, review, run, tune, validation, workspace) + `hooks/hooks.json` | **Yes** — these invoke `${CLAUDE_PLUGIN_ROOT}/engine/bin/*.js` and `/scripts/*.sh` |
| **Documentation only** | **20** | `docs/adr/035`, `docs/archive/{DESIGN,PLAN}-P*` (12), `docs/design/…`, `docs/plan/…` (3), `docs/PLAN-portable-named-configs.md`, `docs/PRD-customizable-engine.md`, `docs/PRD-opencode-port.md` | No — prose |
| **Engine core** | **0** | — (bins self-locate via `import.meta.url`) | N/A |

The decisive finding: **the seam is entirely a binding-surface concern.** The engine never reads it.
So resolving it for opencode is about how the opencode *command/plugin surface* locates the engine
tree — the engine needs no runtime knowledge.

**The coupling that must be named** (self-review finding): the root seam (DC-3) and the skill/command
strategy (DC-2) are coupled. If the invariant procedure text is single-sourced by having opencode read the SAME skill
bodies via `.claude/skills/` compat (satisfying R-G2 maximally), then those bodies literally invoke
`${CLAUDE_PLUGIN_ROOT}/engine/bin/*` — **unset under opencode** — and would fail. That forces a
binding-neutral token (`CRAFT_ROOT`) both runtimes set. Conversely, if opencode commands re-express
the dispatch with their own root resolution (a divergent second copy → drift), the Claude skill
bodies stay untouched. §D3 and the skill/command strategy therefore resolve together.

**Candidate shapes** (put to the user in Decision candidates DC-3):

- **(a) Binding-neutral `CRAFT_ROOT` with a Claude-compat shim.** Rewrite the 15 operational
  references to `${CRAFT_ROOT:-${CLAUDE_PLUGIN_ROOT}}` (bash default-expansion; the hook manifest
  gets an equivalent). The Claude binding is behaviour-preserving (the shim defaults to
  `CLAUDE_PLUGIN_ROOT`, which Claude still sets). The opencode binding exports `CRAFT_ROOT` from the
  plugin context (`directory`/`worktree`) into the command shell — the candidate mechanism is the
  `shell.env` hook (pinned §D9 row 14), whether it reaches `` !`cmd` `` command injection is an OPEN
  live item (§D9 row 30). This touches the **Claude binding surface** (`skills/` + `hooks/`) — which is
  NOT in R-SC2's protected set (`engine/`, `contracts/`, `pipeline/`, `templates/`) — and touches
  the engine **not at all**. It is the single-seam, both-bindings shape the PRD recommends.
- **(b) opencode-local resolution only.** The opencode commands resolve the root themselves (a
  `!`node …`` one-liner, or the plugin exporting an env var), and any shared text uses a token the
  opencode command substitutes before dispatch. Zero Claude-surface touch — but then the shared text
  cannot literally be the Claude skill body unless both resolve the same token, pushing toward a
  re-expressed command copy (drift risk).
- **(c) Per-bin wrapper scripts** that normalize the root. Rejected direction: proliferation.

Whichever wins, the resolver logic (compute an absolute, existing, contained root from the opencode
plugin context) is a pure unit-tested seam: `adapters/opencode/src/craft-root.js`.

### D4 — Execution & Model port opencode-binding sections

These are the doc edits that grow `Binding set` to `{ claude, pi, opencode }` and append an opencode
binding section to each port spec (mirroring the Claude/Pi sections' shape). Content:

**`docs/adapters/execution.md` — opencode binding:**

- `spawn(role, ctx)`: dispatch the opencode subagent `craft:<role>` (agent def
  `agents/craft-<role>.md`, `mode: subagent`) via the task tool or `@craft-<role>`, gated by
  `permission.task`. Prepend `ctx.injectedBlock` (the `contract-assemble` output, agent mode) to the
  dispatch prompt, then working dir + task dynamics + artifact paths — the exact structure of the
  "Agent spawns" invariant, now bound to opencode's subagent primitive. Await the commit; verify on
  return. **Artifact-is-the-handoff and dead-worker-respawn hold unchanged** (core invariants): the
  commit is the handoff; a dead subagent is torn down and respawned from the artifact, never resumed.
  Review fan-out = N parallel subagents (agent-mode fan-out; subject to the depth caveat below).
- `runInline(ctx)`: the opencode **primary** agent runs the phase in-session; the block is assembled
  with `--inline` (carries the two inline carve-out lines). Role-less phases
  (`workspace`/`decisions`/`propose`/`integrate`) are session-owned regardless of mode.
- **Subagent-depth topology** (pinned §D9): opencode `subagent_depth` defaults to **1** — a primary
  agent may launch subagents, but those subagents may not launch more. Craft's standard topology fits
  depth 1 IFF the orchestrator (`/craft:run`) runs as a **primary** agent: orchestrator → role
  workers (depth 1), and review fan-out is orchestrator → N reviewers (still depth 1; no reviewer
  spawns a sub-worker). The design REQUIRES the `craft-run` command to run in primary mode (not as a
  `subtask`), and documents `subagent_depth: 1` as the floor. Whether a command-dispatched primary
  keeps role spawns at depth 1, and whether fan-out stays parallel at that depth, is an OPEN live
  item (§D9) — if it degrades, the documented fallback is sequential per-phase (a profile, like pi).
- **Failure → blocker**: a subagent that cannot be reached, a non-zero guard block, or a subagent
  that dies without a committed artifact escalates via the injected blocker protocol
  (`{ unit, reason, ≤3 options }`). Startup vs mid-phase split identical to the Pi section.

**`docs/adapters/model.md` — opencode binding:**

- `select(model)`: bind `provider/model` via the agent def's `model:` frontmatter (or `opencode.json`
  `agent.<role>.model`, or `opencode run -m provider/model`). The adapter maps the craft tier
  (`opus|sonnet|haiku`) → a `provider/model` pair via the tier map (§D8). **The tier→provider mapping
  is the adapter's concern; the resolution ORDER stays core policy** (restated nowhere).
- `isAvailable(model)`: probe whether the mapped provider is configured (a provider key present in
  the opencode provider config). Returns `false` when the tier maps to no configured provider.
- **Failure**: model-down triggers core fallback re-resolution + respawn from artifact (NOT the
  blocker protocol); a tier that resolves to no provider after exhausting the order is a runtime
  blocker. Identical semantics to the Claude/Pi sections.

**Contract-assemble substitution** — see §D5: the opencode subagent binding reuses **agent-mode**
assembly. No opencode branch is added to `contract-assemble` for the recommended shape.

### D5 — Invariant-fidelity proof (R-SC5 / R-G6)

`engine/src/contract.js` expands `@@ARTIFACT_HANDOFF@@` / `@@MODEL_RESOLUTION@@` via `applyCarveOuts`
against `AGENT_VARIANTS` (agent) or `INLINE_VARIANTS` (inline). The current agent variants read:

- artifact-handoff → `the agent commit is the handoff; a dead agent respawns from the artifact`
- model → `the role model resolved from manifest→agent-pin→fallback`

Both are **binding-neutral prose**: the opencode subagent's handoff semantics (commit is handoff,
dead subagent respawns) and resolution order ("agent-pin" = the opencode agent-def `model:` pin under
this binding) are identical to Claude's. So SC5 has two faithful instantiations:

- **(recommended) Reuse the agent variant → zero-line diff.** The opencode-binding assembled block is
  **byte-identical** to the Claude-binding block for the same phase+mode. This matches the Pi
  precedent (Pi adds no variant), touches `contract.js` not at all (R-G1), and is a *stronger*
  fidelity statement than "two lines differ." SC5's assertion becomes:
  `assembleContract(descriptor, {}, FRAGMENTS, {execution:'agent'})` is identical whether invoked for
  the Claude or opencode binding (they call the same function with the same args) — proven by a test
  asserting the opencode binding path invokes agent-mode assembly and that the two carve-out lines are
  the ONLY binding-nameable slots (extending `contract-equivalence.test.js`).
- **(alt) Add an opencode variant set → exactly-two-line diff.** Introduce `OPENCODE_VARIANTS` in
  `contract.js` and a `--binding` flag on `contract-assemble`, so the block differs from Claude's by
  exactly the two carve-out lines (matching SC5's literal wording). This TOUCHES `engine/src` — a
  generic change (a third variant dimension), justifiable only if the opencode carve-out wording must
  genuinely differ. Weighed in DC-5.

Either way the assertion is mechanical and rides the existing `contract-equivalence.test.js` harness
(read the `contracts/` fragments, assemble per binding, diff lines, assert the diff set ⊆ the two
carve-out lines).

### D6 — Telemetry sibling (`collect` binding)

A new `engine/src/observability/adapters/opencode/telemetry.js` exports a `collect`/`parseLines`
binding that maps `opencode run --format json` events → the vendor-neutral `UsageEvent` shape
(`run`, `slug?`, `phase`, `role?`, `model`, `tokens{input,cacheRead,cacheCreation,output}`,
`messages`, `durationMs`, `cacheCreationTtl?`). The pure `aggregate` + `serializeReport` core is
**reused unchanged**; the produced `report.json` is byte-identical in schema (the deep-sorted,
2-space, single-trailing-newline artifact). This is the exact multi-binding seam telemetry.md already
reserves for Pi — an additive sibling, not an engine-core edit.

- **Home**: `engine/src/observability/adapters/opencode/` (telemetry-port precedent — the claude
  binding is there; ADR-085's top-level rule is already excepted for telemetry). Reconciled in DC-9.
- **Front-door**: `usage-mine-main.js` imports the claude binding **directly**. Adding opencode needs
  a generic **`--source claude|opencode`** selector dispatching to the right `collect` binding — the
  telemetry.md validator already carries a `source` concept ("rejects `source: pi`"), so this extends
  an existing validated flag. This is the one generic engine touch (benefits any binding), named in
  DC-9, not an opencode special-case.
- **DEFERRED**: the exact opencode event schema (which events/fields carry tokens, model, duration,
  role/agent, session id) is NOT pinnable from docs — it is an OPEN live item, mapped against a
  running opencode version exactly as the claude binding was pinned against Claude Code JSONL and Pi
  against `@0.79.8` (§D9).
- **Redaction unchanged**: positive whitelist — the opencode binding maps ONLY the whitelisted fields;
  no paths, `$HOME`, usernames, prompt/response text.

The `.claude/craft-metrics.md` append path (`skills/run/SKILL.md` "Done") is runtime-neutral text and
is reused verbatim; the opencode orchestrator appends the same per-phase line from the usage block its
subagent dispatch returns.

### D7 — Guard plugin (the only mandatory code seam)

The Claude binding denies a scripted `git diff/show` lacking `--no-ext-diff` via a PreToolUse hook
(`hooks/git-no-ext-diff.sh`, regex `GIT_DIFF_SHOW_RE`). opencode has no `hooks.json`; a
`permission.bash` pattern map **cannot express "flag absent"** (pinned §D9: patterns are literal +
`*`/`?` wildcards, last-match-wins — no negation). The faithful analog is a plugin hook:

- **`adapters/opencode/plugins/git-guard.ts`** — `tool.execute.before(input, output)` inspects the
  bash tool's command; if it matches `GIT_DIFF_SHOW_RE` and lacks a compliant marker
  (`--no-ext-diff`, `rtk proxy`), it **throws** to block (pinned: `.before` throws to block). The
  wiring adapts opencode's tool-event shape to the predicate, mirroring `adapters/pi/tool-call-hook.js`
  (`adaptPiEvent`).
- **`adapters/opencode/src/git-guard-predicate.js`** — the pure predicate `(command) → {block, reason?}`
  carrying `GIT_DIFF_SHOW_RE` and `COMPLIANT_MARKERS`, re-expressed from `gate.js#toolCallGuard`'s
  git branch. Unit-tested with `node --test` (R-SC4). The `.ts` plugin imports this `.js` predicate
  (Bun/TS import JS transparently), so the regex is single-sourced within the binding and covered by
  `node --test`; the plugin wiring gets a thin runtime (Bun) test for the throw path.
- **DEFERRED**: the exact tool-input field carrying the bash command string under opencode's
  `tool.execute.before` is pinned against a live opencode version (§D9), exactly as Pi pinned
  `event.tool ?? event.name` / `event.input ?? event.arguments` against `@0.79.8`.
- The Pi path-containment guard (write-tool file_path inside the working dir, with a symlink recheck)
  is a **candidate** second guard for opencode (DC-guard-scope) — Pi built it; whether opencode's
  native `edit`/`external_directory` permissions already cover it is an OPEN item. Recommendation:
  port the git-diff guard first (the mechanical parity item), evaluate the path guard against
  opencode's native permission coverage.

Whether `GIT_DIFF_SHOW_RE` should be single-sourced across all three bindings (Claude bash, Pi
`gate.js`, opencode predicate) or re-expressed per binding is DC-guard-source — the Pi precedent is
re-expression + a test that matches the bash behaviour.

### D8 — Model tier map

A committed default `opus|sonnet|haiku → anthropic/<model>` map, expressed two ways that compose:

- **Per-agent default**: each `agents/craft-<role>.md` frontmatter pins `model: anthropic/<sku>` for
  that role's tier (the opencode binding of the agent-def pin) — the zero-config default.
- **Pure map seam**: `adapters/opencode/src/model-tier-map.js` — `resolveOpencodeModel(tier, overrides)
  → provider/model`, unit-tested (R-SC4), the single home of the tier→SKU table. Overrides come from
  `opencode.json` `agent.<role>.model` and (portably) manifest `models.<role>`.

`.claude/workflow.md` stays **provider-neutral** — `models.<role>` carries TIER strings
(`opus|sonnet|haiku`), never `provider/model` (matching `adapters/pi/.claude/workflow.md`'s
"No provider/model pinned here"). The tier→provider/model mapping is opencode-binding-local, so the
manifest stays portable across bindings. Provider-agnosticism (R-G5) is proven by mapping a tier to a
non-Anthropic `provider/model` in the live smoke (pi-Gemini precedent).

### D9 — Pinned external opencode matrix

Re-fetched from `opencode.ai/docs` on **2026-07-17** and confirmed against the PRD baseline.
`C` = CONFIRMED-via-docs (2026-07-17); `D` = DEFERRED-to-live-smoke (pin against the target opencode
version, mirror pi's `@0.79.8` pinning).

| # | Fact (load-bearing) | Value pinned | Status |
|---|---|---|---|
| 1 | Skill discovery paths | `.opencode/skills/<n>/SKILL.md`, `~/.config/opencode/skills/`, `.claude/skills/`, `~/.claude/skills/`, `.agents/skills/`, `~/.agents/skills/`; project paths walk up to the git worktree | C |
| 2 | Skill `name` frontmatter | required, 1–64, `^[a-z0-9]+(-[a-z0-9]+)*$`, must equal dir name | C |
| 3 | Skill `description` | required, 1–1024; optional `license`/`compatibility`/`metadata`(string map); unknown fields ignored | C |
| 4 | Skill invocation | native `skill` tool, `skill({ name })`, on-demand; `tools.skill:false` disables | C |
| 5 | Agent dirs | `.opencode/agents/` + `~/.config/opencode/agents/` + JSON `agent.<name>`; filename = id | C |
| 6 | Agent frontmatter | `description`(req), `mode` primary\|subagent\|all (default **all**), `model` provider/model, `temperature`, `top_p`, `steps`, `disable`, `hidden`(subagents), `color`, `prompt`(`{file:./…}`), `permission`(map); `tools` deprecated | C |
| 7 | Subagent invocation | auto-by-description, `@mention`, or task tool; `permission.task` gates the task tool; denied subagents excluded from the tool description | C |
| 8 | Command dirs | `.opencode/commands/` + `~/.config/opencode/commands/` + JSON `command.<name>`; filename = command name | C |
| 9 | Command frontmatter | `description`(req), `agent`, `model`, `subtask`(bool → force subagent); body = prompt template | C |
| 10 | Command templating | `$ARGUMENTS`, `$1`,`$2`…; shell injection `` !`cmd` `` (runs in project root, output inlined); file ref `@path` | C |
| 11 | Plugin dirs | `.opencode/plugins/` + `~/.config/opencode/plugins/` + npm via `plugin[]` in config | C |
| 12 | Plugin signature | `async ({ project, client, $, directory, worktree }) => ({ hooks })`; `$` = Bun shell | C |
| 13 | `tool.execute.before` | `(input, output)`; **throw to block**; mutate `output.args`; plus `tool.execute.after` | C |
| 14 | Other hooks | `session.*`, `permission.asked`/`replied`, `file.edited`, `command.executed`, generic `event`, `shell.env`, `tui.*`, … | C |
| 15 | Config schema/keys | `$schema https://opencode.ai/config.json`; keys `model`,`small_model`,`provider`,`agent`,`command`,`permission`,`mcp`,`plugin`,`instructions`,`tools`,`default_agent`,`subagent_depth`,`compaction`,`experimental` | C |
| 16 | Config merge order | remote(.well-known) < global(~/.config) < `OPENCODE_CONFIG` < project(`opencode.json`) < `.opencode/` < inline(`OPENCODE_CONFIG_CONTENT`) < managed < macOS-managed | C |
| 17 | Per-agent override | agent `model`/`permission`/`tools` override top level | C |
| 18 | `subagent_depth` | default **1** (primary→subagent ok, subagent→subagent blocked); `0` disables; `2` = one more level | C |
| 19 | Permission keys | `read`,`edit`,`glob`,`grep`,`bash`,`task`,`skill`,`lsp`,`question`,`webfetch`,`websearch`,`external_directory`,`doom_loop` | C |
| 20 | Permission values / bash map | `allow\|ask\|deny`; bash accepts a pattern map, **last-match-wins**; `*`=zero+ chars, `?`=one char; **no flag-absence expression** | C |
| 21 | CLI headless | `opencode run [message..]`: `-m/--model provider/model`, `--agent`, `-s/--session`, `-c/--continue`, `--fork`, `--format default\|json`, `-f/--file`, `--auto`; `opencode serve`; `--print-logs`, `--log-level` | C |
| 22 | Rules/instructions | reads `AGENTS.md` + Claude-compat `CLAUDE.md`/`~/.claude/CLAUDE.md`; `OPENCODE_DISABLE_CLAUDE_CODE=1` (granular `_PROMPT`/`_SKILLS`); `instructions[]` = paths/globs/URLs | C |
| 23 | plural vs singular dir names honoured by the target version | docs use both; historically singular `agent/`/`command/` — confirm which the pinned version accepts | **D** |
| 24 | bash tool-input field carrying the command string in `tool.execute.before` | needed for `git-guard.ts` `adapt…Event` | **D** |
| 25 | `opencode run --format json` event schema (token/model/duration/role/session fields) | needed for the telemetry `collect` binding | **D** |
| 26 | orchestrator-as-primary keeps role spawns at depth 1; review fan-out parallel vs sequential at depth 1 | topology validity | **D** |
| 27 | whether the `skill` tool can carry per-phase dynamics (phase id, part text, gate string, artifact paths) or commands must | decides how much DC-2 leans on Skills vs commands (PRD OQ §9) | **D** |
| 28 | `question` permission / interactive prompt reachable from a command-driven subagent flow (AskUserQuestion analog) | ADR/merge-confirm conversations | **D** |
| 29 | minimum opencode version supporting Skills + `.claude/skills` compat + `tool.execute.before` throw + `permission.task` | install floor | **D** |
| 30 | whether a plugin (via `shell.env` or otherwise) can export `CRAFT_ROOT` into the `` !`cmd` `` command-injection shell | the DC-3a export mechanism | **D** |
| 31 | whether an opencode subagent dispatch returns a per-invocation usage block (tokens/duration) to the orchestrator session | metrics-append (`.claude/craft-metrics.md`) + model-class-matrix source; distinct from row 25 (the `--format json` mining path) | **D** |

The D-rows are the live-smoke agenda for `docs/adapters/opencode-poc-record.md` (R-SC3), pinned to an
exact opencode version at implementation time.

Note on `.claude/` state vs opencode's Claude-compat loader: `.claude/workflow.md` and
`.claude/craft-*.md` are read by **engine code** (`fs`, rooted at the repo root — `skills/run/SKILL.md`
step 1c-mem), NOT by opencode's instruction/skill compat loader. So `OPENCODE_DISABLE_CLAUDE_CODE`
(which governs opencode reading `CLAUDE.md`/`.claude/skills/`) does **not** affect DC-7a — the engine
reads its manifest and state regardless of that flag. The disable flag matters only to DC-2c (relying
on `.claude/skills/` compat for procedure text).

## Decision candidates

Every load-bearing choice not pre-decided by an existing ADR. ≤3 alternatives each, a
recommendation, no decision (the ADR phase decides). PRD §7 constraints are NOT re-opened.

| # | Choice | Alternatives (≤3) | Recommendation | Why |
|---|---|---|---|---|
| DC-1 | Binding home & distribution | (a) `adapters/opencode/` in-repo, opencode-native shape, installed by copy/symlink into a target repo's `.opencode/`; (b) separate `@craft/opencode` npm package via `plugin[]`; (c) generated into a target repo by a `craft:init`-style emitter | **(a)** | Consistent with ADR-085; single repo, no second release surface; matches the pi in-repo precedent |
| DC-2 | Skill/command strategy (coupled to DC-3) | (a) native `commands/` thin entrypoints + invariant text single-sourced via shared contract + Skills surface; (b) fully translate each phase skill into a standalone opencode command; (c) rely purely on `.claude/skills/` compat, no native commands | **(a)** | No second copy of load-bearing rules (R-G2); (b) drifts; (c) loses first-class `/craft:*` discoverability and is disable-able via `OPENCODE_DISABLE_CLAUDE_CODE_SKILLS` |
| DC-3 | Root seam `${CLAUDE_PLUGIN_ROOT}` (coupled to DC-2) | (a) binding-neutral `CRAFT_ROOT` with a Claude-compat shim (`${CRAFT_ROOT:-${CLAUDE_PLUGIN_ROOT}}`) across the 15 operational refs, exported by the opencode plugin context; (b) opencode-local resolution only (Claude surface untouched, shared-text token substituted per command); (c) per-bin wrapper scripts | **(a)** | One seam, both bindings, engine untouched (touches only `skills/`+`hooks/`, not R-SC2's protected set); mandatory if the skill body is single-sourced (DC-2a); shim is behaviour-preserving for Claude |
| DC-4 | Execution binding | (a) opencode subagents (`mode: subagent`) via task tool / `@role`, review fan-out = parallel subagents; (b) per-phase `opencode run --agent` subprocess (mirrors pi, discards interactivity); (c) inline-only, no fan-out | **(a)** | Keeps the interactive-TUI value the user chose; honours artifact-handoff + dead-worker-respawn |
| DC-4b | Subagent-depth / nesting | (a) orchestrator = primary agent, roles = depth-1 subagents, document `subagent_depth: 1`; (b) flatten to single-level sequential inline phases | **(a)** | Fits depth-1 default without raising it; (b) loses fan-out. Depends on D-row 26 (live) |
| DC-5 | Contract-equivalence framing (R-SC5) | (a) reuse the agent variant → opencode block byte-identical to Claude (zero-line diff), assert via `contract-equivalence.test.js`; (b) add `OPENCODE_VARIANTS` + `--binding` flag to `contract.js` → exactly-two-line diff; (c) parameterize carve-outs another way | **(a)** | Matches the pi precedent (a binding adds no variant), no engine touch (R-G1), stronger fidelity than "two lines". (b) touches `engine/src/contract.js` for wording that is already binding-neutral |
| DC-6 | Model tier map | (a) committed default `opus\|sonnet\|haiku → anthropic/…` map (pure seam + per-agent frontmatter), overridable via `opencode.json` and manifest `models.<role>` (tier strings only); proven against one non-Anthropic provider; (b) require the user to set every agent's model; (c) Anthropic-only | **(a)** | Provider-agnostic (R-G5), zero-config, pi-Gemini precedent; keeps `.claude/workflow.md` provider-neutral |
| DC-guard-binding | Git-diff guard binding | (a) opencode plugin `tool.execute.before` throwing on the un-flagged `git diff/show`; (b) `permission.bash` pattern; (c) drop the guard on opencode | **(a)** | (b) cannot express "flag absent" (pinned §D9 row 20); (c) reintroduces silent diff mangling |
| DC-guard-source | Guard predicate single-sourcing | (a) re-express `GIT_DIFF_SHOW_RE` in `adapters/opencode/src/` + a test matching the bash behaviour (pi precedent); (b) extract a shared predicate module all three bindings import; (c) generate the plugin from the bash script | **(a)** | Matches how pi handled it; (b) would need a shared home the engine or a new package owns (scope creep) |
| DC-guard-scope | Path-containment guard | (a) port git-diff guard now, evaluate the write-path guard against opencode's native `edit`/`external_directory` permissions; (b) port both guards (git-diff + symlink-aware path containment) as pi did; (c) rely solely on opencode native permissions | **(a)** | Mechanical parity item is the git-diff guard; opencode may cover path containment natively (D-row) — avoid rebuilding what the runtime provides |
| DC-7 | Repo-local state paths | (a) reuse `.claude/workflow.md` + `.claude/craft-*.md` verbatim; (b) mirror to `.opencode/craft-*.md`; (c) make the base path a manifest knob | **(a)** | Repo-local markdown the engine roots at repo root; opencode reads `.claude/`; zero divergence, no new surface |
| DC-8 | Proof & CI strategy | (a) deterministic seams unit-tested in `adapters/opencode/test/` + the telemetry parser in `engine/test/` + one on-demand live smoke recorded in `docs/adapters/opencode-poc-record.md`; (b) CI-gated live opencode run; (c) manual-only, no unit tests | **(a)** | Exact pi precedent (ADR-088/089); (b) couples CI to an opencode install + provider key; (c) forfeits regression cover |
| DC-9 | Telemetry binding home & front-door | (a) `engine/src/observability/adapters/opencode/telemetry.js` + a generic `--source claude\|opencode` selector in `usage-mine-main.js` (per telemetry.md's reserved multi-binding seam); (b) put the collect binding under `adapters/opencode/` and feed a thin CLI into engine `aggregate` (keeps engine additive-only); (c) defer telemetry (metrics via the existing `.claude/craft-metrics.md` append only) | **(a)** | telemetry.md already homes bindings there (claude sibling; Pi reserved); the source selector is a generic touch benefiting any binding. (b) contradicts the established telemetry-port home; (c) forfeits the `report.json` parity SC |
| DC-live-smoke-scope | Live-smoke phase scope | (a) one construction-bearing phase end-to-end (pi ADR-088 parity); (b) a short multi-phase slice (design→implementation); (c) full default pipeline | **(a)** | Proves the load-bearing ports together (Execution/Model/Gate/VCS) at minimum surface; matches ADR-088 |

## Test strategy

Deterministic seams in CI; one on-demand live smoke. No new engine-level runtime dependency
(bash + node built-ins + the plugin's Bun runtime). The design is partitioned for the planner to cut
into many small TDD parts; suggested part shapes (from the part-sizing corpus) in brackets.

**Deterministic (CI, `node --test`):**

- **git-guard predicate** [`bash-helper`/`validator`]: `git-guard-predicate.js` — table-driven
  RED→GREEN over the `GIT_DIFF_SHOW_RE` matrix mirrored from `gate.js`/`git-no-ext-diff.sh`
  (matches: `git diff`, `git show`, global-opt forms `-C`/`-c`/`--git-dir=`/`--work-tree=`; exempts
  `--no-ext-diff`, `rtk proxy`, `git stash show`, `git show-ref`, `git difftool`). Property lens: any
  command carrying `--no-ext-diff` never blocks; any bare `git diff/show` always blocks.
- **tier→model map** [`validator`]: `model-tier-map.js` — `resolveOpencodeModel(tier, overrides)` over
  `{opus,sonnet,haiku}`, override precedence (`opencode.json` agent model > manifest tier > default),
  unknown-tier handling.
- **CRAFT_ROOT resolver** [`bash-helper`]: `craft-root.js` — resolves an absolute, existing,
  containment-checked root from a plugin-context stub (`directory`/`worktree`); rejects a root that
  escapes; the Claude-compat shim default-expansion is asserted at the bash layer.
- **telemetry parser** [`jsonl-parse-binding`]: `observability/adapters/opencode/telemetry.js` —
  event-fixtures → `UsageEvent[]`; malformed-line skip; synthetic/zero-cost exclusion; redaction
  (whitelist-only fields). Fixtures are frozen captures pending the live schema pin (D-row 25).
- **report byte-match** [`pure-aggregate-core`]: opencode `UsageEvent[]` → `aggregate` →
  `serializeReport` yields a `report.json` byte-identical in schema to the claude path (deep-sorted,
  2-space, single trailing newline).
- **front-door selector** [`cli-streaming-entrypoint`]: `usage-mine-main.js` `--source` dispatch
  (claude default; opencode routes to the new binding; unknown source rejected at startup).
- **contract-equivalence** [`validator`]: extend `contract-equivalence.test.js` to assert the
  opencode-binding assembled block ⊆ Claude's + the two carve-out lines (zero-line under DC-5a).
- **plugin wiring** (Bun/opencode runtime test): `git-guard.ts` throws on a blocked command, passes a
  compliant one, adapts the (pinned) tool-event shape.
- **docs structure** [`adapter-port-doc`/`docs-prose`]: `docs/adapters/execution.md` +
  `model.md` gain a well-formed opencode binding section; `Binding set` reads `{ claude, pi, opencode }`;
  the existing `docs-structure-lint.sh`/`design-lint.sh` families stay green (enumerate-and-run).

**On-demand live smoke (not CI-gated, ADR-089 parity):** drive one construction-bearing phase
end-to-end through the opencode subagent binding in a `mktemp` throwaway repo (state-mutating probe
rule): gate green before commit, mutations confined to the throwaway, committed artifact = handoff.
Provider may be non-Anthropic (R-G5). Record version, provider/model, ports exercised, per-phase
outcome, and the resolved D-rows (23–29) in `docs/adapters/opencode-poc-record.md`, mirroring
`pi-poc-record.md`. The acceptance-probe shape mirrors `adapters/pi/src/probe.js`
(`runAcceptanceProbe` with injected runner + `fsOps.mktemp`), so the structural assertions
(`gateGreenBeforeCommit`, `committedArtifact`, `mutationsInsideThrowaway`) are unit-testable without a
live opencode.

## Out of scope

- **The headless pi-style Execution subprocess adapter as the product** — deselected at kickoff; a
  subprocess path may back the live smoke's acceptance-probe runner only.
- **Rewriting the engine or the invariant contract** — floors in `contracts/core.md` are preserved;
  the only engine touches are the additive telemetry sibling and the generic source selector (DC-9).
- **Byte-identical Claude affordances** — nearest native affordance is the target (e.g.
  `AskUserQuestion` → interactive session prompt / `question` permission).
- **CI-gating a live opencode run** — on-demand smoke only (ADR-089 parity).
- **A general Claude-Code→opencode migration tool** — craft-specific port.
- **Engineering around provider free-tier quirks** — documented (pi-poc precedent), not built.
- **Raising `subagent_depth` above the default** unless the live smoke (D-row 26) proves the
  orchestrator-as-primary topology needs it — kept out until evidence forces it.
- **Relocating the Claude binding under `adapters/claude/`** — ADR-085 explicitly left the Claude
  adapter as `skills/` + `agents/` + `hooks/`; this port does not move it.
