# Design — P3: rewire the live orchestrator to consume the Node engine

> Brief: replace the hardcoded 1→11 walk in `skills/run/SKILL.md` with a descriptor-driven walk
> over `pipeline-resolve` output; generalize cross-phase invariants by archetype; remove the
> static `PROTECTED` list from `manifest-lint.sh`; emit the run-record from `Resolution.record`.
> Status: draft → self-reviewed ×3 → accepted

## Context

### What exists today

`engine/` is a portable Node ESM module (6 exports, ADR-002) that parses `pipeline/default.yml`,
resolves skip/insert/profile edits against a manifest, validates the dependency graph, and emits
a `Resolution` JSON. It is unit-green (156 `node --test` assertions, 45 bats assertions) but
**dormant**: `skills/run/SKILL.md` still walks a hardcoded 1→11 phase table (lines 32–46) and
a hardcoded §"Cross-phase invariants" section that names phases by number and name (lines 55–97).

`manifest-lint.sh` enforces shape validation: known top-level keys, phase names, field names, and
a static `PROTECTED="branch plan implement review refactor mutation"` list that refuses `skip:` on
those phases (line 32, enforced at lines 270–271). ADR-005 decided the dependency graph fully
replaces this static list; the graph's strand-detection is already live in the resolver.

The skill dirs under `skills/` use old phase names (`branch`, `adr`, `plan`, `implement`,
`refactor`, `mutation`, `docs`, `pr`, `merge`). The engine's `effective[*].procedure` values are
concern-named (`forge:workspace`, `forge:decisions`, `forge:planning`, `forge:implementation`,
`forge:refactoring`, `forge:validation`, `forge:documentation`, `forge:propose`, `forge:integrate`).
The `ALIAS_MAP` in `engine/src/alias-map.js` maps old→new; its inverse maps canonical-id→old-skill-dir.
Skill-dir renames are P4. P3 must bridge the gap.

### Prior decisions that bind this phase

- **ADR-002:** the Node core is the canonical resolver; `manifest-lint.sh` handles shape; folding
  shape into Node is deferred to P3 for the coordinated `PROTECTED` removal.
- **ADR-004 (DC-4):** one alias home. No second copy of the alias table anywhere.
- **ADR-005:** static `PROTECTED` removed; graph strand-detection is the sole skip guard.
- **ADR-008:** `execution:` precedence is per-phase field > profile > top-level default (already
  implemented in the resolver).

### Surface gate (binding contract)

The golden `Resolution` emitted by `engine/bin/pipeline-resolve.js` IS the contract. P3 must
reproduce today's zero-config behavior by construction. The following suites must stay green at
every commit:

- `engine/test/scenarios.test.js` (S1–S9 + SC1 goldens, `node --test`)
- `test/manifest-lint.bats` (slice-2 characterization suite, `bats`)
- `scripts/ci.sh` end-to-end; never `--no-verify`

The one deliberate behavior change: the `invalid-skip-protected` fixture/test currently pins the
`skip: is refused on protected phase` refusal. After P3 removes `PROTECTED`, this test must be
re-baselined to reflect graph-based strand-checking. That is the only bats regression that is
intentional and expected.

### Pinned live Resolution (zero-config, empirically verified)

Running `node engine/bin/pipeline-resolve.js pipeline/default.yml` emits:

```json
{
  "ok": true,
  "errors": [],
  "record": [
    "default-skip: requirements (descriptor enabled:false)",
    "default-skip: architecture (descriptor enabled:false)"
  ],
  "effective": [ ...11 phases in order below... ],
  "gateDecisions": [ ...11 entries... ],
  "waivers": []
}
```

**Effective pipeline (canonical order, SC1):**

| id | archetype | procedure | role | gate |
|---|---|---|---|---|
| workspace | setup | forge:workspace | — | — |
| design | specification | forge:design | forge:designer | — |
| decisions | specification | forge:decisions | — | — |
| planning | specification | forge:planning | forge:planner | plan-lint |
| implementation | construction | forge:implementation | forge:slice-implementer | `<gates.phase>` |
| review | harness | forge:review | forge:reviewer | `<gates.phase>` |
| refactoring | refinement | forge:refactoring | forge:refactor-executor | `<gates.phase>` |
| validation | harness | forge:validation | forge:validation-triager | `<validation gate>` |
| documentation | delivery | forge:documentation | forge:docs-writer | — |
| propose | delivery | forge:propose | — | pr.pre-pr-gate |
| integrate | delivery | forge:integrate | — | — |

**Gate decisions (pinned):**

| phaseId | gate | codeProducing | awaitingHarnesses |
|---|---|---|---|
| workspace | `` | false | — |
| design | `` | false | — |
| decisions | `` | false | — |
| planning | `plan-lint` | false | — |
| implementation | `<gates.phase>` | **true** | — |
| review | `<gates.phase>` | false | — |
| refactoring | `<gates.phase>` | **true** | — |
| validation | `<validation gate>` | false | — |
| documentation | `` | false | — |
| propose | `pr.pre-pr-gate` | false | `["validation"]` |
| integrate | `` | false | — |

`waivers: []` in SC1. `awaitingHarnesses: ["validation"]` on `propose` is the data-driven
executing-harness triage invariant. `codeProducing` = `change ∈ produces`.

**Procedure → skill-dir bridge (canonical-id → ALIAS_MAP inverse → existing skill dir):**

| canonical id | skill dir (today) | procedure |
|---|---|---|
| workspace | `branch/` | `forge:workspace` |
| design | `design/` | `forge:design` |
| decisions | `adr/` | `forge:decisions` |
| planning | `plan/` | `forge:planning` |
| implementation | `implement/` | `forge:implementation` |
| review | `review/` | `forge:review` |
| refactoring | `refactor/` | `forge:refactoring` |
| validation | `mutation/` | `forge:validation` |
| documentation | `docs/` | `forge:documentation` |
| propose | `pr/` | `forge:propose` |
| integrate | `merge/` | `forge:integrate` |

The inverse ALIAS_MAP covers all 11 SC1 phases without a gap. Phases where the canonical id has
no alias entry (`design`, `review`) resolve to themselves, and `skills/design/` and
`skills/review/` exist under that name already.

---

## Requirements

1. **R1 — Engine invocation.** `skills/run/SKILL.md` §0 (Resolve) invokes
   `engine/bin/pipeline-resolve.js` and parses the JSON `Resolution`. On `ok: false` or non-zero
   exit the orchestrator stops and surfaces all `errors[]` entries. On success it reads
   `effective[]`, `gateDecisions[]`, `record[]`, and `waivers[]`.

2. **R2 — Dynamic walk.** The hardcoded 1→11 phase table (lines 32–46) is replaced by a walk
   over `effective[]` in the order the engine emits it. No phase name is hardcoded in the walk
   loop. The walk handles all archetypes: `setup`, `specification`, `construction`, `harness`,
   `refinement`, `delivery`.

3. **R3 — Procedure → skill bridge.** Each phase's skill is identified by inverting `ALIAS_MAP`
   on the phase's canonical `id`, not by parsing `procedure`. The bridge is expressed in the walk
   as an inline mapping table derived from the published `ALIAS_MAP`. DC-4 is honored: no second
   alias table is introduced anywhere.

4. **R4 — Gate cadence.** The orchestrator reads gate strings from `gateDecisions[*].gate`. For
   code-producing phases (`codeProducing: true`), the gate runs per the existing gate-cadence
   invariant (targeted gate per fix commit; phase gate once per round). For non-code-producing
   phases the gate runs when non-empty. An empty gate string means no gate required.

5. **R5 — Archetype-generalized invariants.** §"Cross-phase invariants" is rewritten to express
   behavior by archetype label, not by phase number or name:
   - **executing-harness triage gates `propose`**: any phase with `archetype: harness` and
     `harness-exec ∈ contract` is an executing-harness. `propose` does not start until every
     such phase whose `awaitingHarnesses` entry appears in `gateDecisions[propose].awaitingHarnesses`
     has landed and its gate is green. Data-driven: the orchestrator reads `awaitingHarnesses`
     from the Resolution, never hard-codes `validation`.
   - **scope expansion re-enters `review`**: any `construction` or `refinement` archetype phase
     that grows feature behavior after `review` (archetype `harness`, `harness-read ∈ contract`)
     has run triggers a feature-scoped review before the executing-harness gate closes.
   - All other invariants (artifact-is-the-handoff, gate cadence, model resolution + fallback,
     blockers, provenance) are preserved verbatim in meaning but generalized in wording where
     phase names appeared.

6. **R6 — Run record seeded from Resolution.** The orchestrator's in-session run record is opened
   with `Resolution.record[]` as its initial entries. Every subsequent phase outcome, skip reason,
   no-op, probe result, degradation, and waiver is appended in the existing ledger style.

7. **R7 — Waivers surfaced.** `Resolution.waivers[]` entries (skipped executing-harnesses with
   `proposeGateReleased: true`) are appended to the run record with a prominent label so the waiver
   is visible in the final summary and PR body.

8. **R8 — PROTECTED removal.** `scripts/manifest-lint.sh` has its `PROTECTED` variable (line 32)
   and the `skip: is refused on protected phase` check (lines 270–271) removed. The engine's
   strand-detection is the sole skip guard at runtime.

9. **R9 — Bats re-baseline.** The `invalid-skip-protected` fixture and its two bats tests (yq and
   no-yq variants) are re-baselined to reflect the post-PROTECTED behavior. What the new behavior
   is depends on DC-P3-A (decision candidate #3).

10. **R10 — Zero-config identity.** With no manifest, the walk must reproduce today's phase
    sequence, agents, and gates phase-for-phase. The SC1 golden is the verification.

11. **R11 — CI green at every commit.** `scripts/ci.sh` stays green. No commit is made on a
    known-red gate.

12. **R12 — No P5 seam implemented.** The `assembleContract` call site is named in the walk as a
    P5 TODO comment but not implemented in P3. The contract injection stays as-is in the agent defs.

---

## Design

### Work item 1: rewrite `skills/run/SKILL.md`

The rewritten skill has three structural changes to the current file:

**§0 Resolve — extended with engine invocation**

After the manifest-lint step and before input classification, the orchestrator:

1. Runs `node "${CLAUDE_PLUGIN_ROOT}/engine/bin/pipeline-resolve.js" "${CLAUDE_PLUGIN_ROOT}/pipeline/default.yml" [manifest-path]` via Bash, capturing stdout. The manifest path argument is omitted when no manifest file was found.
2. Parses the stdout JSON as the `Resolution`.
3. On non-zero exit or `ok: false`: stops, surfaces all `errors[]` lines to the user, refuses to proceed.
4. Seeds the in-session run record with every entry in `Resolution.record[]`.
5. Notes any `Resolution.waivers[]` entries. The engine already writes the human-readable `WAIVER:` string into `Resolution.record[]` (empirically verified: skipping `validation` produces a `WAIVER: validation (pipeline.skip) — executing-harness skipped; propose-gate for validation is released...` entry in `record[]`). The orchestrator does NOT need to format waivers itself — they arrive pre-formatted in `record[]`. The structured `waivers[]` array is available for machine-readable consumption (e.g. conditional logic) but is not re-formatted by the walk.
6. Reads the `propose` entry from `gateDecisions` and extracts `awaitingHarnesses[]` as the set of phase ids that must complete before `propose` starts. Stores this set in-session.

**§ Phase walk — replaces hardcoded 1→11 table**

The static table is replaced by:

```
## Phase walk (driven by Resolution.effective[])

Walk each phase descriptor in Resolution.effective[] order. For each phase:

1. Resolve the skill dir: look up phase.id in the ALIAS_MAP inverse table below.
   Invoke it as `forge:<skill-dir-name>`.

2. Resolve execution: use phase.execution (agent | inline) from the Resolution.
   Apply manifest override (phases.<id>.override, phases.<id>.context) as before.

3. Assemble the injected block (P5 TODO: call assembleContract when contract
   fragments land; for now, agent defs carry their own contracts).

4. Execute via the resolved execution mode. Session-owned responsibilities by
   archetype:
   - setup: setup and workspace preparation
   - specification: verify artifact; conversation if no role (decisions)
   - construction: verify each slice; phase gate
   - harness (harness-read): apply ALL findings, convergence
   - refinement: judgment (scan + scoping); apply ALL findings
   - harness (harness-exec): start background; gate propose on triage
   - delivery (documentation): synthesis (follow-ups, backlog guard) — may
     parallel a running executing-harness
   - delivery (propose): pre-propose gate; body; creation per policy — does NOT
     start until awaitingHarnesses[] are all landed and green
   - delivery (integrate): user confirms; cleanup

5. Read gate from Resolution.gateDecisions[phase.id].gate.
   If codeProducing: apply gate cadence (targeted per fix commit; phase gate once
   per round; never commit on known-red).
   If non-code-producing and gate non-empty: run gate once at phase boundary.
   If gate empty: no gate check.

6. Record outcome in the run record.

7. On blocker: escalate { phase/slice, reason, ≤3 options }. Never spin.

8. On model-down (not a task blocker): mark tier degraded; re-resolve to fallback;
   respawn from artifact. Record degradation in run record.

ALIAS_MAP inverse table (canonical id → skill dir, single authoritative copy
derived from engine/src/alias-map.js — DC-4):
  workspace    → branch
  requirements → prd      [disabled by default; not in SC1 effective[]]
  decisions    → adr
  planning     → plan
  implementation → implement
  review       → review
  refactoring  → refactor
  validation   → mutation
  architecture → architecture [disabled by default]
  documentation → docs
  propose      → pr
  integrate    → merge

NOTE: The canonical ids 'design', 'review' are their own skill-dir names (no alias).
This table is replaced entirely when P4 executes the skill-dir rename.
```

**§ Cross-phase invariants — archetype-generalized**

The rewritten invariants section drops all phase-number and phase-name references and replaces
them with archetype-driven language:

- **Executing-harness triage gates `propose`**: a phase is an executing-harness when
  `archetype: harness` and `harness-exec ∈ contract`. `propose` does not start `pr create` until
  every phase id in `Resolution.gateDecisions[propose].awaitingHarnesses` has landed its run and
  its gate is green. `documentation` (archetype: delivery) may parallel a background executing-
  harness run; `propose` may not. If an executing-harness was waived (skipped), its gate is
  released — the waiver is in `Resolution.waivers[]` and in the run record — and `propose` may
  proceed without waiting for it.
- **Scope expansion re-enters `review`** (construction / refinement archetype): any feature
  behavior added after a `harness` phase with `harness-read ∈ contract` has run — during phases
  of archetype `construction` or `refinement` — that is NOT a fix to an existing finding gets its
  own feature-scoped review before the executing-harness gate closes. The `refinement` archetype's
  re-review is scoped to the refinement diff only and does not substitute. A scope expansion that
  reaches the executing-harness gate unreviewed is a workflow breach.
- **Artifact is the handoff**, **Gates**, **Agent spawns**, **Model resolution & fallback**,
  **Blockers**, **Provenance**: preserved verbatim in meaning. The only wording change is
  replacing concrete phase names (8, 9, 10, 11) with archetype labels or the generic "the phase"
  where the text currently anchors to a specific number.

### Work item 2: remove PROTECTED from `manifest-lint.sh`

Two surgical edits to `scripts/manifest-lint.sh`:

1. Remove line 32: `PROTECTED="branch plan implement review refactor mutation"`
2. Remove lines 270–271:
   ```bash
   skip)
     in_list "$ph" "$PROTECTED" && err "skip: is refused on protected phase '$ph' (sequence-editing in disguise)" ;;
   ```
   The `skip` case block is either removed entirely (if the only logic was the PROTECTED check) or
   reduced to just the closing `;;`. The `skip` field still appears in `PHASE_FIELDS` (line 27) as
   a known field; that entry stays — `skip:` remains a recognized field for the engine's
   `pipeline.skip` list. Note: the per-phase `skip:` field in the manifest is the old mechanism;
   the engine now consumes `pipeline.skip: [...]`. The field entry in `PHASE_FIELDS` is kept for
   backward compatibility linting (recognizes but no longer refuses it).

### Work item 3: bats re-baseline for `invalid-skip-protected`

The `invalid-skip-protected.workflow.md` fixture currently has:
```yaml
phases:
  plan:
    skip: true
```

After `PROTECTED` is removed, `plan` with `skip: true` in `phases.plan.skip` is a recognized but
semantically inert field (the engine doesn't read per-phase `skip:`, only `pipeline.skip: [...]`).
The manifest-lint sees `phases.plan.skip` as a known `PHASE_FIELDS` entry and exits 0 (valid).

The behavior change depends on the DC-P3-A decision (see Decision candidates). If the `skip`
field entry is also removed from `PHASE_FIELDS` (no longer recognized), lint exits 2 with
"unknown field". If kept, lint exits 0. This is a decision candidate.

The two bats tests (`invalid-skip-protected` with yq and without yq) must be re-baselined to
match the chosen post-PROTECTED behavior. At minimum, the assertion `[[ "$output" == *"skip: is
refused on protected phase"* ]]` must change. The fixture may also need to change depending on
the decision.

### Work item 4: run-record seeded from `Resolution.record`

`Resolution.record[]` already contains the right entries for SC1:
```
["default-skip: requirements (descriptor enabled:false)",
 "default-skip: architecture (descriptor enabled:false)"]
```

The orchestrator opens the run record with these entries verbatim as its first lines. All
subsequent entries are appended in the same ledger format. The §0 "Open the run record"
instruction is updated to say: "seed it from `Resolution.record[]`; then append each phase
outcome, skip reason, no-op justification, probe result, and forced action as before."

### P4 and P5 handoff seams

- **P4 seam**: the ALIAS_MAP inverse table in the walk is a verbatim list. P4 replaces the
  skill-dir rename and wires `manifest-lint` to the published `ALIAS_MAP`. When P4 executes, the
  inverse table in the walk is deleted and replaced by a single phrase: "skill dir = phase.id
  (concern names match dir names after P4)."
- **P5 seam**: each walk step carries a comment: "P5 TODO: call `assembleContract(phase.contract,
  FRAGMENTS)` and inject the result as the contract block." The `assembleContract` function
  signature is frozen at P1 (`engine/src/contract.js`); P3 names the call site, P5 supplies
  the fragment files and wires it.

### Error paths and edge behavior

| Condition | Behavior |
|---|---|
| `ok: false` from `pipeline-resolve` | Stop; surface all `errors[]`; refuse to proceed |
| Non-zero exit from `pipeline-resolve` | Stop; surface stderr; refuse to proceed |
| `effective[]` is empty | Stop; surface "no enabled phases in resolution" |
| A phase id has no matching inverse-alias entry | Stop; surface "unknown phase id <id>; P4 may fix this" |
| `awaitingHarnesses` on `propose` is empty | Propose is not gated on any harness; proceed normally |
| `waivers[]` is non-empty | Append each waiver with `WAIVER:` prefix to run record; continue |
| A skip strands a consumer | `ok: false` already; covered by the stop-on-error path above |
| manifest-lint exits 2 (invalid) | Stop; surface errors (existing behavior; unchanged) |

### What does NOT change

- The `manifest-lint.sh` invocation in §0 (still runs first, before the engine)
- Input classification (backlog-id / file path / free-text)
- Slug derivation and user confirmation
- Agent spawn mechanics (context injection, respawn from artifact, provenance rules)
- Model resolution and fallback protocol
- Blocker escalation format
- §Done (final message format)

---

## Decision candidates

| # | Choice | Alt A | Alt B | Alt C | Recommendation | Why |
|---|---|---|---|---|---|---|
| DC-P3-1 | **Procedure → skill bridge** | (A) Walk inverts ALIAS_MAP at runtime to map canonical `id` → old skill dir — single alias home honored (DC-4) | (B) A separate concern→skill lookup table lives inside the walk (duplicates alias data — violates DC-4) | (C) Pull P4 skill-dir rename into P3 (concern names become actual dir names; no bridge needed) | **A** | DC-4 is a hard constraint. B violates it. C is a valid accelerator but expands P3 scope significantly (11 dir renames + agent file renames + lint wiring + fixture re-baseline) — better kept atomic in P4 where it is planned. A is minimal, safe, and explicit. |
| DC-P3-2 | **manifest-lint new-key scope at P3** | (A) P3 removes PROTECTED only; `pipeline:`, `retrieval:`, `execution:` top-level keys and `pipeline.skip` list are NOT added to `TOP_KEYS`/`PHASE_FIELDS` — a manifest that drives the new resolver will fail lint on unknown keys until P4 | (B) P3 also extends `TOP_KEYS` with `pipeline`, `retrieval`, `execution`; adds `pipeline.skip` array recognition — a new-style manifest lints clean at P3 | (C) P3 removes PROTECTED and folds shape validation into the Node core (`validateManifest` export), replacing the bash check for new keys with a Node call | **B** | A leaves a usability gap: any repo that adopts the new `pipeline.skip:` syntax will get a lint refusal ("unknown top-level key: pipeline") immediately after P3, breaking their manifest before P4 ships. B is a small, additive change to `TOP_KEYS` that removes the gap. C (fold into Node) is the ADR-002 follow-up but it is structurally heavier and better timed as its own slice. B's risk is extending `manifest-lint.sh` without adding full semantic validation for the new keys — acceptable because semantic validation (strand-checking) is already in the resolver. |
| DC-P3-3 | **Post-PROTECTED bats re-baseline behavior** | (A) Keep `skip` in `PHASE_FIELDS`; after PROTECTED removal, `phases.plan.skip: true` lints valid (exit 0); re-baseline the fixture to assert exit 0 | (B) Remove `skip` from `PHASE_FIELDS` too; per-phase `skip:` is now an unknown field (exit 2, "unknown field"); fixture asserts that | (C) Rename the fixture to `valid-plan-skip` (moving it to the valid suite); add a new `invalid-strand-skip` fixture that exercises a stranding skip via the resolver (requires calling the engine from lint — not a P3 capability) | **A** | The `skip` field in `PHASE_FIELDS` is the old per-phase skip mechanism. Keeping it recognized (but not acted on by `PROTECTED` logic) is backward-compatible — old manifests using per-phase skip continue to lint without error. The engine ignores this field anyway (it reads `pipeline.skip` only). C requires the engine inside lint (not planned until later). B is defensible but removes backward compat for no gain. A is the minimal, non-breaking re-baseline. |
| DC-P3-4 | **ADR-002 fold: should P3 fold `manifest-lint` shape-validation into the Node core?** | (A) Keep `manifest-lint.sh` bash-backed; P3 only removes PROTECTED and (if DC-P3-2=B) adds new top-level keys — no architecture change | (B) P3 exports a `validateManifest(manifest)` function from `engine/src/` and calls it from a thin bash wrapper replacing the current `validate_props` loop — one deterministic parse home | (C) P3 replaces `manifest-lint.sh` entirely with a Node script (`engine/bin/manifest-lint.js`) that validates shape + calls `resolvePipeline` for semantic checks | **A** | The P2 hardening made `manifest-lint.sh` shellcheck-clean with `yq`+fallback. It is now a stable interim home (ADR-002 explicitly states this). P3's coordinating concern is the PROTECTED removal, not the parser migration. B and C are architecturally sound but add migration surface that belongs in a dedicated slice (as ADR-002 originally scoped). Fold this into P4 or as a standalone P2.5/P3.5 slice after P3 ships and CI is green. |

---

## Test strategy

### Existing suites that must stay green

- **`engine/test/scenarios.test.js` (S1–S9 + SC1):** no changes to these tests or the engine.
  They are the contract surface gate. Run with `node --test engine/test/`.
- **`test/manifest-lint.bats` (all tests except `invalid-skip-protected` variants):** must pass
  unchanged. The PROTECTED removal touches only the two `invalid-skip-protected` tests.

### Deliberate re-baseline

- **`invalid-skip-protected` (yq and no-yq variants):** two tests re-baselined. If DC-P3-3=A:
  - Fixture content unchanged (still `phases.plan.skip: true`)
  - Test assertion changes from `status -eq 2` + `"skip: is refused on protected phase"` to
    `status -eq 0` + `"valid."`
  - Test title updated to describe the new behavior.

### New test surface

No new test files are introduced by P3. The walk is LLM policy text (not compiled code) and its
correctness is verified by the SC1 surface gate: running the rewired SKILL.md on a zero-config
repo must produce the same 11-phase sequence as today.

### Manual verification

After the walk rewrite:
1. Run `node engine/bin/pipeline-resolve.js pipeline/default.yml` — confirm SC1 output.
2. Invoke `forge:run` on a trivial feature with no manifest — confirm the walk visits the same
   11 phases in SC1 order and the run record is seeded with the two default-skip entries.
3. Confirm `scripts/ci.sh` exits 0.

### Edge matrix to verify manually

| Scenario | Expected |
|---|---|
| No manifest | SC1: 11 phases, record seeded with 2 default-skip entries, no waivers |
| Manifest with `pipeline.skip: [decisions]` | 10 phases (decisions absent), record shows skip entry |
| Manifest with stranding skip | Resolution `ok: false`; orchestrator stops loudly |
| Manifest with `pipeline.skip: [validation]` | 10 phases; waivers entry for validation; propose awaitingHarnesses empty (released) |
| Manifest with unknown top-level key | manifest-lint exits 2 before engine is called |

---

## Out of scope

- **P4 skill-dir renames** (`branch→workspace`, `adr→decisions`, etc.): P3 bridges the naming
  gap via the inverse ALIAS_MAP inline table; the actual rename is a single coordinated P4 change.
- **P5 `assembleContract` wiring**: the contract injection call site is named as a TODO in the
  walk; P5 supplies the fragment files and wires the call. The `assembleContract` signature is
  already frozen (`engine/src/index.js` export 5).
- **`requirements` and `architecture` agent bodies**: these phases are disabled by default; their
  skill/agent content is a P10 concern (PRD §17).
- **Reorder** (`pipeline.reorder:`): deferred per ADR-005 (OQ1); not a P3 concern.
- **P8 harness internals** (dimensions, passes, cycles): the walk names harness phases by
  archetype; internal execution details are per-harness phase skills.
- **worktree-teardown.sh production hardening**: parked item (see BACKLOG.md); not touched.
- **Full fold of `manifest-lint` into Node core**: ADR-002 follow-up; recommended as A (deferred)
  in DC-P3-4 above.
