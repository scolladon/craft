# Design — communication revamp: the four-frames orientation layer

> Brief: add `docs/GUIDE-concepts.md`, an orientation layer that rephrases craft's existing
> mechanisms through four industry-recognized frames (Karpathy · Böckeler · Osmani · config
> layers), so a reader arriving with those mental models maps craft on sight — plus small,
> scoped ripples to README, GUIDE-customizing, and the living-corpus enumerator + its test pin.
> Status: draft → self-reviewed ×3 → accepted

## Context

### What exists today

craft's documentation is craft-native throughout. Four surfaces carry the load:

- **`README.md`** — the entry point: *Why craft* bullets, the HaaS bullet, and the *Layout*
  table (including the seven-row adapter-bindings table).
- **`docs/GUIDE-customizing.md`** — the **task-oriented** living page: the mental model
  (§1 hexagon · ports · zero-config), the invariant floor (§2), the full injection catalog
  (§3, twelve points), and the precedence section. It answers *"how do I customize craft?"*
- **`docs/DESIGN-customizable-engine.md`** — the **living engine architecture** SoT: the
  hexagon, the ports table, the phase-descriptor schema, the enforcement hierarchy, the
  orchestrator pipeline walk.
- **`docs/adapters/*.md`** — one port-contract spec each (`policy`, `intention`, `gate`,
  `memory`, `model`, `execution`, `vcs`, `backlog`, `telemetry`).

The **living corpus** is enumerated in exactly one place — `scripts/living-corpus.sh` —
consumed by `scripts/ci.sh` and two tests (`test/living-corpus.test.js` pins the exact set;
`test/intention-lint-ci.test.js` runs `intention-lint` over it and asserts
`craft-intention: OK`). The **intention port** (`docs/adapters/intention.md`) freshness-guards
corpus pages that declare `subjects:` frontmatter; a corpus page **without** `subjects` is an
advisory skip, never an error.

### The gap this closes

A reader who already thinks in Karpathy's *write-the-loop* / roles / state-on-disk model, in
Böckeler's *harness taxonomy*, or in Osmani's *inner/outer loop + the Verdict* has to
reverse-engineer craft to discover that craft already **is** those things. There is no
orientation layer that maps the external vocabulary onto craft's real mechanisms. This feature
adds that layer — *narrative + mapping tables* — without renaming a single craft term.

### Settled inputs (ratified by the user — do NOT re-open as decision candidates)

1. **Placement** — a new top-level slug doc `docs/GUIDE-concepts.md` (orientation: *"why craft
   is shaped this way"*); README gets a short mental-model hook; GUIDE-customizing cross-links.
   GUIDE-customizing stays task-oriented; the two are complementary, not overlapping.
2. **Vocabulary** — craft-native terms stay primary (review / validation / architecture /
   policy / manifest / declination …). External terms appear only as framing prose plus one
   Rosetta-stone table. No renames of any manifest key, skill, agent, or ADR term.
3. **Corpus membership** — GUIDE-concepts joins the living corpus (enumerator + the pinned
   `EXPECTED` set). *How* it joins the enumerator is a decision candidate below (DC-1).

### Constraints carried in

- Every mapping row must name a **real, current** mechanism sourced from the docs above — no
  invented behaviour.
- Change set is **docs + the two corpus files only**: no engine, agent, skill, or hook body
  changes.
- No archiving or file moves: GUIDE-concepts is a **slug doc** (no dated `-P<n>-` / `SC5-*` /
  `SPIKE` pattern), so it lives at `docs/` and passes `docs-structure-lint.sh` unchanged.
- The two authoritative living pages (GUIDE-customizing §3 catalog, DESIGN-customizable-engine
  hexagon/ports tables) are **linked, never duplicated** — GUIDE-concepts is the orientation
  layer above them.

## Requirements

What must be true when this ships (verifiable):

- **R1 — the guide exists, orientation-sized.** `docs/GUIDE-concepts.md` exists, ~200–350
  lines, readable in one sitting; it orients and links, it does not re-host any reference
  catalog or table owned by GUIDE-customizing / DESIGN-customizable-engine.
- **R2 — four frames, each narrative + mapping table.** One section per frame; each opens with
  short narrative prose and closes with a mapping table of *external concept → real craft
  mechanism → owning doc/manifest key*. Every mechanism named exists in the current repo.
- **R3 — closing sections.** A single **Rosetta-stone** table (external term ↔ craft mechanism
  ↔ where configured) and a **Sources** section citing the six URLs from the brief.
- **R4 — vocabulary invariant.** craft-native terms remain primary; external terms appear only
  as framing + the Rosetta table; zero renames anywhere in the repo.
- **R5 — ripples land.** README gains a 3–4 line mental-model hook after the *Why craft* bullets
  linking GUIDE-concepts; GUIDE-customizing cross-links GUIDE-concepts from §1 and frames its
  precedence section as the four-layer story (existing content unchanged, framing added).
- **R6 — corpus membership.** `scripts/living-corpus.sh` emits `docs/GUIDE-concepts.md`, and
  `test/living-corpus.test.js`'s `EXPECTED` set is updated to the 25-entry pinned set; both stay
  in lock-step (the enumerator output equals the pin).
- **R7 — all lints/tests green.** `design-lint` (this doc), `docs-structure-lint`,
  `backlog-lint`, and `manifest-lint` stay green; the full test suite is green, including the
  updated `living-corpus` pin and `intention-lint-ci` (`craft-intention: OK` over the new
  corpus).
- **R8 — bounded change.** No engine / agent / skill / hook body is modified; the diff is
  GUIDE-concepts (new) + README + GUIDE-customizing + `living-corpus.sh` + `living-corpus.test.js`.

## Design

### Guide structure — `docs/GUIDE-concepts.md`

H1 + a one-line orientation subtitle, then four frame sections, then Rosetta + Sources. Each
mapping table's rows are pinned below to **real** mechanisms; the writer expands the narrative,
never the fact set.

1. **ASCII diagrams** — one per frame (1, 3, 4), placed immediately after that frame's narrative
   and before its mapping table, in the house ASCII box-diagram style already used in
   GUIDE-customizing.md §1 (fenced code block, no language tag).

**Frame 1 — Karpathy: write the loop, not the prompt.** Narrative: craft's value is the
*written-down loop*, not any single prompt; loops nest; roles are separated to fight slop;
state lives on disk so every hop survives a context reset.

| External concept | craft mechanism (real) | Owning doc / key |
|---|---|---|
| The loop, written down (gather → reason → act → verify) | the 11-phase pipeline walk `workspace → design → decisions → planning → implementation → review → refactoring → validation → documentation → propose → integrate`, driven by `skills/run` | README; DESIGN-customizable-engine §Orchestrator pipeline walk |
| Loops nest | review convergence rounds (`phases.review.harness.passes` / `max_cycles` / `convergence`); part-level RED→GREEN→REFACTOR (construction bundle); reset-on-red = never-commit-on-red + respawn-from-artifact | GUIDE-customizing §3 (harness config); DESIGN §Engine-owned contract injection; GUIDE-customizing §2 |
| Roles separated (Planner / Generator / Evaluator), each fresh-context | **Planner:** `requirements-writer`, `designer`, `planner` · **Generator:** `part-implementer`, `refactor-executor`, `docs-writer` (+ `backlog-ticker`) · **Evaluator:** `reviewer`, `harness-triager` — each a fresh-context subagent fed from the artifact | `agents/`; DESIGN §Orchestrator walk (respawn-from-artifact) |
| State on disk, not in the model | zero session-memory dependence; the artifact chain brief → PRD → design → ADRs → parted plan (pre-chewed context blocks) → run record → Memory port; every hop survives a reset | README (opening); GUIDE-customizing §1–§2; `docs/adapters/memory.md` |
| The frame is generative | `/craft:prune` and the `hygiene.gate` stub/prose lints — both shipped out of the Karpathy-gist comparison | `skills/prune`; GUIDE-customizing §3 (`hygiene.gate`) |

**Frame 2 — Böckeler: the harness taxonomy.** Narrative: define *harness*; distinguish
computational vs inferential sensors; then place craft's phases into the three harness families;
close on HaaS.

| External concept | craft mechanism (real) | Owning doc / key |
|---|---|---|
| "Harness" = automated, repeatable verification of one concern (a gate + optional AI triage) | craft's **harness archetype** definition | GUIDE-customizing §1 |
| Computational sensor | lints + gates (`design-lint`, `plan-lint`, `manifest-lint`, `docs-structure-lint`, the hygiene lints) via the Gate port `run(cmd)` | `scripts/`; `docs/adapters/gate.md` |
| Inferential sensor | AI review dimensions + harness triage | `agents/reviewer`, `agents/harness-triager` |
| Behaviour harness | TDD gates (construction bundle RED→GREEN→REFACTOR + gate-before-commit) + `validation` phase; **feed-forward** = design/plan pre-chewed context blocks; **feed-back** = the phase gate + the never-commit-on-red floor | `skills/implementation`, `skills/validation`; GUIDE-customizing §2 |
| Maintainability harness | `review` phase (inferential dimensions) + lints/hygiene gates (computational) + `refactoring` phase | `skills/review`, `skills/refactoring`; GUIDE-customizing §3 |
| Architecture-fitness harness | `architecture` phase (probe → run → triage → gate) + the intention port (living pages as fitness pages; `INTENTION-DRIFT` as the sensor) | `skills/architecture`; `docs/adapters/intention.md` |
| Harness-as-a-Service | **sense a** — craft *is* a delivery harness offered as a governed, reusable layer; **sense b** — it *hosts* harnesses (review / validation / architecture) as pluggable sub-services; the seven native adapter bindings prove the ports are pluggable | README HaaS bullet + the Layout bindings table (linked, not copied) |

**Frame 3 — configuration layers.** Narrative: the precedence story told once as four layers,
then the floor no layer can touch, then the knobs (pointing at the catalog, not copying it).

| External concept | craft mechanism (real) | Owning doc / key |
|---|---|---|
| Config precedence as layers | engine defaults (capability probing) **<** user scope (`~/.claude/craft-<name>.md`, `~/.claude/craft-policy.md`) **<** project manifest (`.claude/workflow.md` / `.claude/craft-<name>.md`) **<** per-invocation flags (`--config` / `--profile` / `--harness` / `--policy`) | GUIDE-customizing §Precedence; README *Use* |
| The invariant floor (what no layer touches) | never-commit-on-red; a gate must exist for code-producing phases; contract injection; artifact-is-the-handoff; gate cadence; model resolution + fallback; dependency graph honored | GUIDE-customizing §2 |
| The knobs | the injection verbs skip / model / gate / execution / profile / harness / backlog / memory / context / override / swap / insert — one line each, pointing to the catalog | GUIDE-customizing §3 (linked, **not** duplicated) |

> The per-knob precedence details (execution, model, `--config` two-scope fold, `--harness` /
> `--policy` grammar) are owned by GUIDE-customizing §Precedence — the guide states the layer
> story once and links there for the exact fold order per knob.

**Frame 4 — Osmani: inner loop, outer loop, the Verdict.** Narrative: the agent owns the inner
loop; the human owns the outer loop (three sub-loops); the Verdict is the quality bar installed
before the system is let loose — and craft's policy port literally calls its settings *verdicts*.

| External concept | craft mechanism (real) | Owning doc / key |
|---|---|---|
| Inner loop (agent-owned) | the per-phase work: an agent executes the phase under the engine-injected contract | DESIGN §Orchestrator pipeline walk |
| Outer loop — constraints sub-loop | manifest + gates + policy installed **before** the run (`manifest-lint` at resolve; the gate floor; policy verdicts; the invariant floor) | GUIDE-customizing §2, §5; `docs/adapters/policy.md` |
| Outer loop — sampling sub-loop | decision candidates ratified in the `decisions` phase (ADRs); phase gates per round | `skills/decisions`; `skills/design` (candidate emission) |
| Outer loop — ownership sub-loop | propose / integrate confirmations (`propose` and `integrate` default to the `ask` verdict) | `docs/adapters/policy.md` |
| "Approved scenarios" / the Verdict | the Policy port names its `always` / `ask` / `never` settings **verdicts** (vocabulary already converged) — with the three engine floors (`never-commit-on-red`, `validation-triage-gates-propose`, `artifact-handoff`) deliberately un-nameable | `docs/adapters/policy.md` |

**Rosetta stone (closing table).** One compact table — external term ↔ craft mechanism ↔ where
configured — distilled from the four frames (loop→pipeline walk; roles→agents; state-on-disk→
artifact chain + Memory port; harness→archetype; computational/inferential→gates/AI-triage;
HaaS→README bullet + bindings; config layers→precedence; floor→§2; inner/outer loop→phase work
vs. manifest/gates/policy; the Verdict→Policy `always/ask/never`).

**Sources (closing section).** Cite the six URLs verbatim from the brief:
`gist.github.com/sanchez314c/a767997b030d2904c0d0f08fabae2d42` (Karpathy-Michaels CLAUDE.md +
LOOPS.md) · `x.com/Vtrivedy10/status/2031408954517971368` ·
`martinfowler.com/articles/exploring-gen-ai/13-role-of-developer-skills.html` (Böckeler) ·
`thoughtworks.com/en-de/radar/techniques/architectural-fitness-function` ·
`lexler.github.io/augmented-coding-patterns/patterns/approved-scenarios/` ·
`addyosmani.com/blog/own-the-outer-loop/` (Osmani).

### Corpus-membership mechanism (empirically pinned)

`scripts/living-corpus.sh` currently emits **24** paths (verified: `bash
scripts/living-corpus.sh | wc -l` = 24 on this branch). Its second `find` clause is a
**deliberate whitelist** — it globs `DESIGN-*.md` but names `DOD.md` and `GUIDE-customizing.md`
explicitly. Adding `docs/GUIDE-concepts.md` yields **25** paths; because output is
`LC_ALL=C`-sorted, the new entry sorts **between** `docs/DOD.md` and `docs/GUIDE-customizing.md`:

```
docs/DOD.md
docs/GUIDE-concepts.md      ← inserted
docs/GUIDE-customizing.md
```

Both the enumerator edit (DC-1) and `EXPECTED` in `test/living-corpus.test.js` gain this exact
line. Because GUIDE-concepts declares **no** `subjects:` frontmatter (DC-2), it is an advisory
skip for the intention port, so `test/intention-lint-ci.test.js` still asserts
`craft-intention: OK` over the widened corpus.

### Ripple edits

- **`README.md`** — a 3–4 line "mental model" paragraph immediately after the *Why craft*
  bullets, linking `docs/GUIDE-concepts.md` (form/placement = DC-3). The *Why craft* bullets keep
  their current claims; no HaaS/Layout table is duplicated (GUIDE-concepts links them instead).
- **`docs/GUIDE-customizing.md`** — a cross-link to GUIDE-concepts from §1 (orientation vs.
  task), and a one-line framing lead-in on the precedence section recasting it as the
  four-layer story. **Content unchanged** — framing only.
- **`scripts/living-corpus.sh`** + **`test/living-corpus.test.js`** — per the pinned matrix above.

## Decision candidates

| # | Choice | Alternatives (≤3) | Recommendation | Why |
|---|---|---|---|---|
| DC-1 | How `living-corpus.sh` enrolls the new guide | (a) explicit filename — add `-o -name 'GUIDE-concepts.md'` to the existing whitelist clause · (b) widen `GUIDE-customizing.md` → `GUIDE-*.md` glob · (c) enumerate a `GUIDE-*.md` glob but keep the test pin explicit | **(a) explicit filename** | Matches the enumerator's existing house pattern (GUIDE/DOD are whitelisted by name, only DESIGN/adapters are globbed); keeps corpus membership a deliberate, greppable, fail-loud decision rather than auto-enrolling any future `GUIDE-*.md` into the intention corpus |
| DC-2 | Whether GUIDE-concepts declares `subjects:` frontmatter | (a) no frontmatter — advisory-only corpus member · (b) broad `subjects:` (freshness-guarded) · (c) narrow `subjects:` naming only itself | **(a) no `subjects:`** | It is an orientation layer over the *whole* engine — any broad glob would over-flag `INTENTION-DRIFT` on nearly every change; keeping it subjects-free is a legitimate, intended steady state and keeps `intention-lint-ci` green |
| DC-3 | Form of the README hook | (a) a standalone 3–4 line paragraph after the *Why craft* bullets, no new heading · (b) a new `## The mental model` H2 section · (c) fold a sentence into the existing *Customize* pointer | **(a) standalone paragraph, no new H2** | Honors the ratified "after Why craft" placement, preserves README's heading rhythm, and keeps the hook a lightweight pointer rather than a competing section |

## Test strategy

The guide body is **prose**, so the load-bearing mechanical regression is the
**corpus-membership pin**, not the guide's content:

- **`test/living-corpus.test.js`** — the pinned `EXPECTED` set must equal the enumerator output
  (25 entries incl. `docs/GUIDE-concepts.md`, `LC_ALL=C`-sorted, no duplicates). This is the one
  test that fails loudly if the enumerator edit and the pin drift apart. Verified base state:
  `bash scripts/living-corpus.sh` = 24 lines today; the change moves both to 25 together.
- **`test/intention-lint-ci.test.js`** — consumes the enumerator dynamically and asserts
  `craft-intention: OK` over the corpus; the no-`subjects` posture (DC-2) keeps it green, so this
  test also guards that GUIDE-concepts carries no malformed frontmatter.
- **`scripts/docs-structure-lint.sh`** — asserts no dated closed-program doc sits outside
  `docs/archive/`; the slug `GUIDE-concepts.md` is not a dated pattern, so it passes (verified
  against the lint's `case` rules).
- **`scripts/design-lint.sh`** — this design doc must present the six required headings.
- **`scripts/manifest-lint.sh` / `scripts/backlog-lint.sh`** — untouched surfaces; expected
  unchanged-green (no manifest or backlog schema change).
- **Full suite** — green after the change; no new test is warranted for the prose ripples
  (README / GUIDE-customizing) — they carry no executable contract; their correctness is
  link-integrity + review, and their *facts* are the same real mechanisms this doc pins.

## Out of scope

- **Any engine / agent / skill / hook behaviour change** — this is a documentation feature; the
  only non-doc edits are the two corpus files (enumerator + its pin).
- **Renames** — no manifest key, skill, agent, or ADR term is renamed (ratified vocabulary
  decision); external terms never become primary.
- **Archiving or file moves** — no slug doc is moved or archived; GUIDE-concepts is born at
  `docs/` and stays live.
- **Duplicating owned reference material** — the injection catalog (GUIDE-customizing §3), the
  hexagon/ports tables (DESIGN-customizable-engine), and the HaaS/Layout bindings table (README)
  are linked, never re-hosted, to avoid a second source of truth.
- **Subjects-driven freshness adoption for GUIDE-concepts** — declaring `subjects:` to make the
  guide a freshness-guarded fitness page is deferred (DC-2 recommends against it now); it can be
  revisited once the guide stabilizes.
- **New `examples/` samples or a manifest knob** — orientation needs neither.
