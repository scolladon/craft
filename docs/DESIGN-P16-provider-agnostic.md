# Design — P16: provider-agnostic ports/adapters boundary + Pi adapter PoC

> Brief: make craft provider-agnostic (PRD §17 P16 row; G13). Two deliverables: (1) **formalize
> the hexagonal ports/adapters boundary** — name and cleanly extract the still-inline-bound ports
> (Execution, Model) so a non-Claude adapter can re-bind them, reconciling with the already-pinned
> VCS verbs (SP8) and the extracted Gate/Backlog ports; (2) a **non-Claude adapter PoC against Pi**
> ([pi.dev](https://pi.dev), `@earendil-works/pi-coding-agent`) — gate to "done": *the Pi adapter
> runs a craft scenario end-to-end*. Pi ships no sub-agents / no MCP / no permission gates, so the
> adapter must supply execution + gate/tool-guard via Pi's SDK/extensions — the concrete proof that
> pushing enforcement into the engine (P5) unlocks portability.
> Status: draft → self-reviewed ×3 → accepted

## Context

### Where the hexagon stands today

`DESIGN-customizable-engine.md` §2.1 is the living architecture SoT: a provider-neutral domain
core behind **six named ports**, with the Claude Code adapter binding each port to a concrete
primitive. P3–P5 *named the seam* for all six but, per the §2.1 Scope note (~line 147), only
**two are cleanly extracted**; the rest remain bound inline in the Claude adapter's orchestrator
prose and agent text. The current extraction status, pinned against the worktree:

| Port | Extraction status today | Where it is bound | Evidence (this checkout) |
|---|---|---|---|
| **Gate / tool-guard** | **Extracted** | `hooks/*` (PreToolUse) + per-phase gate strings resolved by `engine/src/gates.js` | `hooks/git-no-ext-diff.sh`, `gates.js` `resolveGate` |
| **VCS / integration** | **Extracted** (verbs pinned SP8) | `scripts/worktree-setup.sh` / `worktree-teardown.sh` + `gh`/git CLI | SP8 verbs `isolate/commit/diff/defaultBranch/propose/integrate/teardown` |
| **Backlog SoT** | **Extracted** (P11) | `docs/adapters/backlog.md` spec + `engine/src/manifest.js` validation | `resolve`/`complete`, sources `{file, custom}` |
| **Code-access / retrieval** | **Env-sourced** (never adapter-owned, G14) | the runtime's own read/navigate tools; engine only *derives + injects* the strategy note | `contract.js` `deriveRetrievalNote` |
| **Execution** | **Inline-bound** — NOT extracted | `skills/run/SKILL.md` "Agent spawns" invariant (spawn `craft:<role>` as a Task; prepend the injected block) + the inline-mode branch | `run/SKILL.md` §"Execute", "Agent spawns" |
| **Model** | **Inline-bound** — NOT extracted | `run/SKILL.md` "Model resolution & fallback" invariant + each agent's frontmatter `model:` pin | `run/SKILL.md`; `agents/*.md` `model:` (opus/sonnet/haiku) |

"**The Claude adapter is craft today**" is concrete: the engine core (provider-neutral) is
`engine/src/**` (parse/resolve/validate/assemble — `index.js` re-exports `parsePipeline`,
`validatePipeline`, `resolvePipeline`, `assembleContract`, `normalizeFindings`, `validateManifest`),
`pipeline/default.yml` (the descriptor data), `contracts/*.md` (the engine-owned contract bundles),
and the gate/dependency/run-record **policy**. Everything that *binds a mechanism to a Claude Code
primitive* is the adapter:

| Claude Code surface | Port it binds |
|---|---|
| `/craft:run` slash command + `${CLAUDE_PLUGIN_ROOT}` (in `skills/**`) | the adapter **entrypoint** — how the engine is invoked at all |
| `run/SKILL.md` "Agent spawns": Task subagent, `subagent_type: craft:<role>`, injected block prepended | **Execution** (`spawn`) |
| `run/SKILL.md` inline branch: in-thread skill body, no Task | **Execution** (`runInline`) |
| Task `model` param + `agents/*.md` frontmatter `model:` pins | **Model** (`select`) |
| PreToolUse `hooks/*` + Bash exec of the gate string | **Gate / tool-guard** |
| `worktree-setup/teardown.sh` + `gh`/git | **VCS / integration** |
| `backlog.md` `file`/`custom` + `gh`/Atlassian-MCP recipes | **Backlog SoT** |
| the runtime's Read/Grep/LSP/Serena (env), engine injects only the note | **Code-access** (env-sourced) |

The agents are already **thin** (P5): `slice-implementer.md`, `reviewer.md`, … carry only role
identity + craft; the invariant contract is assembled by `engine/bin/contract-assemble.js` from
`contracts/core.md` + the descriptor's `contract:` bundles and *prepended by the orchestrator*, so a
swap cannot drop it. This is load-bearing for P16: a second adapter reuses **the same** core,
`default.yml`, and `contracts/*` byte-for-byte; it re-binds only the six-port mechanism layer.

### What P16 closes

P16 is the *next program* after the customizable-engine re-architecture shipped (P15 → SC5 green).
Per §2.1's Scope note and PRD §15, every step that moved enforcement into the engine *shrank the
adapter*; P16 finishes the boundary (Execution, Model) and **proves portability empirically** by
re-binding the now-small mechanism layer onto a runtime — Pi — that deliberately omits craft's
Claude-native primitives. Two ports already extracted (Gate, VCS, +Backlog) demonstrate the target
shape; two remain (Execution, Model); Code-access is portable by construction (each runtime satisfies
it with its own tools).

### Pinned external surface — Pi (empirical, not from memory)

Pinned from the npm registry and the package's own `docs/` (`pi.dev`,
`github.com/earendil-works/pi`) on 2026-06-19. **Package `@earendil-works/pi-coding-agent`,
version `0.79.8` (dist-tag `latest`; `legacy-node20` = `0.74.2`), bin `pi` → `dist/cli.js`.**

**Execution surface (SDK — embed):**
```
import { AuthStorage, ModelRegistry, SessionManager, createAgentSession } from "@earendil-works/pi-coding-agent";
const authStorage   = AuthStorage.create();
const modelRegistry = ModelRegistry.create(authStorage);
const { session } = await createAgentSession({ sessionManager: SessionManager.inMemory(), authStorage, modelRegistry, /* model, customTools, resourceLoader */ });
session.subscribe(event => { /* message_update / lifecycle events */ });
await session.prompt(text);   // Promise<void>; resolves only after the full accepted run finishes (incl. retries)
```
- `session.prompt(text, opts?)` returns `Promise<void>`; streaming + lifecycle arrive via
  `session.subscribe(...)`. Multi-session: `createAgentSessionRuntime()` / `AgentSessionRuntime`
  (session new/resume/fork/import live there, not on `AgentSession`).
- **Headless CLI equivalents** (simplest binding): `pi -p "<query>"` (print-and-exit),
  `pi --mode json` (JSONL event stream), `pi --mode rpc` (JSONL-framed stdin/stdout RPC; strict
  LF-delimited — split on `\n` only).

**Tool / extension registration:**
- Custom tools: `customTools: [defineTool({ name, label, description, parameters /* typebox */, execute })]`
  on `createAgentSession`.
- Extensions: `new DefaultResourceLoader({ extensionFactories: [(pi) => { … }], additionalExtensionPaths })`,
  then `await loader.reload()`, passed as `resourceLoader`. `pi` is the `ExtensionAPI`:
  `pi.registerTool`, `pi.registerCommand`, `pi.registerProvider`, `pi.on`, `pi.setModel`,
  `pi.setActiveTools`, `pi.exec`, … Custom tools and extension-registered tools are combined.

**Gate / tool-guard surface (the pre-tool-use hook):**
- `pi.on("tool_call", async (event, ctx) => { … })` — fires **after `tool_execution_start`, before
  the tool executes; can block.** **Veto shape is exactly `return { block: true, reason?: string }`.**
  There is **no** `permission: "deny"` shape. `tool_call` handler errors **block the tool
  (fail-safe)**. Related guards: `user_bash` (intercept `!`/`!!`), `project_trust`
  (`{ trusted: "yes"|"no"|"undecided" }`), `input` (`{ action: "handled" }` to skip the agent).
- Full event set (for completeness): `before_agent_start`, `agent_start`, `turn_start/turn_end`,
  `message_start/update/end`, `tool_execution_start/update/end`, `tool_call`, `tool_result`,
  `model_select`, `before_provider_request`, `after_provider_response`, `agent_end`, `session_*`.

**Model surface:**
- `getModel(provider, id)` (from `@earendil-works/pi-ai`) or `modelRegistry.find(provider, id)` —
  neither checks for an API key. `modelRegistry.getAvailable()` returns only models with valid keys.
  Pass `model:` (and optional `scopedModels: [{ model, thinkingLevel }]`) to `createAgentSession`;
  `pi.setModel(...)` mid-session (15+ providers, mid-session switch). Fallback if `model` omitted:
  restore-from-session → settings default → first available.

**Deliberate omissions (the proof-of-portability point):** Pi ships **no built-in sub-agents** (spawn
via tmux or build an extension), **no MCP** (build CLI tools / add via extension), **no permission
gates** (build via the `tool_call` hook — Pi's own example is `examples/extensions/permission-gate.ts`).
These are exactly the three Claude-native primitives the engine must supply when Pi is the runtime.

## Requirements

When P16 ships, both deliverables are verifiable:

**Deliverable 1 — the boundary (every port named + extracted; zero Claude-run behaviour change):**

| # | Requirement | Source | Mechanism (this doc) |
|---|---|---|---|
| R-exec-port | The **Execution** port has a documented seam (`spawn(role, ctx) → result` · `runInline(ctx) → result`) an adapter implements; the core/orchestrator names the operation, never the Claude Task primitive directly | G13 §2.1 | §Execution port spec |
| R-model-port | The **Model** port has a documented seam (`select(model)` · `isAvailable(model)`); resolution order (manifest→agent-pin→fallback→session, Haiku-4.5+ class) is **core policy**, the binding is adapter | G13 §2.1; SP5 | §Model port spec |
| R-port-doc | Each remaining/already-extracted port has a `docs/adapters/<port>.md` spec mirroring the `backlog.md` house shape (interface verbs · pre/postconditions · failure=blocker) — the adapter-author's contract | §2.1; `backlog.md` | §Port spec docs |
| R-core-clean | The core **never assumes a mechanism it could name through a port**: the Claude bindings move behind the named seams; `engine/src/**` (provider-neutral) is unchanged; `default.yml` + `contracts/*` are adapter-agnostic data | G13 | §Claude adapter re-expression |
| R-sc1 | Zero behaviour change to the default Claude run: SC1 stays green — the zero-config golden walk equals today's order/agents/models/gates; CI's 634 `node --test` + bats + lints unchanged. (The Execution/Model **re-framing** is inert by construction; the **one** edit that could perturb the Claude spawn path is the DC-9 model-pin home — if the user picks DC-9(b)/(c) it is re-baselined against SC1/R8, never a silent drift) | N1 §18 SC1 | §Test strategy |
| R-select | How an adapter is **selected** is named and additive (no Claude-run change when unset) | G13 | DC-3 |

**Deliverable 2 — the Pi PoC (the gate to "done"):**

| # | Requirement | Source | Mechanism |
|---|---|---|---|
| R-pi-exec | A Pi adapter binds **Execution** via Pi's SDK/CLI (`createAgentSession`/`session.prompt` or `pi -p`/`--mode json`): a craft phase runs as a Pi run fed the engine-assembled injected block + dynamics | PRD §15; pinned surface | §Pi adapter shape |
| R-pi-gate | A Pi adapter binds **Gate/tool-guard** via Pi's extension hook (`pi.on("tool_call", …) → { block: true }`) **and** the engine-owned gate command, supplying the enforcement Pi omits | PRD §15; pinned surface | §Pi adapter shape |
| R-pi-supply | Where Pi omits a primitive the engine relies on (sub-agents, MCP, permission gates), the **engine/adapter owns that enforcement** — fan-out becomes sequential Pi runs with artifact-handoff; the gate is a wrapper, not a harness hook | PRD §15 | §Supplied-by-engine matrix |
| R-pi-scenario | **The Pi adapter runs at least one craft scenario end-to-end** — the program's literal "gate to next" — producing the same artifact shape (committed artifact = the handoff) a Claude run produces for that scenario | PRD §17 P16 gate | §Acceptance probe |
| R-pi-isolation | Pi's `tool_call`/exec surface is exercised in an **isolated workspace** (the VCS port's `isolate`); any state-mutating probe runs in a throwaway, never the worktree | SP8; safety | §Acceptance probe; §Test strategy |

## Design

### The crux: two seams to name, one runtime to prove

The boundary work is **mechanism-naming, not core rewriting**. `engine/src/**` is already
provider-neutral and stays untouched (R-core-clean). What P16 extracts is the *prose* that today
hard-references Claude primitives in `run/SKILL.md` and the agent frontmatter, behind two new port
specs. The Pi PoC then re-binds **all six** ports for one runtime — reusing the extracted Gate/VCS/
Backlog specs verbatim and the two new Execution/Model specs — and runs a scenario.

```
        ENGINE CORE (untouched, reused byte-for-byte by every adapter)
        engine/src/** · pipeline/default.yml · contracts/*.md · gate+graph+run-record POLICY
  ┌──────────────────────────────────────────────────────────────────────────────┐
  │  six named ports (mechanism seams)                                            │
  └──┬─────────┬─────────┬──────────┬───────────┬───────────┬─────────────────────┘
 Execution   Model     Gate    Code-access   Backlog       VCS
     │         │         │      (env-sourced)   │            │
  ┌──┴─────────┴─────────┴──────────────────────┴────────────┴──┐   ┌─────────────────────────┐
  │  CLAUDE adapter (= craft today; re-expressed behind seams)   │   │  PI adapter (P16 PoC)   │
  │  Task spawn · model param · hooks · gh/worktree · gh/MCP     │   │  createAgentSession /   │
  └─────────────────────────────────────────────────────────────┘   │  pi -p · tool_call hook │
                                                                     │  · scopedModels · git   │
                                                                     │  · supplied: fan-out,   │
                                                                     │    gate-wrapper, no MCP │
                                                                     └─────────────────────────┘
```

### Execution port spec (`spawn` · `runInline`)

The seam already exists conceptually in §2.1; P16 documents it as the adapter contract and moves the
Claude binding behind it. **Signatures and pre/postconditions:**

- `spawn(role, ctx) → result`
  - **role**: a registered worker identity (e.g. `craft:slice-implementer`) — the adapter maps it to
    its own worker primitive (Claude: a Task subagent typed `craft:<role>`; Pi: a fresh `pi` run).
  - **ctx**: the assembled run context — the engine-assembled **injected block** (`contract-assemble`
    output: core + bundles + retrieval note + manifest context), the working directory, the task
    dynamics (phase id, slice text, gate string, commit message, artifact paths), and the resolved
    **model** (from the Model port).
  - **pre**: `ctx.injectedBlock` is non-empty (assembled at phase entry); the working dir is an
    isolated workspace (VCS `isolate` ran). **post**: a worker ran the phase to completion under the
    injected block; **the contribution is in a committed artifact** (artifact-is-the-handoff — the
    core invariant, port-agnostic); `result` carries the worker's final message + usage block.
  - **core policy retained** (NOT in the port): when a phase runs `spawn` vs `runInline`; which §11
    invariants transform under inline; fan-out parallelism (agent-mode only — inline is sequential;
    multi-dimension harness stays `agent` even under a lean profile). A **dead worker → fresh respawn
    fed from the artifact, never a continuation** is a core invariant the port must not violate.
- `runInline(ctx) → result`
  - **role-less / in-process**: the session is both orchestrator and worker; the injected block was
    assembled with the inline carve-outs (`contract.js`: `the commit is the handoff` / `the session
    model`). **post** identical to `spawn` (committed artifact); the "final message to parent" line
    is moot.

**Claude binding (today, re-expressed):** `spawn` = the "Agent spawns" invariant block in
`run/SKILL.md` (Task, `subagent_type`, model param, injected block prepended); `runInline` = the
inline branch. P16 changes the *prose framing* — these become the Claude implementation of the named
port verbs — **not the behaviour** (R-sc1). No `engine/src` change; the descriptor `execution:
agent|inline` field already drives it.

### Model port spec (`select` · `isAvailable`)

- `select(model) → handle` — bind the run to a model tier/id. **Pre**: `model` resolved by core
  policy. **Post**: the worker runs on that model (or the adapter raised model-down → core fallback).
- `isAvailable(model) → bool` — adapter probe; lets core skip a known-down tier.
- **Core policy retained**: resolution order **manifest `models.<role>` → agent-pin → `models.fallback`
  → session** (`run/SKILL.md` "Model resolution & fallback"); degraded-tier memory for the run; the
  supported **class is Haiku-4.5-and-up** (SP5). The port exposes only *bind* + *probe*.

**Claude binding (re-expressed):** the Task `model` param + each agent's frontmatter `model:` pin
(opus: designer/planner/reviewer/requirements-writer/architecture-triager; sonnet: slice-implementer/
refactor-executor/docs-writer/validation-triager; haiku: backlog-ticker). The pin tier is a craft-class
name (`opus|sonnet|haiku`, the SP5 class), not a Claude SKU — but **it lives in `agents/*.md`
frontmatter, which is the Claude adapter, not the reused core**: `pipeline/default.yml` carries **no**
`model:` field (verified — only `role:`), and `engine/src/**` reads only the manifest's
`models.fallback`, never a per-agent pin. So a non-Claude adapter that reuses `default.yml` +
`contracts/*` does **not** automatically inherit the per-role tier. This is the one place the Execution/
Model extraction has real content beyond re-framing: the agent-pin tier of the resolution order must be
sourced from a place the adapter can read. Where it should live is **DC-9** — the recommendation keeps
the tier as adapter-neutral data the orchestrator already consumes, and the Pi adapter maps the tier to
a provider/model via `getModel`/`modelRegistry.find`/`scopedModels`.

### Port spec docs (the adapter-author contract)

Mirror the `docs/adapters/backlog.md` house shape (interface verbs · source/binding set ·
pre/postconditions · failure→blocker via the injected blocker protocol). P16 adds:

- `docs/adapters/execution.md` — `spawn`/`runInline`; the Claude binding (Task/inline) + the Pi
  binding (SDK/CLI) as the first two documented bindings; the artifact-handoff + dead-worker-respawn
  postconditions; fan-out is core policy, not a verb.
- `docs/adapters/model.md` — `select`/`isAvailable`; resolution-order + class are core; tier→provider
  mapping is the adapter's concern.
- Optionally re-home the SP8 VCS verbs and the Gate seam into `docs/adapters/vcs.md` /
  `docs/adapters/gate.md` for symmetry (DC-4) — the verbs are already pinned (SP8) and the Gate
  mechanism already extracted; this is documentation consolidation, not new extraction.

Each doc relies on the `contracts/core.md` blocker protocol (injected into every run) for
failure semantics and does not restate it — exactly as `backlog.md` does.

### Claude adapter re-expression (zero behaviour change)

The only edits to the **Claude** adapter are framing: `run/SKILL.md`'s "Agent spawns" and "Model
resolution & fallback" invariant blocks gain a one-line "(this is the Execution/Model port's
`spawn`/`select` — Claude binding)" anchor and a pointer to the new spec docs. **No** change to the
spawn structure, the model param, the agent pins, the gate cadence, or the run record. SC1's golden
walk and the 634-test CI prove the no-op (R-sc1). This is deliberately a near-textual change on the
Claude side — the *value* of P16 is the boundary being **documented and reused**, demonstrated by a
second adapter actually binding it.

### Pi adapter shape (the PoC)

The Pi adapter is **new code living outside `engine/src`** (DC-2: recommend a top-level `adapters/pi/`
tree; the engine stays core-only). It reuses the engine core unchanged: it calls
`engine/bin/pipeline-resolve.js` and `engine/bin/contract-assemble.js` to get the effective pipeline
and the per-phase injected block — **the same deterministic outputs the Claude orchestrator consumes**
— then binds the six ports onto Pi:

| Port | Pi binding (pinned surface) |
|---|---|
| **Execution** `spawn`/`runInline` | a fresh headless Pi run per phase: `createAgentSession({ sessionManager: SessionManager.inMemory(), … })` + `await session.prompt(injectedBlock + dynamics)`, **or** the simpler subprocess form `pi -p "<injectedBlock + dynamics>"` / `--mode json`. Each phase = one run; the committed artifact is the handoff between runs (no Pi sub-agents needed — see supplied matrix). `--mode json`/`subscribe` yields the usage block for the run record. |
| **Model** `select`/`isAvailable` | `model:` / `scopedModels:` on `createAgentSession` (or `pi --model …`); `getModel`/`modelRegistry.find` to resolve the tier→provider/model mapping; `modelRegistry.getAvailable()` for `isAvailable`. Core keeps the resolution order; the adapter maps craft's `opus\|sonnet\|haiku` agent-pin tier to a Pi provider+model. **The per-role tier source is DC-9** (the Claude pins live in `agents/*.md`, which the Pi adapter does not reuse). |
| **Gate / tool-guard** | an extension via `DefaultResourceLoader.extensionFactories`: `pi.on("tool_call", h)` returning `{ block: true, reason }` to enforce the mechanical guards Claude does via PreToolUse hooks (e.g. refuse a `git diff` without `--no-ext-diff`; protect paths outside the working dir). The **engine-owned gate command** (the descriptor's resolved gate string) runs as a normal subprocess gate after the phase — a *wrapper*, since Pi has no harness-hook concept. |
| **Backlog SoT** | reuse `docs/adapters/backlog.md` `file`/`custom` verbatim — a CLI subprocess, runtime-agnostic. |
| **VCS / integration** | reuse the SP8 verbs; the worktree mechanism + `gh`/git are not Claude-specific, so `worktree-setup/teardown.sh` + `gh` are called directly by the adapter. |
| **Code-access** | env-sourced — Pi's own read/grep/edit tools satisfy it; the engine injects only the derived retrieval note (already in the injected block). |

### Supplied-by-engine matrix (Pi's omissions → engine owns enforcement)

This is the §15 thesis made concrete — *because* the engine already owns enforcement (P5), Pi's
missing primitives are absorbed, not blockers:

| Pi omits | Craft relies on it for | Adapter/engine supplies |
|---|---|---|
| **sub-agents** | per-phase isolated worker + fan-out | **sequential Pi runs**, one per phase, each fed the injected block; **artifact-is-the-handoff** carries state between runs (already a core invariant). Multi-dimension review fan-out → sequential per-dimension runs (correctness preserved; parallelism is a Claude-only optimisation, not a contract). |
| **MCP** | some backlog `custom` recipes (jira) | the backlog port's **`custom` subprocess** seam — a CLI script, no MCP needed (the `file` source needs nothing). PoC scenario uses `file`/free-text to avoid the dependency. |
| **permission gates** | mechanical tool-guard (PreToolUse hooks) | the **`tool_call` extension** (`{ block: true }`) + the **gate-command wrapper** — enforcement in the engine/adapter, not the runtime. |

### Acceptance probe — "the Pi adapter runs a scenario"

Concretely (R-pi-scenario, the literal program gate): pick **one representative scenario** — the
recommendation is a **single construction-bearing phase** end-to-end (e.g. `implementation` on a tiny
free-text brief in an isolated throwaway repo), because it exercises the load-bearing ports together:
Execution (`spawn` a Pi run under the injected `construction` contract), Model (`select` a tier),
Gate (the `tool_call` guard fires + the gate-command wrapper runs + **never commit on red**), VCS
(`isolate` the workspace, `commit` the handoff). The probe **passes** on **mechanism/shape, never LLM
prose** (Pi runs a different provider/model — content will differ, and comparing model prose is
forbidden here): the assertions are structural — a RED→GREEN→commit slice landed, the gate ran and was
green before the commit, the working tree mutated only inside the isolated workspace, and a committed
artifact exists as the handoff. Recorded in a `docs/adapters/pi-poc-record.md` evidence doc
mirroring `SC5-second-instantiation-record.md` (target identity, Pi version, model, ports exercised,
per-phase outcome). DC-5 decides whether the PoC is this single phase or a fuller pipeline.

**Safety:** the entire probe runs in a `mktemp` throwaway repo (never the worktree) — Pi's `tool_call`
exec surface and any `commit`/`git` verb mutate only the throwaway, per the state-mutating-probe rule.

## Decision candidates

| # | Choice | Alternatives (≤3) | Recommendation | Why |
|---|---|---|---|---|
| DC-1 | **Scope/sequencing** of the two deliverables within this run | (a) one change: boundary-extraction + Pi-PoC together; (b) two sub-slices in this run (boundary first, then Pi PoC); (c) boundary now, Pi-PoC deferred to a follow-up program | **(b)** — boundary-extraction is a near-no-op on Claude (doc-framing) and is the *precondition* the Pi adapter consumes; landing it first gives the PoC a clean, reviewed seam to bind, and keeps the diff legible | the two have a hard dependency (PoC binds the named seams) but very different risk profiles (one inert, one runtime-integration); splitting isolates the risk |
| DC-2 | **Where adapter code lives** | (a) new top-level `adapters/<name>/` tree, `engine/` stays core-only; (b) under `engine/adapters/`; (c) a separate repo/package per adapter | **(a)** — preserves the invariant that `engine/src/**` is the provider-neutral core (every requirement and the CI test-count rest on that); a sibling `adapters/` tree makes the hexagon visible on disk | mixing adapter code into `engine/` would blur the exact boundary P16 exists to sharpen and risk the 634-test core contract |
| DC-3 | **How an adapter is selected** | (a) a manifest key (`adapter: claude\|pi`, default `claude`); (b) a separate entrypoint per adapter (`/craft:run` = Claude; a `craft-pi` bin = Pi); (c) an env var | **(b)** for the PoC — a separate Pi entrypoint keeps the Claude slash-command path byte-identical (R-sc1) and needs no manifest schema change; revisit a manifest key when a 2nd+ adapter ships | the PoC must not perturb the default Claude run; a distinct entrypoint is the smallest, most reversible selection mechanism |
| DC-4 | **How far to extract Execution/Model now** | (a) document-the-seam-only (spec docs + prose anchors, no `engine/src` change); (b) also lift a thin executable shim into `engine/src` (e.g. a port-interface module the orchestrator calls); (c) full inversion (orchestrator calls an adapter object) | **(a)** — the realised hexagon is *policy text + data + portable Node core* (ADR-002), not a class graph; the seam is a documented discipline, and the Pi adapter is the empirical proof it holds — a `src` shim with one consumer would be speculative generality (YAGNI) | matches the established "how the hexagon is realised" design (§2.1) and the two already-extracted ports (Gate/VCS are scripts+specs, not `src` interfaces) |
| DC-5 | **Pi integration depth for the PoC** | (a) a single representative phase (construction-bearing) end-to-end; (b) a short multi-phase slice (design→implementation); (c) the full default pipeline | **(a)** — it is exactly the program's gate ("runs *a* scenario"), exercises the load-bearing ports together, and is achievable without Pi sub-agents; (b)/(c) multiply runtime-integration surface for no extra proof of *portability* | the gate is existence-of-portability, not feature-parity; (c) would also force the sequential-fan-out story for review before it is needed |
| DC-6 | **Pi as a CI dependency** | (a) on-demand smoke only (like the SC5 / model-class matrix smokes — record in an evidence doc, not CI-gated); (b) a hard CI job that installs Pi and runs the scenario; (c) a recorded transcript fixture asserted in CI, live run on-demand | **(a)** — consistent with every other runtime-fidelity proof in this repo (`run/SKILL.md` lists SC5, model-class, registered-phase as *not CI-gated*); a live external-provider run in CI is flaky and key-dependent | the engine path is CI-proven by fixtures; the Pi run adds *runtime* fidelity, which the repo deliberately keeps out of CI to avoid coupling to external installs/keys |
| DC-7 | **Pi execution binding form** | (a) headless CLI subprocess (`pi -p` / `--mode json`); (b) SDK embed (`createAgentSession`/`session.prompt`); (c) RPC mode (`--mode rpc`) | **(a)** for the PoC — a subprocess is the smallest, most language-agnostic binding (mirrors the backlog `custom` seam), needs no Node-in-Node embedding, and the `--mode json` event stream yields the usage block; keep (b) as the documented richer binding | the PoC proves portability; a subprocess keeps the adapter thin and the failure modes obvious (exit code = blocker), matching the repo's existing subprocess-gate idioms |
| DC-8 | **VCS spec consolidation** | (a) write `docs/adapters/execution.md` + `model.md` only, leave SP8/Gate where they are; (b) also add `vcs.md` + `gate.md` for a complete `docs/adapters/` set | **(b)** — a complete adapter-spec directory is the adapter-author's contract surface and the Pi PoC reuses all four; the VCS verbs are already pinned (SP8) so `vcs.md` is transcription, not new design | a half-documented port set forces the next adapter author back into prose archaeology; symmetry is cheap here |
| DC-9 | **Per-role model-tier source** (the Claude pins live in `agents/*.md`, which a non-Claude adapter does not reuse) | (a) leave the tier in `agents/*.md` frontmatter, document it as the Claude binding; each adapter ships its own role→tier table; (b) lift the tier into `pipeline/default.yml` as an adapter-neutral `model:` descriptor field the resolver passes through; (c) a standalone `pipeline/model-pins.yml` data file both adapters read | **(b)** — the tier is craft-class data (SP5 `opus\|sonnet\|haiku`), not Claude-specific; putting it in the descriptor makes it part of the reused core so every adapter inherits the resolution order's agent-pin tier from one source, and the orchestrator already resolves it at spawn | (a) duplicates the canonical tier per adapter (drift risk); (c) adds a file for one field; (b) folds it into the data the resolver already walks. **Caveat: moving the pin out of `agents/*.md` is an observable change to the Claude spawn path** (the param now comes from the descriptor, not the agent def) — must be re-baselined against SC1/R8, so it is a real decision, not a no-op |

## Test strategy

**The boundary (no-regression is the proof it changed nothing on Claude):**
- **SC1 golden walk** — the zero-config resolution (`pipeline-resolve.js pipeline/default.yml`) and
  the contract-assembly output are byte-identical to pre-P16; the Execution/Model re-framing touches
  only `run/SKILL.md` prose, so the assembled injected block per phase is unchanged. Asserted by the
  existing scenario goldens + `engine/test/contract-equivalence.test.js`.
- **Full CI unchanged** — `scripts/ci.sh`: 634 `node --test` (the test-count drift guard catches any
  accidental `engine/src` change), `bats test/`, `shellcheck`, `pipeline-lint`, `pipeline-resolve`,
  `contracts-lint`. R-core-clean means *zero* of these change; a delta is a design breach.
- **Port-conformance surface** — a documented **conformance checklist** an adapter must satisfy
  (derived from the port specs): `spawn`/`runInline` leave a committed artifact; a dead worker
  respawns from the artifact; `select` honours the resolution order + class floor; the gate never
  commits on red; `isolate`→`commit`→`teardown` ordering. The Claude adapter passes it by SC1; the Pi
  adapter passes it by the acceptance probe. (A machine-checkable conformance harness is out of scope
  — DC-6 keeps runtime proofs as on-demand smokes; the checklist is the spec.)

**The Pi PoC (existence-of-portability, recorded not CI-gated — DC-6):**
- **Acceptance probe** — the single-phase scenario (DC-5) run via the Pi adapter in a `mktemp`
  throwaway repo, asserting the committed-artifact shape matches the Claude run's for that phase
  (RED→GREEN→commit, gate-green-before-commit). Evidence in `docs/adapters/pi-poc-record.md` (Pi
  version `0.79.8`, model, ports exercised, per-phase outcome) — the same evidence-doc pattern as
  `SC5-second-instantiation-record.md` and ADR-080.
- **Gate-guard unit check** — the `tool_call` extension's block logic is a pure predicate (e.g.
  "`git diff` lacking `--no-ext-diff` → `{ block: true }`"), unit-testable in isolation without a
  live Pi session — the one deterministically-testable seam of the adapter.
- **No new property-test lens** — P16 adds no parser/matcher/round-trip pair; the engine's existing
  resolve/assemble property surfaces already cover the reused core.

## Out of scope

- **Additional adapters beyond Pi** — OpenCode, litellm, Claude Agent SDK (PRD §15 candidates) are
  out; P16's gate is *one* non-Claude adapter (Pi). The documented port specs admit them.
- **Full provider matrix / feature parity** — the PoC proves portability exists, not that every craft
  phase runs identically on Pi; multi-phase/full-pipeline Pi runs are deferred (DC-5).
- **A machine-checkable port-conformance harness in CI** — the conformance *checklist* is specified;
  building an automated cross-adapter conformance runner is future work (DC-6 keeps runtime proofs
  on-demand).
- **`engine/src` refactor into adapter interfaces** — DC-4 recommends documented-seam-only; an
  executable port-interface module in the core is explicitly not built (one consumer = YAGNI).
- **Sequential-fan-out optimisation for Pi review** — the PoC scenario (DC-5 construction phase) does
  not require multi-dimension fan-out; re-expressing review fan-out as sequential Pi runs is deferred
  until a Pi review scenario is in scope.
- **Pi as a hard runtime/CI dependency** — DC-6 keeps the Pi run an on-demand smoke; wiring Pi into
  CI (keys, flakiness) is not done.
- **Changes to the already-resolved ports' behaviour** — Gate/VCS/Backlog/Code-access are reused as-is;
  P16 only *documents* them into the `docs/adapters/` set (DC-8), never re-decides their semantics.
