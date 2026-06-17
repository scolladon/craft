# Design — Forge customizable engine: hexagonal core, phase descriptors, engine-owned contract

> Brief: turn forge's hardcoded 11-phase orchestrator into a hexagonal domain core that
> walks a *declarative phase descriptor list* behind six explicit ports, with the invariant
> contract injected by the engine (not baked into agent defs) — preserving zero-config
> behaviour exactly. Scope: the P3–P5 core cluster + schemas (PRD §17). Design only.
> Status: draft → self-reviewed ×3 → **accepted** (ADR pass 2026-06-15 → `docs/adr/001–008`)

## Context

### What exists today (the as-is)

forge is a Claude Code plugin: a thin orchestrator skill (`skills/run/SKILL.md`) drives a
**hardcoded 1→11 phase sequence** (`branch → design → adr → plan → implement → review →
refactor → mutation → docs → pr → merge`). Three layers (`docs/DESIGN.md`):

- **Orchestrator** (`run/SKILL.md`) — resolves input, holds the cross-phase invariants
  (mutation triage gates the PR; scope-expansion re-enters review; artifact-is-the-handoff;
  gate cadence; model resolution + fallback; blocker protocol; the run record). The phase
  sequence is a fixed markdown table; "this order is not declinable."
- **Phase skills** (`skills/<phase>/SKILL.md`) — each split **Preamble (always runs,
  non-overridable)** + **Procedure (default body, a manifest `override:` replaces it)**.
  Loaded just-in-time; independently invocable standalone.
- **Role agents** (`agents/<role>.md`) — each carries its **own full contract** in its body
  (TDD steps, blocker protocol, artifact-is-the-handoff, no-suppression, read-only, etc.).
  Model pinned in frontmatter; the invocation passes only dynamics.

Declination rides a committed `.claude/workflow.md` manifest (YAML frontmatter + prose),
validated by `scripts/manifest-lint.sh` (a deliberate YAML-subset parser). Mechanical guards
are PreToolUse hooks (`block-no-verify.sh`, `git-no-ext-diff.sh`). Lifecycle scripts
(`worktree-setup.sh`, `worktree-teardown.sh`) isolate the work. `plan-lint.sh` gates the plan
schema. No automated tests exist — the mechanical layer that *is* the guarantee is unverified
(PRD §3, two historical `manifest-lint` comma regressions).

### What constrains this design (settled inputs — do not re-decide)

- **PRD-customizable-engine.md** (converged): hexagonal model (§2.1), goals G1–G14, injection
  catalog (§7), phase model + dependency graph + `self_supply` (§6), invariant core (§11),
  NFRs (§12), program P0–P16 (§17), success criteria (§18).
- **SPIKE.md** (8 resolved spikes, treated as facts): SP1 inline = the session runs the phase
  body, contract/gate/hooks identical, commit-is-the-handoff, *sequential* (multi-dimension
  harness stays `agent`); SP2 cross-plugin dispatch GREEN on native `dependencies` +
  namespacing; SP3 `$ARGUMENTS` carries forge args verbatim in `-p`; SP4 full-SDLC vocabulary
  + `mutation→validation` + harness family; SP5 supported model class = **Haiku-4.5 and up**,
  fallback proven contract-safe, *output shape varies by model* (R10); SP6 backlog port
  `resolve`/`complete`; SP7 retrieval derivation (plugin content already strategy-free,
  precedence project>env>user>native); SP8 VCS port verbs pinned from the lifecycle scripts.
- Resolved ADRs (PRD): hexagonal architecture; full-SDLC vocabulary with old names as aliases;
  mutation→validation; extension rides native plugin `dependencies`+namespacing; supported
  class Haiku-4.5+; retrieval is environment-derived, never in plugin content.
- **N3 (with the §15 portability carve-out — ADR-002)**: the engine medium stays Bash +
  skill/agent markdown, **except the deterministic engine core, which is a portable Node.js
  module** (parse/resolve/validate/assemble) the orchestrator invokes. The hexagon is realised
  as *LLM policy text + data + a portable Node core*, not a class graph (see §"How the hexagon
  is realised" below). This is load-bearing for the whole design.

### Scope of this doc

In scope (PRD P3–P5 + schemas): the hexagonal **core + 6 ports + the Claude Code adapter
boundary**; the **phase descriptor schema** + dependency graph + `self_supply` + skip/insert/
reorder semantics; the **manifest schema extensions** + back-compat alias resolution;
**engine-owned contract injection** (where the contract lives, how it assembles into agent
*and* inline runs, R10); the **orchestrator pipeline walk**; the **as-is → to-be mapping**
(incl. where the P4 rename lands, how SC1 holds, the P1 testability seams).

Out of scope (referenced at interface level only): P8 harness-config *internals*, P10 new-phase
*agents*, P11 backlog *adapter implementations*, P14 derived-plugin extension *specifics*, P16
*provider adapter*, and the P1 test-harness *implementation itself*. See §Out of scope.

## Requirements

What must be true when the P3–P5 core ships (verifiable; each maps to a design mechanism):

| # | Requirement | PRD | Mechanism (this doc) |
|---|---|---|---|
| R-core | The pipeline walk, dependency graph, invariant guiderail, contract injection, gate/model policy, and run record are provider-neutral domain logic, separated from mechanism by 6 named ports | G13 §2.1 | §Hexagonal core & ports |
| R-desc | A phase is a **declarative descriptor**; the default list reproduces today's order/agents/models/`execution: agent` exactly | G1,G9 §6.1,§16 | §Phase descriptor schema |
| R-graph | Skip is allowed iff no downstream consumer is stranded (`self_supply` resolution); a stranding skip or a producer-after-consumer reorder is refused/flagged | G1 §6.2,§6.3 | §Dependency graph & editing |
| R-vocab | Phases are concern-named; old names resolve as aliases; the rename has a defined home | G3 §6.4 | §Manifest & alias resolution; §As-is→to-be |
| R-exec | `execution: inline\|agent` is honoured per phase; `inline` keeps contract+gate, transforms the two carve-out invariants, stays sequential | G4 §10,§11 | §Pipeline walk; Execution port |
| R-contract | The invariant contract is **engine-owned**: assembled and injected into every run (spawn *and* inline) by the same path as `context:`/retrieval; an agent swap cannot drop it | G5 §11 | §Engine-owned contract injection |
| R-shape | Structured-output handling does not assume one layout (model-varying shape) | G12 §12 / R10 §19 | §Contract bundles & output shape |
| R-model | Model resolves manifest→agent-pin→fallback→session, with degraded-tier memory; the class is Haiku-4.5+ | G12 §11 | §Pipeline walk; Model port |
| R-retrieval | Retrieval strategy is derived (project>env>user>native) and injected; **zero** retrieval strings in plugin content | G14 §10.1 | §Code-access port; Contract assembly |
| R-backlog | Backlog id-resolution + closing tick go through a `resolve`/`complete` port; unreachable source = blocker | G7 §9 | §Backlog port (interface) |
| R-vcs | Workspace isolation, commit, propose, integrate, teardown go through VCS verbs; ordering/lock policy is core | G13 §2.1 | §VCS port (interface) |
| R-test | The deterministic engine functions are extractable and unit-testable; zero-config runs are characterizable | G11 §13 | §Test strategy |
| R-compat | Existing manifests lint and run unchanged; new keys additive; default-run behaviour identical (SC1) | N1 §16 | §As-is→to-be; §Test strategy |

## Design

### How the hexagon is realised in a Bash + markdown engine (the linchpin)

There is no compiled core (N3). So we name the three hexagonal roles onto concrete forge
artifacts and hold the boundary as a **design discipline**, not a type system:

- **Domain core** = the orchestrator skill's *policy text* (the pipeline walk + the §11
  invariants, generalised away from hardcoded phase names) **+** the engine-owned **contract
  fragments** (data, ADR-003) **+** the **default descriptor list** (`pipeline/default.yml`,
  ADR-001) **+** a **portable Node core module** (ADR-002: parse, alias-resolve, expand profile,
  apply edits, validate the graph, assemble the injected block). The core knows *what* must
  happen, never *how* a runtime carries it out.
- **Ports** = the named, thin operation-sets the orchestrator is *allowed* to use to reach a
  mechanism. A port is a contract: operation signature + pre/postconditions. The core keeps
  the *policy*; the port exposes only *mechanism*.
- **Adapter** = the binding of those operations to concrete Claude Code primitives (Task,
  Bash, PreToolUse hooks, `gh`/git CLI, the per-invocation model param, the Skill tool). Today
  **forge *is* the Claude Code adapter.** A second adapter (P16, e.g. Pi) re-binds the same
  operations — out of scope here; we only fix the boundary so it *can*.

The payoff is twofold and concrete: (1) **testability** — the deterministic operations
(parse/resolve/validate/assemble) live in the portable Node core module (ADR-002) that P1
unit-tests without an LLM; the LLM orchestrator merely *consumes* their outputs; (2)
**portability** — that Node core is itself runtime-portable, and every invariant pushed from an
agent def or an inline git command into the core *shrinks the adapter* (PRD §15).

```
                 ┌──────────────────────── Domain core (provider-neutral) ─────────────────────────┐
                 │  pipeline walk · phase model + dependency graph + self_supply · §11 guiderail     │
   user input ──▶│  contract injection · gate discipline (policy) · model resolution (policy)        │──▶ run record
                 │  harness config (policy) · run record · alias map · default descriptor list        │
                 └───┬───────────┬───────────┬──────────────┬───────────────┬───────────────┬────────┘
        Execution ◀──┘   Model ◀─┘   Gate ◀──┘  Code-access ◀┘   Backlog ◀───┘    VCS ◀───────┘   (6 ports = mechanism)
            │            │            │            │  (env-sourced,        │               │
            ▼            ▼            ▼            ▼   NOT adapter)         ▼               ▼
        Task /        model        Bash gate    runtime+settings        file / gh /     git worktree
        in-thread     param        + hooks      (LSP/RAG/RTK/Serena      jira / linear   + gh CLI
        (Claude Code adapter)                    /native Read+Grep)      / custom        (Claude Code adapter)
```

### Hexagonal core & the six ports

Each port states the **mechanism** it exposes and the **policy the core retains** (PRD §2.1).
In the Claude Code adapter every adapter-owned port binds to the primitive named in the
diagram. Code-access is the deliberate exception: env-sourced, satisfied by the runtime +
project/user settings, never by the adapter (G14).

| Port | Mechanism (operations) | Policy kept in core | Adapter binding (Claude Code) | Spec |
|---|---|---|---|---|
| **Execution** | `spawn(role, ctx) → result` · `runInline(ctx) → result` | when a phase runs inline vs agent; which §11 invariants *transform* under inline; assembling `ctx` (contract + retrieval + context + dynamics); fan-out parallelism (agent only — inline is sequential) | Task subagent (namespaced `subagent_type`, model param) / in-thread skill body | §10·SP1 |
| **Code-access / retrieval** *(env-sourced)* | `read(path\|symbol)` · `navigate(...)` | precedence project>env>user>native; the injection path (same as `context:`) | the **runtime's own** read/navigate tools satisfy the operations; forge *derives + injects the strategy note* but **never binds the operations itself** | §10.1·SP7·G14 |
| **Model** | `select(model)` · `isAvailable(model)` | resolution order manifest→agent-pin→fallback→session; degraded-tier memory for the run; class = Haiku-4.5+ | per-invocation `model` param (SP1 spike c) | SP5·G12 |
| **Gate / tool-guard** | `run(cmd) → pass\|fail` · mechanical guards | gate cadence (targeted per fix, phase gate once/round); never commit on red; a gate must exist for code-producing phases; placeholder resolution | Bash exec of the gate command + PreToolUse hooks | §11 (SP b′) |
| **Backlog SoT** | `resolve(id) → {title, brief}` · `complete(id, refs[])` | which id-form is a backlog id; *when* the tick fires (delivery, after the PR exists); unreachable = blocker | file md / `gh` / Atlassian MCP / custom script | §9·SP6·G7 |
| **VCS / integration** | `isolate` · `commit` · `diff` · `defaultBranch` · `propose` · `integrate` · `teardown` | ordering (validation/architecture triage gates `propose`; `integrate` only after CI-green + user-confirm; `teardown` after integrate, lock-aware); cadence | git worktree + `gh`/git CLI (the lifecycle scripts) | SP8·G13 |

**Scope note.** P3–P5 establishes these as the design boundary and *names the seam*. It does
**not** fully extract every mechanism into a swappable implementation — that is the P16
adapter work. Two ports are already cleanly extracted (Gate = hooks + manifest gate commands;
VCS = the lifecycle scripts); the others remain bound inline in the Claude adapter's
orchestrator/agent text for now, which is allowed — the Claude adapter *is* forge today. The
design contract is: the core never *assumes* a mechanism it could instead *name through a
port*.

### Phase descriptor schema

A phase is a declarative descriptor (PRD §6.1). The default pipeline is an ordered list of
these, shipped as **engine data** in the plugin; the manifest *edits* the list (skip/insert/
reorder/field-override) to produce the **effective pipeline**. Fields, types, defaults:

| Field | Type | Required | Default | Meaning |
|---|---|---|---|---|
| `id` | string (concern name) | yes | — | the engineering concern (e.g. `validation`); unique in the list |
| `archetype` | enum `setup\|specification\|construction\|harness\|refinement\|delivery` | yes | — | groups phases; selects the default contract bundle, classifies code-producing phases, drives walk treatment |
| `enabled` | bool | no | `true` | a shipped descriptor with `enabled: false` is **default-off** — the walk treats it as a default-skip (recorded, never a strand); a manifest turns it on with `phases.<id>: { enabled: true }`. This is the G2 optional-`requirements` / opt-in-`architecture` mechanism |
| `contract` | string (bundle name; may be a list — DC-6) | yes | by archetype | which engine-owned contract bundle layers on the always-on universal core |
| `procedure` | string (skill ref, e.g. `forge:validation`) | yes | — | default body; a manifest `override:` replaces it (the preamble still runs) |
| `role` | string (agent ref) | no | — | default agent; **omit for a gate-only harness** with no AI triage; the engine injects the contract around *any* role |
| `execution` | enum `agent\|inline` | no | `agent` | delegated subagent vs in-thread session body (SP1); profiles set it en masse |
| `model` | string (model tier/id) | no | `role`'s frontmatter pin | default model; overridden by manifest `models.<role>`; resolved via the Model port |
| `gate` | string (command, placeholders allowed) | conditional | manifest `gate` → capability probe | the phase's own gate; **required for code-producing phases** (`change ∈ produces`; invariant); the resolver refuses such a descriptor when neither manifest nor probe yields one; the engine runs it before the phase closes |
| `harness` | map (`tool`, `scope`, `dimensions`, `passes`, `max_cycles`, `convergence`, …) | no | strong defaults | per-phase harness knobs (G6); only meaningful for `harness` archetype; *internals are P8* |
| `consumes` | list of artifact names | no | `[]` | dependency edges in — what this phase reads as hard input |
| `produces` | list of artifact names | no | `[]` | dependency edges out — what a skip of this phase would strand |
| `self_supply` | list ⊆ `consumes` | no | `[]` | consumed artifacts this phase can reconstruct itself if its producer is skipped |

The **complete** default list (11 enabled + 2 default-off = 13 descriptors). It encodes
today's pipeline exactly, so the zero-config walk is behaviour-identical (SC1); concern-named
per SP4 (old name in parentheses). Artifact names below are the design's canonical vocabulary
(superseding the looser `consumes: [implementation]` of PRD §6.1's single illustrative block):

| `id` (alias) | archetype | enabled | `role` | `consumes` | `self_supply` | `produces` | gate / harness |
|---|---|---|---|---|---|---|---|
| `workspace` (branch) | setup | yes | — | — | — | `workspace` | — |
| `requirements` (prd) | specification | **no** | `forge:requirements-writer`¹ | `workspace` | — | `requirements` | — |
| `design` | specification | yes | `forge:designer` | `workspace, requirements` | `requirements` | `design` | — |
| `decisions` (adr) | specification | yes | — *(session-owned)* | `design` | `design` | `decisions` | — |
| `planning` (plan) | specification | yes | `forge:planner` | `design, decisions` | `design, decisions` | `plan` | `plan-lint` |
| `implementation` (implement) | construction | yes | `forge:slice-implementer` | `workspace, plan` | — | `change` | `<gates.phase>` |
| `review` | harness | yes | `forge:reviewer` | `change` | — | `review-report` | `<gates.phase>` per round |
| `refactoring` (refactor) | refinement | yes | `forge:refactor-executor` | `change` | — | `change` | `<gates.phase>` |
| `validation` (mutation) | harness | yes | `forge:validation-triager` | `change` | — | `validation-report` | `<validation gate>` · `harness: {tool: stryker, scope: per-hunk}` |
| `architecture` | harness | **no** | `forge:architecture-triager`¹ | `change` | — | `architecture-report` | `<arch gate>` · `harness: {tool: dependency-cruiser}` |
| `documentation` (docs) | delivery | yes | `forge:docs-writer` (+ `forge:backlog-ticker`) | `design, change` | — | `docs` | — |
| `propose` (pr) | delivery | yes | — *(session-owned)* | `change` | — | `pr` | `pr.pre-pr-gate` |
| `integrate` (merge) | delivery | yes | — *(session-owned)* | `pr` | — | — | — |

¹ default-off; its *agent* is P10 (the descriptor reserves the `role`, the agent body is built later).

*Notes.* `gate` carries today's placeholder vocabulary (`<touched-files>`, `<touched-tests>`,
`<gates.phase>`); the empty-set rule (a placeholder resolving empty drops its command) carries
over unchanged. **A "code-producing" phase** — for the §11 "a gate must exist" invariant — is
any phase with `change ∈ produces` (here: `implementation`, `refactoring` — *not* the
harnesses `review`/`validation`, which produce `*-report`, not `change`); the resolver refuses
such a descriptor with no resolvable gate (manifest `gate` → capability probe → refuse). `harness` shape is reproduced from §8; its *resolution internals*
are P8 (out of scope).

**Two distinct, deliberately separate mechanisms** (the source of two earlier ambiguities):

- The **dependency graph** (`consumes`/`produces`/`self_supply`) models **artifact stranding
  only** — what a *skip* would break. `propose` therefore does **not** `consume` the harness
  reports, so skipping a harness never *strands* `propose`.
- "**An executing-harness triage gates `propose`**" is a separate **core ordering invariant**
  (SP8 / §11), not a `consumes` edge. A harness-exec phase that is **disabled, default-skipped,
  or flag-skipped releases its own `propose`-gate by recorded waiver** (you cannot gate on a
  phase you chose not to run — exactly today's "no mutation config → no-op with note"). The
  **non-waivable floor** is the code-producing gate above, never any individual harness
  (decided — ADR-005).

**Descriptor storage form** and **resolution home** are decision candidates (DC-1, DC-2): the
recommendation is a YAML data file (`pipeline/default.yml`, same parser family as the manifest)
walked by the orchestrator and validated by a dedicated resolver/lint script.

### Dependency graph, `self_supply`, and editing semantics

The descriptor list is a DAG: nodes = phases by `id`, edges = each `consumes` artifact pointing
back to the **nearest enabled producer earlier in the effective order**. An artifact may have
several producers — `change` is produced by `implementation` and *refined* by `refactoring` —
so a refinement never strands an earlier consumer (`review` resolves `change` to
`implementation`, not the later `refactoring`) and the graph stays acyclic. The graph
**computes** what "protected" used to enumerate statically (PRD §6.2):

- **Skip(X)** is allowed **iff** for every artifact `a ∈ X.produces`, every downstream consumer
  `C` of `a` has `a ∈ C.self_supply`. Otherwise the skip **strands** a consumer → the engine
  **refuses** (a hard strand) or **loudly flags** it in the run record (a waived guarantee).
  Example: `Skip(decisions)` is safe — its only consumer, `planning`, lists `decisions` in
  `self_supply`. `Skip(design)` is **refused** — `design` has *three* consumers (`decisions`,
  `planning`, `documentation`); the first two self-supply it, but `documentation`
  (`consumes: [design, change]`, `self_supply: []`) does not, so the skip strands it.
  `Skip(planning)` strands `implementation` (no `self_supply: [plan]`) → refused.
  `Skip(workspace)` strands `implementation` → refused. A **default-off** descriptor
  (`enabled: false`) is a *recorded default-skip*, not a strand — its `self_supply`-bearing
  consumers (e.g. `design.self_supply: [requirements]`) absorb its absence by construction.
- **Insert** places a descriptor with `after:`/`before:`; the new phase gets full engine
  treatment (contract, gate, model, run-record). Its `consumes`/`produces`/`self_supply` join
  the graph; the same validation runs.
- **Reorder** is validated against the edges — a consumer placed before its producer is
  rejected by the *same machinery* as a stranding skip.

This dissolves the static `PROTECTED="branch plan implement review refactor mutation"` list in
`manifest-lint`. Workspace and planning stay *effectively* protected (they strand). **Decided
(ADR-005):** the graph fully replaces the static list — a skip is refused **only** when it
strands. The harness and refinement phases (`review`, `refactoring`, `validation`) become
**skippable-but-flagged**: their `produces` are reports/refinements nothing consumes as a hard
input, so a skip doesn't strand — it waives a guarantee, recorded for accountability, and a
skipped/disabled executing-harness **waiver-releases its `propose`-gate** (above). The single
non-waivable floor is "a gate must exist for code-producing phases" — never any individual
harness. Arbitrary reorder stays deferred (insert+skip first, per OQ1).

> SC1 is unaffected: the default pipeline has no edits, so the graph is walked in default order
> with default agents — behaviour identical. Only the *customization surface* widens.

### Manifest schema extensions & back-compat alias resolution

Today's top keys: `backlog paths context gates phases pr scripts models`. Additions:

| Key / field | Level | Holds | §/Tier |
|---|---|---|---|
| `pipeline:` | top-level | `profile:` · `skip: [...]` · `insert: [...]` *(· `reorder: [...]` — deferred, pending DC-5)* | §7 #1,5,11; §10 |
| `retrieval:` | top-level | a context-file pointer **or** a named strategy forge maps to a stock note | §10.1·SP7 |
| `execution:` | **top-level default** *and* phase field (`phases.<id>.execution`) | `inline\|agent`; precedence per-phase field > profile > top-level default (ADR-008) | §7 #4 |
| `role:` | phase field (`phases.<id>.role`) | agent/skill swap (`my:domain-planner`) — contract still injected | §7 #10 |
| `harness:` | phase field (`phases.<id>.harness`) | per-phase harness knobs (dimensions/passes/cycles/convergence/tool) | §8 |
| `models:` | top-level *(exists)* | per-agent override + `fallback:` | §7 #2 |

So the new *top-level* keys are `pipeline:`, `retrieval:`, and a global `execution:` default
(ADR-008); `role`/`harness` are new *phase fields* and `execution:` is **both**. `profile:`
(`solo`, `full`, `lean` — ADR-021) is a named bundle the resolver expands into a per-archetype
`execution` map; the resolver then applies the precedence **per-phase field > profile >
top-level `execution:` default** before validating. Profiles are **pure sugar** over that
precedence — `profile: lean` ≡ top-level `execution: inline` with
`phases.{implementation,refactoring}.execution: agent` (the `harness` archetype stays `agent`
regardless — the parallelism caveat binds at every level). All additive — an existing manifest
with none of these is unchanged (N1). **Per-invocation:** `/forge:run` also accepts
`--profile`/`--skip` flags in `$ARGUMENTS`; the `pipeline-resolve` bin folds them over the
manifest at highest precedence (CLI > manifest), so a one-off `--profile lean` needs no manifest
edit (ADR-022).

**Alias resolution.** SP4 phase ids are concern-named; old names ship as aliases
(`branch→workspace, prd→requirements, adr→decisions, plan→planning, implement→implementation,
mutation→validation, refactor→refactoring, docs→documentation, pr→propose, merge→integrate`).
Resolution is a single old→new **alias map (data)** consulted by *both* `manifest-lint` (so a
manifest naming `mutation:` validates) *and* the orchestrator walk (so it maps to the
`validation` descriptor) — one source of truth keeps lint and walk in agreement (**DC-4**). The
map lands when the rename executes (P4); the alias fixture is added to the lint suite then
(PRD §13).

`manifest-lint` stays **shape** validation (known keys, inline-map sub-keys, dangling file
refs) and is extended for the new keys; the **semantic** validation (alias-resolve, expand
profile, apply edits, check the graph doesn't strand) moves to the pipeline resolver — keeping
`manifest-lint` single-responsibility and both layers independently testable (**DC-2**).

### Engine-owned contract injection (the P5 crux)

Today each agent def carries its full contract; the §11 invariants are scattered across agent
bodies, the orchestrator, and `DESIGN.md` prose. P5 relocates the **invariant** portion into an
**engine-owned contract store** that the orchestrator assembles and injects into *every* run —
agent spawn or inline alike. Agents become **thin**: role identity + role-specific craft only.
Swapping an agent (G5) cannot drop the contract because the *orchestrator* assembles it (exactly
the existing context-assembly rule that lives in the orchestrator "precisely so an override can
never drop it" — `run/SKILL.md`).

**Decomposition into composable bundles.** A small always-on core, plus archetype/role bundles
named by the descriptor's `contract:` field:

| Bundle | Applies to | Content (relocated from today's agent defs / §11) |
|---|---|---|
| **U — universal core** | every phase, every mode | never commit on red gate; never `--no-verify`; artifact-is-the-handoff; blocker protocol `{ unit, reason, ≤3 options }` — never spin/guess; no provenance refs (phase/ADR/backlog) in source or test; no suppression directives; bounded scope; work only in the given working directory |
| **producer** | specification/construction artifact producers (design, requirements, planning) | fill the named template/schema; **Decision-candidates / pre-chewed-context** mandate; self-review to convergence (≤3); state-mutating probes run in a `mktemp` throwaway, never the worktree (generalised from the designer carve-out) |
| **construction** | implementation slices | RED→GREEN→REFACTOR strictly; gate-before-commit; one atomic commit; G/W/T·AAA·`sut` test conventions absent a context override |
| **harness-read** | `review` | read-only; structured findings `{file:line, severity, finding, fix}`; zero findings legitimate; fix-delta rounds verify prior + review the fix diff |
| **harness-exec** | `validation`, `architecture`, security/perf… | a tool runs, the AI triages survivors/violations (kill or prove-equivalent / fix or justify); never weaken a test; gate-green before commit |
| **delivery** | documentation, backlog, propose, integrate | content traceable to committed artifacts/shipped surface; touch only listed targets; the session owns synthesis records |

`contract:` names the bundle layered atop U (U is implicit). It may be a list for composition
(**DC-6**). The **two inline carve-outs** (§11) live in U as conditioned text the assembler
emits the inline variant of when `execution: inline`: *artifact-is-the-handoff* → "the commit is
the handoff (no agent context to lose)"; *model-resolution+fallback* → "the session model"
(SP1). Every other U line binds verbatim inline.

**Assembly path (identical for spawn and inline).** At phase entry the orchestrator builds an
injected block by concatenating, in order:

```
[U core contract]
[contract bundle(s) named by descriptor.contract]   (+ inline variants if execution: inline)
[derived retrieval-strategy note]                    (project > env > user > native — §10.1)
[manifest global context: files, verbatim]
[manifest per-phase context: file(s), verbatim]
[dynamics: working dir, output paths, diff range, slice block, gate command, commit message]
```

- **agent**: the block is prepended to the Task spawn prompt (the agent def supplies only role
  craft).
- **inline**: the same block is loaded into the session at phase entry; the session follows it
  itself (SP1 "the session loads the same engine contract block"). When the descriptor carries a
  `role:` resolving to a local `agents/<name>.md`, the agent body is **also** loaded (sans
  frontmatter) right after the block — the same two artifacts a spawn carries, in the same order,
  so inline fidelity = agent fidelity modulo the two carve-out lines (ADR-020). A `role:` with no
  local def runs on the block alone.

This is the *same assembly path* the PRD mandates for `context:`/retrieval — one home, one rule,
swap-safe, and **deterministic enough to unit-test** (P1: assert U always present; assert
context files appended; assert the inline variant swaps exactly the two carve-out lines).

**Output shape (R10) — principle in core, parser deferred.** SP5 showed structured output
*shape* varies by model (Haiku emitted review findings as JSON, not one-per-line). The **core
principle** (this design): every structured-output bundle (harness-read findings; U blocker
protocol; producer plan-slice headings) **pins a canonical field set**, and any consumer **keys
on the fields** (`severity`, `file:line`, `reason`, `### Context`) **never on the layout** —
tolerating a JSON array or a per-line list interchangeably; where a *script* parses (plan-lint),
the schema stays **structural** (required headings), the most shape-robust form. The concrete
**normaliser is a named deterministic seam** (`findings-normalize`: raw role output → the
canonical field set) that P1 fixture-tests across both shapes; its *implementation* lands with
the consumers it serves (review at P5-relocation, per-harness specifics at P8). This doc fixes
the *contract* (pinned fields + shape-agnostic consumption) and the *seam*, not the parser body.

### Orchestrator pipeline walk

The to-be `run/SKILL.md` walk, generalised away from hardcoded phase names:

1. **Resolve.** Run `manifest-lint` (shape); read the manifest. Load the default descriptor
   list; **alias-resolve**; **expand `profile:`**; **apply `pipeline:` edits** (skip + insert +
   explicit phase fields; reorder once DC-5 admits it); **validate the effective graph** (acyclic;
   every `consumes` has a `produces`; `self_supply ⊆ consumes`; no skip strands a
   non-self-supplying consumer; once reorder lands, no consumer precedes its producer) — refuse
   loudly on violation. Classify input (backlog-id only if `backlog:` declared → Backlog
   port `resolve`; file path; free-text brief). Derive the slug. **Open the run record.**
2. **Walk** each phase in effective order. For each:
   - resolve `execution` (phase field / profile; multi-dimension harness stays `agent` even
     under a lean profile — SP1 parallelism caveat);
   - resolve `model` via the Model port (manifest `models.<role>` → agent-pin → `models.fallback`
     → session; a tier known-degraded this run skips straight to fallback);
   - **assemble the injected block** (§ above);
   - **execute** via the Execution port — `spawn(role, ctx)` or `runInline(ctx)`; a
     `gate-only` harness (no `role`) runs its tool + gate with no triage spawn;
   - **verify the artifact** (commit exists; artifact present) — artifact-is-the-handoff; a dead
     agent → fresh respawn fed from the artifact, never a continuation;
   - **run the gate** via the Gate port — *targeted* gate per fix commit (`gates.slice` over
     touched files + `gates.review-batch` if declared); the *phase* gate **once per round**;
     never commit on a known-red gate;
   - **record** the outcome (incl. any skip/insert/swap/inline/override/degradation) in the run
     record;
   - on a **blocker** → escalate `{ phase/slice, reason, ≤3 options }`, never spin;
   - on a **model-down** error (not a task blocker) → mark the tier degraded for the run,
     re-resolve to fallback, respawn from the artifact.
3. **Cross-cutting invariants**, applied uniformly and expressed by *archetype* (not phase
   name): an **executing-harness triage gates `propose`** (today's "mutation triage gates the
   PR", generalised — `propose` waits until every harness-exec phase's run has landed and its
   gate is green; `documentation` may parallel a background harness run, `propose` may not);
   **scope-expansion re-enters `review`** (any feature behaviour added after review ran gets its
   own feature-scoped review before the harness gate); the **VCS ordering** policy (integrate
   after CI-green + confirm; lock-aware teardown).
4. **Done.** Final message: PR URL (or branch name) + one-line summary + the run record.

### As-is → to-be mapping

| Today | To-be | P |
|---|---|---|
| `run/SKILL.md` hardcoded 1→11 table + cross-phase invariants | core: **descriptor-driven walk** over the effective pipeline; the §11 invariants stay but generalise by archetype; the phase table → the default descriptor data file | P3,P5 |
| `skills/<phase>/SKILL.md` (Preamble + Procedure) | unchanged structure; referenced by `descriptor.procedure`; the **Preamble still always runs**, `override:` still swaps only the Procedure; dirs renamed to concern names | P3,P4 |
| `agents/<role>.md` carrying full contracts | **thin** role defs (identity + craft); invariant text relocated to the engine **contract store**; agents renamed to concern names (`mutation-triager→validation-triager`, …) | P4,P5 |
| `manifest-lint.sh` (shape, static `PROTECTED`, old `PHASE_NAMES`) | extended for new keys; reads the shared **alias map** (ADR-004); static `PROTECTED` removed (the graph computes stranding); P2 hardens it (yq + fallback) under test — **or folds into the Node core** (ADR-002 follow-up) | P2,P3,P4 |
| — (no resolver) | **new portable Node core module** (ADR-002): parse `pipeline/default.yml`, alias-resolve, expand profile, apply edits, validate the graph, assemble the injected block — the deterministic core functions, P1-unit-tested with a Node runner | P3,P5 |
| `plan-lint.sh` | unchanged (structural slice-schema gate — the shape-robust output model) | — |
| `worktree-setup/teardown.sh` | unchanged mechanically; **named as the VCS adapter** (isolate/teardown verbs); lock policy is core | P3 (name), P16 (extract) |
| `hooks/*` | unchanged; **named as the Gate/tool-guard mechanical adapter** | — |
| `templates/*` | unchanged; `requirements`/`architecture` templates added with their agents | P10 |
| `docs/DESIGN.md` | **split** (§16): this doc becomes the *living engine architecture* SoT; old DESIGN.md → historical migration record (**DC-7**) | P5 |

**P4 rename home.** The rename is a single coordinated change: skill dirs (`skills/branch→
workspace`, `adr→decisions`, `plan→planning`, `implement→implementation`, `mutation→validation`,
`refactor→refactoring`, `docs→documentation`, `pr→propose`, `merge→integrate`), agent files
(`mutation-triager→validation-triager`, …), the default descriptor `id`s, and the alias map +
its lint fixture. `requirements`/`architecture` are **new** phases (no dir to rename), but `prd`
is still a registered alias for `requirements` (PRD §6.4) so a manifest may name either. Old
names keep working via the map (R-compat).

**Zero-config identical (SC1).** The default descriptor list encodes today's exact order,
agents, models, and `execution: agent`. With no manifest, the walk reproduces today's pipeline
phase-for-phase. The contract relocation (P5) must not change spawn *content* — same invariants,
sourced from the engine store instead of the agent body. P1 characterization (mechanism) +
the R8 fixed-prompt agent-output re-baseline guard both halves.

## Decision candidates — **resolved in the ADR pass (2026-06-15)**

All eight are decided; full options + rationale live in `docs/adr/001–008`. Three (⚑) overrode
the designer's recommendation.

| # | Choice | Decision | ADR |
|---|---|---|---|
| DC-1 | Descriptor storage form | YAML data file (`pipeline/default.yml`) | 001 |
| DC-2 ⚑ | Deterministic resolution home | a **portable Node module** (not Bash) — descriptor parse, alias-resolve, profile-expand, edit-apply, graph-validate, contract-assemble | 002 |
| DC-3 | Contract storage form | composable fragment files under `contracts/` | 003 |
| DC-4 | Alias-resolution home | one shared data alias-map (consulted by lint *and* walk) | 004 |
| DC-5 ⚑ | Skip/reorder strictness | graph-only; **all harnesses (incl. validation) skippable-but-flagged**, a skipped executing-harness waiver-releases its `propose`-gate; only a stranding skip refuses; reorder deferred | 005 |
| DC-6 | `contract:` shape | a list, defaulting to one | 006 |
| DC-7 | `DESIGN.md` split | split — this doc = living SoT, old `DESIGN.md` → `DESIGN-history.md` | 007 |
| DC-8 ⚑ | `execution` config levels | per-phase field **>** profile **>** top-level `execution:` default | 008 |

## Test strategy

The design's central testability move is **extracting the deterministic engine functions** so
P1 can pin them without an LLM (this is the hexagonal payoff for testing) — now a **portable
Node core module** (ADR-002), unit-tested with a Node runner (`node:test`/vitest); bats covers
the remaining Bash (hooks, worktree scripts). Seams P1 needs:

- **Descriptor parse + graph validation** — acyclic; every `consumes` has a `produces`;
  `self_supply ⊆ consumes`; the default list is internally consistent. Pure function over the
  data file → fixture-tested (valid + crafted-invalid).
- **Alias map** — old→new table; every old name resolves; round-trip stable. Table-tested.
- **Pipeline resolution** — `(default list, manifest edits) → effective pipeline`; golden
  input/output fixtures; a stranding skip is **refused**; a producer-after-consumer reorder is
  **rejected**; a `profile:` expands correctly; explicit fields override the profile.
- **Contract assembly** — `(descriptor, manifest) → injected block`; assert U always present;
  context files appended verbatim; retrieval note injected; the **inline variant** swaps exactly
  the two carve-out lines and nothing else. No LLM needed.
- **`manifest-lint` valid/invalid fixtures** — including the historical comma-in-array +
  quoting regressions, and (at P4) the alias-resolution fixture.
- **Output-shape robustness** — the consumer parser accepts a JSON array and a per-line list of
  findings interchangeably (R10); `plan-lint` stays structural.
- **Scenario suite (golden runs S1–S9)** — assert *pipeline resolution + gate decisions*
  (mechanism), never LLM prose. SC1 = the zero-config golden walk equals today's order/agents.
- **Characterization first** (PRD P1): pin current behaviour green *before* abstraction; keep it
  green through P3–P5 except where a change is deliberate and re-baselined (R8 agent-output diff
  at P5).

*(The P1 harness implementation itself — bats layout, CI wiring — is out of scope here; this
section specifies the seams it targets.)*

## Out of scope

- **P8 harness-config internals** — the `harness:` *field* and its defaults are designed here;
  how dimensions/passes/cycles/convergence/tool resolve at run time is P8.
- **P10 new-phase agents** — `requirements`/`architecture` exist as default-off *descriptors*;
  the `requirements-writer` / `architecture-triager` agent bodies are P10.
- **P11 backlog adapter implementations** — the `resolve`/`complete` *port* is fixed; the gh/
  jira/linear/custom *implementations* are P11.
- **P14 derived-plugin extension specifics** — the ports admit Tier-2 (SP2 GREEN); the
  registration UX/wiring is P14.
- **P16 provider adapter** — the 6-port boundary is fixed so a second adapter *can* exist; the
  Pi adapter is P16.
- **P1 test-harness implementation** — seams specified above; the harness build is P1.
- **DX docs / examples** (P12), **NFR matrix** (P13), **second-instantiation** (P15).
