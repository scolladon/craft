# Design — clear backlog candidates + condition-gated items

> Brief: discharge the one promoted *Candidate phase* (resolve-time null-id insert guard)
> and the batch of *Parked → Condition-gated* follow-ups (NO-OP token family, two
> behavior-preserving refactors, mutation-scope guard, structured DoD, realpath hardening,
> memory hardening, structure lints, built-in backlog adapter, init hardening, bats→node
> migration go/no-go) as 14 items in workstreams A–K, each landing as its own atomic commit.
> Status: draft → self-reviewed ×3 → accepted

## Context

Craft is a hexagonal Claude-Code feature-delivery engine (`pipeline/default.yml` is the SoT
descriptor table; `engine/src/*` is the pure core; `skills/*` are the phase procedures;
`docs/adapters/*` are the port bindings). The PRD program (P0–P16) is complete; P17–P28 are
post-PRD candidates. This change clears the standing backlog of small, scoped follow-ups that
have accumulated under *Candidate phases* and *Parked → Condition-gated* in `BACKLOG.md`.

Prior art that constrains this change:

- **P19 / ADR-100–103** introduced the greppable `NO-OP(<phase>):` token, defined as
  *extensible* to the executing-harness phases. P27 (ADR-148–155) de-specialized the
  `validation`/`architecture` skills onto a generic harness mechanism and, in doing so,
  already rewrote them onto the token (see *Design A* — A1 is found largely already satisfied).
- **P27 / ADR-148–155** banned validation-technique names (`mutation`, `stryker`,
  `dependency-cruiser`) and the VCS-host CLI (`gh`) from every *plugin-defining source*
  (`pipeline/ skills/ agents/ contracts/ templates/ engine/src/ docs/adapters/ docs/DOD.md
  docs/GUIDE-customizing.md README.md`). The durable proof is `test/source-hygiene.bats`
  (scanned-path list + reviewed allowlist). `.claude/`, `examples/`, `scripts/`, `test/`,
  and dated docs are **not** scanned — concrete tools live there (craft dogfoods its own
  mutation technique via the committed `.claude/workflow.md`).
- **P20 / ADR-104–110** shipped a free-text DoD (`docs/DOD.md` / `paths.dod`) folded into
  `validation`, read as *trusted operator input*, evidenced by phase results (never re-run).
- **P22 / ADR-116–123** shipped the advisory `memory` port (`engine/src/memory.js`,
  `docs/adapters/memory.md`) — *never-gating*; deleting the store changes run *cost*, never
  *correctness*.
- **P23 / ADR-124–130** shipped the policy port (`engine/src/policy.js`) with the same
  lexical path-containment idiom as `memory.js`.
- **Nested-insert-fail-loud** (ADR-169–171, `docs/DESIGN-nested-insert-fail-loud.md`): lint
  now rejects the nested `pipeline.insert` shape at exit 2; `resolvePipeline` stays
  permissive (ADR-171 scoped insert-validation to lint-only). The `ok:true`-with-`null`-id
  phantom is the documented *Out of scope* residual this change closes (Design C).
- **The gate** (`scripts/ci.sh`): `node --test` runs over `engine/test/` **twice** (cd'd into
  `engine/`, and from repo root) and both must equal the single `EXPECTED_TESTS=1156` line;
  plus bats `test/` and `EXPECTED_PI_TESTS=202`. New `node:test` files MUST live under
  `engine/test/` to be counted by both passes. `ADR-168` adds a bats guard that the single
  `EXPECTED_TESTS` line stays single.

House style this doc follows: pure immutable engine cores (CQS — query returns errors,
command applies); errors accumulated never thrown; small functions, early returns; bash
structure-linters modeled on `scripts/plan-lint.sh`; bats fixtures modeled on
`test/p10-structure.bats`; no provenance refs in source/test (provenance lives here and in
the PR body only).

## Requirements

When this ships:

1. **A** — every phase that records a no-op uses the unified `NO-OP(<phase>):` token; a
   mechanical guard pins each phase's token spelling so a future edit cannot silently drift it.
2. **B** — `engine/src/manifest.js` is back under the 800-line coding-rule cap via a
   behavior-preserving extraction; the harness-knob duplication is resolved or recorded as an
   evidenced honest no-op. Test counts hold across the refactor (green-by-construction).
3. **C** — `resolvePipeline` refuses (per the chosen verdict) to inject any insert — from
   `pipeline.insert` or folded `extends.phases` — that would yield a descriptor with no valid
   non-empty string `id`, reusing the `validateInsert` error vocabulary.
4. **D** — the per-hunk mutation invocation is documented to emit ONE comma-separated
   `--mutate`, with a mechanical guard pinning that contract, living only where source-hygiene
   permits.
5. **E** — a structured DoD schema lets the auto-checkable criteria be mechanically asserted
   against *actual phase evidence*; the contributor-branch trust model is documented so a DoD
   edit can never soften the bar unobserved.
6. **F** — both path-containment helpers (`containUserPolicyPath`, `resolveStorePath`)
   re-check containment after `realpathSync`, fail-closed on a symlink escape, and correctly
   handle a not-yet-created leaf (ENOENT) and a dangling-symlink leaf.
7. **G** — the memory-hardening edges that clear the bar now are fixed; the rest stay
   documented advisory-cache edges with rationale.
8. **H** — `backlog-lint` / `design-lint` structure linters enforce `BACKLOG.md` /
   design-doc structure, shellcheck-clean and bats-covered.
9. **I** — a first-class, shipped, tested `github-issues` backlog adapter exists, within the
   de-specialization invariant (no new `gh` leak into a scanned source).
10. **J** — the `craft:init` emit→temp→lint→move land sequence is a deterministic,
    unit-testable helper; the other init edges that clear the bar are shipped.
11. **K** — a recorded go/no-go on the bats→`node:test` migration, with rationale, and (if go)
    a staging strategy.
12. Every workstream lands as its own atomic conventional commit; `scripts/ci.sh` is green at
    every commit; `EXPECTED_TESTS` is bumped per-commit by that workstream's exact net-new count.

## Design

Each subsection carries a pre-chewed context block (paths, symbols, signatures) so the planner
partitions without re-exploring. Workstreams are independent commits unless an *Ordering* note
says otherwise (collected in the table at the end).

### A — NO-OP token family

**Context block.** `skills/validation/SKILL.md`, `skills/architecture/SKILL.md`,
`skills/decisions/SKILL.md`, `skills/refactoring/SKILL.md`. Canonical tokens currently present
(verified by grep): `NO-OP(decisions):`, `NO-OP(refactoring):`, `NO-OP(validation):`,
`NO-OP(validation:<technique-id>):`, `NO-OP(architecture):`, `NO-OP(architecture:<technique-id>):`,
`NO-OP(verify):`. Model guard: `test/source-hygiene.bats` (grep-gate), `test/p10-structure.bats`
(skill-heading grep fixtures).

**A1 — already satisfied (honest no-op).** The backlog item assumes `validation`/`architecture`
still record no-ops in the older "no-op with a note" idiom. They do **not**: P27's
de-specialization rewrote both skills onto the `NO-OP(<phase>):` token (and the finer
`NO-OP(<phase>:<technique-id>):` form). A full grep of both skills finds **no** un-tokenized
no-op record line. A1 therefore lands no behaviour change. This is recorded here as an
evidenced honest no-op rather than fabricated work.

**A2 — the live work: a mechanical spelling guard.** Add `test/no-op-token.bats` (bats, in the
unscanned `test/` tree) asserting each phase's exact token literal is present in its owning
skill — one `@test` per token, `grep -qF` for the literal substring. This makes the
grep-symmetry contract self-enforcing (today it is verified only by one-shot greps at
authoring time). Model: `test/p10-structure.bats` heading-presence fixtures. The guard pins
the *spelling*, not the surrounding prose, so legitimate prose edits stay free.

**Net-new node:test:** 0. **New bats:** yes (`test/no-op-token.bats`). **Source-hygiene:** none.

### B — behavior-preserving refactors (EVALUATE)

**B1 — extract `extends-validation` (RECOMMEND: do it now).** `engine/src/manifest.js` is
**895 lines**, over the 800-line coding-rule cap. The condition-gated deferral reason
("`manifest.js` is still under the 800-line max") is no longer true — the trigger has fired.

Context block: the shared leaf `checkFileRef(label, value, fileExists, errors)` (`manifest.js:109–117`,
with helpers `isAbsentPath` `:86`, `toStringArray` `:95`) is consumed by `validatePaths`
(`paths.dod`), `validateScripts`, `validateBacklog` (`backlog.ref`), `validateMemory`
(`memory.ref`), `validateExtendsBacklogAdapters`, the top-level `context` case, and the phases
validators. The `validateExtends*` cluster is `manifest.js:613–826` (`EXTENDS_KEYS`,
`PROFILE_EXECUTION_VALUES`, `validateExtendsPhaseOptionalStrings`, `validateExtendsPhaseEntry`,
`validateExtendsPhaseContract`, `validateExtendsPhaseStringArray`, `validateExtendsPhases`,
`validateExtendsAgents`, `validateExtendsProfileEntry`, `validateExtendsProfiles`,
`validateExtendsBacklogAdapters`, `validateExtends`) — ≈213 lines — plus
`registeredBacklogNames` (`:200–204`, exported; imported by `engine/src/resolve.js:19` and used
by `validateManifest`/`validateBacklog`).

Plan: (1) create `engine/src/manifest-file-ref.js` exporting the shared leaf
(`checkFileRef`, `isAbsentPath`, `toStringArray`); `manifest.js` imports them. (2) create
`engine/src/extends-validation.js` exporting `validateExtends` (+ its private helpers,
`EXTENDS_KEYS`, `PROFILE_EXECUTION_VALUES`) and `registeredBacklogNames`, importing the leaf +
`VALID_ARCHETYPES` (`descriptor.js`) + `BUNDLE_VOCAB` (`graph.js`); `manifest.js` and
`resolve.js` re-point their imports of `validateExtends` / `registeredBacklogNames`. No cycle:
neither leaf imports `manifest.js`. Result: `manifest.js` ≈ 650 lines — clears the cap
measurably. Behavior-preserving: existing `engine/test/manifest.test.js` continues to exercise
the moved code through `validateManifest`; test count holds (P24-style green-by-construction).
`registeredBacklogNames`'s move forces re-pointing `resolve.js:19` — call out in the part.

**B2 — single-source the harness-knob schema (RECOMMEND: honest no-op).** The duplication is
real but the trigger has *not* fired and the abstraction is non-trivial:

- `coerceHarnessValue(knob, raw)` (`pipeline-resolve-main.js:60–79`) enumerates
  `passes`/`max_cycles` (int), `convergence` (`'low-only'|'none'`|number), `incremental`
  (bool), `dimensions` (csv→`string[]`).
- `validateHarness` (`manifest.js:455–500`) enumerates `dimensions`, `passes`, `max_cycles`,
  `convergence`, `scope`, `techniques`.

The two sets are **asymmetric**: `incremental` is coerced but not validated (forward-compat
unknown key); `scope`/`techniques` are validated but not CLI-coerced. A clean single-source
map must carry *both* a coercion kind and a validation predicate per knob and reconcile the
asymmetry — more machinery (KISS cost) than the two simple branch chains it would replace. The
backlog's own trigger ("do it when a knob is added or renamed and the duplication bites") has
not fired in this batch; no knob is added/renamed. Recommendation: record an evidenced honest
no-op; revisit when a knob actually changes. (See Decision candidate #1, per-item.)

**Net-new node:test:** B1 = 0 (count-neutral move); B2 = 0. **Source-hygiene:** none.
**Ordering:** B1 restructures `manifest.js`; sequence it before C and E1 (which also touch
`manifest.js`) to avoid a large-file merge.

### C — resolve-time null-id insert guard

**Context block.** `engine/src/edits.js` `applyInserts(descriptors, inserts)` (`:101–140`) —
spreads `{...phaseData}` with no id check; a missing/empty id yields a phantom descriptor with
`id: undefined`. `engine/src/resolve.js` `resolvePipeline` builds
`const allInserts = [...(resolved.pipeline?.insert ?? []), ...foldResult.inserts]` (`:286`)
then calls `applyInserts(foldResult.descriptors, allInserts)` (`:287`). Folded `extends.phases`
with no matching id become inserts (`foldRegisteredPhases`, `resolve.js:230–251`). Existing
sibling pattern to mirror: `checkReorderApplicability(descriptors, reorderList)` (`edits.js:150–168`)
— a pure CQS *query* returning `string[]`, consumed by an early-return in `resolvePipeline`
(`:290–302`) that surfaces prior records. Vocabulary to reuse: `validateInsert`
(`manifest.js:363–382`) emits `pipeline.insert[${label}].id must be a non-empty string`;
`insertLabel` helper (`manifest.js:347–354`) builds the `<label>` from `id ?? after ?? before ?? index`.

Design (RECOMMEND: fail-closed — Decision candidate #6): add a pure query
`checkInsertApplicability(inserts)` to `edits.js`, mirroring `checkReorderApplicability`:
for each insert entry, when `typeof ins.id !== 'string' || ins.id.trim() === ''`, push the
canonical message. To single-source the message, export `insertLabel` and a tiny
`insertIdError(label)` builder from `manifest.js` and import them into `edits.js` (no cycle —
`manifest.js` does not import `edits.js`, and `edits.js` is imported only by `resolve.js`;
planner: confirm no transitive `manifest.js → … → edits.js` edge, else place the query in
`resolve.js`, which already imports `manifest.js`). In `resolvePipeline`, run the query on `allInserts`
immediately before `applyInserts`; on non-empty errors return
`{ ok: false, errors, effective: [], record: [...enableResult.records], gateDecisions: [], waivers: [] }`
— consistent with the reorder/strand/graph early-returns (records computed so far surfaced,
`effective` empty). This covers both `pipeline.insert` and folded `extends.phases` paths and is
the defense-in-depth residual ADR-171 left open; it does **not** revert ADR-171's lint-only
scope (lint stays the primary gate; this is a minimal resolve-time floor for the null-id
phantom specifically). New ADR (172) records the resolve-time guard.

**Net-new node:test:** ≈8 (`edits.test.js`: missing-id, empty-id, whitespace-id, non-string-id,
valid-id-passes, multi-insert mixed; `resolve.test.js`: pipeline.insert path returns ok:false
with prior records, folded extends.phases path returns ok:false). **Source-hygiene:** none.
**Ordering:** after B1 (shares `manifest.js` — exports `insertLabel`).

### D — mutation-scope guard (one comma-separated `--mutate`)

**Context block.** Craft dogfoods its mutation technique via `.claude/workflow.md`
(frontmatter `phases.validation.harness.techniques: [{ id: mutation, run: "npm --prefix
engine run mutation", … }]`). The validated finding lives in advisory memory
(`.claude/craft-memory.md:59`): "a weak `includes(", ")` passes on an incidental message comma —
assert a real adjacent list-pair to actually pin a separator." `test/source-hygiene.bats`
`CLASS_A_PATTERN` bans `mutation|mutant|stryker|…` in **scanned** sources; `.claude/` and
`test/` are NOT scanned.

**Correction to the brief (source-hygiene tension).** The brief points the guard at
`skills/validation/SKILL.md`. That is now *wrong*: P27 made that skill technique-agnostic, and
the words `mutation`/`mutant` would trip `CLASS_A`. The mutation invocation is documented in
`.claude/workflow.md` (the dogfood consumer manifest), and that is where the single-`--mutate`
contract belongs.

Design: (1) extend `.claude/workflow.md` prose with the contract — *per-hunk scopes emit ONE
combined `--mutate "fileA:r1,fileB:r2"` (two separate `--mutate` flags silently drop all but the
last, faking a clean score); assert the instrumented mutant count is plausible (≥ the
adjacent-hunk count) before trusting a green*. (2) add `test/mutation-scope.bats` (unscanned
`test/`, may name `--mutate`/mutation freely — `source-hygiene.bats` itself does) pinning that
`.claude/workflow.md` carries the combined-`--mutate` contract sentence, so the guidance cannot
silently vanish. The guard is documentation-pinning by construction; craft has no
mutation-assembling *script* (the LLM assembles the flag per the manifest), and adding one would
re-couple the engine to mutation against P27's grain.

**Net-new node:test:** 0. **New bats:** yes (`test/mutation-scope.bats`). **Source-hygiene:**
sensitive — vocabulary confined to `.claude/workflow.md` + `test/` (both unscanned); **no
allowlist change**, and nothing mutation-named enters a scanned source.

### E — Definition-of-Done family (DC-5 v2 + contributor-branch trust) — SECURITY

**Context block.** `paths.dod` is validated as a file-ref by `validatePaths`
(`manifest.js:171–174` → `checkFileRef`). `docs/DOD.md` is free-text durable criteria.
`skills/validation/SKILL.md` Preamble step 2 reads the DoD *verbatim as trusted operator input*,
asserts per-criterion, evidences engineering criteria by reading `gates.phase` + technique
results (never re-runs), escalates an unmet criterion as a blocker. `docs/DOD.md:3–4` already
says "reads this file verbatim and records a per-criterion outcome."

This is the security-sensitive workstream; both halves are *decisions*, presented as Decision
candidate #2. The design space (recommendations marked):

**E1 — DC-5 v2 schema shape.** Options:
- *(2a) RECOMMEND — optional structured sidecar at `paths.dod`.* Keep `paths.dod` pointing at a
  file; allow that file to carry YAML frontmatter `criteria: [{ id, kind: auto|judgment,
  text, assert?: { gate?: <phase-id>, file-exists?: <path> } }]` with the markdown body as the
  human rendering (mirrors the memory store's frontmatter-authoritative shape). Free-text DoD
  (no frontmatter) stays valid (back-compat). A new pure `engine/src/dod.js` `parseDod(content)`
  → `{ criteria: [...] }|null` (never throws; advisory parse) plus `validateDodCriteria` folded
  into `validatePaths`. The `validation` skill, when criteria are structured, asserts each
  `kind:auto` criterion *only* against the engine's recorded evidence for the named
  `assert.gate` phase / a real `file-exists` check — never by running a command the DoD names.
- *(2b) new top-level `dod:` manifest key* with inline structured criteria. More discoverable,
  but duplicates `paths.dod`, grows `TOP_KEYS`, and puts criteria in the manifest rather than a
  reviewable standalone artifact.
- *(2c) keep free-text; no schema.* Honest deferral (the backlog's "build only once free-text
  proves the surface"). Cheapest, but leaves auto-criteria un-mechanized.

**E2 — contributor-branch trust model.** Options:
- *(3a) RECOMMEND — claims-to-verify, evidence-bound, no new mechanism.* Document (in
  `docs/adapters/` validation prose + `docs/DOD.md` reference) that asserting agents treat every
  DoD criterion as a *claim to verify against phase evidence*, never ground truth; an
  `kind:auto` criterion is satisfied only by the engine's own gate/file evidence (so a DoD edit
  pointing `assert.gate` at a no-op cannot soften the bar — the engine asserts against the gate
  it actually ran, identified by phase-id, not an arbitrary command string); DoD content is part
  of the reviewed diff. This is exactly the security crux the structured schema must respect:
  **`assert.gate` names a phase whose result the engine recorded, not a command to execute.**
- *(3b) trusted-path flag* — honor structured criteria only when the DoD file is unchanged vs
  the default branch (a `git diff` check); contributor edits degrade to free-text/claims.
  Stronger, but adds VCS coupling and a maintainer-checkout assumption.
- *(3c) signed/provenance DoD.* Out of proportion for an advisory bar.

The recommended pairing (2a + 3a) makes auto-criteria mechanical *and* injection-safe by binding
them to engine-recorded evidence by phase-id, with zero new trust mechanism.

**Net-new node:test (under 2a):** ≈25 (`engine/test/dod.test.js`: parse free-text→null, parse
structured, malformed-frontmatter→null/advisory, kind/assert validation, gate/file-exists
shapes; `manifest.test.js`: `validateDodCriteria` accept/reject cases). **Source-hygiene:**
none. **Ordering:** after B1 (adds to `manifest.js`/`validatePaths`).

### F — realpath-harden the path-containment helpers — SECURITY

**Context block.** Two symmetric *lexical* containment helpers, both doing `resolve()` +
`startsWith(root + sep)`: `engine/src/policy.js` `containUserPolicyPath(root, path)` (`:176–181`)
and `engine/src/memory.js` `resolveStorePath(repoRoot, ref)` (`:37–42`). Call sites:
`pipeline-resolve-main.js:204` (user policy `~/.claude/craft-policy.md`); `memory.js`
`load`/`save` (`:200`, `:601`, default ref `.claude/craft-memory.md`). Both return `null` on
escape today; callers treat `null` as "no store" / "no user scope".

**Empirically pinned** (probe run in a `mktemp` throwaway, `node:fs realpathSync` on
Darwin 25.5.0):

| case | input | `realpathSync` result | lexical says | real says |
|---|---|---|---|---|
| symlink dir inside root → outside | `root/escape/real.md` (escape→`/outside`) | resolves to `/outside/real.md` | contained | **escaped** |
| realpath of escaped parent dir | `realpathSync(dirname(root/escape/new.md))` | `/outside` | — | **escaped** |
| non-existent leaf (no symlink) | `root/sub/doesnotexist.md` | **throws ENOENT** | contained | n/a |
| root itself | `root` | `root` | contained | contained |
| dangling symlink leaf (target absent) | `root/leaflink` → `/outside/secret.md` | **throws ENOENT** | contained | n/a |

Conclusions the design must honor: (i) lexical containment *misses* a symlink-dir escape that
realpath catches; (ii) the store leaf may not exist yet, so the full path cannot be
realpath'd (ENOENT) — must realpath the deepest *existing* ancestor; (iii) a *dangling* symlink
leaf also throws ENOENT, so realpath-of-parent alone would accept it — an `lstat` leaf guard is
required to fail-closed on a symlink leaf.

Design (RECOMMEND: fail-closed — Decision candidate #3): extract a shared
`containByRealpath(root, target)` (a new small leaf, e.g. `engine/src/contain.js`, imported by
both helpers — honors "deliberately symmetric, harden them together"):
1. `lexRoot = resolve(root)`, `lexTarget = resolve(target)`; lexical pre-check (cheap reject) as
   today.
2. `realRoot = realExistingPrefix(lexRoot)`, `realTarget = realExistingPrefix(lexTarget)` where
   `realExistingPrefix(p)` walks up via `realpathSync`, catching `ENOENT`, until it resolves the
   deepest existing ancestor; re-check `realTarget === realRoot || realTarget.startsWith(realRoot + sep)`;
   on miss → `return null`.
3. **Leaf guard:** if `lexTarget` exists as a symlink (`lstatSync(lexTarget).isSymbolicLink()`,
   guarded for ENOENT), `return null` — closes the dangling-symlink-leaf vector.
4. Return `lexTarget` (the caller reads/writes the lexical path; containment is proven on the
   real ancestors).

Both helpers delegate to it; `null` continues to mean "no store"/"no user scope" (fail-closed,
no behaviour change for legitimate paths). Errors other than ENOENT from `realpathSync`/`lstatSync`
are caught and treated as fail-closed `null` (handle, never swallow-silent; the caller's
`null`-path records a load/policy note). New ADR records the realpath floor.

**Net-new node:test:** ≈12 (`policy.test.js` + `memory.test.js`: symlink-dir escape→null,
not-yet-created leaf→accepted, dangling-symlink leaf→null, valid path→accepted, root-itself,
non-ENOENT error→null; shared `contain.test.js` for `containByRealpath`/`realExistingPrefix`).
**Source-hygiene:** none. **Ordering:** pair with G (both edit `memory.js`); sequence F→G.

### G — repo-local memory hardening (EVALUATE)

**Context block.** `engine/src/memory.js`: `load`/`applyValidators` (`:199–246`), `reconcile`/
`reconcileConcern` (`:404–441`), `evictToCaps`/`exceedsCaps`/`selectVictim`/`flattenEntries`
(`:453–565`), `KEY_FIELDS`/`entryKey` (`:265`, `:339`). All bounded by the advisory-cache
premise (worst case wasted cost, never wrong correctness).

Per-item evaluation (recommendations):
- **(b) content whitelist reject-at-write + schema lint — NO-OP (document).** No leak observed
  in practice; the backlog gates this on "if non-mechanical content ever leaks." Trigger not
  fired.
- **(c) load-time dedupe of same-key entries — RECOMMEND: do it now.** `reconcileConcern`
  decays/refreshes each existing entry independently; a hand-edited store with two same-`entryKey`
  entries keeps both (the write surface normally maintains uniqueness, but load does not enforce
  it). Add a load-time collapse in `applyValidators` (or a `dedupeByKey` step keyed by
  `entryKey(concern, entry)`, keeping the highest-confidence entry; ties → newest provenance).
  Small, mechanical, testable; hardens the load path that F also touches.
- **(d) `evictToCaps` O(n²) cap-shrink — NO-OP (document, YAGNI).** `exceedsCaps` re-serializes
  per drop; only bites when lowering a cap on an already-large store. Bounded by `WINDOW=50` /
  default `maxEntries=1000`. Defer per the backlog's YAGNI note.
- **(e) run-over-run measurement smoke — NO-OP (document) / optional.** An on-demand
  load→save→metrics smoke proves the improvement loop; low-risk but test-infra, not hardening.
  Defer unless cheap to fold into F/G's test additions.

**Net-new node:test:** ≈6 (`memory.test.js`: two same-key entries collapse to one, highest
confidence wins, tie→newest, no-dupe input unchanged, cross-concern not collapsed).
**Source-hygiene:** none. **Ordering:** after F (both edit `memory.js` load path).

### H — `backlog-lint` / `design-lint` structure linters

**Context block.** Model: `scripts/plan-lint.sh` (awk, required-heading presence, exit 2 on
violation) and `scripts/manifest-lint.sh`. `templates/backlog.md` (shipped P4) defines the
target structure (`## Status at a glance`, `## Done`, `## Next`, `## Then`, `## Deferred /
parked`, `## Notes` + the `SoT —` pointer line + `Surface gate` line). Design-doc structure is
`templates/design.md` (`## Context`, `## Requirements`, `## Design`, `## Decision candidates`,
`## Test strategy`, `## Out of scope`). `scripts/ci.sh:44` shellchecks `scripts/*.sh`; bats
fixtures live under `test/` with `test/fixtures/`.

**Correction to the brief (B→H coupling does not hold).** The brief says "if B extracts
checkFileRef into a shared module, build H on it." `checkFileRef` is a *JS manifest file-ref
existence* validator; H is *bash markdown-structure* linting (heading presence), a different
layer. H reuses nothing from B and is independent of B's landing order. Build H as awk
structure-linters in the house style of `plan-lint.sh` (consistent, shellcheck-clean), not as a
JS validator.

Design: `scripts/backlog-lint.sh <file>` and `scripts/design-lint.sh <file>` — awk required-
heading checks (parameterized `REQUIRED="…"` like `plan-lint.sh`), exit 2 + diagnostic on a
missing section, exit 0 with a count summary on pass. `test/backlog-lint.bats` /
`test/design-lint.bats` with good/bad fixtures under `test/fixtures/`. Wire both into
`scripts/ci.sh:44` (append to the shellcheck + lint chain). Scope note: structure-only (heading
presence/order), not content — keep the linters as thin and deterministic as `plan-lint.sh`.

**Net-new node:test:** 0. **New bats:** yes (2 files + fixtures). **Source-hygiene:** none
(`scripts/` unscanned). **Ordering:** independent.

### I — first-class `github-issues` backlog adapter

**Context block.** `docs/adapters/backlog.md` says valid sources are exactly `{ file, custom }`;
`github-issues`/`jira`/`linear` are documented *custom recipes*, rejected as `backlog.source`
with a targeted hint. `manifest.js` `NON_BUILTIN_TRACKERS = {github-issues, jira, linear}`
(`:193`); `validateBacklog` (`:213–248`) accepts `BACKLOG_SOURCES` (`{file,custom}`) plus
`adapterNames` from `registeredBacklogNames(extends)`. P14's `extends.backlog-adapters` surface
registers a named source via a plugin; `resolve.js` `buildManifestRecords` (`:202–207`) already
emits a record for a registered backlog source. The gh recipe is **empirically pinned** in
`docs/adapters/backlog.md:57–67` (gh 2.93.0, authed; `issue view --json title,body` confirmed;
`close --comment/--reason` confirmed; complete path not exercised live — closing an issue is a
real side-effect, and a live `gh issue close` round-trip is explicitly *Closed — won't-do* in
the backlog). This design reuses that pinned matrix rather than re-mutating a tracker.
Source-hygiene already allowlists `engine/src/manifest.js:.*github-issues` and the
`docs/adapters/backlog.md` gh recipe.

Decision candidate #4 options:
- *(4a) native built-in source* — add `github-issues` to `BACKLOG_SOURCES`, ship a gh-wrapping
  runner. Reverses P27's de-specialization grain (re-introduces a tracker-specific source +
  needs a `gh` *runner* home in a scanned surface); needs an ADR to justify reversing
  ADR-148–155. Not recommended.
- *(4b) RECOMMEND — shipped, tested adapter via P14 `extends.backlog-adapters`.* Ship
  `examples/backlog-github-issues/` (a derived-plugin manifest registering
  `extends.backlog-adapters: [{ name: github-issues, ref: ./resolve.sh }]` + the `resolve.sh`
  custom resolver wrapping `gh` with an argv array + id-form allowlist `^#?\d+$`). The named
  source `github-issues` then resolves through the existing `registeredBacklogNames` path
  (`backlog: { source: github-issues, ref: <id> }`) — first-class *feel* (a named source), zero
  engine change, `gh` confined to `examples/` (unscanned). Add it to `examples/README.md`,
  `docs/GUIDE-customizing.md`, and `examples-lint.bats`.
- *(4c) plain custom recipe script in `examples/`* — simplest, but no named source (stays
  `source: custom`). Less "first-class."

Recommend 4b: it is what P14's adapter surface was built for, gives a named built-in without an
engine schema change, and adds **no** source-hygiene allowlist entry.

**Net-new node:test (under 4b):** ≈2 (a resolve.js/manifest assertion that the registered
`github-issues` adapter name resolves as a valid source; most coverage is `examples-lint.bats`).
**New bats:** yes (extend `examples-lint.bats`). **Source-hygiene:** none new under 4b (gh in
`examples/` + the already-allowlisted recipe). **Ordering:** independent (4b touches no engine
core); under 4a only, sequence after B1.

### J — interactive generator hardening

**Context block.** The land sequence lives in `skills/init/SKILL.md` Steps 2–4 (prose):
emit (`engine/bin/init-emit.js`) → `mktemp ".claude/.craft-${name}.tmp.XXXXXX"` → temp-lint
(`scripts/manifest-lint.sh`) → land (`mv` atomic). Pure cores: `engine/src/init-emit.js`
(`emitManifest`, `joinManifest`), `engine/src/init-config.js` (`resolveConfigPath`, kebab
guard). Bins under `engine/bin/`. Review noted the move-gate is prose-only.

Per-item evaluation (recommendations):
- **(c) deterministic land helper + executable test — RECOMMEND: do it now (the clear win).**
  Add `engine/src/init-land.js` `land({ tmpPath, finalPath }, deps)` — a pure-ish core: run the
  injected `lint(tmpPath)`; on exit 0, `deps.rename(tmpPath, finalPath)` and return
  `{ ok: true, path: finalPath }`; on non-zero, return `{ ok: false, errors }` and never move
  (handle-or-return, never swallow). Bin `engine/bin/init-land.js` taking the validated temp +
  final paths as argv. The init skill calls the bin instead of inline prose. Makes the
  lint-then-move gate deterministic and unit-testable (closes the review finding).
- **(d) shipped `examples/named-config/` + on-demand smoke — RECOMMEND: cheap companion.** Mirror
  the SC5 second-instantiation smoke: `craft:init` → `/craft:run --config <name>` proving the
  generate→consume loop. Low cost; folds the example into `examples-lint.bats`.
- **(a) headless/answer-file interview mode — NO-OP (defer).** Feature-sized; ship when a
  concrete non-Claude onboarding need exists (trigger not fired).
- **(b) merge-into-existing named config — NO-OP (defer).** Precedence-aware frontmatter
  reconciliation is its own feature.

**Net-new node:test:** ≈14 (`init-land.test.js`: lint-pass→moves, lint-fail→no-move+errors,
rename-throws→error-not-swallowed, idempotent path; `init-land.bin.test.js`: argv parse, exit
codes). **New bats:** yes (extend `examples-lint.bats` for (d)). **Source-hygiene:** none.
**Ordering:** independent.

### K — bats → `node:test` migration (EVALUATE-FIRST go/no-go)

**Context block.** 12 bats files under `test/` (`archetype-inference`, `detect-ecosystem`,
`examples-lint`, `hermetic-suite`, `hooks`, `manifest-lint`, `p10-structure`, `p20-dod`,
`p22-memory`, `smoke`, `source-hygiene`, `worktree`). Many assert *real shell-process*
behaviour of `scripts/*.sh` and `hooks/*.sh` (worktree setup/teardown, ecosystem detection,
git hooks). `scripts/ci.sh:44` runs `bats test/`. The `EXPECTED_TESTS` double-count guard
(`ci.sh:10–34`) + the ADR-168 single-line bats guard couple to the node:test surface.

Go/no-go (RECOMMEND: **defer / honest no-op** — Decision candidate #5). Rationale:
- bats gives *native* shell-behaviour fidelity for the worktree/hook/ecosystem suites — the
  whole point of those tests. A `node:test` + `child_process` port can match it only by
  re-implementing `run`/`assert` ergonomics, with **no fidelity gain** and real fidelity *risk*
  in the real-process assertions.
- The trigger is "user-requested, portability" and condition-gated on the trigger firing; no
  portability pain (a platform lacking bats) has actually bitten.
- It is large (12 files, hundreds of assertions) and mixing a big test-infra migration into a
  backlog-clearing batch violates atomic-commit hygiene; it also entangles the `EXPECTED_TESTS`
  count guard.
- *If* the user elects to do it: **incremental** (port one bats file at a time behind a parallel
  `node:test`, keep bats green until per-file parity, then flip `ci.sh`), **never all-at-once**
  (a big-bang port risks silent fidelity loss in the worktree/hook real-process assertions).

**Net-new node:test:** 0 under the recommended defer (record the go/no-go + rationale only).
**Source-hygiene:** none. **Ordering:** independent; if undertaken, last (largest, rebases over
every other workstream's `EXPECTED_TESTS` bump).

### `EXPECTED_TESTS` accounting

Each workstream that adds `node:test` files bumps the single `EXPECTED_TESTS` line
(`scripts/ci.sh:10`, currently `1156`) in its own commit by its exact net-new count (the planner
pins the precise number; estimates below). Under the recommended option per decision: A 0, B1 0,
B2 0, C ≈8, D 0, E ≈25, F ≈12, G ≈6, H 0, I ≈2, J ≈14, K 0 → if every recommended-build item
ships, `1156 → ≈1223`. The exact total is conditional on Decision candidates #1 (B), #2 (E
schema), #4 (I option), #5 (K).

## Decision candidates

| # | Choice | Alternatives (≤3) | Recommendation | Why |
|---|---|---|---|---|
| 1 | **B — do the two refactors now or honest-no-op?** (per item) | B1: (a) extract now; (b) defer. B2: (a) single-source now; (b) honest no-op | **B1 = extract now; B2 = honest no-op** | `manifest.js` is 895 > 800 (B1 trigger fired; ≈213-line extract clears it, behavior-preserving). B2's trigger ("a knob is added/renamed") has not fired; the coerce/validate knob sets are asymmetric, so a clean single-source costs more (KISS) than the duplication it removes. |
| 2 | **E — DC-5 v2 DoD schema shape AND contributor-branch trust model** (security, coupled) | Schema: (2a) optional structured sidecar at `paths.dod`; (2b) new top-level `dod:` key; (2c) keep free-text, no schema. Trust: (3a) claims-to-verify bound to engine-recorded gate evidence by phase-id; (3b) trusted-path (diff-vs-default-branch) flag; (3c) signed DoD | **2a + 3a** | 2a keeps back-compat (free-text stays valid) and a reviewable standalone artifact; 3a makes auto-criteria mechanical *and* injection-safe with zero new trust mechanism — `assert.gate` names a phase whose result the engine recorded, never a command the (possibly contributor-edited) DoD supplies, so a DoD edit cannot soften the bar unobserved. |
| 3 | **F — symlink escape: fail-closed or warn?** | (a) fail-closed (return `null`, same as current lexical-escape); (b) warn-and-proceed; (c) warn + proceed only for read, fail-closed for write | **Fail-closed** | Matches the existing `null`-on-escape contract (callers already degrade to "no store"/"no user scope"), the fail-loud direction of the recent insert work, and the user's stated lean. A symlink escaping a fixed root is never a legitimate craft path. |
| 4 | **I — github-issues: full built-in vs promote the recipe** | (4a) native `BACKLOG_SOURCES` source + gh runner; (4b) shipped+tested adapter via P14 `extends.backlog-adapters` (named source, gh in `examples/`); (4c) plain custom recipe script in `examples/` | **4b** | Gives a first-class *named* `github-issues` source through the surface P14 built for it, with zero engine schema change and `gh` confined to unscanned `examples/` — no de-specialization regression (4a would reverse ADR-148–155 and need a gh runner in a scanned source) and no new source-hygiene allowlist entry. |
| 5 | **K — migrate bats now or defer; if now, all-at-once vs incremental** | (a) defer / honest no-op; (b) migrate now incrementally; (c) migrate now all-at-once | **Defer (honest no-op)** | bats gives native real-process fidelity for the worktree/hook/ecosystem suites with no gain from a JS port; the portability trigger has not bitten; a large migration violates atomic-batch hygiene and entangles the `EXPECTED_TESTS` guard. If forced: incremental only (per-file parity behind parallel `node:test`, then flip `ci.sh`) — never big-bang. |
| 6 | **C — resolve-time null-id guard: fail-closed or drop-and-record?** | (a) fail-closed (`resolvePipeline` → `ok:false`, errors[], prior records surfaced); (b) drop the bad insert and push a record line, continue ok:true | **Fail-closed** | Consistent with every other `resolvePipeline` early-return (reorder/strand/graph/role) and the ADR-169/170 "reject nested insert — fail loud" direction; a null-id phantom is a malformed manifest, not a recoverable nicety. Reuses the `validateInsert` vocabulary (`pipeline.insert[<label>].id must be a non-empty string`). |

> Designer evaluations (clears-the-bar judgments, the refactoring/hardening no-op convention —
> overridable by the user but not user-forks): **G** ship (c) load-time dedupe now; document
> (b)/(d)/(e). **J** ship (c) land helper now + (d) example/smoke; defer (a)/(b). **A** A1 is an
> evidenced honest no-op (already satisfied by P27); A2 (spelling guard) is the live work.

## Decision outcomes (resolved — folded back, authoritative)

Resolved with the operator; captured as ADRs 172–177. Where an outcome differs from a
per-workstream RECOMMEND note above, **this block wins**.

| # | Workstream | Resolved | ADR |
|---|---|---|---|
| 1 | B refactors | B1 extract now; B2 honest no-op | 173 |
| 6 | C null-id guard | fail-closed (`ok:false`) | 172 |
| 3 | F path-containment | fail-closed (return `null`) | 175 |
| 2 | E DoD DC-5 v2 | structured sidecar at `paths.dod` + criteria verified against engine-recorded gate evidence (2a+3a) | 174 |
| 4 | I github-issues | tested adapter via `extends.backlog-adapters`, host CLI in unscanned `examples/` (4b) | 176 |
| 5 | K bats→node:test | **migrate now, all-at-once** — *operator override of the designer's defer recommendation* | 177 |

Non-fork designer dispositions adopted: **G** ship load-time dedupe now, document (b)/(d)/(e);
**J** ship land helper + example now, defer headless/merge; **A** A1 no-op (done), A2 is live.

### Harness-strategy override (consequence of K = all-at-once)

Because the bats suite is being ported to `node:test` in this batch, **no new bats files are
created**. The harness splits cleanly:

- **Engine-src unit tests → `engine/test/*.test.js`** (counted twice by `EXPECTED_TESTS`):
  C, E, F, G, and any new B1-module unit tests. Path-independent (no repo-relative file reads),
  since this suite runs from both `engine/` and repo-root cwd.
- **Process / file-grep tests → `test/*.test.js`** (the new repo-root `node:test` run that
  *replaces* `bats test/`, guarded by its own single-asserted `EXPECTED_PROC_TESTS`): A2 (was
  `test/no-op-token.bats` → `test/no-op-token.test.js`), D (was `test/mutation-scope.bats` →
  `test/mutation-scope.test.js`), H (`test/backlog-lint.test.js`, `test/design-lint.test.js`),
  I (`examples-lint` → `test/examples-lint.test.js` additions), J (named-config example checks).
  These read repo files via a repo-root anchor and run bash scripts via `execFileSync` — same
  fidelity as bats, node:test orchestration.
- **K (last workstream)** ports the **12 existing** `test/*.bats` → `test/*.test.js` and rewires
  `scripts/ci.sh:44` (`bats test/` → `node --test 'test/**/*.test.js'` + `EXPECTED_PROC_TESTS`
  guard), removes the bats dev-dep. `shellcheck` and the lint steps stay. Functional workstreams
  A2/D/H/I/J above already write into the `test/*.test.js` surface K standardizes, so K only
  ports the pre-existing 12 and lands the ci.sh rewire + count guard.

`EXPECTED_TESTS` (engine suite) is still bumped per-commit by each engine-src workstream's exact
net-new count. `EXPECTED_PROC_TESTS` (process suite) is introduced by K and reflects the ported
96 `@test` cases + the process tests A2/D/H/I/J added.

## Test strategy

- **A2:** `test/no-op-token.bats` — one `@test` per canonical token literal, `grep -qF` against
  the owning skill. Pins spelling, not prose.
- **B1:** behavior-preserving — existing `engine/test/manifest.test.js` exercises the moved
  `validateExtends*`/`checkFileRef` through `validateManifest`; assert count holds
  (green-by-construction); add focused unit tests for the new modules only if a symbol is
  exported that was previously private.
- **C:** `engine/test/edits.test.js` (query: missing/empty/whitespace/non-string id, valid
  passes, multi-insert mixed) + `engine/test/resolve.test.js` (pipeline.insert and folded
  extends.phases paths return `ok:false` with prior records surfaced, `effective:[]`). The
  `applyInserts`/`resolvePipeline` pair is the round-trip lens.
- **D:** `test/mutation-scope.bats` pins the combined-`--mutate` contract sentence in
  `.claude/workflow.md`.
- **E (2a):** `engine/test/dod.test.js` — `parseDod` free-text→null, structured parse,
  malformed-frontmatter→advisory-null (never throws), kind/assert shape validation; the
  free-text↔structured round-trip is the lens. `manifest.test.js` for `validateDodCriteria`.
- **F:** `engine/test/contain.test.js` (`containByRealpath`/`realExistingPrefix`) + escape cases
  in `policy.test.js` and `memory.test.js`; symlink fixtures built in a `mktemp` throwaway
  inside the test (never the worktree). Edge matrix = the pinned table (symlink-dir escape,
  not-yet-created leaf, dangling-symlink leaf, root-itself, non-ENOENT error).
- **G:** `engine/test/memory.test.js` dedupe cases (collapse same-key, highest-confidence wins,
  tie→newest, no-dupe unchanged, cross-concern not collapsed).
- **H:** `test/backlog-lint.bats` / `test/design-lint.bats` with good + section-missing fixtures
  under `test/fixtures/`.
- **I (4b):** `examples-lint.bats` for the shipped adapter; a manifest/resolve assertion that
  the registered `github-issues` name resolves as a valid source. No live `gh` mutation
  (reuse the pinned matrix in `docs/adapters/backlog.md`).
- **J:** `engine/test/init-land.test.js` (lint-pass→move, lint-fail→no-move+errors,
  rename-throws→error surfaced not swallowed) + `init-land.bin.test.js` (argv/exit codes);
  `examples-lint.bats` for the named-config example.
- **K:** no tests under the recommended defer; the go/no-go record is the deliverable.

All new `node:test` files land under `engine/test/` (counted by both ci passes); each workstream
bumps the single `EXPECTED_TESTS` line in its own commit by its exact net-new count.

## Out of scope

- **A1 behaviour change** — already satisfied by P27; no edit (recorded as an evidenced no-op).
- **B2 harness-knob single-source** — recommended honest no-op (trigger not fired); revisit when
  a knob is added/renamed.
- **G (b)/(d)/(e), J (a)/(b)** — documented advisory-cache edges; defer per the per-item
  evaluation (YAGNI / trigger-not-fired / feature-sized).
- **K bats→node migration** — recommended defer; a go/no-go record only, no port.
- **Live `gh`/Jira round-trip E2E** (I) — a real `gh issue close` mutates a tracker and needs
  CI credentials; explicitly *Closed — won't-do* in the backlog. The adapter is pinned by the
  read-only matrix already in `docs/adapters/backlog.md`.
- **Native `github-issues` source / `gh` runner in a scanned surface** (I option 4a) — a
  de-specialization regression; not pursued under the 4b recommendation.
- **`BACKLOG.md` "Closed — won't-do" and the P0–P16 Status record** — untouched; the later
  documentation phase removes shipped bullets from *Candidate phases* / *Condition-gated*.
- **Governance/contracts** (`contracts/`, the three engine floors) — untouched; no item names
  them.
