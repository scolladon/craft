# Plan — P10: make `requirements` & `architecture` default phases runnable

> Source: design doc `docs/DESIGN-P10-default-phases.md` · ADRs 048, 049, 050, 051, 052, 053
> The plan is the implementation script AND the knowledge handoff. Slice agents start
> with zero context: whatever a slice block omits is paid later as agent rediscovery.
> `plan-lint.sh` enforces the schema below — the plan phase cannot close without it.

## Constraints and risks

### Public-surface decision (binding)

P10 is **pure authoring** — **NO `engine/src` change**, **NO new exported JS symbol**. The
pinned matrix in the design doc (§"Pinned matrix") proved: the two descriptors already exist
in `pipeline/default.yml` (`requirements` lines 8–18, `architecture` lines 118–131, both
`enabled: false`); `paths` is unvalidated passthrough; the `prd→requirements` alias exists;
both contract bundles already assemble (`requirements`→producer, `architecture`→harness-exec).
The only gaps are the four authored files (2 agents + 2 skills), one one-line edit to
`skills/design/SKILL.md`, a new template, examples, a README edit, and tests.

The "public surface" here is the plugin's authored files + the manifest-visible phase
enablement. There is no barrel/facade/registry to update — descriptors are the SoT and are
**unchanged**. The downstream surface gates that pre-pay this surface are already enumerated
and run in each slice's gate: `plan-lint`/`ci.sh` `EXPECTED_TESTS` count, `bats test/`,
`shellcheck`, `pipeline-lint`, `contracts-lint`. No new gate is introduced.

### Frozen surfaces (must stay green / byte-identical at every commit)

- `pipeline/default.yml` — **no change** (both descriptors already present, both
  `enabled: false`). Touching it is out of scope.
- `engine/src/*` — **no change** (confirmed by the pinned matrix).
- S4/S5 resolver-direct goldens (`engine/test/resolve.test.js:425–444` for requirements;
  the architecture record-note at `engine/test/resolve.test.js:457–467`) stay GREEN — they
  call `resolvePipeline` WITHOUT the live `roleExists` probe, so they are unaffected by the
  new agent files. Do not edit them.
- The existing `roleExists` good/bad/external/traversal bin cases
  (`engine/test/pipeline-resolve.bin.test.js:110–161`) stay GREEN — the two new agents only
  ADD resolvable craft refs; they remove nothing.
- Both phases remain **default-off**: no manifest edit makes them default-ON.

### Count-gate discipline (binding — re-stated per ADR-052)

`scripts/ci.sh:10` `EXPECTED_TESTS=418` is asserted by the `ci.sh` gate (line 18–22: parses
`# tests <N>` from `node --test` output and fails on drift). The count lives ONLY in
`scripts/ci.sh`; `engine/package.json`'s `test` script is the bare glob with NO count
(verified). **Every slice that adds `node --test` cases MUST bump `EXPECTED_TESTS` in that
same slice, or its own `ci.sh` gate goes red.** `bats` cases are counted by the SEPARATE
`bats test/` gate, NOT by this node counter — bats-only slices do NOT bump `EXPECTED_TESTS`.

Pinned baseline (run this session): `node --test` = **418**, `bats test/` = **43**.
Per-slice deltas: S1 `+2` node (→420), S2 `+2` node (→422), S3 `+0` node (bats only).

### Mirror map (exact files to clone the shape from)

| New / edited file | Mirror | Mirror path |
|---|---|---|
| `agents/requirements-writer.md` | `designer` (producer, `model: opus`) | `agents/designer.md` |
| `agents/architecture-triager.md` | `validation-triager` (triager) | `agents/validation-triager.md` |
| `skills/requirements/SKILL.md` | `craft:design` skill | `skills/design/SKILL.md` |
| `skills/architecture/SKILL.md` | `craft:validation` skill MINUS lock/background | `skills/validation/SKILL.md` |
| `skills/design/SKILL.md` (1-line edit) | its own preamble probe step | `skills/design/SKILL.md:14` region |
| `templates/requirements.md` | small design template | `templates/design.md` |
| `examples/requirements/workflow.md` | lean-profile example shape | `examples/lean-profile/workflow.md` |
| `examples/architecture/workflow.md` | lean-profile example shape | `examples/lean-profile/workflow.md` |
| `examples/README.md` (2 rows) | existing `## Examples` bullet rows | `examples/README.md:17–28` |

### Decision candidates

NONE open. ADRs 048–053 settle every load-bearing fork the design surfaced:
- ADR-048 — new `templates/requirements.md`, output `<paths.requirements|docs/requirements/>/<slug>.md`.
- ADR-049 — architecture runs **synchronously, no lock** (no `.craft-mutation.lock` analog).
- ADR-050 — architecture report = run-record only (no committed file); exceptions in
  dependency-cruiser's own rule config; `<arch gate>` = "depcruise exits 0 over the scope".
- ADR-051 — both new agents pin `model: opus`.
- ADR-052 — test surface: live-bin inverse-RED bin tests + contract-assemble pins
  (`node --test`) + structural checks (`bats`).
- ADR-053 — one-line note in `skills/design/SKILL.md` preamble for consuming a produced
  `requirements` artifact.

### Sizing rules & dependency order

- S1 (requirements vertical) and S2 (architecture vertical) are FEATURE slices: each lands an
  agent file, and its inverse-RED bin test flips RED→GREEN exactly when that agent file lands —
  so the bin test + contract pin fold INTO the slice that creates the agent (no standalone
  test-only slice). Each bumps `EXPECTED_TESTS` in-slice.
- S3 (structural bats + examples + README) is **test-infra/docs-only** — no `src/` delta, and
  the bats file is auto-discovered structural coverage of the four authored files plus the
  two new agents' thinness. It is a legitimate standalone per the template's test-infra/docs
  exception (ADR-044/ADR-052): there is no implementation slice to fold it into (it asserts
  ACROSS S1+S2's authored files), it adds no `node --test` case, and the examples/README are
  pure prose. It earns its lifecycle by guarding all four files' existence, the procedure↔dir
  name contract, and the G5 agent-thinness invariant in one pass.
- Strictly sequential, one shared working tree: **S1 → S2 → S3**. S1/S2 touch disjoint
  authored files (requirements-* vs architecture-*) but share `scripts/ci.sh` (the count
  bump) so they must land in order. S3 references the files S1/S2 created.

---

## Slice 1 — requirements vertical: template + producer agent + skill + design-skill note + bin/contract tests

### Context

Pure authoring + tests. NO `engine/src`, NO `pipeline/default.yml` change.

**File 1 — CREATE `templates/requirements.md`** (ADR-048; mirror the small shape of
`templates/design.md` which is: `# <title>` + `> Brief/Status` blockquote + `##` sections
each with an HTML-comment guidance line). This is a **product-requirements capture**, NOT a
design doc. Required sections (ADR-048 names them): Goals, Personas / user stories,
Acceptance criteria, Non-functional requirements, Out of scope. Keep guidance comments terse
(why-the-section, one line). Do NOT add a "Decision candidates" table here — the producer
bundle injects the decision-candidates mandate around the agent; the *requirements* doc
captures verifiable requirements, and the writer surfaces decision candidates in its final
message (see the design doc §"agents/requirements-writer.md"). Title line: `# Requirements — <topic>`.

**File 2 — CREATE `agents/requirements-writer.md`** (ADR-051; mirror `agents/designer.md`
EXACTLY in shape). Frontmatter: `name: requirements-writer`; `description:` one line ending
"Spawned by the craft requirements phase — do not auto-select." (mirror designer's
description verb-shape: "Writes the product-requirements doc from the resolved brief,
self-reviews to convergence, returns decision candidates."); `model: opus`. Body = thin:
one identity paragraph ("You write the product-requirements document for a feature. Your
invocation carries: the resolved brief (and any source PRD/spec path); the absolute working
directory (work ONLY there); the requirements-doc output path; the template to fill; and any
repo-specific context block — binding constraints.") + a `Contract:` list specific to
capturing requirements: read the brief / any source PRD or spec BEFORE writing; capture
**verifiable** requirements (acceptance-testable statements), not aspirations; commit the doc
with the conventional-commit message your invocation names; final message = the doc path +
the decision-candidates list, nothing else. **G5 — do NOT restate the injected core
invariants** (the producer bundle injects "Never commit on a red gate", "No suppression
directives", "Fill the named template", "Decision-candidates section is mandatory",
self-review-to-convergence, mktemp-probe — the body must NOT duplicate any of that). Verify
against `agents/designer.md` (21 lines) — your file should be the same length class.

**File 3 — CREATE `skills/requirements/SKILL.md`** (ADR-048; mirror `skills/design/SKILL.md`
which is: frontmatter `name`/`description` → `# craft:<id>` → `## Preamble (always runs —
non-overridable)` (2 numbered steps) → `## Procedure (default body — a manifest \`override:\`
replaces everything below)` (4 numbered steps)). Frontmatter: `name: requirements`;
`description:` mirror design's tense ("Craft phase 1.5 - produce the product-requirements doc
via the requirements-writer agent; returns decision candidates for the ADR conversation." —
or omit the phase number and say "the default-off requirements phase"; match design's style,
phase ordinal is cosmetic). Heading `# craft:requirements` — **this MUST exactly equal the
descriptor's `procedure: craft:requirements` so the walk's `procedure → skills/requirements/`
dispatch resolves** (design Requirement #2). Preamble: (1) `manifest-lint.sh` must pass (skip
if orchestrator already ran it this turn); read manifest; standalone scope = current branch
vs default. (2) Probe: requirements docs directory — `paths.requirements`, else
`docs/requirements/`, **create if absent** (ADR-048/DC-6); repo's own requirements template,
else `"${CLAUDE_PLUGIN_ROOT}/templates/requirements.md"`. Procedure: (1) Spawn
**craft:requirements-writer** with: the resolved brief (and any source PRD/spec path); the
absolute working directory; the output path `<requirements-dir>/<slug>.md`; the template; the
commit message **`docs(requirements): <slug>`**; the manifest's global + requirements-phase
`context:` files verbatim. (2) When it returns: READ THE DOC (not the agent's exploration);
sanity-check against the brief; verify the commit exists and the decision-candidates were
returned. (3) The **`design` phase consumes the produced `requirements` artifact** (ADR-053);
record the outcome in the run record. (4) Dead agent → respawn fresh from the brief + whatever
the doc already contains. Mirror design's exact step wording where it overlaps.

**File 4 — EDIT `skills/design/SKILL.md`** (ADR-053; ONE line only). Current preamble step 2
(line 13–14): "2. Probe: design docs directory (`paths.design`, else `docs/design/`, create
if absent); repo's own design template, else `"${CLAUDE_PLUGIN_ROOT}/templates/design.md"`."
ADD one sub-line in the preamble (keep it a probe-step note, not a logic change) stating: *if
a `requirements` artifact was produced this run, treat it as a hard input (read it, design
against it); else self-supply requirements in the design doc's own section.* Place it as a new
numbered step `3.` in the Preamble OR as a trailing clause on step 2 — match the file's
numbering. NO descriptor change, NO procedure-logic change; the descriptor's
`consumes`/`self_supply` stays the SoT and the note defers to "if produced".

**File 5 — EDIT `engine/test/pipeline-resolve.bin.test.js`** — ADD ONE live-bin case mirroring
the existing `good-role` case (lines 127–134: `run(...)` helper at line 12, `spawnSync` of
`pipeline-resolve.js`, `pipelinePath` const line 9, `manifestsDir` const line 10). The new
case uses the EXISTING fixture `engine/test/fixtures/manifests/enable-requirements.yml`
(content: `phases:\n  requirements:\n    enabled: true` — already used by
`resolve.test.js:427`). Title: `'Given a manifest with requirements enabled, when
pipeline-resolve runs, then it exits 0 and effective includes requirements'`. Body (AAA, `sut
= run`): `const result = sut(pipelinePath, join(manifestsDir, 'enable-requirements.yml'))`;
assert `result.status === 0` with `` `expected exit 0 but got ${result.status}; stderr:
${result.stderr}` ``; `const resolution = JSON.parse(result.stdout)`; assert
`resolution.effective.map(d => d.id).includes('requirements')`. **RED today** = exit 2,
stderr `phases.requirements.role: "craft:requirements-writer" does not resolve to an installed
agent` (pinned). **GREEN** once `agents/requirements-writer.md` exists (File 2).

**File 6 — EDIT `engine/test/contract-assemble.test.js`** — ADD ONE pin mirroring the
`design` producer-markers test (lines 33–43: `run(args)` helper line 11 runs
`contract-assemble.js` with `cwd: repoRoot`). Title: `'Given --descriptor-id requirements,
when contract-assemble runs, then exits 0 with producer markers'`. Body: `const result =
sut(['--descriptor-id', 'requirements'])`; assert `result.status === 0`; assert
`result.stdout.includes('Decision-candidates')` AND `result.stdout.includes('Fill the named
template')` (the exact producer-bundle marker bytes verified this session). Regression pin —
GREEN today; guards against a descriptor edit silently changing the bundle.

**File 7 — EDIT `scripts/ci.sh:10`** — `EXPECTED_TESTS=418` → `EXPECTED_TESTS=420` (this slice
adds exactly 2 `node --test` cases: File 5 + File 6).

### TDD steps

- RED: add File 5 (bin requirements exit-0 test). Run `cd engine && node --test
  'test/pipeline-resolve.bin.test.js'` → the new case FAILS (exit 2, stderr names
  `craft:requirements-writer does not resolve`). Add File 6 (contract-assemble requirements
  pin) — it PASSES already (bundle exists); that is the regression pin, expected green from
  the start.
- GREEN: create File 1 (`templates/requirements.md`), File 2
  (`agents/requirements-writer.md`). Re-run the bin test → now exit 0, `effective` includes
  `requirements` (the agent ref resolves). Create File 3 (`skills/requirements/SKILL.md`) and
  apply File 4 (the design-skill one-liner) — these carry no JS test but are the dispatch +
  consumption deliverables; they are verified structurally in S3.
- REFACTOR: re-read `agents/requirements-writer.md` against `agents/designer.md` — confirm no
  injected-core line is duplicated (G5) and the body is thin. Confirm
  `skills/requirements/SKILL.md`'s `# craft:requirements` heading matches the dir name
  `skills/requirements/`. Bump File 7 (`EXPECTED_TESTS=420`).

### Gate

- Targeted (per the JS/bin changes): `cd engine && node --test 'test/pipeline-resolve.bin.test.js' && node --test 'test/contract-assemble.test.js'`.
- Phase boundary (once for this slice): `scripts/ci.sh` (asserts `# tests` == 420, then bats
  + shellcheck + pipeline-lint + pipeline-resolve + contracts-lint). All must be green before
  commit; never `--no-verify`.

### Commit

`feat(craft): P10 requirements phase — template + producer agent + skill + design-consume note`

---

## Slice 2 — architecture vertical: harness-triager agent + skill + enable-architecture fixture + bin/contract tests

### Context

Pure authoring + tests. NO `engine/src`, NO `pipeline/default.yml` change. Builds on S1's
working tree.

**File 1 — CREATE `agents/architecture-triager.md`** (ADR-051; mirror
`agents/validation-triager.md` EXACTLY in shape — frontmatter + thin body, 25 lines). NOTE
the model divergence: validation-triager pins `model: sonnet`; this agent pins **`model:
opus`** (ADR-051 — user override; architecture triage is a structural-reasoning task).
Frontmatter: `name: architecture-triager`; `description:` one line ending "Spawned by the
craft architecture phase — do not auto-select." (mirror validation-triager's shape: "Triages
dependency-cruiser violations — fixes the offending edge or documents a justified exception in
the config."); `model: opus`. Body = thin: one identity paragraph ("You triage the violations
of a dependency-cruiser run. Your invocation carries: the absolute working directory (work
ONLY there); the violation report scoped to the change; the gate command(s); and any
repo-specific context block — binding constraints, including any tool-specific false-positive
triage procedure (follow it BEFORE fixing).") + a `Contract:` list (ADR-050 fixes the
per-violation order): for each violation, in order — (1) verify it is real per the context
block's triage procedure (the tool can mis-report; a false violation needs no fix); (2) if
real, **fix the offending edge** (the structural change that removes the violation) under the
RED→GREEN gate the contract names; (3) only if it is a deliberate, justified exception,
encode it in **dependency-cruiser's own rule config** (a scoped `from`/`to` allow/override)
with one line of why — **never weaken a rule wholesale** (the harness-exec bundle already
forbids this; do NOT restate it — G5); commit fixes as the conventional-commit message your
invocation names; final message = per violation — FIXED (edge), EXCEPTION (config override +
proof line), FALSE (triage evidence), or blocker. **G5 — do NOT restate the injected core
invariants** (the harness-exec bundle injects "Never commit on a red gate", "No suppression
directives", "Never weaken a test to kill a mutant or clear a violation", "Gate-green before
commit" — body must NOT duplicate any of it). Verify length against
`agents/validation-triager.md`.

**File 2 — CREATE `skills/architecture/SKILL.md`** (ADR-049/ADR-050; mirror
`skills/validation/SKILL.md` MINUS the background-run + `.craft-mutation.lock` + "never
destroy the worktree while the run is alive" clauses — dependency-cruiser is a fast static
check run SYNCHRONOUSLY). Frontmatter: `name: architecture`; `description:` mirror
validation's style ("Craft architecture phase - run dependency-cruiser over the change,
triage violations (fix the edge or document an exception); gates the PR. Also useful
standalone."). Heading `# craft:architecture` — **MUST exactly equal `procedure:
craft:architecture` from the descriptor** so the walk dispatches (design Requirement #2).
Preamble (always runs — non-overridable): (1) Manifest read (lint if standalone); standalone
scope = current branch vs default. (2) **Read harness knobs** from `phase.harness` (resolved
descriptor): `tool` (`dependency-cruiser`), optional `scope`, optional `rules` (config path).
Then **probe: dependency-cruiser config present?** — a `.dependency-cruiser.{json,js,cjs}` (or
the `rules:` path the manifest names) AND the binary resolvable (`npx --no-install depcruise
--version` / `command -v depcruise`). Absent → **no-op with a note** in the run record; the
phase ends here. *A manifest may never pre-empt this probe.* (Pinned: in THIS repo the binary
is absent → no-ops by design.) Procedure (default body — a manifest `override:` replaces
everything below): (1) **Run dependency-cruiser SYNCHRONOUSLY**, scoped per
`phase.harness.scope` when set (default: the change's touched code, never wider). Capture the
violation report. **No `.craft-mutation.lock`** — the run is synchronous; nothing to lock
against teardown (ADR-049; ADR-036's lock is mutation-specific and is NOT cloned here). (2)
**The PR waits for triage** (orchestrator invariant, unchanged): the `harness-exec` contract
makes `architecture` an executing harness, so the resolver already adds it to
`propose.awaitingHarnesses` (S5). On a non-empty violation set, spawn
**craft:architecture-triager** with: the violations; the gate; the commit message
**`fix(architecture): <scope>`** (or `chore(architecture): <scope>` for an exception-only
landing); the manifest's global + architecture-phase `context:` files verbatim (tool-specific
triage procedure included). (3) Verify the triager's commit; run the phase gate
(**`<arch gate>` = dependency-cruiser exits 0 over the scope**, ADR-050); record per-violation
outcomes in the run record. Do NOT include a "never destroy the worktree while the run is
alive" clause (no live background run to protect). Read `skills/validation/SKILL.md`
side-by-side and STRIP its lines 31–32 (background start + `.craft-mutation.lock` write) and
line 40–41 (worktree-teardown lock clause).

**File 3 — CREATE `engine/test/fixtures/manifests/enable-architecture.yml`** — mirror the
existing `enable-requirements.yml` (3 lines):
```yaml
phases:
  architecture:
    enabled: true
```

**File 4 — EDIT `engine/test/pipeline-resolve.bin.test.js`** — ADD ONE live-bin case
mirroring the requirements case from S1 (same `run`/`pipelinePath`/`manifestsDir`). Title:
`'Given a manifest with architecture enabled, when pipeline-resolve runs, then it exits 0 and
effective includes architecture'`. Body (AAA, `sut = run`): `const result = sut(pipelinePath,
join(manifestsDir, 'enable-architecture.yml'))`; assert `result.status === 0` with the stderr
message; `JSON.parse(result.stdout)`; assert `resolution.effective.map(d =>
d.id).includes('architecture')`. **RED today** = exit 2, stderr `phases.architecture.role:
"craft:architecture-triager" does not resolve to an installed agent` (pinned). **GREEN** once
`agents/architecture-triager.md` exists (File 1).

**File 5 — EDIT `engine/test/contract-assemble.test.js`** — ADD ONE pin mirroring the `review`
harness-read test (lines 162–171) but for the harness-EXEC bundle. Title: `'Given
--descriptor-id architecture, when contract-assemble runs, then exits 0 with harness-exec
markers'`. Body: `const result = sut(['--descriptor-id', 'architecture'])`; assert
`result.status === 0`; assert `result.stdout.includes('survivors or violations')` AND
`result.stdout.includes('Never weaken a test to kill a mutant or clear a violation')` (exact
harness-exec marker bytes verified this session). Regression pin — GREEN today.

**File 6 — EDIT `scripts/ci.sh:10`** — `EXPECTED_TESTS=420` → `EXPECTED_TESTS=422` (this slice
adds exactly 2 `node --test` cases: File 4 + File 5). NOTE: S1 already moved it from 418→420;
this slice moves 420→422.

### TDD steps

- RED: add File 3 (`enable-architecture.yml` fixture) and File 4 (bin architecture exit-0
  test). Run `cd engine && node --test 'test/pipeline-resolve.bin.test.js'` → the new case
  FAILS (exit 2, stderr names `craft:architecture-triager does not resolve`). Add File 5
  (contract-assemble architecture pin) — PASSES already (bundle exists), the regression pin.
- GREEN: create File 1 (`agents/architecture-triager.md`). Re-run the bin test → exit 0,
  `effective` includes `architecture`. Create File 2 (`skills/architecture/SKILL.md`) — the
  dispatch deliverable, verified structurally in S3.
- REFACTOR: re-read `agents/architecture-triager.md` against `agents/validation-triager.md` —
  confirm no injected-core line is duplicated (G5), `model: opus` (NOT sonnet), body thin.
  Confirm `skills/architecture/SKILL.md` has NO `.craft-mutation.lock` / background-run /
  worktree-lock clause and its heading matches the dir. Bump File 6 (`EXPECTED_TESTS=422`).

### Gate

- Targeted: `cd engine && node --test 'test/pipeline-resolve.bin.test.js' && node --test 'test/contract-assemble.test.js'`.
- Phase boundary (once for this slice): `scripts/ci.sh` (asserts `# tests` == 422, then bats
  + shellcheck + pipeline-lint + pipeline-resolve + contracts-lint). All green before commit;
  never `--no-verify`.

### Commit

`feat(craft): P10 architecture phase — harness-triager agent + synchronous skill (no lock)`

---

## Slice 3 — structural bats + examples + README index (test-infra/docs-only, standalone)

### Context

**Standalone, test-infra/docs-only — NO `src/` delta, NO `node --test` case, NO
`EXPECTED_TESTS` bump.** Justification against the template's exception (ADR-044/ADR-052): the
bats file asserts ACROSS the files S1 and S2 authored (it has no single implementation slice
to fold into); the examples + README are pure prose. It guards the four authored files'
existence, the procedure↔dir-name contract, and the G5 agent-thinness invariant in one
auto-discovered structural pass. Builds on S1+S2's working tree.

**File 1 — CREATE `test/p10-structure.bats`** (auto-discovered by `bats test/`; mirror
`test/manifest-lint.bats` / `test/smoke.bats` style: `#!/usr/bin/env bats` shebang, `@test
"Given … when … then …" { … }` blocks, `[ "$status" -eq 0 ]` assertions, `[[ "$output" ==
*"…"* ]]` substring checks). Resolve repo root via `${BATS_TEST_DIRNAME}/..` (the bats dir is
`<root>/test/`). The file needs NO `load helpers/…` (it does file/grep checks, not a
sourced helper). Required `@test` cases:
  1. *existence — requirements agent*: `[ -f "${ROOT}/agents/requirements-writer.md" ]`.
  2. *existence — architecture agent*: `[ -f "${ROOT}/agents/architecture-triager.md" ]`.
  3. *existence — requirements skill*: `[ -f "${ROOT}/skills/requirements/SKILL.md" ]`.
  4. *existence — architecture skill*: `[ -f "${ROOT}/skills/architecture/SKILL.md" ]`.
  5. *existence — requirements template*: `[ -f "${ROOT}/templates/requirements.md" ]`.
  6. *procedure↔dir match, requirements*: assert
     `skills/requirements/SKILL.md` contains the heading `# craft:requirements` — `grep -qx
     '# craft:requirements' "${ROOT}/skills/requirements/SKILL.md"` (the dir name
     `requirements` must equal the `craft:` procedure suffix so the walk dispatches).
  7. *procedure↔dir match, architecture*: `grep -qx '# craft:architecture'
     "${ROOT}/skills/architecture/SKILL.md"`.
  8. *agent thinness — requirements-writer does NOT restate injected core* (G5): assert the
     body does NOT contain `Never commit on a red gate` NOR `No suppression directives` —
     `! grep -q 'Never commit on a red gate' "${ROOT}/agents/requirements-writer.md"` and the
     same for the suppression line. (These are injected by the producer bundle, not the
     agent.)
  9. *agent thinness — architecture-triager does NOT restate injected core* (G5): same two
     greps against `agents/architecture-triager.md`.
  10. *architecture skill has no mutation-lock clone* (ADR-049): `! grep -q
      'craft-mutation.lock' "${ROOT}/skills/architecture/SKILL.md"` (the synchronous skill
      must NOT clone validation's lock).
  Use a `setup()` or a top-level `ROOT="$(cd "${BATS_TEST_DIRNAME}/.." && pwd)"` (mirror
  `manifest-lint.bats`'s `FIXTURES=` top-level assignment idiom). Keep each `@test` to a
  single behavioural assertion (AAA: arrange the path, run the check, assert).

**File 2 — CREATE `examples/requirements/workflow.md`** (mirror
`examples/lean-profile/workflow.md` shape: YAML frontmatter with a comment block + the
one-line opt-in, then `# Example — …` body, a small table, and the closing blockquote).
Persona: **S4 — a spec-driven team** that wants a first-class requirements capture before
design. Frontmatter (the Tier-0 one-line enable):
```yaml
---
# Injection point (PRD §7): phases.<id>.enabled — turn ON a default-off phase.
# The requirements phase captures product requirements as a first-class artifact that
# the design phase then consumes as a hard input (ADR-048/ADR-053). All-current.
phases:
  requirements:
    enabled: true
---
```
Body: one short paragraph (requirements is default-OFF; enabling it inserts a
`workspace → requirements → design …` step; the produced doc is what `design` reads); a small
table (Phase | default | with this manifest, showing `requirements` flipping
absent→present and `design` consuming it); closing
`> In your real repo this file lives at the project root as \`.claude/workflow.md\`.`

**File 3 — CREATE `examples/architecture/workflow.md`** (same mirror/shape). Persona: **S5 —
an architecture-led team** that gates the PR on dependency-cruiser. Frontmatter:
```yaml
---
# Injection point (PRD §7): phases.<id>.enabled — turn ON a default-off phase.
# The architecture phase runs dependency-cruiser over the change and triages violations;
# its triage gates the PR alongside validation. No-ops with a note if no depcruise config
# exists yet, so it is safe to enable mid-adoption (ADR-049/ADR-050). All-current.
phases:
  architecture:
    enabled: true
---
```
Body: one short paragraph (architecture is default-OFF; enabling it runs depcruise after
`change` exists and gates `propose`; absent config → no-op-with-note, safe to enable
mid-adoption); a small table (Phase | default | with this manifest, showing `architecture`
flipping absent→present and gating `propose`); closing
`> In your real repo this file lives at the project root as \`.claude/workflow.md\`.`

**File 4 — EDIT `examples/README.md`** — ADD two index rows under the `## Examples` bullet
list (lines 17–28), matching the existing bullet style
(`` - [`dir/`](dir/) — <description>. *<status>.* ``):
  - `` - [`requirements/`](requirements/) — turn ON the default-off `requirements` phase: a
    spec-driven team captures product requirements as a first-class artifact that `design`
    consumes (ADR-048/053). *All-current.* ``
  - `` - [`architecture/`](architecture/) — turn ON the default-off `architecture` phase: an
    architecture-led team gates the PR on dependency-cruiser; no-ops with a note when no
    config exists yet (ADR-049/050). *All-current.* ``
  Place them adjacent to the existing `lean-profile`/`role-swap` rows. Do NOT touch the
  top-of-file collection-kind table.

### TDD steps

- RED: add File 1 (`test/p10-structure.bats`). Run `bats test/p10-structure.bats` from the
  repo root. At this point in S3's sequence S1+S2 already landed, so the four authored files
  + template exist and the existence/dir-match/thinness cases PASS. To prove the bats file is
  a real RED-on-revert guard (not a no-op), mentally verify each `@test` would FAIL if the
  asserted file were deleted or if an agent body restated an injected-core line — that is the
  guard's value (ADR-052: "red-on-revert"). (No JS test; this slice adds NO `node --test`
  case, so NO `EXPECTED_TESTS` bump.)
- GREEN: create File 2, File 3 (the two examples), and apply File 4 (the README rows). These
  are prose; their correctness is checked by `shellcheck`/`pipeline-lint`/`contracts-lint`
  not applying (markdown) and by the `examples/` dir conventions (no lint gate on examples
  beyond the repo's general `ci.sh`).
- REFACTOR: re-read both examples against `examples/lean-profile/workflow.md` — confirm the
  frontmatter is a valid one-line opt-in, the closing blockquote byte-matches the house line,
  and the README rows match the existing bullet style.

### Gate

- Targeted (this slice's changes are bats + markdown): `bats test/` (the new structural file
  is auto-discovered; existing bats stay green).
- Phase boundary (once for this slice): `scripts/ci.sh` (asserts `# tests` == 422 — UNCHANGED
  from S2, since this slice adds NO `node --test` case; then `bats test/` now includes the new
  structural file, shellcheck, pipeline-lint, pipeline-resolve, contracts-lint). All green
  before commit; never `--no-verify`.

### Commit

`test(craft): P10 structural bats + requirements/architecture examples + README index`
