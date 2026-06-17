# Forge — Backlog & Roadmap

> Forge is a Claude Code feature-delivery workflow engine being re-architected from a fixed
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
| **P8–P16** | **harness config, agent swap, new default phases, NFR matrix, backlog/registration ports, … (+ showcase docs)** | ⬜ **outlined (PRD §17)** |

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
- [x] 9 skill dirs renamed to concern names (`branch→workspace` … `merge→integrate`); the P3 inverse-`ALIAS_MAP` bridge in `run/SKILL.md` deleted — `skill dir == phase.id`, the walk invokes `forge:<phase.id>` with no translation table (ADR-009 retired)
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
- [x] **Walk dispatches `phase.procedure` verbatim** (ADR-025): `run/SKILL.md` step 1 + error-paths table — namespace-agnostic (forge-local or `acme:`); "unknown phase id" STOP → "procedure resolves to no installed skill"; contract injected from the descriptor (G5) for forge-native phases incl. role-swaps; namespaced *registration* (`forge.extends:`) stays P14
- [x] **Surface gate held:** `resolvePipeline` signature + `engine/src/index.js` (7 exports) + `pipeline/default.yml` + `graph.js`/`contract.js` untouched; SC1/S1/S2/S3/S-lean/S-full/contract-equivalence green; reorder/applyReorder are **internal** to `edits.js` (not the public barrel); CI green at every commit (357 `node --test` + 42 bats); 4-dimension review after every code slice + a consistency review on the prose, every fix applied

## Next — P7+
- **P8 — per-phase harness config**: dimensions/passes/cycles/convergence/tool (G6). Next up.
- **P8–P16** (PRD §17, in order): P8 per-phase harness config · P9 agent/skill swap · P10 new
  default phases (requirements/architecture) · P11 backlog SoT adapter · **P12 DX** · P13 NFR
  hardening · P14 derived-plugin extension · P15 second-instantiation · P16 provider-agnostic.
- **Showcase / DX docs are P12 — intentionally late**, not next. The illustrated overview (intent,
  hexagon Mermaid, a sample `.claude/workflow.md`, a sample run) documents the *full* customization
  surface, so it lands only after P7–P11 build it; its derived-plugin (Tier-2) half is gated after
  P14 so the catalog never advertises an unproven surface (PRD §17 P12).

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

## Notes
- **Data is the SoT, not the prose.** `pipeline/default.yml` (the 13-descriptor table) is authoritative.
  Explanatory prose was corrected to match: `skip-design` is **refused** (`documentation` is a 3rd
  consumer of `design`); the code-producing floor = `implementation` + `refactoring` only (predicate
  `change ∈ produces`; review/validation are *waivable* harnesses).
- Each phase is **dogfoodable** now that P1 is green (OQ7) — runnable through `/forge:run` itself.
- Working style: sliced TDD, one slice per dedicated agent **chosen by slice shape** —
  `forge:slice-implementer` for TDD slices, `forge:refactor-executor` for pre-scoped
  behavior-preserving rename/relocation slices, session-direct only for judgment-fused sweeps; a
  4-dimension review (perf/security/code/test) interleaved after each slice, every fix applied
  before the next. CI green at every commit; never `--no-verify`.
