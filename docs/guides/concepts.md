# craft concepts — five frames on why it's shaped this way

An orientation layer, not a reference: five external ways of talking about agentic delivery,
each mapped onto the real craft mechanism it describes. Start here to recognize *why* the
pipeline, the harnesses, the manifest, and the human checkpoints look the way they do; go to
[customizing.md](customizing.md) for *how* to configure any of them.

craft's own vocabulary is what actually runs the system — review, validation, architecture,
policy, manifest, declination, verdict — and stays primary everywhere else in the docs. The
five external frames below are lenses *onto* that vocabulary, borrowed because each already
has a name for something craft does; none of them renames a phase, a port, a manifest key, or
an agent. Where an external term and a craft term collide, the craft term is the one you
configure, run, and grep for.

## How to read this guide

Each frame below borrows one external way of talking about agentic delivery — a shape other
people have already named — and maps it onto the craft mechanism that actually implements it.
The mapping table in each frame is the load-bearing part: every row names a real, current
mechanism and the doc that owns it, never an aspiration. The prose around each table is only
the framing; if a row and its owning doc ever disagree, the owning doc wins. Read the five
frames in order the first time — each adds a lens the next one assumes — then use the Rosetta
stone at the end as a lookup once the mapping has sunk in.

## Frame 1 — Karpathy: write the loop, not the prompt

The core claim: durable value comes from the *written-down loop* — gather, reason, act,
verify, on repeat — not from any single clever prompt. A loop that only lives in a chat
transcript dies with the transcript. craft externalizes the loop: it nests (a phase inside
a run, a review round inside a phase, RED→GREEN→REFACTOR inside a part), the roles that
execute each nested loop are deliberately separated so no one role accumulates enough
unchecked context to slop, and every hop's state lands on disk — never only in a model's
context — so a reset never costs the run its memory. Concretely: kill the session mid-plan and
a fresh `part-implementer` subagent picks the work back up from the last committed artifact —
the plan's pre-chewed context block — never from scrollback that no longer exists.

```
┌─ the run: 11-phase walk ───────────────────────────────────────────────┐
│                                                                        │
│  ┌─ the phase: e.g. review convergence rounds (≤ max_cycles) ────────┐ │
│  │                                                                   │ │
│  │  ┌─ the part: RED → GREEN → REFACTOR ───────────────────────────┐ │ │
│  │  │                                                              │ │ │
│  │  │   RED ──▶ GREEN ──▶ REFACTOR                                 │ │ │
│  │  │    ▲                                                         │ │ │
│  │  │    └── failed gate ──▶ respawn-from-artifact (never forward) │ │ │
│  │  └──────────────────────────────────────────────────────────────┘ │ │
│  └───────────────────────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────────────────────┘
```

| External concept | craft mechanism (real) | Owning doc / key |
|---|---|---|
| The loop, written down (gather → reason → act → verify) | the 11-phase pipeline walk `workspace → design → decisions → planning → implementation → review → refactoring → validation → documentation → propose → integrate`, driven by `skills/run` | [../../README.md](../../README.md); [../contributing/prd/DESIGN-customizable-engine.md](../contributing/prd/DESIGN-customizable-engine.md) §Orchestrator pipeline walk |
| Loops nest | review convergence rounds (`phases.review.harness.passes` / `max_cycles` / `convergence`); part-level RED→GREEN→REFACTOR (construction bundle); reset-on-red = never-commit-on-red + respawn-from-artifact | [customizing.md](customizing.md) §3 (harness config); [../contributing/prd/DESIGN-customizable-engine.md](../contributing/prd/DESIGN-customizable-engine.md) §Engine-owned contract injection; [customizing.md](customizing.md) §2 |
| Roles separated (Planner / Generator / Evaluator), each fresh-context | **Planner:** `requirements-writer`, `designer`, `planner` · **Generator:** `part-implementer`, `refactor-executor`, `docs-writer` (+ `backlog-ticker`) · **Evaluator:** `reviewer`, `harness-triager` — each a fresh-context subagent fed from the artifact | [../../agents/](../../agents/); [../contributing/prd/DESIGN-customizable-engine.md](../contributing/prd/DESIGN-customizable-engine.md) §Orchestrator pipeline walk (respawn-from-artifact) |
| State on disk, not in the model | zero session-memory dependence; the artifact chain brief → PRD → design → ADRs → parted plan (pre-chewed context blocks) → run record → Memory port; every hop survives a reset | [../../README.md](../../README.md) (opening); [customizing.md](customizing.md) §1–§2; [../contributing/specs/memory.md](../contributing/specs/memory.md) |
| Bounded state, threaded within a loop | the same artifact-over-transcript rule applied *inside* a phase: a multi-round intra-phase loop (e.g. review convergence) threads a bounded structured state — the normalized, status-tagged `Finding[]` plus the fix diff — never an accumulated transcript; a probe comparing bounded-state threading against full-transcript threading measured comparable quality at ~31% fewer output tokens (n=1, one synthetic diff, directional) | [skills/review](../../skills/review); [contracts/harness-read.md](../../contracts/harness-read.md) |
| The frame is generative | `/craft:prune` and the `hygiene.gate` stub/prose lints — both shipped out of the Karpathy-gist comparison | [../../skills/prune](../../skills/prune); [customizing.md](customizing.md) §3 (`hygiene.gate`) |

Read that last row as the frame closing on itself: comparing craft against an external loop
description didn't just relabel existing behaviour, it found a gap (nothing was pruning stale
rules or catching hollow prose) and produced the fix. That is the test for whether a frame
earns a place in this guide — it has to change what you'd build next, not only what you'd call
what already exists.

## Frame 2 — Böckeler: the harness taxonomy

A **harness**, in this frame, is an automated, repeatable check on a single concern — a gate
plus, optionally, an AI triage step. Harnesses split by what senses the failure: a
*computational* sensor is deterministic (a lint, a build, a test run); an *inferential*
sensor is a model judgment (a review pass, a triage read). craft's phases sort cleanly into
three harness families under this split, and the pattern closes on a wider claim: craft
itself is a harness, offered as a governed layer, that also hosts other harnesses as
pluggable sub-services underneath it. Concretely: a manifest that declares nothing at all for
`review` still runs both sensors — the AI dimension fan-out plus the gate at the end of each
round — because the two-sensor pattern lives in the phase archetype, not in any one tool a
repo happens to have installed.

| External concept | craft mechanism (real) | Owning doc / key |
|---|---|---|
| "Harness" = automated, repeatable verification of one concern (a gate + optional AI triage) | craft's **harness archetype** definition | [customizing.md](customizing.md) §1 |
| Computational sensor | lints + gates (`design-lint`, `plan-lint`, `manifest-lint`, `docs-structure-lint`, the hygiene lints) via the Gate port `run(cmd)` | [../../scripts/](../../scripts/); [../contributing/specs/gate.md](../contributing/specs/gate.md) |
| Inferential sensor | AI review dimensions + harness triage | [../../agents/reviewer.md](../../agents/reviewer.md); [../../agents/harness-triager.md](../../agents/harness-triager.md) |
| Behaviour harness | TDD gates (construction bundle RED→GREEN→REFACTOR + gate-before-commit) + `validation` phase; **feed-forward** = design/plan pre-chewed context blocks; **feed-back** = the phase gate + the never-commit-on-red floor | [../../skills/implementation](../../skills/implementation); [../../skills/validation](../../skills/validation); [customizing.md](customizing.md) §2 |
| Maintainability harness | `review` phase (inferential dimensions) + lints/hygiene gates (computational) + `refactoring` phase | [../../skills/review](../../skills/review); [../../skills/refactoring](../../skills/refactoring); [customizing.md](customizing.md) §3 |
| Architecture-fitness harness | `architecture` phase (probe → run → triage → gate) + the intention port (living pages as fitness pages; `INTENTION-DRIFT` as the sensor) | [../../skills/architecture](../../skills/architecture); [../contributing/specs/intention.md](../contributing/specs/intention.md) |
| Harness-as-a-Service | **sense a** — craft *is* a delivery harness offered as a governed, reusable layer; **sense b** — it *hosts* harnesses (review / validation / architecture) as pluggable sub-services; the seven native adapter bindings prove the ports are pluggable | [../../README.md](../../README.md) HaaS bullet + the Layout bindings table (linked, not copied) |

The taxonomy earns its keep in how it draws the line between a lint and a review dimension.
One is cheap, deterministic, and expected to run every cycle; the other is a judgment call
reserved for exactly the concerns a script cannot check. Harness-as-a-Service is what falls
out once every row above is read as an instance of the same two-sensor pattern: configure the
sensors per repo, and the pattern — gate plus optional AI triage — stays constant underneath.

## Frame 3 — configuration layers

Every customizable system tells the same precedence story: a small number of layers, each
one able to override the layer beneath it, and a floor none of them can touch. craft's
layers are engine defaults, user scope, project manifest, and per-invocation flags, in
that order of increasing precedence. Beneath all four sits the invariant floor — the set of
guarantees no layer, however specific, is allowed to weaken. Above the floor, everything
else is a knob: a short, named list of things you can point at, not a table worth
reproducing here. Concretely: a `--harness` flag on a single invocation outranks the same
knob set in the project manifest, which in turn outranks a user-scope default — the same fold
order applies whether the knob is a harness pass count, a model pin, or a policy verdict.

```
┌──────────────────────────────────────────────────────────────────────────┐
│ per-invocation flags   --config · --profile · --harness · --policy       │  ▲ wins
├──────────────────────────────────────────────────────────────────────────┤  │
│ project manifest       .claude/workflow.md · .claude/craft-<name>.md     │  │
├──────────────────────────────────────────────────────────────────────────┤  │
│ user scope             ~/.claude/craft-<name>.md · craft-policy.md       │  │
├──────────────────────────────────────────────────────────────────────────┤  │
│ engine defaults        capability probing (lockfile · test cmd · remote) │  │
└──────────────────────────────────────────────────────────────────────────┘  ▼ loses
════════════════════════════════════════════════════════════════════════════
 invariant floor — no layer reaches below this line: never-commit-on-red ·
 gate-must-exist · artifact handoff · contract injection
```

| External concept | craft mechanism (real) | Owning doc / key |
|---|---|---|
| Config precedence as layers | engine defaults (capability probing) **<** user scope (`~/.claude/craft-<name>.md`, `~/.claude/craft-policy.md`) **<** project manifest (`.claude/workflow.md` / `.claude/craft-<name>.md`) **<** per-invocation flags (`--config` / `--profile` / `--harness` / `--policy`) | [customizing.md](customizing.md) §Precedence; [../../README.md](../../README.md) *Use* |
| The invariant floor (what no layer touches) | never-commit-on-red; a gate must exist for code-producing phases; contract injection; artifact-is-the-handoff; gate cadence; model resolution + fallback; dependency graph honored | [customizing.md](customizing.md) §2 |
| The knobs | the injection verbs skip / model / gate / execution / profile / harness / backlog / memory / context / override / swap / insert — one line each, pointing to the catalog | [customizing.md](customizing.md) §3 (linked, not duplicated) |

> The per-knob precedence details (execution, model, `--config` two-scope fold, `--harness` /
> `--policy` grammar) are owned by [customizing.md](customizing.md) §Precedence —
> this guide states the layer story once and links there for the exact fold order per knob.

None of the three layers above engine defaults can be used to reach the floor. A user-scope
policy file, a project manifest, and a per-invocation `--harness` or `--policy` flag all resolve
into ordinary knobs — swap the agent, tune the harness, change who gets asked — never into a
way past never-commit-on-red or any of the other floor guarantees. That asymmetry is the whole
point of naming the layers as a stack: precedence answers "who wins when two settings touch the
same knob," and the floor answers a different question entirely — "which settings are not knobs
at all."

## Frame 4 — Osmani: inner loop, outer loop, the Verdict

Split ownership of the work in two: the agent owns the *inner loop* — the moment-to-moment
work of a phase, executing under whatever contract the engine injected. The human owns the
*outer loop*, which further splits into three sub-loops: constraints (what's installed
before the run even starts), sampling (which candidate gets ratified), and ownership (who
confirms the irreversible steps). Sitting over all of it is **the Verdict** — the quality
bar installed before a system is let loose on the world. craft's own vocabulary already
converged here: the Policy port literally names its settings *verdicts*. Concretely: an
unconfigured repo already lives inside this frame with zero manifest — `propose` and
`integrate` default to the `ask` verdict, so the ownership sub-loop's confirmation is never
silently skipped just because nobody configured one.

```
┌─ outer loop — human-owned ────────────────────────────┐
│                                                       │
│  constraints ──▶ sampling ──▶ ownership               │
│  (installed       (decision      (propose / integrate │
│   before the run)  candidates     confirmations       │
│                    → ADRs)        = the Verdict)      │
│                                                       │
│  ┌─ inner loop — agent-owned ──────────────┐          │
│  │  phase work under the injected contract │          │
│  └─────────────────────────────────────────┘          │
│                                                       │
└───────────────────────────────────────────────────────┘
                the Verdict ──▶ the world (propose / integrate)
```

| External concept | craft mechanism (real) | Owning doc / key |
|---|---|---|
| Inner loop (agent-owned) | the per-phase work: an agent executes the phase under the engine-injected contract | [../contributing/prd/DESIGN-customizable-engine.md](../contributing/prd/DESIGN-customizable-engine.md) §Orchestrator pipeline walk |
| Outer loop — constraints sub-loop | manifest + gates + policy installed **before** the run (`manifest-lint` at resolve; the gate floor; policy verdicts; the invariant floor) | [customizing.md](customizing.md) §2, §5; [../contributing/specs/policy.md](../contributing/specs/policy.md) |
| Outer loop — sampling sub-loop | decision candidates ratified in the `decisions` phase (ADRs); phase gates per round | [../../skills/decisions](../../skills/decisions); [../../skills/design](../../skills/design) |
| Outer loop — ownership sub-loop | propose / integrate confirmations (`propose` and `integrate` default to the `ask` verdict) | [../contributing/specs/policy.md](../contributing/specs/policy.md) |
| "Approved scenarios" / the Verdict | the Policy port names its `always` / `ask` / `never` settings **verdicts** (vocabulary already converged) — with the three engine floors (`never-commit-on-red`, `validation-triage-gates-propose`, `artifact-handoff`) deliberately un-nameable | [../contributing/specs/policy.md](../contributing/specs/policy.md) |

Splitting the outer loop into three sub-loops pays off when something goes wrong: a bad
outcome traces to exactly one of them — a constraint that should have been installed but
wasn't, a decision that should have been ratified but wasn't, or a confirmation that should
have paused the run but didn't. The Verdict frame names that failure mode before it happens,
which is also why the three engine floors stay outside the Policy port's vocabulary — a
verdict you can name is a verdict you could eventually set to `always`, and some things are not
supposed to be nameable that way.

## Frame 5 — Fowler: the orchestrator's tax

The core claims: subagents exist to protect the orchestrator's own working memory; context
pollution taxes every later turn even when the window still has room to spare; and stating
one missing fact usually beats encoding a decision procedure for finding it. craft already
lived inside part of this frame before the change that added this section: every phase runs a
fresh-context role agent (Frame 1's *Roles separated* row), the artifact is the handoff
(`contracts/core.md:2`), the pre-chew mandate keeps a callee from re-exploring what the caller
already resolved (`contracts/producer.md:3`), and a review round already threads bounded
`Finding[]` state instead of a transcript, measured at ~31% fewer output tokens (Frame 1's
*bounded state* row, `contracts/harness-read.md`). What did not exist before is protection for
the *orchestrator's own* memory across phase boundaries and harness runs, rather than a role
agent's memory within one turn: an on-disk ledger that survives a session reset instead of
living only in scrollback, a digest that keeps a full harness run's raw output out of the
triager's context, and an advisory that catches the same fact declared twice before a human
reads it twice. Frame 1's closing paragraph already sets this guide's bar for a new section —
*"it has to change what you'd build next, not only what you'd call what already exists"* — and
these three mechanisms clear it: none of them existed before this change produced them.
Concretely: running `plan-lint` over this very plan warns that `contracts/core.md` is declared
in Part 1 and Part 2 — advisory only, exit code unchanged — instead of a human noticing the
duplication by reading both parts side by side.

| External concept | craft mechanism (real) | Owning doc / key |
|---|---|---|
| Protect the orchestrator's own memory across a reset | the run record's on-disk ledger — an append-only `.claude/craft-run-record.md`, orchestrator-only writer, one append per phase boundary, run-local and never committed | [../contributing/specs/run-record.md](../contributing/specs/run-record.md); [../../skills/run](../../skills/run) |
| Pollution taxes every later turn, even with room to spare | the digest at the validation boundary — `engine/bin/filter-findings.js` (`parseScopeSpec` / `filterFindings` in `engine/src/findings.js`), piped from the normalizer so only the change-scoped, structured slice ever reaches the triager's context | [../../contracts/harness-exec.md](../../contracts/harness-exec.md); [../../skills/validation](../../skills/validation) |
| State the one missing fact, don't make the reader re-derive it | the plan-lint cognitive-locality advisory — one warning line when the same backticked path is declared across two parts, so the duplication is named instead of left for a human to notice | [../../engine/bin/plan-lint.js](../../engine/bin/plan-lint.js); [customizing.md](customizing.md) |

Read the three rows as the tax paid at three different seams: a session reset, a harness run,
and a plan review. Each mechanism is cheap in isolation — a ledger append, a stdout filter, a
set intersection — and each exists because paying that cost once, mechanically, beats an
orchestrator re-deriving the same fact from a bigger blob of context on every later turn.

## Rosetta stone

A closing cross-reference for readers who arrive already fluent in one of the five frames —
skim it first, then open the frame section above for the full mapping and its owning doc:

| External term | craft mechanism | Where configured |
|---|---|---|
| The loop, written down | the 11-phase pipeline walk | `skills/run` |
| Roles (Planner / Generator / Evaluator) | per-phase role agents | `agents/` |
| State on disk | artifact chain + Memory port | [../contributing/specs/memory.md](../contributing/specs/memory.md) |
| Harness | the harness archetype | [customizing.md](customizing.md) §1 |
| Computational / inferential sensor | lints+gates / AI review+triage | [../contributing/specs/gate.md](../contributing/specs/gate.md); [../../agents/reviewer.md](../../agents/reviewer.md) |
| Harness-as-a-Service | craft-as-harness + hosted sub-harnesses | `../README.md` HaaS bullet + bindings table |
| Config layers | engine < user < manifest < per-invocation | [customizing.md](customizing.md) §Precedence |
| The floor | the invariant core | [customizing.md](customizing.md) §2 |
| Inner loop / outer loop | phase work vs. manifest/gates/policy | [../contributing/specs/policy.md](../contributing/specs/policy.md) |
| The Verdict | Policy `always` / `ask` / `never` | [../contributing/specs/policy.md](../contributing/specs/policy.md) |
| The orchestrator's tax | on-disk run-record ledger + validation boundary digest + plan-lint locality advisory | `.claude/craft-run-record.md`; [../../skills/validation](../../skills/validation); `engine/bin/plan-lint.js` |

## Sources

The five frames above are grounded in these seven URLs, cited verbatim rather than paraphrased:

- <https://gist.github.com/sanchez314c/a767997b030d2904c0d0f08fabae2d42> — Karpathy-Michaels CLAUDE.md + LOOPS.md
- <https://x.com/Vtrivedy10/status/2031408954517971368>
- <https://martinfowler.com/articles/exploring-gen-ai/13-role-of-developer-skills.html> — Böckeler
- <https://thoughtworks.com/en-de/radar/techniques/architectural-fitness-function>
- <https://lexler.github.io/augmented-coding-patterns/patterns/approved-scenarios/>
- <https://addyosmani.com/blog/own-the-outer-loop/> — Osmani
- <https://martinfowler.com/articles/orchestrator-tax.html> — Fowler, the orchestrator's tax
