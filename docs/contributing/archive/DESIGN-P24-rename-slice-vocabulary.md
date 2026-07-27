# Design — Rename the "slice" vocabulary to "part" (P24)

> Brief: Rename craft's plan-decomposition unit "slice" (one atomic TDD commit) to a
> term closer to mainstream software-engineering vocabulary. Cross-cutting,
> mechanically-consistent, behavior-preserving: zero runtime behavior change,
> vocabulary only.
> Status: draft → self-reviewed ×3 → decisions ratified (ADRs 131–135) → revised → accepted

> **Decisions ratified.** ADRs 131–135 settle every load-bearing fork this design
> raised; they OVERRIDE the prior recommendations below, which are kept only as the
> record of what was weighed. The replacement term is **"part"** (ADR-131, not the
> designer-recommended "increment"). The decisions deviate toward a **maximal rename**:
> the agent id, the `gates.slice` key, the memory concern, and all dated history docs
> are now IN scope. See "Decisions ratified" for the binding mapping.
>
> **Meta-document carve-out (non-negotiable).** This design doc and the five ADRs
> 131–135 *name the old term "slice"* to describe what is being renamed. Those naming
> uses are PRESERVED — they must never be swept. The rename is identifier/word-scoped
> and sense-aware; it is never a blanket `s/slice/part/`.

## Context

"slice" is craft's name for the unit the plan decomposes work into — one atomic TDD
commit, implemented by one agent, gated, committed. It is craft jargon. The brief asks
to swap it for a mainstream term and keep the swap mechanically consistent across the
load-bearing surfaces in one pass.

This is a **rename**, and craft has already executed two cross-cutting renames whose
discipline is the binding precedent for P24:

- **P4 — generic vocabulary** (`docs/PLAN-P4-vocabulary.md`, ADRs 004/009/012/013/014):
  `forge`-era phase names → generic ids, with `engine/src/alias-map.js` as the *single*
  old→new home (`resolveAlias`), under a **Surface gate**: "the golden `Resolution` stays
  byte-identical; `pipeline/default.yml` and the engine resolver are not touched; CI green
  at every commit, never `--no-verify`." History was **split** (old PLAN/DESIGN docs kept
  the old words).
- **P8.5 — forge→craft** (commit `c807bf0`): the plugin rename. It sliced the rename **by
  shape** — (s1) data/manifests/fixtures/tests flipped *in lockstep, green by construction*;
  (s2) script+hook reader/writer pairs in lockstep; (s3) the 12 phase skills; (s4) product
  prose; (s5) a docs sweep via a word-boundary regex `\bforge\b` that *protected* English
  uses (`unforgettable`, `forgets`). It deliberately chose **no alias** for the flipped name
  (one canonical token, goldens flip with it) and **swept dated ADRs** (a user override of
  the P4 freeze posture) — then ran a **residue-closure** grep for missed strings, and held
  a **Surface gate**: `engine/src` 0-diff, `engine/bin` diff limited to documented
  user-facing message strings.

P24 follows P8.5's shape **and its posture**: atomic-by-shape slices, lockstep flips
green-by-construction, residue grep, a Surface gate, **no alias**, and — now ratified by
ADR-135 — the **sweep of dated history** (the user override of P4's freeze). It is one token
("slice"), but the decisions made the rename **maximal**: every craft-vocabulary sense is in
scope. The defining constraint is that "slice" carries **five distinct senses** in this
codebase; four are in scope (the unit, the agent id, the gate key, the memory concern), one is
the hard carve-out (sense E), and the in-scope core includes a **load-bearing mechanical pair**
(the lint regex and the template heading) plus an **agent
identity that is engine config** (`pipeline/default.yml` `role:`, `manifest.js` key set).

### The five senses of "slice" (empirically inventoried)

| Sense | What it is | Representative surfaces (verified) |
|---|---|---|
| **A — plan-decomposition unit** | "slice" = one atomic TDD commit; the core target | `templates/plan.md` headings + sizing prose; `scripts/plan-lint.sh` regex+messages; `skills/{planning,implementation,run,review}/SKILL.md`; `contracts/{producer,construction}.md`; `agents/planner.md`, `agents/slice-implementer.md` body; `README.md`; `docs/adapters/{execution,gate}.md`; `docs/DOD.md`; `examples/.../planner.md`; pi adapter prose+test data (`adapters/pi/src/{execution,probe,engine}.js`, `adapters/pi/test/execution.test.js` `slice: '5'` dynamics, `engine/test/scenarios.test.js:5-6` prose) |
| **B — agent identity `slice-implementer`** | the per-unit TDD worker agent | `agents/slice-implementer.md` (file name + frontmatter `name:`); `engine/src/manifest.js:48` `MODELS_KEYS`; `pipeline/default.yml:69` `role: craft:slice-implementer`; `skills/implementation/SKILL.md`; `README.md:65`; `docs/adapters/execution.md:7`; tests: `engine/test/{descriptor,manifest,resolve,scenarios}.test.js`, `adapters/pi/test/run.test.js`; examples `model-routing`/`role-swap` |
| **C — gate-granularity key `gates.slice`** | the per-commit TARGETED gate (vs `gates.phase`) | `engine/src/manifest.js:37` `GATE_FIELDS`; `engine/test/manifest.test.js:252`; `test/fixtures/manifest/{valid-basic,valid-quoting,invalid-malformed-yaml}.workflow.md`; prose `skills/{planning,implementation,run,review}/SKILL.md`, `agents/slice-implementer.md:10`, `examples/gate-command/workflow.md`, `templates/plan.md` `### Gate` note |
| **D — memory concern keys** | machine-maintained data: `slice-sizing` concern, gate-cmd `phase: slice` | `engine/src/memory.js` (`CONCERNS` L55, `KEY_FIELDS` L270, `IMPROVES_BY` L308, comments L12/L223/L298 — **plus 4 sense-E `Array.slice` at L482×2/L525/L590, NOT renamed**); `engine/test/memory.test.js` (44 total `slice` hits = **40 craft-vocabulary to flip** + **4 sense-E `Array.slice` to keep**); `.claude/craft-memory.md` stored entries (`slice-sizing:` blocks, `concern:` values, `## slice-sizing` digest heading, gate-cmd `phase: slice` L13); `docs/adapters/memory.md` (L47/L145/L153 craft-vocab; L91/L107 are sense-E verbs, keep), `docs/GUIDE-customizing.md:129`, `BACKLOG.md:43` |
| **E — unrelated programming use** | `Array.prototype.slice`, `string.slice`, `process.argv.slice`, English verb | ~40 hits across `engine/src/{resolve,edits,findings,memory,pipeline-resolve-main}.js`, many `*.test.js`, `adapters/pi/src/cli.js`, JSDoc `process.argv.slice(2)`. **Never touched.** |

Pinned, decision-relevant facts (each verified, not recalled):

1. **Lint regex anchoring (probed in mktemp).** `scripts/plan-lint.sh:23` keys on
   `/^## Slice/` — it matches a heading line that *starts with* `## Slice` regardless of a
   trailing number (probe: `## Slice 1` and `## Slice` both pass; `## Sizing rules` does
   **not** match — it is `## Slice`-prefixed only by coincidence of letters and is safe). A
   heading renamed to `## Part 1` makes the current lint emit
   `plan-lint: no "## Slice" sections found — not a craft plan.` and **exit 2**. ⇒ the
   template heading and the lint regex are a **mechanical pair that must flip in the same
   commit** or every plan lint breaks. (This is the brief's "agent name and lint keyword are
   load-bearing".)
2. **`gates.slice` is schema-only, not used by the default pipeline.** `pipeline/default.yml`
   resolves code-producing phases to `<gates.phase>` (lines 76/89/107) — there is **no
   `<gates.slice>` placeholder anywhere in the live pipeline**. `slice` exists in the
   `GATE_FIELDS` validation set and three fixtures, and is referenced as the *targeted* gate
   in skill prose (e.g. `skills/run/SKILL.md:280`, `skills/review/SKILL.md:44`,
   `examples/gate-command/workflow.md`). So renaming the key is a **manifest-schema break**
   (a repo declaring `gates: { slice: … }` would fail validation post-rename) with **low
   live blast radius** in this repo's own pipeline. *(ADR-133 ratifies the rename — this
   manifest-schema break is accepted; no external manifest in this repo uses the old key.)*
3. **The agent identity *is* engine config.** Despite the backlog's "No engine-descriptor
   change expected", `pipeline/default.yml:69` (`role: craft:slice-implementer`) and
   `engine/src/manifest.js:48` (`MODELS_KEYS` — the set `validateModels` checks user
   `models:` keys against) **both contain the agent id**. Renaming the agent therefore
   changes engine config + a golden descriptor + fixtures. *(ADR-132 ratifies the full
   rename: the backlog aside is factually wrong; the golden descriptor diff is accepted,
   confined to the `role:` line.)*
4. **`alias-map.js` is phase-id-only.** `engine/src/alias-map.js` maps old *phase* names
   (`branch→workspace`, `implement→implementation`, …). It contains **no** agent key and no
   `gates.*` key. An agent or gate-key rename does **not** edit `alias-map.js`; ADR-132 ratifies
   **no alias** for the renamed agent (P8.5's precedent — flip in lockstep), so `alias-map.js`
   stays phase-id-only.
5. **Test counts are pinned and must not move.** `scripts/ci.sh` asserts
   `EXPECTED_TESTS=941` and `EXPECTED_PI_TESTS=202`. A pure rename edits strings *inside*
   existing tests; it must **not add or remove a test**, or CI fails on count drift. Test
   *titles* containing "slice" (e.g. `engine/test/manifest.test.js:669`) get the new word
   but stay one test each.

## Requirements

When this ships, all of the following are verifiable:

1. **R1 — One canonical term, applied consistently.** Every craft-vocabulary "slice" is
   replaced by **part** (ADR-131) everywhere it is in scope (per the IN/OUT table), with no
   mixed vocabulary in any touched surface — living or dated.
2. **R2 — The lint↔template pair flips atomically.** `scripts/plan-lint.sh`'s heading regex
   (`^## Part`) and *all* its user-facing messages, the `templates/plan.md` `## Part`
   heading(s) + sizing prose, and `agents/planner.md`'s `## Part N` schema reference change in
   **one commit**; after it, `plan-lint.sh` accepts a plan whose headings use `## Part` and
   rejects one using `## Slice`, and `bash scripts/plan-lint.sh templates/plan.md` passes.
3. **R3 — Agent rename is mechanically complete (ADR-132, full rename, no alias).**
   `agents/slice-implementer.md` → `agents/part-implementer.md` (file + `name:`), `manifest.js`
   `MODELS_KEYS`, `pipeline/default.yml` `role: craft:part-implementer`, all
   skills/README/example/port-doc refs, and **all pinning tests**
   (`engine/test/{descriptor,manifest,resolve,scenarios}.test.js`, `adapters/pi/test/run.test.js`)
   flip together so CI is green at that commit by construction.
4. **R4 — Test counts unchanged.** `EXPECTED_TESTS=941` and `EXPECTED_PI_TESTS=202` hold
   after the change; no test is added or removed (strings flip inside existing tests — the
   `gates.part` rename in `manifest.test.js` and the ~40 `part-sizing`/`part` flips in
   `memory.test.js` change no count). `scripts/ci.sh` passes at every commit, never `--no-verify`.
5. **R5 — Sense boundaries respected.** Sense E (`Array.slice` et al.) is never edited, and the
   P24 meta-documents keep "slice" where they name the old term. Sense C (`gates.slice`) is
   renamed to `gates.part` (ADR-133). Sense D (`slice-sizing`, gate-cmd `phase: slice`) is
   **migrated** to `part-sizing` / `phase: part` (ADR-134) — including the committed
   `.claude/craft-memory.md` entries, so no stored entry is orphaned.
6. **R6 — No provenance leakage, no suppression.** No phase/ADR/backlog numbers enter
   source or test as a result of these edits; no `@ts-ignore`/`eslint-disable`/coverage-
   ignore is introduced; the rename narration lives only in this doc + ADRs.
7. **R7 — Dated history swept, meta-docs preserved (ADR-135).** `docs/adr/001`–`130`,
   `docs/{DESIGN,PLAN}-P*.md`, `docs/DESIGN-history.md`, and the customizable-engine docs are
   swept "slice"→"part" (word-boundary, sense-aware). The carve-out is exact: ADRs **131–135**
   and this `DESIGN-P24` doc keep "slice" where they name the old term; sense E is untouched.
8. **R8 — Backlog ticked under guard.** The P24 entry in `BACKLOG.md` (lines 102–117) is
   marked done in the documentation phase with a reference link to this doc + ADRs 131–135, and
   `BACKLOG.md`'s own uses are reconciled to "part" — the *sense-A* uses (lines 87, 92, 104–115)
   and the *sense-D* use (line 43, `slice-sizing` → `part-sizing`, now migrated per ADR-134).

## Design

The change is a **string/identifier rename across a fixed, enumerated surface set**, sliced
by *shape* (à la P8.5) so each slice is internally atomic and green-by-construction. No new
runtime mechanism, no new module, no behavior change. The substance of the design is the
**precise IN/OUT scope**, the **atomicity contract** (which edits must co-land), and the
**pre-chewed slice outline** the planner will consume.

### D1 — IN / OUT scope by sense (RATIFIED)

The replacement term is **"part"** (ADR-131). The decisions made this a **maximal
rename**: senses A–D are all IN; dated history is swept IN; only sense E and the rename's
own meta-documents are OUT.

| Sense | Ratified scope | Rationale |
|---|---|---|
| **A — plan-decomposition unit** | **IN (the whole point)** — ADR-131 | The term the brief targets. All living surfaces in the sense-A row flip to **part**: `## Part N` headings, the `^## Part` lint token, contract prose ("the part, the whole part, nothing but the part"), "every part is one atomic commit". |
| **B — agent `slice-implementer`** | **IN — full rename to `part-implementer`** — ADR-132 | Lockstep, **no alias**. The id is engine config (fact 3): agent file, `MODELS_KEYS`, `pipeline/default.yml` `role:`, all pinning tests, all docs/examples flip in one commit. Cluster 2 is now **active** (was conditional). |
| **C — `gates.slice` key** | **IN — rename to `gates.part`** — ADR-133 | Total vocabulary consistency chosen over schema stability. Breaking manifest-schema change, accepted. `GATE_FIELDS` + 3 fixtures + `manifest.test.js:252` + prose flip in lockstep. `gates.phase`/`gates.review-batch` unchanged. The S3 slice is now **active**. |
| **D — memory concern (`slice-sizing`) + gate-cmd `phase: slice`** | **IN — migrate to `part-sizing` / `phase: part`** — ADR-134 | ADR-135's globally-clean-grep goal voids the freeze premise for this internal key. Migrate `engine/src/memory.js` (CONCERNS, KEY_FIELDS, IMPROVES_BY, comments), `engine/test/memory.test.js` (strings flip, **count must not change**), `docs/adapters/memory.md`, AND the committed data entries in `.claude/craft-memory.md` (rename concern keys + `phase: slice`→`phase: part` so no entry is orphaned). |
| **E — unrelated programming use** | **OUT (hard)** | `Array.prototype.slice`/`string.slice`/`process.argv.slice`/the English verb. Not craft vocabulary. Never edited. The rename is **word/identifier-scoped and sense-aware**, never a blanket `s/slice/part/`. This is the one carve-out that survives the maximal rename. |
| **Dated history** | **IN — sweep to "part"** — ADR-135 | The OLD ADRs (`001`–`130`, NOT the new 131–135), `docs/{DESIGN,PLAN}-P*.md`, `docs/DESIGN-history.md`, `docs/{DESIGN,PLAN}-customizable-engine.md` are swept for craft-vocabulary "slice"→"part", word-boundary + sense-aware (P8.5 posture, user override of the P4 freeze). |
| **Meta-documents** | **OUT (hard carve-out)** — ADR-135 | This design doc (`docs/DESIGN-P24-rename-slice-vocabulary.md`) and ADRs **131–135** *name the old term "slice"* to describe what is being renamed. Those naming uses are PRESERVED. The implementer must not corrupt them; residue closure asserts every surviving "slice" is sense E or such a naming use. |

### D2 — Mechanical-consistency contract (what MUST co-land)

Two clusters are load-bearing: a half-rename of either breaks the build or the lint.

**Cluster 1 — lint ↔ template ↔ planner-schema (sense A core).** These describe *the same
schema* from three sides; they must change in one commit:
- `scripts/plan-lint.sh` — the heading regex (`/^## Slice/` → `/^## Part/`), the three
  user-facing messages (`slice "%s" missing` → `part "%s" missing`, `no "## Slice" sections
  found` → `no "## Part" sections found`, `%d slice(s) OK`/`%d slice(s) violate` → `%d
  part(s) …`), and the header comment (`validate a plan file against the slice schema` →
  `… against the part schema`).
- `templates/plan.md` — the `## Slice 1`/`## Slice 2` headings (L19/L37) → `## Part 1`/`## Part
  2`, and the sense-A "slice" tokens in the Sizing-rules prose (L4/L5/L10–L16/L25/L35) and the
  `### Gate` note's sense-A words ("slice gate command(s)", "this slice", L31). **L31 also
  carries the sense-C `gates.slice` token** — that token now flips to `gates.part` in the same
  change-set under ADR-133 (S3). Both the sense-A words and the `gates.slice`→`gates.part`
  literal on L31 move.
- `agents/planner.md` — the `(## Slice N, …)` → `(## Part N, …)` schema reference (line 17) and
  the planner's sizing/part prose (it tells the agent what heading to emit).

Acceptance: after this commit, a plan using `## Part` lints OK and one using `## Slice`
is rejected; `bash scripts/plan-lint.sh templates/plan.md` exits 0.

**Cluster 2 — agent identity (sense B): FULL RENAME, unconditional (ADR-132).** The id string
is one value referenced from config, golden descriptor, runtime, docs, and tests. There is **no
alias** and no identifier-stable fallback — all co-land in one commit:
- `agents/slice-implementer.md` → `agents/part-implementer.md` (git mv) + `name: part-implementer`
  frontmatter + body prose.
- `engine/src/manifest.js:48` `MODELS_KEYS` member (`slice-implementer` → `part-implementer`).
- `pipeline/default.yml:69` `role: craft:slice-implementer` → `role: craft:part-implementer`.
- `engine/test/descriptor.test.js:213`, `engine/test/scenarios.test.js:683`,
  `engine/test/resolve.test.js:44`, `engine/test/manifest.test.js:669+673` (incl. the test
  *title*), `adapters/pi/test/run.test.js:26` — the golden/fixture strings.
- `skills/implementation/SKILL.md` (frontmatter + body), `README.md:65`,
  `docs/adapters/execution.md:7`, `examples/model-routing/workflow.md:30`,
  `examples/role-swap/workflow.md:21`.

Acceptance: `node engine/bin/pipeline-resolve.js pipeline/default.yml` exits 0 and the golden
descriptor tests pass against the new `role:` string at that commit; the golden `Resolution`
diff is confined to exactly the `role:` line (ADR-132); `EXPECTED_TESTS`/`EXPECTED_PI_TESTS` are
unchanged (strings flip inside existing tests; none added/removed).

`alias-map.js` stays phase-id-only — **no agent alias is added** (ADR-132). A manifest
referencing the old agent key is invalid after this change; no external consumer depends on it.

### D3 — `gates.slice` → `gates.part` (sense C, RATIFIED: RENAME)

ADR-133 ratifies the **rename** (the user chose total vocabulary consistency over schema
stability; the prior recommendation to keep `gates.slice` is superseded). The S3 slice is
**active**:
- Edit `GATE_FIELDS` (`engine/src/manifest.js:37`) — `'slice'` → `'part'` in the frozen set
  `{'slice','phase','review-batch'}` → `{'part','phase','review-batch'}`.
- The three fixtures: `test/fixtures/manifest/valid-basic.workflow.md:6`,
  `valid-quoting.workflow.md:5`, `invalid-malformed-yaml.workflow.md:2`.
- `engine/test/manifest.test.js:252` (the `gates: { slice: … }` literal).
- Prose refs: `skills/run/SKILL.md:280` (`gates.slice` over the targeted set),
  `skills/review/SKILL.md:44`, `examples/gate-command/workflow.md:4` and `:18` (the cadence
  triad `slice` row → `part`), `templates/plan.md` `### Gate` note.

This is a **breaking manifest-schema change**, accepted: a repo declaring `gates: { slice: … }`
fails validation after the rename (no external manifest in this repo's surface uses it). No
`<gates.slice>` placeholder exists in the live pipeline (fact 2), so descriptor substitution is
unaffected. `gates.phase` and `gates.review-batch` are **unchanged** — only the `slice` member
of the triad flips to `part`.

### D4 — The rename is word/identifier-scoped, never blanket

Sense E dominates the raw grep count (~40 of ~150 hits) and a blanket `s/slice/part/` would
corrupt `Array.slice`. Every edit is made against a *classified* occurrence (the per-file,
per-line inventory in D6), using word-boundary / identifier-aware matching exactly as P8.5
used `\bforge\b` to protect `unforgettable`. The residue-closure step (D6, final slice)
re-greps `-i slice` and asserts every survivor is **sense E** or a **meta-document naming
use** (this design doc + ADRs 131–135 naming the old term). Sense D is no longer a survivor —
it migrated (ADR-134). Dated history is no longer a survivor — it was swept (ADR-135).

### D5 — Surface gate (borrowed from P4/P8.5)

Held at every commit, asserted in the plan:
- `scripts/ci.sh` green; never `--no-verify`; `EXPECTED_TESTS=941`/`EXPECTED_PI_TESTS=202`
  hold (a pure rename flips strings inside existing tests; it adds/removes none).
- The golden `Resolution` from `node engine/bin/pipeline-resolve.js pipeline/default.yml`
  changes in **exactly one place**: the `role:` line (`craft:slice-implementer` →
  `craft:part-implementer`, ADR-132). It is verified that the resolved Resolution contains
  "slice" ONLY in `role:` — the `gates.slice`→`gates.part` rename (ADR-133) lives in the
  manifest-validation schema (`GATE_FIELDS` + fixtures), for which **no `<gates.slice>`
  placeholder exists in the live pipeline (fact 2)**, so it does NOT touch the resolved
  Resolution. Net: the Resolution diff is one line; the gates rename is a separate
  schema/fixture surface. Earlier drafts claimed a byte-identical Resolution under the
  keep/identifier-stable forks; those forks are closed, so that claim is **retired**.
- `git diff --stat` touches only the enumerated surfaces; no `engine/src/*.js` logic edit
  beyond the literal key/id strings in `manifest.js` and the concern/phase strings in
  `memory.js` (data-table edits, no control-flow change).

### D6 — Pre-chewed slice outline for the planner (by shape)

Each slice below is internally atomic (green-by-construction) and carries its exact surface
list. The planner will turn these into `### Context`/`### TDD steps`/`### Gate`/`### Commit`
blocks. *Slice count and exact partition is the planner's call; this is the pre-chewed map.*
The term is **part** and all scopes are resolved (ADRs 131–135) — nothing is left to planning.

- **S1 — lint ↔ template ↔ planner-schema (Cluster 1, sense A core).** Files:
  `scripts/plan-lint.sh` (regex L23, messages L20/L27/L28/L29, header comment L2),
  `templates/plan.md` (headings L19/L37, Sizing prose L4/L5/L10–L16/L25/L35; the `### Gate`
  note L31 sense-A words — the `gates.slice`→`gates.part` literal on L31 lands with S3),
  `agents/planner.md` (schema ref L17, sizing prose L14/L18–L34). **No bats test exercises
  `plan-lint.sh` or asserts `## Slice`** (verified: the only references are orchestrator prose
  in `skills/{planning,implementation}/SKILL.md`, and `ci.sh:32`'s `bats test/` does not invoke
  plan-lint) — so this slice's verification is the mktemp probe + `bash scripts/plan-lint.sh
  templates/plan.md` exit 0, with **no `node` or `bats` test count change**. **This is the one
  slice that flips lint behavior; it must be self-contained and green.**
- **S2 — agent identity (Cluster 2, sense B) — ACTIVE (ADR-132, unconditional).** Full rename
  `slice-implementer` → `part-implementer`, no alias. Files per D2 Cluster 2 — the git mv of
  `agents/slice-implementer.md` → `agents/part-implementer.md` (file + `name:` + body, including
  the agent's own sense-A prose), `engine/src/manifest.js:48`, `pipeline/default.yml:69`, and
  **all pinning tests in the same commit** (`descriptor.test.js:213`, `scenarios.test.js:683`,
  `resolve.test.js:44`, `manifest.test.js:669+673`, `adapters/pi/test/run.test.js:26`), plus
  `skills/implementation/SKILL.md`, `README.md:65`, `docs/adapters/execution.md:7`,
  `examples/{model-routing,role-swap}/workflow.md`. Gate: `cd engine && node --test
  'test/**/*.test.js'` and `cd adapters/pi && node --test 'test/**/*.test.js'` both green with
  unchanged counts; `pipeline-resolve.js pipeline/default.yml` exit 0; golden `Resolution` diff
  confined to the `role:` line.
- **S3 — `gates.slice` → `gates.part` (sense C) — ACTIVE (ADR-133, schema rename).** Files:
  `engine/src/manifest.js:37` (`GATE_FIELDS`), `test/fixtures/manifest/{valid-basic:6,
  valid-quoting:5,invalid-malformed-yaml:2}.workflow.md`, `engine/test/manifest.test.js:252`,
  prose refs (`skills/run/SKILL.md:280`, `skills/review/SKILL.md:44`,
  `examples/gate-command/workflow.md:4` and `:18`, `templates/plan.md` `### Gate` literal). Gate:
  `node --test` green, counts unchanged; `node engine/bin/manifest-lint.js` over fixtures now
  accepts `gates.part` and rejects `gates.slice`. **Breaking manifest-schema change, accepted.**
- **S4 — sense-A prose sweep (the non-mechanical body).** Files: `skills/{planning,
  implementation,run,review}/SKILL.md` sense-A lines (`run/SKILL.md:188/219/293/315/347/390/392`
  et al.) — *not* the **sense-E** MemoryView "slice" verbs at `run/SKILL.md:156/158/162/289`,
  which are PRESERVED, *not* the sense-D `slice-sizing` refs (those are S-mem),
  `contracts/{producer.md:3,construction.md:2}` ("the part, the whole part, nothing but the
  part"), `README.md` (L18/L23/L72; L65 landed in S2), `docs/adapters/execution.md:12`,
  `docs/adapters/gate.md:61`, `docs/DOD.md:36`, `docs/GUIDE-customizing.md:129` (sense-A "slice
  sizing" prose), `examples/everything-claude-toolkit/agents/planner.md:14/20`, pi adapter prose
  (`adapters/pi/src/execution.js:12`, `adapters/pi/src/engine.js:9`,
  `adapters/pi/src/probe.js:71`) and the pi sense-A **test data** (`adapters/pi/test/
  execution.test.js:6/73/81/87/115` — the `slice: '5'` dynamics + assertions, which flow into
  the agent prompt and so are part of the renamed vocabulary; `engine/test/scenarios.test.js:5-6`
  prose). Gate: `node --test` both trees green, counts unchanged;
  `shellcheck`/`pipeline-lint`/`contracts-lint` clean.
- **S-mem — memory concern migration (sense D) — ACTIVE (ADR-134).** Migrate `slice-sizing`
  → `part-sizing` and gate-cmd `phase: slice` → `phase: part`. Files: `engine/src/memory.js`
  (the `CONCERNS` set L55, `KEY_FIELDS` L270, `IMPROVES_BY` L308, the doc-comments
  L12/L223/L298 — **leaving the four sense-E `Array.slice` calls at L482×2/L525/L590
  untouched**), `engine/test/memory.test.js` (the 40 craft-vocabulary "slice" strings flip;
  the 4 `Array.slice` calls stay; **test count must not change**), `docs/adapters/memory.md`
  (L47/L145/L153 — *not* the sense-E "slices the concern" verb at L91/L107), and the **committed
  data store** `.claude/craft-memory.md` — rename the `slice-sizing:` concern blocks + each
  `concern: slice-sizing` value + the human-readable `## slice-sizing` digest heading, and the
  gate-cmd entry `phase: slice` (L13). **Nuance:** `.claude/craft-memory.md` is the LIVE store
  this very run reads at start and writes at end; the implementer edits the committed store's
  concern keys / phase values **as data** (a hand edit, not via the memory engine). The run-end
  memory save is unaffected — it is advisory and last-flush-wins, so it overwrites with the
  current concern names regardless. Gate: `cd engine && node --test 'test/**/*.test.js'` green,
  count unchanged.
- **S-hist — dated-history sweep (ADR-135) — ACTIVE.** Word-boundary, sense-aware sweep of
  craft-vocabulary "slice"→"part" across the OLD ADRs `docs/adr/001`–`130` (NOT 131–135),
  `docs/{DESIGN,PLAN}-P*.md` (NOT this `DESIGN-P24` doc), `docs/DESIGN-history.md`, and
  `docs/{DESIGN,PLAN}-customizable-engine.md`. **Carve-out is narrow and exact:** the only
  preserved docs are the rename's own meta-documents — ADRs **131–135** and this `DESIGN-P24`
  doc. In every *other* dated doc, "slice" meaning the unit/agent/gate/memory concern flips to
  "part" even where it records a past decision about it (e.g. ADR-013/032/034/036 narration);
  only sense-E uses are left. Pure documentation; no test impact. Gate:
  `shellcheck`/`pipeline-lint`/`contracts-lint` unaffected; `scripts/ci.sh` green.
- **S-residue — residue-closure + backlog (final assertion).** Re-grep `grep -rin slice` over
  the **whole tree** and assert every survivor is **sense E** (`Array.slice` family / English
  verb) or a **meta-document naming use** (this `DESIGN-P24` doc + ADRs 131–135 naming the old
  term). No other survivor is permitted (D migrated, history swept). Reconcile `BACKLOG.md`
  sense-A lines (43 `slice-sizing` → `part-sizing`, 87/92/104–115) and tick P24 (L102–117) with
  reference links to this doc + ADRs 131–135. Gate: full `scripts/ci.sh` green.

Sense E and the meta-documents are explicitly **not** in any slice (both are hard OUT).

## Decisions ratified

The forks this design raised are **settled** by ADRs 131–135 (do not re-open them). The
original decision-candidate table is retired; the binding mapping is:

| ADR | Fork (was DC) | Ratified decision | Deviation from prior recommendation |
|---|---|---|---|
| **131** | The replacement term (DC-1) | **part** | Deviates — designer recommended "increment"; user chose "part" (maximally plain, zero collision). |
| **132** | Agent-rename scope (DC-2) | **Full rename `slice-implementer` → `part-implementer`, no alias** | Matches the recommendation (full rename). Cluster 2 / S2 is now unconditional. |
| **133** | `gates.slice` key (DC-3) | **Rename `gates.slice` → `gates.part`** (breaking manifest-schema change, accepted) | Deviates — designer recommended "keep"; user chose total consistency. S3 is now active. |
| **134** | Memory concern (DC-3b) | **Migrate `slice-sizing` → `part-sizing` + gate-cmd `phase: slice` → `phase: part`, committed data included** | Deviates — designer recommended "freeze"; ADR-135's clean-grep goal voids the freeze premise. S-mem is now active. |
| **135** | Frozen-history boundary (DC-4) | **Sweep all dated history docs** (word-boundary, sense-aware), with the meta-document carve-out | Deviates — designer recommended "freeze all"; user chose the P8.5 sweep posture. S-hist is now active. |

**No open candidates.** Reconciling the doc to the ADRs surfaced no new fork the ADRs do not
cover. The only residual hard boundaries are mechanical, not decisions: sense E is never touched,
and the P24 meta-documents (this doc + ADRs 131–135) keep "slice" where they *name the old term*.

## Test strategy

This is a rename; "tests" are mostly the **existing** suites staying green plus the lint
behavior flip. No new `node` test (count is pinned).

- **Lint behavior (S1), proven mechanically:** in a mktemp throwaway, a plan using `## Part 1`
  (+ the four `### ` sub-sections) passes `plan-lint.sh`, and a plan using `## Slice` is
  **rejected** (`no "## Part" sections found`, exit 2). Plus `bash scripts/plan-lint.sh
  templates/plan.md` exits 0. No bats/`node` test asserts plan-lint output (verified — see S1),
  so there is **no test to update and no count to drift** for the lint flip; the probe is the
  proof.
- **Engine/golden (S2/S3/S-mem):** `cd engine && node --test 'test/**/*.test.js'` and
  `cd adapters/pi && node --test 'test/**/*.test.js'` green with `# tests` equal to 941 /
  202 respectively (the `ci.sh` count assertion is the regression guard). The golden
  descriptor tests (`descriptor.test.js`, `scenarios.test.js`) pin the post-rename `role:
  craft:part-implementer` string by construction. `manifest.test.js` pins `gates.part` (S3) and
  `memory.test.js` pins `part-sizing` (S-mem), both with **unchanged test counts** — only
  strings flip. `node engine/bin/pipeline-resolve.js pipeline/default.yml` exits 0.
- **Surface gate (every commit):** full `scripts/ci.sh` green, never `--no-verify`;
  `git diff --stat` confined to the enumerated surfaces. A direct `diff` of `pipeline-resolve`
  output pre/post shows **exactly one changed line — `role:`** (ADR-132); the `gates.slice`→
  `gates.part` rename (ADR-133) is a manifest-schema/fixture surface that does **not** appear in
  the resolved Resolution (no `<gates.slice>` placeholder; fact 2). The keep/identifier-stable
  forks are closed, so the prior "byte-identical Resolution" claim is retired.
- **Residue grep (S-residue):** `grep -rin slice` over the **whole tree** returns only
  **sense-E** hits and **meta-document naming uses** (this doc + ADRs 131–135) — each
  classifiable against the D6 inventory. No sense-D and no dated-history survivor is permitted.
- **No provenance / no suppression:** the touched skills/code carry no phase/ADR/backlog
  numbers and no lint-silencing directive (this doc + ADRs hold the narration).
- **Property/round-trip lens:** the lint regex is a matcher; the mktemp probe above *is* the
  round-trip check (heading `## Part` ⇒ accept; heading `## Slice` ⇒ reject) and pins the
  matcher's anchoring (prefix-match, number-optional) so the rename preserves it.

## Out of scope

- **Sense E (`Array.prototype.slice`, `string.slice`, `process.argv.slice`, the English verb).**
  Not craft vocabulary; a blanket substitution would corrupt code. **Hard out** — the one
  carve-out that survives the maximal rename. Concrete preserved sites include
  `engine/src/memory.js:482/525/590`, `skills/run/SKILL.md:156/158/162/289`, and
  `docs/adapters/memory.md:91/107`.
- **The P24 meta-documents** (`docs/DESIGN-P24-rename-slice-vocabulary.md` and ADRs **131–135**).
  They *name the old term "slice"* to describe what is being renamed; those naming uses are
  PRESERVED. **Hard out** — sweeping them would corrupt the record of the rename itself.
- **Any runtime behavior change.** Pure rename; the pipeline, gates, agents, memory, and
  resolution *semantics* are identical pre/post. No new module, no new mechanism, no descriptor
  or memory-engine *logic* change — only key/id/string literals and data-table entries move.
- **Adding a back-compat alias for the agent id** (ADR-132: no alias). No external consumer
  depends on `slice-implementer`; `alias-map.js` stays phase-id-only.
- **`gates.slice` placeholder substitution.** None exists in the live pipeline; nothing to
  rewire (fact 2) — only the schema member name flips.
