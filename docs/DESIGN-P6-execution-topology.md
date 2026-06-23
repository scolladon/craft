# DESIGN — P6: execution topology

> Brief: make the orchestrator walk fully honour `execution: inline|agent` end-to-end — inline
> role-craft sourcing, `solo`/`full` profile semantics, and per-invocation args — building on the
> already-green resolution layer.
> Status: draft → self-reviewed ×3

## Context

### What the resolution layer already provides (do not redesign)

The P5/engine layer is complete and frozen. Every phase in `Resolution.effective[]` already carries
a resolved `execution` field (`'agent'` or `'inline'`), computed by `resolvePipeline` in the
following precedence order (ADR-008):

```
explicit phases.<id>.execution
  > profile (solo → inline for non-harness; full → agent for all)
    > manifest top-level execution:
      > descriptor default (DEFAULT_EXECUTION = 'agent')
```

`expandProfile` (`engine/src/profile.js`) knows exactly two closed-vocab values: `solo`
(non-harness → inline, harness stays agent via `applyProfileToArchetype`) and `full` (all agent).
`resolvePhaseExecution` (`engine/src/resolve.js`) enforces the harness-archetype caveat at all
levels. `VALID_EXECUTIONS` (`engine/src/descriptor.js`) = `{ 'agent', 'inline' }`.

`assembleContract` (`engine/src/contract.js`) already produces the correct injected block for
both modes: the core bundle's `@@ARTIFACT_HANDOFF@@` and `@@MODEL_RESOLUTION@@` markers are
expanded to their inline or agent variants by `expandCore`. The frozen test
(`engine/test/contract-equivalence.test.js`) asserts — per default-pipeline descriptor — that
agent vs inline blocks differ by exactly two lines. S1 (`engine/test/scenarios.test.js`) asserts
profile:solo yields inline for non-harness phases.

`pipeline-resolve.js` bin (`engine/bin/pipeline-resolve.js`) prints the full `Resolution` JSON;
the walk already reads `phase.execution` from it (SKILL.md step 2). `contract-assemble.js` bin
already accepts `--inline` (SKILL.md step 3).

### What does NOT yet exist (the P6 seam)

`run/SKILL.md` step 4 describes archetype duties but does not specify how the session runs a
phase inline — no Task spawn, but:
- how the role craft reaches the session
- what "the session loads the block and follows it" means procedurally
- how per-invocation `--profile`/`--skip` tokens in `$ARGUMENTS` are stripped before the brief
  reaches the phase

`pipeline/default.yml` carries `role: craft:<name>` on the eight delegating descriptors.
`workspace`, `decisions`, `propose`, `integrate` have no `role` field and are already
session-owned — they are unaffected by `execution:`.

### Agent craft that is NOT in any bundle (load-bearing for DC-1)

After the P5 thin, genuine role craft remains in agent bodies:

| Agent | Craft NOT in any contract bundle |
|---|---|
| `agents/designer.md` | "design within the house style"; "pin empirically — run the real thing"; empirical-pinning method |
| `agents/reviewer.md` | `--no-ext-diff` git hygiene; "do NOT perform mutation analysis" boundary; final-message shape |
| `agents/planner.md` | public-surface-decision discipline; sizing rules (no test-only parts); plan-lint schema mandate |
| `agents/part-implementer.md` | "the part, the whole part, nothing but the part" discipline (implicit) |
| `agents/refactor-executor.md` | "never decide WHAT, only carry out HOW" identity |
| `agents/docs-writer.md` | "match each page's voice, structure, and depth" |

The `producer` bundle covers template-fill + Decision-candidates + self-review + mktemp probe
discipline — but it says nothing about empirical pinning, house-style reading, or plan sizing.
The `harness-read` bundle covers read-only + structured findings + zero-findings legitimacy —
but not `--no-ext-diff` nor the mutation-dimension boundary.

### SP1 findings (load-bearing facts)

- `inline` = the absence of Task delegation. The session runs the phase body in-thread.
- Contract, gates, and hooks apply identically to both modes.
- Handoff is the commit in both modes (inline carve-out already encoded in `core.md`).
- Model for inline = the session model (carve-out already encoded).
- Parallelism caveat: inline is sequential. A multi-dimension harness that fans out concurrent
  subagents stays `agent` even under a lean profile. `solo` = inline + single-pass harnesses;
  it does not silently serialize a concurrent fan-out. This is already encoded in
  `applyProfileToArchetype` (harness archetype always stays agent).

### SP3 findings (load-bearing facts)

`$ARGUMENTS` is substituted verbatim in headless `-p`, preserving flag tokens, comma-lists, and
embedded quotes. The orchestrator can parse `--profile`/`--skip`/pipeline-edit flags out of
`$ARGUMENTS`; the non-flag remainder is the brief.

---

## Requirements

| # | Requirement | Mechanism |
|---|---|---|
| R1 | `execution: inline` phases in the walk run in-thread (no Task spawn); the session follows the injected block exactly as a spawned agent would follow its copy | SKILL.md step 4 prose + DC-1 decision |
| R2 | An inline phase's injected block is assembled with `--inline` flag; the session loads it at phase entry | SKILL.md step 3 already specifies this; step 4 must say "load and follow" |
| R3 | Role craft for inline phases reaches the session with equivalent fidelity to a spawn | DC-1 decision |
| R4 | `solo` profile runs all non-harness phases inline, harness phases as agent | Already in resolution; walk must honour `phase.execution` without special-casing profile name |
| R5 | `full` profile runs all phases as agent (identical to zero-config default) | Already in resolution; walk honours `phase.execution` |
| R6 | Per-invocation `--profile <name>` and `--skip <ids>` flags in `$ARGUMENTS` are parsed by the orchestrator before the brief is classified | DC-3 decision |
| R7 | Per-invocation flags compose with the manifest: CLI flag wins over manifest `pipeline.profile` | DC-3 decision |
| R8 | An inline-executed phase produces the same committed artifact as its agent execution — guaranteed at the block level by the existing equivalence guard; guaranteed at the walk level by R3 + R1 | No new test beyond equivalence guard; walk-level claim is prose |
| R9 | S1 stays green; SC1 unchanged; harness-stays-agent under solo holds | No engine changes; walk prose change only |
| R10 | The run record logs `inline` execution for any phase that runs inline | SKILL.md step 6 already covers record; step 4 must note inline in record |

---

## Design

### Files that change

- `run/SKILL.md` step 0 (parse `$ARGUMENTS` flags before brief classification; conditional on DC-3(a): also pass flags to `pipeline-resolve.js`) + step 4 (inline dispatch branch).
- `engine/bin/pipeline-resolve.js` — gains two optional CLI flags `--profile` and `--skip` (conditional on DC-3(a) being chosen; the 7-export module surface is untouched).
- `engine/test/scenarios.test.js` — one new `S-full` test (conditional on DC-4(a) being chosen).
- `engine/test/` (new bin test file) — CLI flag-precedence tests (conditional on DC-3(a) being chosen).

### Walk step 4 — inline vs agent dispatch

`run/SKILL.md` step 4 currently says "Execute via the resolved execution mode" and lists archetype
duties for the session-as-orchestrator. P6 deepens it to specify the two dispatch paths explicitly:

**Agent path (existing, unchanged):**
1. Spawn a Task with `subagent_type: craft:<role>`.
2. Prepend the injected block (from step 3) to the Task prompt, followed by working directory,
   task dynamics, and artifact paths.
3. Await the commit; verify artifact on return.

**Inline path (new prose):**
1. The injected block was assembled with `--inline` in step 3; the session treats it as the active
   governing constraint for this phase (reads it as policy, follows it throughout the phase body).
2. If the descriptor carries a `role:` field that resolves to a local craft agent file
   (`agents/<agent-name>.md`): **load the role craft** (per DC-1 decision). Custom/external roles
   (e.g. `acme:my-planner`) that have no local agent file are skipped — the contract block alone
   governs that phase inline.
3. Run the phase body in-thread — the same procedure text the spawned agent would follow. No Task
   call. The session acts as both orchestrator and worker for this phase.
4. Gate, record, and handoff are identical to the agent path (the block already says "the commit
   is the handoff").

The record line for an inline phase is: `inline: <phase.id> — ran in-session`.

### Role craft sourcing for inline (the crux — subject to DC-1)

The design records the three options and their implications; the decision is deferred to the ADR
phase (DC-1 below).

**Option (a) — load `agents/<role>.md` body (sans frontmatter) at inline phase entry.**
The walk reads the file and injects its body right after the assembled block. The session then
has: injected contract block (inline variant) + agent craft body. This is symmetric with the
spawn: a spawned agent also receives both (the block in its prompt, its own body as system
context). Fidelity: inline ≡ agent modulo the two carve-out lines plus model. Change-size:
SKILL.md step 4 gains a "if execution === inline and role present, read and inject
agents/<role>.md body" sentence. Does not re-open ADR-015's invariant/craft boundary — craft
stays in agent files, the boundary is unchanged; the walk just surfaces it to the session.

**Option (b) — phase skill Procedure is sufficient; agent craft is redundant inline.**
If the skill's Procedure is written such that an intelligent session following the contract block
can execute it correctly without the agent craft, no extra load is needed. Fidelity risk:
designer's "design within the house style" and "pin empirically" guidance is NOT in the
Procedure — it is only in `agents/designer.md`. Reviewer's `--no-ext-diff` git hygiene is NOT in
the Procedure — it is only in `agents/reviewer.md`. This option accepts a fidelity gap: inline
designer may not check house style; inline reviewer may omit `--no-ext-diff`. Re-opens ADR-015
implicitly: the craft boundary was set assuming spawns carry agent craft; option (b) says inline
runs without it.

**Option (c) — inline is restricted to phases with no role craft.**
Only phases whose descriptor has no `role:` field may run inline. `workspace`, `decisions`,
`propose`, `integrate` have no `role` and are session-owned already. Every other phase has
`role:`. This means `solo` profile effectively applies only to the four role-less phases; the
remaining seven stay agent regardless of profile — which is not what `solo` promises (S1 asserts
inline for all non-harness phases). Option (c) breaks S1 as currently tested.

### Per-invocation args (subject to DC-3)

SP3 confirmed `$ARGUMENTS` carries craft flags verbatim. The orchestrator's step 0 must parse
them before classifying the brief.

**Parsing rule:** flags are leading tokens matching `--<key>` or `--<key> <value>` (or
`--<key>=<value>`). The non-flag suffix is the brief. Known flags at P6:
- `--profile <name>` — sets `pipeline.profile` as a CLI-level overlay
- `--skip <id,id,...>` — extends `pipeline.skip` as a CLI-level overlay

**Edge: flags-only input.** If `$ARGUMENTS` contains only flag tokens and no brief (e.g.
`--profile solo`), the non-flag remainder is the empty string. Step 2 (input classify) treats
an empty brief as ambiguous and stops with a user prompt — the same behaviour as a zero-argument
invocation.

**Composition with manifest:** CLI flag is the highest-precedence overlay, winning over
`pipeline.profile` and `pipeline.skip` declared in the manifest. The resolved manifest used by
`pipeline-resolve.js` is the stored manifest, but the CLI flags override at resolution time (per
DC-3 option analysis).

**Surface gate:** `pipeline/default.yml` and the 7-export engine surface stay untouched.

### Profiles — closed vocabulary (subject to DC-2)

`solo` and `full` are the only named profiles. Both are already encoded in `profile.js` and
validated by `expandProfile`. No third profile is introduced at P6.

A repo that wants a "lean" mix without a dedicated profile name already has the three-level
`execution:` precedence: set `execution: inline` at the top level and override specific phases
back to `agent` via `phases.<id>.execution`. This covers the semantic space of any lean-but-not-
full-solo profile without a new named bundle.

### Inline run record entry

Step 6 of the walk appends to the run record. P6 adds the inline case:
- Agent run: existing record line (no change).
- Inline run: `inline: <phase.id> — ran in-session` appended.

---

## Decision candidates

| # | Choice | Alternatives (≤3) | Recommendation | Why |
|---|---|---|---|---|
| DC-1 | **Inline role-craft sourcing** — where does an inline phase get the agent craft that is NOT in any contract bundle? | **(a)** Walk loads `agents/<role>.md` body (sans frontmatter) into the session at phase entry, after the injected block — symmetric with spawn. **(b)** Phase skill Procedure is deemed sufficient; agent craft is skipped — accepts a fidelity gap for designer (no house-style probe) and reviewer (no `--no-ext-diff`). **(c)** Inline restricted to role-less phases only — breaks S1 as tested; `solo` applies only to `workspace`/`decisions`/`propose`/`integrate`. | **(a)** | Option (a) preserves the ADR-015 invariant/craft boundary (craft stays in agent files, unchanged), achieves inline ≡ agent fidelity modulo the two frozen carve-out lines, and costs a single sentence in SKILL.md step 4. Option (b) silently accepts a measurable craft deficit — the reviewer's `--no-ext-diff` omission alone could corrupt machine-parsed git output. Option (c) breaks S1 and narrows `solo` below what the profile promises. |
| DC-2 | **Profile vocabulary scope** — are `solo` and `full` the complete closed set, or does P6 introduce a third named profile (e.g. `fast`/`lean`)? | **(a)** Two profiles only (`solo`, `full`) — closed vocabulary matches the existing `profile.js` implementation and tests. **(b)** Add a third `lean`/`fast` profile that inlines cheap phases (specification) but keeps construction + harness as agent — a "middle ground" bundle. **(c)** Profiles are open-ended; any string is accepted and maps to a custom per-archetype policy declared in the manifest. | **(a)** | YAGNI: the three-level `execution:` precedence already lets a repo build any lean mix by setting `execution: inline` at the top level with per-phase agent overrides — no named profile required. A third profile adds vocabulary surface and tests without delivering capability the precedence system cannot already express. Option (c) is a design-system change far beyond P6 scope. |
| DC-3 | **Per-invocation args mechanism** — how do `--profile`/`--skip` CLI flags reach the resolver and compose with the manifest? | **(a)** Orchestrator parses flags from `$ARGUMENTS` (step 0), then passes them as extra CLI args to `pipeline-resolve.js` (`--profile solo --skip refactor`); `pipeline-resolve.js` merges them at highest precedence before computing `Resolution`. The 7-export engine module surface stays untouched; the bin gains two optional flags. **(b)** Orchestrator parses flags from `$ARGUMENTS` (step 0) and writes an ephemeral merged-manifest overlay to a `mktemp` file; passes `--manifest <tmp>` to `pipeline-resolve.js`. No bin API change; the merge logic lives in the walk SKILL.md prose. **(c)** Flags are parsed and applied in the walk itself — the orchestrator adjusts `phase.execution` and `effective[]` in-session after calling `pipeline-resolve.js`, without touching the bin. Engine resolution is unaware of CLI flags; walk post-processes its output. | **(a)** | Option (a) keeps the authoritative merge in the engine's deterministic layer (unit-testable, pure) and makes the bin the single source of all precedence logic. The bin change is additive (two optional flags) and does not touch the 7-export module surface. Option (b) requires the walk to construct valid YAML/JSON manifest syntax at runtime, coupling prose to the manifest schema and making errors hard to surface. Option (c) duplicates precedence logic between the engine (for module users) and the walk (for CLI users), violating DRY and creating a drift risk. |
| DC-4 | **Scenario coverage beyond S1** — does P6 need additional tests on top of S1 + `contract-equivalence.test.js`? | **(a)** Minimal: add only a `profile:full` resolution assertion (cheap, symmetric, closes the closed-vocabulary gap; though SC1 already proves all-agent, `full` as an explicit profile value is untested by name). **(b)** Minimal + walk-level inline-fidelity check: a prose-verified "session runs a design phase inline, artifact is committed" scenario in the run record — not a unit test (the walk is a skill, not a Node function), documented as a manual acceptance check. **(c)** No new tests: S1 proves solo→inline execution values; the equivalence guard proves inline block correctness; SC1 proves full-agent; the walk-level claim (inline produces same artifact as agent) rests on R3 + R1 prose alone. | **(a)** | Option (a) adds one deterministic test that closes the `profile:full` named-value gap at low cost and without touching the walk layer. Option (b) adds a manual-only check that cannot be CI-gated and is already covered by R8's prose claim. Option (c) leaves a named-value gap (a `profile:full` typo in the manifest would silently throw instead of being characterized), even though SC1 covers the equivalent behavior. |

### Decisions resolved (ADRs 020–023)

The ADR conversation settled the candidates above. Where the choice diverged from the designer's
recommendation it is flagged:

| DC | Chosen | ADR | Note |
|---|---|---|---|
| DC-1 | **(a)** load `agents/<role>.md` craft in-thread for inline phases | 020 | as recommended |
| DC-2 | **bake `lean` into the closed vocab** (`solo\|full\|lean`); `expandProfile` → per-archetype map; harness-agent promoted to an unconditional invariant | 021 | **diverged** from the designer's "two only" — but `lean` ships explicitly as *derivable sugar*: `execution: inline` + `phases.{implementation,refactoring}.execution: agent` reproduces it, documented in the DX surface |
| DC-3 | **(a)** orchestrator parses `$ARGUMENTS` flags → passes to `pipeline-resolve.js`; the bin merges at highest precedence (`--profile` overrides, `--skip` unions) | 022 | as recommended; 7-export surface + `pipeline/default.yml` untouched |
| DC-4 | **(b)** S-lean + S-full + bin flag-precedence tests + a recorded manual acceptance check | 023 | one step past the designer's minimal (a) — adds the recorded walk-level dogfood check |

`lean` map (per ADR-021): setup inline · specification inline · construction **agent** · refinement
**agent** · delivery inline · harness **agent**.

---

## Test strategy

### Already green (do not duplicate)

- `engine/test/scenarios.test.js` — S1: profile:solo → non-harness inline, harness agent. SC1:
  zero-config all-agent.
- `engine/test/contract-equivalence.test.js` — per-descriptor: agent-vs-inline block differs by
  exactly two carve-out lines.

### P6 additions

**If DC-4(a) chosen (recommended):** add one scenario test in `engine/test/scenarios.test.js`:

```
S-full Given profile:full manifest, when resolvePipeline runs, then all effective phases are agent
```

Fixture: `engine/test/fixtures/scenarios/S-full/manifest.yml` with `pipeline.profile: full`.

**If DC-3(a) chosen (recommended):** add tests in `engine/test/pipeline-resolve.bin.test.js` (or
a new `cli.test.js`):

```
Given --profile solo flag, when pipeline-resolve bin runs, then non-harness phases are inline
Given --skip refactor flag, when pipeline-resolve bin runs, then refactoring is absent from effective[]
Given both --profile solo and manifest profile:full, when pipeline-resolve bin runs, then CLI wins (solo)
```

These test the bin's flag-parsing + merge, not the pure module (which is already covered).

**Walk-level:** no unit tests (the walk is a skill, not a Node function). The inline-fidelity
claim (an inline phase produces the same committed artifact) is a design guarantee maintained by:
(1) same injected block body (equivalence guard), (2) same role craft (DC-1 option a), (3) same
gate mechanics (SKILL.md step 5 unchanged).

### Manual acceptance check (inline fidelity) — ADR-023 §4

Not CI-gated; run on demand and as a release smoke test:

1. Invoke craft with `--profile lean` (or `solo`) on a real feature brief.
2. Confirm each inline phase commits its artifact in the **same shape** as the agent path would —
   the injected block differs only by the two carve-out lines (artifact-handoff, model), which
   `engine/test/contract-equivalence.test.js` already pins per descriptor; the role craft is the
   same agent body either way (ADR-020).
3. Record the outcome in the run record under `inline-fidelity-check`.

The orchestrator references this procedure from `skills/run/SKILL.md` ("Manual acceptance check").

---

## Out of scope

| Item | Why excluded |
|---|---|
| The resolution layer (`profile.js`, `resolve.js`, `descriptor.js`) | Already built and green; P6 does not touch the 7-export engine module surface |
| `contract.js` carve-out mechanism | Done in P5; the two carve-out lines and their inline variants are frozen |
| A third named profile (`fast`/`lean`) | YAGNI; three-level `execution:` precedence covers the same semantic space without new vocabulary (DC-2) |
| Multi-dimension harness parallelism under `solo` | The harness-stays-agent caveat in `applyProfileToArchetype` already handles this; no walk change needed |
| The harness walk (review fan-out, validation background triage) | Those archetype duties are specified in SKILL.md step 4 already; P6 only adds the inline dispatch branch |
| Model resolution and fallback logic | Unchanged; inline carve-out is already encoded in `core.md` and the equivalence guard |
| P7 pipeline editing (skip/insert/reorder via manifest) | Separate phase; P6 per-invocation `--skip` is only the CLI overlay, not the full editing surface |
| P8 harness config (dimensions/passes/convergence) | Separate phase |
| P9 agent/skill swap via manifest | Separate phase |
| DX docs (mental model guide, injection catalog) | P12 |
