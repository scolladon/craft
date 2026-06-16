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
| **P3** | **Rewire the live walk to consume the engine** | ⏭️ **next** |
| P4 | Generic vocabulary (rename + alias-map wiring) | ⬜ planned |
| P5 | Engine-owned contract injection + DESIGN split | ⬜ planned |
| P6–P16 | e2e, NFR matrix, backlog/registration ports, … | ⬜ outlined (PRD §17) |

> ⚠️ **The engine is built but DORMANT.** `engine/` is unit-green (156 `node --test` + 45 bats,
> `scripts/ci.sh` green) but `run/SKILL.md` still walks its hardcoded 1→11 table. **P3 connects them.**

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

## Next — P3: rewire the walk (make the engine live)
- [ ] `run/SKILL.md` walks `pipeline-resolve` output instead of the hardcoded 1→11 table
- [ ] §11 cross-phase invariants generalize **by archetype**, not by phase name
- [ ] Remove the static `PROTECTED` list from `manifest-lint` (the graph now computes stranding)
- [ ] Emit the run-record from `Resolution.record`

**Surface gate:** the slice-7/10 golden `Resolution` is the contract — the rewired walk must
reproduce it; SC1 + the scenario suite stay green *by construction*.

## Then
- **P4 — vocabulary:** rename skill dirs + agent files to the concern names; wire `manifest-lint`
  to read the slice-6 `ALIAS_MAP` (one alias home — DC-4); add the alias fixture to the slice-2 suite.
- **P5 — injection + split:** create the real `contracts/{core,producer,construction,harness-read,harness-exec,delivery}.md`;
  feed them to `assembleContract`; thin the `agents/*.md`; `DESIGN.md → DESIGN-history.md` (ADR-007);
  re-baseline the R8 fixed-prompt agent-output diff.
- **Showcase docs** (post-P5, once the architecture is stable): a clean, illustrated overview —
  intent, hexagon diagram (Mermaid), a sample `.claude/workflow.md`, a sample run. Deliberately
  *after* P5 so the diagrams don't churn every phase.

## Deferred / parked
- [ ] `worktree-teardown.sh` production hardening — validate PID before `kill -0`, `git branch -D --`,
  realpath the `WT≠MAIN` guard (rides with the VCS-adapter phase).
- [ ] Fold manifest shape-validation into the Node core — deferred to P3 per the ADR-002 follow-up note.

## Notes
- **Data is the SoT, not the prose.** `pipeline/default.yml` (the 13-descriptor table) is authoritative.
  Explanatory prose was corrected to match: `skip-design` is **refused** (`documentation` is a 3rd
  consumer of `design`); the code-producing floor = `implementation` + `refactoring` only (predicate
  `change ∈ produces`; review/validation are *waivable* harnesses).
- Each phase is **dogfoodable** now that P1 is green (OQ7) — runnable through `/forge:run` itself.
- Working style: sliced TDD, one slice per dedicated agent, a 4-dimension review (perf/security/code/test)
  interleaved after each slice, every fix applied before the next slice. CI green at every commit; never `--no-verify`.
