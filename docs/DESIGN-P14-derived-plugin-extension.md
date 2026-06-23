# Design — P14: derived-plugin extension surface

> Brief: ship Tier-2 — a derived local plugin (`dependencies: ["craft"]`, ships
> `pluginB:my-phase` + `pluginB:my-agent`) wired into a craft run through the repo
> manifest `.claude/workflow.md` via a `craft.extends:` registration block; teach
> `contract-assemble` the resolved/inserted descriptors so a registered/inserted phase
> EXECUTES under the engine-owned contract (closes the P7 rider, ADR-025); define
> "registered" for `roleExists` so an external ref fails closed when unregistered
> (closes the P9 rider, ADR-037); plan the Tier-2 DX docs (injection-catalog #12 + the
> #11 caveat). Resolves G8 / SC9 / S7. Gate = S7 green end-to-end.
> Status: draft → self-reviewed ×3 → accepted → revised against ADRs 069–075
> (DC-1..DC-7 ratified; DC-5 deviates from the recommendation — `extends.phases` MAY
> override a default id via a full-replace, override-aware insert path, ADR-073)

## Context

### What the spike already pinned (do not re-pin; cite it)

**SP2 Phase B is GREEN** (`docs/SPIKE.md` lines 77–96, CLI 2.1.177). Cross-plugin dispatch
works on *native* primitives — no bespoke mechanism: a plugin-A orchestrator skill invoked
`ext-phase:custom-phase` (Skill tool) and spawned `ext-phase:new-role` (Task tool,
`subagent_type: ext-phase:new-role`), with the confirming run allowlisting **only
`Skill,Task`** so the result tokens could come from nowhere but genuine cross-plugin
invocation. The hard constraint (SPIKE.md line 57): **a plugin cannot read another plugin's
files** — `../` traversal fails post-install, there is no `${PLUGIN_B_ROOT}`. **This forces
the whole design**: the engine never reads plugin B's files; plugin B ships only
skill/agent *content* addressed by namespaced name, and **the descriptor wiring lives in the
repo manifest** craft already reads. The P14 design therefore designs *zero* new dispatch —
it designs the **registration declaration** that the manifest carries and the engine
validates, so the SP2-proven dispatch has something to dispatch.

The two parked riders are reproduced empirically in this worktree:

```
$ node engine/bin/contract-assemble.js --descriptor-id bench
contract-assemble: unknown descriptor-id "bench". Known ids: workspace, …, integrate
exit=2                                              # rider #2 — inserted id cannot EXECUTE

$ node engine/bin/pipeline-resolve.js pipeline/default.yml \
      engine/test/fixtures/manifests/external-role.md ; echo $?
0                                                   # rider #3 — acme: ref passes permissively
```

### What the engine already provides (do not redesign)

P3–P13 are complete and green (528 `node --test` + 62 bats; `scripts/ci.sh`). The resolver
pipeline in `engine/src/resolve.js` is, in order:

```
aliasResolve → validateExecutionValues → expandProfile →
applyEnableEdits → applyInserts → checkReorderApplicability → applyReorder →
resolveExecution → checkStrandedConsumers → validatePipeline →
roleExists-filter → resolveGatesAndWaivers → buildManifestRecords
```

- **Inserted-phase resolution already works (P7).** `applyInserts` (`engine/src/edits.js:101`)
  builds an inserted descriptor with defaults `{ enabled:true, contract:[], consumes:[],
  produces:[], self_supply:[], execution:'agent' }` then spreads the manifest `phase` block
  over them. **S7 is already PARTIAL-green** (`engine/test/scenarios.test.js:435-465`): a
  manifest inserting `acme:bench` (`procedure: acme:bench`, `role: acme:bench-runner`,
  `gate: …`) resolves, lands in `effective[]`, and gets a `gateDecisions` entry. The test
  header (lines 8–12) explicitly marks the **registration UX** as the P14 gap, not the
  resolution.

- **Inserted-phase *dispatch* already works (P7, ADR-025).** The walk
  (`skills/run/SKILL.md` step 1) dispatches `phase.procedure` **verbatim**, namespace-agnostic;
  `craft:bench` and `acme:bench` are identical strings to the dispatch line. The walk STOPs
  with "procedure resolves to no installed skill" if the plugin isn't installed.

- **The contract is engine-owned and injected around *whatever* procedure runs (P5).**
  `assembleContract(descriptor, manifest, fragments, opts)` (`engine/src/contract.js:90`) keys
  on `descriptor.contract` (a list drawn from the closed `BUNDLE_VOCAB`, `graph.js:2`) and
  `descriptor.id`. So a namespaced procedure **cannot drop the contract** — the G5 promise
  holds across the plugin boundary by construction.

- **`roleExists` is an injected predicate (P9, ADR-037).** `resolvePipeline` takes
  `opts.roleExists(ref)→bool` (`resolve.js:175`) and filters `effective` against it
  (`resolve.js:237-239`), failing closed with `ok:false`. The bin
  (`engine/src/pipeline-resolve-main.js:12-19`) supplies the live probe: craft-native
  `craft:<role>` resolves iff `agents/<role>.md` exists (separator-guarded against traversal);
  **every non-`craft:` ref returns `true` (permissive)** — line 13. ADR-037 deliberately left
  "what counts as installed for an external ref" to **the probe the caller supplies** → that
  is the P14 question.

- **The manifest validator is the schema home.** `validateManifest(manifest, opts)`
  (`engine/src/manifest.js:352`) checks a closed `TOP_KEYS` allow-set (line 11), rejecting any
  unknown top-level key. `PIPELINE_KEYS` (line 49) recognizes `insert` **as a key but does NOT
  shape-validate the inserted phase block** — the inserted `{id, procedure, contract, …}`
  reaches `applyInserts` unchecked. `fileExists` is injected; the bin resolves relative refs
  against repo root (`manifest-lint-main.js buildFileExists`).

- **`contract-assemble` reads ONLY `pipeline/default.yml`.**
  `contract-assemble-main.js main()` (lines 94-110) parses `default.yml`, does
  `descriptors.find(d => d.id === descriptorId)`, and STOPs "unknown descriptor-id" for any id
  not in the 13 defaults. This is rider #2 — an inserted/registered id has no execution-time
  contract.

- **The 7-export surface is stable** (`engine/src/index.js`): `parsePipeline`,
  `validatePipeline`, `ALIAS_MAP/resolveAlias`, `resolvePipeline`, `assembleContract`,
  `normalizeFindings`, `validateManifest`. P14 changes function *bodies*, not the export list.

- **`everything-claude-toolkit/` already wires a derived plugin via the manifest** —
  `examples/everything-claude-toolkit/workflow.md` swaps `role: my-toolkit:planner` and
  inserts a phase `procedure: my-toolkit:license-check`. This is the load-bearing precedent:
  **the manifest already carries cross-plugin wiring today** through `pipeline.insert` +
  `phases.<id>.role`. P14's job is to make that wiring (a) a **first-class, validated
  registration surface** and (b) **executable end-to-end** (the two riders), not to invent a
  parallel mechanism.

### What ADR-025 and ADR-037 settled (do not re-open)

- **ADR-025:** the walk dispatches `phase.procedure` verbatim; P7 built dispatch, P14 builds
  the **`craft.extends:` registration surface + teaches `contract-assemble` the inserted
  descriptors + the installed-derived-plugin end-to-end run**. P14 owns exactly these.
- **ADR-037:** `roleExists` is injected; the external-ref "installed" definition **rides with
  the probe the caller supplies**. P14 defines it and rewires the bin's probe. SC1 (no-manifest
  byte-identical) is unaffected — the default path never carries an external ref, so the new
  probe branch is never consulted on it.

### The invariant-core boundary (G5 / OQ4 — binding)

PRD OQ4 leans **no**: derived plugins MUST NOT touch the invariant core (§11). The design
must *prove* this rather than assert it: a registered phase's `contract:` draws only from the
closed `BUNDLE_VOCAB`; the engine-owned `assembleContract` prepends the same `core` bundle
(with the same carve-outs) around the registered procedure; the registered phase flows through
the same `validatePipeline` graph + gate discipline. **A registered plugin contributes a
worker and a descriptor; it can never contribute, weaken, or skip the floor.** §11 stays an
engine change, never a manifest key.

---

## Requirements

| # | Requirement | Mechanism |
|---|---|---|
| R1 | A top-level `craft.extends:` (spelling per DC-1) manifest block registers a derived plugin's **phases**, **agents**, **profiles**, and **backlog-adapters** by namespaced name; descriptor data lives in the manifest (never read from plugin B's files) | new validator sub-fn in `manifest.js` + new `TOP_KEYS` entry |
| R2 | `validateManifest` shape-checks every `extends` sub-block: phases (descriptor fields + closed bundle vocab + valid archetype), agents (namespaced ref strings), profiles (per-archetype `inline\|agent` maps), backlog-adapters (`{ name, ref }` with a resolvable ref); unknown sub-key or malformed value → loud `ok:false` | `validateExtends` + sub-validators in `manifest.js` |
| R3 | Registered `extends.phases` feed `resolvePipeline` through the single **override-aware** insert path (same `applyInserts` path, same graph/strand/gate validation): a registered id matching a **default** id **replaces** that default descriptor in place; a registered id with **no** default match **inserts** as today; a registered phase resolves into `effective[]`, carries its contract bundle, and dispatches its namespaced `procedure`. `checkUniqueIds` still guards two *new* registrations colliding on a *new* id (it no longer rejects a same-id-as-default registration — that path now replaces) | `resolve.js` normalizes `manifest.extends.phases` into the insert list (DC-2/ADR-070) with an override branch (DC-5/ADR-073); `applyInserts` (`edits.js:101`) / `checkUniqueIds` (`graph.js:30`, called from `validatePipeline` `graph.js:119`) |
| R3a | Override is a **full descriptor replace, not a field-merge**: a same-id registration supplies the whole descriptor (procedure, role, contract, edges, gate); **unspecified fields are NOT inherited** from the replaced default. The Tier-1 `phases.<id>.role`/`procedure` field-merge surface stays the way to *tweak* (not replace) a default | override branch swaps the descriptor object whole (DC-5/ADR-073); no merge over the default |
| R4 | `contract-assemble` resolves an inserted/registered `descriptor-id` against the **resolved** descriptor set (inserts + registrations + defaults), not `default.yml` alone — closing "unknown descriptor-id" for `bench`/`acme:bench`/registered ids | new flag carrying the resolved descriptor(s) into `contract-assemble-main.js` (DC-3) |
| R5 | A registered phase EXECUTES under the engine-owned contract: `assembleContract` emits the core bundle + the phase's declared `contract:` bundles + carve-outs, identical in shape to a default phase | reuse `assembleContract`; descriptor sourced via R4 |
| R6 | `roleExists` resolves an external ref against the **registered agent set** (`extends.agents` ∪ the `role:` of registered/inserted phases — exact rule per DC-4); an unregistered external ref fails closed (`ok:false`); a registered one passes; craft-native + traversal behavior unchanged | rewire the bin probe in `pipeline-resolve-main.js`; pass the registered set into the closure |
| R7 | A registered **profile** is selectable by `pipeline.profile`, expanding to its per-archetype map (the harness-archetype `agent` floor still forced); an unknown profile name still STOPs; a registered profile is **full + typed** (all six archetype keys, values ∈ `{inline,agent}`) | `expandProfile` consults registered profiles; `validateExtendsProfiles` enforces full+typed (DC-7/ADR-075) |
| R8 | A registered **backlog-adapter** is selectable as `backlog.source: <name>` resolving to its `ref` script via the existing `custom`-style port; failure = blocker (SP6 contract unchanged) | `validateBacklog` + `backlogSourceOf` learn registered adapter names |
| R9 | The invariant core is unbreachable across the boundary: a registered phase's `contract:` is rejected if it names a bundle outside `BUNDLE_VOCAB`; the core bundle is always prepended; `validatePipeline` + gate discipline apply identically (G5/OQ4 proof) | existing `checkBundleVocab` + `assembleContract` core prepend; a negative test pins it |
| R10 | S7 runs **end-to-end**: a registered/inserted phase resolves, its contract assembles, its role resolves, its gate decides — proven by a CI fixture that exercises the *engine* path without a real second-marketplace install (DC-6) | new scenario fixtures + unit tests + (DC-6) optional `--plugin-dir` smoke |
| R11 | SC1 byte-identical, the 7-export surface, `resolvePipeline`'s return shape, and `contract-assemble`'s default-path behavior all stay green; the new flag/keys are additive | surface-gate invariant + `EXPECTED_TESTS` bump |
| R12 | Tier-2 DX docs are **designed** (not written) this phase: injection-catalog point #12 (derived-plugin half) + the #11 inserted-phase contract-execution caveat in `docs/GUIDE-customizing.md`, plus a registered-plugin `examples/` sample — gated so the catalog only advertises a now-proven surface | §"Tier-2 docs plan" below; doc edits land in the documentation phase |

---

## Design

### Files that change

- `engine/src/manifest.js` — add `'extends'` (or `'craft'`, per DC-1) to `TOP_KEYS`; add
  `validateExtends(extends, fileExists, errors)` dispatched from the `validateManifest` switch;
  add per-sub-block validators (`validateExtendsPhases`, `validateExtendsAgents`,
  `validateExtendsProfiles`, `validateExtendsBacklogAdapters`). Reuse the closed
  `VALID_ARCHETYPES` + `BUNDLE_VOCAB` for phase-block checks (import from `descriptor.js` /
  `graph.js`, or factor a shared constant — DC governs duplication-vs-import).
- `engine/src/resolve.js` — normalize `manifest.extends.phases` into the insert list **before**
  the `applyInserts` call (`resolve.js:194`) per DC-2/ADR-070 (single path, no parallel pass).
  This normalize step carries the **override-aware branch** (DC-5/ADR-073): a registered id
  matching a default id replaces that default descriptor in place (against the
  post-`applyEnableEdits` list); a registered id with no default match flows to `applyInserts`
  (`edits.js:101`) as a plain insert. `checkUniqueIds` (`graph.js:30`, via `validatePipeline`
  `graph.js:119`) runs after and still rejects two new registrations colliding on a *new* id.
  Also make `expandProfile`/the profile lookup aware of `extends.profiles`; make
  `backlogSourceOf` accept registered adapter names. The 7-export `resolvePipeline` signature
  is unchanged (registrations arrive inside `manifest`, the existing arg).
- `engine/src/pipeline-resolve-main.js` — the bin builds the **registered-ref set** from the
  parsed manifest's `extends` (+ inserted phases per DC-4) and threads it into the `roleExists`
  closure; the closure's external-ref branch becomes "resolve against the registered set"
  instead of "always true".
- `engine/src/contract-assemble-main.js` — accept a flag (DC-3) carrying the resolved
  descriptor (or the manifest from which to recompute the resolved set) so
  `descriptors.find(d => d.id === descriptorId)` searches the **resolved** set; the
  default-path (no flag, default id) behavior is byte-unchanged.
- `engine/src/profile.js` — `expandProfile` either throws on unknown (today) or consults a
  registered-profile map passed in; a registered profile is full + typed (DC-7/ADR-075).
- `pipeline/default.yml` — **untouched** (registrations live in the manifest, never the SoT).
- `skills/run/SKILL.md` — step 1 + step 3 prose: note that an inserted/registered id now
  resolves at `contract-assemble` (remove the "rides with P14" caveat at lines 109-113);
  the "Walk error paths" table's inserted-id row updates from STOP to EXECUTE. The verbatim
  dispatch (step 1) is unchanged — already correct from P7.
- `engine/test/**` — new `manifest.test.js` cases (extends shape), `resolve.test.js` /
  `scenarios.test.js` (S7 end-to-end + registered profile + registered backlog),
  `pipeline-resolve-main.test.js` (external-ref registered/unregistered), and
  `contract-assemble-main.test.js` (inserted-id resolves via the flag). `EXPECTED_TESTS`
  bumps; any new bats counted.
- `examples/derived-plugin/` (or equivalent) + `examples/README.md` row #12 — **designed
  here, authored in the documentation phase** (R12).

### The `craft.extends:` manifest shape

The registration block is **manifest-carried** (SP2 file-access constraint). A derived plugin
B (`dependencies: ["craft"]`) ships skill/agent *content*; the repo `.claude/workflow.md`
declares *what* B contributes and *how it wires*:

```yaml
# .claude/workflow.md (repo root) — frontmatter
# Key spelled `extends:` (flat top-level) — ratified DC-1/ADR-069.
extends:
  phases:                           # registered SE steps — descriptor data, manifest-carried
    - id: bench
      procedure: pluginB:bench      # namespaced — SP2 dispatch target (verbatim)
      role: pluginB:bench-runner    # namespaced — must appear in agents: below (R6)
      archetype: harness            # from the closed VALID_ARCHETYPES
      contract: [harness-exec]      # from the closed BUNDLE_VOCAB (R9 floor)
      consumes: [change]
      produces: [bench-report]
      after: validation             # insert anchor (same vocabulary as pipeline.insert)
      gate: "pluginB-bench --check"
  agents:                           # registered roles — the roleExists "installed" set (R6)
    - pluginB:bench-runner
    - pluginB:domain-planner
  profiles:                         # registered whole-flow modes (R7)
    audit:
      setup: inline
      specification: agent
      construction: agent
      harness: agent                # harness floor re-forced regardless (profile.js)
      refinement: agent
      delivery: inline
  backlog-adapters:                 # registered backlog ports (R8)
    - name: acme-tracker
      ref: .claude/workflow/acme-backlog.sh
```

**Why these four sub-keys and not more.** PRD §12 #12 names exactly
"phases/agents/profiles/backlog-adapters." Each maps to an existing seam: phases→`applyInserts`
+ graph; agents→`roleExists`; profiles→`expandProfile`; backlog-adapters→the SP6 `custom`
port. The block adds *no new core capability* — it is the **named, validated front door** to
seams that already exist (today reachable only via `pipeline.insert` + `role:` ad-hoc, as the
toolkit example shows). This keeps the surface gate honest: P14 ships a registration *schema*
+ two execution fixes, not a new engine subsystem.

**Relationship to `pipeline.insert`.** A registered phase IS an insert with a richer,
validated descriptor and a namespaced `role`/`procedure`. **DC-2 is ratified (ADR-070):**
`extends.phases` is *normalized into* the insert list before `applyInserts` — one code path,
**no second resolution path**. The normalize step sits in `resolve.js` immediately upstream of
the `applyInserts` call (`resolve.js:194`), where `extends.phases` are folded into the same
insert list that `pipeline.insert` feeds; the same `applyInserts` → graph → strand → gate
machinery then applies.

**Override-aware insert (DC-5 ratified — ADR-073, the deviation).** The design originally
recommended `extends.phases` be *insert-only*; the user ratified the opposite. `extends.phases`
**MAY override a default phase by reusing its id**, resolved as a **full descriptor replace**
inside this same single path (ADR-070 + ADR-073) — not a parallel pass, not a field-merge. The
normalize-into-insert step branches by id:

```
registered phase whose id == a DEFAULT descriptor's id
  → REPLACE that default descriptor in place with the registered one (full swap)
registered phase whose id has NO default match
  → INSERT as today (applyInserts append/anchor — edits.js:101)
```

The branch lands where `extends.phases` are normalized into the insert list (`resolve.js`,
just above `applyInserts` at `resolve.js:194`): a same-id-as-default entry is applied as a
replace-in-place against the post-`applyEnableEdits` descriptor list rather than appended, so
it never reaches `applyInserts` as a duplicate. Genuine new-id registrations still flow through
`applyInserts` unchanged, preserving the existing P7 insert behavior.

**`checkUniqueIds` interaction (explicit).** `checkUniqueIds` (`graph.js:30`, invoked from
`validatePipeline` at `graph.js:119`) runs *after* the insert/replace step. Under override it
**no longer rejects a same-id-as-default registration** — that registration replaced the default
in place, so only one descriptor carries that id when `checkUniqueIds` runs. It **still rejects
two genuinely-new registrations colliding on the same *new* id** (both inserted, both present →
duplicate). So the uniqueness guard is unweakened for new ids; only the same-as-default case is
re-routed from "collide" to "replace" by the upstream override branch.

**Full replace, no field inheritance.** The replace is a whole-descriptor swap: the registered
phase supplies procedure, role, contract bundles, edges, and gate; **nothing is inherited from
the replaced default**. To *tweak* (not replace) a default, the author uses the Tier-1
`phases.<id>.role`/`procedure` field-merge surface — the two surfaces stay distinct (ADR-073).

### Closing rider #2 — inserted/registered id EXECUTES (`contract-assemble`)

Today `contract-assemble` re-parses `default.yml` and cannot see an inserted id. The fix
gives it the **resolved** descriptor set. Two shapes are live (DC-3):

- **(a) `--descriptor-json <path|->`** — the walk already holds the `Resolution` (step 1b); it
  passes the single resolved descriptor (or the `effective[]` array) as JSON. `contract-assemble`
  finds `descriptorId` in that set; falls back to `default.yml` only when the flag is absent
  (default-phase path byte-unchanged). *Pro:* zero recomputation, single source of truth (the
  Resolution the walk already parsed). *Con:* a new flag + the walk passes data it has.
- **(b) `--resolution <path>`** — pass the whole Resolution file; `contract-assemble` reads
  `effective[]`. *Pro:* symmetric with the walk's artifact. *Con:* `contract-assemble` learns
  the Resolution schema (coupling).
- **(c) re-resolve inside `contract-assemble`** from `--manifest` + `default.yml`. *Con:*
  duplicates the resolver; two code paths can drift — rejected on sight, recorded for
  completeness.

Whichever shape: the descriptor that reaches `assembleContract` carries the registered
phase's `contract:` bundles, so the **engine-owned core + declared bundles** wrap the
registered procedure — R5/R9 satisfied by the *existing* assembler with no contract-content
change.

**Edge — namespaced ids.** A registered phase may carry a namespaced `id` (S7 uses
`id: acme:bench`); the resolver already accepts colon-bearing ids end-to-end (verified —
`acme:bench` lands in `effective[]`). `contract-assemble --descriptor-id acme:bench` must
therefore accept a colon in the id value (it does — the value is taken as-is by `takeValue`)
and match it against the resolved set (DC-3), not reject it as a flag. The walk passes
`phase.id` verbatim; no escaping is needed since the id is a discrete argv argument, never
spliced into a shell string.

### Closing rider #3 — `roleExists` for external refs (`pipeline-resolve-main.js`)

The pure core already filters `effective` against the injected probe (`resolve.js:237`). Only
the **bin's probe** changes. Today (line 13) any non-`craft:` ref returns `true`. The new
probe consults a **registered-ref set** built from the parsed manifest:

```
external ref `pluginB:bench-runner`
  → registered  iff  ref ∈ registeredSet   (built from manifest.extends — DC-4 fixes the rule)
  → registered → true ;  unregistered → false (fail closed)
craft-native `craft:<role>`  → unchanged (agents/<role>.md probe + traversal guard)
```

**DC-4 is ratified (ADR-072 = option (ii)):** the registered set is **`extends.agents` ∪ the
`role:` of every registered/inserted phase** — including an **overriding** phase's `role:`,
which joins the set like any registered-phase role (a phase that replaces a default id and
declares `role: pluginB:x` registers `pluginB:x` for that run). The accepted trade-off: a
phase whose `role:` is itself a typo registers that typo (the stricter option (i),
`extends.agents`-only, would have caught it). The bin builds this set from the **parsed
manifest's `extends`** pre-resolution.

**Why this is fail-closed, not fail-permissive.** Pre-P14, a typo'd `acme:plannr` and a
deliberate `acme:planner` were indistinguishable (both `true`). Post-P14, only a ref the
manifest *registered* passes; a typo that doesn't match the registered set is caught at
resolution (`ok:false`, exit 2), before the walk dispatches — symmetric with the craft-native
typo guard, uniform for agent and inline (ADR-037).

**SC1 invariance.** The new branch fires only for non-`craft:` refs, which the default
pipeline never carries. No-manifest resolution → no `extends` → empty registered set → the
external branch is never consulted → SC1 record byte-identical.

**Validation ordering (trust model).** The walk runs `manifest-lint` (→ `validateManifest` →
`validateExtends`) at step 1 and refuses on INVALID *before* step 1b's `pipeline-resolve`. So
when the bin builds the registered-ref set, the `extends` block is already shape-valid — the bin
trusts it exactly as `contract-assemble` trusts `context:` (lint is the single gate; the bin
re-validates nothing). The registered set is built from the **parsed manifest's `extends`** the
bin reads pre-resolution — `roleExists` is injected *into* `resolvePipeline`, so it cannot and
must not read from the Resolution it helps produce.

### The invariant-core boundary (G5 / OQ4) — the proof, not the claim

A registered phase cannot lower the floor, by four independent mechanisms already in place:

1. **Closed contract vocabulary.** `checkBundleVocab` (`graph.js:91`) rejects any
   `descriptor.contract` bundle outside `BUNDLE_VOCAB`. A registered phase declaring
   `contract: [my-bespoke-floor]` fails resolution. A registered phase **cannot define a new
   contract bundle** — it draws only from the seven engine-owned ones. (R9 negative test.)
2. **Core always prepended.** `assembleContract` (`contract.js:94`) pushes `expandCore(...)`
   first, unconditionally, for every descriptor — registered, inserted, default, **or a
   registered descriptor that REPLACED a default (ADR-073 override)**. The slot's procedure
   runs *inside* the core (never commit on red, no suppression, blocker protocol, bounded
   scope, provenance) regardless of which worker/descriptor fills the slot. Override changes
   *which* descriptor occupies a default's id; it never changes that the core wraps it — the
   floor is keyed on the descriptor's presence in `effective[]`, not on its origin. It cannot
   opt out.
3. **Same graph + gate discipline.** A registered phase flows through `validatePipeline`
   (strand/edge/cycle) and `resolveGatesAndWaivers` identically; a code-producing registered
   phase needs a gate like any other; the walk's gate-cadence invariant binds it.
4. **No core injection point.** `extends` exposes phases/agents/profiles/backlog-adapters —
   **never** `core`, `contracts/`, the hooks floor, or §11. There is no manifest key that
   reaches the invariant core; changing it stays an engine change (PRD §7 "Not injectable").
   **Override (ADR-073) introduces no exception:** a replacing descriptor still draws its
   `contract:` only from the closed `BUNDLE_VOCAB` (mechanism 1), is still wrapped by the core
   (mechanism 2), and still flows through the same graph + gate discipline (mechanism 3). A
   derived plugin can re-home a default *slot*; it cannot re-home the *floor*.

OQ4 ("may derived plugins touch the invariant core?") is answered **no, structurally** — not
by policy prose but because no surface exists to do so.

### S7 end-to-end proof shape (SC9 / G8)

The proof must exercise the *engine* path without a real second-marketplace install (cost,
flakiness, network). **DC-6 is ratified (ADR-074): engine fixture (CI) + manual smoke.**

- **Primary (CI-gated): pure-manifest engine fixture.** Extend `S7/manifest.yml` to a full
  `extends:` block (phases + agents + profile + backlog-adapter). Assert, through the
  *real* engine entry points (not mocks): (a) `validateManifest` accepts it; (b)
  `resolvePipeline` lands the registered phase in `effective[]` with its bundle + gate; (c)
  the registered external `role:` passes `roleExists` while an *unregistered* sibling fails
  closed; (d) `contract-assemble --descriptor-id <registered-id> <DC-3 flag>` emits the core +
  declared bundle (the EXECUTE proof); (e) **override (ADR-073):** a registered phase reusing a
  **default id** replaces that default in `effective[]` (default descriptor gone, registered one
  at that id carrying its own bundle/role/gate), and `contract-assemble --descriptor-id <that
  default id>` emits the core wrapping the *registered* procedure — proving a re-homed slot still
  runs under the floor. This runs under `node --test`, deterministic, no plugin install. This is
  the SC9 "runs under the invariant core" assertion at the engine layer.
- **Optional (manual smoke, not CI-gated): real `--plugin-dir`.** A throwaway two-plugin
  fixture (mirroring SP2's `/tmp/craft-sp2`) driven by `claude -p --plugin-dir craft
  --plugin-dir pluginB`, asserting the registered phase actually dispatches + spawns. This is
  the same shape SP2 already proved GREEN; re-running it as a *documented manual smoke* (like
  the inline-fidelity + model-class checks already in `run/SKILL.md`) adds runtime fidelity
  without coupling CI to a second install. SP2 is the citation; this is the dogfood.

The split mirrors the repo's existing pattern: engine invariants are CI-gated unit/scenario
tests; full-pipeline cross-plugin behavior is a documented on-demand smoke (SP2-pinned).

### Tier-2 docs plan (R12 — designed here, authored in the documentation phase)

Once the surface is proven (S7 green), the documentation phase writes — **and only then**:

- **`docs/GUIDE-customizing.md` §3 Tier-2 (point #12):** replace the "*documented after P14*"
  stub (lines 132-141) with the real how-to — the `craft.extends:` shape above, the four
  sub-blocks, the "content in the plugin, configuration in the repo" rule (SP2), the
  invariant-core guarantee (a registered phase runs under the floor), and the precedence note
  (a registered phase is an insert; default-phase SWAP rules per DC-5).
- **§3 Tier-1 #11 caveat:** update the `†` footnote (lines 129-130) — inserted-phase contract
  *execution* now works (rider #2 closed); drop "lands with P14," state it ships.
- **`examples/derived-plugin/` + `examples/README.md` row #12 + GUIDE examples index:** a
  lint-clean `workflow.md` registering a phase + agent + profile, kept green by the
  `examples-lint` gate. The accompanying `agents/`/skill *content* is illustrative (the
  example documents the manifest wiring; the plugin content is a stub, since a real second
  plugin isn't installed in CI — the example shows the *configuration*, mirroring how
  `role-swap/` and `everything-claude-toolkit/` already document namespaced wiring).

Nothing is written until the surface resolves end-to-end — the catalog never advertises an
unproven path (PRD §17 P12; ADR-062).

---

## Decision candidates

> **Ratified.** The decisions phase recorded DC-1..DC-7 as ADRs 069–075. Six matched the
> recommendation; **DC-5 deviated** (override now allowed). The "Ratified outcome" column is the
> binding record; the recommendation column is preserved for provenance.

| # | Choice | Alternatives (≤3) | Recommendation | Ratified outcome | Why |
|---|---|---|---|---|---|
| DC-1 | Manifest key spelling/shape | (a) top-level `extends:` · (b) `craft.extends:` (a dotted single top-level key, per PRD §12 sample) · (c) nested `craft: { extends: {…} }` | **(a) `extends:`** | **ADR-069 = (a) flat `extends:` — MATCHES** | The manifest is *already* craft's (`.claude/workflow.md`); a `craft.` prefix is redundant inside craft's own file, and `TOP_KEYS` is a flat set of bare keys (`backlog`, `pipeline`, …). PRD §12's `craft.extends:` reads as "the extends surface of craft," not a literal dotted YAML key. Flat `extends:` matches the existing schema; the PRD prose is satisfied. |
| DC-2 | How `extends.phases` reaches resolution | (a) normalize into the `pipeline.insert` list before `applyInserts` (one code path) · (b) a parallel `applyRegistrations` pass · (c) require the user to *also* write `pipeline.insert` (extends only validates) | **(a) normalize into inserts** | **ADR-070 = (a) normalize into the insert path — MATCHES** | A registered phase *is* an insert with a richer descriptor; reusing `applyInserts` means one graph/strand/gate path, no drift, minimal diff. (b) duplicates machinery; (c) defeats the point of a first-class surface. The override sub-case (DC-5) is handled by an override-aware branch *within* this same path, not a parallel pass. |
| DC-3 | How `contract-assemble` learns inserted descriptors | (a) `--descriptor-json <path\|->` (walk passes the one resolved descriptor it holds) · (b) `--resolution <path>` (whole Resolution) · (c) re-resolve from `--manifest` + `default.yml` inside the bin | **(a) `--descriptor-json`** | **ADR-071 = (a) `--descriptor-json` — MATCHES** | The walk already parsed the Resolution (step 1b) and holds `effective[]`; passing the matched descriptor is zero-recompute and keeps `contract-assemble` ignorant of the Resolution schema. (c) duplicates the resolver (drift risk). |
| DC-4 | "Registered" set for `roleExists` external refs | (a) `extends.agents` only (single declaration point) · (b) `extends.agents` ∪ every registered/inserted phase's `role:` · (c) any namespaced ref present anywhere in the manifest | **(b) agents ∪ phase roles** | **ADR-072 = (b) agents ∪ registered-phase roles — MATCHES** | A phase declaring `role: pluginB:x` *is* registering `pluginB:x` for the run; requiring double-declaration is friction. (a) is stricter (catches a phase-role typo that (b) would silently accept) — a real trade-off the user owned. (c) is too loose (a typo anywhere passes). An overriding phase's `role:` (DC-5) joins this set like any registered-phase role. |
| DC-5 | May `extends.phases` only INSERT, or also SWAP/override a default phase? | (a) insert-only (default phases swap via existing `phases.<id>.role`/`procedure`) · (b) also allow registering a same-`id` phase that overrides a default · (c) insert + a separate `extends.overrides:` block | **(a) insert-only** | **ADR-073 = (b) override ALLOWED — DEVIATION from rec.** Same-id-as-default → **full descriptor replace** via an **override-aware branch** inside the single normalize-into-insert path (ADR-070); new id → insert; `checkUniqueIds` still guards two new registrations on a *new* id. Override is a **full replace, no field inheritance** — the Tier-1 `phases.<id>` field-merge stays the way to *tweak* a default. The replaced slot still runs under the engine-owned core (R9/G5). | Recommendation was insert-only (swap already has the Tier-1 `role:`/`procedure:` surface; same-id collides with `checkUniqueIds`). The user ratified override to enable a **fully derived pipeline** that re-homes a default slot (procedure + role + contract + edges + gate) to a derived plugin — the override-aware branch routes a same-id-as-default registration from "collide" to "replace-in-place" so `checkUniqueIds` sees one descriptor, not two. |
| DC-6 | S7 proof: CI cost vs fidelity | (a) pure-manifest engine fixture only (CI) · (b) engine fixture (CI) + documented manual `--plugin-dir` smoke (SP2-shape, not CI) · (c) real second-plugin install in CI | **(b) engine fixture + manual smoke** | **ADR-074 = (b) engine fixture + manual smoke — MATCHES** | (a) proves every engine invariant deterministically; the manual smoke (like the existing inline-fidelity + model-class checks) adds runtime cross-plugin fidelity without coupling CI to a flaky second install. (c) is high-cost/flaky for marginal gain — SP2 already pinned the dispatch. |
| DC-7 | Registered-profile validation rigor | (a) require all six archetype keys, values ∈ `{inline,agent}` · (b) allow partial maps (missing archetype → `agent` default) · (c) profiles registration deferred to a follow-up (ship phases/agents/backlog now) | **(a) full + typed** | **ADR-075 = (a) full + typed — MATCHES** | A profile is a whole-flow contract; a partial map silently agent-defaults a phase the author forgot — surprising. Full + typed fails loud on an incomplete profile. (c) is a viable scope-cut if profile registration proves heavy — but PRD §12 names profiles explicitly, so cutting needs user sign-off. |

---

## Test strategy

**Unit — `engine/src/manifest.js` (`validateExtends`):** valid full block (ok); unknown
sub-key (`extends.bogus`) rejected; a phase with an out-of-vocab `contract:` bundle rejected
(R9 floor); a phase with an invalid `archetype` rejected; a malformed agent ref (non-string)
rejected; a partial/typed-wrong profile rejected (DC-7); a backlog-adapter missing `ref`
rejected; a backlog-adapter `ref` that doesn't exist → `fileExists` miss (injected predicate).
Errors **accumulate** (no short-circuit), matching the validator's house style.

**Unit — `engine/src/resolve.js` / `scenarios.test.js` (S7 end-to-end):** registered phase
lands in `effective[]` with bundle + gate; registered phase flows through `validatePipeline`
(a registered consumer-before-producer → `ok:false`); registered profile selectable via
`pipeline.profile`; registered backlog adapter surfaces in `record[]`; **SC1 stays
byte-identical** (the anchor golden); the existing S7 PARTIAL assertions upgrade to full.

**Unit — override-aware insert path (DC-5/ADR-073):**
- **same-id-as-default → full replace.** A registered phase whose `id` matches a default id
  replaces it: assert the **default's original descriptor is gone** from `effective[]` (its
  procedure/role/contract no longer present at that id), the **registered descriptor occupies
  that id at the right position**, and it carries **its own** contract bundle + role + gate.
- **`checkUniqueIds` still fails two new registrations sharing a new id.** Two registered
  phases both declaring a *new* (non-default) id → `ok:false` "Duplicate descriptor id"
  (`graph.js:35`). The same-as-default path must NOT trip this (replace, not append) — a
  same-id-as-default registration resolves `ok:true` with one descriptor at that id.
- **full replace does NOT inherit replaced-default fields.** A same-id registration that omits
  a field the default had (e.g. an edge or `gate:`) does **not** silently pick up the default's
  value — the resolved descriptor carries only what the registration declared (plus the
  `applyInserts` field defaults for genuine inserts; for a replace, the registered descriptor
  stands alone). Assert a replaced phase that drops the default's `consumes:` resolves with the
  registration's `consumes:`, not the default's.
- **override still runs under the core (R9/G5).** The replaced phase's assembled contract still
  prepends the engine-owned core + only its own `BUNDLE_VOCAB` bundles (the EXECUTE-under-floor
  proof holds for a replacing descriptor identically — §invariant-core mechanism 2).

**Unit — `pipeline-resolve-main.js` (the bin probe, DC-4):** an external `role:` present in
the registered set → `ok:true`; an external `role:` NOT registered → `ok:false` naming the
phase + ref (the rider #3 close — the current `external-role.md` permissive test **flips** to
fail-closed, or a new registered fixture is added alongside); craft-native + traversal
behavior unchanged.

**Unit — `contract-assemble-main.js` (rider #2 close, DC-3):** `--descriptor-id bench`
**with** the resolved-descriptor flag → exit 0, stdout carries core markers + the phase's
declared bundle markers (e.g. `harness-exec` `survivors or violations`); **without** the flag,
a default id still resolves from `default.yml` (byte-unchanged); an id absent from *both* the
flag set and defaults still STOPs (the guard survives).

**Load-bearing finding — inserts bypass descriptor normalization (verified in worktree).**
`applyInserts` (`edits.js:101`) spreads the manifest `phase` block over field defaults but
**does NOT call `normalizeEntry`/`deepFreeze`** (those run only in `parsePipeline`,
`descriptor.js:116`). Confirmed: a resolved `acme:bench` descriptor is **`Object.isFrozen ===
false`**, and its `contract`/`consumes`/`produces` are whatever YAML shape the author wrote —
**not** coerced through `normalizeStringArray`. Consequence: a malformed `contract: harness-exec`
(scalar, not list) would reach `checkBundleVocab` as a *string*, iterated character-by-character.
**Therefore `validateExtends` is the SOLE shape guard for a registered phase** — it must do the
type/array/vocab/archetype checks `normalizeEntry` would have done, because the insert path won't.
This is why R2's per-field validation is not optional polish but the load-bearing floor. **Override
(ADR-073) REINFORCES this, not weakens it:** a same-id-as-default registration *replaces* a default
descriptor that was normalized + `deepFreeze`d at `parsePipeline` time with one that is **equally
unfrozen and uncoerced** — the replacing descriptor never passes through `normalizeEntry` either, so
it too must be fully shape-validated by `validateExtends` before it can stand in a default's slot. A
replace therefore cannot rely on inheriting the replaced default's normalized shape (it inherits
nothing — full replace, ADR-073); every field it stands on must be shape-validated up front. (A
secondary option the planner may weigh: route `extends.phases` through `normalizeEntry` so
registered descriptors are normalized+frozen like defaults — but that is a behavior change to the
shared insert path and must not regress the existing P7 insert tests; keep it a candidate, not a
given.)

**Property/round-trip lens:** the existing `contract-equivalence.test.js` agent/inline-shape
invariant already binds `assembleContract` per descriptor; once a registered descriptor reaches
`assembleContract` (via DC-3), its agent/inline carve-out equivalence holds for free — no new
property test, but the S7 end-to-end case asserts the registered phase's assembled block carries
the core + declared bundle in both modes.

**Fixtures:** upgrade `engine/test/fixtures/scenarios/S7/manifest.yml` to a full `extends`
block; add `engine/test/fixtures/manifests/registered-role.md` (registered) +
`unregistered-role.md` (fail-closed); add a malformed-`extends` fixture per validator case.
The `examples/derived-plugin/workflow.md` (R12) is lint-gated by `examples-lint` (bats).

**Harness bookkeeping:** every new `node --test` case bumps `EXPECTED_TESTS` in `scripts/ci.sh`
(currently 528); any new `test/*.bats` (e.g. an `examples-lint` row) is counted by the bats
gate. The part that adds the example appends to `ci.sh` per the substrate-gate convention.

**ADRs:** the design surfaces DC-1…DC-7; the decisions phase records the chosen ones as ADRs
069+ (next free number) per `templates/adr.md`. No provenance refs land in source/test.

---

## Out of scope

- **Vendored descriptors as the primary path** — SP2 cleared cross-plugin dispatch GREEN;
  vendored descriptors stay the documented *fallback* for a future runtime lacking cross-plugin
  dispatch (PRD R1/SC9), not built here.
- **Cross-marketplace dependency allowlisting** (`allowCrossMarketplaceDependenciesOn`) — a
  runtime/install concern (SPIKE.md line 53), not an engine schema concern; the manifest wires
  an already-installed plugin.
- **A new contract bundle for derived plugins** — explicitly forbidden (R9/G5); `BUNDLE_VOCAB`
  stays closed and engine-owned. Changing the floor is an engine change, never a manifest key.
- **P15 second-instantiation** (a non-tsgit repo, zero manifest) and **P16 provider-agnostic** —
  separate backlog rows; P14 ships only the registration surface + the two rider closures.
- **Writing the Tier-2 docs** — this phase *designs* the doc plan (R12); the documentation
  phase authors `GUIDE-customizing.md` #12/#11 + the `examples/` sample, gated on S7 green.
- **A per-invocation `--extends` CLI flag** — registration is a repo-shape concern
  (`.claude/workflow.md`), not a per-run toggle; no CLI overlay for it.
