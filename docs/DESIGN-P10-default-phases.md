# Design — P10: make `requirements` & `architecture` default phases runnable

> Brief: P10 authors the two missing agents + two skill procedures + examples + docs + tests
> so the default-off `requirements` (specification/producer) and `architecture`
> (harness/dependency-cruiser) phases dispatch end-to-end when a manifest enables them.
> Both stay default-off. No `engine/src` change is needed.
> Status: draft → self-reviewed ×3 → accepted → revised against ADRs 048–053

## Context

craft's pipeline is a set of phase **descriptors** in `pipeline/default.yml`. Two of
them already exist but ship `enabled: false`:

- `requirements` — archetype `specification`, contract `[producer]`, procedure
  `craft:requirements`, role `craft:requirements-writer`, consumes `[workspace]`,
  produces `[requirements]` (`pipeline/default.yml:8-18`).
- `architecture` — archetype `harness`, contract `[harness-exec]`, procedure
  `craft:architecture`, role `craft:architecture-triager`, consumes `[change]`,
  produces `[architecture-report]`, `gate: <arch gate>`, `harness: { tool: dependency-cruiser }`
  (`pipeline/default.yml:118-131`).

The **resolution layer** already accepts both when enabled — scenarios S4/S5
(`engine/test/fixtures/scenarios/S4|S5/manifest.yml`, one line each) drive the
resolver-direct tests in `engine/test/scenarios.test.js:348-416`, which are GREEN. The
gap is **dispatch**, not resolution:

1. **Live `roleExists` fails closed.** The orchestrator (`skills/run/SKILL.md` step 1b)
   runs `engine/bin/pipeline-resolve.js` with the live `roleExists` probe
   (`engine/bin/pipeline-resolve.js:12-19`): a `craft:` role must resolve to
   `agents/<name>.md`. No `agents/requirements-writer.md` / `agents/architecture-triager.md`
   exist, so a real `/craft:run` with either enabled exits non-zero before the walk
   (empirically pinned below).
2. **No skill dir → the walk would STOP.** `skills/run/SKILL.md:86,189` say verbatim:
   "`requirements` and `architecture` are default-off and have no skill dir until P10",
   and an enabled-pre-P10 phase STOPs with "procedure `<...>` resolves to no installed
   skill". P10 creates `skills/requirements/` and `skills/architecture/` to flip that
   STOP into a dispatch.

What P10 must mirror (read before designing — done):

- **Producer agent shape** — `agents/designer.md`, `agents/planner.md`: thin (identity +
  craft only; no invariant text — the engine injects the P5 contract around the agent, G5).
  `requirements-writer` mirrors `designer`.
- **Harness-triager shape** — `agents/validation-triager.md`: thin triager.
  `architecture-triager` mirrors it (triage layering/dependency violations: fix the edge,
  or document an accepted exception per the tool's convention).
- **Specification-producer skill** — `skills/design/SKILL.md`: preamble = manifest read +
  probe the doc dir/template; procedure = spawn the producer, read the doc, verify the
  commit, record. `skills/requirements/SKILL.md` mirrors it.
- **Executing-harness skill** — `skills/validation/SKILL.md`: preamble = read
  `phase.harness` knobs then PROBE for the tool config, **no-op-with-note if absent (a
  manifest may never pre-empt the probe)**; procedure = run scoped, gate `propose` on
  triage. `skills/architecture/SKILL.md` mirrors it, MINUS the mutation-specific
  background-run + `.craft-mutation.lock` machinery (dependency-cruiser is a fast static
  check, not a slow mutation run).
- **Examples** — `examples/role-swap/workflow.md`, `examples/lean-profile/workflow.md`,
  `examples/README.md`: one-line Tier-0 enable (`phases.<id>.enabled: true`), a table, a
  closing `> In your real repo this file lives at the project root as .claude/workflow.md`.

Constraining decisions / docs:
- PRD `docs/PRD-customizable-engine.md` §6.4 (vocabulary: `requirements`←*(new, opt)*,
  `architecture`←*(new, opt)*), §8 line 284-287 (architecture is a **standalone harness
  phase**, NOT a `review` dimension; `dependency-cruiser`), §17 P10 row line 522 (gate:
  **S4,S5 green**); guarantees G2 (optional requirements phase) and G3 (generic vocabulary).
- ADR-037 (role-existence engine probe), ADR-040 (default-phase `procedure:` override),
  ADR-005 (waivers), ADR-036 (`.craft-mutation.lock` naming — the lock the architecture
  skill must NOT clone).

### Pinned matrix — external + engine behaviour (empirical, this session)

All run from this worktree against the current tree (state-mutating probes used a
mktemp throwaway; none of the below wrote repo state).

| Probe | Command | Result |
|---|---|---|
| Live `roleExists`, requirements ON | `node engine/bin/pipeline-resolve.js pipeline/default.yml engine/test/fixtures/scenarios/S4/manifest.yml` | **exit 2** — stderr: `phases.requirements.role: "craft:requirements-writer" does not resolve to an installed agent` (the RED P10 inverts) |
| Live `roleExists`, architecture ON | `… scenarios/S5/manifest.yml` | **exit 2** — stderr: `phases.architecture.role: "craft:architecture-triager" does not resolve to an installed agent` |
| Resolver-direct S4/S5 (no live probe) | `engine/test/scenarios.test.js:348-416` | **GREEN** (these call `resolvePipeline` without `roleExists`; unaffected) |
| Contract assemble, requirements | `node engine/bin/contract-assemble.js --descriptor-id requirements` | **exit 0** — emits the **producer** bundle (core invariants + "Fill the named template…", "Decision-candidates section is mandatory", pre-chewed-context, self-review-to-convergence) |
| Contract assemble, architecture | `node engine/bin/contract-assemble.js --descriptor-id architecture` | **exit 0** — emits the **harness-exec** bundle ("A tool runs; the AI triages survivors or violations: kill with a test or prove provable equivalence…", "Never weaken a test to kill a mutant or clear a violation", "Gate-green before commit") |
| `paths` sub-validation | `engine/src/manifest.js:309-337` | `paths` is a recognized TOP_KEY with **no sub-validation** (line 337 comment) → `paths.requirements` accepted free; no engine change to honour it |
| Alias | `engine/src/alias-map.js:11` | `prd → requirements` already mapped |
| dependency-cruiser installed here? | `npx --no-install depcruise --version` (mktemp cwd) + `command -v depcruise` | **absent** — not in this repo, not on PATH → the architecture probe **no-ops with a note** in THIS repo (in scope; this repo ships no `.dependency-cruiser.json` and stays default-off) |

**Conclusion pinned:** no `engine/src` edit is required. Descriptors, manifest
`paths` passthrough, both contract bundles, and the alias all already exist and behave.
The only gaps are the four authored files (2 agents + 2 skills), plus examples, docs,
tests, and the CI test-count bump. The harness-exec bundle's triage language ("survivors
or violations") already covers a violation-triaging harness — architecture needs no new
contract fragment.

## Requirements

When this ships, all of the following are verifiable:

1. `agents/requirements-writer.md` and `agents/architecture-triager.md` exist, are thin
   (identity + craft only — no duplicated invariant text, G5), and carry a `model:` pin.
2. `skills/requirements/SKILL.md` and `skills/architecture/SKILL.md` exist with the
   house preamble/procedure structure; the procedure name matches the dir
   (`craft:requirements` ↔ `skills/requirements/`, `craft:architecture` ↔
   `skills/architecture/`) so the walk's `procedure → skills/<id>/` dispatch resolves.
3. A live `pipeline-resolve` with **requirements enabled** exits **0** (the inverse of
   today's exit-2 RED) — because `agents/requirements-writer.md` now exists. Same for
   **architecture enabled** and `agents/architecture-triager.md`.
4. `contract-assemble --descriptor-id requirements` and `--descriptor-id architecture`
   both still exit 0 with the producer / harness-exec bundle respectively (regression pin).
5. S4 and S5 resolver-direct tests stay GREEN (no descriptor change).
6. Both phases remain **default-off** (`enabled: false` unchanged in `pipeline/default.yml`).
7. The `requirements` skill probes a doc dir (`paths.requirements`, else
   `docs/requirements/`) and a template, then spawns the producer; it produces a
   `requirements` artifact that the `design` phase consumes when requirements is ON
   (the `design` descriptor's `self_supply: [requirements]` already encodes the OFF
   fallback — design captures requirements in its own section). `skills/design/SKILL.md`'s
   preamble carries a one-line note (ADR-053/DC-7) making that ON-consumption explicit:
   *if a `requirements` artifact was produced this run, treat it as a hard input; else
   self-supply* — no descriptor/logic change.
8. The `architecture` skill reads `phase.harness.tool`/`scope`, PROBES for the
   dependency-cruiser config, **no-ops with a note when absent** (so it is safe to enable
   in a repo that has not yet authored a config), runs **synchronously** (no
   `.craft-mutation.lock` analog), and gates `propose` via triage — the `harness-exec`
   `awaitingHarnesses` path the resolver already wires (S5 test, line 403-416).
9. Two examples (`examples/requirements/`, `examples/architecture/`) show the one-line
   Tier-0 enable (`phases.<id>.enabled: true`) for personas S4 (spec-driven team) and S5
   (architecture-led team), plus an `examples/README.md` index row each — matching the
   `lean-profile` example shape (frontmatter opt-in + a small table + the closing
   `> In your real repo this file lives at the project root as .claude/workflow.md`).
10. The PRD/DX docs note both phases are now runnable-when-enabled (still default-off).
11. `scripts/ci.sh` `EXPECTED_TESTS` and the test suite reconcile (count bumped by the
    tests P10 adds).

## Design

### Surface map (what P10 creates / edits)

| File | Action | Mirror |
|---|---|---|
| `agents/requirements-writer.md` | **create** | `agents/designer.md` |
| `agents/architecture-triager.md` | **create** | `agents/validation-triager.md` |
| `skills/requirements/SKILL.md` | **create** | `skills/design/SKILL.md` |
| `skills/architecture/SKILL.md` | **create** | `skills/validation/SKILL.md` (minus lock/background) |
| `skills/design/SKILL.md` | **edit** — one-line preamble note: consume a produced `requirements` artifact as a hard input, else self-supply (ADR-053/DC-7) | existing preamble probe step |
| `templates/requirements.md` | **create** (see DC-1) | `templates/design.md` (small) |
| `examples/requirements/workflow.md` | **create** | `examples/lean-profile/workflow.md` (one-line manifest opt-in shape) |
| `examples/architecture/workflow.md` | **create** | `examples/lean-profile/workflow.md` (one-line manifest opt-in shape) |
| `examples/README.md` | **edit** — add two index rows | existing rows |
| `docs/PRD-customizable-engine.md` | **edit** — P10 status note (runnable-when-enabled) | §17 row / §8 |
| `engine/test/*` and/or `test/*.bats` | **create/extend** — walk-level acceptance (see Test strategy) | `engine/test/pipeline-resolve.bin.test.js` |
| `scripts/ci.sh` | **edit** — bump `EXPECTED_TESTS` | line 10 |
| `pipeline/default.yml` | **no change** | descriptors already present |
| `engine/src/*` | **no change** | confirmed (pinned matrix) |

### `agents/requirements-writer.md` (producer)

Mirrors `designer` exactly in shape: frontmatter (`name`, `description` ending "Spawned
by the craft requirements phase — do not auto-select.", `model:` per DC-4), then a thin
body — one paragraph of identity + a `Contract:` list that states only what is *specific*
to capturing product requirements (read the brief / any source PRD/spec; capture
verifiable requirements not aspirations; **Decision-candidates section mandatory** — the
producer bundle already injects this, so the body must NOT restate it; commit with the
named message; final message = doc path + decision candidates). It must NOT re-state the
core invariants — the engine injects the producer bundle around it (proven exit-0 above).

The captured requirements doc IS the artifact `requirements` that `design` consumes.

### `agents/architecture-triager.md` (harness-triager)

Mirrors `validation-triager` in shape (frontmatter + thin body) but pins `model: opus`
(ADR-051/DC-4 — user override; see the requirements-writer section). The job: triage
dependency-cruiser **violations** (forbidden edges, layering breaches, orphans per the
repo's rule set). Per violation, in order: (1) verify it is real (the tool can mis-report
— follow any context-block triage procedure first); (2) if real, **fix the offending
edge** (the structural change that removes the violation) under the same RED→GREEN gate
the contract names; (3) only if the edge is a deliberate, justified exception, **document
it inline using dependency-cruiser's own exception convention** (a scoped rule / allowed
override in the config), with one line of why (see DC-3 for the exact convention). It must
NOT weaken a rule to clear a violation (the harness-exec bundle already forbids this).
Final message = per-violation outcome (FIXED / EXCEPTION(proof) / FALSE / blocker).

### `skills/requirements/SKILL.md` (specification-producer)

Structure mirrors `skills/design/SKILL.md`:

- **Preamble (always runs — non-overridable):**
  1. Manifest-lint/read (skip lint if the orchestrator already ran it this turn);
     standalone scope = current branch vs default branch.
  2. Probe: requirements doc directory (`paths.requirements`, else `docs/requirements/`,
     create if absent — DC-6); the repo's own requirements template, else
     `"${CLAUDE_PLUGIN_ROOT}/templates/requirements.md"`.
- **Procedure (default body — a manifest `override:` replaces everything below):**
  1. Spawn **craft:requirements-writer** with: the resolved brief (and any source
     PRD/spec path); the absolute working dir; the output path
     `<requirements-dir>/<slug>.md`; the template; the commit message
     `docs(requirements): <slug>`; global + requirements-phase `context:` files verbatim.
  2. When it returns: READ THE DOC; sanity-check against the brief; verify the commit and
     the Decision-candidates section.
  3. Carry the captured requirements forward; the **`design` phase consumes the produced
     `requirements` artifact** (DC-7). Record the outcome.
  4. Dead agent → respawn fresh from the brief + whatever the doc already contains.

### `skills/architecture/SKILL.md` (executing-harness, synchronous)

Structure mirrors `skills/validation/SKILL.md` with the KEY DIFFERENCE called out: a
fast static check, run **synchronously** (no background run, **no lock**):

- **Preamble (always runs — non-overridable):**
  1. Manifest read (lint if standalone). Standalone scope = current branch vs default.
  2. **Read harness knobs** from `phase.harness` (resolved descriptor): `tool`
     (`dependency-cruiser`), optional `scope`, optional `rules` (the config path). Then
     **probe: dependency-cruiser config present?** (a `.dependency-cruiser.{json,js,cjs}`
     or the `rules:` path the manifest names, AND the binary resolvable). Absent →
     **no-op with a note** in the run record; the phase ends here. *A manifest may never
     pre-empt this probe.* (In THIS repo: absent → no-ops, by design — out of scope below.)
- **Procedure (default body — a manifest `override:` replaces everything below):**
  1. **Run dependency-cruiser synchronously**, scoped per `phase.harness.scope` when set
     (default: the change's touched code, never wider; the static check is cheap enough
     that a tight scope is preferred but not lock-protected). Capture the violation report.
     No `.craft-mutation.lock` — the run is synchronous; nothing to lock against teardown
     (DC-2; ADR-036's lock is mutation-specific and is NOT cloned here).
  2. **The PR waits for triage** (orchestrator invariant, unchanged): the `harness-exec`
     contract makes `architecture` an executing-harness, so the resolver already adds it
     to `propose.awaitingHarnesses` (S5 test line 403-416). On a non-empty violation set,
     spawn **craft:architecture-triager** with: the violations; the gate; the commit
     message `fix(architecture): <scope>` (or `chore(architecture): <scope>` for an
     exception-only landing); global + architecture-phase `context:` files verbatim
     (tool-specific triage procedure included).
  3. Verify the triager's commit; run the phase gate (`<arch gate>` — DC-3 pins what this
     resolves to); record per-violation outcomes.
  4. (No "never destroy worktree while run is alive" clause — there is no live background
     run to protect.)

### Flow when each phase is ON

- **requirements ON:** walk order is `… workspace → requirements → design …`. The
  `requirements` phase produces the `requirements` artifact; `design` consumes it
  (descriptor `consumes: [workspace, requirements]`). To make the consumption path
  explicit at its point of use, `skills/design/SKILL.md`'s preamble gains one line
  (ADR-053/DC-7): *if a `requirements` artifact was produced this run, treat it as a hard
  input (read it, design against it); else self-supply requirements in the design doc's own
  section.* With requirements OFF (default), `design`'s `self_supply: [requirements]` makes
  design self-supply — it captures requirements in its own section (today's behaviour,
  unchanged). This is the single behavioural edit to an existing default-phase skill in P10;
  it changes no descriptor and no logic — the descriptor remains the SoT.
- **architecture ON:** the harness runs after `change` exists (consumes `[change]`); its
  triage gates `propose` alongside `validation` — the resolver already enforces this
  (S5 line 403-416: `propose` awaits both). With architecture OFF (default), nothing runs
  and `propose` does not wait on it.

### Error semantics (inherited, not re-implemented)

- Unknown/typo'd `craft:` role → `pipeline-resolve` exit 2 (ADR-037). After P10 the two
  real roles resolve, so enabling them no longer trips this.
- Missing skill dir → walk STOP "procedure resolves to no installed skill". P10's two
  skill dirs remove this STOP for the two phases.
- architecture config absent → skill **no-ops with a note** (probe-first; never a hard
  fail) — so the phase is safe to enable in a repo mid-adoption.
- A skipped/disabled architecture → waiver releases the `propose` gate (ADR-005;
  `WAIVABLE_PHASE_IDS` in `engine/src/gates.js:16` already lists `architecture`).

## Decision candidates

| # | Choice | Alternatives (≤3) | Recommendation | Why |
|---|---|---|---|---|
| 1 | requirements artifact form + output path + a new `templates/requirements.md`? | (a) new small `templates/requirements.md` (product-requirements capture), output `docs/requirements/<slug>.md`; (b) reuse design's "Requirements"-section shape (no new template), output under design dir; (c) no template — free-form doc | **(a)** | Mirrors the design skill's "probe template, else plugin template" preamble; gives requirements a first-class artifact `design` can consume; no engine change (`paths`/alias already there). |
| 2 | architecture run model: synchronous vs background-with-lock | (a) synchronous, no lock; (b) background run + a `.craft-arch.lock` analog of `.craft-mutation.lock`; (c) synchronous but reuse `.craft-mutation.lock` | **(a)** | dependency-cruiser is a fast static check, not a slow mutation grind; the propose-gate still holds via `harness-exec` + `awaitingHarnesses`. Cloning the lock (b/c) is needless machinery and (c) collides with mutation's lock semantics. |
| 3 | architecture report artifact form + where the triager records accepted exceptions + what `<arch gate>` resolves to | (a) report = the depcruise violation output captured in the run record (no committed file); exceptions recorded via dependency-cruiser's own config `from/to` rule overrides; `<arch gate>` resolves to "depcruise exits 0 on scope"; (b) committed `docs/architecture/<slug>.md` report + inline `# dependency-cruiser-disable`-style exception comments; (c) report = run-record only; exceptions in a sidecar `architecture-exceptions.md` | **(a)** | Matches validation (no committed report; outcomes in the run record). dependency-cruiser's native exception home is its rule config, keeping "one home per concern". The gate is the tool's own exit status, consistent with the `<validation gate>` descriptor placeholder being the harness's own gate. |
| 4 | Agent model pins | requirements-writer: opus (mirror designer) \| sonnet (lighter capture); architecture-triager: sonnet (mirror validation-triager) \| opus | **RATIFIED ADR-051 — both `model: opus`** (designer recommended requirements-writer=opus, architecture-triager=sonnet; ⚑ user overrode). | Architecture-triage reasons about dependency/layering structure — a producer-grade structural-reasoning task, not mechanical mutant-killing — so it warrants opus; uniformity with requirements-writer is a bonus. Resolution stays manifest `models.<agent>` → this pin → `models.fallback` → engine default (ADR-041), so a cost-sensitive repo routes either down in one line. |
| 5 | Test surface beyond S4/S5 | (a) extend `engine/test/pipeline-resolve.bin.test.js` with live-bin "enabled → exit 0" tests for both phases + a structural test asserting the agent files & skill dirs exist + contract-assemble exit-0 pins, and add an agent-thinness/no-duplication assertion; (b) put structural existence checks in a new `test/*.bats` and bin tests in `engine/test`; (c) only S4/S5 (no new tests) | **(a)** with structural existence assertions; consider splitting the file-existence + thinness checks into bats (b) if they read more naturally as shell. | The live-bin exit-0 test is the exact inverse of today's pinned RED and is the load-bearing acceptance. Structural checks guard the four authored files. `bin` tests belong with the other `pipeline-resolve.bin.test.js` cases. The planner will fold/standalone these per ADR-044 (test-infra/docs-only slices may stand alone). |
| 6 | `paths.requirements` probe vs hardcode `docs/requirements/` | (a) probe `paths.requirements` else default `docs/requirements/`; (b) hardcode `docs/requirements/` | **(a)** | `paths` is unvalidated passthrough (pinned) — either works, but mirroring the design/planning skills' "`paths.<x>` else default" keeps the house style and lets a repo relocate the artifact with no engine change. |
| 7 | Does `design`'s behaviour need a note for consuming a produced requirements doc when requirements is ON? | (a) one line in `skills/design/SKILL.md` preamble: "if a `requirements` artifact was produced this run, treat it as a hard input; else self-supply"; (b) no change (self_supply already encodes OFF; ON consumption is implicit via `consumes`); (c) note it only in the requirements skill | **RATIFIED ADR-053 — (a)** (designer recommended (b), optionally (a); ⚑ user chose to add the note). | The descriptor's `consumes`/`self_supply` already encodes both paths, but a reader of the design skill alone would not see that an upstream requirements doc can be a hard input. The one-line preamble note documents the ADR-048 consumption path at its point of use; it defers to "if produced" so it cannot drift from the descriptor (still the SoT). This is the single behavioural edit to an existing default-phase skill in P10. |

## Test strategy

Invariant: **S4/S5 resolver-direct tests stay GREEN** (no descriptor change — verify by
running them unchanged). ADD walk-level *acceptance* that the dispatch gap is closed:

1. **Live-bin acceptance (the inverse RED), in `engine/test/pipeline-resolve.bin.test.js`:**
   - Given requirements enabled (reuse `engine/test/fixtures/scenarios/S4/manifest.yml`
     or an equivalent `fixtures/manifests/` file), when `pipeline-resolve.js` runs, then
     **exit 0** and `effective[]` includes `requirements`. *RED today: exit 2 with
     `"craft:requirements-writer" does not resolve` (pinned). GREEN once
     `agents/requirements-writer.md` exists.*
   - Given architecture enabled, same shape → **exit 0**, `effective[]` includes
     `architecture`. *RED today: exit 2 on `craft:architecture-triager`.*
   These mirror the existing `roleExists` good/bad-role bin tests (lines 110-161) and use
   the same `run(...)` + `spawnSync` harness.
2. **Structural existence assertions** (the four authored files): `agents/requirements-writer.md`,
   `agents/architecture-triager.md`, `skills/requirements/SKILL.md`,
   `skills/architecture/SKILL.md` exist; the procedure↔dir name match holds
   (`procedure: craft:requirements` → `skills/requirements/`). Home per DC-5 (bin/JS test
   or `test/*.bats`).
3. **Agent-thinness / no-duplication assertion**: the two new agent bodies do NOT restate
   the injected core invariants (e.g. assert the body does not contain the bundle's
   "Never commit on a red gate" / "No suppression directives" lines — those come from the
   contract, not the agent; G5).
4. **`contract-assemble` regression pins**: `--descriptor-id requirements` → exit 0 +
   producer-bundle marker; `--descriptor-id architecture` → exit 0 + harness-exec marker.
   (Guards against a descriptor edit silently changing the bundle.)
5. **Count reconciliation**: bump `scripts/ci.sh` `EXPECTED_TESTS` (currently 418, line 10)
   by exactly the number of `node --test` cases added; CI asserts `# tests` equals it
   (ADR-046). **Pinned correction to the P10 brief:** the expected count lives **only** in
   `scripts/ci.sh` — `engine/package.json`'s `test` script is the bare glob
   `node --test 'test/**/*.test.js'` with *no* count to bump (verified). So the bump is a
   one-file edit, not two. bats cases are counted by `bats` in a separate ci.sh gate, not
   by the node counter — keep the split in mind: only `node --test` cases move the number.

The structural checks (existence + procedure↔dir-name + agent-thinness) land as
`test/*.bats` (ADR-052) — keeping the two-runner split (`node --test` count in
`scripts/ci.sh`; bats counted by the separate bats gate). ADR-052 also **parks** a
user-requested follow-up — *evaluate migrating the bats suite to `node --test` (JS) for
portability* (bats needs bash; `node --test` runs anywhere Node does, and a single runner
removes the two-counter split). It is **not** actioned in P10; it lands in `BACKLOG.md`
(parked) at the documentation phase — see Out of scope.

No parser/round-trip/property lens applies (no new parser or wire format — the bundles
and resolver are unchanged). The edge matrix is: each phase {OFF (default) | ON}, each
agent {present (P10) | absent (pre-P10 RED)}, architecture config {present | absent → no-op}.

## Out of scope

- **P11 backlog adapter** — `requirements` may later be sourced from a backlog id; P10
  sources only from the brief / a spec path. (PRD §17 P11.)
- **P12 DX showcase docs** — the mental-model guide / injection catalog; P10 ships only
  the minimal example + PRD status note. (PRD §17 P12, Tier-2 gated after P14.)
- **P14 registration** — the live install-probe for *external* (`acme:`/`my:`) refs; P10
  only adds the two *craft-native* agents the existing live probe checks. (PRD §17 P14.)
- **Making either phase default-ON** — both stay `enabled: false`; enabling is a one-line
  Tier-0 manifest opt-in.
- **Authoring a real `.dependency-cruiser.json` for THIS repo** — this repo ships no
  dependency-cruiser config (pinned: binary absent), so the architecture probe **no-ops**
  here. A consuming repo authors its own config; P10 only makes the phase *runnable when a
  config exists*.
- **Any `engine/src` change** — confirmed unnecessary by the pinned matrix; if a real
  engine gap surfaces during planning it returns to the design as a new decision candidate
  rather than being assumed.
- **Migrating the bats suite to `node --test`** — ADR-052 parks a user-requested follow-up
  to evaluate moving the structural checks off bats (bash-only) onto `node --test` for
  portability and to collapse the two-counter split. It is **not** actioned in P10; it is
  recorded in `BACKLOG.md` (parked) at the documentation phase. P10 keeps the existing
  two-runner split as-is.
