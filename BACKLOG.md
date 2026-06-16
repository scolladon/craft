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
| **P4** | **Generic vocabulary (rename + alias-map wiring)** | ⏭️ **next** |
| P5 | Engine-owned contract injection + DESIGN split | ⬜ planned |
| P6–P16 | e2e, NFR matrix, backlog/registration ports, … | ⬜ outlined (PRD §17) |

> ✅ **The engine is now LIVE.** `run/SKILL.md` walks `pipeline-resolve` output (no hardcoded
> 1→11 table); manifest validation has one deterministic Node home (`validateManifest`);
> `scripts/ci.sh` green (204 `node --test` + 15 bats). **P3 connected them.**

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

## Next — P4: generic vocabulary (rename + alias-map wiring)
- [ ] rename skill dirs + agent files to the concern names (`branch→workspace`, `adr→decisions`, `mutation→validation`, …); the default descriptor ids are already concern-named
- [ ] **delete the inverse-`ALIAS_MAP` table in `run/SKILL.md`** — once dirs are renamed, `skill dir == phase.id` (the P3 bridge was built to disappear here)
- [ ] wire `resolveAlias` into the folded `validateManifest` (Node) so old + new phase names both validate — one alias home (DC-4); add the alias fixture to the slice-2 bats suite
- [ ] `requirements`/`architecture` stay new (no dir to rename); `prd` stays a registered alias

**Surface gate (P4):** `resolveAlias` is the only alias home — no second copy; SC1 + scenario suite stay green.

## Then
- **P5 — injection + split:** create the real `contracts/{core,producer,construction,harness-read,harness-exec,delivery}.md`;
  feed them to `assembleContract`; thin the `agents/*.md`; `DESIGN.md → DESIGN-history.md` (ADR-007);
  re-baseline the R8 fixed-prompt agent-output diff.
- **Showcase docs** (post-P5, once the architecture is stable): a clean, illustrated overview —
  intent, hexagon diagram (Mermaid), a sample `.claude/workflow.md`, a sample run. Deliberately
  *after* P5 so the diagrams don't churn every phase.

## Deferred / parked
- [ ] `worktree-teardown.sh` production hardening — validate PID before `kill -0`, `git branch -D --`,
  realpath the `WT≠MAIN` guard (rides with the VCS-adapter phase).

## Notes
- **Data is the SoT, not the prose.** `pipeline/default.yml` (the 13-descriptor table) is authoritative.
  Explanatory prose was corrected to match: `skip-design` is **refused** (`documentation` is a 3rd
  consumer of `design`); the code-producing floor = `implementation` + `refactoring` only (predicate
  `change ∈ produces`; review/validation are *waivable* harnesses).
- Each phase is **dogfoodable** now that P1 is green (OQ7) — runnable through `/forge:run` itself.
- Working style: sliced TDD, one slice per dedicated agent, a 4-dimension review (perf/security/code/test)
  interleaved after each slice, every fix applied before the next slice. CI green at every commit; never `--no-verify`.
