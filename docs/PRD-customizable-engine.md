# PRD — Forge: a customizable, model-resistant software-engineering workflow engine

**Status:** working draft (2026-06-15) · converged after 4 review rounds · **Owner:** Sébastien Colladon · **Branch:** `feat/customizable-engine`

> Working SoT for the initiative. **[decided]** = settled in kickoff; **[spike]** = needs
> empirical proof first; **[proposal]** = open to revision. The phased program in §17 maps
> every requirement to where it is resolved (traceability) so nothing is forgotten.

---

## 1. Summary

Turn forge from *one opinionated 11-phase workflow with bounded declination* into an
**abstract software-engineering workflow engine**: a pipeline of composable, abstract
phases whose membership, order, execution strategy, agents, harness behavior, and
procedures are all customizable — guarded by a small invariant *guiderail* that always
holds, and shipped with **strong, simple defaults that work with zero configuration**.

Design tenets, in order:
1. **Plug & play** — install, run, get a best-practice flow with no config.
2. **Tailor with little effort** — maximum power through a few simple, documented edits.
3. **Strong guiderail** — best practices mechanically enforced, not merely suggested.
4. **Fast, token-efficient, model-resistant** — first-class non-functional goals (§12).
5. **Hexagonal by construction** — a provider-neutral domain core behind explicit ports;
   concrete runtimes/tools are adapters. The more the core owns, the smaller every adapter
   and the closer we get to running on any provider (§2.1, §15). **[decided]**

---

## 2. The mental model (must be graspable in five minutes)

A **run** is a **pipeline of phases**. Each phase is one **software-engineering activity**.
Phases fall into a few **archetypes**:

| Archetype | Phases (default content) | Purpose |
|---|---|---|
| **Setup** | `workspace` | isolate the work |
| **Specification** | `requirements` *(opt)* · `design` · `decisions` · `planning` | produce the knowledge artifacts |
| **Construction** | `implementation` (TDD slices) | produce the change |
| **Harness** | `review` · `validation` · `architecture` · *(security/perf…)* | verify one concern, gate on it |
| **Refinement** | `refactoring` | improve structure, behavior-preserving |
| **Delivery** | `documentation` · backlog · `propose` · `integrate` | ship and record |

A **harness** is the key reusable concept: *an automated, repeatable verification of a
single engineering concern, expressed as a gate plus an optional AI triage step,
configurable and pluggable per repo.* Review, validation (default technique: mutation
testing), and architecture (default: dependency/layering constraints) are all harnesses;
a repo can tune them or add its own (security, performance, accessibility…). SP4 (§6.4)
pins the final vocabulary.

The **engine** walks the pipeline and applies the same cross-cutting guarantees to *every*
phase regardless of what it does: contract injection, gate discipline, artifact-is-the-
handoff, model resolution + fallback, the blocker protocol, dependency-aware skipping, and
the run record. The engine does not know "design precedes plan" — it knows "plan
*consumes* design."

### 2.1 Architecture convention — Hexagonal (ports & adapters)

The whole engine is built **hexagonally** — one mental model that speaks to everyone and
that we hold as the design convention throughout. **[decided]**

- **Domain core (provider-neutral):** the pipeline walk, the phase model + dependency
  graph, the invariant guiderail (§11), contract injection, gate discipline, harness
  config, model resolution, the run record. Pure workflow logic — it knows *what* must
  happen, never *how* it is carried out on a given runtime.
- **Ports (interfaces the core depends on).** A port exposes *mechanism*; the core keeps
  the *policy*. The core decides the model + fallback order — the **Model** port only
  `select`/`isAvailable`; the core decides that a gate must pass — the **Gate** port only
  `run`. So "model resolution" and "gate discipline" live in the core (§11) *as policy*,
  while the ports below are the thin execution seams:
  | Port | Interface (mechanism) | Spec |
  |---|---|---|
  | **Execution** | `spawn(role, ctx)` / `runInline(ctx)` | §10 · SP1 |
  | **Code-access / retrieval** *(env-sourced)* | `read` / `navigate` (LSP/RAG/RTK/Serena/native) | §10.1 · SP7 · G14 |
  | **Model** | `select(model)` / `isAvailable(model)` | SP5 · G12 |
  | **Gate / tool-guard** | `run(cmd) → pass\|fail`; mechanical guards (hooks) | §11 (no SPn — SPIKE.md b') |
  | **Backlog SoT** | `resolve(id)` / `complete(id, refs)` | §9 · SP6 · G7 |
  | **VCS / integration** | `isolate`/`commit`/`propose`/`integrate`/`teardown` (SP8) | §17 · SP8 |

  The same split holds for every port: the core owns *which backlog id-form resolves and
  when the tick fires* (the Backlog port only `resolve`/`complete`); *the gate-before-`propose`
  ordering + worktree-lifecycle sequencing* (the VCS port only the raw git/gh verbs); *when
  a phase runs inline vs as an agent and which §11 invariants transform* (the Execution port
  only `spawn`/`runInline`); and *the retrieval precedence project > env > user > native +
  the injection path §10.1* (the Code-access port only `read`/`navigate`).
  **Gate/tool-guard needs no spike** — its deny-hook + gate-wrapper mechanics are already
  spike-proven (SPIKE.md b'); every other port's unknown was closed by its spike (§14 — P0 complete).
- **Adapters (concrete implementations):** the **Claude Code adapter** (today — skills,
  subagents, hooks, MCP, `gh`/git CLI) implements every *adapter-owned* port. The
  **Code-access/retrieval** port is the deliberate exception — environment-sourced,
  satisfied by the runtime + project/user settings, **never by the adapter** (G14, §15).
  Future adapters (OpenCode / litellm / Claude Agent SDK) implement the *same* ports →
  multi-provider (§15).

This frame **unifies the whole PRD**: customization = configuring or swapping the relevant
axis (phase on/off, order, agent, model, execution, harness, backlog, retrieval); the
invariant core = the domain; portability
(G13) = a second adapter. Every requirement that pushes a concern out to a port both
sharpens customizability and shrinks the provider-specific surface. We build to this
layering from P3 onward (§17).

**Customization = answering five questions per phase**, from a one-line edit up to a
derived plugin:
1. *Does it run?* (skip / select) → §7 #1, #5
2. *In what order, and what else runs?* (insert / reorder) → §7 #11, #5
3. *Who runs it — which agent, which model, delegated or inline?* (default/swapped agent · model · inline-in-session) → §7 #2, #4, #10
4. *How hard does it verify?* (harness config: dimensions, cycles, convergence, tool) → §7 #6
5. *What rules bind it?* (gates, context files, override body) → §7 #3, #8, #9

The full injection catalog (§7) lists every point with pros/cons and a repo sample.

---

## 3. Problem statement

- **Hardcoded sequence** — cannot add/skip/reorder phases; "protected" phases cannot be skipped.
- **Fixed topology** — every heavy phase delegates to a subagent; no single-context fast path for small work.
- **Agents swappable by model only** — cannot point a phase at your own agent/skill.
- **Concrete, tool-named phases** — "mutation" names a technique, not the concern; no architecture *harness* (layering/dependency rules gating the PR) exists — architecture is at most an ad-hoc review lens today; the model doesn't generalize to arbitrary SE problems.
- **Backlog is file-only** — no way to use GitHub Issues / Jira / Linear as the source of truth.
- **Opaque customization** — no single clear mental model + injection catalog with trade-offs and samples.
- **Undefended engine** — no tests, no CI; the mechanical layer that *is* the guarantee is itself unverified (two `manifest-lint` comma regressions in history prove the cost).
- **Provider-locked** — bound to Claude Code primitives; no portability path.

---

## 4. Goals / Non-goals

### Goals
- G1. **Composable phases** — skip any, insert between, reorder within dependency constraints. **[decided]**
- G2. **Optional `requirements` (PRD) phase** — front-of-pipeline product-requirements step, default-off. **[decided]**
- G3. **Generic SE vocabulary** — phases named by concern, not tool; raise the *harness* family incl. **architecture harness**; mutation → **validation harness**. **[decided · spike SP4]**
- G4. **Pluggable execution topology** — `inline` vs `agent` per phase; exposed cleanly. **[decided · spike SP1]**
- G5. **Swappable agents/skills** with the engine-owned contract injected into every run. **[decided]**
- G6. **Per-phase harness config** — review count, convergence criteria, dimensions, tool selection, and more. **[decided]**
- G7. **Backlog Source-of-Truth abstraction** — file default; overrideable to GitHub Issues / Jira / Linear / custom. **[decided]**
- G8. **First-class extension path** — repos build their own variant, up to a dedicated local plugin, without losing engine guarantees.
- G9. **Strong zero-config defaults** — install + run produces a best-practice flow unchanged from today.
- G10. **Clear mental model + injection catalog + repo samples** — tailor with minimal effort. **[decided]**
- G11. **Tested, regression-proof, evolvable** — characterization + scenario suites + CI. **[decided]**
- G12. **Fast, token-efficient, model-resistant** — measurable NFRs (§12). **[decided]**
- G13. **Portability foundation** — architecture that admits non-Claude providers later (§15). *(next-goal)*
- G14. **Retrieval-strategy agnosticism** — *how* agents read/navigate code (LSP / RAG / RTK / Serena / native Read+Grep) is derived from user prefs or project settings and injected; **never encoded in the plugin**. **[decided · spike SP7]**

### Non-goals
- N1. Changing default behavior for current zero-config users (back-compat, §16).
- N2. A GUI/wizard — customization stays file-based and versioned. forge stays **headless**: because plan/diff/findings are committed artifacts (artifact-is-the-handoff), the human-decision touchpoints (plan · ADR · review diff) are *presentation-pluggable* — an external review UI (e.g. [plannotator](https://github.com/backnotprop/plannotator)) can front them, but forge never owns one.
- N3. Rewriting the engine medium (Bash + skill/agent markdown stays), except where portability (§15) demands an explicit adapter boundary.
- N4. Full multi-provider parity in this program — §15 delivers the *architecture* + a PoC, not every adapter.

---

## 5. Personas & scenarios

| Persona | Need | Scenario |
|---|---|---|
| Default adopter | Install, run, full flow | unchanged (G9) |
| Light customizer | Tweak gates/paths/models, skip a phase, set review count | one-line manifest edits |
| Quick-fixer | Small fix: one context, no subagents, lean phases | **S1** `profile: solo` |
| Deep customizer | Swap the planner; add a `bench` phase | **S2/S3** agent swap + `insert` |
| Spec-driven team | Start from a PRD; capture requirements first | **S4** optional `requirements` phase on |
| Architecture-led team | Enforce layering/dependency rules as a gate | **S5** architecture harness on |
| Issue-tracker shop | Backlog lives in Jira/GitHub Issues | **S6** backlog SoT adapter |
| Framework builder | Ship a local plugin built on forge | **S7** derived-plugin extension |
| Multi-model shop | Run reliably across a model class / on a budget model | **S8** model-resistance + fallback |
| Tooling-opinionated dev | Agents must read code via my LSP/RAG/RTK/Serena setup, not forge's | **S9** derived retrieval strategy |

---

## 6. The phase model

### 6.1 Abstract descriptor
```yaml
- id: validation                  # generic concern name (was: mutation)
  archetype: harness
  contract: harness               # engine-owned invariants, injected into every run
  procedure: forge:validation     # default body (override: swap the skill)
  role: forge:validation-triager  # default agent; swap freely — engine injects the contract around any role (§11).
                                  #   Optional for harnesses: omit for a gate-only concern that needs no AI triage (§2)
  execution: agent                # agent | inline                 (SP1 convention)
  model: sonnet                   # default model (override via models:)
  gate: "<harness gate>"          # the harness's own gate (see §8); engine runs it before the phase closes
  harness:                        # per-phase harness knobs (G6)
    tool: stryker                 # default technique for this concern
    scope: per-hunk
  consumes: [implementation]      # dependency edges …
  produces: [validation-report]   # … so the engine knows what a skip strands
  self_supply: []                 # consumed artifacts this phase can reconstruct itself if upstream
                                  #   is skipped. Empty here = a skipped producer strands validation →
                                  #   skip refused/flagged. Contrast the planner: `self_supply: [design]`
                                  #   (it explores when design is absent). See §6.2.
```

### 6.2 Dependency-aware skipping (generalizes "protected phases")
"Protected" stops being a static list and becomes a *computed* property of the dependency
graph + the hard core (§11). A skip is allowed **iff** every downstream consumer of the
skipped phase's `produces:` can self-supply that input — its descriptor's `self_supply:`
field (§6.1) names the consumed artifacts it can reconstruct itself (e.g. the planner
explores when no design exists). Otherwise the engine **refuses or loudly flags** — accountability
in the run record. This makes "every step can be skipped" true *and* safe.

### 6.3 Insert / reorder
`insert` places a descriptor (`after:`/`before:`); the new phase gets full engine
treatment. `reorder` is validated against the dependency graph (a consumer before its
producer is rejected by the same machinery as a bad skip). **[proposal]** insert+skip
first; arbitrary reorder later (OQ1).

### 6.4 Generic vocabulary **[SP4 decided — full SDLC]**
A phase `id` names the **engineering concern**; the concrete **technique** lives in
`harness.tool` or the phase probe (so "mutation" is a *tool*, not a phase). Decided
taxonomy (canonical table + harness family in SPIKE.md SP4):

`workspace`←branch · `requirements`←*(new, opt)* · `design` · `decisions`←adr ·
`planning`←plan · `implementation`←implement · `review` · **`validation`←mutation** ·
`architecture`←*(new, opt)* · `refactoring`←refactor · `documentation`←docs · `propose`←pr ·
`integrate`←merge.

Old names ship as **back-compat aliases** (manifest-lint resolves them; N1):
`branch, prd, adr, plan, implement, mutation, refactor, docs, pr, merge`. The rename is
executed in P4 (dirs + agents + orchestrator table).

---

## 7. Customization model — the injection catalog

Tiered by effort, so "few simple modifications → maximum power" is visible. Every point
ships a sample manifest in `examples/` (G10).

### Tier 0 — one line in `.claude/workflow.md`
| # | Point | Pros | Cons | Sample |
|---|---|---|---|---|
| 1 | **skip** a phase | trivial; dependency-checked | over-skipping erodes guarantees (flagged) | `pipeline: { skip: [refactoring] }` |
| 2 | **model** per agent | cheap model routing | wrong tier hurts quality | `models: { reviewer: opus }` |
| 3 | **gate** command | your harness, any tech | a weak gate weakens the floor | `gates: { phase: "make ci" }` |
| 4 | **execution** inline/agent | speed/token control | inline loses isolation | `phases: { documentation: { execution: inline } }` |
| 5 | **profile** | whole-flow mode in one word | coarse | `pipeline: { profile: solo }` |
| 6 | **harness config** | tune rigor per concern | mis-tuning over/under-verifies | `phases: { review: { harness: { max_cycles: 2 } } }` |
| 7 | **backlog source** | use your tracker | adapter must exist | `backlog: { source: github-issues }` |

### Tier 1 — add a file
| # | Point | Pros | Cons | Sample |
|---|---|---|---|---|
| 8 | **context file** (global/per-phase) | additive constraints, contract-safe | drift if unmaintained | `context: .claude/workflow/serena.md` |
| 9 | **override file** (procedure body) | full project-shaped procedure | you own that body; preamble still binds | `phases: { validation: { override: .claude/workflow/mut.md } }` |
| 10 | **agent/skill swap** | domain-specific behavior, contract still injected | your agent must do the job | `phases: { planning: { role: my:domain-planner } }` |
| 11 | **insert a phase** | new SE step, full guarantees | you supply its procedure | `pipeline: { insert: [{ after: implementation, phase: {…} }] }` |

### Tier 2 — a derived local plugin **(SP2 ✓ — confirmed GREEN)**
| # | Point | Pros | Cons | Sample |
|---|---|---|---|---|
| 12 | **extension surface** — register phases/agents/profiles/backlog-adapters from your own plugin | deepest power; shareable; versioned | most setup; depends on cross-plugin dispatch | `forge.extends: { phases: [./phases/bench.md] }` |

**SP2 confirmed cross-plugin dispatch works** (native `dependencies` + namespacing; SPIKE.md
Phase B) — so Tier 2 is real. A derived plugin declares `dependencies: ["forge"]` and ships
`pluginB:my-phase` + `pluginB:my-agent`; the repo manifest wires them in (descriptor lives
in the manifest, since a plugin cannot read another plugin's files). Vendored descriptors
remain only a fallback for a future runtime that lacks cross-plugin dispatch.

Mechanical (always available, any tier): repo `.claude/hooks` + lifecycle `scripts:` —
unforgettable rules + setup/teardown steps.

**Derived (not manually wired) — retrieval strategy:** how agents read code
(LSP/RAG/RTK/Serena/native) is sourced from project/user settings + auto-detected env,
then injected by the engine; declare `retrieval:` in the manifest only to override
detection. Never encoded in the plugin. See §10.1 (G14).

**Not injectable, deliberately:** the invariant core (§11). Changing it is an engine change.

---

## 8. Harnesses & per-phase AI-harness config (G6)

A harness phase exposes a `harness:` block. Defaults are strong; every knob is optional.
```yaml
phases:
  review:
    harness:
      dimensions: [code, security, tests, perf]  # which lenses
      passes: 1            # reviewers per dimension
      max_cycles: 3        # convergence cap
      convergence: low-only  # stop when only LOW remains (low-only | none | numeric threshold)
  validation:
    harness: { tool: stryker, scope: per-hunk, incremental: true }
  architecture:            # NEW concern (S5) — a STANDALONE harness phase, not a review dimension
    harness: { tool: dependency-cruiser, rules: .dependency-cruiser.json }
```
*One home per concern: architecture is a standalone harness phase (S5/P10), not a `review`
dimension.* This is the literal answer to "determine the number of reviews and the convergence
criteria (and other customization) — customize the AI harness per phase." The same shape
extends to any harness a repo adds.

---

## 9. Backlog Source-of-Truth abstraction (G7)

```yaml
backlog:
  source: file            # file | github-issues | jira | linear | custom   (SP6)
  ref: docs/BACKLOG.md    # file: the doc; github: repo; jira/linear: project key
```
A backlog **adapter** implements a tiny interface — `resolve(id) → brief` and
`complete(id, refs)` — so input resolution and the closing "tick" work against any
tracker. Default `file` reproduces today exactly. `github-issues` uses `gh`; `jira` uses
the Atlassian MCP (present in this environment); `linear` needs its own MCP or a `custom`
script (not present yet). `custom` points at a repo script. **SP6 (done, SPIKE.md)** pinned the `resolve`/`complete` contract per
source + the failure path (unreachable source = blocker, never a silent tick-skip).

---

## 10. Execution topology — how we expose inline vs sub-context (G4)

- **Field:** `execution: inline | agent` per phase (in the descriptor, manifest, and profiles).
  `agent` = today's delegated subagent. `inline` = the phase body runs in the session's
  own context, no subagent.
- **Profiles** bundle it: `solo` = all-inline + lean harnesses (S1); `full` = all-agent (default).
- **Spike SP1** pins the *convention*: how the engine runs a phase body inline while still
  injecting the contract and enforcing the gate, and what artifact-is-the-handoff means
  with no agent to die (likely relaxes to "the commit is the handoff" — same as a
  subagent's commit). Default stays `agent`; `inline` is opt-in for speed/tokens.

### 10.1 Code-access / retrieval strategy — derived, never encoded (G14)

*How* an agent reads and navigates code — LSP symbol tools, RAG/semantic search, the RTK
token proxy, Serena symbol navigation, or plain Read/Grep/Glob — is a **user/project
preference, not a forge opinion.** Plugin content (agent defs, skills) carries **zero**
retrieval-strategy text. The engine **derives** the strategy at run time and injects it,
most-specific-source first:
1. **Project settings** — manifest (`retrieval:`) or a repo context file / `.claude/settings.json`.
2. **Active environment capabilities** — auto-detected: Serena MCP active? LSP tool present? RTK hook installed? a RAG/index tool available?
3. **User preferences** — global CLAUDE.md / user settings (the session already carries these; subagents inherit harness defaults).
4. **Neutral default** — native Read/Grep/Glob. No preference = no opinion.

Two layers, two mechanisms:
- **Mechanical strategies apply automatically; forge only coexists, never assumes.** RTK
  rewriting and tool-call hooks fire at the tool layer and are inherited by subagents
  (spike-confirmed); forge's own hooks were written to compose with them (the git-mangler
  deny exists precisely for rtk coexistence).
- **Preference strategies are injected** as a derived retrieval-context (e.g. "prefer
  symbol tools over full-file reads"), assembled by the engine from the sources above —
  the same assembly path as the contract and the manifest `context:` files.

This keeps pre-chew tool-neutral: the plan's context block names *what* to read
(`file:line`, symbol names, signatures); the *how* comes from the derived strategy.
tsgit's existing `serena.md` repo context is the correct pattern already in practice
(preference in the repo, not the plugin) — G14 generalizes it into an engine capability
with detection + precedence and forbids any retrieval opinion leaking into plugin content.
**(SP7 ✓).**

---

## 11. The invariant core (the guiderail — non-negotiable)

Holds for every phase, profile, inserted step, and derived plugin:
- Never commit on a red gate. Never `--no-verify`. (hook + orchestrator)
- A gate must exist for code-producing phases.
- **Contract injection itself** — swap the agent, never drop the contract.
- **Artifact-is-the-handoff** (commit/artifact, never agent context).
- **Gate cadence** (targeted gate per fix; phase gate once per round).
- **Model resolution + fallback** and the **blocker protocol**.
- **Dependency graph honored** (skips/reorders that strand a consumer-without-fallback are refused/flagged).
- **The run record** logs every skip/insert/swap/inline/override/degradation — flexibility *with visible accountability*.
- **Adapter failure is a blocker, never a silent pass** — a backlog `resolve`/`complete`, a gate, or a model that cannot be reached escalates via the blocker protocol; the closing tick is never silently skipped.

**Inline carve-out.** Two invariants *transform* (not drop) under `execution: inline`,
because there is no separate agent: *artifact-is-the-handoff* becomes "the commit is the
handoff" (no agent context to lose), and *model resolution + fallback* collapses to the
session model (no spawn to re-target on a down model). SP1 enumerates the exact transform;
the run record marks the phase inline. Every other invariant binds verbatim.

The hard core **shrinks** (phase order + protected list leave it) but what remains becomes
**universal** (applies to inserted/derived phases too). A smaller, universal core is also
what makes the engine portable (§15).

---

## 12. Non-functional requirements

| NFR | Target | Levers | Verification |
|---|---|---|---|
| **G12-speed** Fast to deliver | small fixes complete in one context, no spawn round-trips; safe parallelism preserved | `solo`/`inline`; parallel harnesses; pre-chewed context (no re-exploration) | wall-clock on a fixed scenario set, tracked over time |
| **G12-tokens** Token efficient | minimize tokens/run; no redundant re-reads or re-exploration | progressive disclosure (load phase text just-in-time); artifact-by-path (no re-transcription); inline avoids spawn overhead; budget-aware | tokens/run on the scenario set; per-phase budget telemetry in the run record |
| **G12-model** Model resistant | runs reliably across a *model class* (**SP5: Claude Haiku-4.5 and up** — all contracts pass class-wide), degrades gracefully | model resolution + contract-safe fallback chain; contracts/prompts model-quirk-independent; gates mechanical | **SP5 done** (contract probes all-PASS); P13 adds the full-pipeline + output-quality matrix |
| **DX** Easy install/customize | one-command install; zero-config best-practice run; minimal-edit customization | strong defaults; mental model + injection catalog + samples | fresh-machine install test; "tailor task" usability checks |

These interact: `inline`/`solo` buys speed + tokens at the cost of isolation; the engine
owning enforcement (vs the model "remembering") buys model-resistance *and* portability.

---

## 13. Foundational — test harness, scenario suite, CI (G11)

**No tests exist today. Built first, before abstraction work**, as a characterization net:
- **Script tests** (bats/shell): `manifest-lint` (valid/invalid fixtures incl. the
  comma-in-array + quoting regressions; the old-name→new-phase alias-resolution fixture is
  added in P4 when the aliases ship), `plan-lint` (schema pass/fail), worktree
  setup/teardown (lock refusal, dead-PID auto-clear).
- **Hook tests:** deny/allow matrices via synthetic PreToolUse JSON on stdin.
- **Structural validation:** skills have the Preamble/Procedure split; agents have
  model+contract; templates parse; the default pipeline descriptor is consistent (acyclic
  dependency graph; every `consumes` has a `produces`).
- **Scenario suite (golden runs):** S1–S9 each captured as a fixture; assert the pipeline
  resolution + gate decisions (not LLM prose). This is "tested with different scenarios,
  strong, no regression so it can evolve easily."
- **`shellcheck`** clean; **GitHub Actions** runs all of the above on push/PR — forge gets
  the gate it imposes on others.
- **Acceptance:** characterization pins current behavior green before abstraction; stays
  green through the refactor except where a change is deliberate and re-baselined.

---

## 14. Spikes (pin unknowns first; record in `docs/SPIKE.md`)

- **SP1** Inline execution convention (G4) — **DONE (SPIKE.md): convention defined.** `inline` = the session runs the phase body itself (skills already run in-thread); same contract/gate/hooks; commit-is-the-handoff; session model. Load-bearing caveat: inline is *sequential* → multi-dimension harnesses stay `agent` (profiles encode it).
- **SP2** Cross-plugin extension/dispatch (G8) — **DONE & GREEN (SPIKE.md).** Confirmed empirically: a skill in plugin A invokes a skill *and* spawns an agent (namespaced `subagent_type`) in plugin B; rides native plugin `dependencies` + namespacing + per-plugin `${CLAUDE_PLUGIN_ROOT}`. No bespoke mechanism needed. (Open refinements, non-blocking: scoped `Agent()` allowlist form; same-marketplace symlinks.)
- **SP3** Per-invocation args (G4 · OQ2) — **DONE & GREEN (SPIKE.md).** `$ARGUMENTS` carries `--profile`/`--skip`/pipeline tokens verbatim in headless `-p` (flag tokens, comma-lists, embedded quotes all preserved). R9 cleared.
- **SP4** Generic vocabulary/taxonomy (G3) — **DONE & DECIDED (SPIKE.md): full-SDLC concern naming + mutation→validation + harness family.** Old names → aliases; rename executed in P4.
- **SP5** Model-class portability (G12-model) — **DONE (SPIKE.md): all contracts PASS across opus/sonnet/haiku → supported class = Haiku-4.5 and up.** Fallback proven contract-safe (degrades quality, never breaks a contract). Caveat: contract-adherence probes, not full-quality runs; output *shape* varies by model (pin/parse-robustly).
- **SP6** Backlog adapter interface (G7) — **DONE (SPIKE.md).** `resolve`/`complete` port; file/github-issues/jira/linear/custom adapters (gh + Atlassian MCP confirmed present); unreachable source = blocker, never a silent tick-skip.
- **SP7** Retrieval-strategy derivation (G14) — **DONE (SPIKE.md).** Plugin content verified strategy-free (grep empty); precedence project>env>user>native; `retrieval:` declaration primary + best-effort probe; CI lint enforces strategy-free (SC8).
- **SP8** VCS/integration port (G13) — **DONE (SPIKE.md).** `isolate`/`commit`/`propose`/`integrate`/`teardown` port pinned from the lifecycle scripts (lock-aware teardown; deps-in-isolation); worktree mechanism is the adapter's choice, not the contract.

---

## 15. Provider-agnostic future (G13) — feasibility & prior art

**Is it possible? Yes — and the genericity program is the path to it.** Forge's workflow
*definition* (phases, contracts, gates, dependency graph) is already portable: it is
declarative data + instruction text + shell gates. What is Claude-specific is the
**harness binding** — how a phase is executed: spawn a subagent, inject context, hook tool
calls, override the model, the `/forge:run` slash command, `${CLAUDE_PLUGIN_ROOT}`.

The clean architecture is the **hexagonal** convention defined in §2.1 — the same ports
the whole engine is built on, here viewed through the portability lens:
- **Engine core (provider-neutral):** pipeline walk, invariant enforcement, contract
  injection, gate discipline, dependency graph, harness config, model resolution, run record.
- **Adapter (per provider/runtime):** implements every port — *execution* (spawn/inline,
  inject context), *gate/tool-guard*, *model*, *backlog SoT*, *VCS/integration*. The
  **leading adapter is Claude Code** (forge today **is** that adapter). The **designated
  secondary adapter target is Pi** ([pi.dev](https://pi.dev) — minimal OSS harness, 15+
  providers with mid-session switching, SDK-embeddable, extension/skill system); other
  candidates: OpenCode, litellm, the Claude Agent SDK. A second adapter implementing the
  same ports makes forge multi-provider.
- **Code-access capability (environment-sourced port):** *read/navigate code* —
  LSP/RAG/RTK/Serena/native — fulfilled by whatever the runtime + project/user settings
  provide, never by the engine or any adapter (G14). A genuinely portable port: each
  runtime satisfies it with its own tools; forge stays opinion-free.

Crucial leverage: **every step that moves enforcement into the engine** (contract
injection §11, gate discipline, dependency graph) **shrinks the adapter** and moves us
toward portability. The harder part is that not all runtimes offer forge's primitives
(subagents, mechanical hooks, model override); where a runtime lacks them, the engine must
own that enforcement itself (gate wrappers instead of harness hooks) — which the
model-resistance goal already pushes us toward. So G13 is the *natural endpoint*, not a
bolt-on. **Pi (the secondary target) is exactly such a runtime** — it deliberately ships
no sub-agents, MCP, or permission gates ("primitives, not features") — so a Pi adapter
must supply *execution* and *gate/tool-guard* via Pi's SDK/extensions. That is the concrete
proof that pushing enforcement into the engine (P5) is what unlocks portability, and a live
input to SP1/SP2 (how a phase + its guard get registered and dispatched off-Claude).

**Does it exist already? The category is crowded; nothing occupies forge's exact niche.**

| Tool | What it is | Overlap | Gap vs forge |
|---|---|---|---|
| **Superpowers** (obra, 228k★) | opinionated SE methodology as editable markdown skills (brainstorm→plan→TDD subagents→review→finish); multi-host; marketplace | **closest ecosystem peer** — same workflow layer, Claude-Code-native, already multi-host | instruction-*followed*, not *mechanically enforced*; a fixed methodology you edit, not a composable engine with a small invariant core, PR-gating harnesses, and config-driven declination |
| **MetaGPT** / **ChatDev** | role-based "AI software company" (PM→architect→engineer→QA / CEO→CTO→programmer→reviewer→tester); SOP-encoded | closest conceptual cousin — phased SE roles, PRD-first | generate apps from a one-liner; heavyweight Python frameworks; not a customizable guiderail layered on *your* repo/harness with mechanical gates |
| **MoAI-ADK** | SPEC-First + TDD + agents, full transparent lifecycle, OSS | closest *philosophy* (spec-first, TDD) | examine as prior art / inspiration |
| **app.build** | model-agnostic, multi-layer validation pipelines, structured envs | the "validation harness" idea, model-agnostic | app-generation focus, not a general workflow engine |
| **TDFlow** | purely-TDD agentic workflow, context-engineered sub-agents | the implementation phase's TDD spine | single-concern; not a full pipeline |
| **OpenCode** | provider-agnostic terminal coding agent, 75+ providers | a possible *substrate/adapter target* | an agent, not a phased SE guiderail |
| **Pi** ([pi.dev](https://pi.dev)) | minimal OSS agent *harness*; 15+ providers, SDK-embeddable, extension/skill system; deliberately no sub-agents/MCP/gates | **the chosen secondary-adapter target** (harness layer, not a workflow rival) | a harness forge runs *on*, not a phased SE guiderail — its omitted primitives are supplied by the engine |
| **Praetorian "deterministic AI orchestration"** | ephemeral agents, gateway-curated context, hook-enforced workflows | almost forge's philosophy (artifact-handoff + mechanical enforcement) | platform/architecture writeup, not a packaged engine |
| LangGraph / AutoGen / CrewAI / Semantic Kernel / Haystack / Kestra | general agent-orchestration libraries, provider-agnostic | could *build* an engine | not opinionated SE guiderails out of the box |

**Differentiation to preserve:** a declarative, composable phase pipeline with a *small
hard invariant core*, *mechanical* gate enforcement, *zero-session-memory* discipline,
per-repo declination, harnesses (incl. architecture) that gate the PR, and strong
zero-config defaults — packaged as a plug-and-play plugin. That specific combination is
not on the shelf. (Worth a deeper prior-art pass on MoAI-ADK and MetaGPT's SOP design
before building §15.) **[research-followup]**

**Layering note — rules/toolkit collections are *inputs*, not rivals (reinforces G10/G14).**
Only the *workflow-methodology* layer (Superpowers) is a true peer. The layers below it
*feed* forge:
- **Rules/guideline packs** (e.g. Karpathy-skills — think-before-coding / simplicity /
  surgical-changes) → drop into a forge **`context:`** file, injected verbatim into every
  agent (and inline run).
- **Capability toolkits** (e.g. everything-claude — agents / commands / hooks / rules) →
  slot into existing injection points: agents via `role:` swap, scripts via `gates:`,
  commands/skills via an inserted phase, rules via `context:`, hooks via the repo's
  `.claude/hooks` (mechanical, automatic).

forge orchestrates *around* these; it never competes with them. Worked, runnable examples:
`examples/karpathy-as-context/` and `examples/everything-claude-toolkit/`.

---

## 16. Backward compatibility & migration
- Existing manifests lint and run unchanged; new keys additive; old phase names aliased.
- Default pipeline descriptor reproduces today's order/agents/models/`execution: agent` → identical zero-config behavior (SC1).
- Contract relocation (P5; the invariant is §11) must not change default-run behavior — characterization guards it.
- `docs/DESIGN.md` updated/split: living architecture (engine model) vs the now-historical migration record.
- Retrieval strategy never enters plugin content (G14); tsgit's `serena.md` repo context is the migration exemplar — repos keep declaring their strategy, forge stops assuming one.

---

## 17. Program breakdown (phased) + traceability

Each phase is shippable and (once the harness exists) itself forge-able (dogfood).

| # | Workstream | Resolves | Gate to next |
|---|---|---|---|
| **P0** | **Spikes** SP1–SP8 — **DONE** (SP2 ran first as highest-risk, cleared GREEN; record in SPIKE.md) | G3,G4,G7,G8,G12-model,G14,G13(SP8) | ✅ all resolved; findings folded in |
| **P1** | **Test harness + scenario suite + CI** (§13) — *build first* | G11 | green characterization of current behavior |
| **P2** | **Harden `manifest-lint`** (yq-based + fallback) under test | G11 (SC4), R5 | regression suite incl. historical bugs |
| **P3** | **Phase abstraction core** — descriptor + dependency graph; reproduce current pipeline (no behavior change) | G1 | SC1 green |
| **P4** | **Generic vocabulary** — full-SDLC rename (dirs+agents+orchestrator) + aliases (SP4 decided) | G3 | SC1 still green |
| **P5** | **Engine-owned injection** — relocate contract; **derive + inject retrieval strategy** (env/project; strategy-free plugin); thin agents | G5 (contract injection),G14 | SC1 still green + agent-output re-baseline (R8); SC8/S9 green |
| **P6** | **Execution topology** — `inline\|agent` + `solo`/`full` profiles | G4 (per SP1, SP3) | S1 green |
| **P7** | **Pipeline editing** — skip-any / insert / reorder + dependency checks | G1,G2 | S3, SC3 green |
| **P8** | **Per-phase harness config** — dimensions/passes/cycles/convergence/tool | G6 | review/validation knobs honored |
| **P9** | **Agent/skill swap** via manifest (contract from P5 injected around the swap) | G5 (swap UX) | S2 green |
| **P10** | **New default phases & agents** — optional **`requirements`** (new `requirements-writer` agent) + **`architecture`** harness (new `architecture-triager` agent); both default-off | G2,G3 | S4,S5 green |
| **P11** | **Backlog SoT abstraction** — adapter iface; file default; gh/jira/linear | G7 (per SP6) | S6 green |
| **P12** | **DX** — mental model guide + injection catalog + `examples/` samples (**two-part: Tier-0/1 docs now; Tier-2 docs after P14**) | G10 | tailor-task usability check (Tier-2 docs gated after P14) |
| **P13** | **NFR hardening** — speed + tokens + model-class matrix | G12 | targets met on scenario set (incl. S8 model-class) |
| **P14** | **Derived-plugin extension surface** | G8 (per SP2) | S7 green |
| **P15** | **Second-instantiation validation** (non-tsgit, zero manifest) + docs refresh | G9 | SC5 green → **ship** |
| **P16** | *(next program)* **Provider-agnostic** — ports/adapters boundary + non-Claude adapter PoC (**target: Pi**, pi.dev) | G13 | the Pi adapter runs a scenario |

Traceability check — every requirement lands: customize phases→P3/P7; interleave→P7;
optional PRD→P10; backlog SoT→P11; mental model+injection+samples→P12; review
count/convergence/harness config→P8; inline vs sub-context→P6; generic SE vocabulary +
architecture harness→P4/P10; tested/no-regression→P1; strong defaults→P3/P15;
fast→P6/P13; token-efficient→P6/P13; model-resistant→P5/P13; easy install/customize→P12/P15;
provider-agnostic→P16; retrieval-strategy (LSP/RAG/RTK/Serena) agnosticism→P5 (per SP7);
agent swap→P9 + contract injection→P5 (together = G5); derived-plugin extension→P14 (per
SP2); VCS/integration port→SP8 then P16; per-invocation args→P6 (SP3).

**Sequencing notes:** P0 is complete (all spikes resolved, §14). SP2 (the highest-risk one)
ran first and cleared GREEN, so G8/Tier-2 stands; the vendored-descriptors path (R1, SC9)
is retained only as the fallback for a future runtime lacking cross-plugin dispatch. P12's
Tier-2 documentation is still written only after P14 lands, so the catalog never advertises
an unproven surface.

---

## 18. Success criteria
- SC1. Zero-config run is behavior-identical to today (characterization).
- SC2. S1–S9 each run end-to-end with the invariant core intact.
- SC3. A skip that strands a consumer-without-fallback is refused/flagged.
- SC4. Test harness + CI green; `shellcheck` clean; manifest-lint regression suite covers historical bugs.
- SC5. A second, non-tsgit repo runs the default pipeline with no manifest.
- SC6. NFR targets (speed/tokens) tracked and met on the scenario set; model-class matrix green.
- SC7. A newcomer tailors the pipeline (skip + insert + harness tune) from the docs alone in one sitting.
- SC8. No retrieval-strategy string exists in plugin content; agents honor the environment-derived strategy (S9).
- SC9. A derived plugin registers a phase/agent that runs under the invariant core (S7/G8); vendored descriptors are the equivalent fallback for a future runtime lacking cross-plugin dispatch.

SC1–SC9 cover the in-program goals (G1–G12, G14; G8 via SC9; G6 via SC2 + the P8 gate). **G13/P16 is a next-program goal**; its
success — a non-Claude adapter PoC running one scenario end-to-end — is the P16 gate in
§17, deliberately outside this program's SCs.

## 19. Risks
- R1. ~~Cross-plugin extension may be unsupported~~ — **CLEARED** (SP2 Phase B confirmed dispatch works on native primitives; SPIKE.md). Vendored descriptors retained only as a fallback for runtimes lacking cross-plugin dispatch.
- R2. Inline erodes guarantees → SP1 defines contract+gate binding; default stays `agent`.
- R3. Contract relocation regresses defaults → P1 characterization built first to catch it.
- R4. Over-configuration dilutes the opinionated value → strong defaults + profiles + small firm core.
- R5. Manifest parser fragility compounds as schema grows → P2 hardening under test before new keys.
- R6. Vocabulary churn breaks existing manifests → aliases (P4) + lint coverage.
- R7. Provider portability blocked by missing primitives in other runtimes → engine owns enforcement; adapter shrinks; PoC validates feasibility before committing.
- R8. Characterization pins *mechanism*, not agent judgment — a contract relocation (P5) could degrade agent output while golden runs stay green → add a small fixed-prompt agent-output diff (or manual re-baseline) at P5.
- R9. ~~Per-invocation args may not survive headless/`-p`~~ — **CLEARED** (SP3: `$ARGUMENTS` verbatim in `-p`; flags/commas/quotes preserved; SPIKE.md).
- R10. Structured-output *shape* varies by model (SP5: Haiku emitted review findings as JSON, not one-per-line) → the engine must pin each harness's output format tightly or parse robustly across shapes (P5/P8); never assume one layout.

## 20. Open questions
- OQ1. Reorder freedom beyond insert/skip? (lean: insert/skip first)
- OQ2. Profiles per-invocation vs per-repo? (lean: both; invocation overrides)
- OQ3. Partial-inline phases (light parts in-session, heavy delegated)? (lean: per-phase binary first)
- OQ4. May derived plugins touch the invariant core? (lean: no)
- OQ5. ~~Split this PRD into PRD + ROADMAP docs?~~ **RESOLVED:** keep one unified doc through the build phases — §17 *is* the roadmap section and the doc is still navigable; split only if it later impedes navigation.
- OQ6. ~~Which providers/model-tiers define the supported "class"?~~ **RESOLVED (SP5):** the Claude class is **Haiku-4.5 and up** (all contracts hold class-wide); cross-*provider* class is a P16 question.
- OQ7. Run forge's own design/ADR phases on each workstream, or keep lightweight? (lean: dogfood from P3 once P1 exists)
