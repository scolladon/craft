# DESIGN — P9: agent/skill swap via manifest

> Brief: make manifest-driven agent swap (`phases.<id>.role`) a FIRST-CLASS, documented,
> dogfoodable feature — the P5 contract STILL injected around the swapped worker (G5),
> in BOTH execution modes, with a swap to a non-existent role surfacing LOUDLY. The
> decision conversation widened P9 from a walk/UX + docs phase into a genuine ENGINE phase:
> a swap to a missing role is now an engine-level resolution guard (ADR-037), and a default
> phase's SKILL can also be swapped from the manifest via a new `procedure:` override field
> (ADR-040). The swap *resolution* for `role:` shipped in S2 (P1) and the lint-gap closed in
> P8; P9 hardens that, adds the role-existence guard + the procedure-override field, and makes
> both swap axes a *verified* UX. Resolves G5 (swap UX); gate = S2 hardened + a role-not-found
> negative green + the procedure-override field positive green.
> Status: draft → self-reviewed ×3 → decisions settled (ADRs 037–040 ratified; the
> negative-path mechanism and the scope of the skill-swap axis are NO LONGER open — see
> "Decisions settled").

## Context

### Scope reconciliation — what already exists (proven against code, not assumed)

P9's first job is to prove what earlier phases already built. Each brief claim was checked
against the actual source/tests:

| # | Claim | Verdict | Evidence (file:line) |
|---|---|---|---|
| 1 | Engine resolution already swaps `phases.<id>.role`; S2 resolution + contract-assemble tests green | **PASS** | `engine/test/scenarios.test.js:238–269` (two S2 tests); fixture `engine/test/fixtures/scenarios/S2/manifest.yml` (`planning.role: my:domain-planner`); `engine/src/resolve.js:171` (`applyEnableEdits`) → `engine/src/edits.js:29–40` (`applyAllowedOverrides`, `role ∈ ALLOWED_PHASE_OVERRIDE_FIELDS` line 12); `engine/src/descriptor.js:83–85` (descriptor carries `role`) |
| 2 | manifest-lint already accepts `role:`/`model:` (closed in P8) | **PASS** | `engine/src/manifest.js:27–30` (`PHASE_FIELDS` includes `role`, `model`); `engine/src/manifest.js:263–266` (string-shape checks); ADR-028 |
| 3 | Contract injection keys on the descriptor id (unchanged by a role swap) so G5 holds structurally | **PASS** | `engine/src/contract.js:90–111` (`assembleContract` reads `descriptor.id` + `descriptor.contract`; never `role`); `engine/bin/contract-assemble.js:75,82` (reads descriptor from `pipeline/default.yml` keyed by `--descriptor-id`, NOT from the manifest's resolved role); ADR-017 (agents fully thinned — a swapped agent *cannot* carry a divergent contract) |
| 4 | The walk already references "the manifest-swapped role" dispatch | **PASS** | `skills/run/SKILL.md:117` (agent mode: "spawn `craft:<role>` (or the manifest-swapped role)"); `:89–91` (G5 guarantee prose for a role-swapped craft-native phase); `:122–133` (inline mode local-vs-non-local role branch); ADR-025 |

**Net:** all four claims PASS. The `role:` engine-side swap mechanism *resolution* is complete;
the contract is structurally id-keyed. What P9 adds is no longer purely walk/UX+docs — the
decision conversation (ADRs 037–040) widened it into a genuine engine phase:

- **The negative-path gap** (a swap to a non-existent role surfaces neither in lint nor
  resolution) is now closed at the **engine resolution layer** by an injected `roleExists`
  predicate (ADR-037), uniform for agent and inline. This is `engine/src` delta, not a walk row.
- A default phase's **skill** is now swappable from the manifest via a new `procedure:` override
  field (ADR-040), parallel to `role:` — `engine/src` delta in `manifest.js` + `resolve.js`.

The walk/UX + scenario-hardening + example + docs layer remains, but it now sits on top of two
small, surface-gated engine changes rather than an `engine/src` 0-diff.

### The two swap axes the engine models (resolving brief question (a))

The PRD titles P9 "Agent/skill swap." P9 now delivers BOTH axes from the manifest for default
phases:

| Axis | Field | What it swaps | Status under P9 (post-ADR) |
|---|---|---|---|
| **Agent swap** | `phases.<id>.role` | WHICH worker agent runs the phase (`craft:planner` → `my:domain-planner`) | resolution shipped (S2); P9 hardens it (S2 walk-level), adds the `roleExists` engine guard (ADR-037), and documents the UX |
| **Skill swap** | `phases.<id>.procedure` (on a *default* phase) | WHICH skill body / procedure orchestrates the phase (`craft:planning` → `acme:my-skill`) | NEW in P9: `procedure` becomes an allowed per-phase override field (ADR-040), dispatched verbatim by the existing walk (ADR-025); the negative path reuses the existing procedure-STOP row |

**Resolution of (a): P9 owns BOTH the `role:` (agent) and the default-phase `procedure:`
(skill) swap end-to-end.** ADR-040 widened the original `role:`-only recommendation: a default
phase's orchestrating skill is now overridable from the manifest, making "skill swap" literally
true in this phase. The walk dispatches the overridden `procedure` verbatim (ADR-025, unchanged)
and STOPs loudly via the EXISTING "procedure resolves to no installed skill" row
(`skills/run/SKILL.md:180`) — no new walk machinery. `procedure:` dispatch on *inserted* phases
already shipped P7 (ADR-025); ADR-040 re-opens that dispatch surface to *default* phases as a
deliberate scope widening.

### What S2 asserts today — resolution-level only (resolving brief question (c))

The two S2 tests (`engine/test/scenarios.test.js:238–269`) assert:
1. `resolvePipeline` produces `effective.find(d => d.id === 'planning').role === 'my:domain-planner'` — the **resolution layer** carries the swapped role.
2. `assembleContract(planningDescriptor, …)` still injects the U core (`'Never commit on a red gate'`) and the producer bundle (`'Decision-candidates'`) — the **contract assembly** is role-independent. **It checks only TWO markers**, not the full core set.

Neither test asserts the FULL contract survives the swap, nor that the swap leaves `id`
unchanged, nor that a swap to a non-existent role fails. ADR-038 hardens S2 (full `CORE_MARKERS`
set + id-unchanged); ADR-037 adds the role-not-found negative (§Test strategy).

### How the swap loads end-to-end in BOTH modes (resolving brief question (b))

Traced through `skills/run/SKILL.md` for a craft-native phase whose `role` is swapped (the
descriptor `id` is unchanged — only `role` differs):

**Agent mode** (`skills/run/SKILL.md:102–123`):
- Step 3 runs `contract-assemble.js --descriptor-id <phase.id>` → the injected block, assembled
  from the **default descriptor keyed by id** (`engine/bin/contract-assemble.js:82`). The role
  swap does NOT change `id`, so the *exact same* contract block is produced regardless of role.
- Step 4 prepends that block to the Task spawn prompt, then spawns `craft:<role>` (or the
  manifest-swapped role) as the worker (`:117`). **The injected contract reaches the swapped
  agent because the orchestrator prepends it — the agent never sources its own contract**
  (ADR-017). G5 holds: a swapped agent cannot drop the contract.

**Inline mode** (`skills/run/SKILL.md:122–133`, ADR-020):
- Step 3 assembles the same id-keyed block with `--inline` (two carve-out lines differ;
  `contract-equivalence.test.js` proves exactly two lines change).
- Step 4 loads the block as the governing constraint in-thread. Then, **if `phase.role`
  resolves to a LOCAL agent def** (`agents/<name>.md`, `<name>` = role ref minus `craft:`
  namespace), it ALSO loads that agent body — the same two artifacts a spawn carries.
  **A role that resolves to NO local def (e.g. `acme:tdd-specialist`, `my:domain-planner`) runs
  on the contract block alone** (ADR-020 decision). G5 holds in both sub-cases: the contract is
  injected; only the *role craft* is absent for a non-local role — which is correct, because a
  non-local role's craft lives in the user's own (non-craft) agent the session cannot read.

**The conclusion for (b):** the contract survives the swap in both modes *structurally* (it is
id-keyed and orchestrator-assembled). The one behavioural asymmetry — a non-local inline role
gets contract-only, no role-craft — is by design (ADR-020). A **non-existent** role would have
silently taken the same contract-only inline path, indistinguishable from a deliberate external
ref — which is exactly what ADR-037's engine guard now closes (below).

### The negative-path gap — closed at the engine, not the walk (ADR-037)

`phases.<id>.role` is a free string. Entering P9, **no role-existence check existed anywhere** —
not in `manifest.js` (string-shape only, `manifest.js:263`), not in `resolve.js` (copies the
string onto the descriptor), not in `contract-assemble.js` (keyed on `id`). So a typo'd or
never-installed swap — `role: my:does-not-exist` — passed lint, passed `resolvePipeline`
(`ok: true`), failed only at agent-spawn time, and in inline mode *silently* degraded to the
ADR-020 contract-only path — indistinguishable from a deliberate `acme:tdd-specialist`.

**ADR-037 closes this at the engine resolution layer, uniformly for agent and inline.**
`resolvePipeline` accepts an injected `roleExists(ref) → boolean` predicate (the caller supplies
the probe, exactly as `validateManifest` takes `fileExists` — `manifest.js:301–304`). The guard
runs over the **effective (enabled) descriptors**: for every effective descriptor that carries a
`role`, the predicate is consulted; a rejected ref makes resolution return `ok: false` with a
role-not-found error naming the phase and the ref. The guard is NOT limited to "manifest-swapped"
roles — every effective descriptor carries a `role` (default `craft:<role>` or swapped), and the
probe is the single arbiter: a craft-native default role (`craft:<role>`) passes because the
walk's real probe resolves craft refs (and a test stub accepts them, or omitted-opts defaults to
true); a typo or uninstalled ref fails closed. This keeps the check uniform — there is no special
"is this swapped?" branch — and it is caught before any walk step, identically in both modes.
(Disabled phases such as default-off `requirements`/`architecture` are excluded because the guard
runs on `effective`, after the enabled-filter.) The predicate is injected and **never called from
the pure core**, so `resolvePipeline` stays I/O-free and the 7-export surface is unchanged. There
is NO walk-level STOP row for the role case and NO inline "ask" — the original design's DC-A
option-1 was superseded: ADR-040 already put `engine/src` in play, dissolving the 0-diff rationale
that favoured the walk-level option.

The original design surfaced this as a load-bearing choice (DC-A). It is now SETTLED — ADR-037.

### What the engine already provides (do not redesign)

P1–P8 are complete and green (405 node + 42 bats). The resolver pipeline (`engine/src/resolve.js`)
and the contract assembler (`engine/src/contract.js`) are stable. The role swap rides the existing
`applyAllowedOverrides` path; the new `procedure` override rides the SAME path (one entry added to
`ALLOWED_PHASE_OVERRIDE_FIELDS`). The **7-export surface** (`engine/src/index.js`) and
`resolvePipeline`'s exported call shape stay intact (the `roleExists` probe is added as an
optional dependency, not a positional reshuffle — see Surface-gate). `pipeline/default.yml`'s 13
descriptors and their default `procedure` values are FROZEN — a swap is a manifest concern only,
so SC1 (no-manifest resolution) stays byte-identical.

### What the ADRs settled (do not re-open)

ADRs 037–040 ratified P9's four load-bearing choices. They are SETTLED backdrop, not candidates:
ADR-037 (engine `roleExists` guard), ADR-038 (S2 full-marker hardening), ADR-039 (example swaps
`implementation.role: acme:tdd-specialist`), ADR-040 (default-phase `procedure:` override field).
ADR-017 (thin agents), ADR-020 (inline role-craft sourcing), and ADR-025 (verbatim dispatch) are
the prior settled backdrop and are not re-opened.

---

## Requirements

| # | Requirement | Mechanism |
|---|---|---|
| R1 | A `phases.<id>.role` swap on a craft-native phase loads the swapped worker end-to-end with the P5 contract injected — agent mode (prepended to spawn) and inline mode (block + local-role craft) — stated as an explicit UX guarantee | `skills/run/SKILL.md` step-4 prose tightening |
| R2 | The walk states "contract-survives-swap" as an explicit, named UX guarantee (G5) for a role-swapped phase, in BOTH modes | `skills/run/SKILL.md` prose (a dedicated swap-fidelity note) |
| R3 | A swap to a NON-EXISTENT / non-installed role surfaces LOUDLY at the **engine resolution layer** — `resolvePipeline` returns `ok: false` with a role-not-found error, uniformly for agent and inline; never silently degrades to contract-only inline | `engine/src/resolve.js` `roleExists`-guard via an injected predicate (ADR-037) |
| R4 | The distinction is unambiguous *by construction*: a *deliberate* external role (`acme:tdd-specialist`) passes only because the injected probe resolves it; a *typo'd / uninstalled* role fails the probe and STOPs at resolution. No interactive ask, no inline-only path | `roleExists` predicate semantics (ADR-037) — the probe IS the disambiguator |
| R5 | S2 scenario coverage is hardened: pin role-swapped-but-id-unchanged AND assert the FULL `CORE_MARKERS` set (not the two-marker subset) survives on the swapped descriptor's assembled block | `engine/test/scenarios.test.js` S2 additions (ADR-038) |
| R6 | A NEGATIVE scenario asserts a swap to a non-existent role makes `resolvePipeline` return `ok: false` with a role-not-found error (the injected `roleExists` rejects the ref) | new test + new bad-role fixture (ADR-037) |
| R7 | A `phases.<id>.procedure` override on a DEFAULT phase is accepted by lint (string shape-check) and copied onto the effective descriptor by `applyAllowedOverrides`; the walk dispatches it verbatim (ADR-025); a missing procedure STOPs via the EXISTING procedure-STOP row | `engine/src/manifest.js` (`PHASE_FIELDS` + shape check) + `engine/src/edits.js` (`ALLOWED_PHASE_OVERRIDE_FIELDS`) (ADR-040) |
| R8 | A POSITIVE test asserts a `procedure`-override manifest puts the swapped procedure on the effective descriptor; the procedure-missing negative is the EXISTING walk STOP (doc-pinned, consistent with how ADR-025's procedure-STOP is a walk guarantee) | new test (ADR-040) + the doc-pinned procedure-STOP row (`run/SKILL.md:180`) |
| R9 | An `examples/` sample demonstrates a manifest role swap, mirroring `examples/lean-profile/` EXACTLY in structure (one `workflow.md`: frontmatter manifest + prose body); the swap subject is `implementation.role: acme:tdd-specialist` (external, highest-stakes), with prose carrying the external/contract-only-inline story (ADR-020) and the `roleExists` fail-closed note (ADR-037) | new `examples/role-swap/workflow.md` + `examples/README.md` row (ADR-039) |
| R10 | Surface gate (REVISED — no longer `engine/src` 0-diff): `engine/src/index.js` 7-export surface UNCHANGED; `resolvePipeline` gains an injected `roleExists` dependency without breaking existing callers or the export surface; `pipeline/default.yml` UNCHANGED → SC1 run-record BYTE-IDENTICAL; `graph.js`/`contract.js` untouched; `engine/src` delta is the MINIMUM for the procedure-override field + the `roleExists` guard; full scenario suite + 42 bats green at every commit | surface-gate invariant (ADRs 037 + 040) |

---

## Design

### Files that change

The decision conversation (ADRs 037–040) collapsed the original α/β shapes into ONE shape: the
engine *does* change, minimally. Exact set:

**Engine (`engine/src`) — minimal delta:**
- `engine/src/manifest.js` — add `'procedure'` to `PHASE_FIELDS` (line 27–30); add a per-field
  string shape-check in `validatePhaseBlock` next to the `role`/`model` checks
  (`manifest.js:263–266`): `else if (field === 'procedure' && typeof value !== 'string') errors.push(\`phases.${phaseName}.procedure must be a string\`)`.
  No `validateManifest` signature change. (ADR-040)
- `engine/src/edits.js` — add `'procedure'` to `ALLOWED_PHASE_OVERRIDE_FIELDS` (line 12). The
  existing `applyAllowedOverrides` (`edits.js:29–40`) then copies it onto the effective descriptor
  via its generic field loop — `procedure` is a scalar, so it lands as-is (the `harness`
  deep-merge branch does not apply). No other `edits.js` change. (ADR-040)
- `engine/src/resolve.js` — thread an injected `roleExists` predicate into `resolvePipeline`
  (see "The `roleExists` seam" below) and add a role-existence check that returns `ok: false`
  with a role-not-found error when an effective descriptor's `role` ref is rejected. The check
  runs over `effective` (the enabled descriptors computed at `resolve.js:213`, each already
  carrying its resolved `role` from `applyEnableEdits`), placed after the `effective` filter and
  before the gate resolution / `ok: true` return (`resolve.js:213–234`). (ADR-037)

**Tests:**
- `engine/test/scenarios.test.js` — S2 hardening (R5/ADR-038): extend the two S2 tests
  (`:238–269`) to pin `id` unchanged + full `CORE_MARKERS`; add a role-not-found negative
  (R6/ADR-037) and a procedure-override positive (R8/ADR-040).
- `engine/test/fixtures/scenarios/S2-bad-role/manifest.yml` — NEW fixture
  (`phases.planning.role: my:does-not-exist`) for the role-not-found negative.
- `engine/test/fixtures/scenarios/S2-procedure/manifest.yml` — NEW fixture
  (`phases.planning.procedure: acme:my-planner`) for the procedure-override positive.
- `engine/test/manifest.test.js` — a positive (`procedure: 'acme:x'` accepted) + a negative
  (`procedure: 42` → "must be a string") for the new shape check (R7/ADR-040), mirroring the
  existing `role`/`model` shape-check tests.

**Docs / example:**
- `skills/run/SKILL.md` — step-4 swap-fidelity note (R1/R2); name the role-not-found resolution
  STOP as engine-level (the `ok: false` path already lands in the Walk error-paths "`ok: false`
  from `pipeline-resolve`" row at `:177` — the prose just *names* the role case as one of its
  causes); the default-phase `procedure:` override is documented as dispatched verbatim with the
  EXISTING procedure-STOP row (`:180`) as its negative.
- `examples/role-swap/workflow.md` — new example (R9), `implementation.role: acme:tdd-specialist`.
- `examples/README.md` — new swap row (R9).

**Untouched (surface gate):** `engine/src/index.js` (7 exports), `engine/src/graph.js`,
`engine/src/contract.js`, `engine/bin/contract-assemble.js`, `pipeline/default.yml`.

### The `roleExists` seam — keeping the 7-export surface intact (ADR-037)

`resolvePipeline` is exported from `engine/src/index.js` and called by the walk's
`pipeline-resolve` bin and by every scenario test. ADR-037 requires it to consult an injected
`roleExists(ref) → boolean` without breaking those callers or the export surface.

The mirror is `validateManifest(manifest, opts)`, which takes its `fileExists` probe in an
**optional trailing opts bag** and defaults it to "assume present" when omitted
(`manifest.js:301–304`: `const fileExists = typeof opts?.fileExists === 'function' ? opts.fileExists : () => true;`).

**Chosen seam:** `resolvePipeline(defaults, manifest, opts)` — a third, optional parameter; the
predicate read as `opts?.roleExists`, defaulting to `() => true` ("assume the role resolves")
when omitted. This:
- preserves the **7-export surface** (`resolvePipeline` is still the same export);
- preserves **every existing caller** — the current 2-arg calls (all scenario tests except the
  new negative, the `pipeline-resolve` bin until the walk wires the probe) keep working, the
  guard simply no-ops to "present";
- keeps the **pure core I/O-free** — the predicate is supplied by the caller (the walk's resolver
  knows what "installed" means; the test stubs it); the core never reads the filesystem.

This is the exact `fileExists` precedent applied to `resolvePipeline`. The role-existence check
is a guard *inside* `resolvePipeline` over the effective descriptors, not a new exported function.
A default `craft:<role>` and an omitted-opts call both pass (probe defaults true). SC1 is
unaffected: no-manifest resolution carries no swapped role, so the guard finds nothing to check.

> **DC-E (NEW, surfaced — see Decisions settled):** whether the new-negative test supplies
> `roleExists` as a per-call stub or relies on a shared test helper is a small load-bearing
> test-construction fork the ADRs do not pin. Surfaced below, not decided here.

### `skills/run/SKILL.md` — swap-fidelity note + axis documentation (R1/R2/R7)

The walk already states the G5 guarantee at lines 89–91 (role-swapped craft-native phase → the
contract is assembled from that descriptor regardless of who supplies the procedure). P9
*tightens and names* it, and documents the new `procedure:` axis. Content (final wording is
plan-phase work; the design fixes the content, not the prose):

1. **A named swap-fidelity guarantee** near the agent/inline step-4 branches: "**Contract
   survives the swap (G5):** the injected block (step 3) is assembled from the descriptor `id`,
   which neither a `role:` nor a `procedure:` override ever changes — so the swapped worker, agent
   or inline, always runs inside the same engine-owned contract. The swap changes *who* runs the
   phase (`role:`) or *which skill* orchestrates it (`procedure:`), never *what invariants bind
   it*."

2. **Role-not-found is engine-loud:** a swap to a role the resolver's `roleExists` probe rejects
   makes `pipeline-resolve` return `ok: false` — caught at §0 before the walk starts, surfaced via
   the existing "`ok: false` from `pipeline-resolve`" error-path row. The prose names the role
   case as one cause of that row (no NEW walk row for the role case — ADR-037 made it an engine
   return, symmetric with how a stranded consumer is "`ok: false` already, covered by the
   stop-on-error path" at `:183`).

3. **Default-phase `procedure:` override:** document that `phases.<id>.procedure` on a default
   phase redirects that phase's orchestration; the walk dispatches the string verbatim (step 1,
   ADR-025, unchanged) and a procedure that resolves to no installed skill STOPs via the EXISTING
   "procedure resolves to no installed skill" row (`:180`) — the negative path is the shipped
   idiom, not new machinery.

### Walk error paths — no NEW row for the role case (R3/R4)

The existing Walk error-paths table (`skills/run/SKILL.md:173–184`) already covers BOTH negatives:
- **Role-not-found:** `ok: false` from `pipeline-resolve` (`:177`) — ADR-037 routes the missing
  role through this existing row. No new row; the step-4 prose names the role case as a cause.
- **Procedure-not-installed:** the existing "procedure resolves to no installed skill" row
  (`:180`) — ADR-040 routes a missing overridden procedure through this existing row. No new row.

The original design's proposed "Agent mode spawn-fail / Inline mode STOP-and-ask" rows are
REMOVED: ADR-037 made the role negative an engine return (uniform, before the walk), dissolving
the inline-ambiguity problem those rows tried to solve. The disambiguation is now *by
construction* — the injected probe accepts a real external ref and rejects a typo, identically
for both modes, with no interactive ask.

### `examples/role-swap/workflow.md` — the sample (R9 / ADR-039)

Mirror `examples/lean-profile/` EXACTLY: a single `workflow.md` with a YAML frontmatter manifest
block + a prose body (verified `examples/lean-profile/` contains *only* `workflow.md`). The swap
subject is SETTLED by ADR-039: `implementation.role: acme:tdd-specialist` — the highest-stakes
swap (the code producer) to an EXTERNAL agent the local repo does not define. Content shape:

```yaml
---
# Injection point #10 (PRD §7): phases.<id>.role — swap WHICH agent runs a phase.
# The engine injects the P5 contract around your agent (G5) — your worker can't drop it.
# acme:tdd-specialist is EXTERNAL: it presumes the acme plugin is installed (the engine's
# roleExists guard fails closed otherwise) and, under inline execution, runs on the contract
# block alone (ADR-020 — the repo can't read an external agent's body).
phases:
  implementation:
    role: acme:tdd-specialist
---

# Example — swap the implementation agent to an external `role:`

`role:` on a phase points it at YOUR agent instead of the craft default. Here we hand the
HIGHEST-stakes phase — the code producer — to an external `acme:tdd-specialist`. The engine
still assembles and injects the invariant contract around it (G5): a swap changes *who* writes
the code, never the guarantees that bind it…  [prose: contract-survives-swap (G5) even for an
external worker; agent mode prepends the contract to the spawn / inline runs on the contract
block alone per ADR-020; `acme:tdd-specialist` is valid only when that plugin is installed — a
typo fails closed at resolution per ADR-037; "in your real repo this lives at
`.claude/workflow.md`"]
```

The README row (R9) follows the existing three-column pattern: a `role:`-swap example labelled
*all-current* (resolution + the `roleExists` guard + walk all ship in P9). The prose must LEAD
with the external/contract-only story (ADR-039's deliberate choice to demonstrate the strongest
claim — a swap can't drop the contract even when the worker is external), and flag the fail-closed
behaviour so a reader does not mistake the contract-only inline path for a defect.

### Surface-gate invariants (REVISED — hard constraints)

The surface gate is NO LONGER "`engine/src` 0-diff" (ADRs 037 + 040 commit to a minimal engine
delta). The revised invariant:

| Surface | Must stay |
|---|---|
| `engine/src/index.js` 7-export surface | unchanged |
| `resolvePipeline` exported call shape | unchanged for existing callers — the `roleExists` probe is added as an OPTIONAL trailing `opts` param (defaults to "role resolves"), mirroring `validateManifest`'s `fileExists`; the pure core stays I/O-free (predicate injected, never called from core) |
| `pipeline/default.yml` 13 descriptors, default `procedure`/`role` values, enabled/disabled state | unchanged |
| `graph.js` `validatePipeline(descriptors)` | unchanged |
| `contract.js` `assembleContract` | unchanged |
| `engine/bin/contract-assemble.js` | unchanged |
| SC1 run-record byte-identical | unchanged (no-manifest resolution carries no swapped role/procedure → `roleExists` never consulted, no override copied) |
| `engine/src` delta | the MINIMUM for (i) the `procedure` override field (`manifest.js` allowed-set + shape check; `edits.js` allowed-set) and (ii) the `roleExists` guard (`resolve.js` + the injected predicate seam) — nothing else |
| CI (`scripts/ci.sh`) | green at every commit; full scenario suite + 42 bats |

---

## Decisions settled (ADRs 037–040)

The four originally-open candidates (DC-A…DC-D) are RATIFIED — no open candidates remain. Pointer:

| Was | Now settled by | Outcome |
|---|---|---|
| **DC-A** — negative-path mechanism (walk STOP vs engine) | **ADR-037** (UPGRADED from the design's walk-level recommendation) | ENGINE-level: `resolvePipeline` takes an injected `roleExists` predicate; a rejected swapped ref makes resolution `ok: false`. Uniform for agent AND inline. No walk-STOP row, no inline ask. |
| **DC-B** — S2 hardening shape | **ADR-038** (as recommended) | Extend the two existing S2 tests: pin role-swapped-but-id-unchanged + assert the FULL `CORE_MARKERS` set survives. No fixture change to `S2/`. |
| **DC-C** — example swap subject | **ADR-039** (DEVIATED) | The example swaps `implementation.role: acme:tdd-specialist` (external, highest-stakes), NOT `planning → my:domain-planner`. Prose carries the external/contract-only-inline + fail-closed story. |
| **DC-D** — skill-swap scope | **ADR-040** (DEVIATED — scope widening) | Add a default-phase `procedure:` OVERRIDE field. `manifest.js` + `edits.js` accept/copy it; the walk dispatches verbatim (ADR-025); a missing procedure STOPs via the EXISTING row. `pipeline/default.yml` unchanged. |

### New decision candidate surfaced by the revision

The re-slice for the engine work uncovered ONE small load-bearing test-construction fork the ADRs
do not pin (ADR-037 mandates the engine guard but not how the test supplies the probe):

| # | Choice | Options | Recommendation |
|---|---|---|---|
| **DC-E** | **How the role-not-found negative test supplies `roleExists` to `resolvePipeline`.** ADR-037 fixes the seam (injected predicate) but not the test's stub shape. | **(a) Per-call inline stub** — the negative test passes `{ roleExists: ref => ref !== 'my:does-not-exist' }` (or `ref => ref.startsWith('craft:')`) directly as the third arg, mirroring `manifest.test.js`'s inline `ALWAYS_EXISTS`/`NEVER_EXISTS`. The two S2 positive tests keep their current 2-arg calls (probe defaults true). **(b) Shared `ROLE_EXISTS`/`ROLE_MISSING` consts** at the top of `scenarios.test.js`, mirroring `manifest.test.js:10–11`, reused across the role tests. **(c) A real probe** that consults installed agents/plugins — couples the unit test to the harness; rejected as non-pure. | **(a) Per-call inline stub.** Smallest surface; matches the established `manifest.test.js` injection idiom; keeps the two S2 positive tests as 2-arg calls (proving the default-true no-op path stays green). A shared const (b) is fine if the plan finds ≥3 reuse sites, but with one negative + one positive(procedure, which needs no probe) the inline stub is leaner. (c) violates pure-Node test isolation. |

---

## Test strategy

### Already green (must stay green — the surface gate)

- `engine/test/scenarios.test.js` — SC1, S1, S2, S3, S4, S5, S6, S7, S8, S9, S-lean, S-full,
  S-reorder, SC3, S-harness-review, S-harness-validation (405 node tests).
- `engine/test/contract-equivalence.test.js` — agent vs. inline block equivalence per descriptor
  (the bound that proves a swap changes nothing in the contract beyond the two carve-outs).
- `engine/test/manifest.test.js` — all existing shape-check tests, incl. the `role`/`model`
  string-shape negatives the new `procedure` shape-check mirrors.
- All existing negative tests; all 42 bats.

### P9 additions

#### S2 hardening — full-marker contract survival + id-unchanged (R5, ADR-038)

Extend the two existing S2 tests (`scenarios.test.js:238–269`). Given/When/Then:

```
S2 Given phases.planning.role:my:domain-planner, when resolvePipeline runs,
  then the effective planning descriptor carries role 'my:domain-planner'
  AND its id is unchanged ('planning')         [pins: the swap changes role, never id]

S2 Given the role-swapped planning descriptor, when assembleContract runs on it,
  then EVERY core marker survives (the full CORE_MARKERS set: never commit on a red gate ·
  Blocker protocol · provenance · suppression · swallowed · Bounded scope ·
  the agent commit is the handoff · the role model resolved) AND the producer-bundle
  marker (Decision-candidates) survives     [pins: contract-survives-swap, G5, at the
                                              assembly boundary the walk uses]
```

(Today's S2 contract test checks only `'Never commit on a red gate'` and `'Decision-candidates'`.
The hardened test asserts the FULL `CORE_MARKERS` set survives, proving the swap drops *nothing*.
Reuse the `CORE_MARKERS`/`hasCI` shape from `contract-equivalence.test.js:34–49` — import or
re-derive the const; do not re-list markers ad hoc.)

#### Negative — swap to a non-existent role makes resolution fail (R6, ADR-037)

New fixture `engine/test/fixtures/scenarios/S2-bad-role/manifest.yml`:

```yaml
phases:
  planning:
    role: my:does-not-exist
```

New test, with the injected `roleExists` stub rejecting the bad ref (DC-E(a), recommended):

```
S2-neg Given phases.planning.role:my:does-not-exist and a roleExists probe that
  rejects it, when resolvePipeline runs, then ok:false AND an error names the phase
  (planning) and the unresolved ref (my:does-not-exist)
      [pins: the engine guard fails closed at resolution, uniformly — ADR-037]
```

Construction: `resolvePipeline(loadDefault(), loadScenarioManifest('S2-bad-role'), { roleExists: ref => ref !== 'my:does-not-exist' })`
(or `ref => ref.startsWith('craft:')`, which also rejects the bad ref while passing all default
`craft:<role>` refs). Assert `result.ok === false` and that some `errors[]` entry includes both
`'planning'` and `'my:does-not-exist'`. A companion positive may pin that the SAME bad-role
manifest resolves `ok: true` when `roleExists` is the default-true probe (omitted opts) — proving
the guard is the probe's, not a hard-coded engine reject (parked unless the plan wants the extra
pin).

#### Positive — default-phase `procedure:` override lands on the descriptor (R8, ADR-040)

New fixture `engine/test/fixtures/scenarios/S2-procedure/manifest.yml`:

```yaml
phases:
  planning:
    procedure: acme:my-planner
```

New test:

```
S2-proc Given phases.planning.procedure:acme:my-planner, when resolvePipeline runs,
  then the effective planning descriptor carries procedure 'acme:my-planner'
  AND its id is unchanged ('planning')
      [pins: applyAllowedOverrides copies procedure onto the descriptor — ADR-040]
```

No probe needed (procedure is not role-existence-checked at the engine; its negative is the walk
STOP). The procedure-missing negative is NOT a node test — it is the EXISTING walk
"procedure resolves to no installed skill" STOP (`run/SKILL.md:180`), doc-pinned, consistent with
how ADR-025's procedure-STOP is a walk guarantee rather than an engine return.

#### manifest-lint — `procedure` shape check (R7, ADR-040)

In `engine/test/manifest.test.js`, mirror the existing `role`/`model` shape-check tests:

```
Given phases.planning.procedure:'acme:x', when validateManifest runs, then ok:true
Given phases.planning.procedure:42, when validateManifest runs, then ok:false with
  an error containing 'phases.planning.procedure must be a string'
```

#### Example sanity (R9)

No automated test asserts example content (consistent with `lean-profile` — no test references
it). The example is prose; its correctness is reviewed in the docs phase, and the manifest
frontmatter is implicitly lint-clean (a `role:` string passes `validateManifest`). Parked unless
the review phase requests a fixture-load assertion.

---

## Slice shape (for the plan phase)

Re-sliced for the engine work. Each slice carries the pre-chewed context below and is one atomic
TDD commit (Red→Green→Refactor, Given/When/Then). Slices are ordered so the engine field lands
before its UX prose and example.

| Slice | Scope (one line) | Pre-chewed context |
|---|---|---|
| **s1** | Engine: default-phase `procedure:` override field — lint accepts it + `applyAllowedOverrides` copies it onto the descriptor (ADR-040) | **manifest.js:** add `'procedure'` to `PHASE_FIELDS` (Set at `:27–30`); add shape check in `validatePhaseBlock` next to `:263` role/model branches — `else if (field === 'procedure' && typeof value !== 'string')`. **edits.js:** add `'procedure'` to `ALLOWED_PHASE_OVERRIDE_FIELDS` (`:12`); the generic loop in `applyAllowedOverrides` (`:29–40`) copies it (scalar branch, not the harness deep-merge). **Tests:** `manifest.test.js` (mirror role/model shape tests — `:263` style; consts `ALWAYS_EXISTS` at `:10`); new fixture `engine/test/fixtures/scenarios/S2-procedure/manifest.yml`; S2-proc positive in `scenarios.test.js` (use `loadScenarioManifest`/`loadDefault` at `:31–38`). No `index.js`/`default.yml` touch. Red: lint rejects `procedure` as unknown field / override not copied; Green: both pass. |
| **s2** | Engine: `roleExists` guard — `resolvePipeline` takes an injected predicate; a rejected swapped role → `ok:false` (ADR-037) | **resolve.js:** `resolvePipeline(defaults, manifest)` at `:152` → add optional 3rd `opts` param; read `const roleExists = typeof opts?.roleExists === 'function' ? opts.roleExists : () => true;` (mirror `manifest.js:304`). Add a guard over `effective` (computed at `:213` — the enabled descriptors, each carrying its resolved `role`), placed after the `effective` filter and before the gate resolution / `ok:true` return (`:213–234`), that pushes a role-not-found error + returns `ok:false` when an effective descriptor's `role` ref is rejected (excludes default-off phases by construction). **Anchors:** `validateManifest` opts shape `manifest.js:301–304` (the injection precedent); existing early-return shape `resolve.js:204–211`. **Tests:** new fixture `engine/test/fixtures/scenarios/S2-bad-role/manifest.yml` (`planning.role: my:does-not-exist`); S2-neg in `scenarios.test.js` with per-call stub `{ roleExists: ref => ref !== 'my:does-not-exist' }` (DC-E(a)). Surface check: `index.js` 7 exports unchanged; SC1 still byte-identical (probe defaults true, no swapped role). Red: bad-role manifest resolves `ok:true` today; Green: `ok:false` with naming error. |
| **s3** | S2 hardening: extend the two S2 tests — id-unchanged + full CORE_MARKERS survival (ADR-038) | `engine/test/scenarios.test.js:238–269` (the two S2 tests + `loadScenarioManifest`/`assembleContract` already imported at `:19–21`); reuse `CORE_MARKERS`/`hasCI` pattern from `contract-equivalence.test.js:34–49` (import or re-derive — do not re-list); fixture `engine/test/fixtures/scenarios/S2/manifest.yml` UNCHANGED. Pure-Node. Red: extended assertion fails on the 2-marker-only contract test + the missing id-unchanged pin; Green: assert full set + id — the engine already passes it (structural). |
| **s4** | Walk/UX prose: swap-fidelity guarantee (G5) + `procedure:`-axis doc + role-not-found-is-engine-loud note in `skills/run/SKILL.md` (no NEW error-paths row) | `skills/run/SKILL.md:89–92` (existing G5 prose to tighten + name both axes), `:117` (agent-mode swap line), `:122–133` (inline-mode local/non-local branch, ADR-020), `:78–88` (procedure verbatim-dispatch — document the default-phase `procedure:` override rides it), Walk error-paths table `:173–184` (NO new row: role case → existing `ok:false` row `:177`; procedure case → existing procedure-STOP row `:180`). No engine touch. Consistency: match the "resolves to no installed skill" idiom verbatim; do not invent an inline "ask". |
| **s5** | Example + README: `examples/role-swap/workflow.md` (`implementation.role: acme:tdd-specialist`) mirroring `lean-profile` exactly + README row (ADR-039) | `examples/lean-profile/workflow.md` (structure to mirror — single file, frontmatter + prose, closing "in your real repo this lives at `.claude/workflow.md`" line); `examples/README.md` (the three-column table + the bulleted Examples list — add a `role:`-swap row labelled *all-current*); ADR-039 for the external/contract-only-inline + fail-closed narrative; ADR-020 for the inline-contract-only prose; ADR-037 for the fail-closed note. No engine touch. |

**Slice ordering note:** s1 and s2 are the engine slices (independent of each other — different
files; s1 touches `manifest.js`/`edits.js`, s2 touches `resolve.js`). s3 hardens S2 (independent
of s1/s2 — it asserts the already-passing structural property). s4 (walk prose) and s5
(example/README) document what s1/s2 shipped and should land after them so the prose references
real behaviour. The plan phase fixes the final commit sequence; all five are green-by-construction
on their own commit.

---

## Out of scope

| Item | Why excluded |
|---|---|
| `override:`-file (procedure-body) swap UX | PRD §7 #9 — a separate injection point (a procedure-BODY *file* on a default phase, distinct from the `procedure:` *ref* override ADR-040 brings in); its own test surface; not P9 |
| `procedure:` verbatim-dispatch / skill swap on inserted phases | Shipped P7 (ADR-025); P9 reuses its dispatch + STOP for the default-phase `procedure:` override, does not re-open the inserted-phase path |
| `model:` swap UX | The `model:` field is honored by model-resolution (`run/SKILL.md`) and lint-accepted (P8); a dedicated model-swap UX is not in the P9 row (P9 owns `role:` + `procedure:`) |
| Inserted-phase contract injection (teaching `contract-assemble` resolved inserted descriptors) | Parked P7→P14 (`run/SKILL.md:92–96`); a role/procedure swap is on a *default* phase (id-keyed contract works today) |
| Derived-plugin registration surface (`craft.extends:`) | P14 (ADR-025); a `my:`/`acme:` role/procedure names an agent/skill the harness resolves, not a craft-registered one. The `roleExists` probe's "what counts as installed" definition rides with the caller (ADR-037), keeping this question out of the core |
| `pipeline/default.yml` changes | SoT frozen for the customizable-engine program; a role/procedure swap is a *manifest* concern, never a default change (SC1 stays byte-identical) |
| Per-invocation `--role` / `--procedure` CLI flag | Not in the P9 row; would follow the `--profile`/`--skip` `cli-overlay.js` pattern (ADR-022) in a later phase |
| Real Task-spawn end-to-end test | Tests are pure-Node (no harness); the spawn is covered by the manual acceptance check (`run/SKILL.md:245`); P9 asserts the structural guarantee (id-keyed contract survival) + the engine role guard |
