# Design — DX: mental-model guide + injection catalog + lintable examples (P12)

> Brief: P12 is the DX phase (PRD §17, goal G10). P3–P11 *built* the customization surface; P12 makes
> it legible so a newcomer can tailor the pipeline *from the docs alone in one sitting* (SC7). Scope is
> the **Tier-0/1** docs now; **Tier-2** docs are gated behind P14 by design.
> Status: docs-only phase, implemented directly (craft conventions) — no `engine/src` change, no TDD
> slices, no mutation run (validation is a no-op for markdown). This doc is the provenance; the build
> script is the approved plan.

## Why this is docs-only

The deliverable (PRD §17 P12) is *mental model guide + injection catalog + `examples/` samples*. The
material was already correct but developer-facing and scattered — the hexagon/ports model in
`DESIGN-customizable-engine.md`, the catalog in `PRD-customizable-engine.md §7`, six example dirs (two
of them lint-red). P12 *presents* and *de-rots* that surface; it does not change engine behavior.

## Deliverables

1. **`docs/GUIDE-customizing.md`** — the single newcomer entry doc ([[adr/061-dx-guide-single-entry-doc]]):
   mental model (hexagon: core / 6 ports / Claude Code adapter, reusing the canonical ASCII diagram) →
   the invariant core §11 as *what you cannot inject* → the tiered injection catalog with a sample link
   per point → a *tailor in one sitting* worked manifest (points #1/#2/#6/#8) + lint + run.
2. **Six new examples** — a dedicated lint-clean sample per previously-uncovered Tier-0/1 point:
   `skip-phase` (#1), `model-routing` (#2), `gate-command` (#3), `review-harness` (#6),
   `backlog-custom` (#7), `override-procedure` (#9). Existing dirs cover #4/#5 (`lean-profile`),
   #8 (`karpathy-as-context`), #10 (`role-swap`), #11 (`everything-claude-toolkit`).
3. **Lintability** ([[adr/063-lintable-examples-and-ci-gate]]) — referenced `context:`/`override:`
   bodies ship under `examples/.claude/workflow/` (resolve via the linter's
   `ROOT = dirname(dirname(manifest))` = `examples/`); `test/examples-lint.bats` asserts every
   `examples/*/workflow.md` lints. All 12 examples now pass.
4. **READMEs** — `examples/README.md` becomes a per-injection-point index; root `README.md` points its
   Customize section at the guide.
5. **ADRs 061–064** + this provenance doc; **`BACKLOG.md`** flips P12 → done.

## Decisions (ADRs)

| ADR | Decision |
|---|---|
| [[adr/061-dx-guide-single-entry-doc]] | One entry doc (mental model + catalog + index), not a split or a README fold — SC7 is a single-sitting task. |
| [[adr/062-tier2-catalog-gated-stub]] | Tier-2 (#12) is a gated stub ("documented after P14"); #11 *insert* carries a "dispatch works, full execution at P14" caveat — never advertise an unproven surface. |
| [[adr/063-lintable-examples-and-ci-gate]] | Referenced bodies under shared `examples/.claude/workflow/`; bats anti-rot gate (no `EXPECTED_TESTS` bump). `backlog-custom` uses `source: custom` (ref not file-checked). |
| [[adr/064-per-invocation-harness-flag-reparked]] | The `--harness` flag (parked-from-P8 *to* P12) is re-parked: its precondition (engine-enforced `passes`/`convergence`) is unmet; rides the later walk/parallelism pass. |

## Example → injection-point coverage matrix

| Point (PRD §7) | Sample | Tier |
|---|---|---|
| #1 skip | `skip-phase/` | 0 |
| #2 model | `model-routing/` | 0 |
| #3 gate | `gate-command/` | 0 |
| #4 execution · #5 profile | `lean-profile/` | 0 |
| #6 harness config | `review-harness/` | 0 |
| #7 backlog source | `backlog-custom/` | 0 |
| #8 context file | `karpathy-as-context/` | 1 |
| #9 override file | `override-procedure/` | 1 |
| #10 agent/skill swap | `role-swap/` | 1 |
| #11 insert a phase | `everything-claude-toolkit/` (+ P14 caveat) | 1 |
| enable default-off phase | `requirements/` · `architecture/` | 0 |
| #12 extension surface | *(after P14)* | 2 |

## Out of scope (re-parked, with rationale)

- **Tier-2 full docs** — gated behind P14 ([[adr/062-tier2-catalog-gated-stub]]).
- **`--harness` per-invocation flag** — precondition unmet ([[adr/064-per-invocation-harness-flag-reparked]]).
- **Toolkit phase-alias modernization** — `plan`/`implement`/`review` left as-is; they demonstrate the
  alias tolerance, and only the toolkit's referenced files are shipped to make it lint.

## Verification

`scripts/ci.sh` green (the new `examples-lint.bats` runs under `bats test/`; `EXPECTED_TESTS`
unchanged); `node engine/bin/manifest-lint.js` exits 0 for all 12 examples; `git diff --stat` touches
only `docs/`, `examples/`, `test/`, `README.md`, `BACKLOG.md` (no `engine/src`).
