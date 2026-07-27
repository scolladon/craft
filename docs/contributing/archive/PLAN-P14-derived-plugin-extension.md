# Plan — P14: derived-plugin extension surface

> Source: design doc `docs/DESIGN-P14-derived-plugin-extension.md` · ADRs `069–075`
> The plan is the implementation script AND the knowledge handoff. Part agents start
> with zero context: whatever a part block omits is paid later as agent rediscovery.
> `plan-lint.sh` enforces the schema below — the plan phase cannot close without it.

## Sizing rules

- Every part costs a full agent lifecycle (spin-up, zero-context rebuild, gate) — it
  must earn it. No standalone test-only parts for FEATURE code: coverage/interop/property
  tests fold into the implementation part whose code they exercise. EXCEPTION:
  test-infra-only and docs-only parts (tooling config, test helpers, fixtures,
  mutation/ADV/property suites, docs/prose) with no `src/` delta ARE standalone — they
  have no implementation part to fold into.
- A part that would be a pure test pass over already-landed code merges into its
  neighbour.

## Shared substrate (read once — applies to every part)

**The 7-export surface is FROZEN** (`engine/src/index.js`): `parsePipeline`,
`validatePipeline`, `ALIAS_MAP`/`resolveAlias`, `resolvePipeline`, `assembleContract`,
`normalizeFindings`, `validateManifest`. **Every new symbol this plan adds is INTERNAL**
(module-private, reached only through an already-exported entry point) — `validateExtends`
+ its sub-validators live in `manifest.js` (reached via `validateManifest`); the
override-aware normalize helper lives in `resolve.js` (reached via `resolvePipeline`); the
registered-ref-set builder lives in `pipeline-resolve-main.js` (a bin, never exported); the
descriptor-set lookup change lives in `contract-assemble-main.js` (a bin). **No part adds a
barrel export and no part edits `engine/src/index.js`.** Each part's Context re-states this
for the symbol it introduces.

**`EXPECTED_TESTS` counter** (`scripts/ci.sh:10`, currently **528**): the phase-boundary gate
(`bash scripts/ci.sh`) asserts the EXACT `node --test` count via
`awk '/^# tests / {print $3}'` against `EXPECTED_TESTS`. EVERY part that adds `node --test`
cases MUST bump `EXPECTED_TESTS` by the number of cases it adds, **in the same commit**, or
`ci.sh` fails on count drift. Each part's TDD steps name the exact delta. (Confirmed live:
`cd engine && node --test 'test/**/*.test.js'` → `# tests 528`, `# pass 528`.)

**SC1 byte-identical invariant**: the no-manifest resolution record/output stays
byte-identical (anchored by the SC1 golden in `engine/test/scenarios.test.js`). Every new
branch this plan adds fires ONLY when `extends`/a non-`craft:` ref/the `--descriptor-json`
flag is present. A no-manifest run carries no `extends` → empty registered set → the new
branches are never consulted. No part may touch the default path. Each feature part asserts
SC1 stays green via its phase-boundary gate (which re-runs the SC1 golden).

**Inserts bypass descriptor normalization (verified in worktree).** `applyInserts`
(`engine/src/edits.js:101`) spreads the manifest phase block over field defaults
(`{ enabled:true, contract:[], consumes:[], produces:[], self_supply:[],
execution:DEFAULT_EXECUTION, ...phaseData }`) but does **NOT** call `normalizeEntry` /
`deepFreeze` (those run only in `parsePipeline`, `engine/src/descriptor.js:105-119`). A
resolved inserted/registered descriptor is therefore **unfrozen** and its `contract`/`consumes`/
`produces` are whatever YAML shape the author wrote — **not** coerced to string arrays.
Consequence: **`validateExtends` (Part 1) is the SOLE shape guard** for a registered phase —
it must do the type/array/vocab/archetype checks `normalizeEntry` would have done, because the
insert path won't. This makes Part 1 foundational, not polish, and is why Parts 2–6 may
trust an `extends` block's shape (lint ran first — design §"Validation ordering").

**House style for validators** (`engine/src/manifest.js`): errors **ACCUMULATE** into the
`errors[]` array — **no short-circuit**, no throw; `validateManifest` returns
`{ ok: errors.length === 0, errors }`. Sub-validators take `(value, …, errors)` and push.
Match this exactly — every `validateExtends*` sub-validator pushes onto the shared `errors`.

---

## Part 1 — `validateExtends` schema + `TOP_KEYS` entry

### Context

**Goal.** Add `'extends'` to the manifest's closed top-level key set and a
`validateExtends` validator (+ four sub-validators) that shape-checks the whole `extends`
block. INTERNAL only — reached through the already-exported `validateManifest`; no barrel
change (`engine/src/index.js` untouched).

**File to change:** `engine/src/manifest.js` (395 lines, fully read).
- `TOP_KEYS` (line 11-14): `Object.freeze(new Set([...]))` — add `'extends'`.
- `validateManifest` switch (line 364-390): add a `case 'extends': validateExtends(value, fileExists, errors); break;`. The loop already rejects any key not in `TOP_KEYS` (line 359-362), so without the `TOP_KEYS` add a manifest carrying `extends:` errors `unknown top-level key: extends` — Part-1 RED leverages exactly that.
- Existing sub-validator pattern to mirror: `validateBacklog` (line 165-200), `validateScripts` (line 146-154), `validatePhaseBlock` (line 293-324). All take `errors` and push; none throw.
- `checkFileRef(label, value, fileExists, errors)` (line 85-93) — reuse verbatim for the backlog-adapter `ref` existence check (it skips absent sentinels, iterates arrays, pushes `${label} references missing file: ${path}`).

**Vocabularies to consult (the closed sets the registered phase block draws from):**
- `VALID_ARCHETYPES` lives in `engine/src/descriptor.js:5-7` — `new Set(['setup','specification','construction','harness','refinement','delivery'])`. It is **module-private (not exported)**. The design (§"Files that change") says: "import from `descriptor.js` / `graph.js`, or factor a shared constant — DC governs duplication-vs-import." See **Decision-candidate DC-A** below — do NOT decide unilaterally.
- `BUNDLE_VOCAB` lives in `engine/src/graph.js:2-4` and IS exported (`export const BUNDLE_VOCAB = new Set([...])`) — import it for the `contract:` bundle check (`new Set(['core','producer','construction','harness-read','harness-exec','delivery','refinement'])`).

**The `extends` shape to validate** (design §"The `craft.extends:` manifest shape"):
```yaml
extends:
  phases:                       # list of registered descriptor objects
    - id: bench                 # string (may be namespaced "acme:bench")
      procedure: pluginB:bench  # non-empty string
      role: pluginB:bench-runner# string (optional)
      archetype: harness        # ∈ VALID_ARCHETYPES
      contract: [harness-exec]  # array of strings, each ∈ BUNDLE_VOCAB
      consumes: [change]        # array of strings
      produces: [bench-report]  # array of strings
      after: validation         # insert anchor (string, optional) — same vocab as pipeline.insert
      gate: "pluginB-bench --check"   # string (optional)
  agents:                       # array of namespaced ref strings
    - pluginB:bench-runner
  profiles:                     # map name → per-archetype { inline|agent } map
    audit: { setup: inline, specification: agent, construction: agent, harness: agent, refinement: agent, delivery: inline }
  backlog-adapters:             # array of { name, ref }
    - { name: acme-tracker, ref: .claude/workflow/acme-backlog.sh }
```

**Validator rules (per R2 + the four sub-blocks; errors accumulate):**
1. `validateExtends(extends, fileExists, errors)`: reject if `extends` is not a plain object (`typeof !== 'object' || null || Array.isArray`) → push `extends must be an object`. Iterate keys; reject any key not in `{phases, agents, profiles, backlog-adapters}` → push `unknown extends sub-key: ${k}`. Dispatch each present sub-block to its sub-validator.
2. `validateExtendsPhases(phases, errors)`: reject if not an array. For each phase block: `id` required non-empty string; `procedure` required non-empty string; `archetype` ∈ `VALID_ARCHETYPES` else push; `contract` must be an array and every element ∈ `BUNDLE_VOCAB` else push (R9 floor — **must run here, because `applyInserts` won't coerce a scalar `contract:` and `checkBundleVocab` would then iterate a string char-by-char**); `consumes`/`produces` if present must be arrays of strings; `role`/`gate`/`after`/`before` if present must be strings.
3. `validateExtendsAgents(agents, errors)`: reject if not an array; every element must be a non-empty string else push `extends.agents[i] must be a string`.
4. `validateExtendsProfiles(profiles, errors)` (DC-7/ADR-075 — full + typed): reject if not a plain object. For each named profile, the value must be a map carrying **all six** archetype keys (`setup,specification,construction,harness,refinement,delivery`), each value ∈ `{inline,agent}`. A missing archetype key OR a value outside `{inline,agent}` → push a loud error (e.g. `extends.profiles.${name}: missing archetype "${k}"` / `… value for "${k}" must be inline|agent`).
5. `validateExtendsBacklogAdapters(adapters, fileExists, errors)`: reject if not an array. For each: `{ name, ref }` both required; `name` non-empty string; `ref` non-empty string; `checkFileRef('extends.backlog-adapters[…].ref', ref, fileExists, errors)` for the existence miss (injected predicate — the test passes a `fileExists` stub).

**Test home:** `engine/test/manifest.test.js` (1345 lines). Add a new section after the
backlog section (the file's sections are `// ─── <name> ───` comment banners; the last is
`// ─── backlog source/shape validation ───` at line 1127). Mirror the existing test style:
`test('Given …, when validateManifest runs, then …', () => { … })`, `const sut = validateManifest; const result = sut(manifest, { fileExists });`. For the `fileExists` miss, pass `{ fileExists: () => false }`; for shape-only cases pass no opts (defaults to `() => true`).

### TDD steps

RED (add to `engine/test/manifest.test.js`, new `// ─── extends block validation ───` section):
- `valid full extends block → ok:true` — fails first with `unknown top-level key: extends` (TOP_KEYS not yet extended). Expected failure: `result.ok === false`, errors contains `unknown top-level key: extends`.
- `unknown extends sub-key (extends.bogus) → ok:false naming bogus`.
- `phase with out-of-vocab contract bundle (contract: [my-bespoke-floor]) → ok:false` (R9 floor).
- `phase with a scalar (non-array) contract → ok:false` (the normalization-bypass guard — assert it does NOT iterate a string).
- `phase with invalid archetype (archetype: bogus) → ok:false`.
- `phase missing id or procedure → ok:false`.
- `agents element that is non-string → ok:false`.
- `profile missing an archetype key → ok:false` (DC-7); `profile value outside {inline,agent} → ok:false`.
- `backlog-adapter missing ref → ok:false`; `backlog-adapter ref that fileExists() rejects → ok:false references-missing-file` (pass `{ fileExists: () => false }`).
- `errors accumulate` — a block with two distinct faults yields ≥2 errors (no short-circuit).

GREEN: add `'extends'` to `TOP_KEYS`; add the `case 'extends'`; implement `validateExtends`
+ the four sub-validators in `manifest.js`, mirroring `validateBacklog`/`validateScripts`
shape; resolve DC-A for the `VALID_ARCHETYPES` source before writing the archetype check.

REFACTOR: factor any duplicated "must be an array of strings" check into a small private
helper if it appears ≥3×; keep functions ≤20 lines (extract per-phase-field checks if the
phase validator grows past that).

EXPECTED_TESTS: bump `scripts/ci.sh:10` by the exact number of `test(...)` cases added in
this part (count them — one per RED bullet that lands as a distinct `test(...)`).

### Gate

`cd engine && node --test test/manifest.test.js` PLUS
`node engine/bin/manifest-lint.js engine/test/fixtures/manifests/good-role.md` (sanity that
manifest-lint still resolves an existing fixture). Run from repo root for the lint:
`cd /Users/scolladon/workspace/perso/craft-derived-plugin-extension`.

### Commit

`feat(manifest): validate extends registration block`

## Part 2 — `extends.phases` → override-aware insert path + S7 resolution

### Context

**Goal.** Fold `manifest.extends.phases` into the existing insert path so a registered phase
resolves into `effective[]`, carries its contract bundle + gate, and dispatches its
namespaced `procedure`. A registered id matching a DEFAULT id **replaces** that default
descriptor in place (full swap, no field inheritance — ADR-073); a registered id with no
default match **inserts** as today (ADR-070, single path). INTERNAL only — the new normalize
helper lives in `resolve.js`, reached via the already-exported `resolvePipeline`; the
`resolvePipeline` signature is unchanged (registrations arrive inside the existing `manifest`
arg). No barrel change.

**Files to change:**
- `engine/src/resolve.js` (264 lines, fully read). The seam:
  - `aliasResolve(manifest)` (line 20-38) returns a resolved manifest. `applyCliOverlay` (the bin) spreads `...manifest`, so `extends` survives into `resolvePipeline` and through `aliasResolve` (which spreads `...manifest`) untouched — **verified**.
  - `applyEnableEdits([...defaults], skipSet, phaseOverrides)` → `enableResult.descriptors` (line 193).
  - `applyInserts(enableResult.descriptors, resolved.pipeline?.insert ?? [])` (line 194) — the insert call the registered phases must reach.
  - **Recommended placement (see DC-B):** between line 193 and 194, normalize `resolved.extends?.phases ?? []` into the insert flow with the override-aware branch:
    - a registered phase whose `id` === a descriptor id already present in `enableResult.descriptors` → **replace that descriptor in place** (map over the list, swap the whole object) and do NOT add it to the insert list;
    - a registered phase whose `id` has no match → append it to the insert list passed to `applyInserts` (so it flows through `applyInserts` unchanged, preserving P7 insert behavior).
  - The registered phase object must be shaped like an `applyInserts` input: `applyInserts` (`edits.js:101-139`) destructures `{ after, before, ...phaseData }` and spreads `phaseData` over `{ enabled:true, contract:[], consumes:[], produces:[], self_supply:[], execution:DEFAULT_EXECUTION }`. A registered phase carries `id, procedure, role, archetype, contract, consumes, produces, after/before, gate` — all flow through `phaseData`. For a **replace**, build the descriptor with the same field-default spread so the replacing descriptor has every field a default descriptor has (`enabled`, `self_supply`, `execution` default in if absent) — **but inherit NOTHING from the replaced default** (R3a: full replace).
- `engine/src/edits.js` (194 lines, fully read) — `applyInserts` (line 101) and `applyEnableEdits` (line 51) are the touch points IF DC-B routes the override branch through `edits.js` instead of `resolve.js`. The existing P7 insert tests (search `applyInserts` in `engine/test/resolve.test.js`) MUST stay green either way — the new-id path must behave byte-identically to today.

**`checkUniqueIds` interaction** (`engine/src/graph.js:30-40`, invoked from `validatePipeline`
at `graph.js:119`, called from `resolve.js:230`): it runs AFTER insert/replace. Under
override, a same-id-as-default registration replaced the default in place → only one descriptor
carries that id → `checkUniqueIds` passes. Two genuinely-new registrations on the same NEW id
both reach `applyInserts` as appends → both present → `checkUniqueIds` pushes `Duplicate
descriptor id "${id}".` (`graph.js:35`). **Do not weaken `checkUniqueIds`** — the override
branch makes the same-id-as-default case present once; the new-id collision case is unchanged.

**S7 fixture upgrade** (`engine/test/fixtures/scenarios/S7/manifest.yml` — currently a
`pipeline.insert` of `acme:bench`, PARTIAL): rewrite it to use a full `extends:` block (phases
+ agents + profile + backlog-adapter), per design §"S7 end-to-end proof shape". The registered
phase keeps `id: acme:bench`, `procedure: acme:bench`, `role: acme:bench-runner`, `archetype:
harness`, `contract: [harness-exec]`, `after: validation`, `consumes: [change]`, `produces:
[acme-bench-report]`, `gate: acme-bench-runner --check`. Add `agents: [acme:bench-runner]` so
the role is registered (consumed by Part 3). Keep `consumes: [change]` resolvable: `change` is
produced by an earlier default phase (the implementation/construction descriptors produce it —
the current PARTIAL S7 already resolves green with this consume, so it is satisfied).

**S7 tests** (`engine/test/scenarios.test.js`, lines 435-465 — the two PARTIAL S7 tests + the
NOTE banner at lines 435-437). Helpers in this file: `loadDefault()` (line 33),
`loadScenarioManifest('S7')` (line 37 — `load(readFileSync(...))`), `FRAGMENTS` (line 46-54),
`REAL_FRAGMENTS` (line 58+). The existing two S7 tests assert `acme:bench` lands in `effective`
and `gateDecisions`. **Upgrade them from PARTIAL to full** and add override + full-replace
cases. Update the NOTE banner (lines 435-437) to drop "Partial coverage at P1 / land in a later
phase" wording.

**Override + full-replace tests** (design §"Test strategy" → "Unit — override-aware insert path"):
- same-id-as-default → full replace: the default's original descriptor is GONE from `effective[]` (its procedure/role/contract no longer at that id), the registered descriptor occupies that id at the right position, carrying its own contract bundle + role + gate.
- `checkUniqueIds` still fails two new registrations sharing a NEW id → `ok:false` `Duplicate descriptor id`.
- full replace does NOT inherit replaced-default fields: a same-id registration omitting a field the default had (e.g. `consumes:`) resolves with the registration's value (or the insert field-default), NOT the default's.
- override still runs under the core: a replaced phase's `contract:` is still drawn from `BUNDLE_VOCAB` and the assembled contract still prepends core (asserted fully in Part 4 via `contract-assemble`; here assert the descriptor's `contract` is its own and graph-valid).

### TDD steps

RED:
- Rewrite `S7/manifest.yml` to the `extends:` block (fixture change, not a test). The two existing S7 tests now read `manifest.extends.phases` via the resolver — they FAIL because `resolvePipeline` does not yet consult `extends.phases` (`acme:bench` absent from `effective`). Expected failure: `ids.includes('acme:bench')` is false.
- New test: registered phase (new id) lands in `effective[]` with its bundle + gate (full S7).
- New test: registered phase whose `id` === a default id (e.g. register `id: documentation` with a namespaced procedure/role) REPLACES the default — assert default's original procedure absent, registered one present at that id. Expected failure: replace branch absent → either duplicate-id `ok:false` or default unchanged.
- New test: two new-id registrations colliding on a new id → `ok:false` `Duplicate descriptor id`.
- New test: full replace omitting `consumes:` resolves with the registration's `consumes` (or insert default `[]`), not the default's.
- New test: registered consumer-before-producer (a registered phase consuming an artifact no earlier enabled phase produces) → `ok:false` (flows through `validatePipeline` identically — R3).

GREEN: add the override-aware normalize step in `resolve.js` (per DC-B placement) between
`applyEnableEdits` and `applyInserts`; route same-id-as-default → replace-in-place, new-id →
`applyInserts` append. Keep `resolvePipeline`'s return shape and signature unchanged.

REFACTOR: extract the normalize-and-branch into a small private helper
(`foldRegisteredPhases(descriptors, registeredPhases) → { descriptors, inserts }` or similar)
so `resolvePipeline`'s body stays linear and ≤ the existing length; keep the helper ≤20 lines.

EXPECTED_TESTS: bump `scripts/ci.sh:10` by the number of NET-NEW `test(...)` cases added (the
two rewritten S7 tests are not new; count only the added override/replace/strand cases).

### Gate

`cd engine && node --test test/scenarios.test.js test/resolve.test.js` PLUS
`node engine/bin/pipeline-resolve.js pipeline/default.yml` (from repo root — asserts the
default no-manifest path still resolves, SC1 sanity).

### Commit

`feat(resolve): fold extends.phases into override-aware insert path`

## Part 3 — `roleExists` registered set (external-ref fail-closed)

### Context

**Goal.** Rewire the bin's `roleExists` probe so a non-`craft:` (external) ref resolves
against a **registered-ref set** built from the parsed manifest's `extends` — a registered ref
passes, an unregistered one fails closed (`ok:false`, exit 2). Craft-native + traversal
behavior unchanged. INTERNAL only — the change is inside the bin
`pipeline-resolve-main.js`; nothing exported, no barrel change.

**File to change:** `engine/src/pipeline-resolve-main.js` (125 lines, fully read).
- The current probe (line 12-19): `const roleExists = ref => { if (!ref.startsWith(CRAFT_PREFIX)) return true; … existsSync(join(REPO_ROOT, 'agents', name + '.md')); }`. **Line 13 (`return true`) is the permissive external branch this part replaces.**
- `main()` (line 77-125) parses the manifest at line 96-104 (`manifest = parseManifestContent(readFileSync(manifestPath, 'utf8'))`), THEN `applyCliOverlay` (line 106), THEN `resolvePipeline(defaults, effectiveManifest, { roleExists })` (line 110). The registered set must be built from the **parsed manifest's `extends`** (pre-resolution) and the `roleExists` closure rebuilt to consult it — so `roleExists` is constructed inside `main()` (or a factory) after the manifest is parsed, NOT as the current module-level const. `roleExists` is injected INTO `resolvePipeline`, so it must not read from the Resolution it helps produce (design §"Validation ordering").

**DC-4 / ADR-072 — the registered set rule (option ii, ratified):** the registered set is
**`extends.agents` ∪ the `role:` of every registered/inserted phase**, including an overriding
phase's `role:`. Build it from the parsed manifest pre-resolution:
- start from `manifest.extends?.agents ?? []` (array of ref strings);
- union the `role` of every entry in `manifest.extends?.phases ?? []` that has a `role`;
- union the `role` of every entry in `manifest.pipeline?.insert ?? []` that has a `role` (an inserted phase's role registers it too — "registered/inserted phase" per DC-4).
- Represent as a `Set<string>`.

**The new external branch:**
```
external ref (not craft:) → registeredSet.has(ref) ? true : false   // fail closed
craft:<role>              → unchanged (separator guard + agents/<role>.md existsSync)
```

**Fixtures** (`engine/test/fixtures/manifests/` — directory listed; `external-role.md`,
`good-role.md`, `bad-role.md`, `traversal-role.md` read):
- `external-role.md` currently registers `role: acme:tdd-specialist` with NO `extends` block and prose stating "the bin stays permissive for non-craft: refs." Under this part that ref is now **unregistered** → the existing test (`pipeline-resolve-main.test.js:147-155`, expects exit 0) **flips** to expect exit 2 (fail-closed). Update both the fixture prose and the test, OR (cleaner) add two new fixtures and repurpose:
  - `registered-role.md`: an `extends.agents: [acme:bench-runner]` (or a registered phase carrying `role: acme:bench-runner`) plus `phases.implementation.role: acme:bench-runner` → the external ref IS registered → exit 0.
  - `unregistered-role.md`: `phases.implementation.role: acme:plannr` (a typo) with an `extends` block that does NOT register it → exit 2 naming the phase + ref.
- Keep `good-role.md` (craft:planner → exit 0), `bad-role.md` (craft:plannr typo → exit 2), `traversal-role.md` (separator guard → exit 2) tests green — craft-native behavior is unchanged by this part.

**Test home:** `engine/test/pipeline-resolve-main.test.js` (395 lines). The roleExists tests
are the `// ─── roleExists: … ───` sections at lines 119-169. The `external namespace stays
permissive` test (line 145-155) is the one that flips. Pattern: `const sut = main; const io =
makeCaptureIo(); const result = sut([pipelinePath, rolePath], io);` then assert on `result` and
`io.stderr.joined()`. `manifestsDir = join(__dir, 'fixtures', 'manifests')` (line 12).

**The resolver's role error message** comes from `resolve.js:237-239`
(`phases.${d.id}.role: "${d.role}" does not resolve to an installed agent`) — already names
the phase + ref, so the fail-closed exit-2 stderr (line 116-119 of the bin writes
`errors[]`) names them. The test asserts `/implementation/` and the ref appear in stderr,
mirroring the existing `bad-role` test (line 129-130).

### TDD steps

RED:
- New test: a manifest registering `acme:bench-runner` (via `extends.agents` or a registered phase role) AND using it as `phases.implementation.role` → exit 0. Fails first because the bin currently returns `true` for ALL external refs (so this would already pass) — to make it RED-meaningful, pair it with the fail-closed test below which is the real driver.
- New test (the driver): an UNREGISTERED external role (`acme:plannr`, no `extends` registration) → exit 2, stderr matches `/implementation/` and `/acme:plannr/`. Fails first: current bin returns `true` → exit 0. Expected failure: `result === 0` (want 2).
- Flip `external-role.md`'s test (line 147-155): its ref is now unregistered → expect exit 2 (update the fixture prose + the assertion).

GREEN: move `roleExists` construction into `main()` (after manifest parse), build the
registered `Set` from `extends.agents` ∪ registered/inserted phase roles, and change the
external branch from `return true` to `return registeredSet.has(ref)`.

REFACTOR: extract `buildRegisteredRefSet(manifest) → Set<string>` as a module-private helper
(≤20 lines); keep the `roleExists` closure small.

EXPECTED_TESTS: bump `scripts/ci.sh:10` by the count of NET-NEW `test(...)` cases (the flipped
`external-role` test is not new — count only the registered-pass + unregistered-fail additions).

### Gate

`cd engine && node --test test/pipeline-resolve-main.test.js` PLUS
`node engine/bin/pipeline-resolve.js pipeline/default.yml engine/test/fixtures/manifests/good-role.md`
(from repo root — craft-native role still resolves, regression sanity).

### Commit

`feat(resolve): roleExists fails closed on unregistered external refs`

## Part 4 — `contract-assemble --descriptor-json` (inserted/registered id EXECUTEs)

### Context

**Goal.** Teach `contract-assemble` to resolve an inserted/registered `descriptor-id` against
a **passed resolved-descriptor set** (DC-3/ADR-071: a new `--descriptor-json <path|->` flag)
so a registered/inserted phase EXECUTEs under the engine-owned contract. Absent the flag, the
default `pipeline/default.yml` path is **byte-unchanged**. INTERNAL only — the change is inside
the bin `contract-assemble-main.js`; nothing exported, no barrel change.

**File to change:** `engine/src/contract-assemble-main.js` (143 lines, fully read).
- `parseArgs(argv, io)` (line 23-61): currently parses `--descriptor-id`, `--manifest`, `--inline`, `--contracts-dir`. Add a `--descriptor-json` branch using the same `takeValue(i, flag)` helper (line 29-36). Note `takeValue` rejects a value `startsWith('--')` — the descriptor-json value is a path or `-` (stdin), neither starts with `--`, so it is accepted. Return field `descriptorJson` (path-or-`-`, or null).
- `main()` (line 83-143): currently `descriptors = parsePipeline(readFileSync(default.yml))` (line 96-97), then `descriptors.find(d => d.id === descriptorId)` (line 103), STOP "unknown descriptor-id" (line 104-110). New behavior:
  - if `--descriptor-json` present: read it (from the path, or stdin when `-`), `JSON.parse` it. Accept EITHER a single descriptor object OR an array (`effective[]`) — design DC-3(a) says "the single resolved descriptor (or the `effective[]` array)". Normalize to an array; search it for `descriptorId`. If found, use it; the default-yml parse is skipped (or used only as the fallback when the flag is absent).
  - if `--descriptor-json` absent: current path verbatim — parse `default.yml`, `find`, STOP if not found (byte-unchanged).
  - id present in NEITHER (flag set, id not in it, and not falling back) → still STOP "unknown descriptor-id" (the guard survives — design §"Test strategy").
- **Namespaced id edge** (design §"Edge — namespaced ids"): `--descriptor-id acme:bench` — the value is taken as-is by `takeValue` (a colon is not a flag char), so it is accepted and matched against the resolved set. No escaping needed (discrete argv argument). A test must cover a colon-bearing id.
- The matched descriptor flows into `assembleContract(descriptor, manifest, fragments, { execution: inline ? 'inline' : 'agent' })` (line 135) **unchanged** — so the registered phase's `contract:` bundles + the engine-owned core wrap it (R5/R9 for free; no contract-content change). `assembleContract` (`engine/src/contract.js:90`) prepends `expandCore` unconditionally (line 94) then each `descriptor.contract` bundle (line 96-101).

**Trust model:** the descriptor JSON is the Resolution the walk already parsed and lint-passed
(design §"Validation ordering"). The bin re-validates nothing — it trusts the passed
descriptor exactly as it trusts `--manifest context:` today (line 112-114 comment). But
`assembleContract` still throws `Unknown contract bundle` (`contract.js:97-99`) for a bundle
absent from `fragments` — caught at line 136-139 → exit 2. (A well-formed registered descriptor
draws only from `BUNDLE_VOCAB`, all of which are loaded by `loadFragments`, line 69-73.)

**Test home:** `engine/test/contract-assemble-main.test.js` (433 lines). Sections are `// ─── …
───` banners; `unknown descriptor-id → exit 2` is at line 118-128. Marker helpers: the test
imports core/bundle markers (see the file head + `engine/test-helpers/contract-markers.js`,
referenced by `scenarios.test.js:24` as `CORE_MARKERS, hasCI`). Existing assertion style:
`const sut = main; const io = makeCaptureIo(); sut(['--descriptor-id','design'], io)` then match
stdout for core markers. For the flag, write the descriptor JSON to a mktemp file (the file
already imports `mkdtemp`-style temp helpers — check the top; `pipeline-resolve-main.test.js`
uses `mkdtempSync`/`writeFileSync`/`rmSync` with an `after()` cleanup at lines 14-22 — mirror
that, or pass `-` and feed stdin if the bin reads stdin).

### TDD steps

RED:
- New test: `--descriptor-id bench --descriptor-json <tmp.json>` where the JSON carries a `bench` descriptor with `contract: [harness-exec]` → exit 0, stdout contains core markers + the `harness-exec` bundle markers (the EXECUTE proof). Fails first: `--descriptor-json` is an unknown flag (ignored by `parseArgs`), so `bench` is not in `default.yml` → exit 2 "unknown descriptor-id".
- New test: a namespaced `--descriptor-id acme:bench --descriptor-json <tmp.json>` → exit 0 (colon-id accepted + matched).
- New test: `--descriptor-id design` WITHOUT the flag → exit 0 with core + producer markers (byte-unchanged default path — regression guard).
- New test: `--descriptor-id ghost --descriptor-json <tmp.json>` where `ghost` is in NEITHER the JSON nor defaults → exit 2 "unknown descriptor-id" (guard survives).
- (Optional, folds the override EXECUTE proof) New test: a JSON descriptor whose `id` matches a default id but carries a registered `procedure`/`contract` → `--descriptor-id <that id> --descriptor-json …` emits core wrapping the registered contract — the re-homed-slot-still-under-floor proof (design §"S7 end-to-end proof shape" (e)).

GREEN: add the `--descriptor-json` parse branch + the resolved-set lookup in `main()`,
preserving the no-flag default path verbatim and the not-found STOP.

REFACTOR: extract `resolveDescriptor(descriptorId, descriptorJson, defaultDescriptors, io)`
as a module-private helper returning the matched descriptor or null; keep `main()` linear.

EXPECTED_TESTS: bump `scripts/ci.sh:10` by the count of NET-NEW `test(...)` cases added.

### Gate

`cd engine && node --test test/contract-assemble-main.test.js` PLUS
`node engine/bin/contract-assemble.js --descriptor-id design` (from repo root — default path
still emits a block, byte-unchanged sanity) PLUS
`node engine/bin/contracts-lint.js contracts` (the contract fragments still lint).

### Commit

`feat(contract): resolve descriptor-id against passed --descriptor-json set`

## Part 5 — `extends.profiles` registration (full + typed, selectable)

### Context

**Goal.** Make a registered `extends.profiles.<name>` selectable via `pipeline.profile`,
expanding to its per-archetype map (the harness-archetype `agent` floor still forced); an
unknown profile name still STOPs. INTERNAL only — `expandProfile` gains an awareness of
registered profiles passed in from `resolve.js`; nothing exported, no barrel change.
(`validateExtendsProfiles` already landed in Part 1 — this part wires the *expansion*.)

**Files to change:**
- `engine/src/profile.js` (74 lines, fully read). `expandProfile(name)` (line 25-59) is a closed `switch` over `solo`/`lean`/`full`, throwing on `default` (line 54-57). It currently takes ONLY `name`. To consult registered profiles, it must accept the registered-profile map: `expandProfile(name, registeredProfiles)` — when `name` is not a built-in, look it up in `registeredProfiles` (the validated `extends.profiles` map); if present, return it (it is already a full+typed per-archetype map — DC-7); else throw the existing unknown-profile error (now listing built-ins; a registered name that isn't there still STOPs). `applyProfileToArchetype` (line 71-74) is unchanged — it already forces `harness → agent` (line 72) regardless of the map, so the harness floor holds for a registered profile for free.
- `engine/src/resolve.js` — the `expandProfile` call site is line 184:
  `profile = resolved.pipeline?.profile ? expandProfile(resolved.pipeline.profile) : null;` (inside a try/catch that returns `ok:false` with the thrown message on unknown). Change it to pass the registered profiles: `expandProfile(resolved.pipeline.profile, resolved.extends?.profiles ?? {})`. The signature of `resolvePipeline` is unchanged (registrations arrive in `manifest`).

**The harness floor** (design R7, `profile.js:72`): `applyProfileToArchetype` returns `'agent'`
for `HARNESS_ARCHETYPE` before consulting the map — so even a registered profile that sets
`harness: inline` is forced to `agent`. The Part-1 `validateExtendsProfiles` requires the
profile to DECLARE all six keys including `harness` (full+typed), but the runtime floor
re-forces `agent` regardless. Assert both: validation requires the key; resolution forces agent.

**Test homes:**
- `engine/test/scenarios.test.js` — the S7 fixture (upgraded in Part 2) already carries an `extends.profiles` block. Add a test selecting it via `pipeline.profile: <registered-name>` and asserting the per-archetype execution lands on `effective[]` (e.g. a `construction` phase resolves to the profile's value; a `harness` phase stays `agent`). Use `loadScenarioManifest('S7')` + set `pipeline.profile` (or add a dedicated fixture under `fixtures/manifests/`).
- `engine/test/resolve.test.js` — a focused unit: `resolvePipeline(defaults, { extends:{profiles:{audit:{…}}}, pipeline:{profile:'audit'} })` resolves a phase's execution per the registered map; an unknown profile name (`pipeline.profile: ghost`, not registered) → `ok:false` naming the unknown profile.

### TDD steps

RED:
- New test: a manifest with `extends.profiles.audit` (full+typed) + `pipeline.profile: audit` → `resolvePipeline` ok:true; a `construction`-archetype phase resolves to the `audit` map's `construction` value; a `harness`-archetype phase resolves to `agent` (floor). Fails first: `expandProfile('audit')` throws `Unknown profile "audit"` → `ok:false`.
- New test: `pipeline.profile: ghost` with NO registered `ghost` → `ok:false`, error mentions the unknown profile (the STOP survives for a truly unknown name).
- New test (harness floor): a registered profile setting `harness: inline` is still forced to `agent` at resolution.

GREEN: extend `expandProfile` to take + consult `registeredProfiles`; pass
`resolved.extends?.profiles ?? {}` at the `resolve.js:184` call site.

REFACTOR: keep `expandProfile` ≤20 lines — if the built-in switch + registered lookup grows,
extract the built-in map to a frozen constant and `return BUILTINS[name] ?? registered[name] ??
throw`. Keep the thrown message listing built-ins.

EXPECTED_TESTS: bump `scripts/ci.sh:10` by the count of NET-NEW `test(...)` cases added.

### Gate

`cd engine && node --test test/resolve.test.js test/scenarios.test.js` PLUS
`node engine/bin/pipeline-resolve.js pipeline/default.yml --profile lean` (from repo root —
a built-in profile still resolves, regression sanity).

### Commit

`feat(resolve): select registered extends.profiles via pipeline.profile`

## Part 6 — `extends.backlog-adapters` registration (selectable backlog source)

### Context

**Goal.** Make a registered `extends.backlog-adapters.<name>` selectable as
`backlog.source: <name>`, resolving to its `ref` script via the existing `custom`-style port;
a failure stays a blocker (SP6 contract unchanged). INTERNAL only — `backlogSourceOf` /
`buildManifestRecords` / `validateBacklog` learn registered adapter names; nothing exported, no
barrel change. (`validateExtendsBacklogAdapters` already validated the adapter *shape* in
Part 1 — this part wires the *selection*.)

**Files to change:**
- `engine/src/resolve.js`:
  - `backlogSourceOf(backlog)` (line 123-128) returns the source string or null. It is source-agnostic (returns whatever string `backlog.source` is) — so a `source: acme-tracker` already returns `'acme-tracker'`. The gap is `buildManifestRecords`.
  - `buildManifestRecords(manifest)` (line 137-162): branches on `source === 'file'` (line 142) and `source === 'custom'` (line 147), emitting a record line; any OTHER source emits NO record line. To surface a registered adapter, add a branch: when `source` matches a registered `extends.backlog-adapters[].name`, emit a record line naming the adapter + its `ref` (mirroring the `custom` line at 147-152). `buildManifestRecords` receives `resolved` (the alias-resolved manifest, which carries `extends`), so `resolved.extends?.backlog-adapters` is in scope.
- `engine/src/manifest.js` — `validateBacklog` (line 165-200): currently `BACKLOG_SOURCES` is `new Set(['file','custom'])` (line 55); a `source: acme-tracker` errors `unknown backlog source` (line 188). `validateBacklog` must accept a source that matches a registered `extends.backlog-adapters[].name`. Thread the registered adapter names into `validateBacklog` — `validateManifest` (line 386-388) calls `validateBacklog(value, fileExists, errors)`; the registered names come from the same `manifest.extends?.backlog-adapters`. Pass the adapter-name set as an extra arg, OR collect it once at the top of `validateManifest` and hand it to `validateBacklog`. Keep `file`/`custom` behavior unchanged; a `source` that is neither built-in NOR registered still errors.

**SP6 / `custom`-port contract** (design R8): a registered adapter resolves "via the existing
`custom`-style port" — i.e. the walk's backlog `resolve` runs `ref` with argv
`["resolve", id]` (design §run/SKILL.md step 2, lines 64-73). The resolver's job here is only
to (a) accept the source name in validation and (b) surface a `backlog:` record line naming the
adapter + ref so the walk knows to invoke it. The actual script invocation is the walk's, not
the engine's — this part does NOT add script execution (no I/O in the pure resolver).

**Test homes:**
- `engine/test/scenarios.test.js` — the S7 fixture (Part 2) carries an `extends.backlog-adapters` block. Add a test: a manifest with `extends.backlog-adapters: [{name: acme-tracker, ref: …}]` + `backlog: { source: acme-tracker, ref: … }` → `resolvePipeline` ok:true and `record[]` contains a line naming `acme-tracker` + its ref (mirror the S6 backlog test at `scenarios.test.js:421-433`, which asserts a `record.find(r => r.includes('file'))`).
- `engine/test/manifest.test.js` — in the backlog section (line 1127+): a manifest with `backlog.source: acme-tracker` AND a matching `extends.backlog-adapters` registration → `ok:true`; a `backlog.source: ghost-tracker` with NO matching registration → `ok:false unknown backlog source`.

### TDD steps

RED:
- New test (manifest): `backlog.source: acme-tracker` + `extends.backlog-adapters:[{name:acme-tracker,ref:…}]` → `validateManifest` ok:true. Fails first: `acme-tracker ∉ BACKLOG_SOURCES` → `unknown backlog source: acme-tracker`.
- New test (manifest): `backlog.source: ghost-tracker` with no registration → `ok:false` (the guard survives for an unregistered source).
- New test (resolve): a registered adapter selected as `backlog.source` → `record[]` names the adapter + ref. Fails first: `buildManifestRecords` emits no line for a non-file/non-custom source.

GREEN: thread the registered adapter-name set into `validateBacklog`; add the registered-source
record branch in `buildManifestRecords`.

REFACTOR: collect `extends.backlog-adapters` names once into a `Set` in both `validateManifest`
and `resolve.js` (a tiny shared helper `registeredBacklogNames(extends)` if it reads cleanly);
keep functions ≤20 lines.

EXPECTED_TESTS: bump `scripts/ci.sh:10` by the count of NET-NEW `test(...)` cases added.

### Gate

`cd engine && node --test test/manifest.test.js test/resolve.test.js test/scenarios.test.js`
PLUS `node engine/bin/manifest-lint.js engine/test/fixtures/scenarios/S6/manifest.yml`
(from repo root — the built-in `file` backlog fixture still lints, regression sanity).

### Commit

`feat(backlog): select registered extends.backlog-adapters as source`

## Part 7 — run/SKILL.md prose: inserted/registered id EXECUTEs + manual smoke note (docs-only)

### Context

**Goal.** Update the walk's prose so an inserted/registered id is described as EXECUTE-able
(rider #2 closed) and add the on-demand `--plugin-dir` manual-smoke note (ADR-074). **Docs-only,
standalone** — no `src/` delta, no `node --test` cases, so `EXPECTED_TESTS` is NOT touched. This
part exists because there is no engine part to fold prose into (the prose describes the
end-to-end surface Parts 1–6 land, and `skills/run/SKILL.md` is the walk's contract). **Out of
scope (documentation phase owns them, per the brief): `docs/GUIDE-customizing.md` Tier-2 #12/#11,
`examples/derived-plugin/`, `examples/README.md` row #12** — do NOT author those here.

**File to change:** `skills/run/SKILL.md` (300 lines).
- **The "rides with P14" deferral** (lines 108-113, read): the prose currently says
  "**Inserted-phase contract injection is not yet wired:** `contract-assemble` (step 3) keys on
  `pipeline/default.yml`, so a novel inserted `id` STOPs there with "unknown descriptor-id". …
  full inserted-phase *execution* … rides with the derived-plugin registration surface (P14)."
  Rewrite this to state that inserted/registered-phase contract execution now ships: the walk
  passes the resolved descriptor to `contract-assemble` via `--descriptor-json` (Part 4) so a
  novel/registered `id` EXECUTEs under the engine-owned contract. Drop "rides with P14."
- **Step 3 prose** (lines 122-131, the `contract-assemble` invocation block): note that for an
  inserted/registered phase the walk appends `--descriptor-json <resolved-descriptor>` (the
  descriptor it already holds from the step-1b Resolution `effective[]`), so the registered id
  resolves. Keep the existing default-phase invocation (no flag) intact.
- **The "external `my:`/`acme:` refs stay permissive pending P14 registration" line** (line 109,
  inside the swap-fidelity paragraph): update — external refs now fail closed unless registered
  via `extends` (Part 3). Drop "pending P14 registration."
- **The Walk error paths table** (lines 190-200, read): the table has no explicit inserted-id
  STOP row today (the inserted-id deferral is prose at 108-113, not a table row) — verify and,
  if a row implies "unknown descriptor-id" for an inserted id, update it to EXECUTE. The
  `procedure resolves to no installed skill` row stays (that STOP is about a missing *plugin*,
  not a missing descriptor — orthogonal to rider #2).
- **Manual-smoke note (ADR-074):** add a short on-demand `--plugin-dir` manual-smoke note
  alongside the existing manual checks. Find the existing inline-fidelity + model-class manual
  checks (search `SKILL.md` for "inline-fidelity"/"model-class"/manual smoke prose) and add a
  sibling note: a throwaway two-plugin fixture (mirroring SP2's `/tmp/craft-sp2`) driven by
  `claude -p --plugin-dir craft --plugin-dir pluginB`, asserting the registered phase dispatches
  + spawns — documented as on-demand, NOT CI-gated (design §"S7 end-to-end proof shape" → Optional).

**Constraints:** prose only; no provenance refs (no "P14"/ADR numbers in the shipped prose —
the brief forbids provenance refs in source/test; SKILL.md is shipped surface, so phrase the
update behaviorally, e.g. "inserted/registered phases execute under the engine contract", not
"P14 closed this"). Match the surrounding voice (terse, imperative).

### TDD steps

This is a docs-only part — no RED/GREEN test cycle (no executable behavior changes; the
engine behavior it describes was test-driven in Parts 1–6). The "test" is the prose-lint /
markdown gate:
- REFACTOR-equivalent: edit the three prose regions + add the smoke note; re-read to confirm no dangling "rides with P14" / "stays permissive" / "not yet wired" deferrals remain (grep for them).
- No `EXPECTED_TESTS` change (no `node --test` cases added).

### Gate

`bash scripts/ci.sh` is the phase-boundary gate and will run once after this part; for the
part itself the relevant surface check is the bats suite that exercises shell/skill surfaces
plus a grep sanity that the stale deferrals are gone:
`bats test/manifest-lint.bats test/examples-lint.bats` (these pass unchanged — the part
touches no manifest/example) AND
`grep -n 'rides with P14\|stays permissive\|not yet wired' skills/run/SKILL.md` returns nothing
(run from repo root). No `node --test` for this part.

### Commit

`docs(skill): inserted/registered phases execute under the engine contract`

---

## Decision candidates

> Two genuinely-undecided, load-bearing implementation choices the ADRs/design left to the
> planner-or-implementer. Each carries a recommendation; the session decides — the planner does
> not. Both are wired into the relevant part's Context so the part is actionable on either
> outcome.

| # | Choice | Alternatives (≤3) | Recommendation |
|---|---|---|---|
| DC-A | Source of `VALID_ARCHETYPES` for the Part-1 phase-block archetype check. `VALID_ARCHETYPES` is module-private in `engine/src/descriptor.js:5-7` (not exported); `validateExtends` in `manifest.js` needs it. | (a) **export** `VALID_ARCHETYPES` from `descriptor.js` and import it in `manifest.js` (single source of truth) · (b) factor the set into a small new shared module both import · (c) duplicate the literal set in `manifest.js` (DRY violation, drift risk) | **(a) export from `descriptor.js`.** It is a closed engine vocabulary already living next to `normalizeEntry`; exporting a constant (not a function) does not widen the *public 7-export surface* (that's `index.js`'s barrel — `descriptor.js`'s `VALID_EXECUTIONS`/`DEFAULT_EXECUTION` are already cross-imported by `resolve.js` the same way, see `resolve.js:13`). Lowest drift, mirrors the existing `BUNDLE_VOCAB` export from `graph.js`. (c) is rejected on sight — two copies of a floor vocabulary will drift. |
| DC-B | Where the override-aware replace branch (Part 2) physically lives. The design (R3, §"Files that change", §"Override-aware insert", and the edits.js note) names BOTH `resolve.js`'s normalize step AND `applyInserts` as candidate homes and explicitly defers the placement to the planner. | (a) **in `resolve.js`** — the normalize step between `applyEnableEdits` and `applyInserts` does the replace-in-place; only genuine new-ids reach `applyInserts` (which stays byte-unchanged) · (b) **inside `applyInserts`** (`edits.js`) — teach it to detect a same-id descriptor and replace rather than append · (c) a second `normalizeEntry`-routing of `extends.phases` so registered descriptors are normalized+frozen like defaults (the design's flagged "secondary option") | **(a) in `resolve.js`.** Keeps `applyInserts` (the P7-tested insert primitive, `edits.js:101`) byte-unchanged — its existing tests in `resolve.test.js` carry zero risk of regression, satisfying the brief's "override branch keeps P7 insert tests green." The replace is a list `map`-and-swap against `enableResult.descriptors`, naturally expressed in `resolve.js` where that list already lives. (b) couples replace semantics into the shared insert primitive (broader blast radius). (c) is a behavior change to the shared insert path that risks regressing P7 inserts (the design itself flags it "must not regress" and keeps it a candidate, not a given) — defer unless a later part needs frozen registered descriptors. |

---

## Self-review (3 passes — recorded)

- **Pass 1 (dependency order):** Part 1 (`validateExtends`) lands before any consumer; Part 2
  consumes a validated `extends.phases`; Part 3 a validated `extends.agents`; Part 5 a
  validated `extends.profiles` (validator in Part 1, expansion here); Part 6 a validated
  `extends.backlog-adapters` (validator in Part 1, selection here). Part 4 depends on Part 2
  only for its S7 fixture data, not for code. Order is correct.
- **Pass 2 (test-folding + EXPECTED_TESTS):** every feature part (1–6) folds its tests into the
  same commit as its code and bumps `EXPECTED_TESTS` by its net-new case count; no standalone
  test-only feature part exists. Part 7 is docs-only (no `src/` delta, no `node --test`, no
  `EXPECTED_TESTS` bump) — a legitimate standalone per the sizing exception.
- **Pass 3 (invariants):** SC1 preservation stated in the shared substrate and re-checked by each
  feature part's phase-boundary gate (the SC1 golden); the override branch's placement (DC-B(a))
  keeps `applyInserts` and its P7 tests untouched; every new symbol is INTERNAL (no `index.js`
  edit in any part); each part's Context cites real files + line anchors verified against the
  read source. No contradiction found across parts.
