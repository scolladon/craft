# Plan — Rename the "slice" vocabulary to "part" (P24)

> Source: design doc `docs/DESIGN-P24-rename-slice-vocabulary.md` · ADRs `131, 132, 133, 134, 135`
> The plan is the implementation script AND the knowledge handoff. Slice agents start
> with zero context: whatever a slice block omits is paid later as agent rediscovery.
> `plan-lint.sh` enforces the schema below — the plan phase cannot close without it.

> **READ FIRST — this is a rename, not a feature; the technique inverts classic TDD.**
> The replacement term is **part** (ADR-131). The existing test suites ARE the spec:
> they already assert the OLD strings, so the instant a slice flips producer code the
> pinning tests go RED, and they go GREEN again when the SAME commit flips the test
> strings. Every slice is therefore ONE atomic commit that is **green by construction** —
> producer and every consumer of a token flip together (lockstep). Never a half-rename
> across a commit boundary.
>
> **Test counts are FROZEN.** `scripts/ci.sh` asserts `EXPECTED_TESTS=941` (engine) and
> `EXPECTED_PI_TESTS=202` (pi). A rename flips STRINGS inside existing tests; it adds/removes
> NONE. If a slice would move a count, it is mis-sliced. There are NO standalone test-only
> slices here — test edits travel inside the slice that renames the code they pin.
>
> **The rename is word/identifier-scoped and sense-aware — NEVER a blanket `s/slice/part/`.**
> Sense E is the hard carve-out: `Array.prototype.slice`, `string.slice`,
> `process.argv.slice`, the English verb. It is NEVER edited. Each preserved site is named
> in the slice that is adjacent to it.
>
> **Meta-document carve-out (hard OUT of S6/S7).** These files NAME the old term "slice" to
> describe the rename and must keep it — never sweep them:
> `docs/DESIGN-P24-rename-slice-vocabulary.md`, `docs/PLAN-P24-rename-slice-vocabulary.md`
> (this plan — and it structurally uses `## Slice N` headings because it was authored under
> the current lint schema, which S1 renames only for FUTURE plans), and
> `docs/adr/{131,132,133,134,135}-*.md`.

## Sizing rules

- Every slice costs a full agent lifecycle (spin-up, zero-context rebuild, gate) — it
  must earn it. No standalone test-only slices for FEATURE code: coverage/interop/property
  tests fold into the implementation slice whose code they exercise. EXCEPTION:
  test-infra-only and docs-only slices (tooling config, test helpers, fixtures,
  mutation/ADV/property suites, docs/prose) with no `src/` delta ARE standalone — they
  have no implementation slice to fold into.
- A slice that would be a pure test pass over already-landed code merges into its
  neighbour.
- **This plan's slices are sequential and share one working tree.** They are partitioned by
  *shape* (à la P8.5): each slice owns one token-sense or one mechanical cluster, lands
  green, and the next builds on it. Some files are touched by more than one slice (noted per
  slice); because slices are sequential this is safe — never edit a token a later slice owns.

## Slice 1 — lint ↔ template ↔ planner-schema (Cluster 1, sense A core)

### Context

This is the one slice that flips lint BEHAVIOR. The lint regex, the template heading, and the
planner agent's schema reference describe the *same* `## Slice N` schema from three sides; a
half-flip of any one breaks every future plan lint. They MUST co-land. **No `node`/`bats` test
exercises `plan-lint.sh`** (verified: the only references are orchestrator prose in
`skills/{planning,implementation}/SKILL.md`, and `scripts/ci.sh:32`'s `bats test/` never invokes
plan-lint). So this slice changes **no `node`/`bats` test count**; its proof is a mktemp probe +
`bash scripts/plan-lint.sh templates/plan.md` exit 0.

Exact edits (flip sense-A "Slice"/"slice" → "Part"/"part"; leave the verb/English uses intact):

- `scripts/plan-lint.sh`
  - L2 header comment: `validate a plan file against the slice schema` → `… against the part schema`.
  - L3 comment: `every slice MUST carry` → `every part MUST carry`; `so slice agents never` → `so part agents never`.
  - L15 `slices = 0` → `parts = 0` (awk var; rename consistently at L23/L27/L28/L29 below).
  - L20 message: `printf "plan-lint: slice \"%s\" missing: %s\n"` → `part \"%s\" missing`.
  - **L23 the heading regex** `/^## Slice/ { flush(); slice = $0; slices++; next }` →
    `/^## Part/ { flush(); part = $0; parts++; next }` (rename the `slice`/`slices` awk vars to
    `part`/`parts` everywhere they appear in the script — L16/L18/L20/L23/L27/L28/L29 — so the
    awk program is internally consistent).
  - L27 message: `no "## Slice" sections found — not a craft plan.` → `no "## Part" sections found — not a craft plan.`
  - L28 message: `%d slice(s) violate the schema.` → `%d part(s) violate the schema.`
  - L29 message: `%d slice(s) OK — every slice carries its context block.` → `%d part(s) OK — every part carries its context block.`
- `templates/plan.md`
  - **Headings L19 `## Slice 1` and L37 `## Slice 2` → `## Part 1` / `## Part 2`.**
  - Sizing-rules prose sense-A tokens: L4–L5 ("Slice agents", "a slice block"), L10–L16
    ("Every slice costs", "test-only slices for FEATURE code", "the implementation slice whose
    code they exercise", "docs-only slices", "no implementation slice to fold into", "A slice
    that would be a pure test pass") → "part(s)". L25 ("any pinned behaviour bytes the slice
    must reproduce") and L35 ("the exact conventional-commit message this slice lands as") → "part".
  - `### Gate` note L31: flip ONLY the sense-A words — `The slice gate command(s) for this slice
    (from the manifest's gates.slice …)` → `The part gate command(s) for this part (from the
    manifest's gates.slice …)`. **Leave the `gates.slice` literal on L31 as-is — it is sense-C
    and flips to `gates.part` in Slice 3** (this is the one cross-slice token on this line; do
    not touch it here).
- `agents/planner.md`
  - L3 description: `into a sliced TDD implementation plan whose every slice carries` →
    `into a TDD implementation plan partitioned into parts, each of which carries`.
  - L14 `Slice agents start` → `Part agents start`; L15 `whatever you omit they pay` (no token, leave).
  - **L17 schema ref** `(`## Slice N`, `### Context`, …)` → `(`## Part N`, `### Context`, …)`.
  - L18–L23 sizing prose: `no standalone test-only slices for FEATURE code (fold tests into the
    slice …)`, `docs-only slices`, `no implementation slice to fold into`, `a slice must earn its
    agent lifecycle`, `sequential slices share one working tree` → "part(s)".
  - L26/L28 ("in the slice that creates it", "pre-pays them in-slice", "in-slice") → "part".
  - L32 ("TDD steps per slice") and L34 ("the plan path + slice count") → "part".

Note the irony, do NOT resolve it: AFTER this slice, `agents/planner.md` instructs future planner
agents to emit `## Part N`, and `plan-lint.sh` accepts `## Part`. THIS plan file keeps its
`## Slice N` headings (meta-doc carve-out) and is linted once, now, under the old regex.

### TDD steps

- RED (mechanical, in a `mktemp` throwaway — NEVER the worktree): copy `templates/plan.md` to
  `$(mktemp -d)/p.md`, edit its headings to `## Slice 1`, run `bash scripts/plan-lint.sh
  $tmp/p.md` BEFORE editing the script → it still passes (old regex). This pins the
  pre-state. (Optional confidence check; the binding proof is GREEN below.)
- GREEN: apply all edits above (script regex+messages+comment, template headings+prose, planner
  schema+prose) in one change-set. Then in a fresh `mktemp -d`:
  - Write a minimal plan with `## Part 1` + the four `### Context/### TDD steps/### Gate/### Commit`
    sub-sections → `bash scripts/plan-lint.sh $tmp/part.md` exits 0 and prints `1 part(s) OK`.
  - Write a plan with `## Slice 1` + the four sub-sections → `bash scripts/plan-lint.sh
    $tmp/slice.md` exits 2 and prints `no "## Part" sections found`.
  - `bash scripts/plan-lint.sh templates/plan.md` exits 0 (the template now uses `## Part`).
- REFACTOR: confirm the awk var rename is internally consistent (no stray `slice`/`slices`
  identifier left in the awk body) via `grep -nE 'slice' scripts/plan-lint.sh` returning nothing.

### Gate

mktemp probe (above) proving accept-`## Part` / reject-`## Slice`; then
`bash scripts/plan-lint.sh templates/plan.md` (exit 0); `shellcheck scripts/plan-lint.sh`
(and `shellcheck scripts/*.sh` clean). No `node`/`bats` count change — none expected.

### Commit

`refactor: rename plan-decomposition unit slice→part in lint/template/planner schema (sense A core)`

## Slice 2 — agent identity full rename `slice-implementer` → `part-implementer` (Cluster 2, sense B)

### Context

ADR-132: FULL rename, **no alias**. The id is one value referenced from engine config, the golden
descriptor, runtime, docs, examples, and pinning tests — all flip in ONE commit so CI is green by
construction. `engine/src/alias-map.js` stays phase-id-only (it contains no agent key — do NOT add
one). The golden `Resolution` diff is confined to exactly the `role:` line.

Producer + config + golden + tests (engine and pi) — co-land:

- **git mv** `agents/slice-implementer.md` → `agents/part-implementer.md`, then in the moved file:
  - frontmatter L2 `name: slice-implementer` → `name: part-implementer`.
  - L3 description: `Executes exactly one plan slice` → `Executes exactly one plan part`;
    `Spawned by the craft implement phase` (no token, leave).
  - body L7 `You implement exactly ONE slice of a plan.` → `ONE part of a plan.`; L9 `the slice's
    pre-chewed context block` → `the part's …`; L10 `the slice gate command(s)` → `the part gate
    command(s)`. Sweep any remaining sense-A "slice" in the body to "part"
    (`grep -nE 'slice' agents/part-implementer.md` must return nothing after).
- `engine/src/manifest.js:48` `MODELS_KEYS` member `'slice-implementer'` → `'part-implementer'`
  (in the frozen Set L46–…; leave the other members untouched).
- `pipeline/default.yml:69` `role: craft:slice-implementer` → `role: craft:part-implementer`
  (this is the implementation phase descriptor; no other `role:` line changes).
- Pinning tests (strings flip inside existing tests — NONE added/removed):
  - `engine/test/descriptor.test.js:213` `role: 'craft:slice-implementer'` → `'craft:part-implementer'`.
  - `engine/test/scenarios.test.js:683` `'  role: craft:slice-implementer',` → `craft:part-implementer`.
    (Leave the header-comment sense-A prose at L4–L6 — that is Slice 4.)
  - `engine/test/resolve.test.js:44` `implementation: 'craft:slice-implementer',` →
    `'craft:part-implementer'`. (Leave L426 `.slice(0, benchIdx)` — sense E, KEEP.)
  - `engine/test/manifest.test.js:669` test TITLE `Given non-fallback models key
    (slice-implementer), …` → `(part-implementer)`; L673 `{ models: { 'slice-implementer':
    'haiku', …` → `'part-implementer'`. (Leave L252 `gates.slice` — Slice 3; leave L591 comment
    `slice-2 bats fixtures` — Slice 3.)
  - `adapters/pi/test/run.test.js:26` `role: 'craft:slice-implementer',` → `'craft:part-implementer'`.
- Docs/examples referencing the id:
  - `skills/implementation/SKILL.md:3` description `one slice-implementer agent each` →
    `one part-implementer agent each` (and L29 `one craft:slice-implementer per slice` →
    `one craft:part-implementer per part` — but the surrounding sense-A "slice" prose in this
    file is Slice 4; here flip ONLY the `slice-implementer`/`craft:slice-implementer` id tokens).
  - `README.md:65` `slice-implementer, refactor-executor, …` → `part-implementer, …`. (Leave
    L18/L23/L72 sense-A prose — Slice 4.)
  - `docs/adapters/execution.md:7` `(e.g. `craft:slice-implementer`)` → `craft:part-implementer`.
    (Leave L12 "slice text" — Slice 4.)
  - `examples/model-routing/workflow.md:30` `…`reviewer`, `slice-implementer`, …` → `part-implementer`.
  - `examples/role-swap/workflow.md:21` `| `craft:slice-implementer` | `acme:tdd-specialist` |` →
    `craft:part-implementer`.

Sense-E / leave-alone on adjacent lines (do NOT touch): `resolve.test.js:426`,
`manifest.test.js:252`/`:591`, `scenarios.test.js:4-6`.

### TDD steps

- RED: the existing golden/pinning tests above already assert `craft:slice-implementer` /
  `'slice-implementer'`. The instant `pipeline/default.yml:69` and `manifest.js:48` flip, those
  tests go RED (golden mismatch: descriptor resolves `craft:part-implementer`; `MODELS_KEYS` no
  longer contains `slice-implementer`). Expected failure lines: `descriptor.test.js`,
  `scenarios.test.js`, `resolve.test.js`, `manifest.test.js:669/673`, `run.test.js:26`.
- GREEN: flip the test strings in the SAME commit (and the agent file mv + docs/examples). Both
  trees go green; counts unchanged (941 / 202).
- REFACTOR: `node engine/bin/pipeline-resolve.js pipeline/default.yml` exits 0; verify the
  resolved Resolution contains "slice" in NO line (the only former occurrence, `role:`, now reads
  `craft:part-implementer`); confirm `engine/src/alias-map.js` is unchanged (no agent alias added).

### Gate

`cd engine && node --test 'test/**/*.test.js'` (green, `# tests` = 941) and
`cd adapters/pi && node --test 'test/**/*.test.js'` (green, `# tests` = 202);
`node engine/bin/pipeline-resolve.js pipeline/default.yml` exit 0 with the golden `Resolution`
diff confined to the `role:` line.

### Commit

`refactor: rename slice-implementer agent to part-implementer (full, no alias) across config, golden, tests, docs (sense B)`

## Slice 3 — `gates.slice` → `gates.part` manifest key (sense C, breaking schema rename)

### Context

ADR-133: rename the `slice` member of the cadence triad `{slice, phase, review-batch}` →
`{part, phase, review-batch}`. `gates.phase` and `gates.review-batch` are UNCHANGED. Breaking
manifest-schema change, accepted (no external manifest in this repo's surface declares
`gates.slice`). **No `<gates.slice>` placeholder exists in the live pipeline** (fact 2:
`pipeline/default.yml` resolves code phases to `<gates.phase>`), so descriptor substitution is
unaffected — this is a validation-schema + fixture + prose surface only.

Exact edits — producer, fixtures, pinning test, prose — co-land:

- `engine/src/manifest.js:37` `GATE_FIELDS = Object.freeze(new Set(['slice', 'phase',
  'review-batch']))` → `Set(['part', 'phase', 'review-batch'])`.
- Fixtures (the `gates:` block key):
  - `test/fixtures/manifest/valid-basic.workflow.md:6` `  slice: cargo test` → `  part: cargo test`.
  - `test/fixtures/manifest/valid-quoting.workflow.md:5` `  slice: "npm run build:check"` → `  part: …`.
  - `test/fixtures/manifest/invalid-malformed-yaml.workflow.md:2` `gates: { slice: [a, b` →
    `gates: { part: [a, b` (the malformed-YAML assertion is about the broken array, not the key
    name — renaming the key preserves the malformation and the test intent).
- `engine/test/manifest.test.js:252` `{ gates: { slice: 'npm test', phase: 'npm run ci',
  'review-batch': 'npm run review' } }` → `{ gates: { part: 'npm test', phase: …, 'review-batch':
  … } }`.
- `engine/test/manifest.test.js:591` test comment `review fixes: faithful-port coverage the
  slice-2 bats fixtures depend on` → `… the part-2 bats fixtures depend on` (sense-A unit
  reference in a comment; routed here so Slice 2 stays confined to the agent-id tokens and only
  one slice edits manifest.test.js prose beyond the id strings).
- Prose referencing the targeted gate (flip the `gates.slice` literal):
  - `skills/run/SKILL.md:280` `the TARGETED check (`gates.slice` over the …)` → `gates.part`.
    (Leave sense-E MemoryView "slice" verbs at L156/L158/L162/L289 — KEEP.)
  - `skills/review/SKILL.md:44` `each batch gates on the targeted checks (`gates.slice` over
    touched …)` → `gates.part`.
  - `examples/gate-command/workflow.md:4` `Three cadences: slice, phase, review-batch.` →
    `Three cadences: part, phase, review-batch.`; `:18` table row `| `slice` | after each TDD
    slice | …` → `| `part` | after each TDD part | …` (both the cadence-key word and the
    sense-A "after each TDD slice" phrase flip).
  - `templates/plan.md` `### Gate` note (L31): the `gates.slice` literal left by Slice 1 →
    `gates.part`. After this, L31 reads `… for this part (from the manifest's gates.part …)`.
  - `skills/planning/SKILL.md:26` `manifest `gates.slice`, or probe:` → `gates.part`;
    `skills/implementation/SKILL.md:10` `Probe gates: `gates.slice` (else: …` → `gates.part`.
    (Leave the surrounding sense-A prose in those two SKILLs — that is Slice 4; here flip ONLY
    the `gates.slice` literal.)

### TDD steps

- RED: `engine/test/manifest.test.js:252` constructs a manifest with `gates: { slice: … }` and
  asserts it validates OK. The moment `GATE_FIELDS` drops `'slice'`, that test goes RED
  (`slice` becomes an unknown gate field → validation error). Expected failure: the L252 test.
- GREEN: flip the L252 literal to `gates.part`, the three fixtures, the L591 comment, and the
  prose, in the same commit. `manifest.test.js` goes green; count unchanged (941).
- REFACTOR: `node engine/bin/manifest-lint.js test/fixtures/manifest/valid-basic.workflow.md`
  (or the project's manifest-lint entry) accepts `gates.part`; construct a throwaway manifest
  declaring `gates: { slice: … }` in a `mktemp` dir and confirm it now REJECTS (unknown gate
  field). Confirm `grep -nE 'gates\.slice|gates: \{ slice' engine/ test/fixtures/ skills/
  examples/ templates/` returns nothing.

### Gate

`cd engine && node --test 'test/**/*.test.js'` (green, `# tests` = 941); manifest-lint over the
fixtures accepts `gates.part` and a mktemp probe shows `gates.slice` is rejected;
`shellcheck scripts/*.sh` clean.

### Commit

`refactor: rename gates.slice manifest key to gates.part across schema, fixtures, test, prose (sense C)`

## Slice 4 — sense-A prose sweep across live surfaces (the non-mechanical body)

### Context

The remaining sense-A "slice" tokens in living prose/docs/examples and pi adapter prose + pi
test DATA — everything NOT already flipped by Slices 1–3 and NOT the sense-E carve-outs.
**Carve-outs to PRESERVE (sense E — do NOT touch):** `skills/run/SKILL.md:156/158/162/289`
(MemoryView "slice the in-session …" verb), `adapters/pi/src/cli.js:5/7`
(`process.argv.slice(2)`), `adapters/pi/src/probe.js:82` (`PORTS_EXERCISED.slice()`),
`docs/adapters/memory.md:91/107` (Slice 5's concern — and L91/L107 are sense-E verbs, KEEP),
`engine/test/memory.test.js:997/1016/1174/1175` (`result.slice(…)` — Slice 5 leaves these too).
**Also leave sense-D `slice-sizing` refs** in `skills/planning/SKILL.md:15/18`,
`skills/implementation/SKILL.md:24`, `docs/GUIDE-customizing.md:129` — those migrate in Slice 5.

Exact sense-A edits (flip "slice(s)"→"part(s)"):

- `skills/run/SKILL.md` — L188 (`construction: verify each slice`), L219 (`{ phase/slice, reason
  … }`), L293 (`task dynamics (phase id, slice, gate string)`), L315 (`{ phase/slice, reason …}`),
  L347 (`dimensions: planner / slice-TDD / …`), L390 (`4-dimension review after every code
  slice`), L392 (`per-slice review cadence`). **Leave L156/L158/L162/L289 (sense E).**
- `skills/planning/SKILL.md` — L19 (`each slice's pass/blocked outcome`), L25 (`the slice-gate
  command`), L32 (`verify slice sizing (no test-only slices) and that slice contexts`). **Leave
  L15/L18 `slice-sizing` (Slice 5); the `gates.slice` literal at L26 was flipped in Slice 3.**
- `skills/implementation/SKILL.md` — L11 (`fall back to gates.phase per slice — slower`), L25
  (`each implemented slice`), L29 (`Execute slices top-to-bottom … per slice`), L31 (`reads the
  slice there) + the slice's`), L34 (`the resolved slice gate`), L37 (`matches the slice
  promise`), L38 (`Failed/blocked slice`), L39 (`fresh respawn from the plan slice`), L41
  (`after the LAST slice`), L43 (`close gate gap after slice N`). **Leave L24 `slice` in
  `per-slice size` only if it is the sense-D `slice-sizing` context — verify in-place: L24 reads
  "per-slice `size` + pass/blocked"; "per-slice" is sense-A → flip to "per-part". The
  `slice-sizing` concern key itself is Slice 5.** The `slice-implementer` id (L3/L29) and
  `gates.slice` literal (L10) were flipped in Slices 2/3.
- `skills/review/SKILL.md` — any sense-A "slice" beyond the L44 `gates.part` already flipped in
  Slice 3 (verify with `grep -nE 'slice' skills/review/SKILL.md`; flip sense-A survivors).
- `contracts/producer.md:3` `Every slice carries a pre-chewed context block …` → `Every part …`.
- `contracts/construction.md:2` `Scope: the slice, the whole slice, nothing but the slice.` →
  `the part, the whole part, nothing but the part.`
- `README.md` — L18 (`design docs + sliced plans`), L23 (`git-worktree isolation + sliced TDD`),
  L72 (`defines the slice schema plan-lint enforces`) → "part(s)". (L65 was Slice 2.)
- `docs/adapters/execution.md:12` `the task dynamics (phase id, slice text, gate string …)` →
  `part text`. (L7 was Slice 2.)
- `docs/adapters/gate.md:61` `unit-tested separately (slice 5).` → `(part 5).`
- `docs/DOD.md:36` `every slice is gated before commit.` → `every part is gated …`.
- `examples/everything-claude-toolkit/agents/planner.md` — L14 (`pre-chewed per-slice context
  blocks, the slice schema plan-lint enforces`), L20 (`Every slice names its acceptance test`) →
  "part".
- pi adapter prose: `adapters/pi/src/execution.js:12` JSDoc `(phaseId, slice, gate,
  commitMessage, …)` → `(phaseId, part, gate, commitMessage, …)`; `adapters/pi/src/engine.js:9`
  `handled in subsequent slices, not here.` → `subsequent parts`; `adapters/pi/src/probe.js:71`
  `recorded by slice 7).` → `recorded by part 7).` (**Leave probe.js:82 `.slice()` — sense E.**)
- pi sense-A **test DATA** (flows into the agent prompt, so it is renamed vocabulary —
  `adapters/pi/test/execution.test.js`):
  - L6 `const DYNAMICS = { phaseId: 'implementation', slice: '5', gate: …` → `part: '5'`.
  - L73 test title `Given dynamics with phaseId and slice, …` → `… and part, …`.
  - L81 test title `…with phaseId and slice, …` → `… and part, …`.
  - L87 `assert.ok(result[1].includes('slice: 5'), 'prompt must contain slice: 5')` →
    `includes('part: 5'), 'prompt must contain part: 5'`.
  - L115 `lines.some(l => l === 'slice: 5'), 'slice must be on its own line'` →
    `l === 'part: 5'), 'part must be on its own line'`.
  - **Producer is key-generic — no producer code change needed (VERIFIED).**
    `adapters/pi/src/execution.js` `buildPrompt` (L46–49) renders dynamics via
    `Object.entries(dynamics).map(([k, v]) => `${k}: ${v}`)` — it iterates keys generically and
    holds NO literal `'slice'` key (confirmed: `grep -rnE "'slice'|\"slice\"" adapters/pi/src/`
    is empty). So renaming the test-data key `slice: '5'` → `part: '5'` (L6) makes the serializer
    emit `part: 5` automatically; only the descriptive JSDoc at L12 also names the key (already
    listed above). Do NOT hunt for a producer literal — there is none.
- `engine/test/scenarios.test.js` header comment L4–L6 `asserts specific slices of the
  Resolution … the gate-decision layer that this slice lands` → `specific parts of the
  Resolution … that this part lands` (sense-A prose; L683 was Slice 2).

### TDD steps

- RED: `adapters/pi/test/execution.test.js:87/115` assert the prompt contains `slice: 5`. The
  moment the test DATA key (L6) flips to `part: '5'` and the serializer emits `part: 5`, the OLD
  assertions (`'slice: 5'`) would fail — so flip assertions L87/L115 + titles L73/L81 in the SAME
  commit. Expected failure if mis-co-landed: `execution.test.js` "prompt must contain slice: 5".
  The prose/doc edits have no test (docs-only) — their proof is the residue grep + clean lints.
- GREEN: apply all sense-A edits above (prose + pi test data + pi serializer if key-literal) in
  one commit. `cd adapters/pi && node --test` green (202); `cd engine && node --test` green (941).
- REFACTOR: `grep -rniE 'slice' skills/ contracts/ README.md docs/adapters/{execution,gate}.md
  docs/DOD.md examples/everything-claude-toolkit/ adapters/pi/src/ adapters/pi/test/execution.test.js
  engine/test/scenarios.test.js` returns ONLY the named sense-E carve-outs and sense-D
  `slice-sizing` refs (Slice 5) — every other survivor is a bug.

### Gate

`cd engine && node --test 'test/**/*.test.js'` (green, 941) and
`cd adapters/pi && node --test 'test/**/*.test.js'` (green, 202);
`shellcheck scripts/*.sh` clean; `bash scripts/plan-lint.sh templates/plan.md` exit 0
(template untouched here but the safety net holds).

### Commit

`refactor: sweep sense-A slice→part prose across skills, contracts, README, docs, examples, pi adapter (sense A body)`

## Slice 5 — memory concern migration `slice-sizing` → `part-sizing`, `phase: slice` → `phase: part` (sense D)

### Context

ADR-134: migrate the memory concern key and the gate-cmd phase value — in code, tests, the port
doc, AND the committed data store — so no stored entry is orphaned. **The four sense-E
`Array.slice` calls in `engine/src/memory.js` (L482×2, L525, L590) and the four in
`engine/test/memory.test.js` (L997, L1016, L1174, L1175) are PRESERVED — do NOT touch them.**

Exact edits — producer, tests, doc, committed DATA — co-land:

- `engine/src/memory.js` (rename the concern key `slice-sizing` → `part-sizing`; the gate-cmd
  `phase: slice` is a stored-data value, handled in the data store below):
  - L12 doc-comment `slice-sizing has no per-use re-check (weak planner hint)` → `part-sizing …`.
  - L55 `CONCERNS` Set member `'slice-sizing',` → `'part-sizing',`.
  - L223 doc-comment `slice-sizing defaults to () => true …` → `part-sizing …`.
  - L270 `KEY_FIELDS` key `'slice-sizing': ['size'],` → `'part-sizing': ['size'],`.
  - L298 doc-comment `slice-sizing  — outcome changed …` → `part-sizing …`.
  - L308 `IMPROVES_BY` key `'slice-sizing': (o, n) => …` → `'part-sizing': (o, n) => …`.
  - **Leave L482/L525/L590 `.slice(…)` — sense E.**
- `engine/test/memory.test.js`: flip the ~40 craft-vocabulary `slice-sizing` / `phase: slice`
  strings to `part-sizing` / `phase: part` (test data + assertions that pin the concern key/phase
  value). **Leave the 4 `result.slice(…)` calls (L997/L1016/L1174/L1175) — sense E.** No test
  added/removed (count holds at 941). Find them with
  `grep -nE 'slice-sizing|phase: *.?slice' engine/test/memory.test.js`.
- `docs/adapters/memory.md`: L47 `slice-sizing defaults to () => true …` → `part-sizing`;
  L145 `…, `mutation-tool`, `findings`, `slice-sizing`.` → `part-sizing`; L153 table row
  `| `slice-sizing` | { size, outcome } | size | …` → `| `part-sizing` | …`. **Leave L91/L107
  ("orchestrator slices concern(s)" / "reads concern slice in-memory view") — sense E verbs, KEEP.**
- `docs/GUIDE-customizing.md:129` `… findings, slice sizing) so subsequent runs …` →
  `… findings, part sizing) …` (sense-D prose).
- **Committed data store `.claude/craft-memory.md`** (edit as DATA, a hand edit — NOT via the
  memory engine; the orchestrator's run-end advisory save is last-flush-wins and re-emits current
  concern names, so it will not undo this):
  - L13 `phase: slice` → `phase: part` (the gate-cmd entry's phase value).
  - L47 digest section anchor `slice-sizing:` → `part-sizing:`.
  - L48 `- concern: slice-sizing` → `- concern: part-sizing`.
  - L56 `- concern: slice-sizing` → `- concern: part-sizing`.
  - L64 `- concern: slice-sizing` → `- concern: part-sizing`.
  - L90 human-readable digest heading `## slice-sizing` → `## part-sizing`.
  - (Verify with `grep -nE 'slice' .claude/craft-memory.md` → returns nothing after, since this
    store has no sense-E use.)

### TDD steps

- RED: `engine/test/memory.test.js` asserts the concern key `slice-sizing` (in `CONCERNS`,
  `KEY_FIELDS`, `IMPROVES_BY` coverage and stored-entry round-trips). The instant `memory.js`
  L55/L270/L308 flip to `part-sizing`, those tests go RED (the assertions reference the old key).
  Expected failure: the `memory.test.js` tests pinning `slice-sizing` / `phase: slice`.
- GREEN: flip the `memory.test.js` strings (and the doc + committed data) in the SAME commit.
  `memory.test.js` goes green; count unchanged (941).
- REFACTOR: `grep -nE 'slice' engine/src/memory.js engine/test/memory.test.js` returns ONLY the
  sense-E `.slice(` lines (L482/525/590 in src; L997/1016/1174/1175 in test); `grep -nE 'slice'
  .claude/craft-memory.md docs/adapters/memory.md` returns ONLY `docs/adapters/memory.md:91/107`
  (sense-E verbs). `grep -nE 'slice' docs/GUIDE-customizing.md` returns nothing.

### Gate

`cd engine && node --test 'test/**/*.test.js'` (green, `# tests` = 941).

### Commit

`refactor: migrate slice-sizing memory concern to part-sizing in code, tests, doc, committed store (sense D)`

## Slice 6 — dated-history sweep (ADR-135)

### Context

ADR-135: word-boundary, sense-aware sweep of craft-vocabulary "slice"→"part" across DATED history
docs. Pure documentation; **no test impact** (no `node`/`bats` test reads these). This is a
docs-only, standalone slice (no `src/` delta).

**Targets (sweep craft-vocabulary "slice"→"part"):**
- `docs/adr/001`–`130` (the OLD ADRs only) — the files containing craft-vocab "slice" are:
  003, 011, 012, 014, 015, 016, 020, 027, 028, 035, 036, 043, 044, 045, 046, 047, 066, 084, 088,
  092, 096, 099 (verified list; sweep any that match on re-grep).
- `docs/{DESIGN,PLAN}-P*.md` — ALL except `DESIGN-P24` / `PLAN-P24` (e.g. DESIGN-P3/P5/P6/P8/P9/
  P9-hardening/P10/P12/P13/P14/P15/P16/P17/P18/P20/P21/P22; PLAN-P3/P4/P5/P6/P7/P8/P9/P9-hardening/
  P10/P11/P13/P14/P15/P16/P17/P18/P19/P20/P21/P22/P23). These carry the old `## Slice N` plan
  headings, `slice-implementer` id, `gates.slice`, `slice-sizing`, and unit prose — ALL flip to
  "part" even where they record a past decision about the term (e.g. ADR-013/032/034/036
  narration, PLAN-P4 vocabulary record).
- `docs/DESIGN-history.md`.
- `docs/DESIGN-customizable-engine.md`, `docs/PLAN-customizable-engine.md`.

**HARD carve-out — NEVER sweep these (meta-docs naming the old term):**
`docs/DESIGN-P24-rename-slice-vocabulary.md`, `docs/PLAN-P24-rename-slice-vocabulary.md` (this
plan), `docs/adr/131-…`, `132-…`, `133-…`, `134-…`, `135-…`.

**Sense-E carve-out — NEVER touch** `Array.slice` / `process.argv.slice` / `string.slice` / the
English verb wherever they appear in these dated docs. Use word/identifier-aware matching (as P8.5
used `\bforge\b`), classifying each occurrence; never a blanket `s/slice/part/`.

### TDD steps

- RED: none — docs-only, no test asserts these files. (The plan's discipline replaces RED here:
  the residue grep in REFACTOR is the proof of correctness.)
- GREEN: within the target set ONLY (excluding the six meta-docs), replace craft-vocabulary
  "slice"→"part" / "Slice"→"Part" / `slice-implementer`→`part-implementer` /
  `gates.slice`→`gates.part` / `slice-sizing`→`part-sizing`, word-boundary, leaving every sense-E
  use intact. Work doc-by-doc; after each, `grep -nE 'slice' <doc>` and confirm survivors are
  sense-E only.
- REFACTOR: `grep -rinE 'slice' docs/adr/0?? docs/adr/1[0-2]? docs/DESIGN-P*.md docs/PLAN-P*.md
  docs/DESIGN-history.md docs/DESIGN-customizable-engine.md docs/PLAN-customizable-engine.md`
  (with the P24 meta-docs excluded) returns ONLY sense-E uses. Confirm the six carve-out files are
  byte-unchanged (`git diff --stat` lists none of them).

### Gate

`bash scripts/ci.sh` green (the safety net; expect NO test delta — counts hold at 941 / 202);
`git diff --stat` confined to the dated-history docs in the target set, with none of the six
meta-docs touched.

### Commit

`refactor: sweep dated history docs slice→part, preserving sense-E and P24 meta-docs (history)`

## Slice 7 — residue closure + BACKLOG reconciliation (final assertion)

### Context

The closing slice: prove the rename is complete and reconcile `BACKLOG.md`'s sense-A/sense-D
lines. **This slice does NOT tick the P24 backlog checkbox** — that is the documentation phase's
job (it ticks under guard with reference links). Here we only rename stray sense-A/sense-D tokens
in `BACKLOG.md` and assert whole-tree closure.

- `BACKLOG.md` reconciliation (flip sense-A unit prose + sense-D concern; PRESERVE the P24 entry's
  *naming* of the old term):
  - L43 `… recurring findings, slice-sizing, per-phase metrics).` → `… part-sizing, …` (sense D).
  - L87 `Per-slice history lives in `git log` …` → `Per-part history …` (sense A).
  - L92 `Working style: sliced TDD, one slice per dedicated agent …` → `part TDD, one part per
    dedicated agent` (sense A).
  - L104–L115 (the P24 entry BODY): flip sense-A *uses* of the unit — e.g. `The plan decomposes
    work into **slices** (one atomic TDD commit each)` → `**parts** …`; `not slices` →
    `not parts`. **PRESERVE the P24 title and any line that NAMES the old term being renamed**
    (e.g. the heading `### P24 — Rename "slice" vocabulary …`, and a phrase like `"Slice" reads
    craft jargon` / `Decide exact term`, which describe the rename itself). Classify each L104–L115
    occurrence: a *use* of the unit → flip; a *mention* of the word being replaced → keep. When in
    doubt on a P24-block line, KEEP (the meta-doc carve-out principle).
- **Whole-tree residue closure:** `grep -rinE 'slice' .` (excluding `.git`) and assert EVERY
  survivor is one of:
  1. **Sense E** — `Array.prototype.slice` / `string.slice` / `process.argv.slice` / the English
     verb (e.g. `engine/src/memory.js:482/525/590`, `engine/test/memory.test.js:997/1016/1174/1175`,
     `engine/test/resolve.test.js:426`, `adapters/pi/src/cli.js:5/7`, `adapters/pi/src/probe.js:82`,
     `skills/run/SKILL.md:156/158/162/289`, `docs/adapters/memory.md:91/107`); OR
  2. **Meta-document naming use** — `docs/DESIGN-P24-rename-slice-vocabulary.md`,
     `docs/PLAN-P24-rename-slice-vocabulary.md` (this plan, incl. its `## Slice N` structural
     headings), `docs/adr/131…135`, and the kept P24-naming lines in `BACKLOG.md`.
  No sense-A, sense-B, sense-C, sense-D, or dated-history survivor is permitted (B/C/D flipped in
  Slices 2/3/5; history swept in Slice 6).

### TDD steps

- RED: none — `BACKLOG.md` is not test-covered; the closure assertion is the proof.
- GREEN: apply the `BACKLOG.md` sense-A/sense-D edits above. Then run the whole-tree residue grep
  and triage every hit against the two allowed classes; if any hit is NOT sense-E and NOT a
  meta-doc naming use, it is a missed rename — fix it in THIS commit (it belongs to whichever
  earlier sense; fold the fix here as residue closure).
- REFACTOR: re-run `grep -rinE 'slice' . | grep -vE '<the two allowed classes>'` → empty. Confirm
  the six meta-docs + this plan keep their naming uses (not corrupted).

### Gate

`bash scripts/ci.sh` green (counts hold at 941 / 202, never `--no-verify`); the whole-tree
residue grep yields only sense-E + meta-doc naming survivors; `shellcheck scripts/*.sh` clean;
`bash scripts/plan-lint.sh templates/plan.md` exit 0.

### Commit

`refactor: residue-closure slice→part and reconcile BACKLOG sense-A/D lines (closure)`
