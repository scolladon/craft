# PRD — opencode port: a native opencode binding of the craft delivery harness

> Status: **draft for discussion** — pre-run brief for the opencode port.
> This is a pre-run brief: a later `/craft:run docs/PRD-opencode-port.md` produces the
> real design doc; the Decision candidates in §6 are the expected ADR forks.
> Scope was pinned in the kickoff conversation: **native opencode packaging**
> (opencode users run the full workflow interactively in the opencode TUI), *not* the
> headless pi-style Execution subprocess adapter.

## 1. Problem

craft's engine core is already runtime-agnostic — the `engine/` bins (`pipeline-resolve`,
`contract-assemble`, `manifest-lint`, …), `contracts/`, `pipeline/default.yml`, `templates/`,
and the `scripts/` lints are plain Node/bash that any runtime can drive. The
**Harness-as-a-Service** pattern already names the seams (Execution, Model, Memory,
Telemetry, VCS, Policy, Backlog, Intention ports) and already ships a *second* binding for
one of them: `adapters/pi/` proves the Execution port is pluggable on a non-Claude runtime.

But everything a **user** touches is bound to Claude Code:

| Surface | Today (Claude binding) | Why it doesn't run on opencode as-is |
|---|---|---|
| Phase procedures + orchestrator | 19 `skills/<phase>/SKILL.md`, invoked as `/craft:<skill>` | bodies reference `${CLAUDE_PLUGIN_ROOT}` (34 files), spawn Task subagents, and call `AskUserQuestion` — none exist in opencode |
| Role workers | 10 `agents/<role>.md` with `model: opus\|sonnet\|haiku` pins | Claude subagent frontmatter + Claude SKU pins; opencode subagents use `provider/model` strings |
| Guard | `hooks/hooks.json` PreToolUse deny (`git-no-ext-diff.sh`) | Claude hook schema; opencode has no `hooks.json` |
| Packaging | `.claude-plugin/plugin.json` + `marketplace.json` | Claude marketplace format; opencode discovers `agents/`, `commands/`, `plugins/`, `skills/` + `opencode.json` |
| Model resolution | tier → Claude SKU via agent-def frontmatter pin | opencode binds `provider/model`; no tier→SKU map exists for it |
| Execution / Ask | Task spawn = `spawn`; `AskUserQuestion` = ADR/merge conversation | opencode uses subagents (`@role` / task tool) + interactive session prompts |

The engine is portable; the **binding layer is not**. opencode — the target — happens to
have a rich native extensibility surface *and* partial Claude-compat (it reads
`.claude/skills/` and `~/.claude/CLAUDE.md`), so a faithful native port is tractable
without forking the engine.

## 2. Intent

Ship a **native opencode binding of craft**: an opencode user installs one tree, and runs
the same gated 11-phase workflow (`/craft:run`, `/craft:review`, `/craft:validation`,
`/craft:init`, …) interactively in the opencode TUI — driven by the **same engine core**,
under the **same engine-owned invariant contract**. The binding set grows
`{ claude, pi } → { claude, pi, opencode }`. The engine is the single source of truth; the
port adds a binding, never a second engine and never a second copy of a load-bearing rule.

## 3. Goals

- **G1 — Engine untouched.** `engine/`, `contracts/`, `pipeline/`, `templates/`, and the
  lint logic in `scripts/` are reused byte-for-byte. The port is additive: a new
  `adapters/opencode/` tree (per ADR-085, adapter code lives under top-level `adapters/`)
  plus doc updates. If a port need forces an engine change, that change is generic
  (benefits every binding) and justified as its own decision — never an opencode special-case.
- **G2 — One binding seam, not a fork.** The load-bearing procedure text stays single-sourced.
  opencode commands are **thin dispatchers**; the invariant contract is assembled by the same
  `contract-assemble` bin, using the existing `@@ARTIFACT_HANDOFF@@` / `@@MODEL_RESOLUTION@@`
  substitution markers to inject opencode-binding wording. No phase's rules are copy-pasted.
- **G3 — Faithful primitive map.** Every craft primitive maps to its nearest opencode-native
  affordance (see §5 table), preserving behaviour, not just shape.
- **G4 — Portable root seam.** The 34-file `${CLAUDE_PLUGIN_ROOT}` dependency is replaced by a
  binding-neutral root the opencode binding can resolve, so the same bins run under both
  bindings.
- **G5 — Provider-agnostic model binding.** A default tier→`provider/model` map (Anthropic
  SKUs) that is fully swappable — proven, as pi was, against a non-Anthropic provider.
- **G6 — Invariant fidelity, provable.** The injected block under the opencode binding carries
  the identical core floors as the Claude binding, differing only by the two binding carve-out
  lines — asserted mechanically (the `contract-equivalence` precedent).
- **G7 — Zero-config parity.** A repo with a discoverable test command and no manifest runs the
  default pipeline on opencode; a repo with no test command hits the same gate-floor refusal.

## 4. Non-goals

- **Rewriting the engine or the invariant contract.** The floors in `contracts/core.md`
  (never-commit-on-red, artifact-handoff, blocker protocol, no-provenance, bounded scope,
  model-class floor) are port-agnostic and preserved.
- **The headless pi-style Execution subprocess adapter as the deliverable.** Explicitly
  deselected at kickoff. (A subprocess path may still back the on-demand smoke; it is not the
  product.)
- **Byte-identical Claude affordances.** opencode's nearest native affordance is the target —
  e.g. `AskUserQuestion`'s exact multi-select UI maps to opencode's interactive session prompt
  / `question` permission, not a pixel-parity reimplementation.
- **CI-gating a live opencode run.** On-demand smoke only, exactly like pi (ADR-089): CI proves
  the deterministic seams; the live run is refreshed on demand.
- **A general Claude-Code→opencode plugin migration tool.** This port is craft-specific.
- **Engineering around provider free-tier quirks.** Rate-limit / turn-budget accommodations are
  documented (pi-poc precedent), not built into the adapter.

## 5. Proposed shape (for the design phase to elaborate)

Two layers, same split as every existing binding — **the engine-owned protocol** (unchanged)
and **the opencode binding** (new). The binding lives in `adapters/opencode/` and is
opencode-native in shape.

### Primitive map (craft → opencode)

| Craft primitive | opencode-native target | Notes |
|---|---|---|
| `skills/<phase>` procedures + `skills/run` orchestrator | `adapters/opencode/commands/craft-<phase>.md` (thin dispatchers) + shared skill text via opencode's Skills surface (`SKILL.md`, incl. `.claude/skills/` compat) | commands carry `$ARGUMENTS`; procedure invariants sourced from the shared contract, not re-authored |
| `agents/<role>.md` (`model: <tier>`) | `adapters/opencode/agents/craft-<role>.md` (`mode: subagent`, `model: <provider/model>`, `permission:`) | frontmatter `name`/`description` already portable; body text reused |
| `hooks/hooks.json` + `git-no-ext-diff.sh` | `adapters/opencode/plugins/git-guard.ts` — `tool.execute.before` throws on `git diff/show` missing `--no-ext-diff` | plugin hook is the only faithful analog (a `permission.bash` pattern cannot express "flag absent") |
| `engine/` bins, `scripts/*.sh`, `contracts/`, `templates/`, `pipeline/default.yml` | reused verbatim; invoked via `` !`…` `` in commands and Bun `$` in the plugin | see the root seam (§6.3) for `${CLAUDE_PLUGIN_ROOT}` |
| `.claude-plugin/plugin.json` + `marketplace.json` | `adapters/opencode/opencode.json` template (`agent`/`command`/`permission`/`plugin`/`instructions`/`mcp`) + directory conventions | opencode merges global < project < `.opencode/` |
| Model tier → Claude SKU (agent frontmatter pin) | tier → `provider/model` map (Model port, opencode binding) | default Anthropic, swappable via `opencode.json` `agent.<role>.model` or manifest `models.<role>` |
| Execution `spawn(role,ctx)` = Task subagent | opencode subagent invocation (task tool / `@craft-<role>`, gated by `permission.task`); review fan-out = N subagents | `runInline` = in-session; artifact-is-the-handoff + dead-worker-respawn invariants hold (commit is the handoff) |
| `AskUserQuestion` (ADRs, escalations, merge confirm) | opencode interactive session prompt / `question` permission | native session is interactive |
| Telemetry (`engine/src/observability/adapters/claude/`) | new `observability/adapters/opencode/` sibling reading `opencode run --format json` events | usage → `.claude/craft-metrics.md`, unchanged sink |
| `.claude/workflow.md`, `.claude/craft-*.md` (manifest, memory, metrics, named configs) | reused verbatim (repo-local markdown, engine-rooted at repo root; opencode also reads `.claude/`) | see §6.7 |

### Binding integration points (engine-owned, per port)

- **Execution port** (`docs/adapters/execution.md`) gains an **opencode binding** section:
  `spawn` → opencode subagent; `runInline` → in-session; failure→blocker unchanged.
- **Model port** (`docs/adapters/model.md`) gains an **opencode binding**: `select` binds
  `provider/model`; `isAvailable` probes configured providers; resolution order stays core policy.
- **Contract assembly**: `@@ARTIFACT_HANDOFF@@` / `@@MODEL_RESOLUTION@@` get an opencode
  substitution alongside the Claude one, so the injected block reads natively without a second
  contract file.

## 6. Decision candidates (the expected ADR forks)

1. **Binding home & distribution.** (a) **`adapters/opencode/` in-repo, opencode-native shape
   (`agents/`, `commands/`, `plugins/`, `opencode.json`), installed by copy/symlink into a target
   repo's `.opencode/`** *(recommended — consistent with ADR-085 adapters-tree placement; single
   repo, no fork)*; (b) a separate `@craft/opencode` npm package (opencode `plugin[]` install, but
   a second release surface); (c) generated into a target repo by a `craft:init`-style emitter (no
   committed reference tree).
2. **Skill/command strategy.** (a) **native `commands/` as thin entrypoints; invariant procedure
   text single-sourced through the shared contract + Skills surface** *(recommended — no second
   copy of load-bearing rules, satisfies G2)*; (b) fully translate each phase skill into a
   standalone opencode command (clean but a divergent second copy → drift); (c) rely purely on
   opencode's `.claude/skills/` compat with a binding shim, no native commands (loses first-class
   `/craft:*` discoverability).
3. **Root seam (`${CLAUDE_PLUGIN_ROOT}`).** (a) **binding-neutral `CRAFT_ROOT`: the Claude binding
   sets it from `${CLAUDE_PLUGIN_ROOT}`; the opencode binding resolves it from the plugin
   `directory`/`worktree` context (exported to the command shell) or an env var** *(recommended —
   one seam, both bindings, minimal engine touch)*; (b) hardcode an opencode install path (brittle);
   (c) per-bin wrapper scripts (proliferation). Note: (a) is the one *possible* generic engine
   touch — a variable rename with a Claude-compat shim — to be weighed in design.
4. **Execution binding.** (a) **opencode subagents (`mode: subagent`), dispatched via task tool /
   `@role`; review fan-out = parallel subagents** *(recommended — keeps the interactive-TUI value the
   user chose; honours artifact-handoff + dead-worker-respawn)*; (b) per-phase `opencode run --agent`
   subprocess (mirrors pi, discards interactivity); (c) inline-only (no fan-out, loses parallel review).
4b. **Subagent-depth / nesting.** craft spawns role workers from an orchestrating session; opencode
   caps nesting via `subagent_depth`. (a) **orchestrator runs as a primary agent, roles as depth-1
   subagents; document the required `subagent_depth`** *(recommended)*; (b) flatten to single-level
   with sequential inline phases (loses fan-out).
5. **Model tier map.** (a) **committed default `opus\|sonnet\|haiku → anthropic/…` map, overridable
   per-role via `opencode.json` and manifest `models.<role>`; proven against one non-Anthropic
   provider** *(recommended — provider-agnostic, pi-Gemini precedent)*; (b) require the user to set
   every agent's model (not zero-config); (c) Anthropic-only (forfeits the portability proof).
6. **Guard binding.** (a) **opencode plugin `tool.execute.before` throwing on the un-flagged
   `git diff/show`** *(recommended — faithful port of the PreToolUse deny)*; (b) `permission.bash`
   pattern *(rejected — cannot express "flag absent")*; (c) drop the guard on opencode (silent diff
   mangling returns).
7. **Repo-local state paths.** (a) **reuse `.claude/workflow.md` + `.claude/craft-*.md` verbatim**
   *(recommended — they're repo-local markdown the engine roots at the repo root; opencode reads
   `.claude/` anyway; zero divergence)*; (b) mirror to `.opencode/craft-*.md` (two SoTs); (c) make
   the base path a manifest knob (new surface for no proven need).
8. **Proof & CI strategy.** (a) **deterministic seams unit-tested in `adapters/opencode/test/`
   (git-guard, tier-map, `CRAFT_ROOT` resolver, telemetry parser) + one on-demand live smoke
   driving ≥1 construction phase end-to-end, recorded in `docs/adapters/opencode-poc-record.md`**
   *(recommended — exact pi precedent, ADR-088/089/091)*; (b) CI-gated live opencode run (couples CI
   to an opencode install + provider key); (c) manual-only, no unit tests.

## 7. Settled by the kickoff (constraints, not forks)

- **Native packaging**, not the headless pi-style subprocess adapter (user-selected).
- **Engine core is the single source of truth** — no fork, no second copy of any load-bearing
  rule; any engine change must be generic and separately justified.
- The **binding set** grows to `{ claude, pi, opencode }`; `docs/adapters/execution.md` and
  `model.md` gain an opencode binding section (their `Binding set` line updates).
- The **invariant contract** (`contracts/core.md` floors) is preserved via the existing
  `contract-assemble` substitution seam.
- **Provenance rule unchanged** — no phase/ADR/backlog refs in source or test.
- **Provider-agnostic**: default Anthropic, tier map swappable; portability proven with a
  non-Anthropic provider (pi-Gemini precedent).
- **On-demand live proof**, not CI-gated (pi precedent).

## 8. Success criteria

- **SC1 — Zero-config parity.** An opencode user in a repo with a discoverable test command and no
  manifest runs the default pipeline; a repo with no test command hits the identical gate-floor
  refusal (parity with the Claude binding).
- **SC2 — Engine untouched.** `git diff` shows no functional change under `engine/`, `contracts/`,
  `pipeline/`, `templates/` (a generic `CRAFT_ROOT` rename with a Claude-compat shim, if adopted,
  is the only allowed touch and is behaviour-preserving for the Claude binding).
- **SC3 — Live smoke.** A live opencode run drives ≥1 construction phase end-to-end
  (RED→GREEN→commit) through the opencode subagent binding: gate green before commit, mutations
  confined to the worktree, committed artifact = handoff. Recorded in
  `docs/adapters/opencode-poc-record.md` (pi-poc parity). Provider may be non-Anthropic to prove
  provider-agnosticism.
- **SC4 — Deterministic seams green.** The git-guard plugin, the tier→model map, the `CRAFT_ROOT`
  resolver, and the telemetry parser have `node --test` (and, for the plugin, its runtime's test)
  coverage with no new engine-level runtime dependency.
- **SC5 — Invariant fidelity.** The assembled injected block under the opencode binding differs
  from the Claude binding only by the two binding carve-out lines — asserted mechanically
  (`contract-equivalence` precedent).
- **SC6 — Interactive surface.** At least the core commands (`/craft:run`, `/craft:review`,
  `/craft:validation`, `/craft:init`) are invocable in the opencode TUI and dispatch the
  corresponding phase(s), flags (`--profile`/`--skip`/`--config`) parsed identically.

## 9. Open questions for the design conversation

- Exact opencode directory names to target (`agents/` vs back-compat `agent/`, etc.) and the
  minimum opencode version that supports the Skills surface + `.claude/skills` compat + the
  hooks used by the guard plugin — pin empirically against a live opencode, per the designer's
  "never design an external contract from memory" contract.
- Whether opencode's Skills `skill` tool invocation can carry the per-phase dynamics craft needs
  (phase id, part text, gate string, artifact paths) or whether commands must carry them — decides
  how much of §6.2 (a) leans on Skills vs commands.
- Whether the review fan-out's parallelism is achievable within opencode's subagent model at the
  desired `subagent_depth`, or degrades to sequential (a documented profile, like pi's).
