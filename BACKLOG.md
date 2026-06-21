# Craft — Backlog & Roadmap

> Craft is a Claude Code feature-delivery workflow engine, re-architected from a fixed
> 11-phase pipeline into a **customizable, hexagonal engine**: composable phases (skip /
> insert / reorder), strong zero-config defaults, a small invariant core, per-port
> customization.

> SoT — *intent:* `docs/PRD-customizable-engine.md` · *architecture:* `docs/DESIGN-customizable-engine.md`
> · *decisions:* `docs/adr/` · *build scripts:* `docs/PLAN-*.md` · *spikes:* `docs/SPIKE.md`

## Status — PRD program complete (P0–P16 ✅)

Every PRD goal (G1–G14) and success criterion (SC1–SC9) is discharged. **G13 met
2026-06-20** — a non-Claude provider (Gemini, via the Pi adapter) ran a construction phase
end-to-end (`docs/adapters/pi-poc-record.md`). The PRD defines **no P17**: §17 ends at P16,
itself tagged *"(next program)"*; anything beyond is un-PRD'd backlog (see *Candidate phases*).
**P17 delivered 2026-06-21** — the first post-PRD candidate: the Pi adapter is productized into a
`craft-pi` full-walk entrypoint + live `tool_call` guard wrapper (ADRs 093–095).
**P18 delivered 2026-06-21** — walk/parallelism enforcement: the resolver emits a `reviewPlan`
(`passes` + named `stop_rule`) on the review descriptor, so `passes`/`convergence` are engine-enforced
rather than walk-judgment, and a repeatable per-invocation `--harness <phase>.<knob>=<value>` overlay
lands at CLI-wins precedence (ADRs 096–099; discharges the re-parked ADR-064).

| Phase | What | ADRs |
|---|---|---|
| P0 | Spikes SP1–SP8 — feasibility decisions | — |
| P1 | Characterization net + Node engine core + scenario goldens | — |
| P2 | `manifest-lint` hardened (later folded into Node core) | — |
| P3 | Rewire live walk + fold manifest validation into Node core | 009–012 |
| P4 | Generic vocabulary (concern-named phases + alias map) | 013–014 |
| P5 | Engine-owned contract injection + DESIGN split | 015–019 |
| P6 | Execution topology — `inline\|agent` + `solo`/`full`/`lean` + per-invocation args | 020–023 |
| P7 | Pipeline editing — skip / insert / reorder + verbatim-procedure dispatch (SC3) | 024–027 |
| P8 | Per-phase harness config (deep-merged knobs) | 028–031 |
| P8.5 | Rename **forge→craft** + namespace propagation | 032–036 |
| P9 | Agent/skill swap via manifest (contract injected around the swap; S2) | 037–040 |
| P9.5 | Hardening batch — live role probe, nested-lockfile, ci glob, full-engine mutation baseline (80%) | 041–047 |
| P10 | New default phases — optional `requirements` + `architecture` harness (default-off; S4/S5) | 048–053 |
| P11 | Backlog SoT abstraction — `{ file, custom }` two-source port (S6) | 054–060 |
| P12 | DX — `GUIDE-customizing.md` + injection catalog + lint-clean `examples/` | 061–064 |
| P13 | NFR hardening — bin mutation coverage + model-class matrix | 065–068 |
| P13.5 | Ban-enforcement boundary — free `--no-verify` (consumer discretion) | 083 |
| P14 | Derived-plugin extension surface (`extends:`; S7/G8) | 069–075 |
| P15 | Second-instantiation — non-tsgit Python/pytest repo, zero-manifest (SC5/G9) | 076–082 |
| P16 | Provider-agnostic — six port seams + Pi adapter PoC; **G13 met** | 084–092 |
| P17 | Pi adapter productized — `craft-pi` full 11-phase walk bin + live `tool_call` wrapper (first post-PRD candidate) | 093–095 |
| P18 | Walk/parallelism enforcement — resolver emits a `reviewPlan` on the review descriptor (passes/convergence now engine-enforced) + repeatable per-invocation `--harness` overlay; discharges ADR-064 | 096–099 |

Per-slice history lives in `git log`, `docs/{DESIGN,PLAN}-P*.md`, and `docs/adr/` — not here.

**Standing invariants (the working contract):**
- **Data is the SoT, not prose.** `pipeline/default.yml` (the 13-descriptor table) is authoritative.
- Every phase is **dogfoodable** — runnable through `/craft:run` itself.
- Working style: sliced TDD, one slice per dedicated agent (or session-direct for judgment-fused
  sweeps); 4-dimension review interleaved, every fix applied before the next; **CI green at every
  commit; `--no-verify` is the consumer's discretion, the craft gate is not.**

---

## Candidate phases (un-PRD'd — promoted from parked)

Beyond the PRD program. Real features, scoped but unscheduled — each is a coherent `/craft:run`.

### P19 — "Nothing to do" as a first-class phase outcome (decisions + refactoring)

Make a clean no-op a **recorded, first-class** outcome for both judgment phases, symmetrically —
not an implicit skip. Today the two phases treat "nothing to do" unevenly:

- **decisions** — `skills/decisions/SKILL.md` only no-ops when design surfaces *zero* candidates
  ("No decision candidates? Skip honestly"). When candidates exist it forces a per-candidate user
  conversation, even where every recommendation is clear and aligns with existing ADRs/principles.
  It should be valid to **adopt clear recommendations without escalating** and record a
  "no user-judgment decisions" outcome, escalating only genuine forks.
- **refactoring** — `skills/refactoring/SKILL.md` already permits an honest no-op, but the no-op
  contract (what is recorded, how the run record/PR body phrases it) is not stated symmetrically
  with decisions.

Scope: align both skills + their phase docs so "nothing to do" is an explicit, justified,
recorded result (run-record line + PR-body note), and the orchestrator never reads a no-op as a
gap. No engine/descriptor change expected — this is phase-skill + docs wording. (Promoted from
session feedback 2026-06-20.)

### P20 — Definition-of-Done artifact + DoD-aware verification

Introduce an optional **Definition-of-Done (DoD) artifact** a repo can supply (alongside the
PRD/design), and make verification DoD-aware:

- **DoD artifact** — a declared, referenceable artifact (e.g. `docs/DOD.md` or a manifest
  `paths.dod`) listing the change's acceptance criteria. **If no DoD is set, raise a warning**
  (not a hard block — absence is allowed but surfaced).
- **Verification semantics** — verification should assert: (1) **architecture alignment** (the
  `architecture` phase's dependency-boundary check), (2) **engineering checks green** (gates /
  `validation`), and (3) **the DoD is met**. The DoD may *subsume* (1) and (2) — i.e. a repo's DoD
  can include "architecture clean + checks green" plus feature-specific criteria.

Scope: decide where DoD plugs in (a new `verify` concern, or folded into `validation`/`propose`
pre-gate), the warning-on-absence path, and how the DoD artifact is authored/consumed. Likely
touches the verification gate + a new optional artifact + docs. (Promoted from session feedback
2026-06-21.)

### P21 — Running craft in a loop (recipe/example, not an engine loop)

Explore driving craft iteratively (re-run against PRD + DoD + config until the DoD is met).
**Decision lean (user): ship an EXAMPLE/recipe of using craft in a loop rather than baking loop
semantics into the engine** — keeping the engine generic and the loop a composable, flexible outer
harness (the operator owns the loop, craft owns one pass). Scope: a documented recipe
(`docs/GUIDE-*` / `examples/`) showing an external loop that re-invokes `/craft:run` (or `craft-pi`)
with a DoD-driven stop condition; no engine change. Contrast with the alternative (engine-native
loop) and record why example-first wins (generality/flexibility). (Promoted from session feedback
2026-06-21.)

### P22 — Repo-local craft memory (self-improving per repo) — spike + build

A **memory local to the repository** that craft maintains and **improves after each run**, so each
subsequent run on that repo is better — higher quality, faster, fewer tokens, with recorded
improvements. The memory accumulates what craft learned about this repo (toolchain quirks, gate
commands, recurring review findings, slice-sizing that worked, cost/latency per phase) and feeds
the next run.

Scope: **spike first** (feasibility + shape: where it lives in-repo, what it records, how phases
read/write it, how it avoids staleness/poisoning), **then build**. Explicitly wanted in the repo as
a tracked task. Open questions for the spike: per-repo file vs `.claude/`-style store; what each
phase contributes; how to measure run-over-run improvement (quality/speed/tokens); guardrails so a
bad memory entry can't degrade a run. (Promoted from session feedback 2026-06-21.)

### P23 — Configurable policy hooks: always / ask / never (user + project precedence)

Expose **three configurable policy hooks** that govern what the craft plugin may do autonomously,
settable at **both user and project level with the same precedence rule as the manifest** (project
overrides user; per-invocation could override both, consistent with ADR-022 overlay precedence):

- **`always:`** — actions the plugin should always do without asking (auto-approved).
- **`ask:`** — actions the plugin must ask the user about before doing (confirmation gate).
- **`never:`** — actions the plugin must never do (hard prohibition).

This is craft's own permission/policy layer — the engine-level analogue of the harness's
"confirm before hard-to-reverse/outward actions" discipline, made declarative and per-repo/per-user
configurable. It dovetails with the headless role-less semantics (e.g. `integrate` stop-before-merge
becomes an `ask:`/`never:` policy rather than a hardcoded default) and with the HaaS framing
(a configurable policy seam is part of what makes craft a harness-as-a-service).

Scope: decide the config surface (manifest keys + user-level file, merged at the existing overlay
precedence), the vocabulary of nameable actions (push, merge, PR-create, external sends, file
deletes, …), how `ask:` surfaces to an interactive orchestrator vs a headless bin (in headless,
`ask:` ⇒ treat as `never:`/blocker unless pre-approved), and how each phase consults the policy.
Likely a new policy port + overlay logic following `cli-overlay.js`. (Promoted from session feedback
2026-06-21.)

### P24 — Rename the "slice" vocabulary to standard software-engineering terminology

The plan decomposes work into **slices** (one atomic TDD commit each). "Slice" reads as craft
jargon; replace it with a term closer to mainstream software-engineering vocabulary. Candidate
replacements to weigh in the design: **increment** (Scrum "potentially-shippable increment" — closest
fit), **work item**, or **work unit**. ("Vertical slice" is the actual industry term but keeps the
disliked word; "task" collides with issue-tracker tasks.)

Scope is a cross-cutting rename, not a one-file edit — it touches: `templates/plan.md` (`## Slice N`
headings), `scripts/plan-lint.sh` (keys on the `Slice` heading), the `craft:slice-implementer` agent
(name + `agents/` def + `skills/implementation`), `skills/planning`, the planner's output prose, and
the design/plan doc voice. The agent name and the lint keyword are load-bearing — the rename must stay
mechanically consistent across all of them in one pass. No engine-descriptor change expected (the
pipeline knows phases, not slices). Decide the exact term in that change's decisions phase. (Promoted
from session feedback 2026-06-21.)

---

## Parked

### Condition-gated (do when the trigger fires)

- **Migrate the `bats` suite to `node --test`** (user-requested, portability) — **evaluate first.**
  Worktree/hook scripts need real-process assertions (likely `node:test` + `child_process`); judge
  whether a JS port keeps shell-behavior fidelity before committing to the migration.
- **Extract an `extends-validation` module** (P14 refactor no-op) — pull the shared `checkFileRef`
  leaf + `validateExtends*` cluster out of `manifest.js` when validation grows further. Deferred
  because the cluster shares `checkFileRef` with the scripts/backlog/phases validators (needs the
  shared leaf first) and `manifest.js` is still under the 800-line max.
- **`backlog-lint` / `design-lint` structure lints** — the optional enforcing half of ADR-014
  (the `templates/backlog.md` template shipped at P4; the structure lint + bats fixtures did not).
- **Built-in per-tracker backlog adapter** (e.g. first-class `github-issues`) — rides the P14
  derived-plugin surface (a plugin shipping a backlog adapter); the repo-`custom`-script escape
  hatch (P11) already covers the tracker case today.
- **Single-source the harness-knob type schema** (P18 refactor follow-up) — the knob vocabulary is
  encoded twice: `coerceHarnessValue` (CLI coercion, `pipeline-resolve-main.js`) and `validateHarness`
  (typing, `manifest.js`) both enumerate `passes`/`max_cycles`/`convergence`/`incremental`/`dimensions`.
  A shared knob→type map would let coercion and validation derive from one declaration. Deferred at P18
  as feature-sized (its own design); do it when a knob is added or renamed and the duplication bites.

### Closed — won't-do (rationale recorded)

- **DC-9 registered-phase model seed** — *resolved by design, not implemented.* The walk
  model-resolution chain (`models.<role>` → `descriptor.model` → `models.fallback` → engine
  default `sonnet`) already resolves a model-less registered phase via fallback. Seeding a fixed
  `model` into `foldRegisteredPhases` would shadow `models.fallback` (a flexibility **regression**);
  inheriting the replaced default's tier violates ADR-073 (full-replace = no field inheritance).
  A registered phase that wants a tier sets it in its own descriptor or via `models.<role>`.
- **P13.5 broader scope (ban-split across every rule)** — the headline `--no-verify` question is
  resolved (P13.5/ADR-083). The remaining bans (`git-no-ext-diff` difftastic safety; contract
  provenance / suppression / swallowed-error bans) are *correctly* engine invariants; splitting
  adapter-mechanism from engine-invariant for them is unwarranted unless a consumer needs it.
- **Live `gh`/`jira` round-trip E2E** for the custom backlog recipes — a real `gh issue close` /
  Jira transition mutates a tracker and needs credentials CI lacks. The recipes are pinned
  empirically (read-only probes) + prose; a gated opt-in test is the home if ever wanted.
- **`backlog.id-pattern` manifest knob** (machine-enforced `file` id-form) — ADR-060: `file`
  id-form stays orchestrator prose-judgment until a repo actually needs the machine check. YAGNI.
