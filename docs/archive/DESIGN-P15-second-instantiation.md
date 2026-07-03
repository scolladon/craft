# Design — P15: second-instantiation validation (non-tsgit, zero manifest) + docs refresh

> Brief: prove SC5 — *a second, non-tsgit repo runs the default pipeline with no manifest* —
> the final gate (G9) before shipping the customizable-engine re-architecture. Find every
> place a tsgit (TypeScript/Node + npm + `node --test` + bats + Stryker) assumption leaks
> into the "zero-config defaults via capability probing," pin the per-phase degradation
> behaviour empirically on a non-JS toolchain, lay out *how SC5 gets proven and recorded*,
> and refresh the docs to reflect the now-complete P1–P14 engine + the second-instantiation
> learnings. Resolves G9 / SC5. Gate = G9 → SC5 green → ship.
> Status: draft → self-reviewed ×3 → accepted

## Context

### What P15 is, in the program

P15 is the last row of the PRD §17 program breakdown before **ship**: "Second-instantiation
validation (non-tsgit, zero manifest) + docs refresh", gate **G9**, "SC5 green → ship". The
two requirements it closes:

- **G9** (PRD §4) — *"Strong zero-config defaults — install + run produces a best-practice
  flow unchanged from today."*
- **SC5** (PRD §18) — *"A second, non-tsgit repo runs the default pipeline with no
  manifest."*

§17 traceability maps "strong defaults→P3/P15" and "easy install/customize→P12/P15": P3
built the descriptor + resolver that makes the defaults *data-driven*; P12 wrote the
zero-config DX story; **P15 is where that story is empirically validated against a
toolchain craft has never been run on.**

### The crux: SC5 has never been empirically tested

Every prior phase (P1–P14) was developed and dogfooded **entirely on this repo** — a
TypeScript/Node engine: npm lockfile, `node --test` (631 tests), bats (62), Stryker mutation,
`scripts/ci.sh` as the gate, git + `gh`. The zero-config-defaults claim — "no manifest =
strong defaults via capability probing" (README; GUIDE §1) — is **asserted, not proven** on
any other toolchain. P15's whole job is to (a) locate every tsgit assumption that leaks into
the default path, and (b) prove SC5 + pin the graceful-degradation behaviour each phase must
hold on a Python/Go/Rust/non-test repo.

### The two-layer split that frames the whole design (pinned empirically)

The default path has **two layers**, and the tsgit-leak question lands almost entirely in the
second:

1. **The engine resolution layer (Node, data-driven) — already repo-agnostic.** A zero-manifest
   resolution succeeds and is toolchain-neutral. Pinned in the worktree:

   ```
   $ node engine/bin/pipeline-resolve.js pipeline/default.yml      # no manifest arg
   effective ids: workspace, design, decisions, planning, implementation, review,
                  refactoring, validation, documentation, propose, integrate
   gateDecisions:
     planning       → gate="plan-lint"          codeProducing=false
     implementation → gate="<gates.phase>"      codeProducing=true
     review         → gate="<gates.phase>"      codeProducing=false
     refactoring    → gate="<gates.phase>"      codeProducing=true
     validation     → gate="<validation gate>"  codeProducing=false
     propose        → gate="pr.pre-pr-gate"     codeProducing=false  awaiting=["validation"]
     (workspace/design/decisions/documentation/integrate → gate="")
   floorErrors: []   waivers: []   exit=0
   ```

   The engine emits the same 11-phase walk regardless of repo — it operates on
   `pipeline/default.yml` + `contracts/`, never on the target repo's sources. SC1 already
   proves this golden walk is byte-identical with no manifest
   (`engine/test/scenarios.test.js:91`, fixture `engine/test/fixtures/scenarios/SC1/`).
   **SC5 ≠ SC1.** SC1 is an *engine-resolution* golden run under `node --test`; SC5 is a
   *runtime* claim about the whole pipeline (skills + scripts + probes) executing on a
   different toolchain. The engine layer is the part SC1 covers and is *not* where tsgit
   leaks — confirmed by reading the resolver: `resolveGate` (`engine/src/gates.js:44`) only
   selects `descriptor.gate → manifest.gates[id] → ""`; it never substitutes a command and
   never names a tool.

2. **The skill/script runtime layer — where capability probes live and where leaks could
   hide.** Gate placeholders (`<gates.phase>`, `<validation gate>`, `pr.pre-pr-gate`) are
   **resolved by each phase skill at execution time via a repo capability probe** — this is
   the zero-config-defaults mechanism. It is a *prose contract* in the skills, not engine
   code, and is therefore **not** covered by the 631 `node --test` cases. This is the surface
   P15 must validate.

### The capability-probe contract, pinned per phase (read in the worktree)

| Phase | Probe / degradation (file:line) | tsgit assumption? |
|---|---|---|
| `workspace` | `scripts/worktree-setup.sh:14-35` — lockfile probe over 10 ecosystems (npm/pnpm/yarn/bun/uv/poetry/cargo/go/bundler/composer) → nested-lockfile fallback → **"no recognized lockfile — install skipped (noted)"**. `skills/workspace/SKILL.md:11` probes git + default branch. | **CLEAN** — multi-ecosystem; no JS bias |
| `planning` | `skills/planning/SKILL.md:20-21` — writes each part gate as `gates.part`, *else* "probe: the repo's test runner over touched files", *else* `gates.phase`. Gate `plan-lint` is craft-internal (awk over the plan artifact, `scripts/plan-lint.sh`). | **CLEAN** — `plan-lint` is repo-agnostic; gate is *probed*, not hardcoded |
| `implementation` | `skills/implementation/SKILL.md:10-14` — `gates.part` (else repo test runner over touched files; else `gates.phase`) and `gates.phase` (**else: repo validate/check/test script; if nothing exists, REFUSE to run this phase**). | **CLEAN probe, but the REFUSE is the load-bearing SC5 edge** (see below) |
| `review` | `skills/review/SKILL.md:16-17` — "Gates as in implementation's preamble"; harness knobs default `code,security,tests,perf / passes 1 / max_cycles 3 / low-only`. | **CLEAN** — same probe as implementation; dimensions are language-neutral |
| `refactoring` | gate `<gates.phase>` (same probe); `skills/refactoring/SKILL.md:29`. | **CLEAN** |
| `validation` | `skills/validation/SKILL.md:14-18` — reads `phase.harness.tool` (default `stryker` from `pipeline/default.yml:115`), then **tool-agnostic probe: "mutation tooling configured? (stryker/mutmut/cosmic-ray/cargo-mutants…)" — absent → no-op with a note; the phase ends.** | **SOFT** — `stryker` is the *default tool name* (JS-only), but the probe is tool-agnostic and **degrades to a recorded no-op** when no mutation config is present |
| `architecture` | `skills/architecture/SKILL.md:12-18` — `tool: dependency-cruiser` (JS-only); probe checks `.dependency-cruiser.{json,js,cjs}` + `npx --no-install depcruise` → **absent → no-op with a note.** | **SOFT, and `enabled: false` by default** (`pipeline/default.yml:120`) — never in the zero-config path |
| `documentation` | `skills/documentation` — synthesis over `docs/` + backlog; no tool probe. | **CLEAN** |
| `propose` | `skills/propose/SKILL.md:10` — **probe: remote? none → propose AND integrate no-op with a note.** Uses `git` + `gh`. | **CLEAN** — git/gh only |
| `integrate` | git/gh only; gated on `propose`'s remote probe. | **CLEAN** |

Empirically pinned in a `mktemp` throwaway (never the worktree) — `worktree-setup.sh` against
four non-JS layouts:

```
CASE A  Python (requirements.txt, no lockfile) → "no recognized lockfile — install skipped (noted)."  exit 0
CASE B  Go (go.mod)        → runs `go mod download` (exit 127 here only because the sandbox lacks the go binary)
CASE C  Rust (Cargo.toml)  → runs `cargo fetch`    (exit 127 here only because the sandbox lacks cargo)
CASE D  C/Makefile-only    → "no recognized lockfile — install skipped (noted)."  exit 0
```

The exit 127 in B/C is the *environment* missing a toolchain, not a craft assumption: the
probe correctly selected the right installer per ecosystem. On a real Go/Rust machine those
cases install cleanly; on a no-lockfile repo the probe degrades to a recorded skip. **No JS
bias in `worktree-setup.sh`.**

### The single hard edge: `implementation`'s gate REFUSE on a no-test repo

`skills/implementation/SKILL.md:12-13`: `gates.phase` → "*repo validate/check/test script;
**if nothing exists, REFUSE to run this phase** — a workflow without any gate is not this
workflow*." Combined with the **gate-floor invariant** in the engine
(`engine/src/gates.js:132` — a code-producing phase with no resolvable gate is a `floorError`)
and PRD §11 ("a gate must exist for code-producing phases"), this is craft's deepest
principle, not a bug. **It is also the precise boundary of SC5:**

- A second repo **with a discoverable test/validate/check command** (Python `pytest`, Go
  `go test`, Rust `cargo test`, a `make test`/`make check`, a CI script) → the probe finds a
  gate → the full pipeline runs zero-config. **SC5 is achievable here.**
- A second repo **with no test infrastructure at all** → implementation REFUSES → the floor
  holds, and that is *correct behaviour*, not an SC5 failure. SC5 must therefore be scoped to
  "a second, non-tsgit repo *that has a test/validate command discoverable without a
  manifest*" — the same precondition tsgit itself satisfies (`scripts/ci.sh`).

A second SC5 invocation constraint (pinned): zero-manifest means **no `backlog:` block**, so
the run skill (`skills/run/SKILL.md:65-66` — backlog id "only if the manifest declares
`backlog:`") classifies the input as a **free-text brief or a file path**, never a backlog id.
The SC5 smoke must therefore be driven by a small free-text brief, not a backlog ticket — the
honest zero-config entry point.

This scoping is the central design decision (DC-1) and must be ratified, because it sharpens
what "runs the default pipeline" means in SC5.

### What constrains this design (house style + prior ADRs)

- **Mechanism over prose** (PRD §13, SC1) — SC5's proof must assert *mechanism* (resolution
  + gate decisions + probe outcomes), never LLM prose, and ride the existing
  `node --test` + bats + `scripts/ci.sh` substrate.
- **The scenario-suite pattern** — S1–S9 + SC1/SC3 are committed fixtures under
  `engine/test/fixtures/scenarios/`, asserted through the *real* engine entry points
  (`scenarios.test.js`). A CI-gated SC5 artifact should mirror this shape.
- **The smoke-test pattern** — full-pipeline / cross-runtime fidelity that cannot be CI-gated
  cheaply is a *documented on-demand smoke* (`skills/run/SKILL.md:270-305`: inline-fidelity,
  model-class matrix, registered-phase dispatch) plus a committed record. P14/ADR-074 set
  this precedent for S7 (engine fixture CI + manual `--plugin-dir` smoke). SC5 is the same
  shape: an engine-layer assertion in CI + a documented real-repo smoke + a committed record.
- **G9 wording — "unchanged from today"** binds: P15 must NOT change the default zero-config
  behaviour on tsgit. SC1's golden walk is the regression guard; any P15 change to a skill
  probe must keep SC1 byte-identical (`scenarios.test.js:91`).
- **No new engine subsystem** — SC5 is a *validation + docs* phase. The PRD scopes language-
  specific mutation adapters (mutmut/go-mutesting) out of this program (P16-adjacent); P15
  must not build them.

---

## Requirements

What must be true when P15 ships:

| # | Requirement | Verified by |
|---|---|---|
| R1 | The zero-config default pipeline resolves identically on any repo: `pipeline-resolve` with no manifest emits the same 11-phase `effective[]`, gate decisions, empty `floorErrors`, empty `waivers` — independent of the target repo's language. | SC1 golden (already green) + the SC5 record citing it |
| R2 | Every per-phase capability probe is **language-neutral or degrades to a recorded no-op** when its tool is absent: validation no-ops without a mutation config; architecture (default-off) no-ops without a dependency-cruiser config; propose/integrate no-op without a remote; workspace skips install with a note when no lockfile is recognized. No phase silently runs a JS-specific command on a non-JS repo. | The pinned per-phase matrix in Design; SC5 record's per-phase column |
| R3 | The implementation/review gate probe discovers a repo's test/validate/check command **without a manifest** on at least one non-tsgit toolchain (the chosen target, DC-2), and the floor `REFUSE` fires *only* when no such command exists — proving the REFUSE is the intended floor, not a tsgit leak. | SC5 smoke record (real repo) + a documented probe-resolution trace |
| R4 | The single tsgit-specific *default tool name* that reaches the zero-config path (`validation.harness.tool: stryker`) is documented as a JS default that **degrades, never blocks**, on a non-JS repo (no-op with note), and `architecture`'s `dependency-cruiser` is confirmed out of the default path (`enabled: false`). No other hardcoded JS command (`npm`/`node --test`/`bats`/`npx`/`package.json`) sits on the default execution path. | Design's leak audit (grep-pinned) + SC5 record |
| R5 | SC5 is proven by a **committed, diffable artifact** (DC-5) recording: the target repo's identity + toolchain, the resolved walk, each phase's outcome (ran / no-op-with-note / REFUSE-if-applicable), the discovered gate command, and the final PASS/PARTIAL verdict — mirroring `docs/model-class-matrix.md`. | The artifact exists, is referenced from the SC5 record/BACKLOG |
| R6 | An **engine-layer SC5 assertion** lands in CI (DC-5): a fixture proving the zero-manifest resolution + gate-decision shape is toolchain-independent (it already is via SC1; SC5 adds an explicit "no manifest, non-default-repo" assertion or re-uses SC1 as the anchor with an SC5 doc pointer). The full-pipeline runtime fidelity is a documented on-demand smoke, not CI-gated. | `scripts/ci.sh` green; `EXPECTED_TESTS` reconciled if a case is added |
| R7 | The docs are refreshed to reflect the **now-complete P1–P14 engine** and the SC5 learning (DC-4): the zero-config-defaults claim (README, GUIDE §1) is corrected to state the *test-command precondition* (R3) and the degradation behaviour (R2); the second-instantiation result is recorded. | The doc diffs land in the documentation phase; designed here |
| R8 | The BACKLOG P15 row flips from "⬜ outlined" to done-and-green under the documentation-phase guard, with reference links to this design + the SC5 record. | BACKLOG diff |
| R9 | G9 holds: tsgit's own zero-config run is unchanged ("unchanged from today") — SC1 stays byte-identical; no probe edit regresses the default tsgit gate resolution. | SC1 golden green; `scripts/ci.sh` green |
| R10 | A validation phase that **runtime-no-ops** (enabled, in `effective[]`, in `propose.awaitingHarnesses`, but its mutation-tool probe finds nothing → recorded no-op) **releases its `propose` wait** rather than blocking forever — the orchestrator treats a recorded executing-harness no-op symmetrically to a skip-waiver. (Whether this is a prose clarification or already-intended-but-unwritten is DC-7.) | The SC5 smoke reaches `propose` on a non-JS repo; the orchestrator prose states the no-op release |

---

## Design

### The spine

SC5 is **not** an engine (`engine/src/`) change — it is a *validation campaign* with a recorded
artifact and a docs correction. The engine resolution layer is already toolchain-neutral (R1,
pinned above); the work is to (a) **prove** the runtime probe layer degrades correctly on a
non-tsgit repo, (b) **record** that proof as a committed artifact in the repo's existing
patterns, and (c) **refresh** the docs so the zero-config promise states its true precondition.
The **lone bounded behaviour touch** the analysis surfaced is the orchestrator-prose
propose-gate-on-no-op clause (DC-7) — skill markdown, not engine code, and SC1-neutral.

The design has four parts: the leak audit (what could break, pinned), the SC5 proof shape
(how it gets proven), the docs-refresh plan (what gets corrected), and the degradation
contract (the per-phase behaviour the proof must observe).

### Part 1 — The tsgit-leak audit (pinned, exhaustive over the default path)

Grep over `skills/`, `engine/src/`, `contracts/`, `agents/` for hardcoded tool strings
(`stryker`, `npx`, `npm`, `node --test`, `package.json`, `package-lock`, `dependency-cruiser`,
`bats`, `jest`, `pytest`, `cargo`, `go test`) classifies every hit:

- **`validation.harness.tool: stryker`** (`pipeline/default.yml:115`) — the only JS tool name
  on the **enabled** default path. It is a *data default* read by `skills/validation/SKILL.md`,
  which **probes tool-agnostically** and no-ops with a note when no mutation config is found
  (`SKILL.md:14-18`). On a non-JS repo with no Stryker config → recorded no-op. **SOFT-LEAK —
  the tool does not run; the orchestrator must then *release* validation's propose-gate wait,
  which is the DC-7 degradation edge (see Part 2), not an automatic waiver.**
- **`architecture.harness.tool: dependency-cruiser`** (`pipeline/default.yml:131`) — JS-only,
  but the phase is **`enabled: false`** (`:120`), so it is *never in the zero-config
  `effective[]`* (confirmed: the pinned walk above has 11 phases, no `architecture`). Out of
  the default path entirely. **NOT A LEAK for SC5.**
- **`npx --no-install depcruise`** (`skills/architecture/SKILL.md:16`) — inside the default-off
  architecture probe; unreachable on the zero-config path.
- **`node`/`npm`/`bats`/`stryker` in `scripts/ci.sh`, `engine/package.json`,
  `engine/stryker.conf.json`** — these are **tsgit's own gate**, i.e. the *target* of the
  `gates.phase` probe *when the target repo is tsgit*. They are not part of craft's plugin
  content that runs against a second repo; a second repo brings its own gate. **CLEAN —
  craft-self tooling, not a default-path leak.**
- **`worktree-setup.sh`** — multi-ecosystem, no JS bias (pinned in throwaway above). **CLEAN.**

Conclusion: **exactly one JS-specific default-tool-name reaches the enabled zero-config path
(`stryker`), and it degrades to a recorded no-op.** Every other JS string is either default-off,
inside a tool-agnostic probe, or craft-self tooling. There is no hardcoded `npm`/`node`/`npx`
command on the enabled default execution path that runs against the second repo's sources.

### Part 2 — The degradation contract (what the SC5 proof must observe)

On a non-tsgit repo, zero manifest, the default walk must behave exactly as this matrix — this
is the *expected* SC5 behaviour, the thing the proof asserts:

| Phase | Expected on a non-tsgit repo (zero manifest) |
|---|---|
| workspace | Probe lockfile → install if recognized, else recorded skip; git + default branch probed. **Runs.** |
| design / decisions / planning | Language-neutral artifact phases. `plan-lint` (craft-internal awk) gates planning. **Run.** |
| implementation | Gate probe discovers the repo's test/validate/check command. **Runs if discoverable; REFUSES (floor) if the repo has no test command at all** — the SC5 precondition (DC-1). |
| review | Same probe; language-neutral dimensions. **Runs.** |
| refactoring | Same gate probe. **Runs** (may be an honest no-op if no structural gain). |
| validation | Mutation-tool probe → on a non-JS repo with no mutation config → **no-op with a note**; validation's propose-gate becomes a waiver. (A JS default `stryker` is never forced on a non-JS repo.) |
| architecture | Default-off → **not in `effective[]`.** |
| documentation | Probes affected pages ("no affected pages → skip honestly", `skills/documentation/SKILL.md:1-12`) + backlog (zero-manifest → **no `backlog:` declared → no backlog work**, repo-agnostic). **Runs.** |
| propose | Remote probe → if a remote exists, push + `gh pr create`; **else propose + integrate no-op with a note**, work stays local. |
| integrate | Gated on propose's remote probe. |

**The propose-gate interaction is a genuine degradation edge — the one place SC5 may expose a
gap (pinned, do not gloss).** Two release paths exist and they are *not* the same:

- **Skip/disable** (manifest `pipeline.skip` or `phases.validation.enabled:false`) → the
  *engine* emits a waiver: `emitWaivers` (`engine/src/gates.js:162`) fires **only** when
  `isSkipped || isExplicitlyDisabled` **and** the phase is absent from `effective[]`
  (`gates.js:170-175`). `validation` is in `WAIVABLE_PHASE_IDS` (`gates.js:16`) and is an
  executing-harness, so a *skipped* validation releases the propose-gate
  (`skills/run/SKILL.md:219-221`).
- **Runtime no-op** (the SC5 case: validation is *enabled and in `effective[]`*, so it gets
  **no** engine waiver and **is** in `propose.awaitingHarnesses`; but at runtime its
  tool-agnostic probe finds no mutation config and "the phase ends here" with a note,
  `skills/validation/SKILL.md:14-18`). Here the engine waiver path does **not** fire — and the
  orchestrator's propose-gate invariant says `propose` waits until every `awaitingHarnesses`
  id "**has landed its run and its gate is green**" (`skills/run/SKILL.md:173, 214-216`), while
  `skills/propose/SKILL.md:12-13` asserts "the validation phase's run has landed, survivors
  triaged, `gates.phase` green." A no-op'd validation **never lands a run** — and grep over
  `skills/run/SKILL.md` finds **no** explicit "a recorded runtime no-op of an awaited
  executing-harness releases its propose wait" clause. **On a non-tsgit repo this is the precise
  point where the orchestrator could ambiguously wait on a validation that legitimately
  no-opped.**

This is **not** a fabricated risk and **not** decided here: it is the one SC5 degradation edge
where the zero-config promise meets an orchestrator-prose gap. The fix is a small, bounded
clarification (treat a recorded validation no-op as releasing its `awaitingHarnesses` entry,
symmetric with a skip-waiver) — surfaced as **DC-7** for the user to ratify, because it is the
only place P15 might touch orchestrator behaviour rather than only validate + document.

### Part 3 — The SC5 proof shape (DC-5)

Mirror P14/ADR-074's split (engine fixture in CI + documented manual smoke + committed record):

- **Engine-layer assertion (CI-gated).** The toolchain-independence of resolution is already
  the SC1 golden (`scenarios.test.js:91`). SC5 either (a) re-uses SC1 as the anchor and the SC5
  record cites it, or (b) adds one explicit SC5 scenario asserting "no manifest, no `gates`
  block → the gate decisions carry the *placeholders* unchanged, proving the engine defers
  command resolution to the repo-probing skill layer regardless of language" — i.e. the
  resolver never bakes in a JS command. This is deterministic, `node --test`, no second repo
  needed. (Which of (a)/(b) is DC-3.)
- **Real-repo smoke (documented, on-demand, NOT CI-gated).** Run `/craft:run` on the chosen
  second repo (DC-2) with **no `.claude/workflow.md`**, on a small real brief, and observe the
  per-phase matrix of Part 2: confirm the gate probe discovers the repo's test command,
  implementation runs, validation no-ops with a note (no JS mutation tool), and the run reaches
  documentation/propose. This is the same shape as the existing inline-fidelity / model-class /
  registered-dispatch smokes in `skills/run/SKILL.md` — add an SC5 smoke section there.
- **Committed record (the SC5 artifact, R5/DC-5).** A new diffable doc (mirroring
  `docs/model-class-matrix.md`) recording: target repo identity + toolchain, the resolved
  11-phase walk, the per-phase outcome column (ran / no-op-with-note / n/a), the discovered
  gate command, and the PASS/PARTIAL verdict. This *is* the SC5-green evidence the BACKLOG row
  points to.

The split keeps CI deterministic (no flaky second-repo install) while still recording genuine
runtime fidelity on a real non-tsgit repo — the established craft pattern.

### Part 4 — The docs-refresh plan (DC-4 scopes it; authored in the documentation phase)

P15 is the ship gate, so the docs must read as a *complete, shipped* engine, with the
zero-config promise stating its true precondition:

- **README "Customize" + "Install" blocks** — the line "No manifest = sensible defaults via
  capability probing (lockfile detection, test-script discovery, mutation-config probe, remote
  probe)" is correct but must add the **precondition**: zero-config delivery needs a
  *discoverable test/validate command*; a repo with no test infrastructure hits the
  gate-floor REFUSE (by design). State the SC5 result (a second non-tsgit repo runs the
  default pipeline) as shipped.
- **`docs/GUIDE-customizing.md §1`** — the "five minutes" mental-model section: add a short
  "zero-config on a non-JS repo" note pinning the degradation behaviour (validation/architecture
  no-op without their JS tools; propose no-ops without a remote; the test-command precondition).
- **`docs/DESIGN-customizable-engine.md`** — the living architecture doc references
  "second-instantiation" as pending (`:501`); flip it to done with a pointer to the SC5 record.
- **The SC5 validation-record doc** (R5) — new, the proof artifact.
- **`BACKLOG.md`** — flip the P15 row (currently "⬜ outlined", row ~31; the P15–P16 outline
  ~378-380) to done-and-green with reference links (R8), under the documentation-phase backlog
  guard.

Nothing is written until SC5 is proven (the smoke + record exist) — the same gating discipline
P12/ADR-062 applied to Tier-2 docs (never advertise an unproven surface).

### Files this touches

- **No `pipeline/default.yml`, `engine/src/`, or `contracts/` change is required for SC5
  itself** — the engine resolution layer is already toolchain-neutral (R1). The default-path
  data and pure resolver are untouched.
- **`skills/run/SKILL.md`** — (i) add the SC5 on-demand smoke section (alongside the existing
  three smokes); (ii) **if DC-7(a) is ratified**, add the one-clause propose-gate fix (a
  recorded executing-harness *runtime no-op* releases its `awaitingHarnesses` entry, symmetric
  to a skip-waiver). This is the sole behaviour-touching edit P15 may make, and it is
  SC1-neutral (the clause fires only on a runtime no-op, which tsgit's Stryker-present default
  path never hits — R9/G9 preserved). A matching one-line note in `skills/propose/SKILL.md:12`
  ("…landed *or* recorded a no-op…").
- **Tests (CI):** `engine/test/fixtures/scenarios/SC5/` + a `scenarios.test.js` case if DC-3
  picks option (b); `EXPECTED_TESTS` in `scripts/ci.sh:10` (currently 631) reconciled.
- **Docs (documentation phase):** README, GUIDE §1, DESIGN-customizable-engine, the new SC5
  record, BACKLOG.

---

## Decision candidates

> Every load-bearing choice not pre-decided by an existing ADR. ≤3 alternatives each; the
> designer recommends, the user decides in the decisions phase.

| # | Choice | Alternatives (≤3) | Recommendation | Why |
|---|---|---|---|---|
| DC-1 | **What "runs the default pipeline" means for SC5** given the gate-floor REFUSE on a no-test repo | (a) SC5 scoped to a non-tsgit repo *that has a discoverable test/validate/check command* (the same precondition tsgit satisfies); the REFUSE on a no-test repo is *correct floor behaviour*, not an SC5 miss · (b) SC5 must run end-to-end even on a repo with no tests → would require relaxing the gate floor (weakens PRD §11, G9) · (c) SC5 demands the design→plan→implement→review *core* runs, with implementation's gate REFUSE counted as a PARTIAL | **(a)** | The gate floor is craft's deepest invariant (PRD §11; `gates.js:132`); (b) guts it. SC5's intent is "a *different toolchain* works," not "a repo with no quality bar works." Scoping to a test-bearing repo is honest and keeps G9's floor intact. |
| DC-2 | **The target second repo** | (a) a **synthetic minimal fixture committed into craft** (`examples/second-repo/` or `test/fixtures/`) — e.g. a tiny Python+pytest or Go+`go test` project · (b) a **real external OSS non-JS repo** (clone, run, record) · (c) a **specific language pick** baked into the smoke instructions (Python/pytest as the canonical second toolchain, being the most ubiquitous test runner) | **(b) for the smoke record + (c) Python/pytest as the canonical pick**, with (a) only if a CI-reproducible fixture is later wanted | A real OSS repo is the honest SC5 proof (realism); pinning Python/pytest makes the smoke reproducible and the most representative non-JS toolchain. A committed synthetic fixture (a) is appealing for CI but risks proving a *toy*, not the claim — keep it optional. The user owns the realism-vs-reproducibility trade-off. |
| DC-3 | **The CI-gated SC5 engine assertion** | (a) re-use SC1 as the toolchain-independence anchor; SC5 is doc-only + smoke (no new test) · (b) add one explicit `SC5` scenario asserting "no manifest, no `gates` block → resolver emits gate *placeholders* unchanged, never a JS command" · (c) add a broader SC5 fixture set mirroring S1–S9 | **(b)** | A single explicit SC5 case makes the *toolchain-neutrality of the resolver* a named, diffable guarantee (vs leaning entirely on SC1's intent), at one test's cost. (a) under-documents the SC5-specific claim; (c) over-builds for a property SC1 already largely covers. |
| DC-4 | **Docs-refresh scope** | (a) **minimal**: README precondition fix + the SC5 record + BACKLOG flip · (b) **standard**: (a) + GUIDE §1 "zero-config on a non-JS repo" note + DESIGN-customizable-engine "second-instantiation done" flip · (c) **broad**: (b) + a dedicated "running craft on your repo" install/onboarding page | **(b)** | (b) tells the truth in every doc a newcomer reads (README, GUIDE, living DESIGN) without inventing a new onboarding doc this late. (a) leaves the GUIDE silent on the non-JS story; (c) is P12-territory scope-creep at the ship gate. |
| DC-5 | **The artifact that proves SC5 green** | (a) a **committed validation-record doc** (mirroring `docs/model-class-matrix.md`) + the on-demand smoke in `run/SKILL.md` · (b) a **CI-gated scenario/fixture only** (no real-repo run) · (c) a **one-shot manual smoke recorded only in the run record / PR body**, no standing doc | **(a)** | Matches the repo's established proof pattern (model-class-matrix doc + on-demand smoke; ADR-068/074): deterministic CI for the engine property, a diffable record for the real-repo run. (b) can't prove the *runtime* probe layer; (c) leaves no durable, citable SC5 evidence for the BACKLOG row. |
| DC-6 | **Whether any skill probe wording is edited (vs docs-only)** | (a) **docs-only** — skills already implement the probe correctly (pinned); P15 changes no skill behaviour, only documents it · (b) **clarify implementation/validation probe prose** to make the non-JS discovery order + degradation explicit (risk: must keep SC1 byte-identical, must not change agent behaviour) · (c) clarify + add a tiny shellcheck-clean helper that prints the discovered gate command for the SC5 record | **(a)**, *unless DC-7 is ratified as a prose fix* (then the propose-gate-on-no-op clause is the one allowed orchestrator edit) | The probes are already language-neutral (audited); the SC5 gap is *proof + docs*, not behaviour. (b) risks an unintended default-path change at the ship gate; (c) adds a binary (and an `EXPECTED_TESTS`/bats touch) for marginal value. Keep P15 a validation+docs phase — the lone exception is the DC-7 propose-gate clause if the user wants it fixed in P15. |
| DC-7 | **The validation runtime-no-op → propose-gate release gap** (a real orchestrator-prose gap surfaced by the SC5 analysis: a no-op'd validation is in `awaitingHarnesses` but never "lands a run") | (a) **fix in P15** — add a one-line orchestrator clause: a *recorded* executing-harness no-op releases its `propose` wait, symmetric to a skip-waiver (`skills/run/SKILL.md` propose-gate invariant + `skills/propose/SKILL.md` preamble) · (b) **declare it already-intended** and only document the expected behaviour in the SC5 record (no skill edit) · (c) **defer to a follow-up backlog item** (P15 records the gap; ships SC5 PARTIAL on the propose-reach for a no-op-validation repo) | **(a) fix in P15** | This is the *only* place a non-tsgit zero-config run can deadlock the orchestrator, and P15 is the ship gate — leaving it as (b) "intended but unwritten" violates craft's mechanism-over-memory principle (the release would rely on the session *remembering* to treat a no-op like a waiver). (c) ships a known hang. The fix is one clause, SC1-neutral (it fires only on a runtime no-op, which the tsgit default path — Stryker present — never hits, so G9 is unaffected). |

---

## Test strategy

What proves it, in the repo's mechanism-not-prose discipline:

- **Engine toolchain-neutrality (CI-gated, `node --test`).** The SC1 golden
  (`engine/test/scenarios.test.js:91`, fixture `SC1/`) already pins the zero-manifest 11-phase
  walk + gate decisions + empty floorErrors/waivers byte-identical. Under DC-3(b), add one
  `SC5` scenario (fixture `engine/test/fixtures/scenarios/SC5/manifest.yml` = "no overrides,
  represents a non-tsgit repo") asserting the resolver emits the gate *placeholders*
  (`<gates.phase>`, `<validation gate>`) **unchanged and language-free** — proving the engine
  never bakes a JS command and always defers command resolution to the repo-probing skill
  layer. Bump `EXPECTED_TESTS` (`scripts/ci.sh:10`, currently 631) accordingly.
- **Probe degradation pinned empirically (recorded in this design + the SC5 record), state-
  mutating runs in `mktemp` throwaways only.** `worktree-setup.sh` against Python /
  Go / Rust / no-lockfile layouts (done above — CLEAN). The mutation-probe / remote-probe
  no-op paths are observed in the real-repo smoke (DC-2).
- **The real-repo SC5 smoke (on-demand, NOT CI-gated; DC-5).** `/craft:run "<small brief>"` on
  the chosen non-tsgit repo with no manifest; assert the per-phase matrix of Design Part 2:
  resolution succeeds, the gate probe discovers the repo's test command, implementation runs
  (not REFUSE), validation no-ops with a recorded note, **and the walk reaches
  documentation/propose without deadlocking on the no-op'd validation** (the R10/DC-7 edge — the
  smoke is the live proof that the release works). Documented in `skills/run/SKILL.md` alongside
  the inline-fidelity / model-class / registered-dispatch smokes; the outcome lands in the SC5
  record.
- **The propose-gate-on-no-op clause (R10/DC-7), if ratified.** Because this is orchestrator
  prose, not engine code, it has no `node --test` surface — its guard is the real-repo smoke
  above (the walk reaches `propose`) plus the explicit clause in `skills/run/SKILL.md` /
  `skills/propose/SKILL.md`. If a future engine surface for "executing-harness no-op" is wanted,
  that is out of scope here (the engine waiver path covers skip/disable only — `gates.js:162`).
- **G9 regression guard.** `scripts/ci.sh` green end-to-end; SC1 unchanged — tsgit's own
  zero-config behaviour is "unchanged from today" (any DC-6(b) prose touch must keep SC1
  byte-identical).
- **No property/round-trip lens** — P15 touches no parser, matcher, or wire format; it
  validates and documents. (The resolver round-trips are already bound by the existing engine
  suites.)

---

## Out of scope

- **Building language-specific mutation/architecture adapters** (mutmut, go-mutesting,
  cargo-mutants; non-JS dependency-cruiser equivalents) — PRD scopes these out; the validation
  phase *degrading to a recorded no-op* on a non-JS repo is the correct, shipped behaviour. An
  engine feature to pick a per-language mutation tool is a future program, not P15.
- **Relaxing the gate floor** for no-test repos — PRD §11 / G9 floor is non-negotiable; the
  implementation REFUSE on a repo with no test command is correct (DC-1).
- **P16 provider-agnostic work** (the Pi adapter, ports/adapters non-Claude PoC) — a separate
  backlog row; SC5 is about a second *repo*, not a second *runtime*.
- **A GUI/onboarding wizard or a new install-tutorial page** — N2 (craft stays headless /
  file-based); the docs-refresh corrects existing docs (DC-4(b)), it does not add a product
  surface.
- **Multi-repo / monorepo-specific resolution** — SC5 is one second repo; nested-workspace
  install already has a probe fallback (`worktree-setup.sh:25-31`), no new design.
- **Per-invocation `--target-repo` style flags** — SC5 runs in the second repo's own checkout
  via the normal `/craft:run`; no cross-repo CLI overlay.
