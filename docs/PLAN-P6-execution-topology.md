# Plan — P6: execution topology

> Source: design doc `docs/DESIGN-P6-execution-topology.md` · ADRs `020, 021, 022, 023`
> The plan is the implementation script AND the knowledge handoff. Slice agents start
> with zero context: whatever a slice block omits is paid later as agent rediscovery.
> `plan-lint.sh` enforces the schema below — the plan phase cannot close without it.

## Sizing rules

- Every slice costs a full agent lifecycle (spin-up, zero-context rebuild, gate) — it
  must earn it. No standalone test-only slices: coverage/interop/property tests fold
  into the implementation slice whose code they exercise.
- A slice that would be a pure test pass over already-landed code merges into its
  neighbour.

## Decision-candidates

None — fully pre-decided by ADRs 020–023.

## Constraints and risks

- `engine/src/index.js` exports exactly 7 symbols (`parsePipeline`, `validatePipeline`,
  `ALIAS_MAP`, `resolveAlias`, `resolvePipeline`, `assembleContract`, `normalizeFindings`,
  `validateManifest`). These plus `pipeline/default.yml` MUST stay untouched.
- `engine/src/contract.js` carve-out lines are frozen (P5).
- S1 + SC1 + `engine/test/contract-equivalence.test.js` must stay green at every commit.
- `scripts/ci.sh` must pass at every commit; never `--no-verify`.
- Each engine slice is TDD: RED test commit first, then GREEN implementation commit.

---

## Slice 1 — `lean` profile + per-archetype expansion

### Context

**Files to touch:**

- `engine/src/profile.js` — the only file that changes for ADR-021.
  - Current `HARNESS_ARCHETYPE = 'harness'` (line 13) stays exported unchanged.
  - `expandProfile(name)` currently returns `{ defaultExecution, harnessStaysAgent }`.
    New return: a plain per-archetype execution map keyed by archetype string — e.g.
    `{ setup: 'inline', specification: 'inline', construction: 'agent', harness: 'agent',
    refinement: 'agent', delivery: 'inline' }`. The `lean` map per ADR-021:
    setup→inline, specification→inline, construction→**agent**, refinement→**agent**,
    delivery→inline, harness→**agent** (unconditional invariant).
    `solo` map: all non-harness→inline, harness→agent.
    `full` map: all archetypes→agent.
    Error message must now read: `Unknown profile "${name}". Supported profiles: solo, full, lean.`
  - `applyProfileToArchetype(profile, archetype)` currently reads
    `profile.harnessStaysAgent` and `profile.defaultExecution`. New body: look up
    `archetype` in the per-archetype map; harness→agent is **unconditional** inside
    this function (applied after the map lookup, not via a flag). Signature stays the
    same: `(profile, archetype) → 'inline' | 'agent'`.

**Callers — no change required:**

- `engine/src/resolve.js`: calls `expandProfile` at line 161 and
  `applyProfileToArchetype(profile, descriptor.archetype)` at line 82. It never reads
  `.defaultExecution` or `.harnessStaysAgent` directly — confirmed by grep. No change
  to `resolve.js`. `buildExecutionReason` (line 90–97) checks
  `descriptor.archetype === HARNESS_ARCHETYPE` for the `harness-caveat` string — that
  stays correct because harness always maps to `agent`, so the caveat label still
  applies. The `profileName` string in the reason will be `lean`, `solo`, or `full` as
  before.

**Test files:**

- `engine/test/scenarios.test.js` — add `S-lean` and `S-full` test blocks at the end.
  Pattern: same structure as the existing `S1` block (lines 204–234). Import
  `HARNESS_ARCHETYPE` is already at line 23. `loadScenarioManifest` helper at line 35.
- `engine/test/fixtures/scenarios/S-lean/manifest.yml` — new file:
  `pipeline:\n  profile: lean`
- `engine/test/fixtures/scenarios/S-full/manifest.yml` — new file:
  `pipeline:\n  profile: full`

**S-lean assertions (per ADR-021 map):**

- `setup`, `specification`, `delivery` archetypes → `'inline'`
- `construction`, `refinement`, `harness` archetypes → `'agent'`
- All 11 effective phases present; `gateDecisions` populated for all.

**S-full assertions:**

- All effective phases → `'execution: agent'`
- Count matches SC1 (11 phases).

**Profile unit tests to add** (in `engine/test/resolve.test.js` or a new
`engine/test/profile.test.js`):

- `expandProfile('lean')` returns the correct per-archetype map (each of 6 archetype
  keys present with the right value).
- `expandProfile('typo')` now throws with message containing `solo, full, lean`.
- `applyProfileToArchetype(leanProfile, 'harness')` returns `'agent'` (unconditional).
- `applyProfileToArchetype(leanProfile, 'construction')` returns `'agent'`.
- `applyProfileToArchetype(leanProfile, 'specification')` returns `'inline'`.
- Existing solo/full tests in `resolve.test.js` (lines 163–199) must stay green —
  byte-identical behaviour.

**Public-surface decision:** `expandProfile` and `applyProfileToArchetype` are NOT in
`engine/src/index.js`; they are internal. No barrel update needed. `HARNESS_ARCHETYPE`
is exported from `profile.js` directly and imported where needed (already done in
`resolve.js` line 12 and `scenarios.test.js` line 23).

### TDD steps

**RED — write failing tests first, then commit RED:**

1. Add `engine/test/fixtures/scenarios/S-lean/manifest.yml` with `pipeline:\n  profile: lean`.
2. Add `engine/test/fixtures/scenarios/S-full/manifest.yml` with `pipeline:\n  profile: full`.
3. Add S-lean tests to `engine/test/scenarios.test.js`:
   - `S-lean Given profile:lean manifest, when resolvePipeline runs, then setup/specification/delivery phases are inline`
   - `S-lean Given profile:lean manifest, when resolvePipeline runs, then construction/refinement/harness phases are agent`
   - `S-lean Given profile:lean manifest, when resolvePipeline runs, then gateDecisions populated for all phases`
4. Add S-full tests to `engine/test/scenarios.test.js`:
   - `S-full Given profile:full manifest, when resolvePipeline runs, then all effective phases are agent`
   - `S-full Given profile:full manifest, when resolvePipeline runs, then effective phases count matches SC1 (11 phases)`
5. Add profile unit tests to `engine/test/profile.test.js` (new file):
   - `Given expandProfile('lean'), when called, then returns per-archetype map with setup inline`
   - `Given expandProfile('lean'), when called, then returns per-archetype map with construction agent`
   - `Given expandProfile('lean'), when called, then harness entry is agent`
   - `Given expandProfile('typo'), when called, then throws listing solo, full, lean`
   - `Given lean profile map, when applyProfileToArchetype called with harness, then returns agent unconditionally`
   - `Given lean profile map, when applyProfileToArchetype called with specification, then returns inline`
6. Run `node --test engine/test/` → FAIL on S-lean (unknown profile), S-full (full not yet characterised in scenario test), and profile unit tests. Expected failure: `Unknown profile "lean". Supported profiles: solo, full.`

**GREEN — implement:**

7. Rewrite `engine/src/profile.js`:
   - Replace the `{ defaultExecution, harnessStaysAgent }` return shape with a
     per-archetype map literal for each profile case.
   - Add `lean` case with its ADR-021 map.
   - Update error message to list `solo, full, lean`.
   - Rewrite `applyProfileToArchetype` to do `map[archetype]` lookup, then enforce
     harness→agent unconditionally (regardless of what the map says for `harness`).
8. Run `node --test engine/test/` → all tests pass including S1, SC1, S-lean, S-full,
   profile unit tests. Verify `resolve.test.js` solo tests still green.

**REFACTOR:**

9. Ensure `profile.js` JSDoc reflects the new map shape. No functional changes.
10. Run full CI gate.

### Gate

`scripts/ci.sh`

### Commit

`feat(engine): lean profile + per-archetype expansion (ADR-021)`

---

## Slice 2 — `applyCliOverlay` pure helper + bin `--profile`/`--skip` flags

### Context

**Files to create:**

- `engine/src/cli-overlay.js` — new internal module (NOT added to `engine/src/index.js`
  barrel — purely internal). Exports one function:
  ```
  applyCliOverlay(manifest, { profile, skip }) → mergedManifest
  ```
  Rules (ADR-022):
  - `profile` (string|undefined): if present, sets `manifest.pipeline.profile`,
    overriding whatever was there.
  - `skip` (string[]|undefined): if present and non-empty, **union-extends**
    `manifest.pipeline.skip` (not replaces — union semantics).
  - Empty/absent overlay → returns manifest unchanged (identity).
  - Immutable: returns a new object; never mutates the input.

**Files to modify:**

- `engine/bin/pipeline-resolve.js` — gains two optional flags: `--profile <name>` and
  `--skip <csv>`. Current argv: `positional[2]=pipelinePath`, `positional[3]=manifestPath`.
  New: flags may appear ANYWHERE in argv before/after positionals. Parse rule:
  collect all tokens; for each `--profile`, next token is the profile name; for each
  `--skip`, next token is comma-split into skip ids; remaining non-flag tokens fill
  positional slots in order (first = pipelinePath, second = manifestPath). After
  parsing, call `applyCliOverlay(manifest, { profile, skip })` to produce
  `effectiveManifest`, then pass to `resolvePipeline`. The import of `resolvePipeline`
  and all existing logic is **unchanged**; `resolvePipeline` itself is untouched.

**Test files:**

- `engine/test/cli-overlay.test.js` — new unit test file for the pure helper:
  - `Given empty overlay ({profile: undefined, skip: undefined}), when applyCliOverlay runs, then returns manifest unchanged`
  - `Given profile overlay, when applyCliOverlay runs, then pipeline.profile is overridden`
  - `Given profile overlay, when applyCliOverlay runs, then manifest without pipeline key gets pipeline added`
  - `Given skip overlay ["planning"], when applyCliOverlay runs, then skip unions with existing pipeline.skip`
  - `Given skip overlay, when pipeline.skip absent, when applyCliOverlay runs, then skip is set`
  - `Given both profile and skip overlays, when applyCliOverlay runs, then both are applied`
  - `Given applyCliOverlay, when called, then input manifest is not mutated`

- `engine/test/pipeline-resolve.bin.test.js` — new bin integration test file.
  Uses `child_process.spawnSync('node', [...])` to call the bin. Test cases:
  - `Given --profile lean flag, when bin runs, then non-harness non-construction non-refinement phases are inline`
  - `Given --skip planning flag, when bin runs with valid pipeline, then planning is absent from effective[]`
  - `Given --profile solo + manifest profile:full, when bin runs, then CLI wins (solo: non-harness inline)`
  - `Given --skip planning and manifest skip: [], when bin runs, then planning absent (union semantics)`
  - `Given flags before positional args, when bin runs, then pipeline path still resolved correctly`

**Public-surface decision:** `cli-overlay.js` is internal; not added to `index.js` barrel.
`pipeline-resolve.js` is a bin (not part of the 7-export module surface); its flag API
is additive. `pipeline/default.yml` untouched. `resolvePipeline` untouched.

### TDD steps

**RED:**

1. Create `engine/test/cli-overlay.test.js` with all helper unit tests listed above.
2. Create `engine/test/pipeline-resolve.bin.test.js` with bin integration tests.
   Use `join(__dir, '..', 'bin', 'pipeline-resolve.js')` as the bin path.
   Use `join(__dir, '..', '..', 'pipeline', 'default.yml')` as pipeline path.
3. Run `node --test engine/test/` → FAIL: `cli-overlay.js` does not exist; bin tests
   fail because `--profile`/`--skip` flags cause unrecognised-arg errors.

**GREEN:**

4. Create `engine/src/cli-overlay.js` with `applyCliOverlay` implementation.
   The function pattern:
   - Clone the manifest shallowly, clone `pipeline` sub-object shallowly.
   - Apply profile override (replace `pipeline.profile`).
   - Apply skip union (concat and deduplicate with existing `pipeline.skip`).
   - Return merged object.
5. Update `engine/bin/pipeline-resolve.js`:
   - Add flag-parsing loop over `process.argv.slice(2)`.
   - Collect `profileFlag` (string) and `skipFlag` (string[]).
   - Positional args (non-flag, non-flag-value tokens) fill pipelinePath then
     manifestPath.
   - After loading the manifest (if any), call `applyCliOverlay(manifest ?? {}, { profile: profileFlag, skip: skipFlag })` to get `effectiveManifest`.
   - Pass `effectiveManifest` to `resolvePipeline` instead of `manifest`.
6. Run `node --test engine/test/` → all tests pass.

**REFACTOR:**

7. Ensure `cli-overlay.js` is pure and has JSDoc.
8. Run full CI gate.

### Gate

`scripts/ci.sh`

### Commit

`feat(engine): applyCliOverlay helper + pipeline-resolve --profile/--skip flags (ADR-022)`

---

## Slice 3 — run/SKILL.md: inline dispatch + flag forwarding + brief remainder

### Context

**File to modify:** `skills/run/SKILL.md`

This is a PROSE-ONLY slice (judgment-fused, no engine code). No new unit tests.
Gate = `scripts/ci.sh` green (manifest-lint, bats, shellcheck, pipeline-resolve smoke).

**Current state of `skills/run/SKILL.md`:**

- Step 0 (line 18): runs `manifest-lint.sh`, reads manifest.
- Step 1b (line 24): runs `pipeline-resolve.js` with `[manifest-path]` only.
- Step 2 (line 52): classifies `$ARGUMENTS` as backlog id / file path / free-text brief.
- Step 3 (line 75): assembles injected block via `contract-assemble.js`.
- Step 4 (line 88): execute via resolved mode — lists archetype duties but has NO inline
  dispatch branch (the session just resolves execution mode and knows the archetype
  duties; `execution: inline` is mentioned at step 3 for the `--inline` flag but the
  actual in-thread execution is not described).

**Changes required (ADR-020 + ADR-022):**

**1. Step 0 — parse `$ARGUMENTS` flags before brief classification (ADR-022):**

Add a new sub-step (call it "0a") at the very start of step 0, BEFORE the manifest-lint
call. Prose must specify:

- Scan `$ARGUMENTS` for leading `--profile <name>` and `--skip <id,id,...>` tokens.
- Extract them as `flagProfile` (string or absent) and `flagSkip` (comma-split list or
  empty).
- The non-flag remainder is the `brief` — passed to step 2 unchanged. A flags-only
  `$ARGUMENTS` (e.g. `--profile lean`) leaves the remainder empty; step 2 treats an
  empty remainder as ambiguous and stops with a user prompt (existing behaviour).
- These parsed flag values are forwarded to `pipeline-resolve.js` in step 1b.

**2. Step 1b — forward flags to pipeline-resolve.js (ADR-022):**

Current call (line 24–31):
```
node "${CLAUDE_PLUGIN_ROOT}/engine/bin/pipeline-resolve.js" \
    "${CLAUDE_PLUGIN_ROOT}/pipeline/default.yml" [manifest-path]
```

New call appends the parsed flags:
```
node "${CLAUDE_PLUGIN_ROOT}/engine/bin/pipeline-resolve.js" \
    "${CLAUDE_PLUGIN_ROOT}/pipeline/default.yml" [manifest-path] \
    [--profile <flagProfile>] [--skip <comma-list>]
```
Flags are omitted when absent. Order: positional args first, then flags (the bin
accepts flags anywhere, but this order is conventional).

**3. Step 4 — inline dispatch branch (ADR-020):**

After the existing step 4 header and before the archetype-duties list, insert a clear
two-path dispatch specification:

**Agent path (existing, unchanged):**
- Spawn a Task with `subagent_type: craft:<role>` (or the manifest-swapped role).
- Prepend the injected contract block (from step 3) to the Task prompt, followed by
  working directory, task dynamics, and artifact paths.
- Await the commit; verify artifact on return.

**Inline path (new, ADR-020):**
- The injected block was assembled with `--inline` in step 3; the session treats it as
  the active governing constraint for this phase (reads it as policy, follows it
  throughout the phase body).
- If `descriptor.role` is present AND resolves to a local craft agent file
  (`agents/<agent-name>.md` where `<agent-name>` is the last segment of the role ref
  after stripping any `craft:` namespace): **load the agent body (sans YAML frontmatter)**
  and read it as self-directed craft. The session has: injected block (inline variant)
  + agent craft body — the same two artifacts a spawned agent carries, in the same order.
  Custom/external roles (e.g. `acme:my-planner`) with no local agent file run on the
  contract block alone.
- Run the phase body in-thread — the same procedure text the spawned agent would follow.
  No Task call. The session acts as both orchestrator and worker.
- Gate, record, and handoff are identical to the agent path.

**4. Step 6 — inline record entry (R10):**

After the existing record-outcome prose, add: for an inline-executed phase, append
`inline: <phase.id> — ran in-session` to the run record.

**5. Add the documented manual acceptance check (ADR-023 §4):**

Add a new subsection `### Manual acceptance check` at the end of the walk (before
`## Done`) that documents the one-off procedure for verifying inline fidelity:

> To verify that an inline-executed phase produces an equivalent artifact to its agent
> run: invoke craft with `--profile lean` on a real feature brief, confirm the
> inline phases commit their artifacts in the same shape as the agent path, and record
> the outcome in the run record under `inline-fidelity-check`. This is NOT CI-gated;
> run on demand and as a release smoke test.

### TDD steps

This is a prose-only slice. There is no RED/GREEN cycle in the TDD sense. Instead:

**Prose draft:**
1. Edit `skills/run/SKILL.md`:
   - Add "0a" sub-step above step 0's manifest-lint line, specifying flag parsing from
     `$ARGUMENTS`.
   - Update step 1b call to forward `[--profile <flagProfile>] [--skip <csv>]`.
   - In step 4, add the two-path dispatch block (agent path / inline path) before the
     archetype-duties list.
   - In step 6, add the inline record line rule.
   - Add `### Manual acceptance check` subsection before `## Done`.

**Self-review (convergence check):**
2. Read the updated SKILL.md and verify:
   - The flag-parsing prose is unambiguous (clear about remainder = brief, empty
     remainder = ambiguous STOP).
   - The inline path loads agent craft only for local `agents/<name>.md` files; external
     roles skip craft load.
   - The inline record line is distinct from the agent path record line.
   - The manual acceptance check procedure is actionable and mentions `--profile lean`.
   - No engine code or test is touched in this slice.

**Gate run:**
3. Run `scripts/ci.sh` — manifest-lint, bats, shellcheck, pipeline-resolve smoke must
   all pass. SKILL.md is prose; it has no direct CI gate beyond the orchestrator not
   breaking existing plumbing.

### Gate

`scripts/ci.sh`

### Commit

`feat(run): inline dispatch branch + flag forwarding + brief remainder (ADR-020/022)`

---

## Slice 4 — DX: DESIGN-customizable-engine.md + examples/lean-profile + ADR-023 check

### Context

**Files to modify/create:**

**1. `docs/DESIGN-customizable-engine.md`** — living architecture SoT. Three targeted
updates (do NOT rewrite or restructure; diff-minded edits only):

- **Profile vocab row** (around line 278): the sentence `profile: (e.g. solo, full)` →
  update to `profile: (e.g. solo, full, lean)`. The manifest-schema table row for
  `pipeline:` already says `profile: · skip: · insert:`; no table change needed.
  The inline prose paragraph that lists `solo` and `full` as examples must add `lean`.

- **Inline craft-loading path** (around lines 325–344, the assembly path block):
  The inline block currently says `the session loads the same engine contract block`
  but does not describe the role-craft load. After the inline bullet:
  > "**inline**: the same block is loaded into the session at phase entry; the session
  > follows it itself"
  Add a parenthetical: "(if the descriptor carries a `role:` that resolves to a local
  `agents/<name>.md`, the agent body is also loaded, sans frontmatter, right after the
  block — symmetric with the spawn path; ADR-020)."

- **Derivable-sugar note** (add near the profile paragraph): after mentioning `lean`,
  add a sentence noting that `lean` ≡ `execution: inline` at top level with
  `phases.{implementation,refactoring}.execution: agent` — it is derivable sugar.

- **Per-invocation args** (around lines 363–373, the walk description): the walk
  resolve step already mentions `expand profile:`; add a note that `pipeline-resolve.js`
  accepts `--profile`/`--skip` CLI flags that override manifest values at highest
  precedence (the brief remainder is the non-flag suffix of `$ARGUMENTS`).

**2. `examples/lean-profile/workflow.md`** — new file (no dir exists yet):

A showcase of `profile: lean` in a real manifest context. Structure matches
`examples/everything-claude-toolkit/workflow.md` (YAML frontmatter + explanation body).
Content:
- Frontmatter: `pipeline:\n  profile: lean`
- Body: explains which phases run inline vs agent under `lean`; shows the derivable
  equivalent (top-level `execution: inline` + per-phase agent overrides for
  `implementation` and `refactoring`); notes that `lean` is convenient shorthand for
  this two-line override pattern; shows `--profile lean` per-invocation usage.

**3. `examples/README.md`** — add a bullet for `lean-profile/` in the Examples list,
mirroring the existing entries.

**4. `docs/DESIGN-P6-execution-topology.md`** — add a `### Manual acceptance check`
section at the end (before the Out-of-scope table or at end of Test strategy section)
recording the ADR-023 §4 procedure verbatim: invoke craft with `--profile lean`, confirm
inline artifacts match agent shape, record in run record under `inline-fidelity-check`.
This is the documented procedure referenced in the SKILL.md acceptance check note.

**No new engine files. No changes to `engine/src/index.js`, `pipeline/default.yml`,
`scripts/ci.sh`, or any test file.**

### TDD steps

This is a docs-only slice. No RED/GREEN cycle.

**Prose draft:**
1. Edit `docs/DESIGN-customizable-engine.md` with the four targeted updates listed above.
2. Create `examples/lean-profile/workflow.md` with YAML frontmatter + explanation body.
3. Edit `examples/README.md` to add the `lean-profile/` bullet.
4. Edit `docs/DESIGN-P6-execution-topology.md` to append the manual acceptance check
   procedure at the end of the Test strategy section.

**Self-review (convergence check):**
5. Verify the DESIGN update does not introduce contradictions with the existing text
   (e.g. the profile list must now consistently say `solo | full | lean` everywhere it
   was previously `solo | full`).
6. Verify `examples/lean-profile/workflow.md` shows both the shorthand (`profile: lean`)
   and the derivable equivalent (the two-override form).
7. Verify the manual acceptance check procedure is concrete enough to run unambiguously.

**Gate run:**
8. `scripts/ci.sh` — no code changes; must remain green.

### Gate

`scripts/ci.sh`

### Commit

`docs(dx): lean-profile example + DESIGN profile vocab + manual acceptance check (ADR-021/023)`
