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
| P10 | New default phases & agents — optional `requirements` (`requirements-writer`) + `architecture` harness (`architecture-triager`), both default-off, runnable-when-enabled | ✅ done & green |
| P11 | Backlog SoT abstraction — two-source port `{ file, custom }` (`resolve`/`complete`); `file` default byte-for-byte + `custom` runtime-resolvable escape hatch (gh/jira/linear become custom recipes); manifest `backlog.{source,ref}` validated; adapter failure = blocker; ADRs 054–060 | ✅ done & green |
| P12 | DX — single entry guide (`docs/GUIDE-customizing.md`: hexagon mental model + tiered injection catalog) + a lint-clean `examples/` sample per Tier-0/1 point + `examples-lint` anti-rot gate; Tier-2 a gated stub (after P14); ADRs 061–064 | ✅ done & green |
| P13 | NFR hardening — bin mutation coverage (4 bins → `engine/src/<bin>-main.js`, in-process units + retained child-proc smoke; mutation 85→95.40%) + model-class matrix (deterministic R10 shape-stability guard CI + live cross-tier procedure); **metrics harness-sourced, no engine telemetry**; ADRs 065–068 | ✅ done & green |
| P14 | Derived-plugin extension surface — flat `extends:` registers phases/agents/profiles/backlog-adapters; inserted/registered-phase contract execution (`--descriptor-json`) + same-id override (full replace); external-ref `roleExists` fails closed unless registered; Tier-2 DX docs + example; ADRs 069–075 | ✅ done & green |
| P15 | Second-instantiation validation — a non-tsgit Python/pytest repo runs the default pipeline zero-config (SC5/G9); explicit CI scenario pins resolver toolchain-neutrality; propose-gate releases on a validation runtime no-op (ADR-082); docs refresh; ADRs 076–082 | ✅ done & green |
| P16 | Provider-agnostic — ports/adapters boundary + non-Claude adapter PoC (target: Pi) | ⬜ outlined (PRD §17) |

> ✅ **The engine is now LIVE.** `run/SKILL.md` walks `pipeline-resolve` output (no hardcoded
> 1→11 table); manifest validation has one deterministic Node home (`validateManifest`);
> the contract has one engine home (`contracts/` → `assembleContract`, injected on every run);
> `scripts/ci.sh` green (528 `node --test` + 62 bats). **P3 connected the walk; P4 made the
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

### P10 — new default phases & agents (slices 1–3 + review fixes; SoT `docs/{DESIGN,PLAN}-P10-default-phases.md`, ADRs 048–053; built dogfood via `/craft:run`)
- [x] **Scope reconciliation (design):** the engine/resolution layer was already built — the
  `requirements`/`architecture` descriptors have shipped `enabled: false` in `pipeline/default.yml`
  since P1 (the 13-descriptor data), S4/S5 resolver goldens were green, both contract bundles
  (`producer`/`harness-exec`) assemble, `paths` is unvalidated-passthrough, and `prd→requirements`
  aliases. The genuine gap was **dispatch**: no `agents/requirements-writer.md` / `architecture-triager.md`
  and no `skills/requirements/` / `skills/architecture/` dir, so a live `/craft:run` with either enabled
  failed closed (`roleExists` exit 2). **No `engine/src` change was needed** — P10 is pure authoring.
- [x] **Decisions (ADRs 048–053, user-ratified; 2 of 6 diverged):** ADR-048 new `templates/requirements.md`
  + `docs/requirements/<slug>.md` via `paths.requirements` probe; ADR-049 `architecture` runs **synchronously,
  no lock** (dependency-cruiser is fast — no `.craft-mutation.lock` clone); ADR-050 report in the run record,
  exceptions in dependency-cruiser's own config, `<arch gate>` = depcruise exit 0; **ADR-051 ⚑ user OVERRODE
  rec → both agents pin `model: opus`** (architecture-triage is structural reasoning, not mechanical
  mutant-killing); ADR-052 test surface (live-bin inverse-RED + contract pins + structural bats); **ADR-053 ⚑
  user chose to ADD a one-line `skills/design/SKILL.md` note** for consuming a produced `requirements` artifact.
  Cross-candidate check clean; scope-fold design revision committed before planning.
- [x] **s1 — requirements vertical:** `templates/requirements.md` + thin `requirements-writer` (opus, mirrors
  `designer`, G5-clean) + `skills/requirements/SKILL.md` (`# craft:requirements` dispatch heading) + the
  ADR-053 design-skill note; live-bin inverse-RED test (`enable-requirements` → exit 0) + `contract-assemble`
  producer pin; `EXPECTED_TESTS` 418→420.
- [x] **s2 — architecture vertical:** thin `architecture-triager` (opus, mirrors `validation-triager`) +
  `skills/architecture/SKILL.md` (synchronous, probe-first no-op, NO `.craft-mutation.lock`/background/teardown
  clause — ADR-049) + `enable-architecture.yml` fixture; live-bin inverse-RED test (`enable-architecture` →
  exit 0) + `contract-assemble` harness-exec pin; `EXPECTED_TESTS` 420→422.
- [x] **s3 — structural bats + examples:** `test/p10-structure.bats` (existence + procedure↔dir heading +
  G5 thinness + no-lock guards) + `examples/requirements/` (S4 persona) + `examples/architecture/` (S5 persona)
  + `examples/README.md` index rows. Standalone test-infra/docs slice (no `src` delta, no count bump).
- [x] **4-dim review → converged:** cycle 1 surfaced **2 HIGH** (the bats thinness `@test`s collapsed two
  `! grep -q` lines, but bats runs without `set -e` so the first probe was DEAD — half-vacuous guard, proven
  empirically) + 4 LOW (2 agent house-lead descriptions, positive-only contract pins, no both-phases bin test);
  security/perf zero. All fixed (collapsed to `! grep -qE 'A|B'`, added negative cross-bundle pins +
  `enable-both` bin case, house leads; `EXPECTED_TESTS` 422→423). Cycle 2 (tests fix-delta) zero → converged.
- [x] **Refactoring:** NO-OP (justified) — skill/agent boilerplate duplication is inherent to the
  one-`SKILL.md`-per-phase dispatch model; the shared invariant is already engine-injected (P5/ADR-017).
- [x] **Validation:** NO-OP for this change — Stryker is configured (`engine/stryker.conf.json`,
  mutate `engine/src/**/*.js`) but P10 touched ZERO `engine/src` (changed files ∩ mutate-glob = ∅); no mutable
  surface to score; `propose` validation-gate released (suite green at 423). The P9.5 full-engine baseline
  (80.03%) stays representative — P10 didn't touch src.
- [x] **Surface gate held:** `engine/src/**` **0-diff** vs P9.5; `pipeline/default.yml` unchanged (both
  descriptors already present, `enabled: false`); S4/S5 resolver goldens green; both phases remain default-off;
  CI green at every commit, never `--no-verify` (423 `node --test` + 53 bats).

### P11 — backlog SoT adapter (slices 1–3 + review/validation fixes; SoT `docs/{DESIGN,PLAN}-P11-backlog-port.md`, `docs/adapters/backlog.md`, ADRs 054–060; built dogfood via `/craft:run`)
- [x] **Decisions (ADRs 054–060; 2 of 7 diverged from the design rec):** ADR-054 `backlog` MUST be an
  object `{ source, ref }` — a bare string is **hard-rejected** (⚑ user overrode the migrate-with-record
  rec; the 3 string-form fixtures migrated); **ADR-055 ⚑ user reframed the source set to exactly
  `{ file, custom }`** — `file` built-in + `custom` runtime-resolvable escape hatch; github-issues/jira/linear
  are rejected source values that survive as documented `custom` recipes (the framework guarantees the seam,
  not the tracker's uptime); ADR-056 adapter procedures live in one `docs/adapters/backlog.md` spec
  referenced from the skills; ADR-057 failure-is-a-blocker relies on the injected `contracts/core.md` blocker
  protocol (no duplicated clause); ADR-058 failures split — config → engine non-zero exit, runtime → session
  blocker; ADR-059 `custom` `complete` guard = non-zero exit ⇒ blocker + script-documented idempotency;
  ADR-060 `file` id-form stays orchestrator prose-judgment (no engine regex / no `id-pattern` knob).
  Scope-fold design revision committed before planning.
- [x] **s1 — `validateBacklog` (engine/src/manifest.js, scored):** object-shape guard + `BACKLOG_SOURCES =
  { file, custom }` + non-built-in-tracker "use source: custom" hint + `file.ref` via `checkFileRef` /
  `custom.ref` non-empty-string-only; `case 'backlog':` wired; 2 migration sites + 7 bats fixtures.
- [x] **s2 — record line names the source (engine/src/resolve.js, scored):** `backlogSourceOf` +
  `buildManifestRecords` rewrite naming `file|custom`; S6 fixture migrated to object form + assertion
  strengthened to source-naming.
- [x] **s3 — adapter spec + skill wiring (docs-only):** `docs/adapters/backlog.md` (port iface, file +
  custom procedures, gh/jira custom recipes, safe-invocation guidance) + `skills/run` & `skills/documentation`
  step-2 source-dispatch.
- [x] **4-dim review → converged:** code 2 LOW; **security 2 HIGH** (adapter prose modeled command injection
  by example — reframed to argv-array invocation + an enforced id-form allowlist; the HIGH fix diff was shown
  to and approved by the user) + 2 MED + 1 LOW; tests 2 MED (+1 MED in fix-delta: a surviving placeholder
  mutant); perf 0. Every finding applied by the session; fix-delta re-review converged.
- [x] **Validation (Stryker per-hunk):** triage (`test(mutation): backlog-port`) killed 5 surviving mutants
  (3 new + 2 strengthened tests) and documented 4 provably-equivalent (the redundant `=== 'custom'` after the
  membership gate + the `backlogSourceOf` defensive guard whose return is unobservable to its sole consumer);
  re-run **96.19%**, survivors == the 4 documented equivalents exactly.
- [x] **Refactoring:** NO-OP (justified) — considered a shared `isPlainObject` guard (radiates across 5
  unrelated validators), a record-branch merge (distinct placeholder semantics), cross-module source-set
  sharing (engine-purity boundary); nothing cleared the bar.
- [x] **Surface:** `EXPECTED_TESTS` 423→448; CI green at every commit, never `--no-verify` (448 `node --test`
  + 60 bats). No git remote → `propose` ends at a branch (no PR URL).

### P12 — DX guide + injection catalog + lintable examples (docs-only; SoT `docs/DESIGN-P12-dx.md`, ADRs 061–064; G10)
- [x] **Decisions (ADRs 061–064):** ADR-061 one entry doc `docs/GUIDE-customizing.md` (mental model →
  catalog → examples index → one-sitting walkthrough), not a two-doc split or a README fold (SC7 is a
  single-sitting task); ADR-062 Tier-2 (#12) ships as a **gated stub** + #11 *insert* carries a
  "dispatch works (P7), full inserted-phase contract execution at P14" caveat — never advertise an
  unproven surface; ADR-063 examples made lint-clean by shipping referenced bodies under shared
  `examples/.claude/workflow/` (resolve via the linter's `ROOT = dirname(dirname(manifest))`) + a bats
  anti-rot gate; ADR-064 the parked-from-P8 `--harness` flag is **re-parked** (precondition unmet).
- [x] **The guide — `docs/GUIDE-customizing.md`:** hexagon mental model (core / 6 ports / Claude Code
  adapter, canonical ASCII diagram reused) + the §11 invariant core framed as *what you cannot inject*
  + the tiered injection catalog (Tier 0 #1–7, Tier 1 #8–11, Tier 2 #12 stub) with a sample link per
  point + precedence rules + a *tailor in one sitting* worked manifest (points #1/#2/#6/#8) → lint → run.
- [x] **A sample per Tier-0/1 point:** six new lint-clean examples — `skip-phase` (#1), `model-routing`
  (#2), `gate-command` (#3), `review-harness` (#6), `backlog-custom` (#7), `override-procedure` (#9);
  existing dirs cover #4/#5 (`lean-profile`), #8 (`karpathy-as-context`), #10 (`role-swap`), #11
  (`everything-claude-toolkit`). All **12** examples now pass `manifest-lint` (the two previously-red
  `context:` examples fixed by shipping their bodies).
- [x] **Anti-rot gate:** `test/examples-lint.bats` asserts every `examples/*/workflow.md` lints — bats,
  so `EXPECTED_TESTS` (448 `node --test`) is unchanged; runs under the existing `bats test/` line.
- [x] **READMEs:** `examples/README.md` → per-injection-point index + the sample-files note; root
  `README.md` Customize section points at the guide first. **No `engine/src` change** (docs-only —
  no TDD slices, no mutation run; validation is a no-op for markdown).

### P13 — NFR hardening: bin mutation coverage + model-class matrix (slices 1–6 + review/refactor/validation; SoT `docs/{DESIGN,PLAN}-P13-nfr-hardening.md`, ADRs 065–068; G12/SC6)
- [x] **Decisions (ADRs 065–068):** ADR-065 — NFR metrics are **harness-sourced** (the per-spawn usage
  block the orchestrator already receives), with **no engine telemetry object, no subagent self-report,
  no deterministic engine-speed baseline** (the design's DC-2/3/6 dropped after the user challenged the
  premise — the pure resolution core has no tokens/time to model, and the harness already surfaces exact
  per-phase usage); ADR-066 — bin mutation coverage via **extract-to-`engine/src/<bin>-main.js`**
  (`main(argv, io)` returns the exit code; bin shrinks to a thin entrypoint guard; the
  `mutate: ["engine/src/**"]` glob is unchanged so the extracted modules are auto-covered); ADR-067 —
  in-process units **alongside** retained child-process smoke; ADR-068 — model-class matrix = deterministic
  R10 shape-stability guard (CI) + a live cross-tier procedure (on-demand, not CI-gated, records harness usage).
- [x] **Bin mutation coverage:** 4 bins extracted to `engine/src/*-main.js` (`pipeline-resolve`,
  `contract-assemble`, `manifest-lint`, `normalize-findings`); bins are 5-line guards; `normalize-findings`
  stdin injected via `io.readStdin` (no raw fd-0 read in src). `pipeline-lint`/`contracts-lint` **skipped**
  (thin pass-throughs, already smoke-covered — follow-up below). New `manifest-lint.bin.test.js` smoke.
- [x] **Model-class matrix:** `engine/test/model-class-shape.test.js` asserts the assembled contract block is
  model-independent (byte-identical across the 3 pins, no pin string leaks) and `normalizeFindings` is
  shape-stable (JSON vs per-line deep-equal) — the R10 discharge. Live procedure + `docs/model-class-matrix.md`
  template added to `skills/run/SKILL.md` as a sibling of the inline-fidelity check (not CI-gated).
- [x] **Review (4 dims, low-only):** code/security/perf converged clean (security: traversal guard +
  `REPO_ROOT` intact post-move; perf: barrel→direct import a slight load win); tests R1 flagged 2 MEDIUM
  (uncovered bin error-path glue) → session fix `test(engine): cover bin error-path glue` → R2 converged.
- [x] **Refactoring:** extracted shared `makeCaptureIo()` test helper (`engine/test-helpers/capture-io.js`),
  4 test files DRY'd (behavior-preserving). `takeValue`/parseArgs + bin-guard duplication deliberately NOT
  extracted (variants legitimately differ — `-` vs `--`; idiomatic entrypoint guard).
- [x] **Validation (Stryker per-hunk over the 4 new modules):** 85.06% → **95.40%** (triage
  `test(mutation): bin-main glue` killed 22 mutants with 21 tests; **12 documented provably-equivalent** —
  6 unreachable catch-blocks over fixed in-repo files, 3 `utf8`/`""` encoding-identical, an off-by-one with
  no `else`, `agent`/`""` binary-inline, falsy-`catch`, empty-skip no-op); session's authoritative re-run:
  surviving == the 12 equivalents exactly. `normalize-findings-main.js` 100%.
- [x] **Surface:** `EXPECTED_TESTS` 448→**528**; CI green at every commit, never `--no-verify`. No git remote
  → `propose` ends at a branch (no PR URL).

### P14 — derived-plugin extension surface (slices 1–7 + review/validation; SoT `docs/{DESIGN,PLAN}-P14-derived-plugin-extension.md`, ADRs 069–075; G8/SC9/S7)
- [x] **Decisions (ADRs 069–075):** 069 — registration key is flat top-level **`extends:`** (the manifest is
  craft's own; `TOP_KEYS` is flat); 070 — `extends.phases` normalize into the **single insert path**
  (`applyInserts`), no parallel resolver; 071 — `contract-assemble` learns inserted/registered descriptors via
  **`--descriptor-json`** (the walk passes the resolved descriptor; absent flag → default.yml path byte-unchanged);
  072 — `roleExists` registered set = `extends.agents` ∪ every registered/inserted phase `role:` (external ref
  **fails closed** unless registered); 073 — **DEVIATION** (user): `extends.phases` MAY override a default id via a
  **full-replace, override-aware branch** (no field inheritance; `checkUniqueIds` still guards new-id dupes); 074 —
  S7 proof = CI engine fixture + on-demand `--plugin-dir` smoke; 075 — registered profiles **full + typed** (all six
  archetypes, harness floor still forced).
- [x] **Engine (7-export surface frozen; `index.js` untouched; SC1 byte-identical throughout):** `validateExtends`
  + sub-validators in `manifest.js` (sole shape guard — inserts bypass `normalizeEntry`/`deepFreeze`);
  `foldRegisteredPhases` override-aware insert in `resolve.js`; `roleExists` registered-set in
  `pipeline-resolve-main.js`; `--descriptor-json` in `contract-assemble-main.js`; registered `extends.profiles`
  (`expandProfile`) + `extends.backlog-adapters` (`buildManifestRecords`/`validateBacklog`). Closes the parked
  **P7 inserted-phase contract-execution** and **P9 external-role registration** riders.
- [x] **Review (4 dims, low-only):** perf converged clean; code 1 HIGH (archetype now **required** on a registered
  phase — else the executing-harness gate + harness-agent floor silently miss it) + LOWs (profile prototype-key
  `Object.hasOwn` fail-closed; `registeredBacklogNames` dedup; dead guard; override anchor-strip); security 1 LOW
  (`--descriptor-json` takes a path/stdin, not inline JSON — SKILL.md clarified); tests 3 MEDIUM (shape-rejection,
  malformed-json, optional-field coverage). All applied; fix-delta re-review converged zero.
- [x] **Validation (Stryker per-hunk, 32 hunks):** 82.70% → **95.97%**; 73 survivors triaged → 17 documented
  (14 provably-equivalent — the `foldRegisteredPhases` optimization guard, `?? []`/`if(true)` ref-set pollution
  never queried, `typeof`-redundant-with-`!has`, `utf8`/`""` Buffer-identical reads; + 3 stdin-branch smoke-covered
  that Stryker's in-process perTest cannot credit). Session's authoritative re-run: surviving == the 17 documented exactly.
- [x] **Docs:** Tier-2 catalog (`docs/GUIDE-customizing.md` #12 + the #11 footnote) + `examples/derived-plugin/`
  (lint-clean) written — the gated Tier-2 DX docs (ADR-062) now ship a proven surface.
- [x] **Surface:** `EXPECTED_TESTS` 528→**631**; CI green at every commit, never `--no-verify`. No git remote
  → `propose` ends at a branch (no PR URL).

### P15 — second-instantiation validation (non-tsgit, zero manifest) + docs refresh (branch `feat/p15-second-instantiation`; SoT `docs/DESIGN-P15-second-instantiation.md` + `docs/SC5-second-instantiation-record.md`, ADRs 076–082; SC5/G9)
- [x] **Decisions (ADRs 076–082):** 076 — SC5 scoped to a non-tsgit repo *with a discoverable test command* (the gate-floor REFUSE on a no-test repo is correct floor behaviour, not an SC5 miss); 077 — target = a real OSS Python/pytest repo, smoke driven by a free-text brief (zero-manifest ⇒ no backlog id); 078 — one explicit `SC5` scenario pins the resolver emits gate **placeholders unchanged and language-free**; 079 — standard docs-refresh scope (README + GUIDE §1 + DESIGN-customizable-engine + SC5 record + backlog); 080 — proof = a committed validation-record doc + an on-demand smoke; 081 — P15 is docs-only (probes already language-neutral); 082 — the propose-gate releases on a **recorded executing-harness runtime no-op**, symmetric to a skip-waiver.
- [x] **Engine pinned toolchain-neutral:** `pipeline-resolve` (no manifest) resolves the same 11-phase walk on any repo; the `SC5` scenario (`engine/test/scenarios.test.js`) asserts the resolved gate decisions are language-free placeholders (a `node|npm|pytest|cargo|…` refutation over every `gateDecisions[].gate`, hardened in review to include `node`) — proving the resolver never bakes a language command and defers to the repo-probing skill layer. `EXPECTED_TESTS` 631→**634**.
- [x] **ADR-082 clause shipped:** `skills/run/SKILL.md` propose-gate invariant + `skills/propose/SKILL.md` preamble release the wait on a recorded validation runtime no-op — SC1-neutral (fires only on a runtime no-op, which the Stryker-present tsgit path never hits).
- [x] **SC5 smoke PASS:** the default pipeline ran zero-config on a real Python/pytest repo (Conway's Game of Life — no manifest, no remote); `worktree-setup` reported the Python skip-noted (no lockfile); the gate probe discovered `pytest` (green, no REFUSE); `validation` no-op'd with a note (no mutation config) and released its propose-gate; the walk reached `propose` without deadlock; propose/integrate no-op'd (no remote). Recorded in `docs/SC5-second-instantiation-record.md`; on-demand procedure in `skills/run/SKILL.md`.
- [x] **Docs:** README precondition + degradation behaviour; GUIDE §1 "zero-config on any toolchain"; DESIGN-customizable-engine second-instantiation marked validated.
- [x] **Review/validation:** review 4-dim — tests 1 MEDIUM (`node` token gap) + LOWs applied, fix-delta converged; security/perf clean. Validation per-hunk scope empty (no `engine/src` change) → 0 mutants. CI green at every commit, never `--no-verify`. No git remote → `propose` ends at a branch (no PR URL).

## Next — P13.5 / P14+
- **P13.5 — ban-enforcement boundary** (interstitial, user-raised; **NOT** a PRD §17 phase — §17 numbering
  unchanged, like P8.5/P9.5): revisit *every* mechanically- or contract-enforced "ban" and split
  **engine-invariant** from **adapter-mechanism**. **Position to discuss (user, IMHO):** the framework should
  *provide* the hooks but **NOT wire them on by default** — enforcement is user/repo context, not framework
  law. This item is **discussion-first** (no decision pre-made here). Current ban inventory:
  - **Hook-enforced (PreToolUse Bash, mechanical — `hooks/hooks.json`):** `block-no-verify.sh` (denies
    `git commit|push|merge --no-verify`); `git-no-ext-diff.sh` (forces `--no-ext-diff` on git diff/show).
  - **Contract-text (`contracts/core.md`, injected every phase; PRD §11 core):** never commit on a red gate /
    never `--no-verify`; no provenance refs in source/test; no suppression directives
    (`@ts-ignore`/`eslint-disable`/coverage-mutation-ignores/lint-silencing); no swallowed errors; bounded scope.
  - **Reconciliation seam (§2.1 hexagonal):** the *invariant* "never commit on a red gate" reads as
    engine-core; the *mechanism* "block `--no-verify`" is the **Claude Code adapter's** enforcement (§11 tags
    the line `(hook + orchestrator)`). The ban also conflates "the repo's git pre-commit hook == the gate" —
    true for husky/lefthook repos, not universal (CI-only gating, slow/irrelevant local hooks).
  - **Caveat the discussion must resolve:** a free opt-out that supplies *no* equivalent mechanical anchor
    silently degrades the guarantee to honor-system — the exact thing craft beats vs markdown frameworks
    (PRD §16). Decide whether "ship-but-default-off" must keep an engine-side red-gate refusal as the floor.
  - **Touches:** PRD §11 (invariant core) + §2.1 (ports/adapters), `hooks/`, `contracts/core.md`, the
    injection catalog (`docs/GUIDE-customizing.md`). Sequencing TBD in the discussion (near the
    adapter-boundary work P16, or the DX/injection surface).
- **P16** (PRD §17): provider-agnostic — ports/adapters boundary + non-Claude adapter PoC (target: Pi).
  (**P15 second-instantiation ✅ done** — a non-tsgit Python/pytest repo runs the default pipeline
  zero-config, SC5 green; see the Done section above and `docs/SC5-second-instantiation-record.md`.)
- **Follow-up from P14 (refactoring no-op deferral):** when P15/P16 grow manifest validation further,
  extract a shared `validators-util` leaf (`checkFileRef`) + the `validateExtends*` cluster into an
  `extends-validation` module — deferred now because the cluster shares `checkFileRef` with the
  pre-existing scripts/backlog/phases validators, so a clean cut needs that shared leaf first (and
  `manifest.js` at ~630 lines is still under the 800 max). Low priority.
- **Follow-up from P13 (ADR-066 per-bin scope):** convert the remaining two bins
  `engine/bin/{pipeline-lint,contracts-lint}.js` to the extract-to-`engine/src/<bin>-main.js` pattern for
  mutation coverage — P13 skipped them as thin pass-throughs (already smoke-covered by `ci.sh`), but their
  residual glue (`contracts-lint`'s failure-collection loop especially) is `[NoCoverage]` like the others
  were. Low priority; do when their mutation coverage matters.
- **Tier-2 DX docs — ✅ DONE (P14):** the derived-plugin half of the injection catalog (point #12) +
  the #11 inserted-phase contract-execution footnote now ship in `docs/GUIDE-customizing.md`, with a
  lint-clean `examples/derived-plugin/` sample — written only once P14 proved the surface end-to-end
  (PRD §17 P12; ADR-062).

### Parked from P10 (surfaced this run)
- [ ] **Evaluate migrating the `bats` suite to `node --test` (JS) for portability** (user-requested;
  ADR-052). `bats` requires bash; `node --test` runs anywhere Node does, and a single runner would
  collapse the current two-counter split (`EXPECTED_TESTS` gates only `node --test`; bats has its own
  gate). Scope: port `test/*.bats` (worktree/hooks/manifest-lint/smoke/p10-structure) to JS, preserving
  the shell-behavior coverage (the worktree/hook scripts still need real-process assertions — likely
  `node:test` + `child_process`). A judgment call on whether the JS port keeps fidelity for the
  shell-script tests; evaluate before committing to the migration.

### Parked from P9 — ✅ DONE (P9.5 hardening batch)
- [x] **`roleExists` live install-probe wired into the bin.** `engine/bin/pipeline-resolve.js` now
  constructs a real `roleExists` predicate and passes it 3-arg: craft-native `craft:<role>` resolves iff
  `agents/<role>.md` exists; EXTERNAL `my:`/`acme:` refs stayed permissive then (P14 registration territory,
  punted per ADR-037) — **now closed in P14 (ADR-072): an external ref fails closed unless registered via
  `extends.agents` ∪ a registered/inserted phase `role:`**. `bad-role`/`good-role`/`external-role` bin tests
  pin it (ADR-047/DC-1). A typo'd craft role fails closed at resolution (`ok:false`, exit 2) in the real `/craft:run`.
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
  ADR-022) → **re-parked from P12 to the walk/parallelism pass (ADR-064)** — a per-invocation override
  flag is DX-surface polish; it would follow the same `cli-overlay.js` pattern but writes nested
  `phases.<id>.harness.<knob>` (dotted-path parse + type coercion, more than the flat profile/skip
  overlay). Its precondition — the two knobs above (`passes>1`, numeric `convergence`) being actually
  engine-enforced — is still unmet, so P12 (DX docs) re-parked it rather than ship a flag overriding
  walk-judgment knobs. The guide documents the *manifest* form (point #6) + the existing
  `--profile`/`--skip` flags; the `--harness` flag rides the same later pass that enforces the knobs.

### Parked from P7 — ✅ DONE (P14, ADR-071)
- [x] **Inserted-phase contract injection** wired: `contract-assemble` now learns the resolved/inserted
  descriptors via `--descriptor-json` (the walk passes the descriptor it holds from the step-1b
  Resolution); a novel inserted/registered `id` (e.g. `bench`/`acme:bench`) EXECUTEs under the
  engine-owned contract. The default-phase path (no flag) is byte-unchanged; an id in neither the
  flag-set nor `default.yml` still STOPs. `run/SKILL.md` step 1/3 prose + Walk error-paths updated.

### Parked from P6 — ✅ DONE (this session — doc-contract reconciliation)
- [x] `run/SKILL.md` step 1b + the "Walk error paths" table reconciled to the engine's real
  behavior: resolver `ok: false` is surfaced as a **non-zero exit with `errors[]` on stderr**,
  never as stdout JSON. The unreachable `ok: false`-in-JSON bullet was removed and the two
  duplicate table rows (ok:false vs non-zero-exit — the same code path) merged into one. The same
  edit corrected a now-stale P9-era line ("the seam no-ops to permissive"): P9.5 wired the live
  craft-native probe, so the prose now reads — live install-probe for `craft:<role>`, external
  `my:`/`acme:` permissive pending P14.

## Deferred / parked
- [ ] `worktree-teardown.sh` production hardening — validate PID before `kill -0`, `git branch -D --`,
  realpath the `WT≠MAIN` guard; **guard `git fetch --prune` for no-remote repos** (it aborts the script
  under `set -e` when no remote is configured — surfaced dogfooding P11 integrate on a local-only repo, so
  worktree/branch cleanup was done manually) (rides with the VCS-adapter phase).
- [ ] `backlog-lint` / `design-lint` structure lints — the optional half of ADR-014 (the
  `templates/backlog.md` template shipped at P4; the enforcing script + bats fixtures stayed
  deferred). P11 landed the manifest-lint `backlog.{source,ref}` shape fixtures but NOT the
  backlog-*entry*-structure lint — that template-structure lint stays deferred (own concern).

### Parked from P11 (backlog SoT adapter — design out-of-scope, ADRs 055/058/060)
- [ ] **A built-in per-tracker adapter** (vs a repo `custom` script) — e.g. a first-class `github-issues`
  source — rides with the **P14** derived-plugin/registration surface (a derived plugin shipping a backlog
  adapter), not the repo-`custom`-script escape hatch P11 ships.
- [ ] **Live `gh`/`jira` round-trip E2E** for the custom recipes — not run in CI (a real `gh issue close` /
  Jira transition mutates a tracker and needs credentials CI lacks); the recipes are pinned empirically
  (read-only probes) + prose. A gated/opt-in integration test is the home if ever wanted.
- [ ] **`backlog.id-pattern` manifest knob** (machine-enforced `file` id-form) — the pre-analysed deferred
  upgrade path (ADR-060); `file` id-form stays orchestrator prose-judgment until a repo needs it.

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
- [x] **Full-engine mutation baseline — TAKEN (this session).** `npm run mutation` over the full
  `engine/src/**` scope: **80.03% mutation score** (1185 killed · 248 survived · 48 no-cov · 1 timeout).
  Per-file — strongest: `alias-map.js` 100%, `graph.js` 91.78%, `profile.js` 89.47%, `manifest.js` 87.28%;
  weakest (the test-gap map for a later hardening pass): `resolve.js` 70.83%, `gates.js` 73.12%,
  `findings.js` 73.23%, `edits.js` 74.86%, `contract.js` 75.56%, `descriptor.js` 77.19%. Taken pre-P10
  deliberately (P10 adds default-off phases/agents = mostly data/prose, little `engine/src` churn), so the
  baseline stays representative as the starting line.
- [ ] **Bin mutation coverage** → **deferred to P13 (NFR hardening).** `engine/bin/*` is exercised via
  `spawnSync`, outside Stryker's import graph (reports "no coverage" regardless of `coverageAnalysis`); the
  bin logic (`roleExists` incl. the new traversal guard, `parseManifestContent`) is covered by `spawnSync`
  bin tests verified red-on-revert. Closing it needs an in-process bin harness (import the bin's logic rather
  than spawn it) — an NFR-quality concern, lands with the NFR matrix.
- [x] **`roleExists` path-traversal hardening — DONE (this session).** `engine/bin/pipeline-resolve.js`
  `roleExists` now rejects any `craft:<name>` whose `<name>` carries a path separator (`/` or `\`) **before**
  the existence probe, so a `craft:../agents/planner`-style traversal can't falsely satisfy the guard by
  resolving to a real file outside `agents/`. TDD: `traversal-role.md` fixture + a bin test (RED confirmed
  exit 0 pre-guard; GREEN exit 2 post-guard, naming phase+ref). 418 `node --test`.
- [ ] **Nested-lockfile bats test env-coupling** → **rides with the VCS-adapter phase** (grouped with
  `worktree-teardown.sh` prod hardening above). `test/worktree.bats`'s nested test runs a real `npm install`
  (empty `{}` package.json — local, network-free); a PATH `npm` stub would pin branch-selection + message
  without depending on npm. All worktree-script robustness lands with the VCS adapter.

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
