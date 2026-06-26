# Plan — De-specialize craft sources

> Source: design doc `docs/design/despecialize-craft-sources.md` · ADRs `148-155`
> The plan is the implementation script AND the knowledge handoff. Part agents start
> with zero context: whatever a part block omits is paid later as agent rediscovery.
> `plan-lint.sh` enforces the schema below — the plan phase cannot close without it.

## Sizing rules

- Every part costs a full agent lifecycle (spin-up, zero-context rebuild, gate) — it
  must earn it. No standalone test-only parts for FEATURE code: coverage/interop/property
  tests fold into the implementation part whose code they exercise. EXCEPTION:
  test-infra-only and docs-only parts (tooling config, test helpers, fixtures,
  harness/ADV/property suites, docs/prose) with no `src/` delta ARE standalone — they
  have no implementation part to fold into.
- A part that would be a pure test pass over already-landed code merges into its
  neighbour.

## Ordering invariants (read before executing — CI green at EVERY commit is a hard requirement)

Phase-boundary gate is `bash scripts/ci.sh`. It runs `engine` node:test AND asserts an
exact `EXPECTED_TESTS=1049` count, `adapters/pi` node:test with `EXPECTED_PI_TESTS=202`,
`bats test/`, `shellcheck scripts/*.sh hooks/*.sh`, `pipeline-lint`, `pipeline-resolve`,
`contracts-lint`. Three cross-cutting facts bind the ordering:

1. **Test-count drift gate.** Every part that adds or removes a `test(...)` case in
   `engine/test/**` MUST update `EXPECTED_TESTS` in `scripts/ci.sh` in the SAME commit,
   or the phase-boundary `ci.sh` fails on count drift. The part-gate (`node --test`) does
   NOT check the count — only `ci.sh` does — but since CI must be green at every commit,
   keep `EXPECTED_TESTS` exact at all times. State the delta in each engine part's Gate.
2. **`craft:` role existence is checked against `agents/<name>.md` on disk**
   (`engine/src/pipeline-resolve-main.js:39`). `ci.sh` runs
   `pipeline-resolve.js pipeline/default.yml`, which fails `roleExists` if `default.yml`
   names a `role: craft:<x>` with no `agents/<x>.md`. Therefore the triager-rename part
   (Part 5) must create `agents/harness-triager.md`, retarget `pipeline/default.yml`
   roles, AND update the golden descriptor + role-map tests in ONE atomic commit.
3. **The source-hygiene grep-gate fails on ANY un-allowlisted technique/VCS-host name in
   the scanned set.** It is added LAST among source-touching parts (Part 11), AFTER every
   removal it would otherwise trip on. Until then, the leaks are removed incrementally;
   the gate's allowlist (kept dogfood comments + Backlog-port `gh` + filesystem-sense
   `mutation`) is finalized only when the gate lands. Do NOT add the grep-gate early.

Part sequence and why it is safe at each commit:
P1 engine knob/plan → P2 memory rename → P3 alias removal → P4 harness-exec contract +
core.md → P5 triager merge (agent+roles+MODELS+golden, lockstep) → P6 validation/architecture
skills + review/reviewer advisory + run/init/propose/integrate prose → P7 lock rename
(script+spec+skill+bats) → P8 examples migration → P9 DOD/GUIDE/README + planner/template
prose → P10 craft dogfood consumer-config + memory-store migration → P11 source-hygiene
grep-gate (last). Each engine part (P1-P5) is red→green over its own `engine/test` cluster
and updates `EXPECTED_TESTS`. Prose/script parts (P4 prose half, P6-P11) keep the named
lints green.

---

## Part 1 — Engine: generic technique knob, emitted plan, shared executing-harness predicate

### Context

Implements design §1 + ADR-155. Three coupled engine edits + the `pipeline/default.yml`
consumer of the new knob + the scenario tests that assert the old `tool` shape.

**`engine/src/manifest.js`** (`validateHarness`, lines 350-393):
- ADD a `techniques` branch mirroring the `dimensions` branch (lines 360-365). Shape:
  ```js
  if (Object.hasOwn(harness, 'techniques')) {
    const t = harness.techniques;
    if (!Array.isArray(t)) {
      errors.push(`phases.${phaseName}.harness.techniques must be a list`);
    } else {
      t.forEach((tech, i) => validateTechnique(tech, phaseName, i, errors));
    }
  }
  ```
- ADD a module-private `validateTechnique(tech, phaseName, i, errors)` helper. Checks:
  `id` is a non-empty string (else `phases.${phaseName}.harness.techniques[${i}].id must be a non-empty string`);
  `mode` ∈ `{gate, triage}` if present; `run-style` ∈ `{background, sync}` if present;
  `scope` ∈ `{per-hunk, per-file}` if present; `probe`/`run`/`triage-procedure`/`commit-prefix`
  are strings if present. Unknown sub-keys pass (forward-compat). Add small frozen Sets
  `TECHNIQUE_MODES = {gate, triage}`, `TECHNIQUE_RUN_STYLES = {background, sync}`,
  `TECHNIQUE_SCOPES = {per-hunk, per-file}` near `CONVERGENCE_STRINGS` (line 56). Guard each
  technique element: non-object element → `phases.${phaseName}.harness.techniques[${i}] must be an object`.
  Apply the existing `RESERVED_HARNESS_KEYS` ban (lines 355-359 pattern) to technique objects too
  (prototype-pollution parity with the harness block).
- REMOVE the legacy `tool` check (lines 384-386) and the `incremental` check (lines 390-392).
  KEEP the `scope` string check (lines 387-389) — `scope` survives as the phase-level scope.
- Line 22 doc comment `Old names (branch, mutation, docs, …)` — leave the `mutation` token
  for now (alias removal is Part 3; that part neutralizes this comment).

**`engine/src/gates.js`** (lines 7, 23, 71-76): extract the module-private
`isExecutingHarness(descriptor)` predicate (lines 71-76) AND the
`EXECUTING_HARNESS_CONTRACT = 'harness-exec'` constant (line 23) into a NEW shared module
`engine/src/exec-harness.js` exporting both `EXECUTING_HARNESS_CONTRACT` and
`isExecutingHarness`. `gates.js` imports them (replacing its local copies); `HARNESS_ARCHETYPE`
is already imported from `./profile.js` — the shared module imports it the same way. Do NOT
change `gates.js` behaviour — pure extraction, no second copy (the gate floor `gates.test.js`
must stay green as a regression).

**`engine/src/resolve.js`** (lines 119-134, 297-303): mirror `deriveReviewPlan`. ADD
`deriveTechniquePlan(harness)` — a pure projection that maps `harness.techniques ?? []` to
`harness.techniquePlan`, each entry `{ id, probe?, run?, scope, mode, runStyle, triageProcedure?, commitPrefix }`
with defaults: `mode` → `'gate'`, `runStyle` (from `run-style`) → `'sync'`, `scope` inherits
`harness.scope` when the technique omits it, `commitPrefix` (from `commit-prefix`) → `'chore'`.
Omit optional `probe`/`run`/`triageProcedure` keys when absent (do not emit `undefined`).
Import `isExecutingHarness` from `./exec-harness.js`. Extend the `baseEffective` map (lines 297-303)
so a descriptor that `isExecutingHarness(d) && d.harness` gets
`{ ...d, harness: { ...d.harness, techniquePlan: deriveTechniquePlan(d.harness) } }`, keeping the
existing `REVIEW_PHASE_ID && d.harness` reviewPlan branch unchanged (review is harness-read, not
exec — the two branches never overlap). The `autoSkipEligible` map (line 304-307) wraps the
result unchanged.

**`pipeline/default.yml`** (validation descriptor lines 109-123, architecture lines 125-139):
change `validation.harness` from `{ tool: stryker, scope: per-hunk }` to
`{ scope: per-hunk, techniques: [] }`. Change `architecture.harness` from
`{ tool: dependency-cruiser }` to `{ techniques: [] }`. Do NOT touch the `role:` lines yet
(`craft:validation-triager` / `craft:architecture-triager` stay — Part 5 renames them; the
agent files still exist so `roleExists` stays green).

**Tests to flip (same part):**
- `engine/test/manifest.test.js`:
  - `:1153` (`harness: { tool: 42 }` → ok:false) and `:1165` (`incremental: "yes"` → ok:false)
    now assert `ok:true` (checks removed → unknown sub-keys pass). KEEP `:1177` (`rules` → ok:true).
  - ADD `techniques` cases (design §test-strategy): valid list of technique objects passes;
    non-array fails; technique missing `id` fails; bad `mode`/`run-style`/`scope` enum each fails;
    unknown technique sub-key passes; empty `techniques: []` valid; `techniques` absent valid;
    a `techniques: "notalist"` string now FAILS (the pinned fail-closed delta — it passes today).
    Place near the existing harness tests (`:1331` validation scope test is the anchor for a
    `phases.validation.harness.techniques` case).
- `engine/test/resolve.test.js`: ADD `deriveTechniquePlan` projection tests near the reviewPlan
  block (`:1090-1133`): defaults filled (`mode→gate`, `run-style→sync`, `scope` inherits phase
  scope, `commit-prefix→chore`); `techniquePlan` attached to executing-harness descriptors in
  `effective[]` (assert on `validation` resolved with a non-empty `techniques` manifest) and NOT
  attached to non-harness phases; review's `reviewPlan` attach unchanged (regression). Property
  lens: for a generated list of partial technique descriptors, every input technique appears once
  in the plan with all defaults resolved (pure-projection round-trip).
- `engine/test/scenarios.test.js`: `:1154` and `:1180` assert resolved `validation.harness.tool === 'stryker'`.
  Flip both to assert the new shape — `validation.harness.techniques` is `[]` (default) and
  `validation.harness.techniquePlan` is `[]`; the unrelated review-knob change still leaves
  validation's harness intact. (These are scenario tests but assert engine resolution of the
  edited `default.yml`, so they belong here.)
- `engine/test/gates.test.js`: regression only — the executing-harness floor / propose-await is
  unchanged by the predicate extraction. No new assertions required; confirm green.

**Tests that STAY GREEN (do NOT "fix" them) — opaque-passthrough confirmation:**
- `engine/test/cli-overlay.test.js:134-141` (`--harness validation.incremental=true`,
  `design.harness.tool=jest`) and `engine/test/pipeline-resolve-main.test.js:697` (`validation.harness.incremental`)
  exercise the `--harness` OVERLAY layer, which writes any knob verbatim; `validateHarness` now
  passes `tool`/`incremental` as unknown sub-keys, so these still pass — `tool`/`incremental` survive
  as opaque passthrough knobs. Removing the `validateHarness` checks does NOT touch the overlay.
- No test deep-equals the FULL resolved `validation.harness` object (only single fields: `.scope`,
  `.incremental`, `.reviewPlan` for review). Adding `techniquePlan: []` to the resolved validation
  descriptor therefore breaks no existing assertion. `edits.test.js` `{ tool: 'stryker', … }`
  fixtures test the override-MERGE path (`applyAllowedOverrides`), which never calls `validateHarness`
  — unaffected, and `engine/test/` is outside the Part 11 grep-gate scanned set so those fixtures stay.

`isExecutingHarness` has no existing dedicated test file; the extraction is covered transitively
by `gates.test.js` (floor) and the new `resolve.test.js` attach test. No new import cycle:
`exec-harness.js` imports only `./profile.js`; `gates.js` and `resolve.js` import `exec-harness.js`.

### TDD steps

- RED: add the `techniques`-valid and `techniques`-fail-closed cases to `manifest.test.js`
  (string-passes-today becomes now-fails) → fails (no `techniques` branch yet).
- RED: add `deriveTechniquePlan` projection + attach tests to `resolve.test.js` → fails
  (function absent, no attach).
- RED: flip `scenarios.test.js:1154/1180` to the new shape → fails (default.yml still `tool: stryker`).
- RED: flip `manifest.test.js:1153/1165` to ok:true → fails (legacy checks still present).
- GREEN: create `engine/src/exec-harness.js`; rewire `gates.js` imports; add `validateTechnique`
  + `techniques` branch and remove `tool`/`incremental` checks in `manifest.js`; add
  `deriveTechniquePlan` + the exec-harness attach in `resolve.js`; edit `pipeline/default.yml`
  `validation`/`architecture` harness blocks to `techniques: []`.
- REFACTOR: dedupe the three default-fill literals into named constants; ensure
  `deriveTechniquePlan` is a single small pure function with early returns, no nesting > 2.

### Gate

`cd engine && node --test 'test/**/*.test.js'` (touched: `manifest.test.js`, `resolve.test.js`,
`scenarios.test.js`, `gates.test.js`). Then update `EXPECTED_TESTS` in `scripts/ci.sh` by the
net test-case delta (added `techniques` + `deriveTechniquePlan` cases; flipped cases are net-zero).
Verify `bash scripts/ci.sh` green (count exact, `pipeline-resolve.js pipeline/default.yml` still
resolves, `pipeline-lint` clean).

### Commit

`feat(engine): generic harness techniques knob + emitted techniquePlan`

## Part 2 — Engine: rename `mutation-tool` memory concern → `validation-tool`

### Context

Implements design §4 + ADR-153 (the memory-concern half). Store-schema rename — old
`mutation-tool` entries decay on next load (acceptable; advisory store self-heals).

**`engine/src/memory.js`:**
- `CONCERNS` (line 50-56): `'mutation-tool'` → `'validation-tool'`.
- `KEY_FIELDS` (line 265-271): `'mutation-tool': ['tool']` → `'validation-tool': ['id']`
  (re-keyed on the technique `id` per ADR-153/ADR-149).
- `IMPROVES_BY` (line 300-313): `'mutation-tool': (o, n) => n.configFingerprint !== o.configFingerprint`
  → `'validation-tool': (o, n) => n.configFingerprint !== o.configFingerprint`.
- Doc comments (lines 296, 304): `mutation-tool` → `validation-tool`.
- Line 549 `mutant unreachable` is an `equivalent mutant` comment — KEEP verbatim (allowlisted).

**`docs/adapters/memory.md`** (prose, scanned set — fold here, grep-gate not live yet):
- Line 145: concern list `mutation-tool` → `validation-tool`.
- Line 151: the entry-schema row — `| mutation-tool | { tool, configFingerprint } | tool | …`
  → `| validation-tool | { id, configFingerprint } | id | …` (merge key now `id`; the prose
  example value updates `tool` → `id`).

**Tests to flip (same part):** `engine/test/memory.test.js` carries 32 `mutation-tool`
references. Rename ALL to `validation-tool` and the merge-key field `tool` → `id` where the
fixture payload carries it. Anchor sites: `:32-34` (fixture entry `concern/tool/configFingerprint`
→ `concern/id/configFingerprint`), `:70/78` (validators map keys), `:221-246` (the
validate-on-read drop test). The KEY_FIELDS change (`tool`→`id`) means any fixture whose
`mutation-tool` payload used `{ tool: 'stryker', … }` becomes `{ id: 'stryker', … }` (or whatever
technique id the fixture uses) so the merge-key derivation still matches.

`p22-memory.bats` asserts no `P22|ADR-[0-9]` tokens in `memory.js`/`memory.test.js` — the rename
introduces none; it stays green. No `EXPECTED_TESTS` change unless test cases are added (this is a
pure rename — net-zero count).

### TDD steps

- RED: rename `mutation-tool` → `validation-tool` and `tool` key → `id` in `memory.test.js`
  fixtures/assertions → fails (`CONCERNS`/`KEY_FIELDS`/`IMPROVES_BY` still use old name).
- GREEN: rename in `memory.js` (`CONCERNS`, `KEY_FIELDS` re-keyed on `id`, `IMPROVES_BY`, comments).
- REFACTOR: confirm key order in `CONCERNS` preserved (diffability of `serializeStore`); update
  `docs/adapters/memory.md` rows.

### Gate

`cd engine && node --test 'test/**/*.test.js'` (touched: `memory.test.js`). `EXPECTED_TESTS`
unchanged (pure rename). `bash scripts/ci.sh` green (bats `p22-memory.bats` green, manifest-lint
unaffected).

### Commit

`refactor(engine): rename mutation-tool memory concern to validation-tool`

## Part 3 — Engine: remove the `mutation` phase-alias; neutralize the alias-list source comment

### Context

Implements design §10 (alias half). The `mutation: 'validation'` entry is the lone
technique-name anomaly in `ALIAS_MAP`; every other member is a genuine old→new PHASE rename.
Pinned: removal is a clean break — `--skip mutation` becomes a silent no-op (unknown ids stay
in `effective`), canonical `--skip validation` unaffected.

**`engine/src/alias-map.js`** (lines 8-19): remove the `mutation:  'validation',` entry.

**`engine/src/manifest.js`** (line 22 doc comment): `Old names (branch, mutation, docs, …)`
→ drop the now-removed `mutation` example: `Old names (branch, docs, …)`. This both keeps the
comment truthful and removes a `mutation` token from the grep-gate scanned set.

NOTE: the `models.mutation-triager` deprecation hint (`manifest.js:114-117`) and the
`MODELS_KEYS` membership are NOT touched here — they retarget to `harness-triager` in Part 5
(lockstep with the agent file + golden). Leaving them as-is here keeps `manifest.test.js:777-786`
(asserts the hint mentions `validation-triager`) green at this commit.

**Tests to flip (same part):** `engine/test/alias-map.test.js:11` — the `['mutation', 'validation']`
row in the alias-table assertion. Replace it with an assertion that `resolveAlias('mutation')`
returns `'mutation'` unchanged (the clean-break: unknown id passes through). If the test iterates
a fixed expected-map, remove the `mutation` row from the expected map AND add a standalone
clean-break assertion. Check `engine/test/resolve.test.js` / `pipeline-resolve-main.test.js` for
any `--skip mutation` test that expects resolution to `validation` (grep `mutation` in those — none
found in the resolve-main golden, but re-verify and flip any that assert the old alias behaviour).

### TDD steps

- RED: change `alias-map.test.js:11` to assert `mutation` passes through unchanged → fails
  (alias still maps `mutation→validation`).
- GREEN: remove the `mutation:` entry from `ALIAS_MAP`; edit the `manifest.js:22` comment.
- REFACTOR: none beyond confirming `Object.freeze` map stays sorted by domain meaning.

### Gate

`cd engine && node --test 'test/**/*.test.js'` (touched: `alias-map.test.js`, plus any resolve
test that referenced the old alias). `EXPECTED_TESTS` delta: net-zero if the row is replaced
1-for-1; +1 if a standalone clean-break assertion is added — update accordingly. `bash scripts/ci.sh`
green.

### Commit

`refactor(engine): remove mutation phase-alias (clean break to silent no-op)`

## Part 4 — Contracts: technique-neutral `harness-exec` + `core.md` suppression list

### Context

Implements design §3 (contract half). `contracts/harness-exec.md` and `contracts/core.md:5` are
in the grep-gate scanned set; the contract-assemble tests assert the EXACT marker text, so the
contract rewrite and its tests are one atomic part.

**`contracts/harness-exec.md`** (current 3 lines) — rewrite technique-neutral per design §3:
> A tool runs; the AI triages findings: resolve each (the resolution the technique names) or prove
> it benign and document it inline — never simply accept a finding. Never weaken a test or rule to
> clear a finding. Gate-green before commit.

Remove "survivors or violations", "kill with a test", "kill a mutant", "clear a violation".

**`contracts/core.md`** (line 5): suppression list `coverage/mutation ignores` → `coverage ignores`
(drop the technique-named member; "lint-silencing comments of any flavour" already covers the rest).

**Tests to flip (same part):** the contract-assemble tests assert the assembled harness-exec
bundle's literal markers:
- `engine/test/contract-assemble.test.js:170` — `!includes('survivors or violations')` (producer
  bundle must NOT carry the harness marker). Replace `'survivors or violations'` with a stable
  substring of the NEW harness-exec text, e.g. `'triages findings'`.
- `:181` — `includes('survivors or violations')` (architecture/harness-exec bundle MUST carry it)
  → `includes('triages findings')`.
- `:182` — `includes('Never weaken a test to kill a mutant or clear a violation')` →
  `includes('Never weaken a test or rule to clear a finding')` (the new core sentence).
- `engine/test/contract-assemble-main.test.js:193` and `:204` — same two markers, same swap.
  Re-grep `survivors or violations` and `kill a mutant` across `engine/test/` and flip every
  assertion to the new substrings (these are exact-text bindings to the contract files).

Pick the replacement substrings ONCE and use them consistently; they must be verbatim substrings
of the rewritten `harness-exec.md` (contract-assemble concatenates the contract files raw).

### TDD steps

- RED: flip the contract-assemble marker assertions to the new substrings → fails (contract files
  still carry old text).
- GREEN: rewrite `contracts/harness-exec.md`; edit `contracts/core.md:5`.
- REFACTOR: confirm `contracts-lint` still passes (the contract is still non-empty and
  well-formed); confirm no producer-bundle leak assertion regressed.

### Gate

`cd engine && node --test 'test/**/*.test.js'` (touched: `contract-assemble.test.js`,
`contract-assemble-main.test.js`). `node engine/bin/contracts-lint.js contracts` clean.
`EXPECTED_TESTS` unchanged (assertions swapped, no case count change). `bash scripts/ci.sh` green.

### Commit

`refactor(contracts): technique-neutral harness-exec + core suppression list`

## Part 5 — Triager merge: one `harness-triager` replaces both technique triagers (lockstep)

### Context

Implements design §3 (agent) + §10 (MODELS) + ADR-148. THE tightest lockstep (ordering
invariant #2): the agent file, the `pipeline/default.yml` role refs, the `MODELS_KEYS` migration,
the deprecation-hint retarget, the golden descriptor, the role-map, and the init-emit fixture must
all land in ONE commit, or `ci.sh`'s `pipeline-resolve.js pipeline/default.yml` fails `roleExists`
(role names an agent file that does not exist).

**New `agents/harness-triager.md`** — the union abstraction of the two triagers, technique-neutral
per design §3. Frontmatter `name: harness-triager`, `model: <tier>`. MODEL-TIER NOTE: per
`docs/adapters/model.md:41` the spawn passes the PHASE DESCRIPTOR's tier as the Task `model` param
(`pipeline/default.yml` `validation.model: sonnet` line 115, `architecture.model: opus` line 132 —
both UNCHANGED by this part); the agent-def frontmatter `model:` pin is "the Claude binding of that
same tier" and is consulted only on the manifest→agent-pin→fallback fallback path. One agent file
now serves two phases of different descriptor tiers, so its single frontmatter pin is the FALLBACK
default, not an authority over either phase. The golden descriptor (`descriptor.test.js`) carries NO
`model:` field, so this choice does not flip a test — see the residual-decision note at the end of
this plan for the recommended frontmatter tier. Body:
*for each finding, verify it is real per the context block's triage procedure; if real, resolve it
(the resolution the technique's procedure names — a kill test, an edge fix, …) under the RED→GREEN
gate; only if provably benign, document the exception inline per the repo's convention with one line
of proof; never weaken a test or rule to clear a finding.* Carries: working dir, findings filtered
to the change's lines, reviewer-predicted advisory notes verbatim, the gate, the commit message,
global + phase `context:` files including the technique's `triage-procedure` ref verbatim. Final
message per finding: RESOLVED / EXCEPTION (proof line) / FALSE (triage evidence) / blocker. NO
technique vocabulary ("survivors", "mutants", "dependency-cruiser rule config") in the body — that
lives in the injected `triage-procedure` ref.

**Delete** `agents/validation-triager.md` and `agents/architecture-triager.md`.

**`pipeline/default.yml`:** `validation.role` (line 114) `craft:validation-triager` →
`craft:harness-triager`; `architecture.role` (line 131) `craft:architecture-triager` →
`craft:harness-triager`.

**`engine/src/manifest.js`:**
- `MODELS_KEYS` (lines 46-50): `'validation-triager'` → `'harness-triager'`.
- Deprecation hint (lines 114-117): currently rejects `mutation-triager` suggesting
  `validation-triager`. Retarget — the renamed-key path now suggests `harness-triager`. Per ADR-148
  the migration is `validation-triager` → `harness-triager`, so the hint message should name
  `harness-triager`. Decide the exact trigger key(s): keep the `mutation-triager` → `harness-triager`
  hint AND add a `validation-triager` → `harness-triager` hint (both old names point to the new one),
  OR retarget only the existing `mutation-triager` branch to suggest `harness-triager`. Recommended:
  make BOTH `mutation-triager` and `validation-triager` emit a "renamed — use 'harness-triager'"
  error (two branches, or one Set of deprecated names), so a consumer mid-migration on either old
  name gets a precise hint.

**Tests to flip (same part):**
- `engine/test/manifest.test.js`:
  - `:680-695` MODELS-membership pin: `'validation-triager': 'sonnet'` → `'harness-triager': 'sonnet'`.
  - `:766-786` the renamed-key tests: the `models.validation-triager` valid-key test → `harness-triager`
    valid; the `models.mutation-triager` rejection test now asserts the error contains `harness-triager`;
    ADD a `models.validation-triager` rejection test asserting the error contains `harness-triager`
    (the new deprecation branch). (`+1` test case.)
- `engine/test/descriptor.test.js`: golden `:246` `role: 'craft:validation-triager'` →
  `'craft:harness-triager'`; `:257` `role: 'craft:architecture-triager'` → `'craft:harness-triager'`.
- `engine/test/resolve.test.js`: role-map `:47` `validation: 'craft:validation-triager'` →
  `'craft:harness-triager'`.
- `engine/test/init-emit.test.js:356`: `'validation-triager': 'haiku'` → `'harness-triager': 'haiku'`
  (the init-emit MODELS fixture). Verify `engine/src/init-emit.js` does not itself hardcode the
  agent name (grep showed no triager literal there — the key comes from `MODELS_KEYS`/manifest input,
  so source needs no edit; only the test fixture's chosen key updates).

`agents/` is in the grep-gate scanned set; the new `harness-triager.md` must carry NO technique
name (verified by Part 11's gate). `pipeline-resolve.js pipeline/default.yml` now resolves both
harness roles to `agents/harness-triager.md` (exists) — `roleExists` green.

### TDD steps

- RED: flip the golden descriptor (`descriptor.test.js:246,257`), role-map (`resolve.test.js:47`),
  MODELS pin + renamed-key tests (`manifest.test.js:680,766-786`), init-emit fixture
  (`init-emit.test.js:356`) to `harness-triager` → fails (default.yml roles + MODELS_KEYS still old;
  agent file absent).
- GREEN: create `agents/harness-triager.md`; delete the two old agent files; retarget
  `pipeline/default.yml` roles; migrate `MODELS_KEYS`; retarget the deprecation hint(s).
- REFACTOR: if both old names share a deprecation message, express as one
  `DEPRECATED_AGENT_NAMES` Set → single hint branch (no duplicated string).

### Gate

`cd engine && node --test 'test/**/*.test.js'` (touched: `manifest.test.js`, `descriptor.test.js`,
`resolve.test.js`, `init-emit.test.js`). `node engine/bin/pipeline-resolve.js pipeline/default.yml`
exits 0 (roleExists green). `EXPECTED_TESTS` delta `+1` (the added `validation-triager` rejection
test) minus any net change — recount and set exactly. `bash scripts/ci.sh` green.

### Commit

`refactor(agents): merge technique triagers into one harness-triager`

## Part 6 — Skill + agent prose: technique-neutral validation/architecture body, advisory coupling, run/init/propose/integrate

### Context

Prose-only (no `src/` delta). Implements design §2, §5 (propose/integrate prose half), §6, §8,
and the `skills/run/SKILL.md` neutralization. All files are in the grep-gate scanned set; the gate
is not live yet (Part 11), so leaks removed here are checked there. Gate = the applicable lints
(`manifest-lint` for any embedded manifest, `examples`-lint unaffected, no engine test) + bats
(`p20-dod`, `examples-lint` unaffected). There is NO dedicated test for skill prose; correctness is
the design's word-level neutralization. KEEP every phase NAME (`validation`/`architecture`) — only
technique nouns change.

**`skills/validation/SKILL.md`** (design §2) — the largest rewrite:
- Preamble step 3 (lines 35-43): `mutation-tool` memory read → `validation-tool`; "mutation tool
  name + config fingerprint" → "the technique id + config fingerprint".
- Preamble step 4 (lines 44-50): replace the `tool`/`mutation tooling configured?` probe with the
  ADR-149 **discovery precedence**: resolve the active technique set by `declared` (`phase.harness.techniquePlan`
  — engine-emitted, binding, the way review reads `reviewPlan`) → `derived` (read the repo's
  README/CONTRIBUTING/craft config; one technique per documented validation command, GATE for
  pass/fail tools, TRIAGE for findings-judgment tools) → `fallback` (the existing gate-command
  capability probe as one GATE technique) → `no-op` (terminal). For each resolved technique run its
  `probe`; a failed probe is declined-by-absence (`NO-OP(validation:<technique-id>): declined — probe absent`).
  Empty active set after discovery+probe → existing clean no-op note, phase ends, propose-gate
  released by the orchestrator's recorded-no-op path. A manifest may never pre-empt the probe.
- DoD sub-concern (lines 16-34): the bracketed asserted-instead phrase
  `gates green, mutation triaged-or-no-op'd` → `gates green, harness techniques triaged-or-no-op'd`;
  "mutation testing clean" / "If mutation no-op'd" → technique-neutral ("harness techniques clean" /
  "If a technique no-op'd"); "this phase's mutation results" → "this phase's technique results".
- Gate-satisfaction note (lines 52-57): "the mutation run lands and triages green" → "every active
  technique's run lands and triages/gates green"; "lands no mutation run at all" → "lands no
  technique run at all".
- Procedure (lines 59-80): per-active-technique walk. Scope per technique `scope` (default phase
  scope). `run-style: background` → write `<root>/.craft-validation.lock ← <pid> <iso-timestamp>`,
  clear on landing (NOTE: lock NAME is renamed in Part 7; this skill is one of the three lockstep
  sites — write `.craft-validation.lock` here and let Part 7 land the script+spec together. If this
  part lands BEFORE Part 7, the skill prose names a lock the script does not yet write — acceptable
  for prose, but to avoid a transient mismatch, KEEP `.craft-validation.lock` here and ensure Part 7
  is the immediately-following commit. The lock name is prose in the skill; nothing executes it at
  this commit.) `mode: gate` → run/gate command decides pass/fail. `mode: triage` → spawn
  `craft:harness-triager` (was `craft:validation-triager`) with findings filtered to the change's
  lines, reviewer-predicted advisory notes verbatim, the gate, commit message
  `<commit-prefix>(validation): <technique-id> <scope>`, global + phase `context:` files including
  the technique's `triage-procedure` ref. Remove `test(mutation): <scope>` and "mutation-resistant
  kill test" vocabulary. Worktree-alive note (line 79-80): "mutation run" → "validation run".

**`skills/architecture/SKILL.md`** (design §2 tail) — generalize to a thin instance of the same
mechanism: discover-or-declare techniques (declared `techniquePlan` → derived boundary-check
conventions → no-op, default-off favours no-op); `run-style: sync` default (no lock); `mode: triage`.
Remove every `dependency-cruiser`/`depcruise` name and the `tool: dependency-cruiser` knob read.
Spawn `craft:harness-triager`. Commit `fix(architecture): <technique-id> <scope>` /
`chore(architecture): …` for exception-only.

**`skills/review/SKILL.md`** (lines 36-38) + **`agents/reviewer.md`** (lines 16-18) (design §6,
ADR-154): "suspected-equivalent mutants" → "suspected-benign harness findings"; "the mutation
triager's prompt" → "the executing-harness phase's triager prompt" (or "the harness-triager's
prompt"). "do NOT perform mutation analysis (a dedicated phase owns it)" → "do NOT run the
executing-harness techniques (a dedicated phase owns them)". Preserve the cross-phase channel.

**`agents/planner.md:20`** + **`templates/plan.md:14`** (design §7 tail): the sizing-example list
"mutation/ADV/property suites" → "harness/ADV/property suites". (NOTE: `templates/plan.md` is in the
scanned set — this very plan file is NOT, it lives at `docs/plan/`; the template is.)

**`skills/run/SKILL.md`** (design §7, 5 in-scope hits — neutralize prose, logic unchanged):
- `:128` auto-skip table: "no mutable code changed … the mutation no-op signal" → "… the technique
  no-op signal".
- `:306-308` the `validation` clarification: "the mutation note", "no mutation run lands", "a landed
  and triaged mutation run" → "the technique note", "no technique run lands", "a landed and triaged
  technique run".
- `:422` SC5 prose: "no-ops with a note when no mutation tooling configured" → "… when no techniques
  declared/probed".

**`skills/init/SKILL.md`** (design §8, 6 hits): replace the two named probes (`mutationTool` Stryker
config, lines 55-57; `archTool` dependency-cruiser config, line 58) with a single neutral
technique-config enumeration producing `harnessTechniques: string[]` (the enumerated candidate ids,
possibly empty) — same probe-and-enumerate style as `testCmd` (lines 44-45). `CapabilityReport` shape
(lines 78-79): drop `mutationTool`/`archTool`, add `harnessTechniques: string[]`. Harness interview
question (line 116): "Tune review or validation rigor? … skip if both mutationTool and archTool are
null" → "Declare validation/architecture techniques for this repo? … skip/note when
`harnessTechniques` is empty", with probe-grounded defaults. No technique name remains in the skill.
(`engine/src/init-emit.js`/`init-config.js` are unaffected — the `CapabilityReport` is a skill-prose
contract, not engine code; verified no triager/technique literal in those sources.)

### TDD steps

- RED: n/a for prose (no test asserts skill body text). Drive correctness by the design's
  word-level neutralization checklist above; the durable proof is Part 11's grep-gate.
- GREEN: apply every edit above; KEEP all phase names; rename every triager spawn to
  `craft:harness-triager`.
- REFACTOR: re-read each file for a residual technique noun (`stryker`, `mutation`, `mutant`,
  `dependency-cruiser`, `depcruise`) and any `gh` in propose/integrate (Part 6 does NOT touch
  propose/integrate `gh` — that is Part... see note). Self-grep the six files for the banned tokens.

NOTE on propose/integrate `gh`: design §5 routes `propose`/`integrate` through the VCS port verbs.
That is a separate concern from the technique neutralization in this part. To keep this part
coherent (skill/agent technique prose), the propose/integrate `gh` → port-verb edits are folded
here as well (both are SKILL prose with no test). **`skills/propose/SKILL.md`** (lines 23-31):
replace the two `gh pr create` references with "invoke the VCS port `propose(title, body)` (see
`docs/adapters/vcs.md`); the adapter owns the host CLI" — the drafted body unchanged.
**`skills/integrate/SKILL.md`** (lines 26-29): replace the `gh pr merge <#> --squash --delete-branch`
block with "invoke the VCS port `integrate(prUrl)`; `--squash`/`--delete-branch`/`merge-flags`
semantics live in the adapter binding"; line 37 "mutation run-lock" → "validation run-lock".

### Gate

No engine test changes (`EXPECTED_TESTS` unchanged). Run `bash scripts/ci.sh` and confirm green:
`bats test/` (no prose-asserting bats here except `p20-dod` which is Part 9; `examples-lint`
unaffected), `shellcheck` unaffected, `pipeline-lint`/`contracts-lint` unaffected. Self-grep the
edited files for banned technique/`gh` tokens (preview of Part 11).

### Commit

`docs(skills): technique-neutral harness skills, advisory coupling, port-routed delivery`

## Part 7 — Lock rename: `.craft-mutation.lock` → `.craft-validation.lock` (script + spec + bats lockstep)

### Context

Implements design §5 (lock) + ADR-153 (lock half). Spans `scripts/worktree-teardown.sh` +
`docs/adapters/vcs.md` + the `worktree.bats` assertions. The lock-protocol LOGIC is unchanged —
only the filename and its technique-named prose ("mutation run" → "validation run"). The skill
prose site (`skills/validation/SKILL.md`) already names `.craft-validation.lock` from Part 6;
this part lands the matching script + spec + bats so the three sites agree. Script part — gate is
the bats suite.

**`scripts/worktree-teardown.sh`:**
- `LOCK="$WT/.craft-mutation.lock"` → `LOCK="$WT/.craft-validation.lock"`.
- Header comment block + all "mutation run" / "mutation phase" strings → "validation run" /
  "validation phase". The output strings the bats assert on: `REFUSED — mutation run alive` →
  `REFUSED — validation run alive`; `FORCED past live mutation run` → `FORCED past live validation run`.
  (Keep the exact format the bats will assert; choose the new wording and mirror it in the bats.)

**`docs/adapters/vcs.md`** (port spec — must be agnostic):
- `teardown` verb pre/post (line 41): `.craft-mutation.lock` → `.craft-validation.lock`.
- Teardown lock protocol section (lines 48-58): "The mutation phase writes
  `<worktree-root>/.craft-mutation.lock`" → "The validation phase writes
  `<worktree-root>/.craft-validation.lock`"; "mutation run alive" → "validation run alive";
  "FORCED past live mutation run" → "FORCED past live validation run"; "the mutation phase/run" →
  "the validation phase / long-running harness run".
- Lines 76, 80-83 (`gh` in Claude + Pi bindings) STAY — that is where the vendor CLI is allowed.
- `propose`/`integrate` port-interface prose mentioning "validation/architecture triage gates"
  names PHASES, not techniques — KEEP.

**Tests to flip (same part):** `test/worktree.bats` — every `.craft-mutation.lock` path (lines 75,
83, 93, 98, 115, 151, 157) → `.craft-validation.lock`; every output assertion `mutation run alive`
(line 81) and `FORCED past live mutation run` (line 97) → the new "validation run alive" /
"FORCED past live validation run" wording chosen above. Keep the `-1` PID guard test and the
stale/live-PID tests structurally identical (only the lock filename + message strings change).

`shellcheck scripts/*.sh` must stay clean after the script edit. `docs/adapters/` and `scripts/`
are in the grep-gate scanned set — after this part no `mutation` token remains in
`worktree-teardown.sh` or `vcs.md` (the `detect-ecosystem.sh` filesystem-sense `mutation` is a
SEPARATE allowlisted site — do NOT touch it here).

### TDD steps

- RED: rename the lock path + flip the message assertions in `test/worktree.bats` →
  `bats test/worktree.bats` fails (script still writes/echoes `.craft-mutation.lock` / "mutation run").
- GREEN: rename `LOCK` + the comment/output strings in `worktree-teardown.sh`; update `vcs.md`.
- REFACTOR: confirm the live/stale/`-1`/forced branches all still pass; confirm `shellcheck` clean.

### Gate

`bats test/` (touched: `worktree.bats`). `shellcheck scripts/*.sh hooks/*.sh` clean. Then
`bash scripts/ci.sh` green (engine tests unaffected; `EXPECTED_TESTS` unchanged).

### Commit

`refactor(scripts): rename run-lock to .craft-validation.lock`

## Part 8 — Examples: migrate to the `techniques` knob shape (lint-green)

### Context

Implements design §10-examples + the `examples`-lint gate (ADR-063). `examples/*/workflow.md`
each carry YAML frontmatter that `manifest-lint` validates; `test/examples-lint.bats` asserts every
example lints clean. After Part 1 the engine no longer special-checks `harness.tool`; a
`harness: { tool: stryker }` block still PASSES (unknown sub-key, forward-compat) — but the
`review-harness/workflow.md` example presents `tool`/`scope`/`incremental` as the documented
validation shape, which is now wrong. Examples are CONSUMER config and MAY keep technique names —
but they must show the NEW knob shape. Gate = `bats test/examples-lint.bats` (+ `manifest-lint` per
example).

**`examples/review-harness/workflow.md`:**
- The frontmatter `phases.review.harness` block (lines 5-11) is the review knob — UNCHANGED (review
  uses `dimensions`).
- Prose line 32-33: "validation carries `tool`/`scope`/`incremental`" → "validation carries
  `techniques` (a list) and `scope`".
- The illustrative `validation` YAML block (lines 35-39):
  `harness: { tool: stryker, scope: per-hunk, incremental: true }` → migrate to a `techniques`
  block, e.g.
  ```yaml
  phases:
    validation:
      harness:
        scope: per-hunk
        techniques:
          - id: mutation
            run: "npx stryker run --mutate $SCOPE"
            mode: triage
            run-style: background
  ```
  (Examples MAY keep the `mutation`/`stryker` names — consumer config.) Confirm it `manifest-lint`s
  clean under the new `validateTechnique` (id present, mode/run-style/scope valid enums).

**`examples/architecture/workflow.md`:** per the design empirical pin ("after de-specialization the
example must DECLARE its technique"), the architecture example currently sets only `enabled: true`
and relied on `default.yml`'s `tool: dependency-cruiser` (now removed). Add a `harness.techniques`
declaration so the example still demonstrates a real architecture run:
```yaml
phases:
  architecture:
    enabled: true
    harness:
      techniques:
        - id: dependency-cruiser
          probe: "test -f .dependency-cruiser.json"
          run: "npx depcruise --config .dependency-cruiser.json $SCOPE"
          mode: triage
```
Update the prose table (lines 18-22) to reference the declared technique rather than the removed
default. (Consumer config MAY name `dependency-cruiser`.)

**`examples/.claude/workflow/mut.md`** (the `override-procedure` body): this is an `override:` PROSE
body (a procedure, not a manifest knob). It MAY keep `mutation`/technique names (consumer override
content). No structural change required for lint (it is not manifest YAML). Leave as-is UNLESS the
referencing `examples/override-procedure/workflow.md` needs a knob update — it only sets
`override: .claude/workflow/mut.md` (a file ref), which is unaffected by the knob change. Verify
`examples-lint` stays green for `override-procedure`.

### TDD steps

- RED: run `bats test/examples-lint.bats` after editing `review-harness`/`architecture` examples
  to the `techniques` shape — confirm each still lints (this part has no failing-first engine test;
  the bats gate is the proof the migrated manifests resolve). If a migrated technique block is
  malformed (e.g. bad `mode` enum), `manifest-lint` rejects it and the bats fails — that IS the red.
- GREEN: write valid `techniques` blocks so every `examples/*/workflow.md` lints clean.
- REFACTOR: keep example prose consistent with the new knob (no stale `tool`/`incremental` row).

### Gate

`bats test/examples-lint.bats` (every example lints, valid). Also
`node engine/bin/manifest-lint.js examples/review-harness/workflow.md` and
`… examples/architecture/workflow.md` exit 0. `bash scripts/ci.sh` green.

### Commit

`docs(examples): migrate harness examples to techniques knob`

## Part 9 — DOD / GUIDE / README / planner / template neutralization

### Context

Prose-only (design §7 + ADR-152). All in the grep-gate scanned set (`docs/DOD.md`,
`docs/GUIDE-customizing.md`, `README.md`, `templates/plan.md`, `agents/planner.md` — the last two
already handled in Part 6; this part owns DOD/GUIDE/README). `p20-dod.bats` has a test asserting
DOD.md "includes a mutation-testing line" — that test MUST flip in this part. Gate = bats
(`p20-dod`) + the named lints.

**`docs/DOD.md`** (design §7):
- REMOVE the `## Mutation testing` section (lines 19-29) entirely. Per the brief the technique-named
  section is removed; the durable bar ("all gates green / triaged-or-documented") is already covered
  by the `## Gates green` section in technique-neutral language. If a neutral "harness techniques
  triaged-or-documented" line is desired, add it to `## Gates green` without a technique name.
- `## Architecture boundaries` N/A note (lines 41-44): "no dependency-cruiser boundary check runs" →
  "the architecture boundary check did not run".

**`test/p20-dod.bats`** (same part — it asserts the removed section): the test
`"…then it includes a mutation-testing line"` (`grep -qi 'mutation' docs/DOD.md`) MUST be replaced.
DOD.md will carry no `mutation` token after this part. Replace that test with one asserting the
durable harness bar in technique-neutral terms, e.g. `grep -qiE 'gates green|triaged' docs/DOD.md`
(pick a phrase actually present in the rewritten `## Gates green` section). Keep the other three
DOD tests (exists / non-empty / checklist-line) unchanged.

**`docs/GUIDE-customizing.md`** (design §7, ADR-152):
- Lines 26-32: "validation (default: mutation testing)" / "architecture (default: dependency-cruiser)"
  → "validation and architecture are executing-harnesses; declare techniques per repo — see `examples/`".
  Line 26 "(a dependency/layering harness)" for architecture stays neutral (no `dependency-cruiser`).
- Line 39: default-off architecture "(dependency-cruiser)" name → drop the parenthetical.
- The `--harness` coercion table (lines 244-251): DROP the `tool`, `scope` row's `tool` member and
  the `incremental` row (per Part 1 those checks are gone). Specifically: remove the
  `| tool, scope | string | identity |` row's `tool` (keep `scope` as `| scope | string | identity |`),
  ADD a `| techniques | comma-or-object list | … |` row, and remove or neutralize the
  `| incremental | boolean | … |` row (it is no longer a validated knob — fold to the unknown-knob
  passthrough row). Keep `dimensions`, `passes`, `max_cycles`, `convergence` rows.
- Hexagon diagram VCS-axis (design §7): line 59 `git worktree + gh CLI` (VCS column) → "VCS host CLI";
  line 74 Adapter row `gh/git` → "VCS host CLI / git". The Backlog-axis label (line 58
  `file / gh / jira / linear / custom`) STAYS (Backlog port, out of scope).
- Probe-defaults prose (line 372): "mutation-config probe" → "technique-config probe".

**`README.md`** (design §7, ADR-152):
- Lines 20-22: drop "dependency-cruiser"/"mutation" from the harness descriptions →
  "executing-harnesses (techniques declared per repo)".
- Line 46: "scoped mutation run + triage" → "scoped harness run + triage".
- Line 52: "mutation-config probe" → "technique-config probe".
- Line 77: "mutation run-lock aware" → "validation run-lock aware".

### TDD steps

- RED: flip the `p20-dod.bats` mutation-line test to the neutral phrase → `bats test/p20-dod.bats`
  fails (DOD.md still has the `## Mutation testing` section / the neutral phrase not yet present).
- GREEN: rewrite `docs/DOD.md` (remove section, neutral N/A note), `docs/GUIDE-customizing.md`
  (prose + coercion table + hexagon VCS labels + probe prose), `README.md`.
- REFACTOR: self-grep the three docs for residual `mutation`/`dependency-cruiser`/`depcruise`/`stryker`
  and stray VCS-host `gh` (keep the Backlog-axis `gh` label on GUIDE line 58 only).

### Gate

`bats test/` (touched: `p20-dod.bats`). `EXPECTED_TESTS` unchanged (bats, not node:test). The bats
count is not pinned the way node:test is, but confirm `bats test/` green. `bash scripts/ci.sh` green.

### Commit

`docs: neutralize DOD/GUIDE/README of technique and VCS-host names`

## Part 10 — craft dogfood: consumer `.claude/workflow.md` declaring the mutation technique + memory-store migration

### Context

Implements design §9 + requirement 11. CONSUMER config, NOT plugin source. Today craft has no
`.claude/workflow.md` and no README/CONTRIBUTING-documented mutation command, so after
de-specialization the validation skill would find nothing to DERIVE and craft-on-craft mutation
coverage would silently no-op. Fix by the DECLARED tier (most robust, design §9): ship a committed
`.claude/workflow.md` declaring the `mutation` technique against craft's own Stryker tooling.

**`.gitignore`** (lines 12-16): `.claude/*` ignores everything; only `craft-memory.md` and
`craft-metrics.md` are re-included. ADD a re-include line `!.claude/workflow.md` (after line 14) so
the new consumer manifest is committable. (Verify with `git check-ignore -v .claude/workflow.md`
returning not-ignored after the edit.)

**New `.claude/workflow.md`** — craft's own consumer manifest. Frontmatter declares the validation
technique against craft's kept Stryker tooling (design §9 shape):
```yaml
phases:
  validation:
    harness:
      techniques:
        - id: mutation
          probe: "test -f engine/stryker.conf.json && npx --no-install stryker --version"
          run: "npm --prefix engine run mutation"
          mode: triage
          run-style: background
          triage-procedure: .claude/workflow/mutation-triage.md
          commit-prefix: test
```
Notes binding the exact values: the mutation script is `engine/package.json` `"mutation":
"cd .. && stryker run engine/stryker.conf.json"` — invoke via `npm --prefix engine run mutation`.
The Stryker config is `engine/stryker.conf.json` (kept dev tooling, out of scope). The
`triage-procedure` ref points at a craft-owned triage doc — either reuse the existing
`examples/.claude/workflow/mut.md` content or author a short `.claude/workflow/mutation-triage.md`
(if authored, it also needs a `.gitignore` re-include `!.claude/workflow/` + `!.claude/workflow/*.md`,
OR drop the `triage-procedure` key and let the generic triager run — RECOMMENDED: drop
`triage-procedure` to avoid a second gitignore dance; the generic `harness-triager` handles mutation
survivors with the repo's equivalent-mutant convention already documented in `engine/src` comments).
This manifest MUST `manifest-lint` clean (run `node engine/bin/manifest-lint.js .claude/workflow.md`).

**`.claude/craft-memory.md`** (design §4 + ADR-153 dogfood migration): the committed store carries a
`mutation-tool` frontmatter block (line 28-36) and a `## mutation-tool` body section (line 109).
After Part 2 renamed the CONCERN to `validation-tool` keyed on `id`, the store's old `mutation-tool`
entries are unrecognized and would decay. Migrate the committed block in lockstep: rename the
frontmatter key `mutation-tool:` → `validation-tool:`, change each entry's `concern: mutation-tool`
→ `concern: validation-tool` and `tool: stryker` → `id: stryker` (re-key on `id`); rename the
`## mutation-tool` body section heading → `## validation-tool` (the body is regenerated from
frontmatter on next save, but keep it consistent for diffability). This keeps craft's own advisory
store coherent under the new schema.

This part has no engine `src/` delta (consumer config + store data + gitignore). It is NOT plugin
source, so the grep-gate (Part 11) does NOT scan `.claude/` — `mutation`/`stryker` here are allowed
(consumer config, the design's allowed location).

### TDD steps

- RED: `node engine/bin/manifest-lint.js .claude/workflow.md` (after writing it) — if the technique
  block is malformed, lint exits 2 (the failing-first signal). `git check-ignore -v .claude/workflow.md`
  showing it IS ignored is the gitignore red.
- GREEN: add the `.gitignore` re-include; write `.claude/workflow.md` with a valid `techniques` block;
  migrate the `.claude/craft-memory.md` block to `validation-tool`/`id`.
- REFACTOR: confirm `manifest-lint` clean; confirm the store still parses (it is advisory — a
  malformed store self-heals to empty, but keep it valid).

### Gate

`node engine/bin/manifest-lint.js .claude/workflow.md` exits 0. `git check-ignore -v .claude/workflow.md`
returns not-ignored (committable). `bash scripts/ci.sh` green (the new manifest does not affect
`pipeline/default.yml` resolution; engine tests unaffected; `EXPECTED_TESTS` unchanged). Manual
on-demand (NOT CI-gated, per design): the craft-on-craft dogfood proof that `/craft:validation`
actually runs Stryker and does not silently no-op — note this as the requirement-11 runtime check,
not part of this commit's gate.

### Commit

`chore: declare craft's own validation technique + migrate memory store`

## Part 11 — Source-hygiene grep-gate (the durable proof of requirement 1, added LAST)

### Context

Implements design §test-strategy (source-hygiene gate) + requirement 1. This is the durable
enforcement of the despecialization principle: it must land AFTER every technique/VCS-host removal
(Parts 1-10), with a reviewed allowlist covering exactly the kept evidence. Adding it earlier would
fail on leaks not yet removed. Test-infra-only part (a bats test + no `src/` delta) — legitimately
standalone. Gate = `bats test/`.

**New `test/source-hygiene.bats`** (or a `scripts/source-hygiene.sh` invoked by ci.sh — choose bats
to match the existing source-assertion bats like `p22-memory.bats`). It asserts ZERO un-allowlisted
hits for two token classes across the SCANNED SET, with a precise allowlist:

Scanned set (design §test-strategy, verbatim): `pipeline/ skills/ agents/ contracts/ templates/
engine/src/ docs/adapters/ docs/DOD.md docs/GUIDE-customizing.md README.md`.

Token class A (technique names): `stryker|mutmut|cosmic-ray|cargo-mutants|mutation|mutant|dependency-cruiser|depcruise`.
Token class B (VCS-host CLI): the `gh`/`github` host CLI in the VCS-host concern.

Allowlist (each entry justified — the load-bearing boundary between "leak" (fail) and "kept evidence /
adapter recipe" (pass)):
- `equivalent mutant` / `EQUIVALENT-MUTANT` — the kept dogfood comments in `engine/src/**` (28 lines
  across `memory.js`, `init-emit-main.js`, `init-emit.js`, `pipeline-lint-main.js`, and others) and
  `adapters/pi` (pi is NOT in the scanned set, but the allowlist pattern is stated for clarity).
  Implement as: strip/ignore lines matching `equivalent mutant` (case-insensitive) before counting
  Class-A hits.
- filesystem-sense `mutation`/`Mutations` in `scripts/detect-ecosystem.sh` — NOTE `scripts/` is NOT
  in the scanned set, so this needs no allowlist entry for THIS gate's scope; state it only if the
  gate's scan is broadened. `docs/adapters/pi-poc-record.md` (filesystem-mutation sense, frozen) IS
  in `docs/adapters/` — allowlist it BY PATH (exclude `pi-poc-record.md` from the scan).
- `github-issues` in `engine/src/manifest.js:179` (`NON_BUILTIN_TRACKERS`) and `gh` in
  `docs/adapters/backlog.md` — the Backlog port adapter recipe (an allowed host-CLI location). Scope
  the Class-B `gh`/`github` ban to the VCS-host concern, NOT the Backlog tracker: allowlist
  `manifest.js:179` (or the `github-issues` token specifically) and `docs/adapters/backlog.md` BY PATH.
- `gh` in `docs/adapters/vcs.md` Claude/Pi BINDING sections (lines 76, 80-83) — the VCS port's
  adapter binding, the allowed location for the vendor CLI. Allowlist BY PATH+SECTION, or (simpler
  and robust) allowlist `docs/adapters/vcs.md` for Class-B entirely on the rationale that the only
  `gh` in that file is the binding — but then a NEW `gh` leak into vcs.md prose would pass. PREFERRED:
  allowlist the specific binding lines by matching `git` and `gh` only within the "Binding"/"binding"
  sections, OR accept a path-level allowlist for vcs.md Class-B and rely on review. Decide and state
  the chosen granularity in the bats comment.

Implementation shape (bats, mirroring `p22-memory.bats`'s `! grep -rE` posture): for each token class,
`grep -rEn` the pattern over the scanned set, pipe through `grep -vE` filters that drop the allowlisted
patterns/paths, and assert the residual count is zero (`[ "$count" -eq 0 ]`), printing the offending
lines on failure so a future leak is actionable. Build the scanned-path list explicitly (not a broad
`grep -r .`) so `engine/test/` (which legitimately keeps `stryker` fixtures) and `scripts/` and
`docs/` outside the named set are NEVER scanned.

**`scripts/ci.sh`** — the gate must itself be in CI. `ci.sh` already runs `bats test/`, which will
pick up the new `test/source-hygiene.bats` automatically. No `ci.sh` edit needed BEYOND confirming
the bats line runs the whole `test/` dir (it does: `bats test/`). If a standalone `scripts/source-hygiene.sh`
is chosen instead of bats, append it to the `ci.sh` final `&&` chain.

**Self-verification before commit:** run the new bats; it MUST pass GREEN at this commit because
Parts 1-10 removed every in-scope leak and the allowlist covers the kept evidence. If it fails,
the failing line names a missed leak (fix in the owning file, re-run) or a missing allowlist entry
(justify and add). Do NOT loosen the token patterns to pass — tighten the allowlist by path/pattern.

### TDD steps

- RED: write `test/source-hygiene.bats` with the full token patterns and a DELIBERATELY EMPTY
  allowlist first; run `bats test/source-hygiene.bats` → it fails, listing exactly the kept-evidence
  lines (equivalent-mutant comments, Backlog `gh`, vcs.md binding `gh`, pi-poc-record). This proves
  the gate detects real hits.
- GREEN: add each allowlist filter (by pattern for `equivalent mutant`; by path for
  `pi-poc-record.md`, `backlog.md`, `manifest.js:179`/`github-issues`, vcs.md binding) until the
  residual count is zero — every remaining suppression is a reviewed, justified keep.
- REFACTOR: factor the scanned-path list and the two token patterns into shell arrays/vars at the
  top of the bats file (one definition each, no magic-value repetition); add a comment per allowlist
  entry stating WHY it is kept (the reviewed boundary).

### Gate

`bats test/source-hygiene.bats` green (zero residual hits). `bats test/` green (whole suite picks up
the new file). `bash scripts/ci.sh` green end-to-end — this is the final phase-boundary proof that
every prior part's removals hold and CI enforces them going forward.

### Commit

`test: add source-hygiene grep-gate for technique and VCS-host names`

---

## Residual decisions (NOT decided here — surfaced for the implementer/operator; ≤3 alts each)

These are non-load-bearing forks the plan hit. Each has a recommendation; none changes the part
boundaries or the gate strategy. Decide in-part when the implementer reaches the named part.

1. **`harness-triager.md` frontmatter model tier (Part 5).** The merged agent serves `validation`
   (descriptor tier `sonnet`) and `architecture` (descriptor tier `opus`). The descriptor tier is
   what the spawn passes; the agent pin is the fallback-only binding.
   - (a) `model: sonnet` — matches the more frequently-run phase (validation; architecture is
     default-off). RECOMMENDED — the common-case fallback.
   - (b) `model: opus` — the higher-rigor tier, safest fallback for the architecture case.
   - (c) omit `model:` — let the engine fallback chain resolve. Rejected: every other `agents/*.md`
     carries an explicit pin (`reviewer/planner: opus`, others `sonnet`) — omission breaks the
     convention `model-class-shape.test.js`-adjacent expectations may assume.

2. **`triage-procedure` ref in craft's `.claude/workflow.md` (Part 10).** Whether to author a
   craft-owned `.claude/workflow/mutation-triage.md` (needs an extra `.gitignore` re-include for
   `.claude/workflow/`) or drop the key and use the generic triager.
   - (a) drop `triage-procedure` — the generic `harness-triager` triages mutation survivors using the
     repo's already-documented `// equivalent mutant (…)` convention in `engine/src`. RECOMMENDED —
     avoids a second gitignore re-include and a duplicated triage doc.
   - (b) author `.claude/workflow/mutation-triage.md` + re-include `!.claude/workflow/` /
     `!.claude/workflow/*.md` — most explicit, mirrors the `examples/.claude/workflow/` layout.
   - (c) point `triage-procedure` at the existing `examples/.claude/workflow/mut.md` — reuses the
     shipped sample; couples craft's consumer config to an `examples/` path (slightly odd but valid).

3. **Source-hygiene gate vehicle (Part 11): bats vs `scripts/source-hygiene.sh`.**
   - (a) `test/source-hygiene.bats` — auto-runs under the existing `bats test/` in `ci.sh`; matches
     the existing source-assertion bats (`p22-memory.bats`). RECOMMENDED.
   - (b) `scripts/source-hygiene.sh` appended to the `ci.sh` `&&` chain — shellcheck-covered, but
     adds a new ci.sh line and a new script to maintain.

4. **`docs/adapters/vcs.md` Class-B allowlist granularity (Part 11).** Whether to allowlist the
   `gh` in vcs.md by path (whole file exempt from the VCS-host ban) or by section (only the
   "Binding" sections). Recommendation: section-scoped if cheap to express in the grep filter,
   else path-scoped with a bats comment noting the reviewed boundary — the only `gh` in vcs.md
   today is the binding, so a path-level exemption is acceptable and review catches a future prose
   leak. Not load-bearing for the principle (vcs.md binding is an allowed host-CLI location).
