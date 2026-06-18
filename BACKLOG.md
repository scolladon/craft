# Craft — Backlog & Roadmap

> Craft is a Claude Code feature-delivery workflow engine being re-architected from a fixed
> 11-phase pipeline into a **customizable, hexagonal engine**: composable phases (skip / insert /
> reorder), strong zero-config defaults, a small invariant core, per-port customization.
>
> SoT — *intent:* `docs/PRD-customizable-engine.md` · *architecture:* `docs/DESIGN-customizable-engine.md`
> · *decisions:* `docs/adr/` · *build script:* `docs/PLAN-customizable-engine.md` · *spikes:* `docs/SPIKE.md`

## Status at a glance

| Phase | What | State |
|---|---|---|
| P0 | Spikes — feasibility + decisions | ✅ done |
| P1 | Characterization net + Node engine core + scenario goldens | ✅ done & green |
| P2 | `manifest-lint` hardened (yq + subset-parser fallback) | ✅ done & green |
| P3 | Rewire the live walk + fold manifest validation into the Node core | ✅ done & green |
| P4 | Generic vocabulary (rename + alias-map wiring) | ✅ done & green |
| P5 | Engine-owned contract injection + DESIGN split | ✅ done & green |
| P6 | Execution topology — `inline\|agent` end-to-end + `solo`/`full`/`lean` profiles + per-invocation args | ✅ done & green |
| P7 | Pipeline editing — `pipeline.reorder` (relative-permutation) + walk verbatim-procedure dispatch + SC3 | ✅ done & green |
| P8 | Per-phase harness config — `harness:` knobs deep-merged + manifest-validated + walk-read; PHASE_FIELDS lint-gap closed | ✅ done & green |
| P8.5 | Rename plugin **forge→craft** + namespace propagation (non-PRD interstitial — branding/productization, **not** a PRD §17 phase; §17 numbering unchanged, P9 still next) | ✅ done & green |
| P9 | Agent/skill swap via manifest — `role:` + new default-phase `procedure:` override + engine `roleExists` guard (seam); S2 hardened walk-level | ✅ done & green |
| P9.5 | Hardening batch (parked-from-P9 + engine/tooling dogfood gaps) — `roleExists` live-probe wired + Stryker stood up (validation runs for real) + `models.fallback` (`sonnet`) & fable→opus + nested-lockfile probe + `node --test` glob+count-assert + decisions interaction prompt + brief-echo trim + review-cadence doc + `contract-assemble` parse fix + planner test-infra carve-out (item-10 forge-era aliasing DROPPED, ADR-045); ADRs 041–047 | ✅ done & green |
| **P10–P16** | **new default phases, NFR matrix, backlog/registration ports, … (+ showcase docs)** | ⬜ **outlined (PRD §17)** |

> ✅ **The engine is now LIVE.** `run/SKILL.md` walks `pipeline-resolve` output (no hardcoded
> 1→11 table); manifest validation has one deterministic Node home (`validateManifest`);
> the contract has one engine home (`contracts/` → `assembleContract`, injected on every run);
> `scripts/ci.sh` green (276 `node --test` + 42 bats). **P3 connected the walk; P4 made the
> vocabulary generic; P5 made the contract engine-owned — agents are thin, a swap can't drop it.**

## Done

### P1 — foundational net + Node core (slices 1–10)
- [x] Test-harness substrate + CI + shellcheck baseline
- [x] Characterize `manifest-lint`, the PreToolUse hooks, the worktree scripts (the SC4 regression net)
- [x] `engine/` Node core: descriptor parse + graph validate + `pipeline/default.yml` (13-descriptor data)
- [x] Alias map · resolver (profile / edits / precedence / strand-refusal) · contract assembly · findings normalizer
- [x] Gate/waiver decision layer + S1–S9 scenario goldens + `pipeline-resolve` CLI
- [x] Public surface frozen — `engine/src/index.js`, 6 exports

### P2 — manifest-lint hardening (slice 11)
- [x] `manifest-lint.sh` parses via `yq`, falls back to the sed/awk subset parser — behavior-preserving (slice-2 net is the guardrail)
  - *(superseded by P3's fold — ADR-012: `js-yaml` is now the single parser; the yq/subset dual-backend was retired)*

### P3 — rewire the live walk; fold manifest validation into Node (slices 1–3; SoT `docs/{DESIGN,PLAN}-P3-orchestrator-rewire.md`, ADRs 009–012)
- [x] `run/SKILL.md` walks `pipeline-resolve` output instead of the hardcoded 1→11 table — skill resolved via the inverse `ALIAS_MAP` bridge (ADR-009; deleted at P4)
- [x] §11 cross-phase invariants generalized **by archetype** (executing-harness-gates-`propose` via `gateDecisions[propose].awaitingHarnesses`; full waiver surfacing incl. read-harness/refinement skips — ADR-005)
- [x] static `PROTECTED` removed — manifest **shape-validation folded into the Node core** (`validateManifest` + `engine/bin/manifest-lint.js`; `scripts/manifest-lint.sh` → thin wrapper; ADR-012)
- [x] run-record emitted from `Resolution.record`; new manifest surface accepted (`pipeline:`/`retrieval:`/`execution:` — ADR-010); legacy per-phase `skip:` rejected loudly with `pipeline.skip` guidance (ADR-011)
- [x] **Surface gate held:** golden `Resolution` byte-identical to pre-P3; SC1 + scenario suite green *by construction*

### P4 — generic vocabulary: rename + alias-map wiring (slices 1–4; SoT `docs/PLAN-P4-vocabulary.md`, ADRs 013–014)
- [x] `validateManifest` canonicalized — `PHASE_NAMES` is the concern set; manifest phase keys resolve through the shared `resolveAlias` **before** membership (DC-4, one alias home), so old (`branch`) and new (`workspace`) both validate; `MODELS_KEYS` → `validation-triager`
- [x] 9 skill dirs renamed to concern names (`branch→workspace` … `merge→integrate`); the P3 inverse-`ALIAS_MAP` bridge in `run/SKILL.md` deleted — `skill dir == phase.id`, the walk invokes `craft:<phase.id>` with no translation table (ADR-009 retired)
- [x] `mutation-triager` agent → `validation-triager` (closes the descriptor's dangling `role:` pointer); `models.mutation-triager` rejected loudly with rename guidance (ADR-013); `plugin.json` + `README` old-name sequences swept
- [x] `templates/backlog.md` added (ADR-014); alias-resolution fixture in the slice-2 bats suite — a NEW-name manifest and `valid-basic` (OLD names) both lint clean
- [x] **Surface gate held:** golden `Resolution` byte-identical (`pipeline/default.yml` untouched); SC1 + scenario + `manifest-lint.bats` green by construction (210 `node --test` + 42 bats)

### P5 — engine-owned contract injection + DESIGN split (slices 1–5; SoT `docs/{DESIGN,PLAN}-P5-contract-injection.md`, ADRs 015–019)
- [x] `contracts/{core,producer,construction,harness-read,harness-exec,delivery,refinement}.md` authored (the real invariant store) + `contracts-lint` (7 present, non-empty, no `retrieval`, names ⊆ vocab) wired into `ci.sh` (ADR-003/016)
- [x] **6th `refinement` bundle** (DC-15 / ADR-015 — the override): `BUNDLE_VOCAB`→7, `refactoring.contract:[refinement]`; every archetype's invariants are now engine-owned (a swapped refactor agent can't drop "behavior-preserving" either)
- [x] `assembleContract` wired into the walk via `engine/bin/contract-assemble.js` (`run/SKILL.md` step 3 — pure core stays I/O-free, `Resolution` byte-identical so SC1 holds); the **deterministic R8 block-equivalence guard** replaces the nondeterministic agent-output diff (ADR-018)
- [x] 8 `agents/*.md` **fully thinned** to identity + craft (ADR-017); no invariant text duplicated between `contracts/` and `agents/` (the engine injects it — a swap can't drop it, G5 closed)
- [x] `normalizeFindings` wired for review output via `engine/bin/normalize-findings.js` (R10 — consumers key on fields, not JSON-vs-per-line layout; ADR-019); `findings.js` `LINE_PATTERN` hardened against ReDoS (review)
- [x] `DESIGN.md → DESIGN-history.md` (ADR-007) — pure relabel (old vocab = correct-as-history); living SoT is `DESIGN-customizable-engine.md`
- [x] **Surface gate held:** R8 deterministic per-phase block-equivalence; inline swaps exactly the two carve-out lines; `pipeline/default.yml` changed only `refactoring.contract` (resolver untouched, SC1 + scenarios green); 7-export surface unchanged; CI green at every commit (276 `node --test` + 42 bats)

### P6 — execution topology (slices 1–5; SoT `docs/{DESIGN,PLAN}-P6-execution-topology.md`, ADRs 020–023)
- [x] **`lean` profile + per-archetype expansion** (ADR-021): `expandProfile` returns a per-archetype `execution` map (was a binary `{defaultExecution, harnessStaysAgent}`); `applyProfileToArchetype` forces `harness→agent` **unconditionally** (the SP1 parallelism caveat is now structural, not per-map); closed vocab `solo\|full\|lean`; solo/full byte-identical (S1/SC1 green). Profiles are **derivable sugar** — `lean ≡ execution: inline + phases.{implementation,refactoring}.execution: agent`
- [x] **Per-invocation args** (ADR-022): `engine/src/cli-overlay.js` (`applyCliOverlay`, pure) + `pipeline-resolve.js` `--profile`/`--skip` flags merged at highest precedence (CLI > manifest); unknown flags rejected; `resolvePipeline` + 7-export surface + `pipeline/default.yml` untouched
- [x] **Inline dispatch in the walk** (ADR-020): `run/SKILL.md` step 4 — an inline phase runs in-thread (no Task spawn), loading the injected `--inline` block **and** the local `agents/<role>.md` craft (the two artifacts a spawn carries), so inline fidelity = agent fidelity modulo the two carve-out lines; step 0a/1b parse + forward `--profile`/`--skip` from `$ARGUMENTS`, non-flag remainder = brief
- [x] **Robust manifest parsing** (review-surfaced, pre-P3 latent): shared `engine/src/frontmatter.js` — `pipeline-resolve` now parses a real frontmatter+body `.claude/workflow.md` (was raw `load()` → crash on the body); CRLF/trailing-space fences, empty-fence→defaults, body excluded from the parser; `manifest-lint` shares the extractor
- [x] **Coverage** (ADR-023): S-lean + S-full scenarios; `profile`/`cli-overlay`/`frontmatter`/bin-CLI unit + integration tests; the inline-fidelity walk check is a documented manual smoke test (`--profile lean`, recorded under `inline-fidelity-check`); `examples/lean-profile/`
- [x] **Surface gate held:** `engine/src/index.js` (7 exports) + `pipeline/default.yml` + `contract.js` + `resolve.js` untouched; S1/SC1/`contract-equivalence` green; harness-stays-agent under solo *and* lean; CI green at every commit (325 `node --test` + 42 bats); 4-dimension review after every code slice, every fix applied

### P7 — pipeline editing (slices 1–4 + 2 prose; SoT `docs/{DESIGN,PLAN}-P7-pipeline-editing.md`, ADRs 024–027)
- [x] **`pipeline.reorder` — relative-permutation** (ADR-024): listed ids' slots refill in the given order, unlisted phases keep position; `applyReorder` (pure command, `edits.js`) + `checkReorderApplicability` (CQS query — unknown/non-enabled/duplicate, ADR-026); `manifest.js` `PIPELINE_KEYS`→4 + named `validateReorder` shape check (DC-C); ends the OQ1/ADR-005 reorder defer
- [x] **Reorder wired in `resolve.js`** between `applyInserts` and `resolveExecution`: `aliasResolve` resolves reorder ids; `checkReorderApplicability` fails fast (surfacing prior-edit records); a consumer-before-producer reorder is refused by the **existing `validatePipeline` graph check** — no duplicate ordering pre-check (ADR-005/026 "same machinery"); per-id `reorder: <id> (pipeline.reorder)` record lines (DC-B)
- [x] **SC3 composed golden** (skip `refactoring` + insert `bench` after `validation` + reorder `[validation, review]`) pinning effective order + record lines + `gateDecisions` (bench gate, `propose.awaitingHarnesses == [validation, bench]`); **S-reorder** positive (full-order pin) + **reorder-refused** negative (graph, not strand) (ADR-027); S3 untouched
- [x] **Walk dispatches `phase.procedure` verbatim** (ADR-025): `run/SKILL.md` step 1 + error-paths table — namespace-agnostic (craft-local or `acme:`); "unknown phase id" STOP → "procedure resolves to no installed skill"; contract injected from the descriptor (G5) for craft-native phases incl. role-swaps; namespaced *registration* (`craft.extends:`) stays P14
- [x] **Surface gate held:** `resolvePipeline` signature + `engine/src/index.js` (7 exports) + `pipeline/default.yml` + `graph.js`/`contract.js` untouched; SC1/S1/S2/S3/S-lean/S-full/contract-equivalence green; reorder/applyReorder are **internal** to `edits.js` (not the public barrel); CI green at every commit (357 `node --test` + 42 bats); 4-dimension review after every code slice + a consistency review on the prose, every fix applied

### P8 — per-phase harness config (slices 1–4; SoT `docs/{DESIGN,PLAN}-P8-harness-config.md`, ADRs 028–031)
- [x] **PHASE_FIELDS honored-set reconciliation** (ADR-028): `manifest.js` `PHASE_FIELDS` extended to the full honored set (`harness`, `execution`, `enabled`, `role`, `model`) — closing a **latent lint bug**: the resolver already honored these (the §7 #4 catalog sample `phases.documentation.execution:inline` and the S2 fixture `phases.planning.role:my:domain-planner` both *failed* `validateManifest` while resolving fine, because scenario tests bypass it). `role`/`model` get string shape checks, `enabled` a boolean check; `execution` is accepted shape-only (value stays owned by `resolve.js`'s `validateExecutionValues` — no duplication)
- [x] **`validateHarness` — typed knobs, unknown sub-keys allowed** (ADR-030): named private fn mirroring `validateReorder` — `dimensions`=list-of-strings, `passes`/`max_cycles`=positive int, `convergence`∈{`low-only`|`none`|finite ≥0}, `tool`/`scope`=string, `incremental`=bool; unknown sub-keys pass (forward-compat for "any harness a repo adds", e.g. `dependency-cruiser`'s `rules:`). Accumulates all errors (no short-circuit)
- [x] **Harness override = one-level deep-merge** (ADR-029): `applyAllowedOverrides` in `edits.js` deep-merges `harness` (override knobs win, unset default knobs survive — `{scope:per-file}` keeps `tool:stryker`) via an `isPlainObject` guard; arrays replace (not union); `role`/`model` stay scalar-replace; pure/immutable
- [x] **Review defaults relocated to data** (ADR-031): `review.harness` added to `pipeline/default.yml` (`dimensions:[code,security,tests,perf]`/`passes:1`/`max_cycles:3`/`convergence:low-only`) — data is now the SoT, the walk reads it with strong fallbacks; golden-safe (no test asserts a descriptor's `harness` value, the P5 precedent)
- [x] **Walk reads the knobs** (session-direct prose): `skills/review/SKILL.md` reads dimensions/passes/max_cycles/convergence; `skills/validation/SKILL.md` reads tool/scope/incremental (before the probe); `skills/run/SKILL.md` step-4 harness rows point at them; `passes>1` fan-out + numeric `convergence:<n>` enforcement documented as **parked, not silently capped**
- [x] **Coverage** (ADR-031): `S-harness-review` (partial `{max_cycles:2}` → merged review.harness pinned by full `deepEqual`: override wins, dimensions/passes/convergence survive) + `S-harness-validation` (partial `{scope:per-file}` → `tool:stryker` survives); bad-harness-shape negatives in `manifest.test.js`; cross-phase isolation (an unrelated review override leaves `validation.harness` untouched)
- [x] **Surface gate held:** `resolvePipeline` signature + `engine/src/index.js` (7 exports) + `graph.js` + `contract.js` show 0 diff vs main; `pipeline/default.yml` change limited to the `review.harness` add (13 descriptors, enabled/disabled state unchanged); SC1 record[] byte-identical; SC1/S1/S2/S3/S-lean/S-full/S-reorder/SC3 + contract-equivalence green; `validateHarness`/`applyAllowedOverrides` stay **internal**; CI green at every commit (405 `node --test` + 42 bats); 4-dimension review after every code slice + a consistency review on the prose, every fix applied

### P8.5 — rename forge→craft (branch `feat/p8.5-rename-craft`, squash-merged to `main`; non-PRD interstitial — branding/productization, §17 numbering unchanged so P9 is still next; SoT ADRs 032–036)
- [x] **Decisions up front (ADRs 032–036, user-ratified via AskUserQuestion):** ADR-032 rename
  plugin `name: forge→craft` in `plugin.json` **and** `marketplace.json`, namespace re-derives
  (`craft:<dir>`/`craft:<name>`), skill/agent **dirs do NOT move** (unlike P4's `git mv`), version
  `0.1.1→0.2.0` (breaking); ADR-033 **no back-compat `forge:` namespace alias** (a plugin has one
  name, `ALIAS_MAP` stays phase-id-only per ADR-004/013); **ADR-034 ⚑ user OVERRODE my P4-precedent
  rec → "sweep EVERYTHING"** (every doc reads `craft`, incl. the dated ADRs/SPIKE/per-phase
  DESIGN-P*/PLAN-*/DESIGN-history — the rename event stays recorded only in 032–036 + this block +
  memory); **ADR-035 ⚑ user reversed the dir call mid-session** → the on-disk dir IS renamed
  `…/perso/forge → …/craft` as the **final post-merge action** (refs handled: `known_marketplaces.json`
  path re-pointed; `installed_plugins.json`/cache reinstall flagged, not hand-edited; no symlinks);
  ADR-036 `.forge-mutation.lock → .craft-mutation.lock` clean break (no old-name reader).
- [x] **s1 — namespace data + tests + metadata (atomic, CI-critical):** `pipeline/default.yml` 22
  `procedure:`/`role:` `forge:→craft:` (ids/archetypes/edges/gates/harness/enabled all unchanged);
  ALL `engine/test/**` goldens+fixtures flip in lockstep (green by construction, the deliberate
  difference from P4); `plugin.json`+`marketplace.json` name+version; `@forge/engine→@craft/engine`
  metadata. 4-dim review: code ✓ + test ✓ clean (goldens earned, not weakened); perf/security waived
  (mechanical token flip, 0 executable-path change).
- [x] **s2 — scripts/hooks/lock (behavior-bearing):** `.forge-mutation.lock→.craft-mutation.lock`
  across reader (`worktree-teardown.sh`) + writer prose (`validation/SKILL.md`) + 5 bats assertions
  **in lockstep** (protocol proven green); `forge-setup:`/`forge-teardown:`/`# forge —` + hook deny
  reasons (`"forge: …"→"craft: …"`). Review: code ✓ clean (lock sites agree, no logic/quoting/exit
  change); security covered by green `hooks.bats` deny-matrix + the structurally-unchanged deny JSON.
- [x] **s3 — all 12 phase skills:** `craft:<phase.id>`/`craft:<role>` + `# craft:` H1s + the run-walk
  orchestrator prose + `craft-native`/`craft-local`/`craft.extends` compounds + "Craft phase N"
  descriptions. Consistency review ✓ clean (`acme:`/`my:` preserved, `name:` frontmatter intact,
  pre-existing "craft"=expertise untouched).
- [x] **s4 — product-name prose:** agents/*.md descriptions, `templates/backlog.md`, README
  (install `craft@scolladon`, `/craft:run`), `examples/**`. Third-party `my-toolkit:`/`my:` untouched.
- [x] **s5 — docs "sweep everything" (ADR-034):** word-boundary `\bforge\b→craft` across PRD,
  DESIGN-*, PLAN-*, ADRs 002–030, SPIKE, DESIGN-history (the `\b` protects `unforgettable`/`forgets`;
  new ADRs 032–036 excluded as rename-narration). Consistency review ✓ (one LOW fixed: ADR-020
  "local craft-plugin agent file" disambiguated from "craft"=expertise).
- [x] **residue-closure (recon-missed product-name, not namespace):** `engine/bin/manifest-lint.js`
  5 user-facing CLI messages (`craft-manifest:`/"craft refuses to run") + `test/helpers/worktree.bash`
  git test-identity. **Narrow documented deviation from "engine/bin 0-diff":** engine LOGIC/exports/
  signatures are 0-diff; only 5 branding message strings changed (bats assert substrings, not the
  prefix → CI green). `engine/src` is fully 0-diff.
- [x] **Surface gate held:** `engine/src/**` **0-diff** vs P8 (`0bd99e7`); `engine/bin` diff =
  ONLY `manifest-lint.js` 5 message lines (documented); `node engine/bin/pipeline-resolve.js
  pipeline/default.yml` emits `craft:*` procedures/roles, exit 0; **CI green at every commit**
  (405 `node --test` + 42 bats, never `--no-verify`).
- [x] **grep-residue acceptance — ALL remaining `forge` is intentionally justified:** the new ADRs
  032–036 (rename-decision records narrating forge→craft / naming the old name); `unforgettable`×2
  (protected English); BACKLOG P8.5 row (this rename); `manifest.js:298` "a caller **forgets** opts"
  (English). Zero unjustified product-name or `forge:` namespace residue.

### P9 — agent/skill swap via manifest (slices 1–5 + refactor; SoT `docs/{DESIGN,PLAN}-P9-agent-swap.md`, ADRs 037–040; built dogfood via `/craft:run`)
- [x] **Scope reconciliation (design):** all four "already-shipped" claims verified PASS against code —
  resolution already swaps `phases.<id>.role` (S2 green), lint already accepts `role:`/`model:` (P8/ADR-028),
  contract keys on descriptor `id` so G5 holds structurally (P5/ADR-017), the walk already references the
  swapped role (P7/ADR-025). The genuinely-new concern: **no role-existence check existed anywhere** — a
  typo'd role passed lint+resolution and degraded silently inline.
- [x] **Decisions (ADRs 037–040, user-ratified; 3 of 4 diverged):** ADR-038 (DC-B, as-rec) extend the two S2
  tests to full-`CORE_MARKERS` survival; **ADR-037 ⚑ user UPGRADED DC-A walk-STOP → engine-level** `roleExists`
  probe (injected predicate, `ok:false` on a missing role, uniform agent+inline); **ADR-039 ⚑ user chose the
  external/highest-stakes example** `implementation.role: acme:tdd-specialist` (not the local `planning` swap);
  **ADR-040 ⚑ user WIDENED scope → new default-phase `procedure:` override field** (skill swap, not role-only).
  The DC-A×DC-D interaction (DC-D puts `engine/src` in play, voiding DC-A's 0-diff rationale) was surfaced and
  re-ratified → engine-level guard. Scope-fold design revision committed before planning.
- [x] **s1 — `procedure:` override field (engine):** `'procedure'` added to `manifest.js` `PHASE_FIELDS` +
  string shape-check, and to `edits.js` `ALLOWED_PHASE_OVERRIDE_FIELDS` (scalar-copy path, not the harness
  deep-merge). New `S2-procedure` fixture + S2-proc positive (override lands on descriptor, id unchanged).
- [x] **s2 — `roleExists` resolution guard (engine seam):** `resolvePipeline(defaults, manifest, opts)` gains
  an OPTIONAL trailing `opts`; `roleExists` defaults permissive (mirrors `validateManifest`'s `fileExists`);
  guard `effective.filter(d => d.role && !roleExists(d.role))` → `ok:false` naming phase+ref, before gates.
  `d.role &&` skips the 4 role-less phases. 7-export surface unchanged; SC1 byte-identical (default path never
  consults the probe). New `S2-bad-role` fixture + S2-neg (per-call stub rejects the bad ref).
- [x] **s3 — S2 hardened (walk-level):** the two S2 tests now pin id-unchanged + the FULL 8-marker
  `CORE_MARKERS` set survives on the swapped descriptor's assembled block — asserted against the REAL
  `contracts/` bundles (a RED probe confirmed the thin in-test fixture omits `swallowed`), the structural proof
  that a swap drops nothing (G5).
- [x] **s4 — walk/UX prose (`skills/run/SKILL.md`):** named the swap-fidelity (G5) guarantee across BOTH axes
  (`role:`+`procedure:`, id-keyed contract); role-not-found named as a cause of the existing `ok:false` row;
  default-phase `procedure:` override documented as riding verbatim dispatch + the existing "resolves to no
  installed skill" STOP. No new error-paths row. **Scope-honest:** states the engine seam ships now and the
  live install-probe wiring follows later (today the seam no-ops permissive — see parked).
- [x] **s5 — example + README:** `examples/role-swap/workflow.md` (`implementation.role: acme:tdd-specialist`,
  ADR-039), mirroring `lean-profile`; leads with the external/contract-only-inline (ADR-020) + fail-closed
  (ADR-037) story + the `procedure:` sibling axis; README Examples row.
- [x] **4-dim review converged low-only:** code/security/perf ZERO; 2 LOW tests → refactoring. Security
  confirmed the permissive-default seam is an accepted documented boundary (strings are inert JSON, no sink).
- [x] **Refactoring:** centralized the duplicated `CORE_MARKERS`/`hasCI` into a shared test helper + aligned
  the producer assertion to `hasCI`. **Re-review caught a regression the refactor's gate missed** — `node --test`
  auto-runs every `.js` under `test/`, so the new helper became a phantom 0-assertion passing test (count
  409→410); relocated to `engine/test-helpers/` (out of discovery), count honest 409.
- [x] **Validation:** NO-OP — the repo has no mutation tooling configured (the default `validation.harness`
  names `tool: stryker`, but it isn't set up). P9 mutation-adequacy unverified; review advisories ADV-1/2/3
  carried as coverage observations.
- [x] **Surface gate held (revised):** `engine/src/index.js` 7-export surface + `resolvePipeline` call-shape
  (trailing-optional `opts`) + `pipeline/default.yml` + `graph.js` + `contract.js` + `contract-assemble.js`
  unchanged; SC1 run-record byte-identical; `engine/src` delta limited to the `procedure` field + the
  `roleExists` seam (NOT 0-diff — the deliberate DC-A/DC-D consequence). CI green at every commit, never
  `--no-verify` (409 `node --test` + 42 bats).

## Next — P10+
- **P10 — new default phases & agents**: optional `requirements` (new `requirements-writer` agent) +
  `architecture` harness (new `architecture-triager` agent), both default-off. Next up (S4/S5 green).
- **P10–P16** (PRD §17, in order): P10 new default phases
  (requirements/architecture) · P11 backlog SoT adapter · **P12 DX** · P13 NFR
  hardening · P14 derived-plugin extension · P15 second-instantiation · P16 provider-agnostic.
- **Showcase / DX docs are P12 — intentionally late**, not next. The illustrated overview (intent,
  hexagon Mermaid, a sample `.claude/workflow.md`, a sample run) documents the *full* customization
  surface, so it lands only after P7–P11 build it; its derived-plugin (Tier-2) half is gated after
  P14 so the catalog never advertises an unproven surface (PRD §17 P12).

### Parked from P9 — ✅ DONE (P9.5 hardening batch)
- [x] **`roleExists` live install-probe wired into the bin.** `engine/bin/pipeline-resolve.js` now
  constructs a real `roleExists` predicate and passes it 3-arg: craft-native `craft:<role>` resolves iff
  `agents/<role>.md` exists; EXTERNAL `my:`/`acme:` refs stay permissive (P14 registration territory, still
  punted per ADR-037). `bad-role`/`good-role`/`external-role` bin tests pin it (ADR-047/DC-1). A typo'd craft
  role now fails closed at resolution (`ok:false`, exit 2) in the real `/craft:run`.
- [x] **Validation mutation-adequacy — Stryker stood up; validation runs for real.** `@stryker-mutator/core@8.7.1`
  + `tap-runner` configured (repo-root sandbox so the suite's repo-root `contracts/`/`agents/` resolve;
  `engine/src/**` scope, `coverageAnalysis: perTest`). The changed src hunk (`manifest.js` empty-`procedure`
  guard) scores **16/16 mutants killed**. **ADV-1** (exactly-one-error count through a rejecting probe),
  **ADV-2** (producer-content marker), **ADV-3** (empty- AND whitespace-`procedure` boundary) all landed as
  tests. Bin mutation-coverage + a full `engine/src` baseline ride as a P9.5 follow-up (below).

### Parked from P8.5 — ✅ DONE (out-of-repo install state resolved; verified by this session running as `craft:*` from `…/perso/craft`)
- [x] **Folder rename + marketplace re-point:** `…/perso/forge → …/craft` via `mv`, with
  `~/.claude/plugins/known_marketplaces.json` `scolladon` `path`/`installLocation` re-pointed to
  the new dir (the only ref the dir move breaks).
- [x] **Installed-plugin reinstall:** CLI reinstall as `craft@scolladon` + session restart — the
  `craft:*` namespace now loads (proven: this run dispatches `craft:run`/`craft:design`/… and the
  repo lives at `…/perso/craft`); the registry was reinstalled, not hand-edited.
- [x] **`~/.claude/CLAUDE.md`:** the "default feature workflow" trigger updated `/forge:run → /craft:run`.

### Parked from P8 (walk-fidelity, not engine gaps — knobs validate + reach the descriptor)
- **`passes > 1` multi-reviewer fan-out is not engine-enforced**: the validator accepts `passes`
  and it deep-merges onto the descriptor, and `review/SKILL.md` reads it, but the actual N-reviewers-
  per-dimension parallelism is a session-honored self-directed constraint, not an engine invariant.
  Documented explicitly in `review/SKILL.md` (no silent cap). Would harden in a later walk/parallelism pass.
- **Numeric `convergence: <n>` stopping is walk-judgment**: the validator accepts a finite ≥0
  threshold and the descriptor carries it, but the exact stop rule for arbitrary thresholds
  (finding-count vs. severity-weighted) is left to the review walk, not engine-enforced. Documented in
  `review/SKILL.md` step 4.
- **Per-invocation `--harness` CLI flag** (override a knob without a manifest, à la `--profile`/`--skip`
  ADR-022) was out of P8 scope — would follow the same `cli-overlay.js` pattern in a later phase.

### Parked from P7 (scoped out by ADR-025 — ride with P14 derived-plugin/registration)
- **Inserted-phase contract injection** is not wired: `engine/bin/contract-assemble.js` keys on
  `pipeline/default.yml` by `--descriptor-id`, so a novel inserted `id` (e.g. `bench`) STOPs at
  `run/SKILL.md` step 3 with "unknown descriptor-id". P7 landed inserted-phase *dispatch* (step 1)
  + resolution-layer insert (S3/SC3); full inserted-phase *execution* needs `contract-assemble` to
  learn the resolved/inserted descriptors (pass the resolved descriptor or read the Resolution),
  which rides with the P14 registration surface.

### Parked from P6 (small, pre-existing — not execution-topology)
- `run/SKILL.md` step 1b describes an `ok: false`-in-JSON branch, but `pipeline-resolve.js` exits 2
  on `ok:false` and never emits JSON — the branch is unreachable. Pre-existing since P3; the
  "Walk error paths" table carries the same row. Tidy both together (out of P6 scope).

## Deferred / parked
- [ ] `worktree-teardown.sh` production hardening — validate PID before `kill -0`, `git branch -D --`,
  realpath the `WT≠MAIN` guard (rides with the VCS-adapter phase).
- [ ] `backlog-lint` / `design-lint` structure lints — the optional half of ADR-014 (the
  `templates/backlog.md` template shipped at P4; the enforcing script + bats fixtures stayed
  deferred). Rides with the backlog-port phase (P6/P11).

### Engine/tooling hardening — ✅ DONE (P9.5 hardening batch; surfaced during the P9 dogfood)
- [x] **Agent model pins + declared fallback.** The fable pins on `craft:designer`/`planner`/`reviewer`
  were retired to `opus` directly in the live plugin (`4b8f75a`; user-decided, ADR-041/DC-3b), and a named
  engine **default fallback `sonnet`** was added to `run/SKILL.md`'s model-resolution invariant
  (`models.fallback` → engine default `sonnet` → session model; ADR-041/DC-3a). No more dead fable spawn; a
  no-manifest run has a declared fallback.
- [x] **`worktree-setup.sh` nested-lockfile probe.** A bounded one-level-deep fallback scan installs deps
  when the lockfile lives in a subdir (`engine/package-lock.json`); a `test/worktree.bats` nested fixture
  guards it; shellcheck-clean (ADR-047/DC-4).
- [x] **`node --test` discovery footguns.** `scripts/ci.sh` + `engine/package.json` use the explicit glob
  `node --test 'test/**/*.test.js'` (excludes phantom non-test `.js`) **and** an `EXPECTED_TESTS` count-assert
  gate parsing the runner's `# tests` line (catches count drift; bumped per test-changing commit). The ci.sh
  capture was also hardened to print failing-test output before the gate decides (ADR-046/DC-5a+DC-5b).
- [x] **`decisions` phase — cross-candidate interaction check.** `skills/decisions/SKILL.md` gained a step
  (before ADR authoring) prompting the session to check whether a ratified choice's rationale is voided by
  another (ADR-047/DC-6).
- [x] **`run/SKILL.md` step 0a brief echo trimmed.** Step 0a references "the input" once; the `Input:` line
  is the single canonical `$ARGUMENTS` echo (ADR-047/DC-7).
- [x] **Review cadence — decided + documented.** The single `review` phase is canonical; the per-slice
  4-dimension interleave is a documented session working-style (`run/SKILL.md`), cross-linked to the
  Parked-from-P8 walk/parallelism pass (ADR-043/DC-8).

### Parked from P9.5 (follow-ups surfaced during the hardening batch)
- [ ] **Full-engine mutation baseline + bin coverage.** `npm run mutation` now runs for real (repo-root
  sandbox; `engine/src/**` scope). The P9.5 run validated only the changed src hunk (per-hunk: `manifest.js`
  16/16 killed); a full `engine/src` baseline (slow) hasn't been taken. **The bins are not Stryker-coverable**:
  `engine/bin/*` is exercised via `spawnSync` subprocesses, outside Stryker's import-graph coverage (they
  report "no coverage" regardless of `coverageAnalysis`). The bin changes (roleExists, parseManifestContent)
  are covered by `spawnSync` bin tests verified red-on-revert in review. Closing this needs an in-process bin
  harness (import the bin's logic rather than spawn it) or a separate command-runner mutation pass.
- [ ] **`roleExists` path-traversal hardening (defense-in-depth).** The bin probe does a read-only
  `existsSync(join(REPO_ROOT, 'agents', <ref-after-craft:> + '.md'))` on a repo-trusted manifest value; a
  `craft:../../x` ref could probe outside `agents/`. Real impact is nil (read-only existence bit, trusted
  input), so it was left as-is; if wanted, reject refs whose name contains a path separator before the probe.
- [ ] **Nested-lockfile bats test env-coupling.** `test/worktree.bats`'s nested test runs a real `npm install`
  (against an empty `{}` package.json — a local, network-free install). A PATH `npm` stub would pin the
  branch-selection + message without depending on npm at all; optional robustness.

## Notes
- **Data is the SoT, not the prose.** `pipeline/default.yml` (the 13-descriptor table) is authoritative.
  Explanatory prose was corrected to match: `skip-design` is **refused** (`documentation` is a 3rd
  consumer of `design`); the code-producing floor = `implementation` + `refactoring` only (predicate
  `change ∈ produces`; review/validation are *waivable* harnesses).
- Each phase is **dogfoodable** now that P1 is green (OQ7) — runnable through `/craft:run` itself.
- Working style: sliced TDD, one slice per dedicated agent **chosen by slice shape** —
  `craft:slice-implementer` for TDD slices, `craft:refactor-executor` for pre-scoped
  behavior-preserving rename/relocation slices, session-direct only for judgment-fused sweeps; a
  4-dimension review (perf/security/code/test) interleaved after each slice, every fix applied
  before the next. CI green at every commit; never `--no-verify`.
