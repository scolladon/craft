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
| **P6–P16** | **e2e, NFR matrix, backlog/registration ports, … (+ showcase docs)** | ⬜ **outlined (PRD §17)** |

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

## Next — P6+
- **Showcase docs** (now that the architecture is stable post-P5): a clean, illustrated overview —
  intent, hexagon diagram (Mermaid), a sample `.claude/workflow.md`, a sample run.
- P6–P16 ports (e2e, NFR matrix, backlog/registration ports) — PRD §17.

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
