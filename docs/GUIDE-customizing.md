# Customizing craft — the mental model + injection catalog

> The one doc to read before you tailor craft. It gives you the **mental model** (what craft is and
> what it guarantees), the **injection catalog** (every way to customize it, cheapest first), and an
> **examples index** (a runnable sample per injection point). By the end you should be able to write
> a `.claude/workflow.md` for your repo in one sitting.
>
> Deeper provenance: [PRD](PRD-customizable-engine.md) (intent) ·
> [DESIGN](DESIGN-customizable-engine.md) (architecture) · [adr/](adr/) (decisions).

---

## 1. The mental model (five minutes)

### A run is a pipeline of phases

A **run** is a pipeline of phases; each phase is one software-engineering activity. The default,
zero-config sequence is:

```
workspace → design → decisions → planning → implementation → review
          → refactoring → validation → documentation → propose → integrate
```

Two more phases ship **default-off** and turn on with one line: `requirements` (front-of-pipeline
product spec) and `architecture` (a dependency/layering harness). Phases fall into a few
**archetypes** — *setup* (`workspace`), *specification* (`requirements`/`design`/`decisions`/`planning`),
*construction* (`implementation`), *harness* (`review`/`validation`/`architecture`/…), *refinement*
(`refactoring`), *delivery* (`documentation`/`propose`/`integrate`). A **harness** is the reusable
one: an automated, repeatable verification of a single concern, expressed as *a gate plus an optional
AI triage step*, configurable per repo. Review, validation (default: mutation testing), and
architecture (default: dependency-cruiser) are all harnesses; you can tune them or add your own.

### The hexagon — core, ports, adapter

craft is built **hexagonally**. This is the whole model:

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

- **Domain core (you cannot inject this)** — the pipeline walk, the dependency graph, the invariant
  guiderail (§2 below), contract injection, gate discipline, model resolution, the run record. It
  knows *what* must happen, never *how* a runtime carries it out. The core decides "plan **consumes**
  design," not "design precedes plan."
- **Ports (you configure or swap these)** — six thin seams the core uses to reach a mechanism:
  **Execution**, **Model**, **Gate**, **Code-access/retrieval**, **Backlog SoT**, **VCS/integration**.
  A port exposes *mechanism*; the core keeps *policy*. The Model port only `select`/`isAvailable` —
  the core owns the *fallback order*. The Gate port only `run(cmd)` — the core owns *never commit on
  red*.
- **Adapter (you don't touch this)** — the binding of those ports to concrete Claude Code primitives
  (Task subagents, the model param, Bash + PreToolUse hooks, `gh`/git, the Skill tool). **craft *is*
  the Claude Code adapter today.** Code-access is the deliberate exception: it is environment-sourced
  (your LSP/RAG/RTK/Serena/native tools), never bound by the adapter.

**The whole catalog below is just "configure or swap a port."** Customizing = answering a few
questions per phase: *does it run? · which agent/model? · inline or subagent? · which harness config?
· what gates it?* — from a one-line edit up to a derived plugin.

> **The frame to keep:** you bring the rules, agents, and tools; **craft wires and gates them.**
> craft is opinion-free about *what* you inject — it owns only the orchestration guarantees.

---

## 2. The invariant core — what you cannot inject (the floor)

Some things are **not** injectable, deliberately. They hold for every phase, profile, inserted step,
and derived plugin — changing them is an *engine* change, not a customization:

- **Never commit on a red gate. Never `--no-verify`.** (enforced by a PreToolUse hook + the
  orchestrator — mechanical, not session memory.)
- **A gate must exist** for code-producing phases.
- **Contract injection itself** — swap the agent, never drop the contract.
- **Artifact-is-the-handoff** — a phase hands off via a commit/artifact, never via agent context.
- **Gate cadence** — a targeted gate per fix; the phase gate once per round.
- **Model resolution + fallback** and the **blocker protocol**.
- **Dependency graph honored** — a skip/reorder that strands a consumer-without-fallback is
  refused/flagged.
- **The run record** logs every skip / insert / swap / inline / override / degradation — flexibility
  *with visible accountability*.
- **Adapter failure is a blocker, never a silent pass** — an unreachable backlog `resolve`/`complete`,
  gate, or model escalates via the blocker protocol; the closing tick is never silently skipped.

This is why customization is *safe*: every injection point below changes *what* a phase does or *who*
does it — none can lower this floor. (One narrow transform: under `execution: inline`,
*artifact-is-the-handoff* becomes "the commit is the handoff" and *model fallback* collapses to the
session model — the invariants transform, they don't drop.)

---

## 3. The injection catalog

Tiered by effort, cheapest first. Each row links a runnable [`examples/`](../examples/) sample.

### Tier 0 — one line in `.claude/workflow.md`

| # | Point | What it buys | The cost | Sample |
|---|---|---|---|---|
| 1 | **skip** a phase | drop a step; dependency-checked | over-skipping erodes guarantees (refused if it strands a consumer) | [`skip-phase/`](../examples/skip-phase/) |
| 2 | **model** per agent | cheap model routing per concern | wrong tier hurts quality (never safety) | [`model-routing/`](../examples/model-routing/) |
| 3 | **gate** command | your harness, any tech | a weak gate weakens your own floor | [`gate-command/`](../examples/gate-command/) |
| 4 | **execution** inline/agent | speed / token control per phase | inline loses subagent isolation | [`lean-profile/`](../examples/lean-profile/) |
| 5 | **profile** | a whole-flow mode in one word (`solo`/`lean`/`full`) | coarse — a preset, not a scalpel | [`lean-profile/`](../examples/lean-profile/) |
| 6 | **harness config** | tune rigor per concern (dimensions / passes / cycles / convergence / tool) | mis-tuning over/under-verifies | [`review-harness/`](../examples/review-harness/) |
| 7 | **backlog source** | use your tracker (`file` or `custom`) | a custom ref is resolved at runtime | [`backlog-custom/`](../examples/backlog-custom/) |

Default-off phases turn on the same way (one line): see [`requirements/`](../examples/requirements/)
and [`architecture/`](../examples/architecture/).

### Tier 1 — add a file

| # | Point | What it buys | The cost | Sample |
|---|---|---|---|---|
| 8 | **context file** (global / per-phase) | additive constraints, contract-safe | drift if unmaintained | [`karpathy-as-context/`](../examples/karpathy-as-context/) |
| 9 | **override file** (procedure body) | a fully project-shaped procedure | you own that body; the preamble still binds | [`override-procedure/`](../examples/override-procedure/) |
| 10 | **agent / skill swap** (`role:` / `procedure:`) | domain-specific behavior, contract still injected | your agent must do the job | [`role-swap/`](../examples/role-swap/) |
| 11 | **insert** a phase | a new SE step with full guarantees | you supply its procedure | [`everything-claude-toolkit/`](../examples/everything-claude-toolkit/) † |

† Phase **dispatch** and *contract execution* for an inserted phase both ship: the walk passes the
resolved descriptor to `contract-assemble`, so a brand-new inserted id executes under the
engine-owned contract. The toolkit example shows insert alongside four other points.

### Tier 2 — a derived local plugin

| # | Point | What it buys | The cost | Sample |
|---|---|---|---|---|
| 12 | **extension surface** — register phases/agents/profiles/backlog-adapters from your own plugin | deepest power; shareable; versioned | most setup; depends on cross-plugin dispatch | [`derived-plugin/`](../examples/derived-plugin/) |

### How Tier 2 works — the `extends:` block

A derived plugin B (`dependencies: ["craft"]`) ships skill and agent *content* addressed by
namespaced name (e.g. `pluginB:my-phase`, `pluginB:my-agent`). **The content lives in the
derived plugin; the wiring lives in the repo manifest.** Because a plugin cannot read another
plugin's files (SP2 file-access constraint), the engine never reads plugin B's files directly —
the descriptor data is carried by the repo `.claude/workflow.md` that craft already reads.

Add a top-level `extends:` block to your manifest. Four sub-blocks are accepted:

```yaml
extends:
  phases:              # registered SE steps — all descriptor data is manifest-carried
    - id: bench
      procedure: pluginB:bench        # namespaced dispatch target
      role: pluginB:bench-runner      # must appear in agents: below
      archetype: harness              # required; one of setup, specification, construction,
                                      #   harness, refinement, delivery
      contract: [harness-exec]        # optional; values drawn from the closed bundle vocab:
                                      #   core, producer, construction, harness-read,
                                      #   harness-exec, delivery, refinement
      consumes: [change]              # optional string arrays
      produces: [bench-report]
      after: validation               # optional insert anchor
      gate: "pluginB-bench --check"   # optional gate command
  agents:              # registered roles — the roleExists "installed" set
    - pluginB:bench-runner
    - pluginB:domain-planner
  profiles:            # registered whole-flow modes (full + typed — all six archetypes required)
    audit:
      setup: inline
      specification: agent
      construction: agent
      harness: agent
      refinement: agent
      delivery: inline
  backlog-adapters:    # registered backlog ports; ref must exist at lint time
    - name: acme-tracker
      ref: .claude/workflow/acme-backlog.sh
```

**Insert vs. replace.** A registered phase whose `id` matches a default phase id *replaces* that
default wholesale — a full descriptor swap, no field inheritance. A registered phase with a new id
*inserts* using the same anchor/graph path as `pipeline.insert`. In both cases the engine applies
the same graph, strand, and gate discipline; the insert or replace never bypasses it.

**The invariant core still binds.** A registered phase's `contract:` must draw only from the
closed `BUNDLE_VOCAB`; the engine-owned core bundle is always prepended unconditionally. A derived
plugin can re-home a default slot, but it cannot lower the floor — there is no `extends` key that
reaches the invariant core (§2).

### Always available (any tier), and never injectable

- **Mechanical:** repo `.claude/hooks` (unforgettable rules) + lifecycle `scripts:`
  (`post-setup`/`pre-teardown`). Automatic — not even named in the manifest.
- **Derived, not wired by you:** the **retrieval strategy** (how agents read code —
  LSP/RAG/RTK/Serena/native) is sourced from your project/user settings + auto-detected env, then
  injected by the engine. Declare `retrieval:` only to override detection; never encode it in a
  plugin (G14).
- **Not injectable:** the invariant core (§2). Changing it is an engine change.

### Precedence — when two settings touch the same knob

- **Execution:** `phases.<id>.execution` > `pipeline.profile` > top-level `execution:`.
- **Model:** manifest `models.<agent>` > the agent's pin > `models.fallback` > the session model.
- **Per-invocation flags** (`--profile`, `--skip`, …) fold over the manifest at **highest**
  precedence — tailor a single run without editing the file.

---

## 4. Examples index — a sample per point

Every Tier-0/1 injection point maps to a runnable [`examples/`](../examples/) sample. Each example's
`workflow.md` is a real, lint-clean manifest with prose; the `examples-lint` CI gate keeps them valid.

| Point | Sample | Notes |
|---|---|---|
| #1 skip | [`skip-phase/`](../examples/skip-phase/) | dependency-checked skip |
| #2 model | [`model-routing/`](../examples/model-routing/) | per-agent model + fallback |
| #3 gate | [`gate-command/`](../examples/gate-command/) | supply the gate command |
| #4 execution / #5 profile | [`lean-profile/`](../examples/lean-profile/) | profiles are sugar over per-phase `execution:` |
| #6 harness config | [`review-harness/`](../examples/review-harness/) | tune the review harness |
| #7 backlog source | [`backlog-custom/`](../examples/backlog-custom/) | `custom` resolver script |
| #8 context file | [`karpathy-as-context/`](../examples/karpathy-as-context/) | global behavioral pack |
| #9 override file | [`override-procedure/`](../examples/override-procedure/) | project-shaped procedure body |
| #10 agent/skill swap | [`role-swap/`](../examples/role-swap/) | `role:` / `procedure:`, contract preserved |
| #11 insert a phase | [`everything-claude-toolkit/`](../examples/everything-claude-toolkit/) | five points in one grab-bag |
| #12 derived-plugin extension | [`derived-plugin/`](../examples/derived-plugin/) | `extends:` block — phases/agents/profiles |
| enable a default-off phase | [`requirements/`](../examples/requirements/) · [`architecture/`](../examples/architecture/) | `phases.<id>.enabled: true` |

Samples that reference a context/override body keep those files under
[`examples/.claude/workflow/`](../examples/.claude/workflow/) so each manifest lints as-is; in your
repo they'd sit at your project root's `.claude/workflow/`.

---

## 5. Tailor in one sitting

The whole point: a few small modifications, maximum power. Say you want to **route review to a
deeper model**, **tune the review harness**, **skip refactoring**, and **add house rules** — that's
points #2, #6, #1, and #8, in one file:

```yaml
# .claude/workflow.md (at your repo root)
---
context: .claude/workflow/house-rules.md   # #8 — global rules into every agent
models:
  reviewer: opus                           # #2 — deeper model for the review harness
  fallback: sonnet
pipeline:
  skip: [refactoring]                      # #1 — drop the structure pass (dependency-checked)
phases:
  review:
    harness:
      dimensions: [code, security, tests]  # #6 — tune the review harness
      max_cycles: 2
---
```

Then:

```bash
# 1. Validate — misconfiguration fails loudly, never silently.
node engine/bin/manifest-lint.js .claude/workflow.md     # or: scripts/manifest-lint.sh

# 2. Run.
/craft:run "<backlog-id | path/to/spec.md | feature description>"
```

`manifest-lint` refuses on any unknown key, a missing context/override file, or a malformed value —
so a typo is caught before the run, not midway through it. No manifest at all = strong defaults via
capability probing (lockfile detection, test-script discovery, mutation-config probe, remote probe);
declare only what probing can't infer.

That's the loop: pick the points, write the lines, lint, run. Reach for Tier 1 when one line isn't
enough (your own agent, your own procedure body, a new phase), and Tier 2 when you want to package it
as a shareable plugin — see [`derived-plugin/`](../examples/derived-plugin/) and §3 above.
