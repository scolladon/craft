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
AI triage step*, configurable per repo. Review, validation, and architecture are all executing-harnesses;
declare techniques per repo — see `examples/`. You can tune them or add your own.

### Zero-config on any toolchain

The default pipeline runs zero-config on any non-JS repo provided it has a test command the
gate probe can discover (`pytest`, `go test`, `cargo test`, a `make test`/CI script, …) — the
precondition every useful repo already satisfies. `validation` and the
default-off `architecture` **no-op with a note** when their configured tools are
absent; `propose`/`integrate` no-op without a git remote; a repo with no discoverable test
command hits the gate-floor refusal by design. See
[docs/archive/SC5-second-instantiation-record.md](archive/SC5-second-instantiation-record.md) for
the empirical proof on a Python/pytest repo.

### The hexagon — core, ports, adapter

craft is built **hexagonally**. This is the whole model:

```
                 ┌──────────────────────── Domain core (provider-neutral) ─────────────────────────┐
                 │  pipeline walk · phase model + dependency graph + self_supply · §11 guiderail     │
   user input ──▶│  contract injection · gate discipline (policy) · model resolution (policy)        │──▶ run record
                 │  harness config (policy) · run record · alias map · default descriptor list        │
                 └───┬───────────┬───────────┬──────────────┬───────────────┬───────────────┬──────────┬──────┘
        Execution ◀──┘   Model ◀─┘   Gate ◀──┘  Code-access ◀┘   Backlog ◀───┘    VCS ◀───────┘  Memory ◀┘  Policy ◀┘  Intention ◀┘  (9 ports = mechanism)
            │            │            │            │  (env-sourced,        │               │           │
            ▼            ▼            ▼            ▼   NOT adapter)         ▼               ▼           ▼
        Task /        model        Bash gate    runtime+settings        file / gh /     git worktree  .claude/
        in-thread     param        + hooks      (LSP/RAG/RTK/Serena      jira / linear   + VCS host CLI craft-memory.md
        (Claude Code adapter)                    /native Read+Grep)      / custom        (Claude Code adapter)
```

- **Domain core (you cannot inject this)** — the pipeline walk, the dependency graph, the invariant
  guiderail (§2 below), contract injection, gate discipline, model resolution, the run record. It
  knows *what* must happen, never *how* a runtime carries it out. The core decides "plan **consumes**
  design," not "design precedes plan."
- **Ports (you configure or swap these)** — nine thin seams the core uses to reach a mechanism:
  **Execution**, **Model**, **Gate**, **Code-access/retrieval**, **Backlog SoT**, **VCS/integration**,
  **Memory**, **Policy**, **Intention**. A port exposes *mechanism*; the core keeps *policy*. The Model
  port only `select`/`isAvailable` — the core owns the *fallback order*. The Gate port only
  `run(cmd)` — the core owns *never commit on red*. The Memory port only `load`/`save` — the core
  owns the advisory-only invariant (deleting the store changes run cost, never correctness). The
  Intention port only `consult`/`record`/`assert-fresh` — the core owns the gate choice
  (`intention.gate: advisory|blocking`).
- **Adapter (you don't touch this)** — the binding of those ports to concrete Claude Code primitives
  (Task subagents, the model param, Bash + PreToolUse hooks, VCS host CLI / git, the Skill tool). **craft *is*
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

- **Never commit on a red gate.** (orchestrator-enforced — it runs the craft gate at each cadence
  boundary; this is the *craft gate*, not the repo's local git hook, so `--no-verify` is the
  consumer's discretion, not framework law.)
- **A gate must exist** for code-producing phases.
- **Contract injection itself** — swap the agent, never drop the contract.
- **Artifact-is-the-handoff** — a phase hands off via a commit/artifact, never via agent context.
- **Gate cadence** — a targeted gate per fix; the phase gate once per round.
- **Model resolution + fallback** and the **blocker protocol**.
- **Dependency graph honored** — a skip/reorder that strands a consumer-without-fallback is
  refused/flagged.
- **Auto-skip bounded by the same strand guard** — before entering an eligible phase, craft evaluates
  whether that phase has any work for this change; if it provably has none, craft auto-skips it and
  records `auto-skip: <phase> — evaluated unnecessary (<signal>)` in the run record. The four floor
  phases (`workspace`, `implementation`, `propose`, `integrate`) are categorically ineligible and
  never auto-skipped. The strand guard that protects `pipeline.skip` equally protects auto-skip —
  a phase whose artifact a later enabled phase needs is never auto-skipped. Pin `phases.<id>.required:
  true` (Tier 0, #10) to force a specific phase to always run regardless of the evaluation.
- **The run record** logs every skip / insert / swap / inline / override / auto-skip / degradation — flexibility
  *with visible accountability*.
- **Adapter failure is a blocker, never a silent pass** — an unreachable backlog `resolve`/`complete`,
  gate, or model escalates via the blocker protocol; the closing tick is never silently skipped.

This is why customization is *safe*: every injection point below changes *what* a phase does or *who*
does it — none can lower this floor. (One narrow transform: under `execution: inline`,
*artifact-is-the-handoff* becomes "the commit is the handoff" and *model fallback* collapses to the
session model — the invariants transform, they don't drop.)

---

## 3. The injection catalog

Six questions per phase — pick the axes you need:

| Axis | What it covers |
|---|---|
| **WHO runs it** | model · execution · profile · role |
| **WHAT it does** | override file · procedure |
| **HOW it's checked** | gate · harness config |
| **Reshape the spine** | skip · required · context · insert · reorder · extends |
| **The floor** *(untouchable)* | invariant preamble · core contract · gate cadence — §2, not an injection point |
| **Ports** *(cross-cutting)* | backlog · memory · policy · DoD · intention |

Tier = effort: **0** = one line in `.claude/workflow.md` · **1** = add a file · **2** = local plugin.

### WHO runs it — model · execution · profile · role

| Point | What it buys | Cost | Sample |
|---|---|---|---|
| **model** per agent *(Tier 0)* | cheap model routing per concern | wrong tier hurts quality (never safety) | [`model-routing/`](../examples/model-routing/) |
| **execution** inline/agent *(Tier 0)* | speed / token control per phase | inline loses subagent isolation | [`lean-profile/`](../examples/lean-profile/) |
| **profile** *(Tier 0)* | a whole-flow mode in one word (`solo`/`lean`/`full`) | coarse — a preset, not a scalpel | [`lean-profile/`](../examples/lean-profile/) |
| **role** swap (`role:`) *(Tier 1)* | domain-specific agent, contract still injected | your agent must do the job | [`role-swap/`](../examples/role-swap/) |

### WHAT it does — override file · procedure

| Point | What it buys | Cost | Sample |
|---|---|---|---|
| **override file** (procedure body) *(Tier 1)* | a fully project-shaped procedure | you own that body; the preamble still binds | [`override-procedure/`](../examples/override-procedure/) |
| **procedure** swap (`procedure:`) *(Tier 1)* | dispatch to a namespaced procedure, contract still injected | your agent must do the job | [`role-swap/`](../examples/role-swap/) |

### HOW it's checked — gate · harness config

| Point | What it buys | Cost | Sample |
|---|---|---|---|
| **gate** command *(Tier 0)* | your harness, any tech | a weak gate weakens your own floor | [`gate-command/`](../examples/gate-command/) |
| **harness config** *(Tier 0)* | tune rigor per concern (dimensions / passes / cycles / convergence / tool) | mis-tuning over/under-verifies | [`review-harness/`](../examples/review-harness/) |

### Reshape the spine — skip · required · context · insert · reorder · extends

| Point | What it buys | Cost | Sample |
|---|---|---|---|
| **skip** a phase *(Tier 0)* | drop a step; dependency-checked | over-skipping erodes guarantees (refused if it strands a consumer) | [`skip-phase/`](../examples/skip-phase/) |
| **required** *(Tier 0)* | pin a phase so craft never auto-skips it — `phases.<id>.required: true` forces the phase to run even when craft's necessity evaluation would otherwise skip it. Does not override an explicit `pipeline.skip` or `enabled: false` (the operator's own waiver still wins); setting both `required: true` and a `pipeline.skip` for the same phase is a manifest-lint error. | over-pinning forfeits the cost saving that auto-skip provides | — |
| **context file** (global / per-phase) *(Tier 1)* | additive constraints, contract-safe | drift if unmaintained | [`karpathy-as-context/`](../examples/karpathy-as-context/) |
| **insert** a phase *(Tier 1)* | a new SE step with full guarantees | you supply its procedure | [`everything-claude-toolkit/`](../examples/everything-claude-toolkit/) † |
| **reorder** (pipeline op) *(Tier 1)* | change phase sequence; dependency-checked | must not strand a consumer — refused/flagged if it does | — |
| **extends** — derived local plugin *(Tier 2)* | register phases/agents/profiles/backlog-adapters from your own plugin | deepest power; shareable; versioned; most setup; depends on cross-plugin dispatch | [`derived-plugin/`](../examples/derived-plugin/) |

† Phase **dispatch** and *contract execution* for an inserted phase both ship: the walk passes the
resolved descriptor to `contract-assemble`, so a brand-new inserted id executes under the
engine-owned contract. The toolkit example shows insert alongside four other points.

Default-off phases turn on the same way (one line): see [`requirements/`](../examples/requirements/)
and [`architecture/`](../examples/architecture/).

### The floor (untouchable) — invariant preamble · core contract · gate cadence

Not an injection point. Every injection point above changes *what* a phase does or *who* does it;
none can lower this floor. See [§2](#2-the-invariant-core--what-you-cannot-inject-the-floor).

### Ports (cross-cutting) — backlog · memory · policy · DoD · intention

| Point | What it buys | Cost | Sample |
|---|---|---|---|
| **backlog source** *(Tier 0)* | use your tracker (`file` or `custom`) | a custom ref is resolved at runtime | [`backlog-custom/`](../examples/backlog-custom/) |
| **tracker adapter** *(Tier 2)* | register a named backlog source via `extends.backlog-adapters`; selectable as `backlog.source: <name>`; the adapter script is verified at lint time | the host CLI lives only in your adapter script | see [`examples/`](../examples/) for a worked tracker adapter |
| **memory** *(Tier 0)* | per-repo advisory cache (`memory: { source: file, ref }`) — stores mechanically-derived learnings (toolchain, gate commands, findings, part sizing) so subsequent runs skip re-probing; default store at `.claude/craft-memory.md`, committed via a `.gitignore` re-include. Advisory-only: deleting it changes run cost, never correctness. See [`docs/adapters/memory.md`](adapters/memory.md) for the port contract. | a custom `ref` that escapes the repo root is silently skipped — the port never reads or writes outside the repo | — |
| **intention** *(Tier 0)* | per-repo architectural-intention corpus (`intention: { source: file, ref, gate, covers }`) — `consult` prepends the phase's matching living pages into the design/planning contract slot (advisory, slot 1 — no second injection surface); `record` routes ADR/page writes through the same seam the `file` adapter already uses; `assert-fresh` flags a changed path whose covering page went untouched (`INTENTION-DRIFT`), waivable per page (`INTENTION-WAIVE`). `intention.gate` chooses `advisory` (default) or `blocking`; `intention.covers` names load-bearing scopes a page must exist for. See [`docs/adapters/intention.md`](adapters/intention.md) for the port contract. | a `blocking` gate on a thin/under-adopted corpus stalls on false positives — start `advisory` and promote once the corpus is populated | — |
| **policy** *(Tier 0)* | per-repo/per-user permission layer over outward/hard-to-reverse VCS-port actions. The `policy:` manifest key accepts `always`, `ask`, and `never` verdict lists over the action vocabulary (`isolate`, `commit`, `push`, `propose`, `integrate`, `teardown`, `external-send`, `backlog-write` — note `integrate` = merge, `propose` = pr-create). Per-action defaults are keyed by reversibility: local reversible actions (`isolate`, `commit`, `backlog-write`) default to `always`; remote/hard-to-reverse actions (`push`, `propose`, `integrate`, `teardown`, `external-send`) default to `ask`, so an unconfigured repo behaves as today (merge still stops for confirmation). Three scopes fold in one direction (`per-invocation > project > user`): user `~/.claude/craft-policy.md` < project manifest `policy:` < per-invocation `--policy`. An explicit `always` verdict for `integrate` or `propose` supersedes craft's hardcoded merge/PR confirmation, enabling unattended headless auto-merge. The three engine floors (`never-commit-on-red`, `validation-triage-gates-propose`, `artifact-handoff`) are not nameable actions and cannot be reached by any verdict. See [`docs/adapters/policy.md`](adapters/policy.md) for the port contract. | a misconfigured policy (unknown action or verdict, non-list value, intra-scope double-verdict) fails manifest-lint loudly, never silently | — |
| **DoD artifact** (`docs/DOD.md` or `paths.dod`) *(Tier 1)* | per-criterion acceptance-criteria check in the `validation` phase (default-ON); absence warns, never blocks | you own and maintain the checklist | [`dod-artifact/`](../examples/dod-artifact/) |

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
- **Per-invocation flags** (`--profile`, `--skip`, `--harness`, `--policy`, `--config`, …) fold over the manifest at **highest**
  precedence — tailor a single run without editing the file.
  - **`--config <name>`** selects *which manifest file is read* for the run: loads `.claude/craft-<name>.md` instead of
    `.claude/workflow.md`. It does not fold a knob inside the manifest — it chooses which file the other flags fold over.
    `--config` and `--profile` compose: both may appear together. An absent target is a loud stop, never a silent fallback.

#### `--harness <phase>.<knob>=<value>` — per-invocation harness override

Repeatable (one knob per flag; repeat for several). The `.harness.` path segment is implied —
`--harness review.passes=2` writes `phases.review.harness.passes = 2` for that invocation only,
winning over both the manifest harness and `pipeline/default.yml`.

**Grammar:** `<phase>.<knob>=<value>` — exactly one dot separating phase from knob, then `=` and the value.

**Coercion** — value is type-coerced by knob name:

| Knob | Coerces to | Note |
|---|---|---|
| `passes`, `max_cycles` | integer | non-integer string → rejected |
| `convergence` | number **or** string | `low-only`/`none` stay as-is; otherwise parsed as a number |
| `dimensions` | comma-split list | e.g. `code,security,tests` |
| `techniques` | comma-or-object list | repo-declared technique names or config objects |
| `scope` | string | identity |
| *(unknown knob)* | string | passes through; `validateHarness` allows unknown sub-keys |

**Fail-closed:** malformed grammar (no `=`, empty phase or knob, more than one `.` before `=`) exits 2
with `pipeline-resolve: --harness expects <phase>.<knob>=<value>`. Reserved names (`__proto__`,
`constructor`, `prototype`) as phase or knob also exit 2. An unknown phase id exits 2 with
`unknown phase: <id>`; a bad knob value (e.g. `passes=2.5`, `passes=0`) exits 2 with the same
per-knob message a bad manifest produces (e.g. `phases.review.harness.passes must be a positive integer`).

**Example:**

```bash
/craft:run --harness review.passes=2 --harness review.convergence=3 TICKET-42
```

Runs the review harness with 2 reviewers per dimension and stops when ≤ 3 non-LOW findings remain
(numeric convergence, ADR-097), for this invocation only.

#### `--policy <action>=<verdict>` — per-invocation policy override

Repeatable (one action per flag; repeat for several). Sets a single action's verdict at highest
precedence for that run only — overrides both the project manifest `policy:` block and the user
`~/.claude/craft-policy.md`. The primary use is the **headless pre-approval channel**: an outer
harness passes `--policy integrate=always` to authorize an unattended merge for that run without
editing the manifest (ADR-130).

**Grammar:** `<action>=<verdict>` — exactly one `=`; `action` must be one of `POLICY_ACTIONS`
(`isolate`, `commit`, `push`, `propose`, `integrate`, `teardown`, `external-send`, `backlog-write`);
`verdict` must be one of `always`, `ask`, `never`.

**Fail-closed:** missing `=`, an unknown action, or an unknown verdict → exit 2 with
`pipeline-resolve: --policy expects <action>=<verdict>`.

**Example:**

```bash
/craft:run --policy integrate=always --policy propose=always TICKET-42
```

Authorizes unattended merge and PR creation for this invocation only (the headless end-to-end
auto-merge path). An unconfigured or `ask`-defaulting repo is not changed; only this run is
affected.

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
| #12 DoD artifact | [`dod-artifact/`](../examples/dod-artifact/) | author `docs/DOD.md` or set `paths.dod`; validation asserts it (default-ON) |
| #13 derived-plugin extension | [`derived-plugin/`](../examples/derived-plugin/) | `extends:` block — phases/agents/profiles |
| enable a default-off phase | [`requirements/`](../examples/requirements/) · [`architecture/`](../examples/architecture/) | `phases.<id>.enabled: true` |

Samples that reference a context/override body keep those files under
[`examples/.claude/workflow/`](../examples/.claude/workflow/) so each manifest lints as-is; in your
repo they'd sit at your project root's `.claude/workflow/`.

To generate a manifest covering the full catalog interactively rather than hand-writing it, use `craft:init` (see §5).

### Running craft in a loop — a use-pattern

The loop is an operator-owned outer harness, not an engine feature: craft runs one gated pass per
invocation and does not loop internally. The canonical interactive form is Claude Code's `/loop`
self-paced over the printed run record, e.g. `/loop /craft:run TICKET-42`; after each pass the model
reads the run record's `verify:` verdict — stop on `verify: DoD met`, run another pass on a
`verify: … unmet`, surface-and-halt on any other blocker or a `NO-OP(verify):`. The headless form
(no model in the loop) drives `craft-pi`, which prints no run record — the operator's harness keys
on its binary exit code (`0` = met, `2` = another pass needed or blocked) under a DoD-presence
precondition that makes `exit 0 ⇒ met` sound. Both forms are bounded and loud: a small iteration cap prevents an infinite
spin; non-convergence is surfaced, never swallowed. See the recipe for the full stop-condition tables
and the engine-native-loop rejection: [examples/loop/](../examples/loop/).

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
so a typo is caught before the run, not midway through it. A nested `pipeline.insert` entry (the
`phase:{}` wrapper) is also rejected; use the flat `{ after, id, … }` sibling shape instead. No manifest at all = strong defaults via
capability probing (lockfile detection, test-script discovery, technique-config probe, remote probe);
declare only what probing can't infer.

That's the loop: pick the points, write the lines, lint, run. Reach for Tier 1 when one line isn't
enough (your own agent, your own procedure body, a new phase), and Tier 2 when you want to package it
as a shareable plugin — see [`derived-plugin/`](../examples/derived-plugin/) and §3 above.

### Interactive alternative — `craft:init`

Rather than hand-authoring, run `craft:init` inside the repo to get an interview-driven guided
on-ramp. It probes the repo (ecosystem, test command, remote, validation/architecture tooling), walks
you through the full Tier-0/1 catalog with probe-grounded defaults, and writes a **named** manifest
`.claude/craft-<name>.md` — a complete, lint-clean sibling of `.claude/workflow.md`:

```bash
# Generate a named customization interactively.
/craft:init

# Load it for a run.
/craft:run --config <name> "<backlog-id | path/to/spec.md | feature description>"
```

Named configs coexist as siblings of `.claude/workflow.md`; the live default manifest is never
touched by a named run. Multiple named configs can coexist in one repo (e.g. `ci`, `strict-review`,
`solo`). Re-running `craft:init` for an existing name regenerates that file in place; a failed lint
leaves the prior version untouched. The hand-author path above is still the direct route if you know
exactly what you want — `craft:init` is the guided on-ramp for exploring or bootstrapping.
